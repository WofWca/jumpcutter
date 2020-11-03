// https://bugs.chromium.org/p/chromium/issues/detail?id=921354. Once it's resolved, worklets can inherit from
// AudioWorkletProcessor. You can check out this commit's changes to see what to revert. TODO.
export default class WorkaroundAudioWorkletProcessor extends AudioWorkletProcessor {
  keepAlive: boolean;
  constructor(...args: ConstructorParameters<typeof AudioWorkletProcessor>) {
    super(...args);
    this.keepAlive = true;
    this.port.onmessage = e => {
      if (e.data === 'destroy') {
        this.keepAlive = false;
      }
    }
  }
}
