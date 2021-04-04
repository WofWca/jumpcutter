import type { MyStorageChanges } from './';

type MyOnChangedListener = (changes: MyStorageChanges) => void;
type NativeOnChangedListener = Parameters<typeof chrome.storage.onChanged.addListener>[0];
const srcListenerToWrapperListener = new WeakMap<MyOnChangedListener, NativeOnChangedListener>();
/**
 * This is a wrapper around the native `chrome.storage.onChanged.addListener`. The reason we need this is so listeners
 * attached using it only react to changes in `local` storage, but not `sync` (or others). See `src/background.ts`.
 */
export function addOnChangedListener(listener: MyOnChangedListener): void {
  const actualListener: NativeOnChangedListener = (changes, areaName) => {
    if (areaName !== 'local') return;
    listener(changes);
  };
  srcListenerToWrapperListener.set(listener, actualListener);
  chrome.storage.onChanged.addListener(actualListener);
}
export function removeOnChangedListener(listener: MyOnChangedListener): void {
  const actualListener = srcListenerToWrapperListener.get(listener);
  if (!actualListener) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn('Did not remove listener because it\'s already not attached');
    }
    return;
  }
  chrome.storage.onChanged.removeListener(actualListener);
}
