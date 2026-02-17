import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright';

const EXTENSION_DIST_PATH = path.resolve('dist');
const MANIFEST_PATH = path.join(EXTENSION_DIST_PATH, 'manifest.json');
const SHOULD_RUN_EXTERNAL = process.env.E2E_EXTERNAL === '1';

const scriptCommon = `
  async function makeBlob({ durationMs = 2800, toneOn = true, mutedAtStart = false } = {}) {
    const canvas = document.createElement('canvas');
    canvas.width = 320; canvas.height = 180;
    const ctx = canvas.getContext('2d');
    let frame = 0;
    const draw = () => {
      ctx.fillStyle = frame % 2 ? '#333' : '#999';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#111';
      ctx.font = '24px sans-serif';
      ctx.fillText('frame ' + frame++, 20, 80);
      requestAnimationFrame(draw);
    };
    draw();

    const canvasStream = canvas.captureStream(24);
    const ac = new AudioContext();
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    const dest = ac.createMediaStreamDestination();
    osc.frequency.value = 440;
    osc.connect(gain).connect(dest);
    osc.start();
    if (toneOn) {
      gain.gain.setValueAtTime(mutedAtStart ? 0 : 0.8, ac.currentTime);
      gain.gain.setValueAtTime(0.8, ac.currentTime + 0.2);
      gain.gain.setValueAtTime(0.0, ac.currentTime + 1.0);
      gain.gain.setValueAtTime(0.8, ac.currentTime + 1.8);
      gain.gain.setValueAtTime(0.0, ac.currentTime + 2.4);
    } else {
      gain.gain.setValueAtTime(0, ac.currentTime);
    }

    const stream = new MediaStream([
      ...canvasStream.getVideoTracks(),
      ...dest.stream.getAudioTracks(),
    ]);
    const rec = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp8,opus' });
    const chunks = [];
    rec.ondataavailable = e => chunks.push(e.data);
    rec.start();
    await new Promise(r => setTimeout(r, durationMs));
    rec.stop();
    await new Promise(r => rec.onstop = r);
    osc.stop();
    ac.close();
    return new Blob(chunks, { type: 'video/webm' });
  }
`;

const SINGLE_PAGE_HTML = `<!doctype html><html><body>
  <button id="start">start</button>
  <video id="v" controls style="width:320px;height:180px"></video>
  <script>
    ${scriptCommon}
    document.querySelector('#start').addEventListener('click', async () => {
      const blob = await makeBlob({});
      const v = document.querySelector('#v');
      v.src = URL.createObjectURL(blob);
      await v.play();
      window.__jc_started = true;
    });
  </script>
</body></html>`;

const MULTI_PAGE_HTML = `<!doctype html><html><body>
  <button id="start">start</button>
  <div style="display:flex;gap:8px;">
    <video id="slides" controls muted style="width:240px;height:135px"></video>
    <video id="speaker" controls style="width:320px;height:180px"></video>
  </div>
  <script>
    ${scriptCommon}
    document.querySelector('#start').addEventListener('click', async () => {
      const [slidesBlob, speakerBlob] = await Promise.all([
        makeBlob({ toneOn: false }),
        makeBlob({ toneOn: true }),
      ]);
      const slides = document.querySelector('#slides');
      const speaker = document.querySelector('#speaker');
      slides.src = URL.createObjectURL(slidesBlob);
      speaker.src = URL.createObjectURL(speakerBlob);
      await slides.play();
      await speaker.play();
      window.__jc_started = true;
    });
  </script>
</body></html>`;

const SHADOW_PAGE_HTML = `<!doctype html><html><body>
  <button id="start">start</button>
  <reddit-ish-player id="player"></reddit-ish-player>
  <script>
    ${scriptCommon}
    class RedditIshPlayer extends HTMLElement {
      constructor() {
        super();
        const root = this.attachShadow({ mode: 'open' });
        const v = document.createElement('video');
        v.id = 'shadow-video';
        v.controls = true;
        v.style.width = '320px';
        v.style.height = '180px';
        root.appendChild(v);
      }
      async start() {
        const blob = await makeBlob({});
        const v = this.shadowRoot.querySelector('#shadow-video');
        v.src = URL.createObjectURL(blob);
        await v.play();
      }
    }
    customElements.define('reddit-ish-player', RedditIshPlayer);
    document.querySelector('#start').addEventListener('click', async () => {
      await document.querySelector('#player').start();
      window.__jc_started = true;
    });
  </script>
</body></html>`;

async function ensureBuildExists() {
  await fs.access(MANIFEST_PATH).catch(() => {
    throw new Error('dist/manifest.json is missing. Run `npm run build` first.');
  });
}

