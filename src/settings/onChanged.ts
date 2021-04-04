import browser from '@/webextensions-api';
import { filterOutUnchangedValues } from '@/helpers';
import type { MyStorageChanges } from './';

type MyOnChangedListener = (changes: MyStorageChanges) => void;
type NativeOnChangedListener = Parameters<typeof browser.storage.onChanged.addListener>[0];
const srcListenerToWrapperListener = new WeakMap<MyOnChangedListener, NativeOnChangedListener>();
/**
 * This is a wrapper around the native `browser.storage.onChanged.addListener`. The reason we need this is so listeners
 * attached using it only react to changes in `local` storage, but not `sync` (or others). See `src/background.ts`.
 */
export function addOnChangedListener(listener: MyOnChangedListener): void {
  const actualListener: NativeOnChangedListener = (changes, areaName) => {
    if (areaName !== 'local') return;

    if (BUILD_DEFINITIONS.BROWSER !== 'chromium') {
      changes = filterOutUnchangedValues(changes);
    }
    if (Object.keys(changes).length === 0) {
      return;
    }

    listener(changes);
  };
  srcListenerToWrapperListener.set(listener, actualListener);
  browser.storage.onChanged.addListener(actualListener);
}
export function removeOnChangedListener(listener: MyOnChangedListener): void {
  const actualListener = srcListenerToWrapperListener.get(listener);
  if (!actualListener) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn('Did not remove listener because it\'s already not attached');
    }
    return;
  }
  browser.storage.onChanged.removeListener(actualListener);
}
