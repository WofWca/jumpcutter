import type browser from '@/webextensions-api';
import isEqual from 'lodash/isEqual';

/**
 * `browser.storage.onChanged` listeners in Firefox may be called with `newValue` equal to `oldValue` if you call
 * `storage.set()` with the same value. It's supposed to be used on all `browser.storage.onChanged.addListener`
 * callbacks.
 * https://bugzilla.mozilla.org/show_bug.cgi?id=1621162
 * If this really isn't a bug, rethink the whole commit, we may improve
 * performance, at least by using something other than `_.isEqual` as it covers a lot of edge cases (like regex types,
 * which we don't use).
 * @return a shallow clone with unchanged value keys deleted.
 */
 export function filterOutUnchangedValues(
  changes: Record<string, browser.storage.StorageChange>
): Record<string, browser.storage.StorageChange> {
  if (process.env.NODE_ENV !== 'production') {
    if (BUILD_DEFINITIONS.BROWSER !== 'gecko') {
      console.warn('It is redundant to use this function in Chromium');
    }
  }

  const clone: typeof changes = {};
  for (const [_k, v] of Object.entries(changes)) {
    const k = _k as keyof typeof clone;
    const { newValue, oldValue } = v;
    if (!isEqual(newValue, oldValue)) {
      clone[k] = v;
    }
  }
  return clone;
}
