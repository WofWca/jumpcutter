import { Settings, TogglableSettings, settingKeyToPreviousValueKey } from '@/settings';
import {
  combinationIsEqual, eventToCombination, HotkeyAction, NonSettingsAction, HotkeyActionArguments
} from '@/hotkeys';
import { assertNever, KeysOfType } from '@/helpers';

/**
 * If a key is pressed while typing in an input field, we don't consider this a hotkey.
 * Filter criteria is yoinked from
 * https://github.com/ccampbell/mousetrap/blob/2f9a476ba6158ba69763e4fcf914966cc72ef433/mousetrap.js#L1000
 * and alike libraries. Another reason to rewrite all this using a library.
 * 
 * TODO how about we also/instead check if the target element is a parent of the video element that we're controlling?
 */
function filterOut(event: KeyboardEvent): boolean {
  const t = event.target as Document | HTMLElement;
  return (
    'tagName' in t && ['INPUT', 'SELECT', 'TEXTAREA'].includes(t.tagName)
    || 'isContentEditable' in t && t.isContentEditable
  );
}
function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}
type NonSettingActionWithArgument<T extends NonSettingsAction = NonSettingsAction> = {
  action: NonSettingsAction,
  actionArgument: HotkeyActionArguments<T>,
};
/** @return `null` if nothing needs to be done. */
export default function keydownEventToActions(e: KeyboardEvent, currentSettings: Settings): null | {
  settingsNewValues: Partial<Settings>,
  nonSettingsActions: Array<NonSettingActionWithArgument>,
}
{
  if (filterOut(e)) return null;
  const actions: ReturnType<typeof keydownEventToActions> = {
    settingsNewValues: {},
    nonSettingsActions: [],
  };
  const executedCombination = eventToCombination(e);
  // Yes, bindings, with an "S". Binding one key to multiple actions is allowed.
  const matchedBindings = currentSettings.hotkeys.filter(
    binding => combinationIsEqual(executedCombination, binding.keyCombination)
  );
  // TODO. Fuck. This doesn't work properly. E.g. try binding the same key to two "decrease sounded speed" actions.
  // This will result in only the last binding taking effect.
  for(const binding of matchedBindings) {
    const arg = binding.actionArgument;
    type NumberSettings = KeysOfType<Settings, number>;
    const updateClamped = function(settingName: NumberSettings, sign: '+' | '-', min: number, max: number) {
      const unclamped = currentSettings[settingName] + (sign === '-' ? -1 : 1) * binding.actionArgument;
      actions.settingsNewValues[settingName] = clamp(unclamped, min, max);
    };
    // Gosh frick it. We only update previous values in this function and nowhere else. So when the user changes,
    // for example, volumeThreshold from X to Y and then presses a hotkey to toggle volumeThreshold to X, it would not
    // set the value back to X, but to some other value. If the hotkey's argument is different from X, this bug doesn't
    // surface, so it's not super crucial. TODO fix.
    const toggleSettingValue = (key: TogglableSettings) => {
      const prevValueSettingKey = settingKeyToPreviousValueKey[key];
      const currValue = currentSettings[key];
      actions.settingsNewValues[key] = currValue === arg
        ? currentSettings[prevValueSettingKey]
        : arg;
      actions.settingsNewValues[prevValueSettingKey] = currValue;
    };
    switch (binding.action) {
      // TODO DRY max and min values with values in `@/popup`. Make them adjustable even?
      //
      // TODO also need to make sure that it all works fine even when min/max values are not a multiple of step. E.g. if
      // step is 0.5 and min value is 0.2, increasing the value one time brings it up to 0.5, not 0.7. Or should we?
      // Maybe instead do not allow decreasing it from 0.5 to 0.2? Or why do you assume it has to be so that the value
      // is a multiple of the step. Why can't it be 0.8/1.3/1.8, for example?
      case HotkeyAction.INCREASE_VOLUME_THRESHOLD:  updateClamped('volumeThreshold', '+', 0, 1); break;
      case HotkeyAction.DECREASE_VOLUME_THRESHOLD:  updateClamped('volumeThreshold', '-', 0, 1); break;
      case HotkeyAction.SET_VOLUME_THRESHOLD:       actions.settingsNewValues.volumeThreshold = arg; break;
      case HotkeyAction.TOGGLE_VOLUME_THRESHOLD:    toggleSettingValue('volumeThreshold'); break;
      case HotkeyAction.INCREASE_SOUNDED_SPEED: updateClamped('soundedSpeed', '+', 0, 15); break;
      case HotkeyAction.DECREASE_SOUNDED_SPEED: updateClamped('soundedSpeed', '-', 0, 15); break;
      case HotkeyAction.SET_SOUNDED_SPEED:      actions.settingsNewValues.soundedSpeed = arg; break;
      case HotkeyAction.TOGGLE_SOUNDED_SPEED:   toggleSettingValue('soundedSpeed'); break;
      case HotkeyAction.INCREASE_SILENCE_SPEED: updateClamped('silenceSpeed', '+', 0, 15); break;
      case HotkeyAction.DECREASE_SILENCE_SPEED: updateClamped('silenceSpeed', '-', 0, 15); break;
      case HotkeyAction.SET_SILENCE_SPEED:      actions.settingsNewValues.silenceSpeed = arg; break;
      case HotkeyAction.TOGGLE_SILENCE_SPEED:   toggleSettingValue('silenceSpeed'); break;
      case HotkeyAction.INCREASE_MARGIN_BEFORE: updateClamped('marginBefore', '+', 0, 1); break;
      case HotkeyAction.DECREASE_MARGIN_BEFORE: updateClamped('marginBefore', '-', 0, 1); break;
      case HotkeyAction.SET_MARGIN_BEFORE:      actions.settingsNewValues.marginBefore = arg; break;
      case HotkeyAction.TOGGLE_MARGIN_BEFORE:   toggleSettingValue('marginBefore'); break;
      case HotkeyAction.INCREASE_MARGIN_AFTER:  updateClamped('marginAfter', '+', 0, 10); break;
      case HotkeyAction.DECREASE_MARGIN_AFTER:  updateClamped('marginAfter', '-', 0, 10); break;
      case HotkeyAction.SET_MARGIN_AFTER:       actions.settingsNewValues.marginAfter = arg; break;
      case HotkeyAction.TOGGLE_MARGIN_AFTER:    toggleSettingValue('marginAfter'); break;
      case HotkeyAction.ADVANCE:
      case HotkeyAction.REWIND: {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const assertNonSettingsAction: NonSettingsAction = binding.action; // TODO is there a not haсky way to do this?
        // Actually this is practically equivalent to `actions.nonSettingsActions.push(binding);`, but TS isn't smart
        // enough to realize this.
        actions.nonSettingsActions.push({
          action: binding.action,
          actionArgument: binding.actionArgument,
        });
        break;
      }
      default: assertNever(binding.action);
    }
  }
  return actions;
}
