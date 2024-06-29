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

import { browserOrChrome } from '@/webextensions-api-browser-or-chrome';
import { BRIDGE_ELEMENT_ID_AND_PROP_NAME } from './constants';

sendBridgeElement();

// In Manifest V2 there is no direct way to execute a script in the page's
// [world](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/scripting/ExecutionWorld)
// , hence this helper script that does it.
// The approach is taken from:
// https://stackoverflow.com/questions/9515704/access-variables-and-functions-defined-in-page-context-using-a-content-script
//
// TODO fix: _this_ script runs at `document_start` (see `manifest.json`), but I'm not sure whether
// the script we inject below also runs before other scripts. Manifest V3 with its
// `content_scripts.world` should fix it.
const scriptEl = document.createElement('script');
scriptEl.src = browserOrChrome.runtime.getURL('content/cloneMediaSources-for-page-world.js');
// TODO perf: consider adding `defer`, `async`, etc.
scriptEl.onload = () => scriptEl.remove();
// Wait, is it legal to inject scripts as direct children of `<html>` (in case `document.head` is
// `undefined`? Appears to work, idk.
(document.head || document.documentElement).prepend(scriptEl);

/**
 * Since we can't directly pass objects such as `HTMLElement`s and `MediaSource`s using events
 * and messages between worlds (see
 * - https://stackoverflow.com/questions/9515704/access-variables-and-functions-defined-in-page-context-using-a-content-script/19312198#19312198
 * - https://developer.chrome.com/docs/extensions/mv3/content_scripts/#host-page-communication
 * - https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Sharing_objects_with_page_scripts
 *
 * ), let's create a dummy element that both this world's script and the extension world's script
 * can get a reference to through DOM, and use it like a message channel.
 * Why not just use `document.body` for this purpose? To avoid side effects as much as possible.
 *
 * The page's world's script is supposed to remove the element from the DOM as soon as it gets
 * a reference to it, see {@link receiveBridgeElement}.
 */
function sendBridgeElement(): void {
  const el = document.createElement('div');
  el.id = BRIDGE_ELEMENT_ID_AND_PROP_NAME;
  (document.body || document.documentElement).append(el);

  // This is so other scripts of this (the extension's) world (not the page's world)
  // can get a reference to it as well. This does nothing to the page's world.
  (globalThis as GlobalThisWithBridgeElement)[BRIDGE_ELEMENT_ID_AND_PROP_NAME] = el;

  if (IS_DEV_MODE) {
    console.log(
      "Bridge element appended to document and set on `globalThis`",
      document.getElementById(BRIDGE_ELEMENT_ID_AND_PROP_NAME),
      (globalThis as GlobalThisWithBridgeElement)[BRIDGE_ELEMENT_ID_AND_PROP_NAME],
    );
  }
}

export type GlobalThisWithBridgeElement = typeof globalThis & {
  [BRIDGE_ELEMENT_ID_AND_PROP_NAME]: HTMLDivElement;
};
