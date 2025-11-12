#!/usr/bin/env node

const { chromium } = require('playwright');
const path = require('path');

(async () => {
  console.log('🚀 Launching browser with Jump Cutter extension...');
  
  const extensionPath = path.resolve('dist-chromium');
  console.log('Extension path:', extensionPath);
  
  // Launch browser with extension
  const context = await chromium.launchPersistentContext('', {
    headless: false,
    args: [
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`,
      '--no-sandbox',
      '--disable-setuid-sandbox'
    ],
    viewport: { width: 1280, height: 800 }
  });
  
  console.log('✅ Browser launched with extension loaded');
  
  // Open demo page
  const page = await context.newPage();
  await page.goto('http://localhost:3001');
  console.log('✅ Demo page opened');
  
  // Also open YouTube for testing
  const youtubePage = await context.newPage();
  await youtubePage.goto('https://www.youtube.com');
  console.log('✅ YouTube page opened');
  
  console.log('\n📝 Test Instructions:');
  console.log('1. Look for the 🚀 button in the top-right corner of both tabs');
  console.log('2. The button is draggable - try moving it around');
  console.log('3. Click the button to toggle Jump Cutter on/off for each tab');
  console.log('4. When enabled: 🚀 (purple gradient)');
  console.log('5. When disabled: ⏸️ (gray gradient)');
  console.log('6. Play videos to test silence skipping when enabled');
  console.log('7. Settings are saved per-tab and persist across reloads');
  console.log('\nPress Ctrl+C to close the browser when done testing');
  
  // Keep browser open
  await new Promise(() => {});
})().catch(console.error);
