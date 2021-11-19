import { closestNonNormalSpeed } from './closestNonNormalSpeed';

/**
 * For performance, so the browser's internal pitch shifting algorithm doesn't consume processing time.
 * `volumeThreshold === 0` currently means that we'll never switch to the `silenceSpeed`.
 */
export function maybeClosestNonNormalSpeed(speed: number, volumeThreshold: number): number {
  return volumeThreshold === 0
    ? speed
    : closestNonNormalSpeed(speed);
}
