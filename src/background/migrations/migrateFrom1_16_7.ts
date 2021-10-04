import { Settings } from '@/settings';
import browser from '@/webextensions-api';

export default async function (): Promise<void> {
  const { popupChartLengthInSeconds } = await browser.storage.local.get('popupChartLengthInSeconds');
  const newValues: Partial<Settings> = {
    // `popupChartLengthInSeconds` may be `undefined`!
    popupChartLengthInSeconds: popupChartLengthInSeconds * 2,
  };
  await browser.storage.local.set(newValues);
}