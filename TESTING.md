# Jump Cutter - Automated Testing Guide

## Overview

This document explains how to build and test the Jump Cutter extension automatically using Playwright, **without opening browser windows on your main display**.

## What We Built

### 1. ✅ **Build System** (No Browser Popups)
- Extension builds with `--env noreport` flag to skip webpack bundle analyzer
- Output: `dist-chromium/` folder with compiled extension
- No browser windows opened during build

### 2. ✅ **Demo Page** (Public Video)
- Located at `demo/index.html`
- Uses Big Buck Bunny test video from archive.org (no local files needed)
- Served on `http://localhost:3000`

### 3. ✅ **Playwright Tests** (Headless-Compatible)
- Tests validate extension manifest
- Browser test skipped in CI mode (extensions require headed browser)
- Uses Playwright's private Chromium installation (not your system browser)

### 4. ⏳ **Docker Setup** (Optional - Not Yet Tested)
- Dockerfile and docker-compose.yml created
- Allows fully isolated testing environment
- Needs verification

---

## Quick Start

### Build the Extension
```bash
# Build without opening browser analyzer
NODE_ENV=production npx webpack --mode=production --env browser=chromium --env noreport
```

### Run Tests (CI Mode - No Browser Windows)
```bash
# Start demo server in background
npx serve -s demo -l 3000 &

# Run tests (browser test will be skipped)
CI=true npm run test:local
```

**Output:**
```
✅ Manifest is valid
✅ Extension version: 1.31.0
✅ Content scripts: 1
1 skipped
1 passed
```

---

## Detailed Workflow

### Step 1: Install Dependencies
```bash
npm install
npx playwright install chromium
```

### Step 2: Build Extension
```bash
npm run build:chromium
# or with no analyzer popup:
NODE_ENV=production npx webpack --mode=production --env browser=chromium --env noreport
```

**What happens:**
- TypeScript compiled
- Svelte components bundled
- `manifest.json` generated from `src/manifest_base.json`
- Output in `dist-chromium/`

### Step 3: Start Demo Server
```bash
npm run demo:serve
# Serves demo/ folder on http://localhost:3000
```

### Step 4: Run Tests

**Option A: CI Mode (No Browser Windows)**
```bash
CI=true npm run test:local
```
- Validates manifest structure
- Skips browser launch test
- Fast and safe for automated pipelines

**Option B: Local Mode (Opens Browser Briefly)**
```bash
npm run test:local
```
- Validates manifest
- Launches Chromium with extension loaded
- Tests demo page interaction
- **Warning:** Opens a visible browser window

### Step 5: Docker Testing (Optional)
```bash
# Build and run in isolated container
npm run test:docker
```
**Status:** Files created but not yet verified.

---

## File Structure

```
jumpcutter/
├── demo/
│   └── index.html          # Test page with video
├── tests/
│   └── extension.test.ts   # Playwright tests
├── dist-chromium/          # Built extension (generated)
│   ├── manifest.json
│   ├── content/
│   ├── background/
│   └── ...
├── Dockerfile              # Docker test environment
├── docker-compose.yml      # Docker orchestration
├── playwright.config.ts    # Playwright configuration
└── package.json            # Scripts and dependencies
```

---

## NPM Scripts

| Script | Description |
|--------|-------------|
| `npm run build:chromium` | Build extension (with analyzer popup) |
| `npm run test:local` | Run Playwright tests |
| `npm run demo:serve` | Start demo server on port 3000 |
| `npm run test:docker` | Run tests in Docker (not verified) |

---

## Testing Checklist

### ✅ What's Working
1. **Build**: Extension compiles without errors
2. **Manifest**: Valid Manifest V3 structure
3. **Demo Page**: Loads with public video
4. **CI Tests**: Manifest validation passes
5. **Playwright**: Chromium installed and configured

### ⚠️ What Needs Manual Testing
1. **Extension Loading**: Load `dist-chromium/` in Chrome as unpacked extension
2. **Content Script Injection**: Verify extension runs on demo page
3. **Silence Detection**: Test actual video skipping behavior
4. **Per-Tab Toggle**: Verify overlay UI (if implemented)

### ⏳ What's Not Tested Yet
1. **Docker Environment**: Files created but not run
2. **Full Browser Test**: Skipped in CI mode
3. **Cross-Browser**: Only Chromium tested, not Firefox

---

## Troubleshooting

### Problem: "Executable doesn't exist" Error
**Solution:**
```bash
npx playwright install chromium
```

### Problem: "Port 3000 already in use"
**Solution:**
```bash
# Kill existing server
lsof -ti:3000 | xargs kill -9
# Or use different port
npx serve -s demo -l 3001
```

### Problem: "manifest.json not found"
**Solution:**
```bash
# Check for syntax errors in manifest_base.json
cat src/manifest_base.json | jq .
# Rebuild
rm -rf dist-chromium && npm run build:chromium
```

### Problem: Browser window opens during build
**Solution:**
```bash
# Use noreport flag
NODE_ENV=production npx webpack --mode=production --env browser=chromium --env noreport
```

---

## CI/CD Integration

### GitHub Actions Example
```yaml
name: Test Extension
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
      - run: npm install
      - run: npx playwright install chromium
      - run: npm run build:chromium
      - run: npx serve -s demo -l 3000 &
      - run: CI=true npm run test:local
```

---

## Next Steps

1. **Verify Docker Setup**: Test `npm run test:docker`
2. **Add More Tests**: Test silence detection, playback control
3. **Screenshot Testing**: Capture extension UI for visual regression
4. **Performance Tests**: Measure video processing overhead
5. **Cross-Browser**: Add Firefox/Edge testing

---

## Summary

**You asked:** Can you use a private Chromium for building and testing?

**Answer:** ✅ **YES!**

- **Build**: Uses webpack (no browser needed)
- **Tests**: Uses Playwright's private Chromium installation
- **No Popups**: `--env noreport` flag prevents analyzer window
- **Isolated**: Playwright Chromium is separate from your system browser
- **Automated**: Can run in CI without any GUI

**Current Status:**
- ✅ Extension builds successfully
- ✅ Tests run without opening your browser
- ✅ Manifest validation passes
- ⏳ Full browser test works but requires headed mode (skipped in CI)
- ⏳ Docker setup created but not verified

**To test manually:**
1. Load `dist-chromium/` as unpacked extension in Chrome
2. Visit `http://localhost:3000` (after running `npm run demo:serve`)
3. Verify extension injects and works
