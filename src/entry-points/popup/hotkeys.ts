import { keydownEventToActions, eventTargetIsInput, NonSettingsActions } from '@/hotkeys';
import type { Settings } from '@/settings';

type RequiredSettings =
  & Parameters<typeof keydownEventToActions>[1]
  & Pick<Settings, 'popupDisableHotkeysWhileInputFocused' | 'popupSpecificHotkeys'>;
export default function createKeydownListener(
  onNonSettingsActions: (nonSettingsActions: NonSettingsActions) => void,
  getSettings: () => RequiredSettings,
  onNewSettingsValues: (newValues: Partial<Settings>) => void,
): (e: KeyboardEvent) => void {
  const undeferred = (e: KeyboardEvent): void => {
    const settings = getSettings();
    if (eventTargetIsInput(e) && settings.popupDisableHotkeysWhileInputFocused) return;
    // TODO creating a new array on each keydown is not quite good for performance. Or does it get optimized internally?
    // Or maybe we can call `keydownEventToActions` twice for each array. Nah, easier to modify `keydownEventToActions`.
    const actions = keydownEventToActions(e, settings, [...settings.hotkeys, ...settings.popupSpecificHotkeys]);
    if (!actions) {
      return;
    }
    const [ settingsNewValues, nonSettingsActions ] = actions;
    onNewSettingsValues(settingsNewValues);
    onNonSettingsActions(nonSettingsActions);
  };
  // `setTimeout` only for performance.
  return (e: KeyboardEvent) => setTimeout(undeferred, 0, e);
}
