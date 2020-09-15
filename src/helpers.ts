// TODO but calls of this function are still not eliminated in production.
export function assert(condition: boolean, msg?: any): asserts condition {
  if (process.env.NODE_ENV !== 'production') {
    if (!condition) {
      throw new Error(msg);
    }
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
