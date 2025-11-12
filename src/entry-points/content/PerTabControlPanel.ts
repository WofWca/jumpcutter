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
import { Settings, getSettings, setSettings } from '@/settings';

export interface PerTabPanelState {
  enabled: boolean;
  expanded: boolean;
  position: { x: number; y: number };
  url: string;
  settings?: Partial<Settings>;
}

export class PerTabControlPanel {
  private container: HTMLDivElement | null = null;
  private toggleButton: HTMLButtonElement | null = null;
  private expandButton: HTMLButtonElement | null = null;
  private panel: HTMLDivElement | null = null;
  private isEnabled: boolean = true;
  private isExpanded: boolean = false;
  private isDragging: boolean = false;
  private dragOffset = { x: 0, y: 0 };
  private position = { x: 20, y: 20 };
  private onToggleCallback: ((enabled: boolean) => void) | null = null;
  private settings: Partial<Settings> = {};

  constructor() {
    this.loadState();
  }

  private async loadState(): Promise<void> {
    try {
      const url = window.location.href;
      const key = `perTabPanel_${this.sanitizeKey(url)}`;
      const result = await browserOrChrome.storage.local.get(key);
      const state = result[key] as PerTabPanelState;
      
      if (state) {
        this.isEnabled = state.enabled !== false;
        this.isExpanded = state.expanded || false;
        this.position = state.position || { x: 20, y: 20 };
      }
      
      // Load current settings
      const allSettings = await getSettings();
      this.settings = {
        soundedSpeed: allSettings.soundedSpeed,
        silenceSpeedRaw: allSettings.silenceSpeedRaw,
        volumeThreshold: allSettings.volumeThreshold,
        marginBefore: allSettings.marginBefore,
        marginAfter: allSettings.marginAfter
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
        expanded: this.isExpanded,
        position: this.position,
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

  public createOverlay(onToggle: (enabled: boolean) => void): void {
    this.onToggleCallback = onToggle;

    if (document.getElementById('jumpcutter-control-panel')) {
      return;
    }

    // Create container
    this.container = document.createElement('div');
    this.container.id = 'jumpcutter-control-panel';
    this.container.style.left = `${this.position.x}px`;
    this.container.style.top = `${this.position.y}px`;
    
    // Create header with buttons
    const header = document.createElement('div');
    header.id = 'jumpcutter-panel-header';
    
    // Toggle button
    this.toggleButton = document.createElement('button');
    this.toggleButton.id = 'jumpcutter-toggle-btn';
    this.toggleButton.className = 'jumpcutter-btn';
    this.updateToggleButton();
    this.toggleButton.addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggle();
    });
    
    // Expand/collapse button
    this.expandButton = document.createElement('button');
    this.expandButton.id = 'jumpcutter-expand-btn';
    this.expandButton.className = 'jumpcutter-btn';
    this.expandButton.innerHTML = this.isExpanded ? '▼' : '▶';
    this.expandButton.title = this.isExpanded ? 'Collapse panel' : 'Expand panel';
    this.expandButton.addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggleExpanded();
    });
    
    header.appendChild(this.toggleButton);
    header.appendChild(this.expandButton);
    
    // Create expandable panel
    this.panel = document.createElement('div');
    this.panel.id = 'jumpcutter-panel-content';
    this.panel.style.display = this.isExpanded ? 'block' : 'none';
    this.createPanelContent();
    
    // Setup drag handlers
    this.setupDragHandlers(header);
    
    // Apply styles
    this.applyStyles();
    
    // Assemble and add to page
    this.container.appendChild(header);
    this.container.appendChild(this.panel);
    document.body.appendChild(this.container);
    
