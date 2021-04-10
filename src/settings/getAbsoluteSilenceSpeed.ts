import type { Settings } from './';

export function getAbsoluteSilenceSpeed(settings: Settings): number {
  return settings.silenceSpeedSpecificationMethod === 'relativeToSoundedSpeed'
    ? settings.silenceSpeedRaw * settings.soundedSpeed
    : settings.silenceSpeedRaw;
}
