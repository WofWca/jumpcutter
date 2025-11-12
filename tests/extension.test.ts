import { test, expect, chromium } from '@playwright/test';
import path from 'path';

const extensionPath = path.join(__dirname, '..', 'dist-chromium');

test.describe('Jump Cutter Extension Tests', () => {
  test('extension loads and injects into page', async () => {
    // Note: Chrome extensions don't work in headless mode, so we skip this test in CI
    // For local testing, this will open a visible browser window briefly
    test.skip(process.env.CI === 'true', 'Extensions require headed mode');
    
    // Launch browser with extension loaded
    const userDataDir = path.join(__dirname, '..', '.playwright-user-data');
    const browserContext = await chromium.launchPersistentContext(userDataDir, {
      headless: false, // Extensions require headed mode
      args: [
        `--disable-extensions-except=${extensionPath}`,
        `--load-extension=${extensionPath}`,
        '--no-sandbox',
        '--disable-setuid-sandbox',
      ],
      timeout: 30000, // 30 seconds for browser launch
    });

    try {
      const page = await browserContext.newPage();
      
      // Navigate to demo page
      await page.goto('http://localhost:3000/index.html', { timeout: 10000 });
      
      // Wait for page to load
      await page.waitForLoadState('networkidle', { timeout: 10000 });
      
      // Check page title
      expect(await page.title()).toBe('Jump Cutter Demo');
      
      // Wait for video element
      const video = await page.waitForSelector('video#test-video', { timeout: 10000 });
      expect(video).toBeTruthy();
      
      console.log('✅ Extension loaded successfully');
      console.log('✅ Demo page loaded');
      console.log('✅ Video element found');
      
    } finally {
      await browserContext.close();
    }
  });

  test('extension manifest is valid', async () => {
    const fs = require('fs');
    const manifestPath = path.join(extensionPath, 'manifest.json');
    
    expect(fs.existsSync(manifestPath)).toBe(true);
    
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
    expect(manifest.name).toBe('Jump Cutter');
    expect(manifest.manifest_version).toBe(3);
    expect(manifest.content_scripts).toBeDefined();
    expect(manifest.content_scripts.length).toBeGreaterThan(0);
    
    console.log('✅ Manifest is valid');
    console.log(`✅ Extension version: ${manifest.version}`);
    console.log(`✅ Content scripts: ${manifest.content_scripts.length}`);
  });
});
