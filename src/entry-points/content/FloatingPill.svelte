<!--
Per-tab floating pill control for Jump Cutter
Uses Svelte for proper reactive state management
-->

<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { browserOrChrome } from '@/webextensions-api-browser-or-chrome';
  import { getSettings, setSettings, addOnStorageChangedListener, settingsChanges2NewValues } from '@/settings';
  import type { Settings } from '@/settings';
  import { ControllerKind } from '@/settings/ControllerKind';

  // Props
  export let tabId: number;
  export let onToggle: (enabled: boolean) => void;

  // Constants
  const PILL_WIDTH = 48;
  const PILL_HEIGHT = 48;
  const EDGE_DOCK_THRESHOLD = 60;
  const DOCKED_VISIBLE_WIDTH = 24;

  // Reactive state - Svelte handles all updates automatically
  let isEnabled = false;
  let x = window.innerWidth - PILL_WIDTH - 20;
  let y = 100;
  let docked: 'left' | 'right' | 'none' = 'none';
  let isDragging = false;
  let hasMoved = false;
  let isPanelOpen = false;
  let skipLevel = 50;

  // Settings state (reactive)
  let soundedSpeed = 1;
  let silenceSpeed = 2;
  let volumeThreshold = 0.001;
  let useCloning = false;

  // Drag state
  let dragStartX = 0;
  let dragStartY = 0;
  let dragStartPillX = 0;
  let dragStartPillY = 0;

  // Storage keys unique to this tab
  $: storageKey = `floatingPill_tab_${tabId}`;
  $: settingsKey = `tabSettings_${tabId}`;

  // Load state on mount
  onMount(async () => {
    await loadState();
    await loadSettings();
    // Don't listen to global storage changes - we use per-tab settings
  });

  async function loadState() {
    try {
      const result = await browserOrChrome.storage.local.get(storageKey);
      const state = result[storageKey];
      
      if (state) {
        isEnabled = state.enabled === true;
        x = state.x ?? x;
        y = state.y ?? y;
        docked = state.docked ?? 'none';
      } else {
        // New tab - default to disabled
        isEnabled = false;
      }
      
      clampPosition();
    } catch (error) {
      console.error('[JumpCutter] Failed to load pill state:', error);
      isEnabled = false;
    }
  }

  async function loadSettings() {
    try {
      // First try to load per-tab settings
      const tabResult = await browserOrChrome.storage.local.get(settingsKey);
      const tabSettings = tabResult[settingsKey];
      
      if (tabSettings) {
        // Use per-tab settings
        soundedSpeed = tabSettings.soundedSpeed ?? 1;
        silenceSpeed = tabSettings.silenceSpeed ?? 2;
        volumeThreshold = tabSettings.volumeThreshold ?? 0.001;
        useCloning = tabSettings.useCloning ?? false;
        skipLevel = tabSettings.skipLevel ?? 50;
        console.log('[JumpCutter] Loaded per-tab settings for tab', tabId, tabSettings);
      } else {
        // Fall back to global settings for initial values
        const globalSettings = await getSettings();
        soundedSpeed = globalSettings.soundedSpeed ?? 1;
        silenceSpeed = globalSettings.silenceSpeedRaw ?? 2;
        volumeThreshold = globalSettings.volumeThreshold ?? 0.001;
        useCloning = globalSettings.experimentalControllerType === ControllerKind.CLONING;
        skipLevel = globalSettings.simpleSlider ?? 50;
        console.log('[JumpCutter] Using global settings as defaults for tab', tabId);
      }
    } catch (error) {
      console.error('[JumpCutter] Failed to load settings:', error);
    }
  }

  async function saveState() {
    try {
      await browserOrChrome.storage.local.set({
        [storageKey]: { enabled: isEnabled, x, y, docked }
      });
    } catch (error) {
      console.error('[JumpCutter] Failed to save pill state:', error);
    }
  }

  // Save per-tab settings (NOT global)
  async function saveTabSettings() {
    try {
      await browserOrChrome.storage.local.set({
        [settingsKey]: {
          soundedSpeed,
          silenceSpeed,
          volumeThreshold,
          useCloning,
          skipLevel
        }
      });
      console.log('[JumpCutter] Saved per-tab settings for tab', tabId);
    } catch (error) {
      console.error('[JumpCutter] Failed to save tab settings:', error);
    }
  }

  // Apply settings to the controller (uses global setSettings for controller compatibility)
  async function applySettingsToController() {
    await setSettings({
      soundedSpeed,
      silenceSpeedRaw: silenceSpeed,
      volumeThreshold,
      experimentalControllerType: useCloning ? ControllerKind.CLONING : ControllerKind.STRETCHING
    });
  }

  function clampPosition() {
    const maxX = window.innerWidth - PILL_WIDTH;
    const maxY = window.innerHeight - PILL_HEIGHT;
    x = Math.max(0, Math.min(x, maxX));
    y = Math.max(0, Math.min(y, maxY));
  }

  function toggle() {
    isEnabled = !isEnabled;
    saveState();
    onToggle(isEnabled);
    console.log('[JumpCutter] Pill toggled:', isEnabled);
  }

  function openPanel() {
    isPanelOpen = true;
  }

  function closePanel() {
    isPanelOpen = false;
  }

  // Drag handlers
  function onMouseDown(e: MouseEvent) {
    if ((e.target as HTMLElement).closest('.jc-pill-gear')) return;
    e.preventDefault();
    startDrag(e.clientX, e.clientY);
  }

  function onMouseMove(e: MouseEvent) {
    if (!isDragging) return;
    moveDrag(e.clientX, e.clientY);
  }

  function onMouseUp(e: MouseEvent) {
    if (!isDragging) return;
    endDrag(e.clientX);
  }

  function onTouchStart(e: TouchEvent) {
    if ((e.target as HTMLElement).closest('.jc-pill-gear')) return;
    if (e.touches.length !== 1) return;
    e.preventDefault();
    const touch = e.touches[0];
    startDrag(touch.clientX, touch.clientY);
  }

  function onTouchMove(e: TouchEvent) {
    if (!isDragging || e.touches.length !== 1) return;
    e.preventDefault();
    const touch = e.touches[0];
    moveDrag(touch.clientX, touch.clientY);
  }

  function onTouchEnd() {
    if (!isDragging) return;
    endDrag(x + PILL_WIDTH / 2);
  }

  function startDrag(clientX: number, clientY: number) {
    isDragging = true;
    hasMoved = false;
    dragStartX = clientX;
    dragStartY = clientY;
    dragStartPillX = x;
    dragStartPillY = y;
    docked = 'none';
  }

  function moveDrag(clientX: number, clientY: number) {
    const deltaX = clientX - dragStartX;
    const deltaY = clientY - dragStartY;
    
    if (Math.abs(deltaX) > 3 || Math.abs(deltaY) > 3) {
      hasMoved = true;
    }
    
    x = dragStartPillX + deltaX;
    y = dragStartPillY + deltaY;
    clampPosition();
  }

  function endDrag(clientX: number) {
    isDragging = false;
    
    if (!hasMoved) {
      toggle();
      return;
    }
    
    // Check for edge docking
    if (x < EDGE_DOCK_THRESHOLD) {
      x = 0;
      docked = 'left';
    } else if (x > window.innerWidth - PILL_WIDTH - EDGE_DOCK_THRESHOLD) {
      x = window.innerWidth - PILL_WIDTH;
      docked = 'right';
    } else {
      docked = 'none';
    }
    
    saveState();
  }

  // Scroll wheel for skip level
  function onWheel(e: WheelEvent) {
    if (!isEnabled) return;
    e.preventDefault();
    e.stopPropagation();
    
    const delta = e.deltaY < 0 ? 5 : -5;
    skipLevel = Math.max(0, Math.min(100, skipLevel + delta));
    applySkipLevel();
  }

  async function applySkipLevel() {
    // Calculate derived values from skip level
    volumeThreshold = 0.001 + skipLevel * 0.00015;
    silenceSpeed = 1.5 + skipLevel * 0.020;
    
    // Save to per-tab storage
    await saveTabSettings();
    
    // Apply to controller
    await setSettings({
      simpleSlider: skipLevel,
      volumeThreshold,
      silenceSpeedRaw: silenceSpeed,
      marginAfter: 0.03 + 0.0020 * (100 - skipLevel)
    });
  }

  // Settings handlers - save per-tab and apply to controller
  async function onSoundedSpeedChange(e: Event) {
    const value = parseFloat((e.target as HTMLInputElement).value);
    soundedSpeed = value;
    await saveTabSettings();
    await setSettings({ soundedSpeed: value });
  }

  async function onSilenceSpeedChange(e: Event) {
    const value = parseFloat((e.target as HTMLInputElement).value);
    silenceSpeed = value;
    await saveTabSettings();
    await setSettings({ silenceSpeedRaw: value });
  }

  async function onVolumeThresholdChange(e: Event) {
    const value = parseFloat((e.target as HTMLInputElement).value);
    volumeThreshold = value;
    await saveTabSettings();
    await setSettings({ volumeThreshold: value });
  }

  async function onAlgorithmChange(e: Event) {
    const checked = (e.target as HTMLInputElement).checked;
    useCloning = checked;
    await saveTabSettings();
    const newType = checked ? ControllerKind.CLONING : ControllerKind.STRETCHING;
    await setSettings({ experimentalControllerType: newType });
  }

  function openOptionsPage() {
    try {
      (browserOrChrome.runtime.sendMessage as (msg: unknown) => Promise<unknown>)({ action: 'openOptionsPage' });
    } catch (e) {
      console.error('[JumpCutter] Failed to open options:', e);
    }
  }

  // Computed styles
  $: pillStyle = `left: ${x}px; top: ${y}px;`;
  $: pillClass = [
    isEnabled ? 'enabled' : 'disabled',
    isDragging ? 'dragging' : '',
    docked === 'left' ? 'docked-left' : '',
    docked === 'right' ? 'docked-right' : ''
  ].filter(Boolean).join(' ');

  $: skipLabel = skipLevel < 33 ? 'Less' : skipLevel > 66 ? 'More' : 'Med';

  // Panel position
  $: panelStyle = (() => {
    const panelWidth = 280;
    const panelHeight = 320;
    let panelX = x + PILL_WIDTH + 10;
    let panelY = y;
    
    if (panelX + panelWidth > window.innerWidth - 10) {
      panelX = x - panelWidth - 10;
    }
    if (panelY + panelHeight > window.innerHeight - 10) {
      panelY = window.innerHeight - panelHeight - 10;
    }
    
    return `left: ${panelX}px; top: ${panelY}px;`;
  })();

  // Export for external access
  export function getEnabled() {
    return isEnabled;
  }

  export async function waitForLoad() {
    // State is loaded in onMount, this is for compatibility
  }

  // Apply per-tab settings to the controller (call after controller init)
  export async function applyPerTabSettings() {
    console.log('[JumpCutter] Applying per-tab settings to controller for tab', tabId);
    await setSettings({
      soundedSpeed,
      silenceSpeedRaw: silenceSpeed,
      volumeThreshold,
      experimentalControllerType: useCloning ? ControllerKind.CLONING : ControllerKind.STRETCHING
    });
  }
