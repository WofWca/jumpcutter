// I've got a feeling that this code will become obsolete sooner than it should. TODO maybe use a library?

type ModifierPropName = keyof Pick<KeyboardEvent, 'ctrlKey' | 'altKey' | 'shiftKey' | 'metaKey'>;
const modifierFlagPropNames: ModifierPropName[] = ['ctrlKey', 'altKey', 'shiftKey', 'metaKey']
// Consider replacing it with a tuple to save some storage space (to fit the `QUOTA_BYTES_PER_ITEM` quota).
interface KeyCombination {
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

  INCREASE_SOUNDED_SPEED = 'sounded_speed+',
  DECREASE_SOUNDED_SPEED = 'sounded_speed-',
  SET_SOUNDED_SPEED = 'sounded_speed=',

  INCREASE_SILENCE_SPEED = 'silence_speed+',
  DECREASE_SILENCE_SPEED = 'silence_speed-',
  SET_SILENCE_SPEED = 'silence_speed=',

  INCREASE_MARGIN_BEFORE = 'margin_before+',
  DECREASE_MARGIN_BEFORE = 'margin_before-',
  SET_MARGIN_BEFORE = 'margin_before=',

  INCREASE_MARGIN_AFTER = 'margin_after+',
  DECREASE_MARGIN_AFTER = 'margin_after-',
  SET_MARGIN_AFTER = 'margin_after=',

  // TODO enable stretcher. Or is it fine if we just let the user set `marginBefore` to 0 and call it a day?

  // TODO
  // ADVANCE = 'advance',
  // REWIND = 'rewind',
}

// TODO add units (like seconds) where applicable?
export const hotkeyActionToString: Record<HotkeyAction, string> = {
  // TODO check if emojis are ok with screen readers, though I think they should be.

  [HotkeyAction.INCREASE_VOLUME_THRESHOLD]: '🔉🎚️ Volume threshold 🔼',
  [HotkeyAction.DECREASE_VOLUME_THRESHOLD]: '🔉🎚️ Volume threshold 🔽',
  [HotkeyAction.SET_VOLUME_THRESHOLD]: '🔉🎚️ Volume threshold =',

  // Maybe 📢📣 are could also fit here.
  [HotkeyAction.INCREASE_SOUNDED_SPEED]: '💬▶️ Sounded speed 🔼',
  [HotkeyAction.DECREASE_SOUNDED_SPEED]: '💬▶️ Sounded speed 🔽',
  [HotkeyAction.SET_SOUNDED_SPEED]: '💬▶️ Sounded speed =',

  // 🤐 could also fit.
  [HotkeyAction.INCREASE_SILENCE_SPEED]: '🙊⏩ Silence speed 🔼',
  [HotkeyAction.DECREASE_SILENCE_SPEED]: '🙊⏩ Silence speed 🔽',
  [HotkeyAction.SET_SILENCE_SPEED]: '🙊⏩ Silence speed =',

  // 📏? Couldn't find anything better.
  [HotkeyAction.INCREASE_MARGIN_BEFORE]: '⏱⬅️ Margin before 🔼',
  [HotkeyAction.DECREASE_MARGIN_BEFORE]: '⏱⬅️ Margin before 🔽',
  [HotkeyAction.SET_MARGIN_BEFORE]: '⏱⬅️ Margin before =',

  [HotkeyAction.INCREASE_MARGIN_AFTER]: '⏱➡️ Margin after 🔼',
  [HotkeyAction.DECREASE_MARGIN_AFTER]: '⏱➡️ Margin after 🔽',
  [HotkeyAction.SET_MARGIN_AFTER]: '⏱➡️ Margin after =',
};

type HotkeyActionArguments<T extends HotkeyAction> = number; // Maybe some day this won't be just number.

// Consider replacing it with a tuple to save some storage space (to fit the `QUOTA_BYTES_PER_ITEM` quota).
export interface HotkeyBinding<T extends HotkeyAction = HotkeyAction> {
  keyCombination: KeyCombination;
  action: T;
  actionArgument: HotkeyActionArguments<T>;
}

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
