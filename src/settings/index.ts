import { HotkeyBinding } from '@/hotkeys';
import { ControllerKind } from './ControllerKind';

export interface Settings {
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

  // TODO I made this purely for testing. For release we'll probably need something better.
  experimentalControllerType: ControllerKind,
  // Why do we need this? Controller algorithms are quite different and each have their advantages and disadvantages,
  // which need to be considered when choosing settings such as margin(Before|After). For example, some people may hate
  // audio distortion that is caused by the way marginBefore works in specifically the stretching algorithm, so they
  // may want to set it to 0 for that algorithm specifically, while choosing a different value for the cloning algorithm
  // as it is devoid of such a disadvantage.
  // May want to replace this with a list of settings keys and rename it in the future.
  useSeparateMarginSettingsForDifferentAlgorithms: boolean,
  // Settings for the currently active algorithm are not synced (just in case you decided to use them).
  // Which is a bit confusing and wasteful in terms of storage space. But not too bad.
  algorithmSpecificSettings: {
    [P in ControllerKind]: {
      [P in keyof Pick<Settings, 'marginBefore' | 'marginAfter'>]: Settings[P];
    };
  },

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
  popupChartSpeed: 'realTime' | 'intrinsicTime', // TODO add 'intrinsicTimeRelativeToSounded'
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
export * from './changeAlgorithmAndMaybeRelatedSettings';
