import type { Settings } from '@/settings';
import browser from '@/webextensions-api';

export default async function (): Promise<void> {
  const newSettings: Partial<Settings> = {};

  // `popupChartJumpPeriod` is now expressed as a fraction of `popupChartLengthInSeconds`.
  const { popupChartLengthInSeconds, popupChartJumpPeriod } = await browser.storage.local.get({
    popupChartLengthInSeconds: 8,
    popupChartJumpPeriod: 0,
  });
  let percent = popupChartJumpPeriod / popupChartLengthInSeconds * 100;
  const sane = 0 <= percent && percent <= 100;
  if (!sane) {
    percent = 0;
  }
  newSettings.popupChartJumpPeriod = percent;

  // Just the new default.
  newSettings.popupChartSpeed = 'soundedSpeedTime';

  await browser.storage.local.set(newSettings);
}
