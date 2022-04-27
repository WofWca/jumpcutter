import type { Settings } from "./";

export function changeAlgorithmAndMaybeRelatedSettings(
  settings: Pick<Settings,
    'algorithmSpecificSettings'
    | 'useSeparateMarginSettingsForDifferentAlgorithms'
    | 'experimentalControllerType'
    | 'marginBefore'
    | 'marginAfter'
  >,
  newControllerType: Settings['experimentalControllerType']
): Partial<Settings> {
  const baseValues = {
    experimentalControllerType: newControllerType
  };
  if (!settings.useSeparateMarginSettingsForDifferentAlgorithms) {
    return baseValues;
  } else {
    const oldControllerType = settings.experimentalControllerType;
    return {
      ...baseValues,
      ...settings.algorithmSpecificSettings[newControllerType],
      algorithmSpecificSettings: {
        ...settings.algorithmSpecificSettings,
        [oldControllerType]: {
          marginBefore: settings.marginBefore,
          marginAfter: settings.marginAfter,
        }
      },
    };
  }
}