import { settingKeyToPreviousValueKey, Settings, togglableSettings, TogglableSettings } from "./settings";
import { clamp, assertNever, DeepReadonly, KeysOfType } from "./helpers";

// I've got a feeling that this code will become obsolete sooner than it should. TODO maybe use a library?

type ModifierPropName = keyof Pick<KeyboardEvent, 'ctrlKey' | 'altKey' | 'shiftKey' | 'metaKey'>;
const modifierFlagPropNames: ModifierPropName[] = ['ctrlKey', 'altKey', 'shiftKey', 'metaKey']
// Consider replacing it with a tuple to save some storage space (to fit the `QUOTA_BYTES_PER_ITEM` quota).
export interface KeyCombination {
  code: KeyboardEvent['code'];
  modifiers?: ModifierPropName[];
}
export const enum HotkeyAction {
  // TODO uh-oh. I'm afraid these will require special treatment in `content/main.ts`.
  // Consider using [commands API for this](https://developer.chrome.com/apps/commands)
  // TOGGLE_ENABLED = 'toggle_enabled',
  // DISABLE = 'disable',
  // ENABLE = 'enable',

  // TODO how about we incorporate INCREASE and DECREASE actions into one, but the argument of which can be a negative
  // number?
  INCREASE_VOLUME_THRESHOLD = 'volume_threshold+',
  DECREASE_VOLUME_THRESHOLD = 'volume_threshold-',
  SET_VOLUME_THRESHOLD = 'volume_threshold=',
  TOGGLE_VOLUME_THRESHOLD = 'volume_threshold_toggle',

  INCREASE_SOUNDED_SPEED = 'sounded_speed+',
  DECREASE_SOUNDED_SPEED = 'sounded_speed-',
  SET_SOUNDED_SPEED = 'sounded_speed=',
  TOGGLE_SOUNDED_SPEED = 'sounded_speed_toggle',

  INCREASE_SILENCE_SPEED = 'silence_speed+',
  DECREASE_SILENCE_SPEED = 'silence_speed-',
  SET_SILENCE_SPEED = 'silence_speed=',
  TOGGLE_SILENCE_SPEED = 'silence_speed_toggle',

  INCREASE_MARGIN_BEFORE = 'margin_before+',
  DECREASE_MARGIN_BEFORE = 'margin_before-',
  SET_MARGIN_BEFORE = 'margin_before=',
  TOGGLE_MARGIN_BEFORE = 'margin_before_toggle',

  INCREASE_MARGIN_AFTER = 'margin_after+',
  DECREASE_MARGIN_AFTER = 'margin_after-',
  SET_MARGIN_AFTER = 'margin_after=',
  TOGGLE_MARGIN_AFTER = 'margin_after_toggle',

  // TODO enable stretcher. Or is it fine if we just let the user set `marginBefore` to 0 and call it a day?

  ADVANCE = 'advance',
  REWIND = 'rewind',
  TOGGLE_PAUSE = 'pause_toggle',
  TOGGLE_MUTE = 'mute_toggle',
  INCREASE_VOLUME = 'volume+',
  DECREASE_VOLUME = 'volume-',
}

