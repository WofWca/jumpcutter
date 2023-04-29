/**
 * @license
 * Copyright (C) 2020, 2021, 2022, 2023  WofWca <wofwca@protonmail.com>
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

import { requestIdleCallbackPolyfill } from './helpers';

/**
 * Watch the document and call `onNewElements` with the list of new elements every time they get
 * inserted in the document. When it is fist called, all the elements that are already
 * in the document will be passed to `onNewElements`.
 * The same element may be passed to `onNewElements` several times.
 * @param tagNames - if it is mutated, it will only affect future DOM changes, it won't
 * search for all the exisiting elements again.
 * @returns the `stopWatching` function, the destructor
 */
export default function watchAllElements<T extends keyof HTMLElementTagNameMap>(
  tagNames: Array<T>,
  onNewElements: (elements: Array<HTMLElementTagNameMap[T]>) => void,
): () => void {
  for (const tagName of tagNames) {
    const allElementsWThisTag = document.getElementsByTagName(tagName);
    if (allElementsWThisTag.length) {
      onNewElements([...allElementsWThisTag]);
    }
  }
  // Peeked at https://github.com/igrigorik/videospeed/blob/a25373f1d831fe06430c2e9e87dc1bd1aabd25b1/inject.js#L631
  function handleMutations(mutations: MutationRecord[]) {
    // TODO perf: reduce the amount of allocations. Although an average page shouldn't
    // have enough media elements for this to be a problem
    const newElements: Array<HTMLElementTagNameMap[T]> = [];
    for (const m of mutations) {
      if (m.type !== 'childList') {
        continue;
      }
      for (const node of m.addedNodes) {
        if (node.nodeType !== Node.ELEMENT_NODE) {
          continue;
        }
        // Keep in mind that the same element may get removed then added to the tree again. This is handled
        // inside `handleNewElements` (`this.handledElements.has(el)`).
        // Also the fact that we have an array of `addedNodes` in an array of mutations may mean (idk actually)
        // that we can have duplicate nodes in the array, which currently is fine thanks to
        // `this.handledElements.has(el)`.
        if ((tagNames as string[]).includes(node.nodeName)) {
          newElements.push(node as HTMLElementTagNameMap[typeof tagNames[number]]);
        } else {
          // TODO here https://developer.mozilla.org/en-US/docs/Web/API/Element/getElementsByTagName
          // it says "The returned list is live, which means it updates itself with the DOM tree
          // automatically". Does it mean that it would be better to somehow use the
          // `allElementsWThisTag` variable from a few lines above?
          // But here https://dom.spec.whatwg.org/#introduction-to-dom-ranges it says that upgdating
          // live ranges can be costly.
          for (const tagName of tagNames) {
            const childTargetElements = (node as HTMLElement).getElementsByTagName(tagName);
            if (childTargetElements.length) {
              newElements.push(...childTargetElements);
            }
          }
        }
      }
      // TODO should we also manually detach from removed nodes? If so, this is probably to be done in
      // `AllMediaElementsController.ts`. But currently it is made so that there's at most one Controller
      // (attached to just one element), so it's fine.
    }
    if (newElements.length) {
      onNewElements(newElements);
    }
  }
  const handleMutationsOnIdle =
    (mutations: MutationRecord[]) => requestIdleCallbackPolyfill(
      () => handleMutations(mutations),
      { timeout: 5000 },
    );
  const mutationObserver = new MutationObserver(handleMutationsOnIdle);
  mutationObserver.observe(document, {
    subtree: true,
    childList: true, // Again, why `subtree: true` is not enough here?
  });
  return () => mutationObserver.disconnect();
}
