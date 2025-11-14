/**
 * @license
 * Copyright (C) 2025
 *
 * This file is part of Jump Cutter Browser Extension.
 */

import { browserOrChrome } from '@/webextensions-api-browser-or-chrome';
import { getSettings, setSettings, Settings, ControllerKind } from '@/settings';
import { YouTubeCompat } from './YouTubeCompat';

export interface PerTabPanelState {
  enabled: boolean;
  url: string;
  position?: number; // Position along the edge (0-100%)
}

export class PerTabControlPanel {
  private container: HTMLDivElement | null = null;
  private isEnabled: boolean = true;
  private onToggleCallback: ((enabled: boolean) => void) | null = null;
  private settings: Partial<Settings> = {};
  private readonly loadStatePromise: Promise<void>;
  private lastNotifiedEnabled: boolean | null = null;
  private position: number = 50; // Default to middle of screen
  private isDragging: boolean = false;

  constructor() {
    this.loadStatePromise = this.loadState();
  }

  private async loadState(): Promise<void> {
    try {
      const url = window.location.href;
      const key = `perTabPanel_${this.sanitizeKey(url)}`;
      const result = await browserOrChrome.storage.local.get(key);
      const state = result[key] as PerTabPanelState;
      
      if (state) {
        this.isEnabled = state.enabled !== false;
        this.position = state.position || 50;
      }
      
      // Load current settings
      const allSettings = await getSettings();
      this.settings = {
        soundedSpeed: allSettings.soundedSpeed,
        silenceSpeedRaw: allSettings.silenceSpeedRaw,
        volumeThreshold: allSettings.volumeThreshold,
        marginBefore: allSettings.marginBefore,
        marginAfter: allSettings.marginAfter,
        experimentalControllerType: allSettings.experimentalControllerType
      };
    } catch (error) {
      console.error('Failed to load per-tab state:', error);
      this.isEnabled = true;
    }
  }

  private async saveState(): Promise<void> {
    try {
      const url = window.location.href;
      const key = `perTabPanel_${this.sanitizeKey(url)}`;
      const state: PerTabPanelState = {
        enabled: this.isEnabled,
        url: url,
        position: this.position
      };
      await browserOrChrome.storage.local.set({ [key]: state });
    } catch (error) {
      console.error('Failed to save per-tab state:', error);
    }
  }

