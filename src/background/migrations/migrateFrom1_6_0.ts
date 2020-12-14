// Since 1.7.0 we're going to store settings both in `chrome.storage.local` and `chrome.storage.sync`. This migration
// copies settings from sync storage to the local one.
import { defaultSettings, Settings } from "@/settings";

export default async function (): Promise<void> {
  const settings = await new Promise<Settings>(r => chrome.storage.sync.get(defaultSettings, r as any));
  await new Promise<void>(r => chrome.storage.local.set(settings, r));
}
