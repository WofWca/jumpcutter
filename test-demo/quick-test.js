#!/usr/bin/env node

const { chromium } = require('playwright');
const path = require('path');

(async () => {
  console.log('🚀 Quick test of Jump Cutter extension...');
  
  const extensionPath = path.resolve('dist-chromium');
  
  const context = await chromium.launchPersistentContext('', {
    headless: false,
    args: [
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`
    ]
  });
  
  const page = await context.newPage();
  await page.goto('http://localhost:3002/manual-test.html');
  
  // Wait a bit for extension to load
  await page.waitForTimeout(2000);
  
  // Check for overlay
  const hasOverlay = await page.evaluate(() => {
    const button = document.getElementById('jumpcutter-toggle-btn');
    const container = document.getElementById('jumpcutter-per-tab-control');
    const styles = document.getElementById('jumpcutter-per-tab-styles');
    
    console.log('Checking for extension elements...');
    console.log('Button:', button);
    console.log('Container:', container);
    console.log('Styles:', styles);
    
    return {
      hasButton: !!button,
      hasContainer: !!container,
      hasStyles: !!styles,
      buttonText: button?.innerText,
      buttonTitle: button?.title
    };
  });
  
  console.log('Extension check results:', hasOverlay);
  
  if (hasOverlay.hasButton) {
    console.log('✅ Per-tab overlay button found!');
    console.log(`   Button shows: ${hasOverlay.buttonText}`);
    console.log(`   Tooltip: ${hasOverlay.buttonTitle}`);
  } else {
    console.log('❌ Per-tab overlay button NOT found');
    
    // Check console for errors
    const logs = await page.evaluate(() => {
      return window.consoleErrors || [];
    });
    
    if (logs.length > 0) {
      console.log('Console errors:', logs);
    }
  }
  
  console.log('\nKeeping browser open for manual inspection...');
  console.log('Press Ctrl+C to close');
  
  await new Promise(() => {});
})().catch(console.error);
