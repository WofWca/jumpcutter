/**
 * @license
 * Copyright (C) 2025
 */

import { browserOrChrome } from '@/webextensions-api-browser-or-chrome';

let tabId: number | null | undefined;
let keySuffix: string | null = null;
let initPromise: Promise<void> | null = null;

function sanitizeKey(input: string): string {
  return input.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 100);
}

async function requestTabId(): Promise<number | null> {
  try {
    const response = await (browserOrChrome as typeof chrome).runtime.sendMessage({ type: 'jumpcutter:getTabId' });
    if (typeof response?.tabId === 'number') {
      return response.tabId;
    }
  } catch (error) {
    console.warn('[JumpCutter] Failed to obtain tabId from background', error);
  }
  return null;
}

function setKeySuffixFromSource(sourceTabId: number | null): void {
  tabId = sourceTabId;
  if (sourceTabId != null) {
    keySuffix = `tab_${sourceTabId}`;
  } else {
    keySuffix = `url_${sanitizeKey(window.location.href)}`;
  }
  (window as any).__jumpCutterPerTabIdentity = { tabId, keySuffix };
}

function ensureKeySuffix(): void {
  if (!keySuffix) {
    const cached = (window as any).__jumpCutterPerTabIdentity;
    if (cached?.keySuffix) {
      tabId = cached.tabId ?? null;
      keySuffix = cached.keySuffix;
    } else {
      setKeySuffixFromSource(null);
    }
  }
}

export async function ensurePerTabIdentity(): Promise<void> {
  if (keySuffix && tabId !== undefined) {
    return;
  }
  if (initPromise) {
    return initPromise;
  }
  initPromise = (async () => {
    const cached = (window as any).__jumpCutterPerTabIdentity;
    if (cached?.keySuffix) {
      tabId = cached.tabId ?? null;
      keySuffix = cached.keySuffix;
      return;
    }
    const resolvedTabId = await requestTabId();
    setKeySuffixFromSource(resolvedTabId);
  })()
    .catch(error => {
      console.warn('[JumpCutter] ensurePerTabIdentity failed; falling back to URL key', error);
      setKeySuffixFromSource(null);
    })
    .finally(() => {
      initPromise = null;
    });
  return initPromise;
}

export function getPerTabKeySync(prefix: string): string {
  ensureKeySuffix();
  return `${prefix}_${keySuffix}`;
}

export function getPerTabIdentityInfo(): { tabId: number | null | undefined; keySuffix: string | null } {
  ensureKeySuffix();
  return { tabId, keySuffix };
}
