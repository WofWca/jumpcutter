import { browserOrChrome as browser } from '@/webextensions-api-browser-or-chrome';

export default function broadcastStatus(status: { elementLastActivatedAt: undefined | number }): void {
  browser.runtime.sendMessage({
    type: 'contentStatus', // TODO DRY this?
    ...status,
  });
}
