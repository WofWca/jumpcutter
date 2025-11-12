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

export interface PerTabState {
  enabled: boolean;
  tabId?: number;
  url: string;
}

export class PerTabControl {
  private container: HTMLDivElement | null = null;
  private toggleButton: HTMLButtonElement | null = null;
  private isEnabled: boolean = true;
  private onToggleCallback: ((enabled: boolean) => void) | null = null;
  private isDragging: boolean = false;
  private dragOffset = { x: 0, y: 0 };

  constructor() {
    this.loadState();
  }

  private async loadState(): Promise<void> {
    try {
      const url = window.location.href;
      const key = `perTab_${this.sanitizeKey(url)}`;
      const result = await browserOrChrome.storage.local.get(key);
      this.isEnabled = result[key]?.enabled !== false; // Default to true if not set
    } catch (error) {
      console.error('Failed to load per-tab state:', error);
      this.isEnabled = true;
    }
  }

  private async saveState(): Promise<void> {
    try {
      const url = window.location.href;
      const key = `perTab_${this.sanitizeKey(url)}`;
      const state: PerTabState = {
        enabled: this.isEnabled,
        url: url
      };
      await browserOrChrome.storage.local.set({ [key]: state });
    } catch (error) {
      console.error('Failed to save per-tab state:', error);
    }
  }

  private sanitizeKey(url: string): string {
    // Create a safe storage key from URL
    return url.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 100);
  }

  public createOverlay(onToggle: (enabled: boolean) => void): void {
    this.onToggleCallback = onToggle;

    // Check if overlay already exists
    if (document.getElementById('jumpcutter-per-tab-control')) {
      return;
    }

    // Create container
    this.container = document.createElement('div');
    this.container.id = 'jumpcutter-per-tab-control';
    
    // Create toggle button
    this.toggleButton = document.createElement('button');
    this.toggleButton.id = 'jumpcutter-toggle-btn';
    this.updateButtonState();

    // Add click handler
    this.toggleButton.addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggle();
    });

    // Add drag functionality
    this.setupDragHandlers();

    // Apply styles
    this.applyStyles();

    // Add to container and page
    this.container.appendChild(this.toggleButton);
    document.body.appendChild(this.container);

    // Initialize with saved state
    if (this.onToggleCallback) {
      this.onToggleCallback(this.isEnabled);
    }
  }

  private setupDragHandlers(): void {
    if (!this.toggleButton) return;

    this.toggleButton.addEventListener('mousedown', (e) => {
      this.isDragging = true;
      const rect = this.toggleButton!.getBoundingClientRect();
      this.dragOffset.x = e.clientX - rect.left;
      this.dragOffset.y = e.clientY - rect.top;
      this.toggleButton!.style.cursor = 'grabbing';
      e.preventDefault();
    });

    document.addEventListener('mousemove', (e) => {
      if (!this.isDragging || !this.container) return;
      
      const x = e.clientX - this.dragOffset.x;
      const y = e.clientY - this.dragOffset.y;
      
      // Keep button within viewport
      const maxX = window.innerWidth - this.container.offsetWidth;
      const maxY = window.innerHeight - this.container.offsetHeight;
      
      this.container.style.left = `${Math.max(0, Math.min(x, maxX))}px`;
      this.container.style.top = `${Math.max(0, Math.min(y, maxY))}px`;
      this.container.style.right = 'auto';
    });

    document.addEventListener('mouseup', () => {
      if (this.isDragging && this.toggleButton) {
        this.isDragging = false;
        this.toggleButton.style.cursor = 'grab';
      }
    });
  }

  private updateButtonState(): void {
    if (!this.toggleButton) return;
    
    if (this.isEnabled) {
      this.toggleButton.innerHTML = '🚀';
      this.toggleButton.title = 'Jump Cutter is ON - Click to disable for this tab';
      this.toggleButton.style.background = 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)';
    } else {
      this.toggleButton.innerHTML = '⏸️';
      this.toggleButton.title = 'Jump Cutter is OFF - Click to enable for this tab';
      this.toggleButton.style.background = 'linear-gradient(135deg, #868686 0%, #4a4a4a 100%)';
    }
  }

  private toggle(): void {
    this.isEnabled = !this.isEnabled;
    this.updateButtonState();
    this.saveState();
    
    if (this.onToggleCallback) {
      this.onToggleCallback(this.isEnabled);
    }
  }

  private applyStyles(): void {
    // Inject styles if not already present
    if (!document.getElementById('jumpcutter-per-tab-styles')) {
      const style = document.createElement('style');
      style.id = 'jumpcutter-per-tab-styles';
      style.textContent = `
        #jumpcutter-per-tab-control {
          position: fixed;
          top: 20px;
          right: 20px;
          z-index: 2147483647;
          user-select: none;
          pointer-events: none;
        }

        #jumpcutter-toggle-btn {
          width: 48px;
          height: 48px;
          border-radius: 50%;
          border: none;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
          font-size: 24px;
          cursor: grab;
          box-shadow: 0 4px 15px rgba(0, 0, 0, 0.2);
          transition: all 0.3s ease;
          display: flex;
          align-items: center;
          justify-content: center;
          pointer-events: all;
        }

        #jumpcutter-toggle-btn:hover {
          transform: scale(1.1);
          box-shadow: 0 6px 20px rgba(0, 0, 0, 0.3);
        }

        #jumpcutter-toggle-btn:active {
          transform: scale(0.95);
        }

        /* Pulse animation when enabled */
        #jumpcutter-toggle-btn.enabled {
          animation: pulse 2s infinite;
        }

        @keyframes pulse {
          0% {
            box-shadow: 0 4px 15px rgba(102, 126, 234, 0.4);
          }
          50% {
            box-shadow: 0 4px 25px rgba(102, 126, 234, 0.6);
          }
          100% {
            box-shadow: 0 4px 15px rgba(102, 126, 234, 0.4);
          }
        }

        /* Hide on very small screens */
        @media (max-width: 480px) {
          #jumpcutter-toggle-btn {
            width: 40px;
            height: 40px;
            font-size: 20px;
          }
        }

        /* Ensure it stays visible on YouTube */
        .html5-video-player #jumpcutter-per-tab-control {
          z-index: 2147483647 !important;
        }
      `;
      document.head.appendChild(style);
    }
  }

  public destroy(): void {
    if (this.container && this.container.parentNode) {
      this.container.parentNode.removeChild(this.container);
    }
    
    const styles = document.getElementById('jumpcutter-per-tab-styles');
    if (styles && styles.parentNode) {
      styles.parentNode.removeChild(styles);
    }
    
    this.container = null;
    this.toggleButton = null;
    this.onToggleCallback = null;
  }

  public getEnabled(): boolean {
    return this.isEnabled;
  }
}
