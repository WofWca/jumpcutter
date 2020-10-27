import { keydownEventToActions, eventTargetIsInput } from '@/hotkeys';
import { Settings } from '@/settings';

export default async function createKeydownListener(
  getSettings: () => Settings,
  onNewSettingsValues: (newValues: Partial<Settings>) => void,
): Promise<(e: KeyboardEvent) => void> {
  const tabs = await new Promise<chrome.tabs.Tab[]>(r => chrome.tabs.query({ active: true, currentWindow: true }, r));
  // TODO this also assumes that there's an onConnect listener on the other end, but it may not be loaded.
  // TODO make sure it is closed when the listener returned by this function is discarded?
  const nonSettingsActionsPort = chrome.tabs.connect(tabs[0].id!, { name: 'nonSettingsActions' });
  return (e: KeyboardEvent): void => {
    const settings = getSettings();
    if (eventTargetIsInput(e) && settings.popupDisableHotkeysWhileInputFocused) return;
    const actions = keydownEventToActions(e, settings);
    const { settingsNewValues, nonSettingsActions } = actions;
    onNewSettingsValues(settingsNewValues);
    // TODO but this is still not fully convenient for the user as he won't be able to use hotkeys that are not provided
    // by our extension (like "pause" and "increase volume"). Should we add such hotkeys? Or somehow teleport keydown
    // events to the page?
    nonSettingsActionsPort.postMessage(nonSettingsActions);
  }
}