/**
 * Visual indicator for silence skipping status
 */

export class SilenceIndicator {
  private indicator: HTMLDivElement | null = null;
  private isVisible: boolean = false;
  private hideTimeout: number | null = null;

  constructor() {
    this.createIndicator();
  }

  private createIndicator(): void {
    this.indicator = document.createElement('div');
    this.indicator.id = 'jumpcutter-silence-indicator';
    this.indicator.innerHTML = `
      <div class="pulse"></div>
      <span class="text">Skipping silence...</span>
    `;
    
    // Apply styles
    if (!document.getElementById('jumpcutter-indicator-styles')) {
      const style = document.createElement('style');
      style.id = 'jumpcutter-indicator-styles';
      style.textContent = `
        #jumpcutter-silence-indicator {
          position: fixed;
          bottom: 20px;
          left: 50%;
          transform: translateX(-50%);
          background: rgba(102, 126, 234, 0.9);
          backdrop-filter: blur(10px);
          padding: 8px 20px;
          border-radius: 20px;
          color: white;
          font-size: 13px;
          font-weight: 500;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
          display: none;
          align-items: center;
          gap: 10px;
          z-index: 2147483646;
          box-shadow: 0 4px 20px rgba(102, 126, 234, 0.4);
          animation: slideUp 0.3s ease-out;
        }

        #jumpcutter-silence-indicator.visible {
          display: flex;
        }

        #jumpcutter-silence-indicator .pulse {
          width: 8px;
          height: 8px;
          background: white;
          border-radius: 50%;
          animation: pulse 1s infinite;
        }

        @keyframes pulse {
          0%, 100% {
            opacity: 1;
            transform: scale(1);
          }
          50% {
            opacity: 0.5;
            transform: scale(1.5);
          }
        }

        @keyframes slideUp {
          from {
            opacity: 0;
            transform: translateX(-50%) translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateX(-50%) translateY(0);
          }
        }

        /* Position adjustment for YouTube */
        .html5-video-player #jumpcutter-silence-indicator {
          bottom: 80px;
        }
      `;
      document.head.appendChild(style);
    }
    
    document.body.appendChild(this.indicator);
  }

  public show(speed?: number): void {
    if (!this.indicator) return;
    
    // Update text if speed is provided
    if (speed !== undefined) {
      const textElement = this.indicator.querySelector('.text');
      if (textElement) {
        textElement.textContent = `Skipping silence at ${speed}x...`;
      }
    }
    
    this.indicator.classList.add('visible');
    this.isVisible = true;
    
    // Clear any existing timeout
    if (this.hideTimeout) {
      clearTimeout(this.hideTimeout);
    }
    
    // Auto-hide after a delay
    this.hideTimeout = window.setTimeout(() => {
      this.hide();
    }, 2000);
  }

  public hide(): void {
    if (!this.indicator) return;
    
    this.indicator.classList.remove('visible');
    this.isVisible = false;
    
    if (this.hideTimeout) {
      clearTimeout(this.hideTimeout);
      this.hideTimeout = null;
    }
  }

  public destroy(): void {
    if (this.indicator && this.indicator.parentNode) {
      this.indicator.parentNode.removeChild(this.indicator);
    }
    
    const styles = document.getElementById('jumpcutter-indicator-styles');
    if (styles && styles.parentNode) {
      styles.parentNode.removeChild(styles);
    }
    
    if (this.hideTimeout) {
      clearTimeout(this.hideTimeout);
    }
    
    this.indicator = null;
  }
}
