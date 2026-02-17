/**
 * @license
 * Copyright (C) 2020, 2021, 2022, 2023, 2024  WofWca <wofwca@protonmail.com>
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

type HTMLElementTagNameMapUppercase = {
  [P in Uppercase<keyof HTMLElementTagNameMap>]: HTMLElementTagNameMap[Lowercase<P>]
}
/**
 * Watch the document and call `onNewElements` with the list of new elements every time they get
 * inserted in the document. When it is fist called, all the elements that are already
 * in the document will be passed to `onNewElements`.
 * The same element may be passed to `onNewElements` several times.
 * @param tagNames - list of _uppercase_ tag names.
 * If it is mutated, it will only affect future DOM changes, it won't
 * search for all the exisiting elements again.
 * @param onRemovedElements - optional callback for when elements are removed from the DOM.
 * Useful for cleaning up event listeners and preventing memory leaks.
 * @returns the `stopWatching` function, the destructor
 */
export default function watchAllElements<T extends keyof HTMLElementTagNameMapUppercase>(
  tagNames: Array<T>,
  onNewElements: (elements: Array<HTMLElementTagNameMapUppercase[T]>) => void,
  onRemovedElements?: (elements: Array<HTMLElementTagNameMapUppercase[T]>) => void,
): () => void {
  const tagNamesAsString = tagNames as string[];

  function collectElementsDeep(
    root: Document | Element | ShadowRoot,
    out: Array<HTMLElementTagNameMapUppercase[T]>,
  ) {
    for (const tagName of tagNames) {
      const allElementsWThisTag = root.querySelectorAll(
        tagName.toLowerCase()
      ) as NodeListOf<HTMLElementTagNameMapUppercase[typeof tagName]>;
      if (allElementsWThisTag.length > 0) {
        out.push(...allElementsWThisTag);
      }
    }
    if (!(root instanceof Element || root instanceof ShadowRoot || root instanceof Document)) {
      return;
    }
    const hosts = root.querySelectorAll('*');
    for (const host of hosts) {
      const shadowRoot = host.shadowRoot;
      if (!shadowRoot) continue;
      collectElementsDeep(shadowRoot, out);
    }
  }

  function collectElementsFromNodeDeep(node: Node, out: Array<HTMLElementTagNameMapUppercase[T]>) {
    if (node.nodeType !== Node.ELEMENT_NODE) {
      return;
    }
    const el = node as Element;
    if (tagNamesAsString.includes(el.tagName)) {
      out.push(el as HTMLElementTagNameMapUppercase[T]);
    }
    collectElementsDeep(el, out);
    if (el.shadowRoot) {
      collectElementsDeep(el.shadowRoot, out);
    }
  }

  const initiallyFoundElements: Array<HTMLElementTagNameMapUppercase[T]> = [];
  collectElementsDeep(document, initiallyFoundElements);
  if (initiallyFoundElements.length) {
    onNewElements(initiallyFoundElements);
  }

  const observedRoots = new WeakSet<Node>();
  const observeRoot = (root: Node) => {
    if (observedRoots.has(root)) {
      return;
    }
    observedRoots.add(root);
    mutationObserver.observe(root, {
      subtree: true,
      childList: true,
    });
  };

  const observeShadowRootsDeep = (node: Node) => {
    if (node.nodeType !== Node.ELEMENT_NODE) {
      return;
    }
    const element = node as Element;
    if (element.shadowRoot) {
      observeRoot(element.shadowRoot);
    }
    const descendants = element.querySelectorAll('*');
    for (const descendant of descendants) {
      if (descendant.shadowRoot) {
        observeRoot(descendant.shadowRoot);
      }
    }
  }

  // Peeked at https://github.com/igrigorik/videospeed/blob/a25373f1d831fe06430c2e9e87dc1bd1aabd25b1/inject.js#L631
  function handleMutations(mutations: MutationRecord[]) {
    const newElements: Array<HTMLElementTagNameMapUppercase[T]> = [];
    const removedElements: Array<HTMLElementTagNameMapUppercase[T]> = [];
    for (const m of mutations) {
      if (m.type !== 'childList') {
        continue;
      }
      for (const node_ of m.addedNodes) {
        collectElementsFromNodeDeep(node_, newElements);
        observeShadowRootsDeep(node_);
      }
      if (onRemovedElements) {
        for (const node_ of m.removedNodes) {
          collectElementsFromNodeDeep(node_, removedElements);
        }
      }
    }
    if (newElements.length) {
      onNewElements(newElements);
    }
    if (removedElements.length && onRemovedElements) {
      onRemovedElements(removedElements);
    }
  }
  const handleMutationsOnIdle =
    (mutations: MutationRecord[]) => requestIdleCallbackPolyfill(
      () => handleMutations(mutations),
      { timeout: 5000 },
    );
  const mutationObserver = new MutationObserver(handleMutationsOnIdle);

  const scanDocumentForNewShadowRoots = () => {
    if (document.documentElement) {
      observeShadowRootsDeep(document.documentElement);
    }
  };
  const shadowRootsFallbackInterval = window.setInterval(
    scanDocumentForNewShadowRoots,
    1500,
  );

  const originalAttachShadow = Element.prototype.attachShadow;
  let isAttachShadowPatched = false;
  try {
    const patchedAttachShadow: typeof Element.prototype.attachShadow = function (this: Element, ...args) {
      const shadowRoot = originalAttachShadow.apply(this, args);
      observeRoot(shadowRoot);
      const discoveredInShadowRoot: Array<HTMLElementTagNameMapUppercase[T]> = [];
      collectElementsDeep(shadowRoot, discoveredInShadowRoot);
      if (discoveredInShadowRoot.length) {
        onNewElements(discoveredInShadowRoot);
      }
      return shadowRoot;
    };
    Element.prototype.attachShadow = patchedAttachShadow;
    isAttachShadowPatched = true;
  } catch {
    // Some environments may prevent patching DOM prototypes.
    isAttachShadowPatched = false;
  }

  observeRoot(document);
  scanDocumentForNewShadowRoots();
  return () => {
    mutationObserver.disconnect();
    window.clearInterval(shadowRootsFallbackInterval);
    if (isAttachShadowPatched && Element.prototype.attachShadow !== originalAttachShadow) {
      Element.prototype.attachShadow = originalAttachShadow;
    }
  };
}
