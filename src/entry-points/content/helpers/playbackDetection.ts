// The following code is not very reliable (but reliable enough, perhaps). E.g. playback can stop for reasons other than
// 'pause' or 'waiting' events: https://html.spec.whatwg.org/multipage/media.html#event-media-waiting.
// But tbh I have no idea what 'paused for in-band content' means. Why isn't there a dedicated getter/event for this?
// Am I just missing something? TODO.

/** @return a function that removes the listener */
export function addPlaybackStopListener(el: HTMLMediaElement, listener: () => void): () => void {
  const eventNames = [
    'pause',
    'waiting', // Example - seek to a part that has not yet been loaded.
    'emptied', // Example - on YouTube, open any video, enter something in the search bar and press enter.
  ] as const;
  for (const eventName of eventNames) {
    el.addEventListener(eventName, listener, { passive: true });
  }
  return () => {
    for (const eventName of eventNames) {
      el.removeEventListener(eventName, listener);
    }
  }
}
/** @return a function that removes the listener */
export function addPlaybackResumeListener(el: HTMLMediaElement, listener: () => void): () => void {
  // See the spec: https://html.spec.whatwg.org/multipage/media.html#event-media-playing. Compared to the 'waiting',
  // this one is also fired when '...paused is newly false...', so we don't need the 'play' event.
  el.addEventListener('playing', listener, { passive: true });

  return () => {
    el.removeEventListener('playing', listener);
  }
}
export function isPlaybackActive(el: HTMLMediaElement): boolean {
  // I wrote this looking at https://html.spec.whatwg.org/multipage/media.html#event-media-playing
  return !el.seeking && el.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA && !el.paused;
}
