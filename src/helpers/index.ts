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

export * from './clamp';
export * from './cloneDeepJson';
export * from './assert';
export * from './assertNever';
export * from './filterOutUnchangedValues';
export * from './speedName';
