import browser from '@/webextensions-api';
import {
  addOnStorageChangedListener, removeOnStorageChangedListener, MyStorageChanges, getSettings
} from '@/settings';
import type AllMediaElementsController from './AllMediaElementsController';
import broadcastStatus from './broadcastStatus';
import once from 'lodash/once';
import { requestIdleCallbackPolyfill } from './helpers';

const broadcastStatus2 = (allMediaElementsController?: AllMediaElementsController) => allMediaElementsController
  ? allMediaElementsController.broadcastStatus()
  : broadcastStatus({ elementLastActivatedAt: undefined });

export default async function init(): Promise<void> {
  // TODO would be better to pass them as a parameter from `main.ts`.
  const settingsP = getSettings('applyTo');

  let allMediaElementsController: AllMediaElementsController | undefined;
  const ensureInitAllMediaElementsController = once(async function () {
    const { default: AllMediaElementsController } = await import(
      /* webpackExports: ['default'] */
      './AllMediaElementsController'
    )
    allMediaElementsController = new AllMediaElementsController();
    return allMediaElementsController;
  });

  const onMessage = (message: unknown) => {
    // Keep in mind that although it is not supposed to be possible to send messages to content script with
    // `browser.runtime.sendMessage`, this code is not only run as a content script - on the `local-file-player`
    // page it is run as the page script, so this listener will catch all messages sent with
    // `browser.runtime.sendMessage`, including other `broadcastStatus`.
    if (message !== 'checkContentStatus') { // TODO DRY.
      if (process.env.NODE_ENV !== 'production') {
        const extensionPage = document.location.href.startsWith(browser.runtime.getURL(''));
        const thisIsLocalFilePlayer = extensionPage;
        if (!thisIsLocalFilePlayer) {
          console.error('Unrecognized message', message);
        }
      }
      return;
    }
    broadcastStatus2(allMediaElementsController);
  }
  browser.runtime.onMessage.addListener(onMessage);
  // So it sends the message automatically when it loads, in case the popup was opened while the page is loading.
  broadcastStatus2(allMediaElementsController);
  const onSettingsChanged = (changes: MyStorageChanges) => {
    if (changes.enabled?.newValue === false) {
      browser.runtime.onMessage.removeListener(onMessage);
      mutationObserver.disconnect();
      removeOnStorageChangedListener(onSettingsChanged);
    }
  }
  addOnStorageChangedListener(onSettingsChanged);

  const { applyTo } = await settingsP;
  const tagNames: Array<'video' | 'audio'> = [];
  if (applyTo !== 'audioOnly') {
    tagNames.push('video');
  }
  if (applyTo !== 'videoOnly') {
    tagNames.push('audio');
  }

  for (const tagName of tagNames) {
    const allMediaElementsWThisTag = document.getElementsByTagName(tagName);
    if (allMediaElementsWThisTag.length) {
      ensureInitAllMediaElementsController().then(allMediaElementsController => {
        allMediaElementsController.onNewMediaElements(...allMediaElementsWThisTag);
      });
    }
  }
  // Peeked at https://github.com/igrigorik/videospeed/blob/a25373f1d831fe06430c2e9e87dc1bd1aabd25b1/inject.js#L631
  function handleMutations(mutations: MutationRecord[]) {
    const newElements: HTMLMediaElement[] = [];
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
          newElements.push(node as HTMLMediaElement);
        } else {
          // TODO here https://developer.mozilla.org/en-US/docs/Web/API/Element/getElementsByTagName
          // it says "The returned list is live, which means it updates itself with the DOM tree automatically".
          // Does it mean that it would be better to somehow use the `allMediaElements` variable from a few lines above?
          // But here https://dom.spec.whatwg.org/#introduction-to-dom-ranges it says that upgdating live ranges can be
          // costly.
          for (const tagName of tagNames) {
            const childMediaElements = (node as HTMLElement).getElementsByTagName(tagName);
            if (childMediaElements.length) {
              newElements.push(...childMediaElements);
            }
          }
        }
      }
      // TODO should we also manually detach from removed nodes? If so, this is probably to be done in
      // `AllMediaElementsController.ts`. But currently it is made so that there's at most one Controller
      // (attached to just one element), so it's fine.
    }
    if (newElements.length) {
      ensureInitAllMediaElementsController().then(allMediaElementsController => {
        allMediaElementsController.onNewMediaElements(...newElements);
      });
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
}
