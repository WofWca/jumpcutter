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
   */
  public static getSpeedLimits(): { min: number; max: number; silenceMax: number } {
    if (this.isYouTube()) {
      // YouTube has strict limits on playback rate
      return {
        min: 0.25,
        max: 2.0,  // YouTube's max is 2x
        silenceMax: 2.0  // Don't exceed 2x for silence
      };
    }

    // Other sites can handle higher speeds
    return {
      min: 0.25,
      max: 4.0,
      silenceMax: 8.0
    };
  }

  /**
   * Apply YouTube-specific workarounds
   */
  public static applyWorkarounds(video: HTMLVideoElement): void {
    if (!this.isYouTube()) return;

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
   */
  public static getAdjustedSettings(settings: any): any {
    if (!this.isYouTube()) return settings;

    const limits = this.getSpeedLimits();
    
    return {
      ...settings,
      soundedSpeed: Math.min(settings.soundedSpeed || 1, limits.max),
      silenceSpeedRaw: Math.min(settings.silenceSpeedRaw || 2, limits.silenceMax),
      // Increase margin to avoid cutting off speech on YouTube
      marginBefore: Math.max(settings.marginBefore || 0.1, 0.15),
      marginAfter: Math.max(settings.marginAfter || 0.1, 0.15),
      // Less aggressive volume threshold for YouTube
      volumeThreshold: Math.max(settings.volumeThreshold || 0.05, 0.08)
    };
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
