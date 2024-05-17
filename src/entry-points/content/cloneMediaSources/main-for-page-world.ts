/**
 * @license
 * Copyright (C) 2023  WofWca <wofwca@protonmail.com>
 * Copyright (C) 2023  Jonas Herzig <me@johni0702.de>
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

import {
  BRIDGE_ELEMENT_ID_AND_PROP_NAME,
  GET_CLONE_REQUEST_EVENT_NAME,
  GET_CLONE_RESPONSE_EVENT_NAME
} from "./constants";
import { startCloningMediaSources } from "./lib";

/**
 * This script is executed in the environment (world) of the web page, unlike regular
 * extension scripts (see ./main-for-extension-world.ts).
 * Be careful not to introduce security vulnerabilities.
 * - https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/scripting/ExecutionWorld
 * - https://developer.chrome.com/docs/extensions/reference/scripting/#type-ExecutionWorld
 * Why do we need to execute in this world? Because its relies on modifying built-in objects,
 * which is something that world isolation is supposed to prevent:
 * - https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Content_scripts#content_script_environment
 * - https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Sharing_objects_with_page_scripts
 *
 * This script is needed to support the `ElementPlaybackControllerCloning` for `HTMLMediaElement`s
 * that use `MediaSource` (either with `el.src = URL.createObjectURL(mediaSource)` or
 * `el.srcObject = mediaSource`).
 * For such elements, we can't simply do `cloneEl.src = originalEl.src` since the clone
 * element would be unable to playback the media. See https://github.com/WofWca/jumpcutter/issues/2
 * TODO refactor: might need to support this claim with a link to a part of the spec.
 *
 * What we do instead is create a new `MediaSource` for each `MediaSource` that is created
 * by the website and replicate all of the changes made to the original one to our clone.
 * The resulting clone `MediaSource` can be used as the source for the clone `HTMLMediaElement`
 * in `ElementPlaybackControllerCloning`.
 *
 * Therefore this script also needs to get executed before the page's script interacts with
 * the APIs that we modify here.
 */

const bridgeElement = receiveBridgeElement();

const [
  getCloneElement,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  stopCloningMediaSources,
] = startCloningMediaSources();


// Keep in mind that the website itself (or other extensions) can also dispatch such an event.
// TODO perf: `removeEventListener` when appropriate (when the extension is disabled, idk).
document.addEventListener(GET_CLONE_REQUEST_EVENT_NAME, async e_ => {
  if (!(e_ instanceof CustomEvent)) {
    if (IS_DEV_MODE) {
      console.warn('Not a CustomEvent');
    }
    return;
  }

  const e: CustomEvent<unknown> = e_;
  const requestId = (
    e.detail
    && typeof e.detail === 'object'
    && 'requestId' in e.detail
    && e.detail.requestId
  );

  if (!requestId) {
    if (IS_DEV_MODE) {
      console.warn('No `requestId` in a request event');
    }
    return;
  }

  // FYI we could use a different channel for error responses.
  const sendGetCloneErrorResponse = () => sendGetCloneResponse(bridgeElement, { requestId });
  // TODO fix: the extension might request a clone for an element that is not actually
  // in the document tree, so this event won't get caught.
  // Such elements can still play audio:
  // https://html.spec.whatwg.org/multipage/media.html#playing-the-media-resource
  // > Media elements that are potentially playing while not in a document must
  // > not play any video, but should play any audio component
  // therefore they still are a valid target for us. Thought websites are rarely made this way.
  const originalEl = e.target;

  if (!(originalEl instanceof HTMLMediaElement)) {
    console.warn('Requested a clone for an element that is not an HTMLMediaElement');
    sendGetCloneErrorResponse();
    return;
  }

  const cloneEl = getCloneElement(originalEl);
  if (!cloneEl) {
    sendGetCloneErrorResponse();
    return;
  }

  // Keep in mind that the original element's source might change before our response is
  // received.

  // The receiver will remove the clone element from the bridge element.
  bridgeElement.appendChild(cloneEl);
  sendGetCloneResponse(cloneEl, { requestId });
}, { passive: true });

/**
 * @see {@link sendBridgeElement}
 */
function receiveBridgeElement(): HTMLDivElement {
  const el = document.getElementById(BRIDGE_ELEMENT_ID_AND_PROP_NAME) as HTMLDivElement;
  el.id = ''; // No need for it anymore.
  el.remove();
  return el;
}

function sendGetCloneResponse(
  targetElement: HTMLMediaElement | typeof bridgeElement,
  detail: { requestId: number | unknown } & Record<string, unknown>,
) {
  targetElement.dispatchEvent(new CustomEvent(GET_CLONE_RESPONSE_EVENT_NAME, {
    bubbles: true, // The event shall be received on the bridgeElement.
    detail,
  }));
}
