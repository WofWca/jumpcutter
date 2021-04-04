import { getSettingsAdvanced } from './';
import { defaultSettings } from './';

export function getSettings(): ReturnType<typeof getSettingsAdvanced> {
  return getSettingsAdvanced(defaultSettings);
}
