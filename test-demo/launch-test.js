#!/usr/bin/env node

const { spawn } = require('child_process');
const path = require('path');
const os = require('os');
const fs = require('fs');

async function launchTest() {
  const extensionPath = path.resolve(__dirname, '..', 'dist-chromium');
  const userDataDir = path.join(os.tmpdir(), 'jc-test-' + Date.now());
  fs.mkdirSync(userDataDir, { recursive: true });
  
  // Find Playwright's Chromium (allows --load-extension unlike Google Chrome)
  const playwrightCache = path.join(os.homedir(), 'Library/Caches/ms-playwright');
  const chromiumDirs = fs.readdirSync(playwrightCache)
    .filter(d => d.startsWith('chromium-'))
    .sort()
    .reverse();
  
  if (chromiumDirs.length === 0) {
    console.error('❌ Playwright Chromium not found. Run: npx playwright install chromium');
    process.exit(1);
  }
  
  const chromiumPath = path.join(
    playwrightCache, 
    chromiumDirs[0], 
    'chrome-mac/Chromium.app/Contents/MacOS/Chromium'
  );
  
  console.log('🚀 Launching Chromium with Jump Cutter extension...');
  console.log('📁 Extension:', extensionPath);
  console.log('📂 Profile:', userDataDir);
  console.log('🌐 Browser:', chromiumPath);
  console.log('');
  
  const args = [
    `--user-data-dir=${userDataDir}`,
    `--disable-extensions-except=${extensionPath}`,
    `--load-extension=${extensionPath}`,
    '--no-first-run',
    'https://www.youtube.com/watch?v=HtSuA80QTyo'
  ];
  
  spawn(chromiumPath, args, { stdio: 'inherit', detached: true });
  
  console.log('✅ Chromium launched!');
  console.log('');
  console.log('🎬 YouTube MIT Lecture opened');
  
  console.log('');
  console.log('📝 TEST CHECKLIST:');
  console.log('================================');
  console.log('1. TAB BUTTON: Look for purple tab on right edge of page');
  console.log('2. DRAG TAB: Drag the tab up/down using the dots (⋮)');
  console.log('3. CLICK TAB: Click tab to show/hide control panel');
  console.log('4. PLAY VIDEO: Start the video and watch for silence skipping');
  console.log('5. DISABLE: Click Disable button - video should play normally');
  console.log('6. SEEK TEST: While disabled, try seeking - should work without errors');
  console.log('');
  console.log('Close browser manually when done.');
}

launchTest().catch(console.error);
