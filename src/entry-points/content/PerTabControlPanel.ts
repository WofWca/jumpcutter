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
  private visualizationCanvas: HTMLCanvasElement | null = null;
  private visualizationCtx: CanvasRenderingContext2D | null = null;
  private telemetryUpdateInterval: number | null = null;

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
    
    // Create single collapsible button
    this.toggleButton = document.createElement('button');
    this.toggleButton.id = 'jumpcutter-main-btn';
    this.toggleButton.className = 'jumpcutter-btn';
    this.updateMainButton();
    // Don't add click handler here - it's handled in setupDragHandlers
    
    // Create expandable panel
    this.panel = document.createElement('div');
    this.panel.id = 'jumpcutter-panel-content';
    this.panel.style.display = this.isExpanded ? 'block' : 'none';
    this.createPanelContent();
    
    // Setup drag handlers
    this.setupDragHandlers(this.toggleButton);
    
    // Apply styles
    this.applyStyles();
    
    // Assemble and add to page
    this.container.appendChild(this.toggleButton);
    this.container.appendChild(this.panel);
    document.body.appendChild(this.container);
    
    // Initialize with saved state
    if (this.onToggleCallback) {
      this.onToggleCallback(this.isEnabled);
    }
  }

  private createPanelContent(): void {
    if (!this.panel) return;
    
    // Get speed limits based on current site
    const limits = YouTubeCompat.getSpeedLimits();
    const adjustedSettings = YouTubeCompat.getAdjustedSettings(this.settings);
    
    this.panel.innerHTML = `
      <div class="jumpcutter-control-group">
        <label>
          <span>🔊 Sounded Speed</span>
          <input type="range" id="jc-sounded-speed" min="${limits.min}" max="${limits.max}" step="0.1" value="${adjustedSettings.soundedSpeed}">
          <span id="jc-sounded-value">${adjustedSettings.soundedSpeed}x</span>
        </label>
      </div>
      
      <div class="jumpcutter-control-group">
        <label>
          <span>🔇 Silence Speed</span>
          <input type="range" id="jc-silence-speed" min="0.5" max="${limits.silenceMax}" step="0.25" value="${adjustedSettings.silenceSpeedRaw}">
          <span id="jc-silence-value">${adjustedSettings.silenceSpeedRaw}x</span>
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
      
      <div class="jumpcutter-control-group">
        <label style="display: flex; align-items: center; gap: 8px;">
          <input type="checkbox" id="jc-use-cloning" ${this.settings.experimentalControllerType === ControllerKind.CLONING ? 'checked' : ''}>
          <span>🧪 Use Experimental Algorithm (Cloning)</span>
        </label>
        <div style="font-size: 11px; color: #666; margin-top: 4px; padding-left: 24px;">
          ${this.settings.experimentalControllerType === ControllerKind.CLONING 
            ? 'Skip-heavy: Jumps over silence' 
            : 'Speed-heavy: Speeds through silence'}
        </div>
      </div>
      
      <div class="jumpcutter-visualization">
        <div style="font-size: 12px; font-weight: 500; margin-bottom: 4px;">📊 Audio Level</div>
        <canvas id="jc-viz-canvas" width="280" height="60"></canvas>
      </div>
      
      <div class="jumpcutter-control-buttons">
        <button id="jc-toggle-enabled" class="jumpcutter-action-btn">${this.isEnabled ? '⏸️ Disable' : '▶️ Enable'}</button>
        <button id="jc-open-options" class="jumpcutter-action-btn">⚙️ Options</button>
      </div>
      ${window.location.hostname.includes('youtube.com') ? `
        <div class="jumpcutter-youtube-notice">
          <span>⚠️ YouTube limits: Max 2x speed</span>
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
      // Refresh panel to update description
      this.createPanelContent();
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

  private setupDragHandlers(dragElement: HTMLElement): void {
    let dragStartX = 0;
    let dragStartY = 0;
    let hasMoved = false;
    
    dragElement.addEventListener('mousedown', (e) => {
      // Don't start drag if panel is expanded
      if (this.isExpanded) return;
      
      dragStartX = e.clientX;
      dragStartY = e.clientY;
      hasMoved = false;
      this.isDragging = true;
      
      const rect = this.container!.getBoundingClientRect();
      this.dragOffset.x = e.clientX - rect.left;
      this.dragOffset.y = e.clientY - rect.top;
      dragElement.style.cursor = 'grabbing';
      e.preventDefault();
    });

    document.addEventListener('mousemove', (e) => {
      if (!this.isDragging || !this.container) return;
      
      // Check if mouse has moved significantly (more than 5 pixels)
      const moveDistance = Math.sqrt(
        Math.pow(e.clientX - dragStartX, 2) + 
        Math.pow(e.clientY - dragStartY, 2)
      );
      
      if (moveDistance > 5) {
        hasMoved = true;
      }
      
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

    document.addEventListener('mouseup', (e) => {
      if (this.isDragging) {
        this.isDragging = false;
        dragElement.style.cursor = 'pointer';
        
        // Only save state if we actually moved
        if (hasMoved) {
          this.saveState();
        } else {
          // If we didn't move, treat it as a click
          this.toggleExpanded();
        }
      }
    });
    
    // Override the click handler to only work when not dragging
    dragElement.removeEventListener('click', this.toggleExpanded);
    dragElement.addEventListener('click', (e) => {
      // Prevent click from firing after drag
      if (hasMoved) {
        e.stopPropagation();
        hasMoved = false;
      }
    });
  }

  private updateMainButton(): void {
    if (!this.toggleButton) return;
    
    if (this.isExpanded) {
      this.toggleButton.innerHTML = `
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="18" y1="6" x2="6" y2="18"></line>
          <line x1="6" y1="6" x2="18" y2="18"></line>
        </svg>
      `;
      this.toggleButton.title = 'Close panel';
      this.toggleButton.classList.add('expanded');
    } else {
      const icon = this.isEnabled ? '🚀' : '⏸️';
      const status = this.isEnabled ? 'ON' : 'OFF';
      this.toggleButton.innerHTML = `<span class="icon">${icon}</span><span class="status">Jump Cutter ${status}</span>`;
      this.toggleButton.title = 'Click to open controls';
      this.toggleButton.classList.remove('expanded');
    }
    
    if (this.isEnabled) {
      this.toggleButton.classList.add('enabled');
      this.toggleButton.classList.remove('disabled');
    } else {
      this.toggleButton.classList.remove('enabled');
      this.toggleButton.classList.add('disabled');
    }
  }

  private toggle(): void {
    this.isEnabled = !this.isEnabled;
    this.updateMainButton();
    this.saveState();
    
    if (this.onToggleCallback) {
      this.onToggleCallback(this.isEnabled);
    }
    
    // Update the toggle button in panel if it exists
    const toggleBtn = document.querySelector('#jc-toggle-enabled') as HTMLButtonElement;
    if (toggleBtn) {
      toggleBtn.textContent = this.isEnabled ? '⏸️ Disable' : '▶️ Enable';
    }
  }

  private toggleExpanded(): void {
    this.isExpanded = !this.isExpanded;
    this.updateMainButton();
    
    if (this.panel) {
      this.panel.style.display = this.isExpanded ? 'block' : 'none';
      
      // Initialize visualization when panel opens
      if (this.isExpanded) {
        this.initVisualization();
      } else {
        this.stopVisualization();
      }
    }
    
    this.saveState();
  }

  private initVisualization(): void {
    this.visualizationCanvas = this.panel?.querySelector('#jc-viz-canvas') as HTMLCanvasElement;
    if (!this.visualizationCanvas) return;
    
    this.visualizationCtx = this.visualizationCanvas.getContext('2d');
    if (!this.visualizationCtx) return;
    
    // Connect to telemetry port
    this.startTelemetryUpdates();
  }

  private stopVisualization(): void {
    if (this.telemetryUpdateInterval) {
      clearInterval(this.telemetryUpdateInterval);
      this.telemetryUpdateInterval = null;
    }
  }

  private startTelemetryUpdates(): void {
    // Poll for telemetry data
    this.telemetryUpdateInterval = window.setInterval(() => {
      this.updateVisualization();
    }, 50); // 20 FPS
  }

  private updateVisualization(): void {
    if (!this.visualizationCtx || !this.visualizationCanvas) return;
    
    const ctx = this.visualizationCtx;
    const canvas = this.visualizationCanvas;
    const width = canvas.width;
    const height = canvas.height;
    
    // Clear canvas
    ctx.fillStyle = '#f5f5f5';
    ctx.fillRect(0, 0, width, height);
    
    // Draw volume threshold line
    const thresholdY = height - (this.settings.volumeThreshold || 0.05) * height;
    ctx.strokeStyle = '#ff4444';
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.moveTo(0, thresholdY);
    ctx.lineTo(width, thresholdY);
    ctx.stroke();
    ctx.setLineDash([]);
    
    // Draw simulated volume bar (will be replaced with real telemetry)
    const barHeight = Math.random() * height * 0.8;
    const barY = height - barHeight;
    
    ctx.fillStyle = barHeight > (height - thresholdY) ? '#667eea' : '#aaa';
    ctx.fillRect(width - 20, barY, 15, barHeight);
    
    // Draw labels
    ctx.fillStyle = '#666';
    ctx.font = '10px sans-serif';
    ctx.fillText('Threshold', 5, thresholdY - 5);
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
        }

        #jumpcutter-main-btn {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 10px 16px;
          border-radius: 24px;
          border: none;
          background: rgba(30, 30, 30, 0.9);
          backdrop-filter: blur(10px);
          color: white;
          font-size: 14px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
          box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
          white-space: nowrap;
        }

        #jumpcutter-main-btn:hover {
          transform: scale(1.05);
          box-shadow: 0 6px 25px rgba(0, 0, 0, 0.4);
        }

        #jumpcutter-main-btn.enabled {
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        }

        #jumpcutter-main-btn.disabled {
          background: rgba(80, 80, 80, 0.9);
        }

        #jumpcutter-main-btn.expanded {
          border-radius: 12px 12px 0 0;
          width: 48px;
          height: 48px;
          padding: 0;
          justify-content: center;
        }

        #jumpcutter-main-btn .icon {
          font-size: 20px;
        }

        #jumpcutter-main-btn .status {
          font-size: 13px;
          opacity: 0.95;
        }

        #jumpcutter-panel-content {
          padding: 16px;
          width: 280px;
          max-height: 400px;
          overflow-y: auto;
          background: rgba(30, 30, 30, 0.95);
          backdrop-filter: blur(10px);
          border-radius: 0 0 12px 12px;
          box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
          color: white;
          margin-top: -1px;
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

        .jumpcutter-visualization {
          margin-top: 12px;
          padding: 12px;
          background: rgba(255, 255, 255, 0.05);
          border-radius: 8px;
        }

        .jumpcutter-visualization canvas {
          width: 100%;
          height: 60px;
          border-radius: 4px;
          background: #f5f5f5;
        }

        .jumpcutter-control-buttons {
          display: flex;
          gap: 8px;
          margin-top: 12px;
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

        .jumpcutter-youtube-notice {
          margin-top: 12px;
          padding: 8px 12px;
          background: rgba(255, 193, 7, 0.1);
          border: 1px solid rgba(255, 193, 7, 0.3);
          border-radius: 8px;
          color: #ffc107;
          font-size: 12px;
          text-align: center;
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
    
    // Apply YouTube-specific fixes
    YouTubeCompat.injectFixes();
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
