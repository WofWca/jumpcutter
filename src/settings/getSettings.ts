import type { Settings } from './';
import { storage } from './_storage';

export async function getSettings<T extends keyof Settings>(keys: T[]): Promise<Record<T, Settings[T]>>;
export async function getSettings<T extends keyof Settings>(key: T): Promise<Record<T, Settings[T]>>;
export async function getSettings<T extends keyof Settings>(defaults: Record<T, Settings[T]>): Promise<Record<T, Settings[T]>>;
export async function getSettings(...args: Parameters<typeof storage.get>): Promise<Settings>;
export async function getSettings(...args: Parameters<typeof storage.get>): Promise<Settings> {
  return storage.get(...args) as Promise<Settings>;
}
