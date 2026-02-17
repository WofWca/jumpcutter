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

import {
  addOnStorageChangedListener, MyStorageChanges, getSettings, PerTabOverrides
} from '@/settings';
import type AllMediaElementsController from './AllMediaElementsController';
import broadcastStatus from './broadcastStatus';
import once from 'lodash/once';
import watchAllElements from './watchAllElements';
import requestIdlePromise from './helpers/requestIdlePromise';
import type { RuntimeMessage } from '@/core/messaging/contracts';
import {
  getV2TabOverride,
  getV2TabUiState,
  removeV2TabOverride,
  setV2TabOverride,
  setV2TabUiState,
} from '@/core/storage';
import mountFloatingPill, { FloatingPillController } from './FloatingPill';

const getUninitializedStatus = () => ({
  elementLastActivatedAt: undefined,
  status: 'initializing' as const,
  detail: 'controller-not-created',
});
const broadcastStatus2 = (allMediaElementsController?: AllMediaElementsController) => allMediaElementsController
  ? allMediaElementsController.broadcastStatus()
  : broadcastStatus(getUninitializedStatus());

export default async function init(): Promise<void> {
  // TODO would be better to pass them as a parameter from `main.ts`.
  const settingsP = getSettings('applyTo');
  let tabId: number | undefined;
  let perTabOverrides: PerTabOverrides | null = null;
  let floatingPill: FloatingPillController | undefined;
  let stopWatchingElements: () => void = () => {};

  let allMediaElementsController: AllMediaElementsController | undefined;
  const ensureInitAllMediaElementsController = once(async function () {
    const AllMediaElementsController = (await import(
      /* webpackExports: ['default'] */
      './AllMediaElementsController'
    )).default
    allMediaElementsController = new AllMediaElementsController();
    allMediaElementsController.setPerTabOverrides(perTabOverrides);
    return allMediaElementsController;
  });

  const onMessage = (message: unknown, _sender: chrome.runtime.MessageSender, sendResponse: (response?: unknown) => void) => {
    const messageType = typeof message === 'string'
      ? message
      : (message as RuntimeMessage | undefined)?.type;
    // Keep in mind that although it is not supposed to be possible to send messages to content script with
    // `browser.runtime.sendMessage`, this code is not only run as a content script - on the `local-file-player`
    // page it is run as the page script, so this listener will catch all messages sent with
    // `browser.runtime.sendMessage`, including other `broadcastStatus`.
    if (messageType !== 'checkContentStatus') {
      if (IS_DEV_MODE) {
        const thisIsExtensionPage = document.location.href.startsWith(
          chrome.runtime.getURL('')
        );
        const thisIsLocalFilePlayer = thisIsExtensionPage;
        if (!thisIsLocalFilePlayer) {
          console.error('Unrecognized message', message);
        }
      }
      return;
    }
    if (allMediaElementsController) {
      allMediaElementsController.broadcastStatus();
      sendResponse(allMediaElementsController.getContentStatus());
    } else {
      broadcastStatus2();
      sendResponse(getUninitializedStatus());
    }
    return true;
  }
  chrome.runtime.onMessage.addListener(onMessage);
  // So it sends the message automatically when it loads, in case the popup was opened while the page is loading.
  broadcastStatus2(allMediaElementsController);
  const removeListener = addOnStorageChangedListener((changes: MyStorageChanges) => {
    if (changes.enabled?.newValue === false) {
      chrome.runtime.onMessage.removeListener(onMessage);
      stopWatchingElements();
      floatingPill?.destroy();
      removeListener();
    }
  });

  try {
    const context = await chrome.runtime.sendMessage({ type: 'resolveTabContext' } as RuntimeMessage) as { tabId?: number };
    tabId = context?.tabId;
  } catch {
    tabId = undefined;
  }
  if (tabId !== undefined) {
    const legacyKey = `perTab_${tabId}`;
    const legacyStateKey = `floatingPill_tab_${tabId}`;
    const [v2Override, legacyPayload, v2PillState, legacyPillStatePayload] = await Promise.all([
      getV2TabOverride(tabId),
      chrome.storage.local.get(legacyKey),
      getV2TabUiState(tabId),
      chrome.storage.local.get(legacyStateKey),
    ]);
    perTabOverrides = v2Override ?? (legacyPayload[legacyKey] as PerTabOverrides | undefined) ?? null;

    floatingPill = mountFloatingPill({
      initialOverrides: perTabOverrides,
      initialState: v2PillState ?? legacyPillStatePayload[legacyStateKey],
      onOverridesChange: async (overrides) => {
        perTabOverrides = overrides;
        allMediaElementsController?.setPerTabOverrides(overrides);
        if (tabId === undefined) {
          return;
        }
        if (overrides) {
          await Promise.all([
            setV2TabOverride(tabId, overrides),
            chrome.storage.local.set({ [legacyKey]: overrides }),
          ]);
        } else {
          await Promise.all([
            removeV2TabOverride(tabId),
            chrome.storage.local.remove(legacyKey),
          ]);
        }
      },
      onStateChange: async (state) => {
        if (tabId === undefined) {
          return;
        }
        await Promise.all([
          setV2TabUiState(tabId, state),
          chrome.storage.local.set({ [legacyStateKey]: state }),
          chrome.runtime.sendMessage({ type: 'floatingPillStateChanged', state } as RuntimeMessage),
        ]).catch(() => {});
      },
    });
  }

  const { applyTo } = await settingsP;
  const tagNames: Array<'VIDEO' | 'AUDIO'> = [];
  if (applyTo !== 'audioOnly') {
    tagNames.push('VIDEO');
  }
  if (applyTo !== 'videoOnly') {
    tagNames.push('AUDIO');
  }

  await requestIdlePromise({ timeout: 5000 })
  stopWatchingElements = watchAllElements(
    tagNames,
    newElements => ensureInitAllMediaElementsController().then(allMediaElementsController => {
      allMediaElementsController.onNewMediaElements(...newElements);
    }),
    // Handle removed elements to prevent memory leaks
    removedElements => ensureInitAllMediaElementsController().then(allMediaElementsController => {
      allMediaElementsController.onRemovedMediaElements(...removedElements);
    })
  )
}
