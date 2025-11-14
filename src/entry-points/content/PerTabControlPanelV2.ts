/**
 * @license
 * Copyright (C) 2025
 *
 * This file is part of Jump Cutter Browser Extension.
 *
 * Jump Cutter Browser Extension is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */

import { browserOrChrome } from '@/webextensions-api-browser-or-chrome';
import { getSettings, setSettings, Settings, ControllerKind } from '@/settings';
import { YouTubeCompat } from './YouTubeCompat';

export interface PerTabPanelState {
  enabled: boolean;
  url: string;
  settings?: Partial<Settings>;
}

export class PerTabControlPanel {
  private container: HTMLDivElement | null = null;
  private edgeButton: HTMLDivElement | null = null;
  private panel: HTMLDivElement | null = null;
  private isEnabled: boolean = true;
  private onToggleCallback: ((enabled: boolean) => void) | null = null;
  private settings: Partial<Settings> = {};
  private readonly loadStatePromise: Promise<void>;
  private lastNotifiedEnabled: boolean | null = null;
  private hoverTimeout: number | null = null;

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
        url: url
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

    if (document.getElementById('jumpcutter-control-panel')) {
      return;
    }

    // Create container
    this.container = document.createElement('div');
    this.container.id = 'jumpcutter-control-panel';
    
    // Create minimal edge button
    this.edgeButton = document.createElement('div');
    this.edgeButton.id = 'jumpcutter-edge-btn';
    this.updateEdgeButton();
    
    // Create expandable panel
    this.panel = document.createElement('div');
    this.panel.id = 'jumpcutter-panel-content';
    this.createPanelContent();
    
    // Setup hover behavior
    this.setupHoverBehavior();
    
    // Apply styles
    this.applyStyles();
    
    // Assemble and add to page
    this.container.appendChild(this.edgeButton);
    this.container.appendChild(this.panel);
    document.body.appendChild(this.container);

