export const audioContext = new AudioContext();

// Doing it the way it's suggested in https://stackoverflow.com/a/39725071/10406353
export const mediaElementSourcesMap: WeakMap<HTMLVideoElement, MediaElementAudioSourceNode> = new WeakMap();
