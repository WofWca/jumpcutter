import { describe, expect, it } from 'vitest';
import {
  extractSiteOverrides,
  extractStats,
  extractTabUiState,
  extractTabOverrides,
  pickGlobalSettings,
} from '../src/core/storage/migrateLegacy';

describe('storage migration helpers', () => {
  it('picks only known global settings keys', () => {
    const picked = pickGlobalSettings({
      soundedSpeed: 1.5,
      enabled: false,
      randomKey: 'ignore-me',
    });
    expect(picked).toMatchObject({
      soundedSpeed: 1.5,
      enabled: false,
    });
    expect('randomKey' in picked).toBe(false);
  });

  it('extracts tab overrides from perTab_ keys', () => {
    const tabOverrides = extractTabOverrides({
      perTab_42: { soundedSpeed: 2, enabled: true },
      'perSite_example.com': { enabled: false },
    });
    expect(tabOverrides).toEqual({
      '42': { soundedSpeed: 2, enabled: true },
    });
  });

  it('extracts site overrides from perSite_ keys', () => {
    const siteOverrides = extractSiteOverrides({
      'perSite_youtube.com': { silenceSpeedRaw: 3 },
      perTab_42: { silenceSpeedRaw: 4 },
    });
    expect(siteOverrides).toEqual({
      'youtube.com': { silenceSpeedRaw: 3 },
    });
  });

  it('extracts v2 stats payload safely', () => {
    const stats = extractStats({
      v2_statsByTab: {
        '12': { timeSavedMs: 1000, silenceMs: 3000 },
      },
    });
    expect(stats).toEqual({
      '12': { timeSavedMs: 1000, silenceMs: 3000 },
    });
    expect(extractStats({})).toEqual({});
  });

  it('extracts floating pill UI state from legacy keys', () => {
    const stateByTab = extractTabUiState({
      floatingPill_tab_42: { x: 10, y: 20, open: true },
      perTab_42: { soundedSpeed: 2 },
    });
    expect(stateByTab).toEqual({
      '42': { x: 10, y: 20, open: true },
    });
  });
});
