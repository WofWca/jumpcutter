export function destroyAudioWorkletNode(node: AudioWorkletNode): void {
  node.port.postMessage('destroy');
  node.port.close();
}
