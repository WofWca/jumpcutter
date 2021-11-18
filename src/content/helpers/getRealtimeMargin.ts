import type { TimeDelta } from '@/helpers';

export function getRealtimeMargin(margin: TimeDelta, speed: number): TimeDelta {
  return margin / speed;
}
