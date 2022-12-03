/**
 * @license
 * Copyright (C) 2022  WofWca <wofwca@protonmail.com>
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

export const lastPlaybackRateSetByThisExtensionMap =        new WeakMap<HTMLMediaElement, number>();
export const lastDefaultPlaybackRateSetByThisExtensionMap = new WeakMap<HTMLMediaElement, number>();
// const recentlySetPlaybackRateFor =        new WeakSet<HTMLMediaElement>();
// const recentlySetDefaultPlaybackRateFor = new WeakSet<HTMLMediaElement>();

/*
/**
 * Care to perform the `el.(default)playbackRate` assignment AFTER calling this because of
 * `el.addEventListener('ratechange'`. Well, it currently works either way, but IDK, browser
 * behavior may change. Wrapping it in `queueMicrotask` also works (at least for now).
 * /
function rememberChangeAndForgetAfterEventListenersWereExecuted(
  recentChangesMap:
    typeof recentPlaybackRateChangesCausedByUs
    | typeof recentDefaultPlaybackRateChangesCausedByUs,
  el: HTMLMediaElement,
  newVal: number
) {
  const maybeExistingArray = recentChangesMap.get(el);
  let array: number[];
  if (!maybeExistingArray) {
    array = [newVal];
    recentChangesMap.set(el, array)
  } else {
    array = maybeExistingArray;
    maybeExistingArray.push(newVal);
  }
  el.addEventListener(
    'ratechange',
    () => {
      // There may be multiple events in the same event cycle, so setTimeout to wait until they
      // all invoked their listeners.
      setTimeout(() => {
        array.splice(
          array.findIndex(storedVal => storedVal === newVal),
          1,
        )
      })
    },
    { once: true, passive: true }
  );
  // You may ask why don't we use `event.timeStamp` and `performance.now()` to record the changes
  // caused by us. That's because of reduced time precision:
  // https://developer.mozilla.org/en-US/docs/Web/API/Event/timeStamp#reduced_time_precision
  // We can't rely on it to accurately determine when the assignment was performed.
}
*/

// TODO how about write an ESLint rule that prohibits the use assignment to `playbackRate`
// so the devs don't forget to call these?

// TODO these are unnecessary when `!settings.updateSoundedSpeedWheneverItChangesOnWebsite`.

/**
 * This must be used instead of `el.playbackRate =`
 */
export function setPlaybackRateAndRememberIt(el: HTMLMediaElement, newVal: number) {
  /*
  TODO feat: use this for a feature where we BOTH prevent other scripts from changing the playback
  rate AND update soundedSpeed when the user does it. How to differentiate? Simple. Roll back
  every playback rate change that was perfrormed shortly after this extension changed playback rate.
  If playbackRate was changed long since this extension changed playback rate, then say that it's
  probably the user who did it (and they meant it), so, update `soundedSpeed`.

  // Need this check because performing the assignment when the value is the same
  // doesn't cause the 'ratechange' event to fire (at least in Chromium at least right now),
  // so cleanup wouldn't be peformed here:
  // https://github.com/WofWca/jumpcutter/blob/8b964227b8522631a56e00e34e9b414e0ad63d36/src/entry-points/content/playbackRateChangeTracking.ts#L45-L58
  // https://html.spec.whatwg.org/multipage/media.html#playing-the-media-resource:event-media-ratechange
  if (el.playbackRate !== newVal) {
    // Using a microtask because for our extension (at least for StretchingController (because it doesn't
    // use any lookahead)) it is critical to be as fast as possible when changing `playbackRate`.
    // Why not just put `el.playbackRate = ` as the first line? Because I'm afraid that
    // doing `addEventListener('ratechange')`
    // (inside `rememberChangeAndForgetAfterEventListenersWereExecuted`)
    // after `.playbackRate = ` may cause the listener to not get executed. If not now, maybe in
    // a future version of the spec. TODO perf?
    queueMicrotask(() => rememberChangeAndForgetAfterEventListenersWereExecuted(
      recentPlaybackRateChangesCausedByUs,
      el,
      newVal,
    ));
    el.playbackRate = newVal;
  }
  */

  el.playbackRate = newVal;
  lastPlaybackRateSetByThisExtensionMap.set(el, newVal);
}
/**
 * @see {@link setPlaybackRateAndRememberIt}
 */
export function setDefaultPlaybackRateAndRememberIt(el: HTMLMediaElement, newVal: number) {
  /*
  if (el.defaultPlaybackRate !== newVal) {
    queueMicrotask(() => rememberChangeAndForgetAfterEventListenersWereExecuted(
      recentDefaultPlaybackRateChangesCausedByUs,
      el,
      newVal,
    ));
    el.defaultPlaybackRate = newVal;
  }
  */

  el.defaultPlaybackRate = newVal;
  lastDefaultPlaybackRateSetByThisExtensionMap.set(el, newVal);
}

/**
 * @returns If `false` then it's 100% not caused by us (unless I'm stupid). If `true`,
 * it may be either.
 * /
export function mayRatechangeEventBeCausedByUs(event: Event): boolean {
  // Well, actually if there were several assignments to `playbackRate` in the same event cycle,
  // several 'ratechange' events will be fired, one of which may be caused by us, while another isn't.
  // But if the new `playbackRate` value is not among the values we assigned to it, it must mean that
  // at least one of them not caused by us, so let's return `true` in this case.
  // TODO Rename the function then? `mustIgnoreRatechangeEvent`?

  // TODO Idk if after `playbackRate` assignment the resulting `playbackRate`
  // is always equal to the value it was assigned, without any rounding / truncation / something else.
  // It appears to be of type `double`, and there's nothing about value transformation in the spec
  // so it should be:
  // https://html.spec.whatwg.org/multipage/media.html#media-elements

  const el = event.target as HTMLMediaElement;
  if (recentPlaybackRateChangesCausedByUs.get(el)?.includes(el.playbackRate)) {
    return true;
  }
  if (recentDefaultPlaybackRateChangesCausedByUs.get(el)?.includes(el.defaultPlaybackRate)) {
    return true;
  }
  return false;
}
*/
