/**
 * @license
 * Copyright (C) 2023  WofWca <wofwca@protonmail.com>
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

import { createCloneElementWithSameSrc } from "./createCloneElementWithSameSrc";
import { sourceMayBeMediaSource } from "./sourceMayBeMediaSource";

export async function getFinalCloneElement(
  originalElement: HTMLMediaElement,
  getFallbackCloneElement:
    undefined | ((originalElement: HTMLMediaElement) => Promise<HTMLAudioElement | undefined>),
): Promise<
  [
    element: HTMLAudioElement,
    isFallbackElement: boolean,
  ]
> {
  // Keep in mind that `canPlayCurrentSrc` can fail due to a network error, e.g. the internet
  // suddenly getting cut off.
  // Be careful to call `canPlayCurrentSrc` _synchronously_ (see `createCloneElementWithSameSrc`
  // docstring).
  const sameSourceClone = createCloneElementWithSameSrc(originalElement);
  if (await canPlayCurrentSrc(sameSourceClone)) {
    return [sameSourceClone, false];
  }
  /** Whether we expect our extension to have created a fallback element. */
  const fallbackElementIsSupposedToExist =
    getFallbackCloneElement
    // You might ask "what about `MediaSourceHandle`? Aren't we supposed to have a clone
    // in this case?". Well, better check the `../cloneMediaSources` folder for the answer.
    // Search for `MediaSourceHandle`.
    && sourceMayBeMediaSource(originalElement);
  // You might ask "why don't we try to `getFallbackCloneElement` unconditionally at this point?
  // If there is one, let's use it". The answer is that we get the fallback element from the page's
  // world's scripts which we don't really trust, while `sourceMayBeMediaSource` is fully under
  // our control.
  // But then, the page might still make the original element use `MediaSource`, and forge
  // the fallback element the way it likes, so maybe there isn't really a point to this check,
  // maybe it only adds a point of failure for no good reason.
  // Not only that, making this check here IMO adds unnecessary code coupling.
  // So, TODO refactor: reconsider the necessity `sourceMayBeMediaSource` check.
  if (fallbackElementIsSupposedToExist) {
    const fallbackCloneElement = await getFallbackCloneElement(originalElement);
    if (fallbackCloneElement) {
      return [fallbackCloneElement, true];
    }
  } else {
    if (IS_DEV_MODE) {
      if (await getFallbackCloneElement?.(originalElement)) {
        console.warn('Expected no fallback element to exist, but it actually does.'
          + ' Is the pre-condition check outdated, or did the website\'s script make one itself?');
      }
    }
  }
  // No fallback element, the only option is to return `sameSourceClone`
  // (that we can't play, as we've checked above).
  // Maybe we'll be able to play it later for some reason idk.
  return [sameSourceClone, false];
}

/**
 * This must be called _synchronously_ after the source has been assigned to `element`, otherwise
 * it may not work (I did not test in which cases it doesn't work, I'm just writing the contract).
 * Has side-effects that affect the `element`, e.g. it changes its `muted` state, and tries
 * to play it back for a moment.
 * Until the returned `Promise` resolves, no operations must be performed on the element.
 * Changing the source of the element before the returned promise is resolved is undefined behavior.
 */
async function canPlayCurrentSrc(element: HTMLMediaElement): Promise<boolean> {
return new Promise(r_ => {
  // TODO perf: goddamn it. If the element becomes otherwise unreachable from other code,
  // this one might still keep references to it because of event listeners that might be waiting
  // forever, which is a memory leak.

  // To recap:
  // * attempting to play a `MediaSource` will [most likely](https://github.com/WofWca/jumpcutter/issues/2#issuecomment-1571654947)
  // fail.
  // * For `Blob` (including `File`) it's gonna work (I think?).
  // * Not sure about `MediaStream`, but either way, I think our extension is not
  //   applicable to streams.
  // * `MediaSource`, `Blob`, `MediaStream` can be used either as `srcObject` or
  //   `src = URL.createObjectURL(object)`

  const originaMuted = element.muted;
  const onCanplay = () => resolveAndCleanUp(true);
  const onError = () => resolveAndCleanUp(false);
  const resolveAndCleanUp = (isCanPlay: boolean) => {
    r_(isCanPlay);
    element.pause();
    element.muted = originaMuted;
    element.removeEventListener('error', onError);
    element.removeEventListener('canplay', onCanplay);
  };

  // I'm not sure if `HAVE_CURRENT_DATA` guarantees that we can play it, so let's go with
  // `HAVE_FUTURE_DATA` to be safe.
  // The spec says https://html.spec.whatwg.org/multipage/media.html#media-data-processing-steps-list
  // > This indicates that the resource is usable. The user agent must follow these substeps
  if (element.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA) {
    resolveAndCleanUp(true);
    return;
  }
  // https://html.spec.whatwg.org/multipage/media.html#event-media-canplay
  // > readyState newly increased to HAVE_FUTURE_DATA or greater.
  element.addEventListener('canplay', onCanplay, { once: true, passive: true });
  // TODO refactor: use the observer pattern here to `removeEventListener`, like with
  // `_destroyedPromise` in other files?

  if (element.error) {
    // TODO maybe we should handle `error.code`, e.g. there is `MEDIA_ERR_NETWORK`.
    // (same for `onError`).
    resolveAndCleanUp(false);
    return;
  }
  element.addEventListener('error', onError, { once: true, passive: true });

  // Make sure that the browser actually does the steps necessary to determine if the media is
  // playable. Although I believe it does it anyway unless `element.preload` is changed, and maybe
  // we can detect whether we need to play based on values of `readyState` and `networkState`.
  // But let's play it safe for now.
  element.muted = true;
  element.play();
});
}
