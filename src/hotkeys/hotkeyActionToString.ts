import { HotkeyAction } from './HotkeyAction';

export const hotkeyActionToString: Record<HotkeyAction, string> = {
  // TODO check if emojis are ok with screen readers, though I think they should be.

  // 📉🎚️
  [HotkeyAction.DECREASE_VOLUME_THRESHOLD]: '🔉📉 Volume threshold 🔽',
  [HotkeyAction.INCREASE_VOLUME_THRESHOLD]: '🔉📉 Volume threshold 🔼',
  [HotkeyAction.SET_VOLUME_THRESHOLD]: '🔉📉 Volume threshold =',
  [HotkeyAction.TOGGLE_VOLUME_THRESHOLD]: '🔉📉 Volume threshold toggle 🔄',

  // Maybe 📢📣💬, 🟩 could also fit here.
  [HotkeyAction.DECREASE_SOUNDED_SPEED]: '▶️🗣️ Sounded speed 🔽',
  [HotkeyAction.INCREASE_SOUNDED_SPEED]: '▶️🗣️ Sounded speed 🔼',
  [HotkeyAction.SET_SOUNDED_SPEED]: '▶️🗣️ Sounded speed =',
  [HotkeyAction.TOGGLE_SOUNDED_SPEED]: '▶️🗣️ Sounded speed toggle 🔄',

  // 🤐, 🟥 could also fit.
  [HotkeyAction.DECREASE_SILENCE_SPEED]: '⏩🙊 Silence speed 🔽',
  [HotkeyAction.INCREASE_SILENCE_SPEED]: '⏩🙊 Silence speed 🔼',
  [HotkeyAction.SET_SILENCE_SPEED]: '⏩🙊 Silence speed =',
  [HotkeyAction.TOGGLE_SILENCE_SPEED]: '⏩🙊 Silence speed toggle 🔄',

  // 📏? Couldn't find anything better.
  [HotkeyAction.DECREASE_MARGIN_BEFORE]: '⏱️⬅️ Margin before (s) 🔽',
  [HotkeyAction.INCREASE_MARGIN_BEFORE]: '⏱️⬅️ Margin before (s) 🔼',
  [HotkeyAction.SET_MARGIN_BEFORE]: '⏱️⬅️ Margin before (s) =',
  [HotkeyAction.TOGGLE_MARGIN_BEFORE]: '⏱️⬅️ Margin before (s) toggle 🔄',

  [HotkeyAction.DECREASE_MARGIN_AFTER]: '⏱️➡️ Margin after (s) 🔽',
  [HotkeyAction.INCREASE_MARGIN_AFTER]: '⏱️➡️ Margin after (s) 🔼',
  [HotkeyAction.SET_MARGIN_AFTER]: '⏱️➡️ Margin after (s) =',
  [HotkeyAction.TOGGLE_MARGIN_AFTER]: '⏱️➡️ Margin after (s) toggle 🔄',

  [HotkeyAction.REWIND]: '⬅️ Rewind (s)',
  [HotkeyAction.ADVANCE]: '➡️ Advance (s)',
  [HotkeyAction.TOGGLE_PAUSE]: '⏯️ Pause/unpause',
  [HotkeyAction.TOGGLE_MUTE]: '🔇 Mute/unmute',
  [HotkeyAction.DECREASE_VOLUME]: '🔉 Decrease volume (%)',
  [HotkeyAction.INCREASE_VOLUME]: '🔊 Increase volume (%)',
};
