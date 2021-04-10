import type { Settings as ExtensionSettings } from '@/settings';
import type { ControllerSettings } from './Controller';
import { getAbsoluteSilenceSpeed } from '@/settings';

export default function extensionSettings2ControllerSettings(extensionSettings: ExtensionSettings): ControllerSettings {
  return {
    ...extensionSettings,
    silenceSpeed: getAbsoluteSilenceSpeed(extensionSettings),
  };
}
