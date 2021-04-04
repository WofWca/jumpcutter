import type { Settings, MyStorageChanges } from './';

export function settingsChanges2NewValues(changes: MyStorageChanges): Partial<Settings> {
  const newValues: Partial<Settings> = {};
  for (const [settingName, change] of Object.entries(changes)) {
    (newValues[settingName as keyof Settings] as any) = change!.newValue;
  }
  return newValues;
}