    // Initialize with saved state
    if (this.onToggleCallback) {
      this.onToggleCallback(this.isEnabled);
    }
  }

  private createPanelContent(): void {
    if (!this.panel) return;
    
    this.panel.innerHTML = `
      <div class="jumpcutter-control-group">
        <label>
          <span>🔊 Sounded Speed</span>
          <input type="range" id="jc-sounded-speed" min="0.5" max="4" step="0.1" value="${this.settings.soundedSpeed || 1}">
          <span id="jc-sounded-value">${this.settings.soundedSpeed || 1}x</span>
        </label>
      </div>
      
      <div class="jumpcutter-control-group">
        <label>
          <span>🔇 Silence Speed</span>
          <input type="range" id="jc-silence-speed" min="0.5" max="8" step="0.5" value="${this.settings.silenceSpeedRaw || 2}">
          <span id="jc-silence-value">${this.settings.silenceSpeedRaw || 2}x</span>
        </label>
      </div>
      
      <div class="jumpcutter-control-group">
        <label>
          <span>📊 Volume Threshold</span>
          <input type="range" id="jc-volume-threshold" min="0" max="1" step="0.01" value="${this.settings.volumeThreshold || 0.05}">
          <span id="jc-volume-value">${((this.settings.volumeThreshold || 0.05) * 100).toFixed(0)}%</span>
        </label>
      </div>
      
      <div class="jumpcutter-control-group">
        <label>
          <span>⏪ Margin Before</span>
          <input type="range" id="jc-margin-before" min="0" max="0.5" step="0.01" value="${this.settings.marginBefore || 0.1}">
          <span id="jc-margin-before-value">${this.settings.marginBefore || 0.1}s</span>
        </label>
      </div>
      
      <div class="jumpcutter-control-group">
        <label>
          <span>⏩ Margin After</span>
          <input type="range" id="jc-margin-after" min="0" max="0.5" step="0.01" value="${this.settings.marginAfter || 0.1}">
          <span id="jc-margin-after-value">${this.settings.marginAfter || 0.1}s</span>
        </label>
      </div>
      
      <div class="jumpcutter-control-buttons">
        <button id="jc-open-options" class="jumpcutter-action-btn">⚙️ Full Options</button>
        <button id="jc-reset-settings" class="jumpcutter-action-btn">↺ Reset</button>
      </div>
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
    
    // Open options
    const openOptions = this.panel.querySelector('#jc-open-options') as HTMLButtonElement;
    openOptions?.addEventListener('click', () => {
      browserOrChrome.runtime.openOptionsPage();
    });
    
    // Reset settings
    const resetSettings = this.panel.querySelector('#jc-reset-settings') as HTMLButtonElement;
    resetSettings?.addEventListener('click', async () => {
      // Reset to defaults
      await setSettings({
        soundedSpeed: 1,
        silenceSpeedRaw: 2,
        volumeThreshold: 0.05,
        marginBefore: 0.1,
        marginAfter: 0.1
      });
      // Reload panel content
      const allSettings = await getSettings();
      this.settings = {
        soundedSpeed: allSettings.soundedSpeed,
        silenceSpeedRaw: allSettings.silenceSpeedRaw,
        volumeThreshold: allSettings.volumeThreshold,
        marginBefore: allSettings.marginBefore,
        marginAfter: allSettings.marginAfter
      };
      this.createPanelContent();
    });
  }

  private setupDragHandlers(header: HTMLElement): void {
    header.addEventListener('mousedown', (e) => {
      // Don't start drag if clicking on buttons
      if ((e.target as HTMLElement).tagName === 'BUTTON') return;
      
      this.isDragging = true;
      const rect = this.container!.getBoundingClientRect();
      this.dragOffset.x = e.clientX - rect.left;
      this.dragOffset.y = e.clientY - rect.top;
      header.style.cursor = 'grabbing';
      e.preventDefault();
    });

    document.addEventListener('mousemove', (e) => {
      if (!this.isDragging || !this.container) return;
      
      const x = e.clientX - this.dragOffset.x;
      const y = e.clientY - this.dragOffset.y;
      
      const maxX = window.innerWidth - this.container.offsetWidth;
      const maxY = window.innerHeight - this.container.offsetHeight;
      
      this.position.x = Math.max(0, Math.min(x, maxX));
      this.position.y = Math.max(0, Math.min(y, maxY));
      
      this.container.style.left = `${this.position.x}px`;
      this.container.style.top = `${this.position.y}px`;
      this.container.style.right = 'auto';
    });

    document.addEventListener('mouseup', () => {
      if (this.isDragging) {
        this.isDragging = false;
        header.style.cursor = 'grab';
        this.saveState();
      }
    });
  }

  private updateToggleButton(): void {
    if (!this.toggleButton) return;
    
    if (this.isEnabled) {
      this.toggleButton.innerHTML = '🚀';
      this.toggleButton.title = 'Jump Cutter is ON - Click to disable';
      this.toggleButton.classList.add('enabled');
      this.toggleButton.classList.remove('disabled');
    } else {
      this.toggleButton.innerHTML = '⏸️';
      this.toggleButton.title = 'Jump Cutter is OFF - Click to enable';
      this.toggleButton.classList.remove('enabled');
      this.toggleButton.classList.add('disabled');
    }
  }

  private toggle(): void {
    this.isEnabled = !this.isEnabled;
    this.updateToggleButton();
    this.saveState();
    
    if (this.onToggleCallback) {
      this.onToggleCallback(this.isEnabled);
    }
  }

  private toggleExpanded(): void {
    this.isExpanded = !this.isExpanded;
    
    if (this.expandButton) {
      this.expandButton.innerHTML = this.isExpanded ? '▼' : '▶';
      this.expandButton.title = this.isExpanded ? 'Collapse panel' : 'Expand panel';
    }
    
    if (this.panel) {
      this.panel.style.display = this.isExpanded ? 'block' : 'none';
    }
    
    this.saveState();
  }

  private applyStyles(): void {
    if (!document.getElementById('jumpcutter-panel-styles')) {
      const style = document.createElement('style');
      style.id = 'jumpcutter-panel-styles';
      style.textContent = `
        #jumpcutter-control-panel {
          position: fixed;
          z-index: 2147483647;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
          font-size: 14px;
          user-select: none;
          background: rgba(30, 30, 30, 0.95);
          backdrop-filter: blur(10px);
          border-radius: 12px;
          box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
          color: white;
          min-width: 80px;
        }

        #jumpcutter-panel-header {
          display: flex;
          gap: 8px;
          padding: 8px;
          cursor: grab;
          border-bottom: 1px solid rgba(255, 255, 255, 0.1);
        }

        #jumpcutter-panel-header:active {
          cursor: grabbing;
        }

        .jumpcutter-btn {
          width: 36px;
          height: 36px;
          border-radius: 8px;
          border: none;
          background: rgba(255, 255, 255, 0.1);
          color: white;
          font-size: 18px;
          cursor: pointer;
          transition: all 0.2s ease;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .jumpcutter-btn:hover {
          background: rgba(255, 255, 255, 0.2);
          transform: scale(1.05);
        }

        .jumpcutter-btn.enabled {
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        }

        .jumpcutter-btn.disabled {
          background: rgba(100, 100, 100, 0.5);
        }

        #jumpcutter-panel-content {
          padding: 12px;
          width: 280px;
          max-height: 400px;
          overflow-y: auto;
        }

        .jumpcutter-control-group {
          margin-bottom: 16px;
        }

        .jumpcutter-control-group label {
          display: flex;
          flex-direction: column;
          gap: 6px;
          color: #fff;
        }

        .jumpcutter-control-group span {
          font-size: 13px;
          font-weight: 500;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .jumpcutter-control-group input[type="range"] {
          width: 100%;
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

        .jumpcutter-control-buttons {
          display: flex;
          gap: 8px;
          margin-top: 16px;
          padding-top: 12px;
          border-top: 1px solid rgba(255, 255, 255, 0.1);
        }

        .jumpcutter-action-btn {
          flex: 1;
          padding: 8px 12px;
          border-radius: 6px;
          border: none;
          background: rgba(255, 255, 255, 0.1);
          color: white;
          font-size: 12px;
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .jumpcutter-action-btn:hover {
          background: rgba(255, 255, 255, 0.2);
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

        /* YouTube specific adjustments */
        .html5-video-player #jumpcutter-control-panel {
          z-index: 2147483647 !important;
        }

        /* Mobile responsive */
        @media (max-width: 480px) {
          #jumpcutter-panel-content {
            width: 240px;
          }
          
          .jumpcutter-btn {
            width: 32px;
            height: 32px;
            font-size: 16px;
          }
        }
      `;
      document.head.appendChild(style);
    }
  }

  public destroy(): void {
    if (this.container && this.container.parentNode) {
      this.container.parentNode.removeChild(this.container);
    }
    
    const styles = document.getElementById('jumpcutter-panel-styles');
    if (styles && styles.parentNode) {
      styles.parentNode.removeChild(styles);
    }
    
    this.container = null;
    this.toggleButton = null;
    this.expandButton = null;
    this.panel = null;
    this.onToggleCallback = null;
  }

  public getEnabled(): boolean {
    return this.isEnabled;
  }
}
