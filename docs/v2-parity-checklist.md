# Jump Cutter V2 Parity Checklist (Chrome-Only)

This checklist freezes the required behavior for the V2 rewrite and is used as a release gate.

## Core Runtime Parity

- [ ] Stretching controller behavior matches current production defaults.
- [ ] Cloning controller behavior matches current production defaults.
- [ ] Live streams (`duration === Infinity`) are auto-disabled when configured.
- [ ] Multiple media element pages select and control the intended active element.
- [ ] CORS-restricted media falls back gracefully and reports unsupported status.
- [ ] Non-settings actions (rewind/advance/pause/mute/volume) behave as before.

## UX/Settings Parity

- [ ] Popup supports the same setting controls (basic + advanced mode).
- [ ] Options page supports same setting fields and hotkeys table behavior.
- [ ] Local file player remains functional (`local-file-player/index.html`).
- [ ] Per-tab overrides continue to work (`perTab_<tabId>` legacy + v2 mirror).
- [ ] Badge/icon behavior remains consistent with enabled/controller/status states.

## Data/Migration Parity

- [ ] Legacy settings are preserved on update.
- [ ] Legacy per-tab overrides are preserved on update.
- [ ] V2 schema envelope is written once and migration is idempotent.
- [ ] Existing storage-driven startup behavior remains backward compatible.

## Release Gates

- [ ] `npm run lint` passes (warnings allowed, zero errors).
- [ ] `npm run typecheck` passes.
- [ ] `npm test` passes.
- [ ] `npm run build` produces a loadable extension in `dist/`.
- [ ] Manual smoke test completed on Chromium (popup, options, content flow).
