import type { PerTabOverrides, Settings } from '@/settings';

export function getEffectiveSettings(
  globalSettings: Partial<Settings>,
  siteOverride?: Partial<Settings>,
  tabOverride?: PerTabOverrides,
): Partial<Settings> {
  return {
    ...globalSettings,
    ...(siteOverride || {}),
    ...(tabOverride || {}),
  };
}
