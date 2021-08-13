import { enabledSettingDefaultValue } from './';
import type { Settings } from './';
import { ControllerKind } from './ControllerKind';
import { HotkeyAction } from '@/hotkeys';

export const defaultSettings: Readonly<Settings> = {
  experimentalControllerType: ControllerKind.STRETCHING,

  volumeThreshold:          0.010,
  previousVolumeThreshold:  0.010,
  silenceSpeedSpecificationMethod: 'relativeToSoundedSpeed',
  silenceSpeedRaw:         2.5,
  previousSilenceSpeedRaw: 2.5,
  soundedSpeed:         1.5,
  previousSoundedSpeed: 1.5,
  enabled: enabledSettingDefaultValue,
  // Seems like new users get immediately scared by the sound distortion the extension causes, so let's let users
  // enable marginBefore manually IF they start noticing that they need it.
  marginBefore:         0,
  previousMarginBefore: 0,
  marginAfter:          0.100,
  previousMarginAfter:  0.100,

  applyTo: 'videoOnly',

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
      actionArgument: 0.002,
    },
    {
      keyCombination: { code: 'KeyE', },
      action: HotkeyAction.INCREASE_VOLUME_THRESHOLD,
      actionArgument: 0.002,
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
  popupChartHeightPx: 75,
  popupChartLengthInSeconds: 4,
  popupAlwaysShowOpenLocalFileLink: true,
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

  enableDesyncCorrection: BUILD_DEFINITIONS.BROWSER === 'chromium' ? true : false,
};
