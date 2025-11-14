/**
 * @license
 * Copyright (C) 2025
 * 
 * Shared per-tab state module to check if Jump Cutter is enabled for current tab
 */

import { browserOrChrome } from '@/webextensions-api-browser-or-chrome';

let cachedEnabled = true;
let lastChecked = 0;
const CACHE_DURATION = 100; // Cache for 100ms to avoid excessive storage reads

export async function isPerTabEnabled(): Promise<boolean> {
  // Use cached value if recent
  if (Date.now() - lastChecked < CACHE_DURATION) {
    return cachedEnabled;
  }
  
  try {
    const url = window.location.href;
    const key = `perTabEnabled_${url.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 100)}`;
    const result = await browserOrChrome.storage.local.get(key);
    cachedEnabled = result[key] !== false; // Default to true if not set
    lastChecked = Date.now();
    return cachedEnabled;
  } catch (error) {
    console.error('[JumpCutter] Failed to check per-tab state:', error);
    return true; // Default to enabled on error
  }
}

export function updatePerTabCache(enabled: boolean): void {
  cachedEnabled = enabled;
  lastChecked = Date.now();
}
