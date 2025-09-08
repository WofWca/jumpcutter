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

import { browserOrChrome } from '@/webextensions-api-browser-or-chrome';
import {
  addOnStorageChangedListener, removeOnStorageChangedListener, MyStorageChanges, getSettings
} from '@/settings';
import type AllMediaElementsController from './AllMediaElementsController';
import broadcastStatus from './broadcastStatus';
import once from 'lodash/once';
import watchAllElements from './watchAllElements';
import requestIdlePromise from './helpers/requestIdlePromise';

const broadcastStatus2 = (allMediaElementsController?: AllMediaElementsController) => allMediaElementsController
  ? allMediaElementsController.broadcastStatus()
  : broadcastStatus({ elementLastActivatedAt: undefined });

export default async function init(): Promise<void> {
  // TODO would be better to pass them as a parameter from `main.ts`.
  const settingsP = getSettings('applyTo');

  let allMediaElementsController: AllMediaElementsController | undefined;
  const ensureInitAllMediaElementsController = once(async function () {
    const AllMediaElementsController = (await import(
      /* webpackExports: ['default'] */
      './AllMediaElementsController'
    )).default
    allMediaElementsController = new AllMediaElementsController();
    return allMediaElementsController;
  });

  const onMessage = (message: unknown) => {
    // Keep in mind that although it is not supposed to be possible to send messages to content script with
    // `browser.runtime.sendMessage`, this code is not only run as a content script - on the `local-file-player`
    // page it is run as the page script, so this listener will catch all messages sent with
    // `browser.runtime.sendMessage`, including other `broadcastStatus`.
    if (message !== 'checkContentStatus') { // TODO DRY.
      if (IS_DEV_MODE) {
        const thisIsExtensionPage = document.location.href.startsWith(
          browserOrChrome.runtime.getURL('')
        );
        const thisIsLocalFilePlayer = thisIsExtensionPage;
        if (!thisIsLocalFilePlayer) {
          console.error('Unrecognized message', message);
        }
      }
      return;
    }
    broadcastStatus2(allMediaElementsController);
  }
  browserOrChrome.runtime.onMessage.addListener(onMessage);
  // So it sends the message automatically when it loads, in case the popup was opened while the page is loading.
  broadcastStatus2(allMediaElementsController);
  const onSettingsChanged = (changes: MyStorageChanges) => {
    if (changes.enabled?.newValue === false) {
      browserOrChrome.runtime.onMessage.removeListener(onMessage);
      stopWatchingElements();
      removeOnStorageChangedListener(onSettingsChanged);
    }
  }
  addOnStorageChangedListener(onSettingsChanged);

  const { applyTo } = await settingsP;
  const tagNames: Array<'VIDEO' | 'AUDIO'> = [];
  if (applyTo !== 'audioOnly') {
    tagNames.push('VIDEO');
  }
  if (applyTo !== 'videoOnly') {
    tagNames.push('AUDIO');
  }

  await requestIdlePromise({ timeout: 5000 })
  const stopWatchingElements = watchAllElements(
    tagNames,
    newElements => ensureInitAllMediaElementsController().then(allMediaElementsController => {
      allMediaElementsController.onNewMediaElements(...newElements);
    })
  )
}
