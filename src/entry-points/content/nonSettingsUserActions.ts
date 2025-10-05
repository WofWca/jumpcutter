import { assertNever } from "@/helpers";
import {
  HotkeyAction,
  HotkeyBinding,
  type keydownEventToActions,
} from "@/hotkeys";
import { clamp } from "@/helpers";

export default function executeNonSettingsActions(
  el: HTMLMediaElement,
  nonSettingsActions: Exclude<ReturnType<typeof keydownEventToActions>, undefined>[1]
) {
  for (const action of nonSettingsActions) {
    switch (action.action) {
      case HotkeyAction.REWIND: el.currentTime -= (action as HotkeyBinding<HotkeyAction.REWIND>).actionArgument; break;
      case HotkeyAction.ADVANCE: el.currentTime += (action as HotkeyBinding<HotkeyAction.ADVANCE>).actionArgument; break;
      case HotkeyAction.TOGGLE_PAUSE: el.paused ? el.play() : el.pause(); break;
      case HotkeyAction.TOGGLE_MUTE: el.muted = !el.muted; break;
      case HotkeyAction.INCREASE_VOLUME:
      case HotkeyAction.DECREASE_VOLUME: {
        const unitVector = action.action === HotkeyAction.INCREASE_VOLUME ? 1 : -1;
        const toAdd = unitVector * (action as HotkeyBinding<HotkeyAction.INCREASE_VOLUME>).actionArgument / 100;
        el.volume = clamp(el.volume + toAdd, 0, 1);
        break;
      }
      default: assertNever(action.action);
    }
  }
}
