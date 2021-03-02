import type browser from 'webextension-polyfill';
import { keydownEventToActions, eventTargetIsInput } from '@/hotkeys';
import { Settings } from '@/settings';

export default function createKeydownListener(
  nonSettingsActionsPort: ReturnType<typeof browser.tabs.connect>,
  getSettings: () => Settings,
  onNewSettingsValues: (newValues: Partial<Settings>) => void,
): (e: KeyboardEvent) => void {
  const undeferred = (e: KeyboardEvent): void => {
    const settings = getSettings();
    if (eventTargetIsInput(e) && settings.popupDisableHotkeysWhileInputFocused) return;
    // TODO creating a new array on each keydown is not quite good for performance. Or does it get optimized internally?
    // Or maybe we can call `keydownEventToActions` twice for each array. Nah, easier to modify `keydownEventToActions`.
    const actions = keydownEventToActions(e, settings, [...settings.hotkeys, ...settings.popupSpecificHotkeys]);
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
