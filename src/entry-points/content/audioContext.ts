export const audioContext = new AudioContext({
  latencyHint: 'playback',
});

// Doing it the way it's suggested in https://stackoverflow.com/a/39725071/10406353
export const mediaElementSourcesMap: WeakMap<HTMLMediaElement, MediaElementAudioSourceNode> = new WeakMap();

export function getOrCreateMediaElementSourceAndUpdateMap(element: HTMLMediaElement): MediaElementAudioSourceNode {
  const srcFromMap = mediaElementSourcesMap.get(element);
  let mediaElementSource: MediaElementAudioSourceNode;
  if (srcFromMap) {
    mediaElementSource = srcFromMap;
    mediaElementSource.disconnect();
  } else {
    mediaElementSource = audioContext.createMediaElementSource(element);
    mediaElementSourcesMap.set(element, mediaElementSource)
  }
  return mediaElementSource;
}
