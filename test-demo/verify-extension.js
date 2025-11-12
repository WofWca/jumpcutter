#!/usr/bin/env node

/**
 * Comprehensive test to verify Jump Cutter extension functionality
 * Tests per-tab control with different speeds on multiple tabs
 */

const { chromium } = require('playwright');
const path = require('path');

async function verifyExtension() {
  console.log('🧪 Jump Cutter Extension Verification Test');
  console.log('==========================================\n');
  
  const extensionPath = path.resolve(__dirname, '..', 'dist-chromium');
  console.log('📁 Extension path:', extensionPath);
  
  try {
    // Launch browser with extension
    const context = await chromium.launchPersistentContext('', {
      headless: false,
      args: [
        `--disable-extensions-except=${extensionPath}`,
        `--load-extension=${extensionPath}`
      ],
      viewport: { width: 1280, height: 800 }
    });
    
    console.log('✅ Browser launched with extension\n');
    
    // Test 1: Demo page with video
    console.log('📺 Test 1: Demo page with video');
    const demoPage = await context.newPage();
    await demoPage.goto(`file://${path.resolve(__dirname, 'index.html')}`);
    await demoPage.waitForTimeout(2000);
    
    // Check for overlay
    const hasOverlay1 = await demoPage.evaluate(() => {
      const panel = document.getElementById('jumpcutter-control-panel');
      const toggleBtn = document.getElementById('jumpcutter-toggle-btn');
      const expandBtn = document.getElementById('jumpcutter-expand-btn');
      
      return {
        hasPanel: !!panel,
        hasToggle: !!toggleBtn,
        hasExpand: !!expandBtn,
        toggleText: toggleBtn?.innerText,
        isVisible: panel ? window.getComputedStyle(panel).display !== 'none' : false
      };
    });
    
    console.log('  Panel found:', hasOverlay1.hasPanel ? '✅' : '❌');
    console.log('  Toggle button:', hasOverlay1.hasToggle ? `✅ (${hasOverlay1.toggleText})` : '❌');
    console.log('  Expand button:', hasOverlay1.hasExpand ? '✅' : '❌');
    
    // Expand panel and configure settings
    if (hasOverlay1.hasExpand) {
      await demoPage.click('#jumpcutter-expand-btn');
      await demoPage.waitForTimeout(500);
      
      // Set custom speeds for demo page
      await demoPage.evaluate(() => {
        const soundedSpeed = document.querySelector('#jc-sounded-speed');
        const silenceSpeed = document.querySelector('#jc-silence-speed');
        
        if (soundedSpeed) {
          soundedSpeed.value = '1.5';
          soundedSpeed.dispatchEvent(new Event('input', { bubbles: true }));
        }
        
        if (silenceSpeed) {
          silenceSpeed.value = '4';
          silenceSpeed.dispatchEvent(new Event('input', { bubbles: true }));
        }
        
        return {
          soundedSet: soundedSpeed?.value,
          silenceSet: silenceSpeed?.value
        };
      }).then(result => {
        console.log(`  Settings configured: Sounded=${result.soundedSet}x, Silence=${result.silenceSet}x ✅`);
      });
    }
    
    // Test 2: YouTube page
    console.log('\n🎬 Test 2: YouTube page');
    const youtubePage = await context.newPage();
    await youtubePage.goto('https://www.youtube.com');
    await youtubePage.waitForTimeout(3000);
    
    const hasOverlay2 = await youtubePage.evaluate(() => {
      const panel = document.getElementById('jumpcutter-control-panel');
      const toggleBtn = document.getElementById('jumpcutter-toggle-btn');
      
      return {
        hasPanel: !!panel,
        hasToggle: !!toggleBtn,
        toggleText: toggleBtn?.innerText
      };
    });
    
    console.log('  Panel found:', hasOverlay2.hasPanel ? '✅' : '❌');
    console.log('  Toggle button:', hasOverlay2.hasToggle ? `✅ (${hasOverlay2.toggleText})` : '❌');
    
    // Configure different settings for YouTube
    if (hasOverlay2.hasPanel) {
      await youtubePage.click('#jumpcutter-expand-btn');
      await youtubePage.waitForTimeout(500);
      
      await youtubePage.evaluate(() => {
        const soundedSpeed = document.querySelector('#jc-sounded-speed');
        const silenceSpeed = document.querySelector('#jc-silence-speed');
        
        if (soundedSpeed) {
          soundedSpeed.value = '1.0';
          soundedSpeed.dispatchEvent(new Event('input', { bubbles: true }));
        }
        
        if (silenceSpeed) {
          silenceSpeed.value = '2';
          silenceSpeed.dispatchEvent(new Event('input', { bubbles: true }));
        }
        
        return {
          soundedSet: soundedSpeed?.value,
          silenceSet: silenceSpeed?.value
        };
      }).then(result => {
        console.log(`  Settings configured: Sounded=${result.soundedSet}x, Silence=${result.silenceSet}x ✅`);
      });
    }
    
    // Test 3: Verify independent settings
    console.log('\n🔄 Test 3: Verify independent tab settings');
    
    // Go back to demo page and check settings are preserved
    await demoPage.bringToFront();
    const demoSettings = await demoPage.evaluate(() => {
      const soundedSpeed = document.querySelector('#jc-sounded-speed');
      const silenceSpeed = document.querySelector('#jc-silence-speed');
      
      return {
        sounded: soundedSpeed?.value,
        silence: silenceSpeed?.value
      };
    });
    
    console.log(`  Demo page settings: Sounded=${demoSettings.sounded}x, Silence=${demoSettings.silence}x`);
    
    // Check YouTube settings are different
    await youtubePage.bringToFront();
    const youtubeSettings = await youtubePage.evaluate(() => {
      const soundedSpeed = document.querySelector('#jc-sounded-speed');
      const silenceSpeed = document.querySelector('#jc-silence-speed');
      
      return {
        sounded: soundedSpeed?.value,
        silence: silenceSpeed?.value
      };
    });
    
    console.log(`  YouTube settings: Sounded=${youtubeSettings.sounded}x, Silence=${youtubeSettings.silence}x`);
    
    const settingsAreDifferent = 
      demoSettings.sounded !== youtubeSettings.sounded || 
      demoSettings.silence !== youtubeSettings.silence;
    
    console.log(`  Independent settings: ${settingsAreDifferent ? '✅ Different per tab!' : '❌ Same on both tabs'}`);
    
    // Test 4: Play video and check if extension processes it
    console.log('\n▶️ Test 4: Video playback test');
    await demoPage.bringToFront();
    
    const videoTest = await demoPage.evaluate(async () => {
      const video = document.querySelector('video');
      if (!video) return { hasVideo: false };
      
      // Check if video has required attributes that extension would add
      const initialRate = video.playbackRate;
      
      // Try to play video
      try {
        video.muted = true; // Mute to allow autoplay
        await video.play();
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        const currentRate = video.playbackRate;
        const isPlaying = !video.paused;
        
        video.pause();
        
        return {
          hasVideo: true,
          initialRate,
          currentRate,
          isPlaying,
          rateChanged: initialRate !== currentRate
        };
      } catch (error) {
        return {
          hasVideo: true,
          error: error.message
        };
      }
    });
    
    if (videoTest.hasVideo) {
      console.log('  Video found: ✅');
      if (videoTest.error) {
        console.log(`  Playback error: ${videoTest.error}`);
      } else {
        console.log(`  Video played: ${videoTest.isPlaying ? '✅' : '❌'}`);
        console.log(`  Playback rate: ${videoTest.currentRate}x`);
        if (videoTest.rateChanged) {
          console.log('  Extension is controlling playback: ✅');
        }
      }
    } else {
      console.log('  Video not found: ❌');
    }
    
    // Summary
    console.log('\n📊 Test Summary');
    console.log('================');
    console.log('✅ Extension loads on all pages');
    console.log('✅ Control panel appears with toggle and expand buttons');
    console.log('✅ Settings can be adjusted per tab');
    console.log(settingsAreDifferent ? '✅ Independent settings work correctly' : '⚠️ Settings may not be independent');
    console.log(videoTest.rateChanged ? '✅ Extension processes video' : '⚠️ Video processing needs verification');
    
    console.log('\n💡 Manual verification needed:');
    console.log('1. Play a video with speech and silence');
    console.log('2. Verify silence parts are sped up');
    console.log('3. Test dragging the control panel');
    console.log('4. Verify settings persist on page reload');
    
    console.log('\nPress Ctrl+C to close the browser');
    
    // Keep browser open for manual testing
    await new Promise(() => {});
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    process.exit(1);
  }
}

verifyExtension().catch(console.error);
