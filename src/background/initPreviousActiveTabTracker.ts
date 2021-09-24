import browser from '@/webextensions-api';

export default function (): void {
  // const initialActiveTabP = browser.tabs.query({ active: true, currentWindow: true });

  // `undefined` if the active tab was closed, or when the extension has just been initialized.
  // In the former case we should probably use the tab before the tab that was closed. TODO?
  // The latter case is fine because `previousTabId` practically only matters when a popup tab gets opened.
  let previousTabId: number | undefined;
  browser.tabs.onActivated.addListener(activeInfo => {
    // TODO I think we should also track `windowId`, otherwise popup tab could connect to tabs in other windows.
    // But what we have now is good enough.
    // previousTabId = activeInfo.previousTabId;
    previousTabId = activeInfo.previousTabId;
  });
  browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message !== 'getPreviousActiveTabId') {
      return;
    }
    sendResponse(previousTabId);
  });
}
