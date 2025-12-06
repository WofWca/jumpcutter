# Per-Tab Control Feature

## Overview

This document describes the per-tab control feature added to Jump Cutter, which allows users to enable/disable the extension on a per-tab basis with a floating UI overlay.

## Current Status (v1.31.0-pertab)

### What Works
- ✅ **Per-tab toggle**: Each tab has independent enable/disable state
- ✅ **Floating UI overlay**: Purple tab on right edge with expandable control panel
- ✅ **Silence skipping**: Core functionality works on YouTube and other video sites
- ✅ **Seeking**: Works correctly (requires Playwright's Chromium, not Google Chrome)
- ✅ **State persistence**: Per-tab state saved to extension storage using tab ID

### Known Issues / TODO
1. **UI needs improvement**:
   - Show current effective playback speed clearly
   - Highlight skipping state in audio visualization (like original extension)
   - Make the tab more obviously draggable with a proper handle
   - Auto-collapse panel when not in use

2. **Algorithm tuning**:
   - Silence detection may need adjustment for different content types
   - Investigate if skipping behavior matches original extension

## Architecture

### Key Files

```
src/entry-points/content/
├── main.ts                    # Entry point, handles per-tab initialization
├── init.ts                    # Controller initialization and cleanup
├── PerTabControlPanelV3.ts    # Floating UI overlay component
├── perTabIdentity.ts          # Tab ID management for storage keys
├── perTabState.ts             # Per-tab state cache
├── YouTubeCompat.ts           # YouTube-specific compatibility (minimal now)
└── AllMediaElementsController.ts  # Core media element management
```

### How Per-Tab Works

1. **Tab Identity**: Each tab gets a unique ID from the background script (`perTabIdentity.ts`)
2. **Storage Keys**: State is stored with keys like `perTabEnabled_tab123`, `perTabPanel_tab123`
3. **Initialization**: When per-tab is enabled, the controller initializes; when disabled, it's destroyed
4. **UI**: Floating overlay shows enable/disable toggle and audio visualization

### Testing

```bash
# Build the extension
NODE_ENV=production npx webpack --mode=production --env browser=chromium --env noreport

# Launch test browser (uses Playwright's Chromium which supports extension loading)
node test-demo/launch-test.js
```

**Important**: Google Chrome blocks `--load-extension` flag. Use Playwright's Chromium for automated testing.

## Design Decisions

### Why Per-Tab Instead of Global?
- Users often want Jump Cutter on lectures but not on music videos
- Per-tab control gives fine-grained control without affecting other tabs
- State persists per tab ID, not URL (so same video in different tabs can have different states)

### Why Playwright's Chromium?
- Google Chrome blocks `--load-extension` and `--disable-extensions-except` flags for security
- Playwright's Chromium build allows these flags
- Seeking works correctly in Playwright's Chromium (earlier issues were due to Playwright API, not the browser)

### YouTube Compatibility
- Removed artificial speed limits (YouTube handles 4x+ speeds fine)
- Settings are passed through unchanged (no YouTube-specific adjustments)
- Only skip ads and preview videos, process main player normally

## Next Steps

1. **UI Improvements** (Priority: High)
   - Display current speed prominently
   - Color-code visualization based on silence/sounded state
   - Add proper drag handle with visual affordance
   - Auto-collapse after inactivity

2. **Algorithm Review** (Priority: Medium)
   - Compare behavior with original Jump Cutter
   - Tune volume threshold and margins for better detection

3. **Testing** (Priority: Medium)
   - Add automated tests for per-tab state management
   - Test on various video platforms beyond YouTube
