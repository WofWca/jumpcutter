import { HotkeyBinding, HotkeyAction } from './hotkeys';

export interface Settings {
  volumeThreshold: number,
  silenceSpeed: number,
  soundedSpeed: number,
  enabled: boolean,
  enableExperimentalFeatures: boolean,
  marginBefore: number,
  marginAfter: number,

  enableHotkeys: boolean,
  hotkeys: HotkeyBinding[],
}

export const defaultSettings: Readonly<Settings> = {
  volumeThreshold: 0.010,
  silenceSpeed: 4,
  soundedSpeed: 1.5,
  enabled: true,
  enableExperimentalFeatures: false,
  marginBefore: 0.100,
  marginAfter: 0.100,

  enableHotkeys: false,
  hotkeys: [
    // volumeThreshold
    {
      keyCombination: { code: 'KeyQ', },
      action: HotkeyAction.SET_VOLUME_THRESHOLD,
      actionArgument: 0,
    },
    {
      // TODO it would be cool if we could toggle `volumeThreshold` between current value and 0, but we'd need to
      // rewrite some stuff for this.
      keyCombination: { code: 'KeyQ', modifiers: ['shiftKey'],},
      action: HotkeyAction.SET_VOLUME_THRESHOLD,
      actionArgument: 0.015,
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
      // TODO maybe some remove this one. See the button in popup.
      keyCombination: { code: 'KeyA', },
      action: HotkeyAction.SET_SOUNDED_SPEED,
      actionArgument: 1.1,
    },
    {
      keyCombination: { code: 'KeyA', modifiers: ['shiftKey', 'ctrlKey'],},
      action: HotkeyAction.SET_SOUNDED_SPEED,
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
      action: HotkeyAction.SET_SILENCE_SPEED,
      actionArgument: 3, // TODO maybe some day replace it with `1.0`.
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
