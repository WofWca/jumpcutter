import type { Settings, PerTabOverrides } from '@/settings';
import type { FloatingPillUiState } from '@/core/messaging/contracts';
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

const area = chrome.storage.local;

export async function getStorageSchemaVersion(): Promise<number | undefined> {
  const result = await area.get(STORAGE_SCHEMA_VERSION_KEY);
  return result[STORAGE_SCHEMA_VERSION_KEY] as number | undefined;
}

export async function setStorageSchemaVersion(version: number): Promise<void> {
  await area.set({ [STORAGE_SCHEMA_VERSION_KEY]: version });
}

export async function getV2GlobalSettings(): Promise<Partial<Settings>> {
  const result = await area.get(STORAGE_V2_GLOBAL_SETTINGS_KEY);
  return (result[STORAGE_V2_GLOBAL_SETTINGS_KEY] || {}) as Partial<Settings>;
}

export async function setV2GlobalSettings(settings: Partial<Settings>): Promise<void> {
  await area.set({ [STORAGE_V2_GLOBAL_SETTINGS_KEY]: settings });
}

export async function getV2SiteOverrides(): Promise<SiteOverrides> {
  const result = await area.get(STORAGE_V2_SITE_OVERRIDES_KEY);
  return (result[STORAGE_V2_SITE_OVERRIDES_KEY] || {}) as SiteOverrides;
}

export async function setV2SiteOverrides(overrides: SiteOverrides): Promise<void> {
  await area.set({ [STORAGE_V2_SITE_OVERRIDES_KEY]: overrides });
}

export async function getV2TabOverrides(): Promise<TabOverrides> {
  const result = await area.get(STORAGE_V2_TAB_OVERRIDES_KEY);
  return (result[STORAGE_V2_TAB_OVERRIDES_KEY] || {}) as TabOverrides;
}

export async function setV2TabOverrides(overrides: TabOverrides): Promise<void> {
  await area.set({ [STORAGE_V2_TAB_OVERRIDES_KEY]: overrides });
}

export async function getV2TabUiStateByTab(): Promise<TabUiStateByTab> {
  const result = await area.get(STORAGE_V2_TAB_UI_STATE_KEY);
  return (result[STORAGE_V2_TAB_UI_STATE_KEY] || {}) as TabUiStateByTab;
}

export async function setV2TabUiStateByTab(state: TabUiStateByTab): Promise<void> {
  await area.set({ [STORAGE_V2_TAB_UI_STATE_KEY]: state });
}

export async function getV2StatsByTab(): Promise<StatsByTab> {
  const result = await area.get(STORAGE_V2_STATS_BY_TAB_KEY);
  return (result[STORAGE_V2_STATS_BY_TAB_KEY] || {}) as StatsByTab;
}

export async function setV2StatsByTab(statsByTab: StatsByTab): Promise<void> {
  await area.set({ [STORAGE_V2_STATS_BY_TAB_KEY]: statsByTab });
}

export async function setV2TabOverride(tabId: number, override: PerTabOverrides): Promise<void> {
  const existing = await getV2TabOverrides();
  existing[String(tabId)] = override;
  await setV2TabOverrides(existing);
}

export async function getV2TabOverride(tabId: number): Promise<PerTabOverrides | undefined> {
  const all = await getV2TabOverrides();
  return all[String(tabId)];
}

export async function removeV2TabOverride(tabId: number): Promise<void> {
  const all = await getV2TabOverrides();
  delete all[String(tabId)];
  await setV2TabOverrides(all);
}

export async function getV2TabUiState(tabId: number): Promise<FloatingPillUiState | undefined> {
  const all = await getV2TabUiStateByTab();
  return all[String(tabId)];
}

export async function setV2TabUiState(tabId: number, state: FloatingPillUiState): Promise<void> {
  const all = await getV2TabUiStateByTab();
  all[String(tabId)] = state;
  await setV2TabUiStateByTab(all);
}

export async function ensureSchemaVersion2(): Promise<void> {
  await setStorageSchemaVersion(STORAGE_SCHEMA_VERSION);
}
