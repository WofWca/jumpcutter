import { settingKeyToPreviousValueKey, Settings, togglableSettings, TogglableSettings } from "@/settings";
import { clamp, assertNever, KeysOfType, getGeckoLikelyMaxNonMutedPlaybackRate } from "@/helpers";
import type { HotkeyBinding, NonSettingsAction, NonSettingsActions } from './';
import { eventMatchesCombination } from "./eventMatchesCombination";
import { HotkeyAction } from "./HotkeyAction";

// See the comment in `getAbsoluteClampedSilenceSpeed` definition on why this is different for different browsers.
const maxSpeedClamp = BUILD_DEFINITIONS.BROWSER === 'gecko'
  ? getGeckoLikelyMaxNonMutedPlaybackRate()
  : 15;

/**
 * @param bindings - custom keybindings array. Defaults to {@link currentSettings.hotkeys}
 * @returns `undefined` when no actions need to be performed (equivalent to empty `settingsNewValues`
 * & `nonSettingsActions`).
 */
export function keydownEventToActions(e: KeyboardEvent, currentSettings: Settings, bindings?: HotkeyBinding[]): [
  settingsNewValues: Partial<Settings>,
  nonSettingsActions: NonSettingsActions,
  overrideWebsiteHotkeys: boolean,
]
| undefined
{
  const bindingsDefinite = bindings ?? currentSettings.hotkeys;
  // Yes, bindings, with an "S". Binding one key to multiple actions is allowed.
  // TODO would be cool if we had a cache or something so we can at least find all bindings that have
  // the same hotkey quickly, without having to go through the whole array every time.
  const matchedBindings = bindingsDefinite.filter(
    binding => eventMatchesCombination(e, binding.keyCombination)
  );
  if (!matchedBindings.length) {
    return;
  }
  const settingsNewValues: Exclude<ReturnType<typeof keydownEventToActions>, undefined>[0] = {};
  const nonSettingsActions: Exclude<ReturnType<typeof keydownEventToActions>, undefined>[1] = [];
  let overrideWebsiteHotkeys = false;
  // TODO. Fuck. This doesn't work properly. E.g. try binding the same key to two "decrease sounded speed" actions.
  // This will result in only the last binding taking effect.
  for (const binding of matchedBindings) {
    const arg = binding.actionArgument;
    type NumberSettings = KeysOfType<Settings, number>;
    const updateClamped = function (settingName: NumberSettings, argMultiplier: -1 | 1, min: number, max: number) {
      const unclamped = currentSettings[settingName] + argMultiplier * arg!;
      settingsNewValues[settingName] = clamp(unclamped, min, max);
    };
    // Gosh frick it. We only update previous values in this function and nowhere else. So when the user changes,
    // for example, volumeThreshold from X to Y and then presses a hotkey to toggle volumeThreshold to X, it would not
    // set the value back to X, but to some other value. If the hotkey's argument is different from X, this bug doesn't
    // surface, so it's not super crucial. TODO fix.
    const toggleSettingValue = (key: TogglableSettings) => {
      const prevValueSettingKey = settingKeyToPreviousValueKey[key];
      settingsNewValues[key] = currentSettings[key] === arg
        ? currentSettings[prevValueSettingKey]
        : arg;
    };
    switch (binding.action) {
      // TODO DRY max and min values with values in `@/popup`. Make them adjustable even?
      //
      // TODO also need to make sure that it all works fine even when min/max values are not a multiple of step. E.g. if
      // step is 0.5 and min value is 0.2, increasing the value one time brings it up to 0.5, not 0.7. Or should we?
      // Maybe instead do not allow decreasing it from 0.5 to 0.2 (like we do now for sounded/silence speeds)?
      // Or why do you assume it has to be so that the value
      // is a multiple of the step. Why can't it be 0.8/1.3/1.8, for example?
      case HotkeyAction.INCREASE_VOLUME_THRESHOLD: updateClamped('volumeThreshold', 1, 0, 1); break;
      case HotkeyAction.DECREASE_VOLUME_THRESHOLD: updateClamped('volumeThreshold', -1, 0, 1); break;
      case HotkeyAction.SET_VOLUME_THRESHOLD: settingsNewValues.volumeThreshold = arg; break;
      case HotkeyAction.TOGGLE_VOLUME_THRESHOLD: toggleSettingValue('volumeThreshold'); break;
      case HotkeyAction.INCREASE_SOUNDED_SPEED:
        updateClamped('soundedSpeed', 1, binding.actionArgument!, maxSpeedClamp); break;
      case HotkeyAction.DECREASE_SOUNDED_SPEED:
        updateClamped('soundedSpeed', -1, binding.actionArgument!, maxSpeedClamp); break;
      case HotkeyAction.SET_SOUNDED_SPEED: settingsNewValues.soundedSpeed = arg; break;
      case HotkeyAction.TOGGLE_SOUNDED_SPEED: toggleSettingValue('soundedSpeed'); break;
      // TODO how about do different `clamps` for 'absolute' and 'relativeToSoundedSpeed' specification methods?
      case HotkeyAction.INCREASE_SILENCE_SPEED:
        updateClamped('silenceSpeedRaw', 1, binding.actionArgument!, maxSpeedClamp); break;
      case HotkeyAction.DECREASE_SILENCE_SPEED:
        updateClamped('silenceSpeedRaw', -1, binding.actionArgument!, maxSpeedClamp); break;
      case HotkeyAction.SET_SILENCE_SPEED: settingsNewValues.silenceSpeedRaw = arg; break;
      case HotkeyAction.TOGGLE_SILENCE_SPEED: toggleSettingValue('silenceSpeedRaw'); break;
      case HotkeyAction.INCREASE_MARGIN_BEFORE: updateClamped('marginBefore', 1, 0, 1); break;
      case HotkeyAction.DECREASE_MARGIN_BEFORE: updateClamped('marginBefore', -1, 0, 1); break;
      case HotkeyAction.SET_MARGIN_BEFORE: settingsNewValues.marginBefore = arg; break;
      case HotkeyAction.TOGGLE_MARGIN_BEFORE: toggleSettingValue('marginBefore'); break;
      case HotkeyAction.INCREASE_MARGIN_AFTER: updateClamped('marginAfter', 1, 0, 10); break;
      case HotkeyAction.DECREASE_MARGIN_AFTER: updateClamped('marginAfter', -1, 0, 10); break;
      case HotkeyAction.SET_MARGIN_AFTER: settingsNewValues.marginAfter = arg; break;
      case HotkeyAction.TOGGLE_MARGIN_AFTER: toggleSettingValue('marginAfter'); break;
      default: {
        if (process.env.NODE_ENV !== 'production') {
          if (
            HotkeyAction.ADVANCE !== binding.action
            && HotkeyAction.REWIND !== binding.action
            && HotkeyAction.TOGGLE_PAUSE !== binding.action
            && HotkeyAction.TOGGLE_MUTE !== binding.action
            && HotkeyAction.INCREASE_VOLUME !== binding.action
            && HotkeyAction.DECREASE_VOLUME !== binding.action
          ) {
            assertNever(binding.action);
          }
        }

        nonSettingsActions.push(binding as HotkeyBinding<NonSettingsAction>)
      }
    }

    if (binding.overrideWebsiteHotkeys) {
      overrideWebsiteHotkeys = true;
    }
  }

  for (const key_ of Object.keys(settingsNewValues)) {
    const key = key_ as keyof typeof settingsNewValues;
    if ((togglableSettings as any).includes(key)) {
      const currValue = currentSettings[key as TogglableSettings];
      const prevValueSettingKey = settingKeyToPreviousValueKey[key as TogglableSettings];
      // Technically the code above should be responsible for the fact that this check always returns true.
      // Or should it?
      if (settingsNewValues[key] !== currValue) {
        settingsNewValues[prevValueSettingKey] = currValue;
      }
    }
  }

  return [settingsNewValues, nonSettingsActions, overrideWebsiteHotkeys];
}
