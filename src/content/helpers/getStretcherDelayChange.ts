import type { TimeDelta } from '@/helpers';
import { getNewSnippetDuration } from './getNewSnippetDuration';

// The delay that the stretcher node is going to have when it's done slowing down a snippet
export function getStretcherDelayChange(
  snippetOriginalRealtimeDuration: TimeDelta,
  originalSpeed: number,
  newSpeed: number
): TimeDelta {
  const snippetNewDuration = getNewSnippetDuration(snippetOriginalRealtimeDuration, originalSpeed, newSpeed);
  const delayChange = snippetNewDuration - snippetOriginalRealtimeDuration;
  return delayChange;
}
