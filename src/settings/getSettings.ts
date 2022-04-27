import type { Settings } from './';
import { storage } from './_storage';

export async function getSettings<T extends keyof Settings>(keys: T[]): Promise<Pick<Settings, T>>;
export async function getSettings<T extends keyof Settings>(key: T): Promise<Pick<Settings, T>>;
export async function getSettings<T extends keyof Settings>(defaults: Pick<Settings, T>): Promise<Pick<Settings, T>>;
export async function getSettings(...args: Parameters<typeof storage.get>): Promise<Settings>;
export async function getSettings(...args: Parameters<typeof storage.get>): Promise<Settings> {
  return storage.get(...args) as Promise<Settings>;
}
