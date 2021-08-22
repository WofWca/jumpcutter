import type { Settings } from './';

export function getAbsoluteSilenceSpeed(
  settings: Pick<Settings, 'silenceSpeedRaw' | 'silenceSpeedSpecificationMethod' | 'soundedSpeed'>
): number {
  return settings.silenceSpeedSpecificationMethod === 'relativeToSoundedSpeed'
    ? settings.silenceSpeedRaw * settings.soundedSpeed
    : settings.silenceSpeedRaw;
}
