import { enabledSettingDefaultValue } from './';
import type { Settings } from './';
import { ControllerKind } from './ControllerKind';
import { HotkeyAction } from '@/hotkeys';

const stretchingControllerSpecificDefaults = {
  marginBefore: 0,
  marginAfter: 0.100,
} as const;

export const defaultSettings: Readonly<Settings> = {
  volumeThreshold:          0.010,
  previousVolumeThreshold:  0.010,
  silenceSpeedSpecificationMethod: 'relativeToSoundedSpeed',
  silenceSpeedRaw:         2.5,
  previousSilenceSpeedRaw: 2.5,
  // Argument for `soundedSpeed !== 1`:
  // * It reminds the user that the extension is enabled, so he's not confused by media getting seeked seemingly
  // randomly.
  // * It shows the user that there is such functionality.
  // * People who have installed this extension are expected to prefer a faster `soundedSpeed`.
  soundedSpeed:         1.5,
  previousSoundedSpeed: 1.5,
  enabled: enabledSettingDefaultValue,
  // Seems like new users get immediately scared by the sound distortion the extension causes, so let's let users
  // enable marginBefore manually IF they start noticing that they need it.
  marginBefore:         stretchingControllerSpecificDefaults.marginBefore,
  previousMarginBefore: stretchingControllerSpecificDefaults.marginBefore,
  marginAfter:          stretchingControllerSpecificDefaults.marginAfter,
  previousMarginAfter:  stretchingControllerSpecificDefaults.marginAfter,

  experimentalControllerType: ControllerKind.STRETCHING,
  useSeparateMarginSettingsForDifferentAlgorithms: true,
  algorithmSpecificSettings: {
    [ControllerKind.CLONING]: {
      marginBefore: 0.050,
      marginAfter: 0.030,
    },
    [ControllerKind.STRETCHING]: {
      ...stretchingControllerSpecificDefaults,
    },
  },

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
  popupChartLengthInSeconds: 8,
  // TODO maybe we should express it as a fraction of `popupChartLengthInSeconds`?
  // TODO maybe even if `popupChartSpeed === 'intrinsicTime'` the period still should be in real time?
  // At least as an option?
  popupChartJumpPeriod: 0,
  popupChartSpeed: 'intrinsicTime',
  popupAlwaysShowOpenLocalFileLink: true,

  // Remember that "step" also controls what the input does when you control it with the keyboard,
  // aside from the mouse.
  popupVolumeThresholdMin: 0,
  popupVolumeThresholdMax: 0.050,
  popupVolumeThresholdStep: 0.0001,

  popupSoundedSpeedMin: 0.25,
  popupSoundedSpeedMax: 4, // BUILD_DEFINITIONS.BROWSER === 'gecko' ? 4
  popupSoundedSpeedStep: 0.25,

  popupSilenceSpeedRawMin: 1,
  // See the comment in `getAbsoluteClampedSilenceSpeed` definition on why `max` is different
  // for different browsers.
  popupSilenceSpeedRawMax: BUILD_DEFINITIONS.BROWSER === 'gecko' ? 4 : 8,
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

  enableDesyncCorrection: BUILD_DEFINITIONS.BROWSER === 'chromium' ? true : false,
};
