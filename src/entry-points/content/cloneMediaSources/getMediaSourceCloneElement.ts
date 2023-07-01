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

import type {
  GlobalThisWithBridgeElement,
} from '@/entry-points/content/cloneMediaSources/main-for-extension-world';
import {
  BRIDGE_ELEMENT_ID_AND_PROP_NAME,
  GET_CLONE_REQUEST_EVENT_NAME,
  GET_CLONE_RESPONSE_EVENT_NAME,
} from '@/entry-points/content/cloneMediaSources/constants';

const bridgeElement =
  (globalThis as GlobalThisWithBridgeElement)[BRIDGE_ELEMENT_ID_AND_PROP_NAME];

export async function getMediaSourceCloneElement(
  originalEl: HTMLMediaElement
): Promise<HTMLAudioElement | undefined> {
return new Promise(r_ => {
  // `Math.random()` is good enough to avoid collisions, since events are handled within
  // a couple of event cycles.
  const requestId = Math.random();

  // Keep in mind that we receive these events from the page's context.
  // They can be website-generated, or manipulated. Treat them as potentially malicious.
  const listener = (e_: Event) => {
    // `unknown` because the website may create such events as well, so we need to be careful.
    if (!(e_ instanceof CustomEvent)) {
      if (IS_DEV_MODE) {
        // Not sure if this is possible.
        console.warn("Received event, but it's not CustomEvent");
      }
      return;
    }
    const e: CustomEvent<unknown> = e_;

    // TODO handle error response. Perhaps retry in a while, and fail after
    // some time.

    const requestIdFromResponse = (
      e.detail
      && typeof e.detail === 'object'
      && 'requestId' in e.detail
      && e.detail.requestId
    );
    if (requestIdFromResponse !== requestId) {
      return;
    }
    const cloneEl = e.target;
    if (!(cloneEl instanceof HTMLMediaElement)) {
      // TODO maybe re-request after a `setTimeout`.
      scheduleResolvePromiseAndRemoveListener(undefined);
      return;
    }
    cloneEl.remove();
    scheduleResolvePromiseAndRemoveListener(cloneEl);
  };

  const scheduleResolvePromiseAndRemoveListener = (...resolveParams: Parameters<typeof r_>) => {
    // Why `setTimeout`? It's a workaround for
    // https://html.spec.whatwg.org/multipage/media.html#playing-the-media-resource
    // > When a media element is removed from a Document, the user agent must run the following
    // > steps
    // > 1. Await a stable state ...
    // > 2. If the media element is in a document, return.
    // > 3. Run the internal pause steps for the media element.
    // So, the problem is, we `.remove()` the element in this function, and then if another
    // piece of code tries to `play()` the element shortly after, it gets paused because of that.
    // An issue about this:
    // https://github.com/whatwg/html/issues/9467
    setTimeout(r_, 0, ...resolveParams);

    bridgeElement.removeEventListener(GET_CLONE_RESPONSE_EVENT_NAME, listener);
  }

  bridgeElement.addEventListener(
    GET_CLONE_RESPONSE_EVENT_NAME,
    listener,
    { passive: true }
  );

  const detail = {
    requestId,
  };
  originalEl.dispatchEvent(new CustomEvent(GET_CLONE_REQUEST_EVENT_NAME, {
    bubbles: true,
    // Need `cloneInto` so that in Gecko the receiving script can access `detail`:
    // https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Sharing_objects_with_page_scripts#cloneinto
    // TODO refactor: the fact that it's not in Chromium and Gecko means that it's fragile, IDK.
    detail: typeof cloneInto !== 'undefined'
      ? cloneInto(detail, window)
      : detail
  }));

  // Maybe also add a timeout?
});
}

declare const cloneInto: undefined | (<T>(data: T, into: typeof window) => T);
