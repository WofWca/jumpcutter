/**
 * @license
 * Copyright (C) 2020, 2021, 2022  WofWca <wofwca@protonmail.com>
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

// Why so many numbers? https://github.com/microsoft/TypeScript/pull/33038. TODO utilize this when it's merged.
export type MediaTime = number;
export type UnixTime = number;
export type AudioContextTime = number;
export type TimeDelta = number;
export type AnyTime = MediaTime | UnixTime | AudioContextTime | TimeDelta;

export type StretchInfo = {
  startTime: AudioContextTime,
  startValue: number,
  endTime: AudioContextTime,
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

export * from './clamp';
export * from './cloneDeepJson';
export * from './assert';
export * from './assertDev';
export * from './assertNever';
export * from './filterOutUnchangedValues';
export * from './speedName';
export * from './getGeckoMajorVersion';
export * from './maxPlaybackRate';
export * from './getGeckoLikelyMaxNonMutedPlaybackRate';
export * from './getMessage';
