/**
 * @license
 * Copyright (C) 2020, 2021, 2022, 2023, 2024, 2025, 2026  WofWca <wofwca@protonmail.com>
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

import { requestIdleCallbackPolyfill } from "./helpers";

type HTMLElementTagNameMapUppercase = {
  [P in Uppercase<
    keyof HTMLElementTagNameMap
  >]: HTMLElementTagNameMap[Lowercase<P>];
};

/**
 * Watch the document and call `onNewElements` with the list of new elements every time they get
 * inserted in the document. When it is fist called, all the elements that are already
 * in the document will be passed to `onNewElements`.
 * The same element may be passed to `onNewElements` several times.
 * If it is mutated, it will only affect future DOM changes, it won't
 * search for all the exisiting elements again.
 */
export default class ElementsWatcher<
  T extends keyof HTMLElementTagNameMapUppercase,
> {
  private _tagNames: Array<T>;
  private _onNewElements: (
    elements: Array<HTMLElementTagNameMapUppercase[T]>,
  ) => void;
  private _searchInShadowRoot: boolean;
  private _observers: MutationObserver[];

  /**
   *
   * @param tagNames - list of _uppercase_ tag names.
   * @param onNewElements - function to call when there are new elements.
   * @param searchInShadowRoot - whether to search inside shadowRoots, this is more resource expensive.
   */
  constructor(
    tagNames: Array<T>,
    onNewElements: (elements: Array<HTMLElementTagNameMapUppercase[T]>) => void,
    searchInShadowRoot = false,
  ) {
    this._tagNames = tagNames;
    this._onNewElements = onNewElements;
    this._searchInShadowRoot = searchInShadowRoot;
    this._observers = [];

    this._scanAndObserveTree(document);
  }

  private _scanAndObserveTree(tree: Document | ShadowRoot) {
    let elementsSelector = "*";
    if (!this._searchInShadowRoot) {
      elementsSelector = this._tagNames.join(", ");
    }

    const elements = tree.querySelectorAll(elementsSelector);
    this._observeTree(tree);

    const foundElements: Array<HTMLElementTagNameMapUppercase[T]> = [];
    elements.forEach((element) => {
      if ((this._tagNames as string[]).includes(element.tagName)) {
        foundElements.push(element as HTMLElementTagNameMapUppercase[T]);
      } else if (element.shadowRoot && this._searchInShadowRoot) {
        this._scanAndObserveTree(element.shadowRoot);
      }
    });

    if (foundElements.length) {
      this._onNewElements(foundElements);
    }
  }

  private _observeTree(tree: Document | ShadowRoot) {
    const handleMutationsOnIdle = (mutations: MutationRecord[]) =>
      requestIdleCallbackPolyfill(() => this._onTreeMutation(mutations), {
        timeout: 5000,
      });

    const mutationObserver = new MutationObserver(handleMutationsOnIdle);
    mutationObserver.observe(tree, {
      subtree: true,
      childList: true, // Again, why `subtree: true` is not enough here?
    });

    this._observers.push(mutationObserver);
  }

  private _onTreeMutation(mutations: MutationRecord[]) {
    // TODO perf: reduce the amount of allocations. Although an average page shouldn't
    // have enough media elements for this to be a problem
    const foundElements: Array<HTMLElementTagNameMapUppercase[T]> = [];

    for (const mutation of mutations) {
      if (mutation.type !== "childList") {
        continue;
      }
      for (const node of mutation.addedNodes) {
        if (node.nodeType !== Node.ELEMENT_NODE) {
          continue;
        }

        // https://developer.mozilla.org/en-US/docs/Web/API/Node/nodeType#node.element_node
        // https://dom.spec.whatwg.org/#ref-for-element%E2%91%A2%E2%91%A0
        const element = node as Element;

        // Keep in mind that the same element may get removed then added to the tree again. This is handled
        // inside `handleNewElements` (`this.handledElements.has(el)`).
        // Also the fact that we have an array of `addedNodes` in an array of mutations may mean (idk actually)
        // that we can have duplicate nodes in the array, which currently is fine thanks to
        // `this.handledElements.has(el)`.
        // `node.tagName` is why we need `tagNames` to be uppercase.
        if ((this._tagNames as string[]).includes(element.tagName)) {
          foundElements.push(element as HTMLElementTagNameMapUppercase[T]);
        } else if (element.shadowRoot && this._searchInShadowRoot) {
          this._scanAndObserveTree(element.shadowRoot);
        }
      }

      // TODO should we also manually detach from removed nodes? If so, this is probably to be done in
      // `AllMediaElementsController.ts`. But currently it is made so that there's at most one Controller
      // (attached to just one element), so it's fine.
    }

    if (foundElements.length) {
      this._onNewElements(foundElements);
    }
  }

  destroy() {
    this._observers.forEach((observer) => {
      observer.disconnect();
    });

    this._observers = [];
  }
}
