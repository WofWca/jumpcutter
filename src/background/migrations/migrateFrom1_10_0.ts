import { HotkeyAction, HotkeyBinding, combinationIsEqual } from "@/hotkeys";
import { getSettings, setSettings } from "@/settings";

export default async function(): Promise<void> {
  // Add new hotkeys if the user didn't customize them much.
  const { hotkeys } = await getSettings();
  const defaultVolumeThresholdHotkeys = [
    {
      keyCombination: { code: 'KeyE', },
      action: HotkeyAction.INCREASE_VOLUME_THRESHOLD,
      actionArgument: 0.001,
    },
    {
      keyCombination: { code: 'KeyW', },
      action: HotkeyAction.DECREASE_VOLUME_THRESHOLD,
      actionArgument: 0.001,
    },
  ] as const;
  const newHotkeys = [
    {
      keyCombination: { code: 'KeyE', modifiers: ['shiftKey'], },
      action: HotkeyAction.INCREASE_VOLUME_THRESHOLD,
      actionArgument: 0.010,
    },
    {
      keyCombination: { code: 'KeyW', modifiers: ['shiftKey'], },
      action: HotkeyAction.DECREASE_VOLUME_THRESHOLD,
      actionArgument: 0.010,
    },
  ] as HotkeyBinding<HotkeyAction.DECREASE_VOLUME_THRESHOLD | HotkeyAction.DECREASE_VOLUME_THRESHOLD>[];
  function bindingIsEqual(a: HotkeyBinding, b: HotkeyBinding) {
    return (
      a.action === b.action
      && combinationIsEqual(a.keyCombination, b.keyCombination)
      && a.actionArgument === b.actionArgument
      && (a.overrideWebsiteHotkeys ?? false) === (a.overrideWebsiteHotkeys ?? false)
    );
  }
  const defaultVolumeThresholdHotkeysPresent =
    defaultVolumeThresholdHotkeys
      .every(defaultBinding => hotkeys.some(binding => bindingIsEqual(binding, defaultBinding)));
  const newHotkeysAreAlreadyBound = hotkeys.some(({ keyCombination: existing }) => {
    return newHotkeys.some(({ keyCombination: newCombination }) => combinationIsEqual(newCombination, existing));
  })
  if (defaultVolumeThresholdHotkeysPresent && !newHotkeysAreAlreadyBound) {
    const insertAfter = hotkeys.findIndex(b => bindingIsEqual(b, defaultVolumeThresholdHotkeys[1]));
    hotkeys.splice(insertAfter + 1, 0, ...newHotkeys);
    await setSettings({ hotkeys });
  }
}
