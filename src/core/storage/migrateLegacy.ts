import type { Settings, PerTabOverrides } from '@/settings';
import type { FloatingPillUiState } from '@/core/messaging/contracts';
import { defaultSettings } from '@/settings';
import {
  STORAGE_SCHEMA_VERSION,
  STORAGE_SCHEMA_VERSION_KEY,
  STORAGE_V2_GLOBAL_SETTINGS_KEY,
  STORAGE_V2_SITE_OVERRIDES_KEY,
  STORAGE_V2_TAB_OVERRIDES_KEY,
  STORAGE_V2_TAB_UI_STATE_KEY,
  STORAGE_V2_STATS_BY_TAB_KEY,
  SiteOverrides,
  StatsByTab,
  TabUiStateByTab,
  TabOverrides,
} from './schema';

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function isFloatingPillUiState(value: unknown): value is FloatingPillUiState {
  if (!isPlainObject(value)) return false;
  return (
    typeof value.x === 'number' &&
    typeof value.y === 'number' &&
    typeof value.open === 'boolean'
  );
}

export function pickGlobalSettings(allValues: Record<string, unknown>): Partial<Settings> {
  const result: Partial<Settings> = {};
  const defaultKeys = Object.keys(defaultSettings) as Array<keyof Settings>;
  for (const key of defaultKeys) {
    if (Object.prototype.hasOwnProperty.call(allValues, key)) {
      (result as Record<string, unknown>)[key] = allValues[key];
    }
  }
  return result;
}

export function extractTabOverrides(allValues: Record<string, unknown>): TabOverrides {
  const tabOverrides: TabOverrides = {};
  for (const [key, value] of Object.entries(allValues)) {
    if (!key.startsWith('perTab_') || !isPlainObject(value)) continue;
    const tabId = key.slice('perTab_'.length);
    tabOverrides[tabId] = value as PerTabOverrides;
  }
  return tabOverrides;
}

export function extractSiteOverrides(allValues: Record<string, unknown>): SiteOverrides {
  const siteOverrides: SiteOverrides = {};
  for (const [key, value] of Object.entries(allValues)) {
    if (!key.startsWith('perSite_') || !isPlainObject(value)) continue;
    const hostname = key.slice('perSite_'.length);
    siteOverrides[hostname] = value as Partial<Settings>;
  }
  return siteOverrides;
}

export function extractStats(allValues: Record<string, unknown>): StatsByTab {
  const stats = allValues.v2_statsByTab;
  if (isPlainObject(stats)) {
    return stats as StatsByTab;
  }
  return {};
}

export function extractTabUiState(allValues: Record<string, unknown>): TabUiStateByTab {
  const stateByTab: TabUiStateByTab = {};
  for (const [key, value] of Object.entries(allValues)) {
    if (!key.startsWith('floatingPill_tab_') || !isFloatingPillUiState(value)) continue;
    const tabId = key.slice('floatingPill_tab_'.length);
    stateByTab[tabId] = value;
  }
  return stateByTab;
}

export async function runLegacyStorageMigrationToV2(): Promise<boolean> {
  const area = chrome.storage.local;
  const schemaVersion = (await area.get(STORAGE_SCHEMA_VERSION_KEY))[STORAGE_SCHEMA_VERSION_KEY];
  if (typeof schemaVersion === 'number' && schemaVersion >= STORAGE_SCHEMA_VERSION) {
    return false;
  }

  const allValues = await area.get(null) as Record<string, unknown>;
  const globalSettings = pickGlobalSettings(allValues);
  const siteOverrides = extractSiteOverrides(allValues);
  const tabOverrides = extractTabOverrides(allValues);
  const tabUiStateByTab = extractTabUiState(allValues);
  const statsByTab = extractStats(allValues);

  await area.set({
    [STORAGE_V2_GLOBAL_SETTINGS_KEY]: globalSettings,
    [STORAGE_V2_SITE_OVERRIDES_KEY]: siteOverrides,
    [STORAGE_V2_TAB_OVERRIDES_KEY]: tabOverrides,
    [STORAGE_V2_TAB_UI_STATE_KEY]: tabUiStateByTab,
    [STORAGE_V2_STATS_BY_TAB_KEY]: statsByTab,
    [STORAGE_SCHEMA_VERSION_KEY]: STORAGE_SCHEMA_VERSION,
  });

  return true;
}
