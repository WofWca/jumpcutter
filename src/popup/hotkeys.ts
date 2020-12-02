import { keydownEventToActions, eventTargetIsInput, HotkeyAction, HotkeyBinding } from '@/hotkeys';
import { Settings } from '@/settings';

// TODO how about move this to settings?
const popupSpecificHotkeys: HotkeyBinding[] = [
  {
    keyCombination: { code: 'Space', },
    action: HotkeyAction.TOGGLE_PAUSE,
  },
  {
    keyCombination: { code: 'ArrowLeft' },
    action: HotkeyAction.REWIND,
    actionArgument: 10,
  },
  {
    keyCombination: { code: 'ArrowRight' },
    action: HotkeyAction.ADVANCE,
    actionArgument: 10,
  },
  {
    keyCombination: { code: 'ArrowUp' },
    action: HotkeyAction.INCREASE_VOLUME,
    actionArgument: 5,
  },
  {
    keyCombination: { code: 'ArrowDown' },
    action: HotkeyAction.DECREASE_VOLUME,
    actionArgument: 5,
  },
];

export default async function createKeydownListener(
  getSettings: () => Settings,
  onNewSettingsValues: (newValues: Partial<Settings>) => void,
): Promise<(e: KeyboardEvent) => void> {
  const tabs = await new Promise<chrome.tabs.Tab[]>(r => chrome.tabs.query({ active: true, currentWindow: true }, r));
  // TODO this also assumes that there's an onConnect listener on the other end, but it may not be loaded.
  // TODO make sure it is closed when the listener returned by this function is discarded?
  const nonSettingsActionsPort = chrome.tabs.connect(tabs[0].id!, { name: 'nonSettingsActions' });
  const undeferred = (e: KeyboardEvent): void => {
    const settings = getSettings();
    if (eventTargetIsInput(e) && settings.popupDisableHotkeysWhileInputFocused) return;
    // TODO creating a new array on each keydown is not quite good for performance. Or does it get optimized internally?
    // Or maybe we can call `keydownEventToActions` twice for each array. Nah, easier to modify `keydownEventToActions`.
    const actions = keydownEventToActions(e, settings, [...settings.hotkeys, ...popupSpecificHotkeys]);
    const { settingsNewValues, nonSettingsActions } = actions;
    onNewSettingsValues(settingsNewValues);
    // TODO but this is still not fully convenient for the user as he won't be able to use hotkeys that are not provided
    // by our extension (like "pause" and "increase volume"). Should we add such hotkeys? Or somehow teleport keydown
    // events to the page?
    nonSettingsActionsPort.postMessage(nonSettingsActions);
  };
  // `setTimeout` only for performance.
  return (e: KeyboardEvent) => setTimeout(undeferred, 0, e);
}
