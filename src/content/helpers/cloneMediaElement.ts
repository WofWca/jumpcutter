export function cloneMediaElement(original: HTMLMediaElement): HTMLAudioElement {
  const clone = document.createElement('audio');
  // TODO this probably doesn't cover all cases. Maybe it's better to just `originalElement.cloneNode(true)`?
  // TODO also need to watch for changes of `crossOrigin` (in `CloningController.ts`).
  clone.crossOrigin = original.crossOrigin;
  clone.src = original.currentSrc;
  return clone;
}
