import { describe, expect, it } from 'vitest';
import { getEffectiveSettings } from '../src/core/storage/effectiveSettings';

describe('settings precedence', () => {
  it('applies global < site < tab precedence', () => {
    const effective = getEffectiveSettings(
      { soundedSpeed: 1.5, silenceSpeedRaw: 2.5, enabled: true },
      { soundedSpeed: 1.75, enabled: false },
      { soundedSpeed: 2.25, volumeThreshold: 0.009 }
    );

    expect(effective).toMatchObject({
      soundedSpeed: 2.25,
      silenceSpeedRaw: 2.5,
      enabled: false,
      volumeThreshold: 0.009,
    });
  });
});
