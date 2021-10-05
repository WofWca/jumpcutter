import { Settings } from '@/settings';
import browser from '@/webextensions-api';

export default async function (): Promise<void> {
  const { popupChartLengthInSeconds } = await browser.storage.local.get('popupChartLengthInSeconds');
  //  Otherwise the value key missing will be assigned from default settings.
  if (popupChartLengthInSeconds !== undefined) {
    const newValues: Partial<Settings> = {
      popupChartLengthInSeconds: popupChartLengthInSeconds * 2,
    };
    await browser.storage.local.set(newValues);
  }
}