  private sanitizeKey(url: string): string {
    return url.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 100);
  }

  public async createOverlay(onToggle: (enabled: boolean) => void): Promise<void> {
    await this.loadStatePromise;
    this.onToggleCallback = onToggle;
    this.lastNotifiedEnabled = null;

    if (document.getElementById('jumpcutter-overlay-container')) {
      return;
    }

    // Create container
    this.container = document.createElement('div');
    this.container.id = 'jumpcutter-overlay-container';
    
    // Create the UI
    this.container.innerHTML = `
      <div id="jumpcutter-tab" class="${this.isEnabled ? 'enabled' : 'disabled'}">
        <div class="tab-handle">⋮</div>
      </div>
      <div id="jumpcutter-panel">
        <div class="panel-header">
          <h3>⚡ Jump Cutter</h3>
          <button id="jc-close-panel">×</button>
        </div>
        <div class="panel-content">
          <button id="jc-toggle-enabled" class="toggle-btn ${this.isEnabled ? 'enabled' : 'disabled'}">
            ${this.isEnabled ? '⏸️ Disable' : '▶️ Enable'}
          </button>
          
          ${this.createControlsHTML()}
        </div>
      </div>
    `;
    
    // Apply styles
    this.applyStyles();
    
    // Add to page
    document.body.appendChild(this.container);
    
    // Setup event listeners
    this.setupEventListeners();
    
    // Set initial position
    this.updatePosition();

    // Initialize with saved state
    this.notifyToggleState();
  }

  private createControlsHTML(): string {
    const limits = YouTubeCompat.getSpeedLimits();
    const adjustedSettings = YouTubeCompat.getAdjustedSettings(this.settings);
    
    return `
      <div class="control-group">
        <label>
          <span>🔊 Sounded Speed</span>
          <div class="control-row">
            <input type="range" id="jc-sounded-speed" min="${limits.min}" max="${limits.max}" step="0.1" value="${adjustedSettings.soundedSpeed}">
            <span id="jc-sounded-value" class="value">${adjustedSettings.soundedSpeed}x</span>
          </div>
        </label>
      </div>
      
      <div class="control-group">
        <label>
          <span>🔇 Silence Speed</span>
          <div class="control-row">
            <input type="range" id="jc-silence-speed" min="0.5" max="${limits.silenceMax}" step="0.25" value="${adjustedSettings.silenceSpeedRaw}">
            <span id="jc-silence-value" class="value">${adjustedSettings.silenceSpeedRaw}x</span>
          </div>
        </label>
      </div>
      
      <div class="control-group">
        <label>
          <span>📊 Volume Threshold</span>
          <div class="control-row">
            <input type="range" id="jc-volume-threshold" min="0" max="1" step="0.01" value="${this.settings.volumeThreshold || 0.05}">
            <span id="jc-volume-value" class="value">${((this.settings.volumeThreshold || 0.05) * 100).toFixed(0)}%</span>
          </div>
        </label>
      </div>
      
      <div class="control-group">
        <label class="checkbox-label">
          <input type="checkbox" id="jc-use-cloning" ${this.settings.experimentalControllerType === ControllerKind.CLONING ? 'checked' : ''}>
          <span>🧪 Experimental Algorithm</span>
        </label>
        <div class="algo-desc" id="jc-algo-desc">
          ${this.settings.experimentalControllerType === ControllerKind.CLONING 
            ? 'Skip-heavy: Jumps over silence' 
            : 'Speed-heavy: Speeds through silence'}
        </div>
      </div>

      <button id="jc-open-options" class="secondary-btn">⚙️ Options</button>
      
      ${window.location.hostname.includes('youtube.com') ? `
        <div class="youtube-notice">
          ⚠️ YouTube limits: Max 2x speed
        </div>
      ` : ''}
    `;
  }

  private setupEventListeners(): void {
    const tab = this.container?.querySelector('#jumpcutter-tab');
    const panel = this.container?.querySelector('#jumpcutter-panel') as HTMLElement;
    const closeBtn = this.container?.querySelector('#jc-close-panel');
    
    // Tab click to show panel
    tab?.addEventListener('click', () => {
      panel.classList.toggle('visible');
    });
    
    // Close panel
    closeBtn?.addEventListener('click', () => {
      panel.classList.remove('visible');
    });
    
    // Make tab draggable
    const handle = tab?.querySelector('.tab-handle') as HTMLElement;
    if (handle) {
      handle.addEventListener('mousedown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.isDragging = true;
        document.body.style.cursor = 'grabbing';
      });
    }
    
    document.addEventListener('mousemove', (e) => {
      if (!this.isDragging) return;
      const percent = (e.clientY / window.innerHeight) * 100;
      this.position = Math.max(10, Math.min(90, percent));
      this.updatePosition();
    });
    
    document.addEventListener('mouseup', () => {
      if (this.isDragging) {
        this.isDragging = false;
        document.body.style.cursor = '';
        this.saveState();
      }
    });
    
    // Control listeners
    this.setupControlListeners();
  }

  private setupControlListeners(): void {
    // Toggle enabled
    const toggleBtn = this.container?.querySelector('#jc-toggle-enabled') as HTMLButtonElement;
    toggleBtn?.addEventListener('click', () => {
      this.toggle();
    });
    
    // Sounded speed
    const soundedSpeed = this.container?.querySelector('#jc-sounded-speed') as HTMLInputElement;
    const soundedValue = this.container?.querySelector('#jc-sounded-value') as HTMLSpanElement;
    soundedSpeed?.addEventListener('input', async (e) => {
      const value = parseFloat((e.target as HTMLInputElement).value);
      soundedValue.textContent = `${value}x`;
      await setSettings({ soundedSpeed: value });
      this.settings.soundedSpeed = value;
    });
    
    // Silence speed
    const silenceSpeed = this.container?.querySelector('#jc-silence-speed') as HTMLInputElement;
    const silenceValue = this.container?.querySelector('#jc-silence-value') as HTMLSpanElement;
    silenceSpeed?.addEventListener('input', async (e) => {
      const value = parseFloat((e.target as HTMLInputElement).value);
      silenceValue.textContent = `${value}x`;
      await setSettings({ silenceSpeedRaw: value });
      this.settings.silenceSpeedRaw = value;
    });
    
    // Volume threshold
    const volumeThreshold = this.container?.querySelector('#jc-volume-threshold') as HTMLInputElement;
    const volumeValue = this.container?.querySelector('#jc-volume-value') as HTMLSpanElement;
    volumeThreshold?.addEventListener('input', async (e) => {
      const value = parseFloat((e.target as HTMLInputElement).value);
      volumeValue.textContent = `${(value * 100).toFixed(0)}%`;
      await setSettings({ volumeThreshold: value });
      this.settings.volumeThreshold = value;
    });
    
    // Algorithm toggle
    const useCloning = this.container?.querySelector('#jc-use-cloning') as HTMLInputElement;
    useCloning?.addEventListener('change', async (e) => {
      const checked = (e.target as HTMLInputElement).checked;
      const newType = checked ? ControllerKind.CLONING : ControllerKind.STRETCHING;
      await setSettings({ experimentalControllerType: newType });
      this.settings.experimentalControllerType = newType;
      const descEl = this.container?.querySelector('#jc-algo-desc') as HTMLDivElement;
      if (descEl) {
        descEl.textContent = checked 
          ? 'Skip-heavy: Jumps over silence' 
          : 'Speed-heavy: Speeds through silence';
      }
    });
    
    // Open options
    const openOptions = this.container?.querySelector('#jc-open-options') as HTMLButtonElement;
    openOptions?.addEventListener('click', () => {
      browserOrChrome.runtime.openOptionsPage();
    });
  }

  private updatePosition(): void {
    const tab = this.container?.querySelector('#jumpcutter-tab') as HTMLElement;
    if (tab) {
      tab.style.top = `${this.position}%`;
    }
  }

  private toggle(): void {
    this.isEnabled = !this.isEnabled;
    
    const tab = this.container?.querySelector('#jumpcutter-tab');
    const toggleBtn = this.container?.querySelector('#jc-toggle-enabled') as HTMLButtonElement;
    
    if (tab) {
      tab.className = this.isEnabled ? 'enabled' : 'disabled';
    }
    
    if (toggleBtn) {
      toggleBtn.textContent = this.isEnabled ? '⏸️ Disable' : '▶️ Enable';
      toggleBtn.className = `toggle-btn ${this.isEnabled ? 'enabled' : 'disabled'}`;
    }
    
    this.saveState();
    this.notifyToggleState();
  }

  private notifyToggleState(): void {
    if (!this.onToggleCallback) return;
    if (this.lastNotifiedEnabled === this.isEnabled) return;
    this.lastNotifiedEnabled = this.isEnabled;
    console.log('[JumpCutter] Notifying toggle state:', this.isEnabled);
    this.onToggleCallback(this.isEnabled);
  }

  private applyStyles(): void {
    if (!document.getElementById('jumpcutter-overlay-styles')) {
      const style = document.createElement('style');
      style.id = 'jumpcutter-overlay-styles';
      style.textContent = `
        #jumpcutter-overlay-container {
          position: fixed;
          top: 0;
          right: 0;
          bottom: 0;
          width: 0;
          z-index: 2147483647;
          pointer-events: none;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
          font-size: 14px;
        }

        #jumpcutter-tab {
          position: absolute;
          right: 0;
          width: 32px;
          height: 32px;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          border-radius: 8px 0 0 8px;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: all 0.2s;
          box-shadow: -2px 0 8px rgba(0, 0, 0, 0.2);
          pointer-events: all;
          transform: translateY(-50%);
        }

        #jumpcutter-tab.disabled {
          background: linear-gradient(135deg, #868686 0%, #4a4a4a 100%);
        }

        #jumpcutter-tab:hover {
          width: 40px;
          box-shadow: -4px 0 12px rgba(0, 0, 0, 0.3);
        }

        .tab-handle {
          color: white;
          font-size: 16px;
          cursor: grab;
          user-select: none;
        }

        .tab-handle:active {
          cursor: grabbing;
        }

        #jumpcutter-panel {
          position: fixed;
          top: 50%;
          right: 0;
          transform: translateY(-50%) translateX(100%);
          width: 320px;
          max-height: 80vh;
          background: rgba(30, 30, 30, 0.95);
          backdrop-filter: blur(10px);
          border-radius: 12px 0 0 12px;
          box-shadow: -4px 0 20px rgba(0, 0, 0, 0.3);
          opacity: 0;
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
          pointer-events: none;
          overflow: hidden;
        }

        #jumpcutter-panel.visible {
          transform: translateY(-50%) translateX(0);
          opacity: 1;
          pointer-events: all;
        }

        .panel-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 16px 20px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.1);
        }

        .panel-header h3 {
          margin: 0;
          color: #fff;
          font-size: 16px;
          font-weight: 600;
        }

        #jc-close-panel {
          background: none;
          border: none;
          color: #999;
          font-size: 24px;
          cursor: pointer;
          padding: 0;
          width: 24px;
          height: 24px;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: color 0.2s;
        }

        #jc-close-panel:hover {
          color: #fff;
        }

        .panel-content {
          padding: 20px;
          overflow-y: auto;
          max-height: calc(80vh - 60px);
        }

        .toggle-btn {
          width: 100%;
          padding: 10px;
          border-radius: 6px;
          border: none;
          font-size: 14px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s;
          margin-bottom: 20px;
        }

        .toggle-btn.enabled {
          background: rgba(255, 59, 48, 0.2);
          color: #ff3b30;
        }

        .toggle-btn.enabled:hover {
          background: rgba(255, 59, 48, 0.3);
        }

        .toggle-btn.disabled {
          background: rgba(52, 199, 89, 0.2);
          color: #34c759;
        }

        .toggle-btn.disabled:hover {
          background: rgba(52, 199, 89, 0.3);
        }

        .control-group {
          margin-bottom: 16px;
        }

        .control-group label {
          display: block;
          color: #fff;
        }

        .control-group label > span:first-child {
          display: block;
          font-size: 13px;
          font-weight: 500;
          margin-bottom: 8px;
          opacity: 0.9;
        }

        .control-row {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .value {
          min-width: 45px;
          text-align: right;
          font-size: 13px;
          font-weight: 600;
          color: #667eea;
        }

        input[type="range"] {
          flex: 1;
          height: 4px;
          border-radius: 2px;
          background: rgba(255, 255, 255, 0.2);
          outline: none;
          -webkit-appearance: none;
        }

        input[type="range"]::-webkit-slider-thumb {
          -webkit-appearance: none;
          width: 16px;
          height: 16px;
          border-radius: 50%;
          background: #667eea;
          cursor: pointer;
        }

        input[type="range"]::-moz-range-thumb {
          width: 16px;
          height: 16px;
          border-radius: 50%;
          background: #667eea;
          cursor: pointer;
          border: none;
        }

        .checkbox-label {
          display: flex !important;
          align-items: center;
          gap: 8px;
          cursor: pointer;
          color: #fff;
        }

        .checkbox-label input[type="checkbox"] {
          width: 18px;
          height: 18px;
          cursor: pointer;
        }

        .algo-desc {
          font-size: 11px;
          color: #999;
          margin-top: 4px;
          padding-left: 26px;
        }

        .secondary-btn {
          width: 100%;
          padding: 10px;
          border-radius: 6px;
          border: none;
          background: rgba(255, 255, 255, 0.1);
          color: #fff;
          font-size: 13px;
          font-weight: 500;
          cursor: pointer;
          transition: background 0.2s;
          margin-top: 20px;
        }

        .secondary-btn:hover {
          background: rgba(255, 255, 255, 0.15);
        }

        .youtube-notice {
          margin-top: 12px;
          padding: 8px 12px;
          background: rgba(255, 149, 0, 0.15);
          border-left: 3px solid #ff9500;
          border-radius: 4px;
          font-size: 12px;
          color: #ff9500;
        }

        /* Scrollbar styling */
        .panel-content::-webkit-scrollbar {
          width: 6px;
        }

        .panel-content::-webkit-scrollbar-track {
          background: rgba(255, 255, 255, 0.05);
          border-radius: 3px;
        }

        .panel-content::-webkit-scrollbar-thumb {
          background: rgba(255, 255, 255, 0.2);
          border-radius: 3px;
        }

        .panel-content::-webkit-scrollbar-thumb:hover {
          background: rgba(255, 255, 255, 0.3);
        }
      `;
      document.head.appendChild(style);
    }
  }

  public getEnabled(): boolean {
    return this.isEnabled;
  }
}
