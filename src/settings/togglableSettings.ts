export type CorrespondingPreviousValueSetting<T extends TogglableSettings> =
  T extends   'volumeThreshold' ? 'previousVolumeThreshold'
  : T extends 'silenceSpeedRaw' ? 'previousSilenceSpeedRaw'
  : T extends 'soundedSpeed'    ? 'previousSoundedSpeed'
  : T extends 'marginBefore'    ? 'previousMarginBefore'
  : T extends 'marginAfter'     ? 'previousMarginAfter'
  : never;
export const togglableSettings = ['volumeThreshold', 'silenceSpeedRaw', 'soundedSpeed', 'marginBefore',
  'marginAfter'] as const;
export type TogglableSettings = typeof togglableSettings[number];
export const settingKeyToPreviousValueKey: { [P in TogglableSettings]: CorrespondingPreviousValueSetting<P> } = {
  volumeThreshold: 'previousVolumeThreshold',
  silenceSpeedRaw: 'previousSilenceSpeedRaw',
  soundedSpeed: 'previousSoundedSpeed',
  marginBefore: 'previousMarginBefore',
  marginAfter: 'previousMarginAfter',
}
