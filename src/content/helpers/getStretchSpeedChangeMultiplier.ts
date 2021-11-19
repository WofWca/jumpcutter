import type { StretchInfo } from '@/helpers';

export function getStretchSpeedChangeMultiplier(
  { startValue, endValue, startTime, endTime }: Pick<StretchInfo, 'startValue' | 'endValue' | 'startTime' | 'endTime'>
): number {
  return ((endTime - startTime) + (startValue - endValue)) / (endTime - startTime);
}
