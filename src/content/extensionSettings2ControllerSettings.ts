import type { Settings as ExtensionSettings } from '@/settings';
import type { ControllerSettings } from './Controller';
import { getAbsoluteSilenceSpeed } from '@/settings';

export default function extensionSettings2ControllerSettings(extensionSettings: ExtensionSettings): ControllerSettings {
  return {
    // So we don't have to copy all the properties with `...extensionSettings`.
    soundedSpeed: extensionSettings.soundedSpeed,
    volumeThreshold: extensionSettings.volumeThreshold,
    marginBefore: extensionSettings.marginBefore,
    marginAfter: extensionSettings.marginAfter,
    enableDesyncCorrection: extensionSettings.enableDesyncCorrection,

    silenceSpeed: getAbsoluteSilenceSpeed(extensionSettings),
  };
}
