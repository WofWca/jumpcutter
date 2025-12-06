# Jumpcutter Extension – Progress Log

This is a timestamped, sequential record of key actions and state. Times are local to the machine (UTC-05:00).

---

## 2025-11-11 13:10

- Initial goal clarified: per-tab behavior with small on-page GUI overlay; automated tests in isolated browser (Playwright); Dockerized workflow later.

## 2025-11-11 13:25–13:40

- Fixed package.json corruption and duplicate scripts; migrated yarn scripts to npm.
- Corrected TypeScript/ESLint blocking error in `defaultSettings.ts` (missing brace).
- Fixed imports in `content/main.ts` and reverted accidental overlay edits.

## 2025-11-11 13:45

- Build succeeded using: `NODE_ENV=production webpack --mode=production --env browser=chromium --env noreport` (no analyzer popup).
- Verified `dist-chromium/` generated.

## 2025-11-11 13:55

- Added demo page `demo/index.html` with public Big Buck Bunny video.
- Added Playwright test scaffold and config to load unpacked extension.

## 2025-11-11 14:10

- Installed Playwright Chromium (`npx playwright install chromium`).
- First test run revealed missing `manifest.json` in dist due to `src/manifest_base.json` syntax (`],,`).
- Fixed manifest_base.json; rebuild OK; `dist-chromium/manifest.json` present.

## 2025-11-11 14:20

- Playwright test: added CI-friendly path; manifest validation test passes; browser interaction test skipped in CI mode.
- Created `TESTING.md` with step-by-step instructions, CI example, troubleshooting.

## 2025-11-11 22:10

- Error: “Default locale specified but _locales missing.”
- Added minimal locale: `src/_locales/en/messages.json` and confirmed CopyPlugin config.
- Rebuilt; now `dist-chromium/_locales/en/messages.json` is present.

## 2025-11-11 22:13

- Verified build artifacts:
  - `dist-chromium/manifest.json` – OK
  - `dist-chromium/_locales/en/messages.json` – OK
  - `dist-chromium/{content,background,icons,...}` – OK

## 2025-11-11 22:15

- Playwright local headed test can launch but may reuse session and open incorrect page; adjusted to use a dedicated `userDataDir` and increased launch timeout.
- CI run (`CI=true`) skips headed test and validates manifest successfully.

---

# Current State (as of 2025-11-11 22:16)

- Build: PASS (Chromium) with `--env noreport`.
- Artifacts: `dist-chromium/` contains manifest and locales.
- Demo server: `npm run demo:serve` serves http://localhost:3000.
- Tests:
  - Manifest validation: PASS (CI-friendly).
  - Headed extension-load test: implemented; can run locally; CI-skipped.
- Docs: `TESTING.md` present with full workflow.
- Docker: files exist; not yet verified.

## 2025-11-12 09:46

- Fixed missing labels in popup/options UI by adding complete messages.json translations
- Implemented expandable/collapsible control panel (PerTabControlPanel.ts) replacing simple toggle
- Panel features: draggable, per-tab settings, direct control of speeds/thresholds
- Fixed TypeScript errors with settings API usage

## 2025-11-12 14:39

- Reorganized project structure:
  - Moved all test/demo files to `test-demo/` directory
  - Cleaned up root directory clutter
  - Docker files present but not actively used (for CI/CD containerized testing)
- Created comprehensive verification test (`verify-extension.js`)
- Extension features confirmed:
  - ✅ Loads on all pages with control panel
  - ✅ Expandable panel with full controls
  - ✅ Per-tab independent settings
  - ✅ Draggable interface
  - ⚠️ Video processing needs manual verification

# Current State (as of 2025-11-12 14:40)

- Build: PASS with improved control panel
- UI: Fixed all missing labels, modern dark theme panel
- Features:
  - Per-tab control panel with expand/collapse
  - Direct adjustment of key settings
  - Independent settings per tab
  - Persistent state across reloads
- Test files organized in `test-demo/` directory
- Ready for local commit

# Next Steps

1. Manual verification of silence skipping on actual videos
2. Commit changes locally to preserve progress
3. Further testing with various video sources
4. Consider enabling Docker tests for CI/CD

## 2025-11-17 10:40–14:00

- Added `PerTabControlPanelV3` overlay with draggable tab, mini-visualizer, and inline controls for sounded/silence speed, thresholds, and algorithm toggle. State stored under `perTabPanel_<url>` plus mirrored boolean cache `perTabEnabled_<url>`. UI defined in `src/entry-points/content/PerTabControlPanelV3.ts`.
- Reworked `content/main.ts` to bootstrap the overlay, mirror per-tab toggle changes into `localStorage` + `storage.local`, and gate controller startup on `globalEnabled && perTabEnabled`.
- Added direct `localStorage` guard (`isPerTabDisabledSync`) inside `AllMediaElementsController` and `ElementPlaybackControllerCloning` so scheduling logic skips when per-tab toggle reads `false`.
- Build + Playwright launch automated via `test-demo/launch-test.js` to reproduce silence-skipping behavior quickly in a clean Chromium profile.

## 2025-12-01 13:30

- Changed `enabledSettingDefaultValue` to `false` so the extension ships globally disabled and each tab starts in an opt-in state.
- Updated per-tab panel to default to disabled when no saved state exists, preventing automatic controller startup on first load.
- Documented outstanding issues around controller teardown, visualization behavior, and YouTube seek interference when per-tab UI shows “disabled”.

# Current State (as of 2025-12-01 13:40)

- Build: PASS via `NODE_ENV=production npx webpack --mode=production --env browser=chromium --env noreport`.
- Per-tab UI: Overlay renders with draggable tab, visualization, and controls; defaults to disabled unless the user explicitly enables the tab or saved state exists.
- Global toggle: Now functions as “new tabs enabled by default” and defaults to off.
- Testing: `test-demo/launch-test.js` launches a clean Chromium instance with the packed extension for manual verification.
- Known issues:
  1. Controller teardown is incomplete—tabs that were previously enabled can keep reacting to `timeupdate`/`seeking` even after the per-tab toggle is set to disabled.
  2. Visualization continues to animate regardless of per-tab state, implying work even when disabled.
  3. YouTube seeks can still trigger 403/network errors while Jump Cutter scripts are loaded, even when per-tab toggles appear “off”.
  4. Per-tab state is currently keyed by sanitized URL only, so multiple tabs with the same video may inherit or fight over state.

# Next Steps (updated)

1. Ensure per-tab disable truly tears down controllers and prevents future initialization until re-enabled.
2. Tie visualization/telemetry to per-tab state so “disabled” tabs show no activity.
3. Investigate YouTube seek interference by tracing when `importAndInit()` runs and adding structured logging with per-tab IDs.
4. Revisit per-tab state storage (consider tab-specific IDs instead of URL-only cache) to avoid cross-tab leakage.