</script>

<svelte:window 
  on:mousemove={onMouseMove}
  on:mouseup={onMouseUp}
  on:touchmove={onTouchMove}
  on:touchend={onTouchEnd}
  on:resize={clampPosition}
/>

<div class="jc-container">
  <!-- Pill -->
  <div 
    class="jc-pill {pillClass}"
    style={pillStyle}
    on:mousedown={onMouseDown}
    on:touchstart={onTouchStart}
    on:wheel={onWheel}
    role="button"
    tabindex="0"
  >
    <div class="jc-pill-icon">⚡</div>
    <div class="jc-pill-speed">{isEnabled ? `${soundedSpeed.toFixed(1)}x` : ''}</div>
    
    <!-- Gear button -->
    <button 
      class="jc-pill-gear" 
      title="Settings"
      on:click|stopPropagation={openPanel}
      on:mousedown|stopPropagation
    >⚙</button>
  </div>

  <!-- Settings Panel -->
  {#if isPanelOpen}
    <div class="jc-panel" style={panelStyle}>
      <div class="jc-panel-header">
        <h3>⚡ Jump Cutter Settings</h3>
        <button class="jc-panel-close" on:click={closePanel}>×</button>
      </div>

      <div class="jc-control-group">
        <div class="jc-control-label">
          <span>Sounded Speed</span>
          <span class="jc-control-value">{soundedSpeed.toFixed(1)}x</span>
        </div>
        <input 
          type="range" 
          class="jc-slider" 
          min="0.5" max="3" step="0.1" 
          value={soundedSpeed}
          on:input={onSoundedSpeedChange}
        >
      </div>

      <div class="jc-control-group">
        <div class="jc-control-label">
          <span>Silence Speed</span>
          <span class="jc-control-value">{silenceSpeed.toFixed(1)}x</span>
        </div>
        <input 
          type="range" 
          class="jc-slider" 
          min="1" max="8" step="0.5" 
          value={silenceSpeed}
          on:input={onSilenceSpeedChange}
        >
      </div>

      <div class="jc-control-group">
        <div class="jc-control-label">
          <span>Volume Threshold</span>
          <span class="jc-control-value">{(volumeThreshold * 1000).toFixed(1)}</span>
        </div>
        <input 
          type="range" 
          class="jc-slider" 
          min="0.0001" max="0.02" step="0.0001" 
          value={volumeThreshold}
          on:input={onVolumeThresholdChange}
        >
      </div>

      <div class="jc-control-group">
        <div class="jc-checkbox-group">
          <input 
            type="checkbox" 
            class="jc-checkbox" 
            id="jc-use-cloning-{tabId}"
            checked={useCloning}
            on:change={onAlgorithmChange}
          >
          <label class="jc-checkbox-label" for="jc-use-cloning-{tabId}">
            Use experimental algorithm
          </label>
        </div>
        <div class="jc-algo-desc">
          {useCloning ? 'Skip-heavy: Jumps over silence' : 'Speed-heavy: Speeds through silence'}
        </div>
      </div>

      <div class="jc-btn-row">
        <button class="jc-btn jc-btn-secondary" on:click={openOptionsPage}>
          More Options
        </button>
      </div>
    </div>
  {/if}
</div>

<style>
  .jc-container {
    position: fixed;
    z-index: 2147483647;
    pointer-events: none;
    top: 0;
    left: 0;
    width: 0;
    height: 0;
  }

  .jc-pill {
    position: absolute;
    width: 48px;
    height: 48px;
    border-radius: 50%;
    background: linear-gradient(145deg, #2a2a2a, #1a1a1a);
    border: 2px solid #444;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    cursor: grab;
    user-select: none;
    pointer-events: all;
    transition: transform 0.15s ease, box-shadow 0.2s ease, opacity 0.2s ease;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  }

  .jc-pill:hover {
    transform: scale(1.08);
  }

  .jc-pill:active {
    cursor: grabbing;
    transform: scale(1.02);
  }

  .jc-pill.enabled {
    background: linear-gradient(145deg, #1a3a1a, #0d2a0d);
    border-color: #2d5a2d;
    box-shadow: 0 0 20px rgba(34, 197, 94, 0.4), 0 2px 8px rgba(0, 0, 0, 0.3);
  }

  .jc-pill.enabled .jc-pill-icon {
    color: #22c55e;
    text-shadow: 0 0 10px rgba(34, 197, 94, 0.6);
  }

  .jc-pill.disabled {
    opacity: 0.7;
  }

  .jc-pill.disabled .jc-pill-icon {
    color: #666;
  }

  .jc-pill.docked-left {
    border-radius: 0 50% 50% 0;
    transform: translateX(-24px);
  }

  .jc-pill.docked-left:hover {
    transform: translateX(-16px) scale(1.05);
  }

  .jc-pill.docked-right {
    border-radius: 50% 0 0 50%;
    transform: translateX(24px);
  }

  .jc-pill.docked-right:hover {
    transform: translateX(16px) scale(1.05);
  }

  .jc-pill.dragging {
    cursor: grabbing;
    transition: box-shadow 0.2s ease;
    transform: scale(1.1) !important;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.4);
  }

  .jc-pill-icon {
    font-size: 20px;
    line-height: 1;
    transition: color 0.2s ease, text-shadow 0.2s ease;
  }

  .jc-pill-speed {
    font-size: 10px;
    font-weight: 600;
    color: #22c55e;
    margin-top: 2px;
  }

  .jc-pill-gear {
    position: absolute;
    top: -4px;
    right: -4px;
    width: 18px;
    height: 18px;
    background: #333;
    border: 1px solid #555;
    border-radius: 50%;
    font-size: 10px;
    line-height: 16px;
    text-align: center;
    color: #888;
    cursor: pointer;
    opacity: 0;
    transition: opacity 0.2s ease, background 0.2s ease, color 0.2s ease;
    padding: 0;
  }

  .jc-pill:hover .jc-pill-gear {
    opacity: 1;
  }

  .jc-pill-gear:hover {
    background: #444;
    color: #fff;
  }

  /* Settings Panel */
  .jc-panel {
    position: absolute;
    width: 280px;
    background: linear-gradient(145deg, #1e1e1e, #2a2a2a);
    border: 1px solid #444;
    border-radius: 12px;
    padding: 16px;
    pointer-events: all;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    font-size: 13px;
    color: #e0e0e0;
  }

  .jc-panel-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 16px;
    padding-bottom: 12px;
    border-bottom: 1px solid #444;
  }

  .jc-panel-header h3 {
    margin: 0;
    font-size: 14px;
    font-weight: 600;
    color: #fff;
  }

  .jc-panel-close {
    background: none;
    border: none;
    color: #888;
    font-size: 20px;
    cursor: pointer;
    padding: 0;
    line-height: 1;
  }

  .jc-panel-close:hover {
    color: #fff;
  }

  .jc-control-group {
    margin-bottom: 14px;
  }

  .jc-control-label {
    display: flex;
    justify-content: space-between;
    margin-bottom: 6px;
    font-size: 12px;
  }

  .jc-control-value {
    color: #22c55e;
    font-weight: 600;
  }

  .jc-slider {
    width: 100%;
    height: 6px;
    border-radius: 3px;
    background: #333;
    outline: none;
    -webkit-appearance: none;
    appearance: none;
  }

  .jc-slider::-webkit-slider-thumb {
    -webkit-appearance: none;
    appearance: none;
    width: 14px;
    height: 14px;
    border-radius: 50%;
    background: #22c55e;
    cursor: pointer;
    transition: transform 0.1s ease;
  }

  .jc-slider::-webkit-slider-thumb:hover {
    transform: scale(1.2);
  }

  .jc-checkbox-group {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .jc-checkbox {
    width: 16px;
    height: 16px;
    accent-color: #22c55e;
  }

  .jc-checkbox-label {
    font-size: 12px;
    cursor: pointer;
  }

  .jc-algo-desc {
    font-size: 11px;
    color: #888;
    margin-top: 4px;
    margin-left: 24px;
  }

  .jc-btn-row {
    margin-top: 16px;
    padding-top: 12px;
    border-top: 1px solid #444;
  }

  .jc-btn {
    width: 100%;
    padding: 8px 16px;
    border: none;
    border-radius: 6px;
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
    transition: background 0.2s ease;
  }

  .jc-btn-secondary {
    background: #333;
    color: #ccc;
  }

  .jc-btn-secondary:hover {
    background: #444;
  }
</style>
