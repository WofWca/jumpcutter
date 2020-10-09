export interface Settings {
  volumeThreshold: number,
  silenceSpeed: number,
  soundedSpeed: number,
  enabled: boolean,
  enableExperimentalFeatures: boolean,
  marginBefore: number,
  marginAfter: number,
}

export const defaultSettings: Settings = {
  volumeThreshold: 0.010,
  silenceSpeed: 4,
  soundedSpeed: 1.5,
  enabled: true,
  enableExperimentalFeatures: false,
  marginBefore: 0.100,
  marginAfter: 0.100,
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
export function addOnChangedListener(listener: (changes: MyStorageChanges) => void): void {
  chrome.storage.onChanged.addListener((changes, areaName) => {
    // As said in `src/background.ts`, we primarily use `chrome.storage.local`, and `chrome.storage.sync` just copies
    // data from it.
    if (areaName !== 'local') return;
    listener(changes);
  })
}
// export function removeOnChangedListener(listener: Parameters<typeof addOnChangedListener>[0]): void {
//   chrome.storage.onChanged.removeListener(listener);
// }
