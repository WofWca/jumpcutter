# Jump Cutter - Agent Status

## Current Version
`v1.31.0-pertab` (tagged)

## Active Feature: Per-Tab Control

### What Works
- ✅ Per-tab enable/disable toggle (independent state per browser tab)
- ✅ Floating purple tab UI on right edge with expandable panel
- ✅ Silence skipping on YouTube and other video sites
- ✅ Seeking works (using Playwright's Chromium)
- ✅ State persistence using tab ID

### TODO (Priority Order)

1. **UI Improvements** (compare with original Jump Cutter)
   - Show current effective playback speed prominently
   - Highlight skipping state in audio visualization
   - Better drag handle with visual affordance
   - Auto-collapse panel after inactivity

2. **Algorithm Review**
   - Compare behavior with original Jump Cutter
   - Tune volume threshold and margins

## Testing

```bash
# Build
NODE_ENV=production npx webpack --mode=production --env browser=chromium --env noreport

# Launch test browser (uses Playwright's Chromium binary directly)
node test-demo/launch-test.js
```

**Note**: Google Chrome blocks `--load-extension`. Use Playwright's Chromium.

## Files We Added/Modified

### New Files (our additions)
```
src/entry-points/content/
├── PerTabControlPanelV3.ts    # Floating UI overlay (727 lines)
├── perTabIdentity.ts          # Tab ID management via background script
├── perTabState.ts             # Per-tab state cache
├── YouTubeCompat.ts           # YouTube compatibility (minimal now)

src/entry-points/background/
└── main.ts                    # Added tab ID messaging handler

test-demo/
├── launch-test.js             # Launches Playwright Chromium with extension
├── index.html                 # Simple test page

Root:
├── agents.md                  # This file (active status)
├── PROGRESS-LOG.md            # Development history
```

### Modified Files (from upstream)
```
src/entry-points/content/
├── main.ts                    # Per-tab initialization logic
├── init.ts                    # Controller destroy function
├── AllMediaElementsController.ts  # Minor additions

src/settings/
├── enabledSettingDefaultValue.ts  # Changed default to false
```

## Design Decisions

- **Per-tab vs global**: Users want different settings for lectures vs music
- **Tab ID storage**: Same video in different tabs can have different states
- **No YouTube speed limits**: YouTube handles 4x+ speeds fine
- **Playwright Chromium**: Google Chrome blocks extension loading flags