export const hotkeyActionToString: Record<HotkeyAction, string> = {
  // TODO check if emojis are ok with screen readers, though I think they should be.

  [HotkeyAction.INCREASE_VOLUME_THRESHOLD]: '🔉🎚️ Volume threshold 🔼',
  [HotkeyAction.DECREASE_VOLUME_THRESHOLD]: '🔉🎚️ Volume threshold 🔽',
  [HotkeyAction.SET_VOLUME_THRESHOLD]: '🔉🎚️ Volume threshold =',
  [HotkeyAction.TOGGLE_VOLUME_THRESHOLD]: '🔉🎚️ Volume threshold toggle 🔄',

  // Maybe 📢📣💬 could also fit here.
  [HotkeyAction.INCREASE_SOUNDED_SPEED]: '🗣️▶️ Sounded speed 🔼',
  [HotkeyAction.DECREASE_SOUNDED_SPEED]: '🗣️▶️ Sounded speed 🔽',
  [HotkeyAction.SET_SOUNDED_SPEED]: '🗣️▶️ Sounded speed =',
  [HotkeyAction.TOGGLE_SOUNDED_SPEED]: '🗣️▶️ Sounded speed toggle 🔄',

  // 🤐 could also fit.
  [HotkeyAction.INCREASE_SILENCE_SPEED]: '🙊⏩ Silence speed 🔼',
  [HotkeyAction.DECREASE_SILENCE_SPEED]: '🙊⏩ Silence speed 🔽',
  [HotkeyAction.SET_SILENCE_SPEED]: '🙊⏩ Silence speed =',
  [HotkeyAction.TOGGLE_SILENCE_SPEED]: '🙊⏩ Silence speed toggle 🔄',

  // 📏? Couldn't find anything better.
  [HotkeyAction.INCREASE_MARGIN_BEFORE]: '⏱️⬅️ Margin before (s) 🔼',
  [HotkeyAction.DECREASE_MARGIN_BEFORE]: '⏱️⬅️ Margin before (s) 🔽',
  [HotkeyAction.SET_MARGIN_BEFORE]: '⏱️⬅️ Margin before (s) =',
  [HotkeyAction.TOGGLE_MARGIN_BEFORE]: '⏱️⬅️ Margin before (s) toggle 🔄',

  [HotkeyAction.INCREASE_MARGIN_AFTER]: '⏱️➡️ Margin after (s) 🔼',
  [HotkeyAction.DECREASE_MARGIN_AFTER]: '⏱️➡️ Margin after (s) 🔽',
  [HotkeyAction.SET_MARGIN_AFTER]: '⏱️➡️ Margin after (s) =',
  [HotkeyAction.TOGGLE_MARGIN_AFTER]: '⏱️➡️ Margin after (s) toggle 🔄',

  [HotkeyAction.ADVANCE]: '➡️ Advance (s)',
  [HotkeyAction.REWIND]: '⬅️ Rewind (s)',
  [HotkeyAction.TOGGLE_PAUSE]: '⏯️ Pause/unpause',
  [HotkeyAction.TOGGLE_MUTE]: '🔇 Mute/unmute',
  [HotkeyAction.INCREASE_VOLUME]: '🔊 Increase volume (%)',
  [HotkeyAction.DECREASE_VOLUME]: '🔉 Decrease volume (%)',
};

export type NonSettingsAction =
  HotkeyAction.REWIND
  | HotkeyAction.ADVANCE
  | HotkeyAction.TOGGLE_PAUSE
  | HotkeyAction.TOGGLE_MUTE
  | HotkeyAction.INCREASE_VOLUME
  | HotkeyAction.DECREASE_VOLUME
;

export const allNoArgumentActions = [HotkeyAction.TOGGLE_PAUSE, HotkeyAction.TOGGLE_MUTE] as const;
export type NoArgumentAction = typeof allNoArgumentActions[number];
export type HotkeyActionArguments<T extends HotkeyAction> = T extends NoArgumentAction ? never : number;

// Consider replacing it with a tuple to save some storage space (to fit the `QUOTA_BYTES_PER_ITEM` quota).
export type HotkeyBinding<T extends HotkeyAction = HotkeyAction> = {
  keyCombination: KeyCombination;
  action: T;
  overrideWebsiteHotkeys?: boolean,
  actionArgument?: HotkeyActionArguments<T>;
} & (T extends NoArgumentAction
  ? { actionArgument?: never }
  : { actionArgument: HotkeyActionArguments<T> }
);

export function eventToCombination(e: KeyboardEvent): KeyCombination {
  const combination = {
    code: e.code,
    // But this can create objects like `{ code: 'ControlLeft', modifiers: ['ctrlKey'] }`, which is redundant. TODO?
    // Or leave it as it is, just modify the `combinationToString` function to account for it?
    modifiers: modifierFlagPropNames.filter(flagName => e[flagName]),
  };
  if (combination.modifiers.length === 0) {
    delete (combination as KeyCombination).modifiers;
  }
  return combination;
}

