import type { Settings, PerTabOverrides } from '@/settings';
import type { FloatingPillUiState } from '@/core/messaging/contracts';

export const STORAGE_SCHEMA_VERSION = 2 as const;
export const STORAGE_SCHEMA_VERSION_KEY = '__jumpCutterSchemaVersion';
export const STORAGE_V2_GLOBAL_SETTINGS_KEY = 'v2_globalSettings';
export const STORAGE_V2_SITE_OVERRIDES_KEY = 'v2_siteOverrides';
export const STORAGE_V2_TAB_OVERRIDES_KEY = 'v2_tabOverrides';
export const STORAGE_V2_TAB_UI_STATE_KEY = 'v2_tabUiState';
export const STORAGE_V2_STATS_BY_TAB_KEY = 'v2_statsByTab';

export interface SiteOverrides {
  [hostname: string]: Partial<Settings>;
}

export interface TabOverrides {
  [tabId: string]: PerTabOverrides;
}

export interface StatsByTab {
  [tabId: string]: {
    timeSavedMs: number;
    silenceMs: number;
  };
}

export interface TabUiStateByTab {
  [tabId: string]: FloatingPillUiState;
}

export interface SettingsV2Envelope {
  schemaVersion: typeof STORAGE_SCHEMA_VERSION;
  globalSettings: Partial<Settings>;
  siteOverrides: SiteOverrides;
  tabOverrides: TabOverrides;
  tabUiStateByTab: TabUiStateByTab;
  statsByTab: StatsByTab;
}
