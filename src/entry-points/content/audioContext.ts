/**
 * @license
 * Copyright (C) 2020, 2021, 2022  WofWca <wofwca@protonmail.com>
 *
 * This file is part of Jump Cutter Browser Extension.
 *
 * Jump Cutter Browser Extension is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * Jump Cutter Browser Extension is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with Jump Cutter Browser Extension.  If not, see <https://www.gnu.org/licenses/>.
 */

import { getOrCreateMediaElementSourceAndUpdateMap } from './getOrCreateMediaElementSourceAndUpdateMap';

/** Keep processing only while the element plays, allowing delayed output to drain on pause. */
export function suspendAudioContextWhenPaused(
  element: HTMLMediaElement,
  audioContext: AudioContext,
  getSuspendDelay: () => number = () => 0,
): () => void {
  let timeoutId: number | undefined;
  const suspend = () => { audioContext.suspend(); };
  const onPause = () => {
    clearTimeout(timeoutId);
    const delay = getSuspendDelay();
    if (delay > 0) {
      timeoutId = window.setTimeout(suspend, delay * 1000);
    } else {
      suspend();
    }
  };
  const onPlay = () => {
    clearTimeout(timeoutId);
    audioContext.resume();
  };
  element.addEventListener('pause', onPause, { passive: true });
  element.addEventListener('play', onPlay, { passive: true });
  if (element.paused) {
    suspend();
  } else {
    onPlay();
  }
  return () => {
    clearTimeout(timeoutId);
    element.removeEventListener('pause', onPause);
    element.removeEventListener('play', onPlay);
  };
}

const stopSyncingPlayback = new WeakMap<HTMLMediaElement, () => void>();

/**
 * A media element stays routed through its context even after the controller is destroyed.
 * Keep following play/pause for that element's lifetime, including when Jump Cutter is disabled.
 * Separate contexts prevent pausing one element from silencing another.
 */
export function getOrCreatePlaybackAudioContext(
  element: HTMLMediaElement,
  getSuspendDelay?: () => number,
): [AudioContext, MediaElementAudioSourceNode] {
  const result = getOrCreateMediaElementSourceAndUpdateMap(
    element,
    () => new AudioContext({ latencyHint: 'playback' }),
  );
  stopSyncingPlayback.get(element)?.();
  stopSyncingPlayback.set(element,
    suspendAudioContextWhenPaused(element, result[0], getSuspendDelay));
  return result;
}
