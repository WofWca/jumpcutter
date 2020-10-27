export function cloneDeepJson<T>(jsonable: T): T {
  return JSON.parse(JSON.stringify(jsonable));
}
// TODO but calls of this function are still not eliminated in production.
export function assert(condition: boolean, msg?: string): asserts condition {
  if (process.env.NODE_ENV !== 'production') {
    if (!condition) {
      throw new Error(msg);
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
  newSpeedStartInputTime: Time,
  startTime: Time,
  startValue: number,
  endTime: Time,
  endValue: number,
};
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type KeysOfType<T extends Record<string, any>, U> = { [P in keyof T]: T[P] extends U ? P : never; }[keyof T];
export type ResolveType<T extends Promise<unknown>> = T extends Promise<infer U> ? U : never;
