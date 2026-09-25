// Run with: node tests/audio-context.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

let nextTimer = 0;
const timers = new Map();
const contexts = [];
class AudioContext {
  state = 'running';
  destination = {};
  constructor() { contexts.push(this); }
  suspend() { this.state = 'suspended'; return Promise.resolve(); }
  resume() { this.state = 'running'; return Promise.resolve(); }
  createMediaElementSource() {
    assert.equal(this.source, undefined, 'a media element must not be attached twice');
    return this.source = { disconnect() {} };
  }
}
const sandbox = vm.createContext({
  AudioContext,
  clearTimeout: id => timers.delete(id),
  window: { setTimeout: (callback, delay) => {
    timers.set(++nextTimer, { callback, delay });
    return nextTimer;
  } },
});
const cache = new Map();
function load(filename) {
  if (cache.has(filename)) return cache.get(filename);
  const exports = {};
  cache.set(filename, exports);
  const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2021 },
  }).outputText;
  const run = vm.runInContext(`(function(exports, require) { ${code}\n})`, sandbox);
  run(exports, name => load(path.resolve(path.dirname(filename), name + '.ts')));
  return exports;
}
class Media extends EventTarget {
  paused = true;
  play() { this.paused = false; this.dispatchEvent(new Event('play')); }
  pause() { this.paused = true; this.dispatchEvent(new Event('pause')); }
}
const { getOrCreatePlaybackAudioContext: get, suspendAudioContextWhenPaused: sync } = load(
  path.resolve(__dirname, '../src/entry-points/content/audioContext.ts'));
assert.equal(contexts.length, 0, 'importing controllers must not open an audio device');
const first = new Media();
const [a, source] = get(first, () => 0.5);
assert.equal(a.state, 'suspended', 'enabling on paused media must not keep audio running');
first.play();
assert.equal(a.state, 'running');
first.pause();
assert.equal(a.state, 'running', 'let delayed output drain');
assert.equal([...timers.values()][0].delay, 500);
first.play();
assert.equal(timers.size, 0, 'resume must cancel a pending suspend');
first.pause();
for (const { callback } of timers.values()) callback();
timers.clear();
assert.equal(a.state, 'suspended');

const second = new Media();
second.play();
const [b] = get(second);
assert.equal(b.state, 'running', 'attaching to playing media must resume');
assert.notEqual(a, b);
first.play();
first.pause();
for (const { callback } of timers.values()) callback();
timers.clear();
assert.equal(b.state, 'running', 'pausing another element must not mute this one');
second.pause();
assert.equal(b.state, 'suspended');

first.play();
first.pause();
const [reused, reusedSource] = get(first); // Controller destroyed: restore direct playback.
assert.equal(reused, a);
assert.equal(reusedSource, source);
assert.equal(timers.size, 0, 'controller teardown cancels its output-tail timer');
assert.equal(a.state, 'suspended');
first.play();
assert.equal(a.state, 'running', 'playback still works after disabling the extension');
first.pause();
assert.equal(a.state, 'suspended');
assert.equal(timers.size, 0, 'old delayed-pause listeners must be removed');

const chart = new AudioContext();
const stop = sync(first, chart);
assert.equal(chart.state, 'suspended');
first.play();
assert.equal(chart.state, 'running');
first.pause();
assert.equal(chart.state, 'suspended');
stop();
chart.state = 'closed';
first.play();
first.pause();
assert.equal(chart.state, 'closed', 'destroyed chart contexts must not resume');
console.log('Audio context lifecycle checks passed');
