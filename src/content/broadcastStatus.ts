export default function broadcastStatus(status: { elementLastActivatedAt: undefined | number }): void {
  chrome.runtime.sendMessage({
    type: 'contentStatus', // TODO DRY this?
    ...status,
  });
}
