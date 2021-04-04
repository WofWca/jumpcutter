import { storage } from './_storage';
import type { Settings } from './';

export async function setSettings(items: Partial<Settings>): Promise<void> {
  return new Promise(r => storage.set(items, r));
}
