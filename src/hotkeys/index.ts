import type { HotkeyAction } from './HotkeyAction';
import type { allNoArgumentActions } from './allNoArgumentActions';
import type { DeepReadonly } from "@/helpers";

// I've got a feeling that this code will become obsolete sooner than it should. TODO maybe use a library?

export type ModifierPropName = keyof Pick<KeyboardEvent, 'ctrlKey' | 'altKey' | 'shiftKey' | 'metaKey'>;
// Consider replacing it with a tuple to save some storage space (to fit the `QUOTA_BYTES_PER_ITEM` quota).
export interface KeyCombination {
  code: KeyboardEvent['code'];
  modifiers?: ModifierPropName[];
}

export type NonSettingsAction =
  HotkeyAction.REWIND
  | HotkeyAction.ADVANCE
  | HotkeyAction.TOGGLE_PAUSE
  | HotkeyAction.TOGGLE_MUTE
  | HotkeyAction.INCREASE_VOLUME
  | HotkeyAction.DECREASE_VOLUME
;

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

export type NonSettingsActions = Array<DeepReadonly<HotkeyBinding<NonSettingsAction>>>;

export * from './allNoArgumentActions';
export * from './combinationIsEqual';
export * from './combinationToString';
export * from './eventTargetIsInput';
export * from './eventToCombination';
export * from './HotkeyAction';
export * from './hotkeyActionToString';
export * from './keydownEventToActions';
