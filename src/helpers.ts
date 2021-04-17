import type browser from '@/webextensions-api';
import isEqual from 'lodash/isEqual';

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
export function cloneDeepJson<T>(jsonable: T): T {
  return JSON.parse(JSON.stringify(jsonable));
}
// TODO but `msg` arguments still not eliminated in production.
export function assert(condition: unknown, msg?: string): asserts condition {
  if (!condition) {
    if (process.env.NODE_ENV !== 'production') {
      throw new Error(msg);
    } else {
      throw new Error();
    }
  }
}
export function assertNever(arg: never): never {
  if (process.env.NODE_ENV !== 'production') {
    throw new Error(`Value was not expected to be "${arg}"`);
  } else {
    throw new Error();
  }
}
export type Time = number;
export type StretchInfo = {
  startTime: Time,
  startValue: number,
  endTime: Time,
  endValue: number,
};
// Honestly idk why `-?:` is the way to go, but it appears to make optional values work.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type KeysOfType<T extends Record<string, any>, U> = { [P in keyof T]-?: T[P] extends U ? P : never; }[keyof T];
// export type ResolveType<T extends Promise<unknown>> = T extends Promise<infer U> ? U : never;
export type DeepReadonly<T> =
  T extends Record<string, unknown> ? { readonly [P in keyof T]: T[P] }
  : T extends (infer I)[] ? ReadonlyArray<I>
  : T;
/**
 * `browser.storage.onChanged` listeners in Firefox may be called with `newValue` equal to `oldValue` if you call
 * `storage.set()` with the same value. It's supposed to be used on all `browser.storage.onChanged.addListener`
 * callbacks.
 * TODO can we consider it a bug? If not, rethink the whole commit, we may improve
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
export const enum SpeedName {
  SOUNDED,
  SILENCE,
}
// A workaround for Svele not being able to import const enums. TODO raise an issue?
export const SpeedName_SOUNDED = SpeedName.SOUNDED;
export const SpeedName_SILENCE = SpeedName.SILENCE;
