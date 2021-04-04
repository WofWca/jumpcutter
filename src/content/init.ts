import {
  addOnChangedListener as addOnSettingsChangedListener,
  MyStorageChanges,
  removeOnChangedListener as removeOnSettingsChangedListener,
} from '@/settings';
import type AllMediaElementsController from './AllMediaElementsController';
import broadcastStatus from './broadcastStatus';

const broadcastStatus2 = (allMediaElementsController?: AllMediaElementsController) => allMediaElementsController
  ? allMediaElementsController.broadcastStatus()
  : broadcastStatus({ elementLastActivatedAt: undefined });

export default async function init(): Promise<void> {
  let allMediaElementsController: AllMediaElementsController | undefined;
  async function ensureInitAllMediaElementsController() {
    if (allMediaElementsController) return;
    const { default: AllMediaElementsController } = await import(
      /* webpackExports: ['default'] */
      './AllMediaElementsController'
    )
    allMediaElementsController = new AllMediaElementsController();
    return allMediaElementsController;
  }

  // The user might have enabled access to file URL for this extension. This is so it behaves the same way when access
  // is disabled. And why do we need that? Because it doesn't work with local files:
  // https://github.com/WofWca/jumpcutter/issues/5
  if (location.protocol === 'file:') {
    return;
  }

  const onMessage = (message: unknown) => {
    if (process.env.NODE_ENV !== 'production') {
      if (message !== 'checkContentStatus') { // TODO DRY.
        console.error('Unrecognized message', message);
      }
    }
    broadcastStatus2(allMediaElementsController);
  }
  chrome.runtime.onMessage.addListener(onMessage);
  // So it sends the message automatically when it loads, in case the popup was opened while the page is loading.
  broadcastStatus2(allMediaElementsController);
  const onSettingsChanged = (changes: MyStorageChanges) => {
    if (changes.enabled?.newValue === false) {
      chrome.runtime.onMessage.removeListener(onMessage);
      removeOnSettingsChangedListener(onSettingsChanged);
    }
  }
  addOnSettingsChangedListener(onSettingsChanged);

  const allMediaElements = document.getElementsByTagName('video');
  if (allMediaElements.length) {
    await ensureInitAllMediaElementsController();
    allMediaElementsController!.onNewMediaElements(...allMediaElements);
  }
  // TODO also listen for new dynamically inserted elements (and stop listening when `enabled` becomes `false`).
}
