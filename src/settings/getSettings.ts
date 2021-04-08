import type { Settings } from './';
import { storage } from './_storage';

export async function getSettings(...args: Parameters<typeof storage.get>): Promise<Settings> {
  return storage.get(...args) as Promise<Settings>;
}
