#!/usr/bin/env node

const { chromium } = require('playwright');
const path = require('path');

async function launchTest() {
  const extensionPath = path.resolve(__dirname, '..', 'dist-chromium');
  
  console.log('🚀 Launching Chrome with Jump Cutter extension...');
  console.log('📁 Extension path:', extensionPath);
  console.log('');
  
  const context = await chromium.launchPersistentContext('', {
    headless: false,
    args: [
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`
    ],
    viewport: { width: 1280, height: 800 }
  });
  
  console.log('✅ Chrome launched!');
  console.log('');
  
  // Open demo page via HTTP server (required for extension to load)
  const demoPage = await context.newPage();
  await demoPage.goto('http://localhost:3003/demo.html');
  console.log('📺 Demo page opened (make sure to run: npx serve -s test-demo -l 3003)');
  
  // Open actual YouTube for testing
  const youtubePage = await context.newPage();
  await youtubePage.goto('https://www.youtube.com/watch?v=aqz-KE-bpKQ');
  console.log('🎬 YouTube video opened');
  
  console.log('');
  console.log('📝 TEST CHECKLIST:');
  console.log('================================');
  console.log('1. DRAG TEST: Try dragging the button - it should NOT expand');
  console.log('2. CLICK TEST: Click the button - it should expand/collapse');
  console.log('3. POPUP LABELS: Click extension icon - check for missing labels');
  console.log('4. OPTIONS PAGE: Open options - check all labels are visible');
  console.log('5. VIDEO TEST: Play video and check if silence skipping works');
  console.log('');
  console.log('Press Ctrl+C to close browser');
  
  await new Promise(() => {});
}

launchTest().catch(console.error);