    // Initialize with saved state
    this.notifyToggleState();
  }

  private notifyToggleState(): void {
    if (!this.onToggleCallback) return;
    if (this.lastNotifiedEnabled === this.isEnabled) return;
    this.lastNotifiedEnabled = this.isEnabled;
    this.onToggleCallback(this.isEnabled);
  }

  private setupHoverBehavior(): void {
    if (!this.container || !this.panel) return;

    const showPanel = () => {
      if (this.hoverTimeout) {
        clearTimeout(this.hoverTimeout);
        this.hoverTimeout = null;
      }
      this.panel!.classList.add('visible');
    };

    const hidePanel = () => {
      this.hoverTimeout = window.setTimeout(() => {
        this.panel!.classList.remove('visible');
      }, 300);
    };

    this.container.addEventListener('mouseenter', showPanel);
    this.container.addEventListener('mouseleave', hidePanel);
  }

  private updateEdgeButton(): void {
    if (!this.edgeButton) return;
    
    const icon = this.isEnabled ? '🚀' : '⏸️';
    this.edgeButton.innerHTML = `<span class="icon">${icon}</span>`;
    this.edgeButton.className = this.isEnabled ? 'enabled' : 'disabled';
    this.edgeButton.title = this.isEnabled 
      ? 'Jump Cutter ON (hover for controls)' 
      : 'Jump Cutter OFF (hover for controls)';
  }

  private createPanelContent(): void {
    if (!this.panel) return;
    
    // Get speed limits based on current site
    const limits = YouTubeCompat.getSpeedLimits();
    const adjustedSettings = YouTubeCompat.getAdjustedSettings(this.settings);
    
    this.panel.innerHTML = `
      <div class="jumpcutter-panel-header">
        <h3>⚡ Jump Cutter</h3>
        <button id="jc-toggle-enabled" class="jumpcutter-toggle-btn ${this.isEnabled ? 'enabled' : 'disabled'}">
          ${this.isEnabled ? '⏸️ Disable' : '▶️ Enable'}
        </button>
      </div>

      <div class="jumpcutter-control-group">
        <label>
          <span>🔊 Sounded Speed</span>
          <div class="control-row">
            <input type="range" id="jc-sounded-speed" min="${limits.min}" max="${limits.max}" step="0.1" value="${adjustedSettings.soundedSpeed}">
            <span id="jc-sounded-value" class="value-display">${adjustedSettings.soundedSpeed}x</span>
          </div>
        </label>
      </div>
      
      <div class="jumpcutter-control-group">
        <label>
          <span>🔇 Silence Speed</span>
          <div class="control-row">
            <input type="range" id="jc-silence-speed" min="0.5" max="${limits.silenceMax}" step="0.25" value="${adjustedSettings.silenceSpeedRaw}">
            <span id="jc-silence-value" class="value-display">${adjustedSettings.silenceSpeedRaw}x</span>
          </div>
        </label>
      </div>
      
      <div class="jumpcutter-control-group">
        <label>
          <span>📊 Volume Threshold</span>
          <div class="control-row">
            <input type="range" id="jc-volume-threshold" min="0" max="1" step="0.01" value="${this.settings.volumeThreshold || 0.05}">
            <span id="jc-volume-value" class="value-display">${((this.settings.volumeThreshold || 0.05) * 100).toFixed(0)}%</span>
          </div>
        </label>
      </div>
      
      <div class="jumpcutter-control-group">
        <label>
          <span>⏪ Margin Before</span>
          <div class="control-row">
            <input type="range" id="jc-margin-before" min="0" max="0.5" step="0.01" value="${this.settings.marginBefore || 0.1}">
            <span id="jc-margin-before-value" class="value-display">${this.settings.marginBefore || 0.1}s</span>
          </div>
        </label>
      </div>
      
      <div class="jumpcutter-control-group">
        <label>
          <span>⏩ Margin After</span>
          <div class="control-row">
            <input type="range" id="jc-margin-after" min="0" max="0.5" step="0.01" value="${this.settings.marginAfter || 0.1}">
            <span id="jc-margin-after-value" class="value-display">${this.settings.marginAfter || 0.1}s</span>
          </div>
        </label>
      </div>
      
      <div class="jumpcutter-control-group">
        <label class="checkbox-label">
          <input type="checkbox" id="jc-use-cloning" ${this.settings.experimentalControllerType === ControllerKind.CLONING ? 'checked' : ''}>
          <span>🧪 Experimental Algorithm</span>
        </label>
        <div class="algo-description" id="jc-algo-desc">
          ${this.settings.experimentalControllerType === ControllerKind.CLONING 
            ? 'Skip-heavy: Jumps over silence' 
            : 'Speed-heavy: Speeds through silence'}
        </div>
      </div>

      <div class="jumpcutter-panel-footer">
        <button id="jc-open-options" class="jumpcutter-secondary-btn">⚙️ Options</button>
      </div>
      
      ${window.location.hostname.includes('youtube.com') ? `
        <div class="jumpcutter-youtube-notice">
          ⚠️ YouTube limits: Max 2x speed
        </div>
      ` : ''}
    `;
    
    // Add event listeners for controls
    this.setupControlListeners();
  }

  private setupControlListeners(): void {
    if (!this.panel) return;
    
    // Sounded speed
    const soundedSpeed = this.panel.querySelector('#jc-sounded-speed') as HTMLInputElement;
    const soundedValue = this.panel.querySelector('#jc-sounded-value') as HTMLSpanElement;
    soundedSpeed?.addEventListener('input', async (e) => {
      const value = parseFloat((e.target as HTMLInputElement).value);
      soundedValue.textContent = `${value}x`;
      await setSettings({ soundedSpeed: value });
      this.settings.soundedSpeed = value;
    });
    
    // Silence speed
    const silenceSpeed = this.panel.querySelector('#jc-silence-speed') as HTMLInputElement;
    const silenceValue = this.panel.querySelector('#jc-silence-value') as HTMLSpanElement;
    silenceSpeed?.addEventListener('input', async (e) => {
      const value = parseFloat((e.target as HTMLInputElement).value);
      silenceValue.textContent = `${value}x`;
      await setSettings({ silenceSpeedRaw: value });
      this.settings.silenceSpeedRaw = value;
    });
    
    // Volume threshold
    const volumeThreshold = this.panel.querySelector('#jc-volume-threshold') as HTMLInputElement;
    const volumeValue = this.panel.querySelector('#jc-volume-value') as HTMLSpanElement;
    volumeThreshold?.addEventListener('input', async (e) => {
      const value = parseFloat((e.target as HTMLInputElement).value);
      volumeValue.textContent = `${(value * 100).toFixed(0)}%`;
      await setSettings({ volumeThreshold: value });
      this.settings.volumeThreshold = value;
    });
    
    // Margin before
    const marginBefore = this.panel.querySelector('#jc-margin-before') as HTMLInputElement;
    const marginBeforeValue = this.panel.querySelector('#jc-margin-before-value') as HTMLSpanElement;
    marginBefore?.addEventListener('input', async (e) => {
      const value = parseFloat((e.target as HTMLInputElement).value);
      marginBeforeValue.textContent = `${value}s`;
      await setSettings({ marginBefore: value });
      this.settings.marginBefore = value;
    });
    
    // Margin after
    const marginAfter = this.panel.querySelector('#jc-margin-after') as HTMLInputElement;
    const marginAfterValue = this.panel.querySelector('#jc-margin-after-value') as HTMLSpanElement;
    marginAfter?.addEventListener('input', async (e) => {
      const value = parseFloat((e.target as HTMLInputElement).value);
      marginAfterValue.textContent = `${value}s`;
      await setSettings({ marginAfter: value });
      this.settings.marginAfter = value;
    });
    
    // Toggle enabled button
    const toggleEnabled = this.panel.querySelector('#jc-toggle-enabled') as HTMLButtonElement;
    toggleEnabled?.addEventListener('click', () => {
      this.toggle();
    });
    
    // Algorithm toggle
    const useCloning = this.panel.querySelector('#jc-use-cloning') as HTMLInputElement;
    useCloning?.addEventListener('change', async (e) => {
      const checked = (e.target as HTMLInputElement).checked;
      const newType = checked ? ControllerKind.CLONING : ControllerKind.STRETCHING;
      await setSettings({ experimentalControllerType: newType });
      this.settings.experimentalControllerType = newType;
      // Update description text without rebuilding entire panel
      const descEl = this.panel?.querySelector('#jc-algo-desc') as HTMLDivElement;
      if (descEl) {
        descEl.textContent = checked 
          ? 'Skip-heavy: Jumps over silence' 
          : 'Speed-heavy: Speeds through silence';
      }
    });
    
    // Open options
    const openOptions = this.panel.querySelector('#jc-open-options') as HTMLButtonElement;
    openOptions?.addEventListener('click', () => {
      if (browserOrChrome.runtime && browserOrChrome.runtime.openOptionsPage) {
        browserOrChrome.runtime.openOptionsPage();
      } else {
        console.error('[JumpCutter] openOptionsPage not available');
      }
    });
  }

  private toggle(): void {
    this.isEnabled = !this.isEnabled;
    this.updateEdgeButton();
    this.saveState();
    
    this.notifyToggleState();

    // Update the toggle button in panel if it exists
    const toggleBtn = this.panel?.querySelector('#jc-toggle-enabled') as HTMLButtonElement;
    if (toggleBtn) {
      toggleBtn.textContent = this.isEnabled ? '⏸️ Disable' : '▶️ Enable';
      toggleBtn.className = `jumpcutter-toggle-btn ${this.isEnabled ? 'enabled' : 'disabled'}`;
    }
  }

  private applyStyles(): void {
    if (!document.getElementById('jumpcutter-panel-styles')) {
      const style = document.createElement('style');
      style.id = 'jumpcutter-panel-styles';
      style.textContent = `
        #jumpcutter-control-panel {
          position: fixed;
          top: 50%;
          right: 0;
          transform: translateY(-50%);
          z-index: 2147483647;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
          font-size: 14px;
          user-select: none;
          display: flex;
          align-items: center;
        }

        #jumpcutter-edge-btn {
          width: 40px;
          height: 80px;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          border-radius: 8px 0 0 8px;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
          box-shadow: -2px 0 10px rgba(0, 0, 0, 0.2);
        }

        #jumpcutter-edge-btn.disabled {
          background: linear-gradient(135deg, #868686 0%, #4a4a4a 100%);
        }

        #jumpcutter-edge-btn:hover {
          width: 50px;
          box-shadow: -4px 0 15px rgba(0, 0, 0, 0.3);
        }

        #jumpcutter-edge-btn .icon {
          font-size: 24px;
          transform: rotate(-90deg);
        }

        #jumpcutter-panel-content {
          width: 320px;
          max-height: 80vh;
          overflow-y: auto;
          background: rgba(30, 30, 30, 0.95);
          backdrop-filter: blur(10px);
          border-radius: 12px 0 0 12px;
          padding: 20px;
          box-shadow: -4px 0 20px rgba(0, 0, 0, 0.3);
          transform: translateX(100%);
          opacity: 0;
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
          pointer-events: none;
        }

        #jumpcutter-panel-content.visible {
          transform: translateX(0);
          opacity: 1;
          pointer-events: all;
        }

        .jumpcutter-panel-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 20px;
          padding-bottom: 15px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.1);
        }

        .jumpcutter-panel-header h3 {
          margin: 0;
          color: #fff;
          font-size: 18px;
          font-weight: 600;
        }

        .jumpcutter-toggle-btn {
          padding: 8px 16px;
          border-radius: 6px;
          border: none;
          font-size: 13px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s;
        }

        .jumpcutter-toggle-btn.enabled {
          background: rgba(255, 59, 48, 0.2);
          color: #ff3b30;
        }

        .jumpcutter-toggle-btn.enabled:hover {
          background: rgba(255, 59, 48, 0.3);
        }

        .jumpcutter-toggle-btn.disabled {
          background: rgba(52, 199, 89, 0.2);
          color: #34c759;
        }

        .jumpcutter-toggle-btn.disabled:hover {
          background: rgba(52, 199, 89, 0.3);
        }

        .jumpcutter-control-group {
          margin-bottom: 16px;
        }

        .jumpcutter-control-group label {
          display: block;
          color: #fff;
        }

        .jumpcutter-control-group label > span:first-child {
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

        .value-display {
          min-width: 45px;
          text-align: right;
          font-size: 13px;
          font-weight: 600;
          color: #667eea;
        }

        .jumpcutter-control-group input[type="range"] {
          flex: 1;
          height: 4px;
          border-radius: 2px;
          background: rgba(255, 255, 255, 0.2);
          outline: none;
          -webkit-appearance: none;
        }

        .jumpcutter-control-group input[type="range"]::-webkit-slider-thumb {
          -webkit-appearance: none;
          width: 16px;
          height: 16px;
          border-radius: 50%;
          background: #667eea;
          cursor: pointer;
          transition: background 0.2s;
        }

        .jumpcutter-control-group input[type="range"]::-webkit-slider-thumb:hover {
          background: #764ba2;
        }

        .jumpcutter-control-group input[type="range"]::-moz-range-thumb {
          width: 16px;
          height: 16px;
          border-radius: 50%;
          background: #667eea;
          cursor: pointer;
          border: none;
          transition: background 0.2s;
        }

        .jumpcutter-control-group input[type="range"]::-moz-range-thumb:hover {
          background: #764ba2;
        }

        .checkbox-label {
          display: flex !important;
          align-items: center;
          gap: 8px;
          cursor: pointer;
        }

        .checkbox-label input[type="checkbox"] {
          width: 18px;
          height: 18px;
          cursor: pointer;
        }

        .algo-description {
          font-size: 11px;
          color: #999;
          margin-top: 4px;
          padding-left: 26px;
        }

        .jumpcutter-panel-footer {
          margin-top: 20px;
          padding-top: 15px;
          border-top: 1px solid rgba(255, 255, 255, 0.1);
        }

        .jumpcutter-secondary-btn {
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
        }

        .jumpcutter-secondary-btn:hover {
          background: rgba(255, 255, 255, 0.15);
        }

        .jumpcutter-youtube-notice {
          margin-top: 12px;
          padding: 8px 12px;
          background: rgba(255, 149, 0, 0.15);
          border-left: 3px solid #ff9500;
          border-radius: 4px;
          font-size: 12px;
          color: #ff9500;
        }

        /* Scrollbar styling */
        #jumpcutter-panel-content::-webkit-scrollbar {
          width: 6px;
        }

        #jumpcutter-panel-content::-webkit-scrollbar-track {
          background: rgba(255, 255, 255, 0.05);
          border-radius: 3px;
        }

        #jumpcutter-panel-content::-webkit-scrollbar-thumb {
          background: rgba(255, 255, 255, 0.2);
          border-radius: 3px;
        }

        #jumpcutter-panel-content::-webkit-scrollbar-thumb:hover {
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
