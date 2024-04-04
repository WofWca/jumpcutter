/**
 * @license
 * Copyright (C) 2021, 2022  WofWca <wofwca@protonmail.com>
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

import { enabledSettingDefaultValue } from './';
import type { Settings } from './';
import { ControllerKind } from './ControllerKind';
import { HotkeyAction } from '@/hotkeys';
import { getGeckoLikelyMaxNonMutedPlaybackRate } from '@/helpers';

const ElementPlaybackControllerStretchingSpecificDefaults = {
  marginBefore: 0,
  marginAfter: 0.100,
} as const;

export const defaultSettings: Readonly<Settings> = {
  volumeThreshold:          0.005,
  previousVolumeThreshold:  0.005,
  silenceSpeedSpecificationMethod: 'relativeToSoundedSpeed',
  silenceSpeedRaw:         2.5,
  previousSilenceSpeedRaw: 2.5,
  // Argument for `soundedSpeed !== 1`:
  // * It reminds the user that the extension is enabled, so he's not confused by media getting seeked seemingly
  // randomly.
  // * It shows the user that there is such functionality.
  // * People who have installed this extension are expected to prefer a faster `soundedSpeed`.
  // Arguments agains:
  // * At a first glance you may think that if videos are being playing at a faster speed then it means
  // that the extension thinks that the whole video is silent and is trying to skip silence this way.
  // * It's better to start simple and not force the user to go to settings if they don't like
  // `soundedSpeed !== 1`.
  soundedSpeed:         1,
  previousSoundedSpeed: 1,
  enabled: enabledSettingDefaultValue,
  // Seems like new users get immediately scared by the sound distortion the extension causes, so let's let users
  // enable marginBefore manually IF they start noticing that they need it.
  marginBefore:         ElementPlaybackControllerStretchingSpecificDefaults.marginBefore,
  previousMarginBefore: ElementPlaybackControllerStretchingSpecificDefaults.marginBefore,
  marginAfter:          ElementPlaybackControllerStretchingSpecificDefaults.marginAfter,
  previousMarginAfter:  ElementPlaybackControllerStretchingSpecificDefaults.marginAfter,

  experimentalControllerType: ControllerKind.STRETCHING,
  useSeparateMarginSettingsForDifferentAlgorithms: true,
  algorithmSpecificSettings: {
    [ControllerKind.CLONING]: {
      marginBefore: 0.050,
      marginAfter: 0.030,
    },
    [ControllerKind.STRETCHING]: {
      ...ElementPlaybackControllerStretchingSpecificDefaults,
    },
  },

  applyTo: 'videoOnly',

  omitMutedElements: true,

  dontAttachToCrossOriginMedia: true,

  enableHotkeys: true,
  // TODO some code here is pretty WET, like duplicate hotkeys. DRY?
  hotkeys: [
    // Rewind/advance +
    {
      keyCombination: { code: 'KeyX', },
      action: HotkeyAction.REWIND,
      actionArgument: 5,
    },
    {
      keyCombination: { code: 'KeyC', },
      overrideWebsiteHotkeys: true, // Because on YouTube "C" toggles subtitles.
      action: HotkeyAction.ADVANCE,
      actionArgument: 5,
    },

    // soundedSpeed
    {
      keyCombination: { code: 'KeyS', },
      action: HotkeyAction.DECREASE_SOUNDED_SPEED,
      actionArgument: 0.25,
    },
    {
      keyCombination: { code: 'KeyD', },
      action: HotkeyAction.INCREASE_SOUNDED_SPEED,
      actionArgument: 0.25,
    },
    {
      keyCombination: { code: 'KeyA', },
      action: HotkeyAction.TOGGLE_SOUNDED_SPEED,
      actionArgument: 1,
    },

    // silenceSpeed
    {
      keyCombination: { code: 'KeyS', modifiers: ['shiftKey'], },
      action: HotkeyAction.DECREASE_SILENCE_SPEED,
      actionArgument: 0.25,
    },
    {
      keyCombination: { code: 'KeyD', modifiers: ['shiftKey'], },
      action: HotkeyAction.INCREASE_SILENCE_SPEED,
      actionArgument: 0.25,
    },
    {
      keyCombination: { code: 'KeyA', modifiers: ['shiftKey'], },
      action: HotkeyAction.TOGGLE_SILENCE_SPEED,
      actionArgument: 2.5,
    },

    // volumeThreshold
    {
      keyCombination: { code: 'KeyW', },
      action: HotkeyAction.DECREASE_VOLUME_THRESHOLD,
      actionArgument: 0.001,
    },
    {
      keyCombination: { code: 'KeyE', },
      action: HotkeyAction.INCREASE_VOLUME_THRESHOLD,
      actionArgument: 0.001,
    },
    {
      keyCombination: { code: 'KeyQ', },
      action: HotkeyAction.TOGGLE_VOLUME_THRESHOLD,
      actionArgument: 0,
    },
    {
      keyCombination: { code: 'KeyW', modifiers: ['shiftKey'], },
      action: HotkeyAction.DECREASE_VOLUME_THRESHOLD,
      actionArgument: 0.010,
    },
    {
      keyCombination: { code: 'KeyE', modifiers: ['shiftKey'], },
      action: HotkeyAction.INCREASE_VOLUME_THRESHOLD,
      actionArgument: 0.010,
    },

    // In case you coulnd't make it out. Practically turns on/off the extension. Why not actually turn it on/off?
    // Because
    // * We don't have such a hotkey action yet.
    // * Hotkeys would also cease to work if we'd disable it.
    // * It would create an audio glitch (at best), at worst it would remove/add audio delay (becaouse of how
    // marginBefore) works.
    // * It's computationally heavy.
    // TODO these problems sound like then can be solved.
    {
      keyCombination: { code: 'KeyZ', },
      action: HotkeyAction.TOGGLE_VOLUME_THRESHOLD,
      actionArgument: 0,
    },
    {
      keyCombination: { code: 'KeyZ', },
      action: HotkeyAction.SET_SOUNDED_SPEED,
      actionArgument: 1,
    },
  ],

  popupDisableHotkeysWhileInputFocused: true,
  popupAutofocusEnabledInput: false,
  popupChartWidthPx: 400,
  popupChartHeightPx: 50,
  popupChartLengthInSeconds: 8,
  // TODO maybe even if `popupChartSpeed === 'intrinsicTime'` the period still should be in real time?
  // At least as an option? But we're now expressing it as a fraction of chart length.
  popupChartJumpPeriod: 0,
  popupChartSpeed: 'soundedSpeedTime',
  popupAlwaysShowOpenLocalFileLink: true,

  // Remember that "step" also controls what the input does when you control it with the keyboard,
  // aside from the mouse.
  popupVolumeThresholdMin: 0,
  popupVolumeThresholdMax: 0.050,
  popupVolumeThresholdStep: 0.0001,

  popupSoundedSpeedMin: 0.25,
  popupSoundedSpeedMax: 4, // BUILD_DEFINITIONS.BROWSER === 'gecko' ? getGeckoLikelyMaxNonMutedPlaybackRate()
  popupSoundedSpeedStep: 0.25,

  popupSilenceSpeedRawMin: 1,
  // See the comment in `getAbsoluteClampedSilenceSpeed` definition on why `max` is different
  // for different browsers.
  popupSilenceSpeedRawMax: BUILD_DEFINITIONS.BROWSER === 'gecko'
    // But if the browser gets upgraded, this will remain at 4. Doesn't matter?
    ? Math.min(8, getGeckoLikelyMaxNonMutedPlaybackRate())
    : 8,
  popupSilenceSpeedRawStep: 0.25,

  popupMarginBeforeMin: 0,
  popupMarginBeforeMax: 0.5,
  popupMarginBeforeStep: 0.010,

  popupMarginAfterMin: 0,
  popupMarginAfterMax: 0.5,
  popupMarginAfterStep: 0.010,

  popupSpecificHotkeys: [
    {
      keyCombination: { code: 'Space', },
      action: HotkeyAction.TOGGLE_PAUSE,
    },
    {
      keyCombination: { code: 'ArrowLeft' },
      action: HotkeyAction.REWIND,
      actionArgument: 5,
    },
    {
      keyCombination: { code: 'ArrowRight' },
      action: HotkeyAction.ADVANCE,
      actionArgument: 5,
    },
    {
      keyCombination: { code: 'ArrowUp' },
      action: HotkeyAction.INCREASE_VOLUME,
      actionArgument: 5,
    },
    {
      keyCombination: { code: 'ArrowDown' },
      action: HotkeyAction.DECREASE_VOLUME,
      actionArgument: 5,
    },
  ],

  timeSavedAveragingMethod: 'exponential',
  timeSavedAveragingWindowLength: 600,
  timeSavedExponentialAveragingLatestDataWeight: 0.95,

  badgeWhatSettingToDisplayByDefault: 'soundedSpeed',

  enableDesyncCorrection: BUILD_DEFINITIONS.BROWSER_MAY_HAVE_AUDIO_DESYNC_BUG
    // 2025-08-01. In case I get hit by a bus. I sure hope they'll fix it by that time.
    // https://bugs.chromium.org/p/chromium/issues/detail?id=1231093
    ? Date.now() < 1754006400000
    : false,

  onPlaybackRateChangeFromOtherScripts: 'updateSoundedSpeed',
};
