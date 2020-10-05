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
