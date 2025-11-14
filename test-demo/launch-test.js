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
  
  // Open YouTube video directly - no need for demo page
  const page = await context.newPage();
  await page.goto('https://www.youtube.com/watch?v=aqz-KE-bpKQ');
  console.log('\n🎬 YouTube video opened: Big Buck Bunny');
  
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
  console.log('Press Ctrl+C to close browser');
  
  await new Promise(() => {});
}

launchTest().catch(console.error);
