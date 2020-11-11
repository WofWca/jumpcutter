import { HotkeyBinding, HotkeyAction } from './hotkeys';

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

  enableDesyncCorrection: boolean,
}

export function getAbsoluteSilenceSpeed(settings: Settings): number {
  return settings.silenceSpeedSpecificationMethod === 'relativeToSoundedSpeed'
    ? settings.silenceSpeedRaw * settings.soundedSpeed
    : settings.silenceSpeedRaw;
}

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

export const defaultSettings: Readonly<Settings> = {
  volumeThreshold:          0.010,
  previousVolumeThreshold:  0.010,
  silenceSpeedSpecificationMethod: 'relativeToSoundedSpeed',
  silenceSpeedRaw:         2.5,
  previousSilenceSpeedRaw: 2.5,
  soundedSpeed:         1.5,
  previousSoundedSpeed: 1.5,
  enabled: true,
  marginBefore:         0.100,
  previousMarginBefore: 0.100,
  marginAfter:          0.100,
  previousMarginAfter:  0.100,

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

    // volumeThreshold
    {
      keyCombination: { code: 'KeyQ', },
      action: HotkeyAction.TOGGLE_VOLUME_THRESHOLD,
      actionArgument: 0,
    },
    {
      keyCombination: { code: 'KeyE', },
      action: HotkeyAction.INCREASE_VOLUME_THRESHOLD,
      actionArgument: 0.001,
    },
    {
      keyCombination: { code: 'KeyW', },
      action: HotkeyAction.DECREASE_VOLUME_THRESHOLD,
      actionArgument: 0.001,
    },

    // soundedSpeed
    {
      keyCombination: { code: 'KeyA', },
      action: HotkeyAction.TOGGLE_SOUNDED_SPEED,
      actionArgument: 1,
    },
    {
      keyCombination: { code: 'KeyD', },
      action: HotkeyAction.INCREASE_SOUNDED_SPEED,
      actionArgument: 0.25,
    },
    {
      keyCombination: { code: 'KeyS', },
      action: HotkeyAction.DECREASE_SOUNDED_SPEED,
      actionArgument: 0.25,
    },

    // silenceSpeed
    {
      keyCombination: { code: 'KeyA', modifiers: ['shiftKey'], },
      action: HotkeyAction.TOGGLE_SILENCE_SPEED,
      actionArgument: 2.5,
    },
    {
      keyCombination: { code: 'KeyD', modifiers: ['shiftKey'], },
      action: HotkeyAction.INCREASE_SILENCE_SPEED,
      actionArgument: 0.25,
    },
    {
      keyCombination: { code: 'KeyS', modifiers: ['shiftKey'], },
      action: HotkeyAction.DECREASE_SILENCE_SPEED,
      actionArgument: 0.25,
    },

    //marginBefore
    {
      keyCombination: { code: 'KeyB', },
      action: HotkeyAction.INCREASE_MARGIN_BEFORE,
      actionArgument: 0.020,
    },
    {
      keyCombination: { code: 'KeyV', },
      action: HotkeyAction.DECREASE_MARGIN_BEFORE,
      actionArgument: 0.020,
    },

    //marginAfter
    {
      keyCombination: { code: 'KeyB', modifiers: ['shiftKey'], },
      action: HotkeyAction.INCREASE_MARGIN_AFTER,
      actionArgument: 0.020,
    },
    {
      keyCombination: { code: 'KeyV', modifiers: ['shiftKey'], },
      action: HotkeyAction.DECREASE_MARGIN_AFTER,
      actionArgument: 0.020,
    },
  ],

  popupDisableHotkeysWhileInputFocused: false,
  popupAutofocusEnabledInput: false,
  popupChartWidthPx: 400,
  popupChartHeightPx: 150,
  popupChartLengthInSeconds: 4,

  enableDesyncCorrection: true,
};

// https://developer.chrome.com/apps/storage#property-onChanged-changes
export type MyStorageChanges = {
  [P in keyof Settings]?: {
    newValue?: Settings[P],
    oldValue?: Settings[P],
  }
};

const storage = chrome.storage.local;

export async function getSettings(): Promise<Settings> {
  return new Promise(r => storage.get(defaultSettings, r as any))
}
export async function setSettings(items: Partial<Settings>): Promise<void> {
  return new Promise(r => storage.set(items, r));
}
type MyOnChangedListener = (changes: MyStorageChanges) => void;
type NativeOnChangedListener = Parameters<typeof chrome.storage.onChanged.addListener>[0];
const srcListenerToWrapperListener = new WeakMap<MyOnChangedListener, NativeOnChangedListener>();
/**
 * This is a wrapper around the native `chrome.storage.onChanged.addListener`. The reason we need this is so listeners
 * attached using it only react to changes in `local` storage, but not `sync` (or others). See `src/background.ts`.
 */
export function addOnChangedListener(listener: MyOnChangedListener): void {
  const actualListener: NativeOnChangedListener = (changes, areaName) => {
    if (areaName !== 'local') return;
    listener(changes);
  };
  srcListenerToWrapperListener.set(listener, actualListener);
  chrome.storage.onChanged.addListener(actualListener);
}
export function removeOnChangedListener(listener: MyOnChangedListener): void {
  const actualListener = srcListenerToWrapperListener.get(listener);
  if (!actualListener) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn('Did not remove listener because it\'s already not attached');
    }
    return;
  }
  chrome.storage.onChanged.removeListener(actualListener);
}

export function settingsChanges2NewValues(changes: MyStorageChanges): Partial<Settings> {
  const newValues: Partial<Settings> = {};
  for (const [settingName, change] of Object.entries(changes)) {
    (newValues[settingName as keyof Settings] as any) = change!.newValue;
  }
  return newValues;
}
