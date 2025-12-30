# Jump Cutter - Agent Status

## Current Version
`v1.31.0-pertab` (feature branch: `feature/extension-per-page`)

## Active Feature: Per-Tab Control

### What Works
- ✅ Per-tab enable/disable toggle (independent state per browser tab)
- ✅ Per-tab settings (each tab can have different speed/threshold settings)
- ✅ Svelte-based floating pill UI with reactive state management
- ✅ Silence skipping on YouTube and other video sites
- ✅ Seeking works (using Playwright's Chromium)
- ✅ State persistence using tab ID

### Floating Pill UI (Svelte Component)
- **Single click** to toggle on/off
- **Hover** to reveal gear button (⚙)
- **Gear button** opens settings panel
- **Visual feedback**: Green glow when active, gray when inactive
- **Draggable anywhere** on screen
- **Edge docking**: Snaps to left/right edge when released nearby (half-hidden)
- **Scroll wheel**: Adjust skip aggressiveness (skip more/less)
- **Speed display**: Shows current sounded speed when active

### Settings Panel (gear button to open)
- Sounded Speed (0.5x - 3x)
- Silence Speed (1x - 8x)
- Volume Threshold
- Algorithm toggle (stretching vs cloning)
- "More Options" button to open full options page

### Per-Tab Storage
- `floatingPill_tab_{tabId}` - enabled state, position, docking
- `tabSettings_{tabId}` - per-tab speed/threshold settings

### Ready for PR
Feature branch pushed to origin. Ready for pull request to upstream.

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
├── FloatingPill.ts            # Minimal draggable toggle pill (~350 lines)
├── PerTabControlPanelV3.ts    # OLD: Expandable panel (deprecated)
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
