import type { Settings } from './'

export type PopupAdjustableRangeInputsCapitalized = Capitalize<keyof Settings> & (
  'VolumeThreshold'
  | 'SoundedSpeed'
  | 'SilenceSpeedRaw'
  | 'MarginBefore'
  | 'MarginAfter'
);
