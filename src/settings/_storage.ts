import browser from '@/webextensions-api';
import { mainStorageAreaName } from './mainStorageAreaName';

export const storage = browser.storage[mainStorageAreaName];