export function combinationIsEqual(a: KeyCombination, b: KeyCombination): boolean {
  const modifiersA = a.modifiers ?? [];
  const modifiersB = b.modifiers ?? [];
  return a.code === b.code
    && modifiersA.length === modifiersB.length
    && modifiersA.every(mA => modifiersB.includes(mA));
}

const modifierPropNameToReprString = {
  ctrlKey: 'Ctrl',
  altKey: 'Alt',
  shiftKey: 'Shift',
  metaKey: 'Meta',
};
export function combinationToString(combination: KeyCombination): string {
  const reprModifiers = (combination.modifiers ?? []).map(m => modifierPropNameToReprString[m]);
  return [...reprModifiers, combination.code].join('+');
}

/**
 * If a key is pressed while typing in an input field, we don't consider this a hotkey.
 * Filter criteria is yoinked from
 * https://github.com/ccampbell/mousetrap/blob/2f9a476ba6158ba69763e4fcf914966cc72ef433/mousetrap.js#L1000
 * and alike libraries. Another reason to rewrite all this using a library.
 * 
 * TODO how about we also/instead check if the target element is a parent of the video element that we're controlling?
 */
export function eventTargetIsInput(event: KeyboardEvent): boolean {
  const t = event.target as Document | HTMLElement;
  return (
    'tagName' in t && ['INPUT', 'SELECT', 'TEXTAREA'].includes(t.tagName)
    || 'isContentEditable' in t && t.isContentEditable
  );
}
/**
 * @param bindings - custom keybindings array. Defaults to {@link currentSettings.hotkeys}
 */
