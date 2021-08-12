import type { Settings as ExtensionSettings } from '@/settings';
import type { ControllerSettings } from './StretchingController/StretchingController';
import { getAbsoluteSilenceSpeed } from '@/settings';

export default function extensionSettings2ControllerSettings(extensionSettings: ExtensionSettings): ControllerSettings {
  return {
    // So we don't have to copy all the properties with `...extensionSettings`.
    soundedSpeed: extensionSettings.soundedSpeed,
    volumeThreshold: extensionSettings.volumeThreshold,
    marginBefore: extensionSettings.marginBefore,
    marginAfter: extensionSettings.marginAfter,
    muteSilence: extensionSettings.muteSilence,
    enableDesyncCorrection: extensionSettings.enableDesyncCorrection,

    silenceSpeed: getAbsoluteSilenceSpeed(extensionSettings),
  };
}
