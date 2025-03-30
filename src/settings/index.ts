/**
 * @license
 * Copyright (C) 2020, 2021, 2022  WofWca <wofwca@protonmail.com>
 *
 * This file is part of Jump Cutter Browser Extension.
 *
 * Jump Cutter Browser Extension is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * Jump Cutter Browser Extension is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with Jump Cutter Browser Extension.  If not, see <https://www.gnu.org/licenses/>.
 */

import { HotkeyBinding } from '@/hotkeys';
import { ControllerKind } from './ControllerKind';

// It is impossible to explicitly set `experimentalControllerType` to `ControllerKind.ALWAYS_SOUNDED`.
// See `AllMediaElementsController.ts`.
type SettingsControllerKind = Exclude<ControllerKind, ControllerKind.ALWAYS_SOUNDED>;

export interface Settings {
  volumeThreshold: number,
  previousVolumeThreshold: number,

  silenceSpeedSpecificationMethod: 'relativeToSoundedSpeed' | 'absolute',
  /**
   * "raw" means that we need to check {@link silenceSpeedSpecificationMethod}
   * and not simply `video.playbackRate = silenceSpeedRaw`
   */
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
  experimentalControllerType: SettingsControllerKind,
  /**
   * Why do we need this? Controller algorithms are quite different and each have their advantages and disadvantages,
   * which need to be considered when choosing settings such as margin(Before|After). For example, some people may hate
   * audio distortion that is caused by the way marginBefore works in specifically the stretching algorithm, so they
   * may want to set it to 0 for that algorithm specifically, while choosing a different value for the cloning algorithm
   * as it is devoid of such a disadvantage.
   *
   * May want to replace this with a list of settings keys and rename it in the future.
   * Because we also already added `volumeThreshold` to the list.
   */
  useSeparateMarginSettingsForDifferentAlgorithms: boolean,
  // Settings for the currently active algorithm are not synced (just in case you decided to use them).
  // Which is a bit confusing and wasteful in terms of storage space. But not too bad.
  algorithmSpecificSettings: {
    [P in SettingsControllerKind]: {
      [P in keyof Pick<
        Settings,
        'volumeThreshold' | 'marginBefore' | 'marginAfter'
      >]: Settings[P];
    };
  },

  applyTo: 'videoOnly' | 'audioOnly' | 'both',

  /**
   * This is to solve the following issues:
   * * A lot of websites (Instagram, Twitter) auto-play their media, but have them initially muted. Attaching to them
   * makes them play at silenceSpeed, which is quite annoying.
   * * Some media elements are not even supposed to play audio (like some fancy backgrounds on some fancy designer's
   * website).
   */
  omitMutedElements: boolean,

  /**
   * See the comments in `getAppropriateControllerType`:
   * https://github.com/WofWca/jumpcutter/blob/f9cafdc59e042674e494482abe2f0f3dc955e695/src/content/AllMediaElementsController.ts#L67-L77
   */
  dontAttachToCrossOriginMedia: boolean,

  enableHotkeys: boolean,
  hotkeys: HotkeyBinding[],

  /**
   * In case input controls and hotkeys are intersecting in popup.
   * kind of looks like a half-assed solution, no? TODO.
   */
  popupDisableHotkeysWhileInputFocused: boolean,
  /**
   * This comes in especially handy when `popupDisableHotkeysWhileInputFocused === true`.
   * TODO but when `popupDisableHotkeysWhileInputFocused === true && popupAutofocusEnabledInput === true` it is
   * practically impossible to use hotkeys in the popup as removing focus is done with "Esc", which also closes the
   * popup. These options are considered "Advanced" so I think we can remove then without worrying too much.
   */
  popupAutofocusEnabledInput: boolean,
  popupChartWidthPx: number,
  popupChartHeightPx: number,
  popupChartLengthInSeconds: number,
  /** Expressed as a percentage. */
  popupChartJumpPeriod: number,
  popupChartSpeed: 'realTime' | 'intrinsicTime' | 'soundedSpeedTime', // TODO add 'intrinsicTimeRelativeToSounded'
  popupAlwaysShowOpenLocalFileLink: boolean,

  popupVolumeThresholdMin: number,
  popupVolumeThresholdMax: number,
  popupVolumeThresholdStep: number,

  popupSoundedSpeedMin: number,
  popupSoundedSpeedMax: number,
  popupSoundedSpeedStep: number,

  popupSilenceSpeedRawMin: number,
  popupSilenceSpeedRawMax: number,
  popupSilenceSpeedRawStep: number,

  popupMarginBeforeMin: number,
  popupMarginBeforeMax: number,
  popupMarginBeforeStep: number,

  popupMarginAfterMin: number,
  popupMarginAfterMax: number,
  popupMarginAfterStep: number,

  // But `overrideWebsiteHotkeys` is not applicable to popup-specific hotkeys.
  // TODO refactor use `Array<Omit<HotkeyBinding, 'overrideWebsiteHotkeys'>>`?
  popupSpecificHotkeys: HotkeyBinding[],

  timeSavedAveragingMethod: 'all-time' | 'exponential',
  // This may not be the most accurate name for an exponential averaging window. TODO refactor?
  timeSavedAveragingWindowLength: number,
  /**
   * When the averaging window is an exponential window, how much weight does the interval of length
   * `timeSavedAveragingWindowLength` has to possess (compared to the resulting average value) (so data older than
   * `timeSavedAveragingWindowLength` has weight of as little as `1 - <this value>`).
   */
  timeSavedExponentialAveragingLatestDataWeight: number,

  // TODO should we add other options for this setting?
  badgeWhatSettingToDisplayByDefault: 'none' | 'soundedSpeed' | 'silenceSpeedRaw' | 'volumeThreshold',

  enableDesyncCorrection: boolean,

  onPlaybackRateChangeFromOtherScripts: 'prevent' | 'updateSoundedSpeed' | 'doNothing',

  __lastHandledUpdateToVersion?: `${number}.${number}.${number}`,

  advancedMode: boolean,
  simpleSlider: number,

  /**
   * Whether we should skip sounded (loud) parts instead of silent parts.
   *
   * This is only supported by the cloning algorithm.
   */
  oppositeDayMode: OppositeDayMode
}

export const enum OppositeDayMode {
  /**
   * The user (probably) isn't aware of the "opposite day mode".
   * We have either not shown it anywhere yet, or we did show it,
   * but the user hasn't interacted with it.
   */
  UNDISCOVERED = 'undiscovered',
  ON = 'on',
  OFF = 'off',
  /**
   * The user has hidden the checkbox from the popup,
   * by toggling a setting on the options page.
   */
  HIDDEN_BY_USER = 'hiddenByUser',
}

export const OppositeDayMode_UNDISCOVERED = OppositeDayMode.UNDISCOVERED;
export const OppositeDayMode_ON = OppositeDayMode.ON;
export const OppositeDayMode_OFF = OppositeDayMode.OFF;
export const OppositeDayMode_HIDDEN_BY_USER = OppositeDayMode.HIDDEN_BY_USER;

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
export * from './getAbsoluteClampedSilenceSpeed';
export * from './settingsChanges2NewValues';
export * from './togglableSettings';
export * from './onChanged';
export * from './localStorageOnlyKeys';
export * from './filterOutLocalStorageOnlySettings';
export * from './changeAlgorithmAndMaybeRelatedSettings';
export * from './popupAdjustableRangeInputs';