export function keydownEventToActions(e: KeyboardEvent, currentSettings: Settings, bindings?: HotkeyBinding[]): {
  settingsNewValues: Partial<Settings>,
  nonSettingsActions: Array<DeepReadonly<HotkeyBinding<NonSettingsAction>>>,
  overrideWebsiteHotkeys?: true, // TODO. Doesn't this look a bit odd?
} {
  const bindingsDefinite = bindings ?? currentSettings.hotkeys;
  const actions: ReturnType<typeof keydownEventToActions> = {
    settingsNewValues: {},
    nonSettingsActions: [],
  };
  const executedCombination = eventToCombination(e);
  // Yes, bindings, with an "S". Binding one key to multiple actions is allowed.
  const matchedBindings = bindingsDefinite.filter(
    binding => combinationIsEqual(executedCombination, binding.keyCombination)
  );
  // TODO. Fuck. This doesn't work properly. E.g. try binding the same key to two "decrease sounded speed" actions.
  // This will result in only the last binding taking effect.
  for (const binding of matchedBindings) {
    const arg = 'actionArgument' in binding ? binding.actionArgument : undefined;
    type NumberSettings = KeysOfType<Settings, number>;
    const updateClamped = function (settingName: NumberSettings, sign: '+' | '-', min: number, max: number) {
      const unclamped = currentSettings[settingName] + (sign === '-' ? -1 : 1) * arg!;
      actions.settingsNewValues[settingName] = clamp(unclamped, min, max);
    };
    // Gosh frick it. We only update previous values in this function and nowhere else. So when the user changes,
    // for example, volumeThreshold from X to Y and then presses a hotkey to toggle volumeThreshold to X, it would not
    // set the value back to X, but to some other value. If the hotkey's argument is different from X, this bug doesn't
    // surface, so it's not super crucial. TODO fix.
    const toggleSettingValue = (key: TogglableSettings) => {
      const prevValueSettingKey = settingKeyToPreviousValueKey[key];
      actions.settingsNewValues[key] = currentSettings[key] === arg
        ? currentSettings[prevValueSettingKey]
        : arg;
    };
    switch (binding.action) {
      // TODO DRY max and min values with values in `@/popup`. Make them adjustable even?
      //
      // TODO also need to make sure that it all works fine even when min/max values are not a multiple of step. E.g. if
      // step is 0.5 and min value is 0.2, increasing the value one time brings it up to 0.5, not 0.7. Or should we?
      // Maybe instead do not allow decreasing it from 0.5 to 0.2? Or why do you assume it has to be so that the value
      // is a multiple of the step. Why can't it be 0.8/1.3/1.8, for example?
      case HotkeyAction.INCREASE_VOLUME_THRESHOLD: updateClamped('volumeThreshold', '+', 0, 1); break;
      case HotkeyAction.DECREASE_VOLUME_THRESHOLD: updateClamped('volumeThreshold', '-', 0, 1); break;
      case HotkeyAction.SET_VOLUME_THRESHOLD: actions.settingsNewValues.volumeThreshold = arg; break;
      case HotkeyAction.TOGGLE_VOLUME_THRESHOLD: toggleSettingValue('volumeThreshold'); break;
      case HotkeyAction.INCREASE_SOUNDED_SPEED: updateClamped('soundedSpeed', '+', 0, 15); break;
      case HotkeyAction.DECREASE_SOUNDED_SPEED: updateClamped('soundedSpeed', '-', 0, 15); break;
      case HotkeyAction.SET_SOUNDED_SPEED: actions.settingsNewValues.soundedSpeed = arg; break;
      case HotkeyAction.TOGGLE_SOUNDED_SPEED: toggleSettingValue('soundedSpeed'); break;
      // TODO how about do different `clamps` for 'absolute' and 'relativeToSoundedSpeed' specification methods?
      case HotkeyAction.INCREASE_SILENCE_SPEED: updateClamped('silenceSpeedRaw', '+', 0, 15); break;
      case HotkeyAction.DECREASE_SILENCE_SPEED: updateClamped('silenceSpeedRaw', '-', 0, 15); break;
      case HotkeyAction.SET_SILENCE_SPEED: actions.settingsNewValues.silenceSpeedRaw = arg; break;
      case HotkeyAction.TOGGLE_SILENCE_SPEED: toggleSettingValue('silenceSpeedRaw'); break;
      case HotkeyAction.INCREASE_MARGIN_BEFORE: updateClamped('marginBefore', '+', 0, 1); break;
      case HotkeyAction.DECREASE_MARGIN_BEFORE: updateClamped('marginBefore', '-', 0, 1); break;
      case HotkeyAction.SET_MARGIN_BEFORE: actions.settingsNewValues.marginBefore = arg; break;
      case HotkeyAction.TOGGLE_MARGIN_BEFORE: toggleSettingValue('marginBefore'); break;
      case HotkeyAction.INCREASE_MARGIN_AFTER: updateClamped('marginAfter', '+', 0, 10); break;
      case HotkeyAction.DECREASE_MARGIN_AFTER: updateClamped('marginAfter', '-', 0, 10); break;
      case HotkeyAction.SET_MARGIN_AFTER: actions.settingsNewValues.marginAfter = arg; break;
      case HotkeyAction.TOGGLE_MARGIN_AFTER: toggleSettingValue('marginAfter'); break;
      case HotkeyAction.ADVANCE:
      case HotkeyAction.REWIND:
      case HotkeyAction.TOGGLE_PAUSE:
      case HotkeyAction.TOGGLE_MUTE:
      case HotkeyAction.INCREASE_VOLUME:
      case HotkeyAction.DECREASE_VOLUME:
      {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const assertNonSettingsAction: NonSettingsAction = binding.action; // TODO is there a not haсky way to do this?
        actions.nonSettingsActions.push(binding as HotkeyBinding<NonSettingsAction>)
        break;
      }
      default: assertNever(binding.action);
    }

    if (binding.overrideWebsiteHotkeys) {
      actions.overrideWebsiteHotkeys = true;
    }
  }

  // TODO how about this needs to more to `syncSetSettings` or something?
  for (const key_ of Object.keys(actions.settingsNewValues)) {
    const key = key_ as keyof typeof actions.settingsNewValues;
    if ((togglableSettings as any).includes(key)) {
      const currValue = currentSettings[key as TogglableSettings];
      const prevValueSettingKey = settingKeyToPreviousValueKey[key as TogglableSettings];
      // Technically the code above should be responsible for the fact that this check always returns true.
      // Or should it?
      if (actions.settingsNewValues[key] !== currValue) {
        actions.settingsNewValues[prevValueSettingKey] = currValue;
      }
    }
  }

  return actions;
}
