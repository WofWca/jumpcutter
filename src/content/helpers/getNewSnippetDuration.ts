import type { TimeDelta } from '@/helpers';

export function getNewSnippetDuration(
  originalRealtimeDuration: TimeDelta,
  originalSpeed: number,
  newSpeed: number
): TimeDelta {
  const videoSpeedSnippetDuration = originalRealtimeDuration * originalSpeed;
  return videoSpeedSnippetDuration / newSpeed;
}
