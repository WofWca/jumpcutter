import { HotkeyBinding } from '@/hotkeys';
import { ControllerKind } from './ControllerKind';

export interface Settings {
  // TODO I made this purely for testing. For release we'll probably need something better.
  experimentalControllerType: ControllerKind,

  volumeThreshold: number,
  previousVolumeThreshold: number,

  silenceSpeedSpecificationMethod: 'relativeToSoundedSpeed' | 'absolute',
  silenceSpeedRaw: number,
  previousSilenceSpeedRaw: number,

  soundedSpeed: number,
  previousSoundedSpeed: number,
  enabled: boolean,
  marginBefore: number,
  previousMarginBefore: number,
  marginAfter: number,
  previousMarginAfter: number,

  applyTo: 'videoOnly' | 'audioOnly' | 'both',

  enableHotkeys: boolean,
  hotkeys: HotkeyBinding[],

  // In case input controls and hotkeys are intersecting in popup.
  // kind of looks like a half-assed solution, no? TODO.
  popupDisableHotkeysWhileInputFocused: boolean,
  // This comes in especially handy when `popupDisableHotkeysWhileInputFocused === true`.
  // TODO but when `popupDisableHotkeysWhileInputFocused === true && popupAutofocusEnabledInput === true` it is
  // practically impossible to use hotkeys in the popup as removing focus is done with "Esc", which also closes the
  // popup. These options are considered "Advanced" so I think we can remove then without worrying too much.
  popupAutofocusEnabledInput: boolean,
  popupChartWidthPx: number,
  popupChartHeightPx: number,
  popupChartLengthInSeconds: number,
  popupAlwaysShowOpenLocalFileLink: boolean,
  // But `overrideWebsiteHotkeys` is not applicable to popup-specific hotkeys. TODO use
  // `Array<Omit<HotkeyBinding, 'overrideWebsiteHotkeys'>>`?
  popupSpecificHotkeys: HotkeyBinding[],

  timeSavedAveragingMethod: 'all-time' | 'exponential',
  // This may not be the most accurate name for an exponential averaging window. TODO?
  timeSavedAveragingWindowLength: number,
  // When the averaging window is an exponential window, how much weight does the interval of length
  // `timeSavedAveragingWindowLength` has to possess (compared to the resulting average value) (so data older than
  // `timeSavedAveragingWindowLength` has weight of as little as `1 - <this value>`).
  timeSavedExponentialAveragingLatestDataWeight: number,

  // TODO should we add other options for this setting?
  badgeWhatSettingToDisplayByDefault: 'none' | 'soundedSpeed' | 'silenceSpeedRaw' | 'volumeThreshold',

  // It would make more sense to remove the property entirely for browsers that don't have the desyn bug,
  // but it's a headache. Let's just wait until it's fixed everywhere. Or maybe TODO this later.
  enableDesyncCorrection: boolean,

  __lastHandledUpdateToVersion?: `${number}.${number}.${number}`,
}

// https://developer.chrome.com/apps/storage#property-onChanged-changes
export type MyStorageChanges = {
  [P in keyof Settings]?: {
    newValue?: Settings[P],
    oldValue?: Settings[P],
  }
};

export * from './enabledSettingDefaultValue';
export * from './defaultSettings';
export * from './getSettings';
export * from './setSettings';
export * from './ControllerKind';
export * from './getAbsoluteSilenceSpeed';
export * from './settingsChanges2NewValues';
export * from './togglableSettings';
export * from './onChanged';
export * from './localStorageOnlyKeys';
export * from './filterOutLocalStorageOnlySettings';
