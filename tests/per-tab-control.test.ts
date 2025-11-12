import { test, expect, chromium } from '@playwright/test';
import path from 'path';

const extensionPath = path.join(__dirname, '..', 'dist-chromium');

test.describe('Per-Tab Control Tests', () => {
  test('per-tab overlay appears and functions correctly', async () => {
    test.skip(process.env.CI === 'true', 'Extensions require headed mode');
    
    const userDataDir = path.join(__dirname, '..', '.playwright-user-data-pertab');
    const browserContext = await chromium.launchPersistentContext(userDataDir, {
      headless: false,
      args: [
        `--disable-extensions-except=${extensionPath}`,
        `--load-extension=${extensionPath}`,
        '--no-sandbox',
        '--disable-setuid-sandbox',
      ],
      timeout: 30000,
    });

    try {
      // Test on demo page
      const page = await browserContext.newPage();
      await page.goto('http://localhost:3001', { timeout: 10000 });
      await page.waitForLoadState('networkidle', { timeout: 10000 });
      
      // Check for overlay button
      const overlayButton = await page.waitForSelector('#jumpcutter-toggle-btn', { 
        timeout: 5000,
        state: 'visible' 
      });
      expect(overlayButton).toBeTruthy();
      console.log('✅ Overlay button found on demo page');
      
      // Get initial button state
      const initialText = await overlayButton.innerText();
      expect(['🚀', '⏸️']).toContain(initialText);
      console.log(`✅ Initial button state: ${initialText}`);
      
      // Test toggle functionality
      await overlayButton.click();
      await page.waitForTimeout(500); // Wait for state change
      
      const toggledText = await overlayButton.innerText();
      expect(toggledText).not.toBe(initialText);
      console.log(`✅ Button toggled to: ${toggledText}`);
      
      // Test drag functionality
      const box = await overlayButton.boundingBox();
      if (box) {
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await page.mouse.down();
        await page.mouse.move(box.x + 100, box.y + 100);
        await page.mouse.up();
        console.log('✅ Button drag tested');
      }
      
      // Test on YouTube
      const youtubePage = await browserContext.newPage();
      await youtubePage.goto('https://www.youtube.com', { timeout: 15000 });
      await youtubePage.waitForLoadState('networkidle', { timeout: 10000 });
      
      const youtubeOverlay = await youtubePage.waitForSelector('#jumpcutter-toggle-btn', {
        timeout: 5000,
        state: 'visible'
      });
      expect(youtubeOverlay).toBeTruthy();
      console.log('✅ Overlay button found on YouTube');
      
      // Test that settings are independent per tab
      const youtubeButtonText = await youtubeOverlay.innerText();
      console.log(`✅ YouTube button state: ${youtubeButtonText}`);
      
      // Toggle YouTube button
      await youtubeOverlay.click();
      await youtubePage.waitForTimeout(500);
      const youtubeToggledText = await youtubeOverlay.innerText();
      expect(youtubeToggledText).not.toBe(youtubeButtonText);
      console.log(`✅ YouTube button toggled to: ${youtubeToggledText}`);
      
      // Go back to demo page and verify its state hasn't changed
      await page.bringToFront();
      const demoButtonFinalText = await overlayButton.innerText();
      expect(demoButtonFinalText).toBe(toggledText);
      console.log('✅ Demo page button state preserved independently');
      
      console.log('\n🎉 All per-tab control tests passed!');
      
    } finally {
      await browserContext.close();
    }
  });
});