async function startLocalServer() {
  const server = http.createServer((req, res) => {
    const route = new URL(req.url || '/', 'http://localhost').pathname;
    const body =
      route === '/multi'
        ? MULTI_PAGE_HTML
        : route === '/shadow'
          ? SHADOW_PAGE_HTML
          : SINGLE_PAGE_HTML;
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(body);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Failed to resolve test server address');
  }
  const baseUrl = `http://127.0.0.1:${address.port}`;
  return {
    baseUrl,
    url: `${baseUrl}/single`,
    close: () => new Promise(resolve => server.close(resolve)),
  };
}

async function assertNoPageErrors(page, label) {
  const pageErrors = [];
  page.on('pageerror', err => pageErrors.push(err.message));
  await page.waitForTimeout(1200);
  assert.equal(pageErrors.length, 0, `${label} has page errors: ${pageErrors.join(' | ')}`);
}

async function readPlaybackRates(page, selector, samples = 20, delayMs = 200) {
  const rates = [];
  for (let i = 0; i < samples; i += 1) {
    rates.push(await page.$eval(selector, el => el.playbackRate));
    await page.waitForTimeout(delayMs);
  }
  return rates;
}

async function setGlobalSettings(optionsPage, values) {
  await optionsPage.evaluate(async (nextValues) => {
    await chrome.storage.local.set(nextValues);
  }, values);
}

async function waitForStarted(page) {
  await page.waitForFunction(() => window.__jc_started === true, { timeout: 20000 });
}

async function runExternalSmoke(context, optionsPage, url, label) {
  const page = await context.newPage();
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);
  await page.bringToFront();
  const reachable = await optionsPage.evaluate(async () => {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const tab = tabs[0];
    if (!tab?.id) {
      return false;
    }
    try {
      await chrome.tabs.sendMessage(tab.id, { type: 'checkContentStatus' });
      return true;
    } catch {
      return false;
    }
  });
  assert.equal(reachable, true, `${label} content script probe failed`);
}

