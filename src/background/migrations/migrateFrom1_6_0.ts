// Since 1.7.0 we're going to store settings both in `browser.storage.local` and `browser.storage.sync`. This migration
// copies settings from sync storage to the local one.
import browser from '@/webextensions-api';

export default async function (): Promise<void> {
  const settings = await browser.storage.sync.get();
  await browser.storage.local.set(settings);
}
