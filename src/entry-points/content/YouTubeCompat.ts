/**
 * YouTube-specific compatibility layer
 * Handles YouTube's player quirks and prevents interference
 */

export class YouTubeCompat {
  private static isYouTube(): boolean {
    return window.location.hostname.includes('youtube.com') || 
           window.location.hostname.includes('youtu.be');
  }

  /**
   * Check if we should process this video element
   */
  public static shouldProcessVideo(video: HTMLVideoElement): boolean {
    if (!this.isYouTube()) {
      return true; // Process all videos on non-YouTube sites
    }

    // On YouTube, only process if it's the main video player
    const isMainPlayer = video.closest('.html5-video-player') !== null;
    const isAd = video.closest('.ad-showing') !== null;
    const isPreview = video.closest('.ytp-inline-preview-mode') !== null;
    
    // Skip ads and previews
    if (isAd || isPreview) {
      return false;
    }

    return isMainPlayer;
  }

  /**
   * Get safe playback rate limits for the current site
   * Note: No special YouTube limits - YouTube can handle the same speeds as other sites
   */
  public static getSpeedLimits(): { min: number; max: number; silenceMax: number } {
    // Same limits for all sites - YouTube can handle these fine
    return {
      min: 0.25,
      max: 4.0,
      silenceMax: 16.0
    };
  }

  /**
   * Apply YouTube-specific workarounds
   */
  public static applyWorkarounds(video: HTMLVideoElement): void {
    if (!this.isYouTube()) return;
    // Mark parameter as used to satisfy linter (future hooks may use it)
    void video;

    // Don't modify playback rate property on YouTube
    // Let the extension work through the normal API
    console.log('[JumpCutter] YouTube detected, using conservative approach');
  }

  /**
   * Check if YouTube player is in a good state
   */
  public static isPlayerReady(video: HTMLVideoElement): boolean {
    if (!this.isYouTube()) return true;

    // Check if video has loaded enough
    if (video.readyState < 2) return false; // HAVE_CURRENT_DATA
    
    // Check if not in error state
    if (video.error) return false;
    
    // Check if duration is valid
    if (!isFinite(video.duration) || video.duration <= 0) return false;

    return true;
  }

  /**
   * Get adjusted settings for YouTube
   * Note: No longer applying YouTube-specific adjustments - use user's settings as-is
   */
  public static getAdjustedSettings(settings: any): any {
    // Return settings unchanged - no special YouTube adjustments needed
    return settings;
  }

  /**
   * Inject YouTube-specific CSS fixes
   */
  public static injectFixes(): void {
    if (!this.isYouTube()) return;

    const styleId = 'jumpcutter-youtube-fixes';
    if (document.getElementById(styleId)) return;

    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
      /* Ensure our panel stays above YouTube's player controls */
      #jumpcutter-control-panel {
        z-index: 2147483647 !important;
      }

      /* Adjust position when YouTube theater mode is active */
      .ytp-fullscreen #jumpcutter-control-panel {
        position: fixed !important;
      }

      /* Hide during YouTube ads */
      .ad-showing #jumpcutter-control-panel,
      .ad-interrupting #jumpcutter-control-panel {
        display: none !important;
      }
    `;
    document.head.appendChild(style);
  }

  /**
   * Clean up on video change
   */
  public static cleanup(video: HTMLVideoElement): void {
    if (!this.isYouTube()) return;

    // Reset playback rate to normal
    try {
      video.playbackRate = 1;
    } catch (e) {
      // Ignore errors
    }
  }
}