async function run() {
  await ensureBuildExists();
  const server = await startLocalServer();
  const userDataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'jc-v2-e2e-'));
  let context;
  try {
    context = await chromium.launchPersistentContext(userDataDir, {
      channel: 'chromium',
      headless: true,
      args: [
        `--disable-extensions-except=${EXTENSION_DIST_PATH}`,
        `--load-extension=${EXTENSION_DIST_PATH}`,
      ],
    });

    let [serviceWorker] = context.serviceWorkers();
    if (!serviceWorker) {
      serviceWorker = await context.waitForEvent('serviceworker', { timeout: 10000 });
    }
    const extensionId = serviceWorker.url().split('/')[2];
    assert.ok(extensionId, 'Failed to detect extension ID');

    const popupPage = await context.newPage();
    await popupPage.goto(`chrome-extension://${extensionId}/popup/popup.html`, { waitUntil: 'load' });
    await assertNoPageErrors(popupPage, 'popup');

    const optionsPage = await context.newPage();
    await optionsPage.goto(`chrome-extension://${extensionId}/options/index.html`, { waitUntil: 'load' });
    await assertNoPageErrors(optionsPage, 'options');

    await setGlobalSettings(optionsPage, {
      enabled: true,
      applyTo: 'videoOnly',
      soundedSpeed: 1.75,
      previousSoundedSpeed: 1.75,
      silenceSpeedRaw: 3,
      previousSilenceSpeedRaw: 3,
      autoDisableForLiveStreams: false,
      dontAttachToCrossOriginMedia: false,
      omitMutedElements: false,
      onPlaybackRateChangeFromOtherScripts: 'updateSoundedSpeed',
    });
    await optionsPage.waitForTimeout(500);

    const singlePage = await context.newPage();
    await singlePage.goto(server.url, { waitUntil: 'domcontentloaded' });
    await singlePage.click('#start');
    await waitForStarted(singlePage);
    const enabledRates = await readPlaybackRates(singlePage, '#v');
    assert.ok(Math.max(...enabledRates) >= 1.5, 'single-video scenario failed to speed up playback');

    const multiPage = await context.newPage();
    await multiPage.goto(`${server.baseUrl}/multi`, { waitUntil: 'domcontentloaded' });
    await multiPage.click('#start');
    await waitForStarted(multiPage);
    const [slidesRate, speakerRate] = await Promise.all([
      multiPage.$eval('#slides', el => el.playbackRate),
      multiPage.$eval('#speaker', el => el.playbackRate),
    ]);
    assert.ok(speakerRate >= slidesRate, `multi-video arbitration failed: slides=${slidesRate}, speaker=${speakerRate}`);

    const shadowPage = await context.newPage();
    await shadowPage.goto(`${server.baseUrl}/shadow`, { waitUntil: 'domcontentloaded' });
    await shadowPage.click('#start');
    await waitForStarted(shadowPage);
    const shadowRates = [];
    for (let i = 0; i < 20; i += 1) {
      const shadowRate = await shadowPage.evaluate(() => {
        const player = document.querySelector('reddit-ish-player');
        const video = player?.shadowRoot?.querySelector('#shadow-video');
        return video?.playbackRate ?? 1;
      });
      shadowRates.push(shadowRate);
      await shadowPage.waitForTimeout(200);
    }
    assert.ok(
      Math.max(...shadowRates) >= 1.2,
      `shadow/custom-element detection failed, maxRate=${Math.max(...shadowRates)}`
    );

    const tabPageA = await context.newPage();
    const tabPageB = await context.newPage();
    await tabPageA.goto(`${server.baseUrl}/single?tab=a`, { waitUntil: 'domcontentloaded' });
    await tabPageB.goto(`${server.baseUrl}/single?tab=b`, { waitUntil: 'domcontentloaded' });
    await tabPageA.click('#start');
    await tabPageB.click('#start');
    await waitForStarted(tabPageA);
    await waitForStarted(tabPageB);
    await optionsPage.evaluate(async () => {
      const tabs = await chrome.tabs.query({});
      const a = tabs.find(t => t.url?.includes('tab=a'));
      const b = tabs.find(t => t.url?.includes('tab=b'));
      if (!a?.id || !b?.id) throw new Error('Could not resolve test tabs');
      await chrome.storage.local.set({
        v2_tabOverrides: {
          [String(a.id)]: { soundedSpeed: 2.4, enabled: true },
          [String(b.id)]: { soundedSpeed: 1.4, enabled: true },
        },
      });
      await chrome.tabs.sendMessage(a.id, { type: 'perTabOverridesChanged', overrides: { soundedSpeed: 2.4, enabled: true } });
      await chrome.tabs.sendMessage(b.id, { type: 'perTabOverridesChanged', overrides: { soundedSpeed: 1.4, enabled: true } });
    });
    await tabPageA.waitForTimeout(700);
    await tabPageB.waitForTimeout(700);
    const [rateA, rateB] = await Promise.all([
      tabPageA.$eval('#v', el => el.playbackRate),
      tabPageB.$eval('#v', el => el.playbackRate),
    ]);
    assert.ok(rateA > rateB, `per-tab override failed: rateA=${rateA}, rateB=${rateB}`);

    await setGlobalSettings(optionsPage, {
      enabled: true,
      soundedSpeed: 1.5,
      onPlaybackRateChangeFromOtherScripts: 'prevent',
    });
    await tabPageA.evaluate(() => {
      const v = document.querySelector('#v');
      v.playbackRate = 2.6;
    });
    await tabPageA.waitForTimeout(600);
    const preventedRate = await tabPageA.$eval('#v', el => el.playbackRate);
    assert.ok(preventedRate <= 1.55, `prevent mode failed, playbackRate=${preventedRate}`);

    await setGlobalSettings(optionsPage, {
      enabled: true,
      soundedSpeed: 1.5,
      onPlaybackRateChangeFromOtherScripts: 'updateSoundedSpeed',
    });
    await tabPageA.evaluate(() => {
      const v = document.querySelector('#v');
      v.playbackRate = 2.2;
    });
    await tabPageA.waitForTimeout(900);
    const updatedSoundedSpeed = await optionsPage.evaluate(async () => {
      const result = await chrome.storage.local.get('soundedSpeed');
      return result.soundedSpeed;
    });
    assert.ok(
      Math.abs(updatedSoundedSpeed - 2.2) < 0.15,
      `updateSoundedSpeed mode failed, soundedSpeed=${updatedSoundedSpeed}`
    );

    await setGlobalSettings(optionsPage, { enabled: false });
    await optionsPage.waitForTimeout(500);
    const disabledPage = await context.newPage();
    await disabledPage.goto(server.url, { waitUntil: 'domcontentloaded' });
    await disabledPage.click('#start');
    await waitForStarted(disabledPage);
    const disabledRates = await readPlaybackRates(disabledPage, '#v', 15, 200);
    assert.ok(Math.max(...disabledRates) <= 1.05, 'disabled scenario failed: playback still accelerated');

    if (SHOULD_RUN_EXTERNAL) {
      await setGlobalSettings(optionsPage, { enabled: true });
      await runExternalSmoke(context, optionsPage, 'https://www.youtube.com/watch?v=aqz-KE-bpKQ', 'YouTube');
      await runExternalSmoke(context, optionsPage, 'https://www.reddit.com/', 'Reddit');
    } else {
      console.log('External smoke skipped (set E2E_EXTERNAL=1 to include YouTube/Reddit checks)');
    }

    console.log('Headless extension suite passed');
    console.log(`Enabled single max playbackRate: ${Math.max(...enabledRates)}`);
    console.log(`Per-tab rates: A=${rateA}, B=${rateB}`);
    console.log(`Prevent mode rate: ${preventedRate}`);
    console.log(`Updated soundedSpeed: ${updatedSoundedSpeed}`);
    console.log(`Disabled max playbackRate: ${Math.max(...disabledRates)}`);
  } finally {
    if (context) {
      await context.close();
    }
    await fs.rm(userDataDir, { recursive: true, force: true });
    await server.close();
  }
}

run().catch(error => {
  console.error(error);
  process.exit(1);
});
