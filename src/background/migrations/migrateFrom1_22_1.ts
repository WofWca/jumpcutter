import type { Settings } from '@/settings';
import browser from '@/webextensions-api';

export default async function (): Promise<void> {
  const newSettings: Partial<Settings> = { popupChartSpeed: 'soundedSpeedTime' };
  await browser.storage.local.set(newSettings);
}
