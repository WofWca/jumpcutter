import browser from '@/webextensions-api';

export default function broadcastStatus(status: { elementLastActivatedAt: undefined | number }): void {
  browser.runtime.sendMessage({
    type: 'contentStatus', // TODO DRY this?
    ...status,
  });
}
