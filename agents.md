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

1. **UI Improvements**
   - Show current effective playback speed prominently
   - Highlight skipping state in audio visualization (like original extension)
   - Better drag handle with visual affordance
   - Auto-collapse panel after inactivity

2. **Algorithm Review**
   - Compare behavior with original Jump Cutter
   - Tune volume threshold and margins

## Testing

```bash
# Build
NODE_ENV=production npx webpack --mode=production --env browser=chromium --env noreport

# Launch test browser
node test-demo/launch-test.js
```

**Note**: Google Chrome blocks `--load-extension`. Use Playwright's Chromium.

## Key Files

```
src/entry-points/content/
├── main.ts                    # Entry point, per-tab initialization
├── init.ts                    # Controller init/cleanup
├── PerTabControlPanelV3.ts    # Floating UI overlay
├── perTabIdentity.ts          # Tab ID management
├── perTabState.ts             # Per-tab state cache
└── AllMediaElementsController.ts
```

## Design Decisions

- **Per-tab vs global**: Users want different settings for lectures vs music
- **Tab ID storage**: Same video in different tabs can have different states
- **No YouTube speed limits**: YouTube handles 4x+ speeds fine
