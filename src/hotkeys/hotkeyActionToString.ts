import { createGetMessage } from '@/helpers';
import { HotkeyAction } from './HotkeyAction';

const getMessage = await createGetMessage();

export const hotkeyActionToString: Record<HotkeyAction, string> = {
  // TODO check if emojis are ok with screen readers, though I think they should be.

  // 📉🎚️
  [HotkeyAction.DECREASE_VOLUME_THRESHOLD]: `🔉📉 ${getMessage('volumeThreshold')} 🔽`,
  [HotkeyAction.INCREASE_VOLUME_THRESHOLD]: `🔉📉 ${getMessage('volumeThreshold')} 🔼`,
  [HotkeyAction.SET_VOLUME_THRESHOLD]: `🔉📉 ${getMessage('volumeThreshold')} =`,
  [HotkeyAction.TOGGLE_VOLUME_THRESHOLD]: `🔉📉 ${getMessage('volumeThreshold')} ${getMessage('toggle')} 🔄`,

  // Maybe 📢📣💬, 🟩 could also fit here.
  [HotkeyAction.DECREASE_SOUNDED_SPEED]: `▶️🗣️ ${getMessage('soundedSpeed')} 🔽`,
  [HotkeyAction.INCREASE_SOUNDED_SPEED]: `▶️🗣️ ${getMessage('soundedSpeed')} 🔼`,
  [HotkeyAction.SET_SOUNDED_SPEED]: `▶️🗣️ ${getMessage('soundedSpeed')} =`,
  [HotkeyAction.TOGGLE_SOUNDED_SPEED]: `▶️🗣️ ${getMessage('soundedSpeed')} ${getMessage('toggle')} 🔄`,

  // 🤐, 🟥 could also fit.
  [HotkeyAction.DECREASE_SILENCE_SPEED]: `⏩🙊 ${getMessage('silenceSpeed')} 🔽`,
  [HotkeyAction.INCREASE_SILENCE_SPEED]: `⏩🙊 ${getMessage('silenceSpeed')} 🔼`,
  [HotkeyAction.SET_SILENCE_SPEED]: `⏩🙊 ${getMessage('silenceSpeed')} =`,
  [HotkeyAction.TOGGLE_SILENCE_SPEED]: `⏩🙊 ${getMessage('silenceSpeed')} ${getMessage('toggle')} 🔄`,

  // TODO should we specify here that the values are in seconds?
  // 📏? Couldn't find anything better.
  [HotkeyAction.DECREASE_MARGIN_BEFORE]: `⏱️⬅️ ${getMessage('marginBefore')} 🔽`,
  [HotkeyAction.INCREASE_MARGIN_BEFORE]: `⏱️⬅️ ${getMessage('marginBefore')} 🔼`,
  [HotkeyAction.SET_MARGIN_BEFORE]: `⏱️⬅️ ${getMessage('marginBefore')} =`,
  [HotkeyAction.TOGGLE_MARGIN_BEFORE]: `⏱️⬅️ ${getMessage('marginBefore')} ${getMessage('toggle')} 🔄`,

  [HotkeyAction.DECREASE_MARGIN_AFTER]: `⏱️➡️ ${getMessage('marginAfter')} 🔽`,
  [HotkeyAction.INCREASE_MARGIN_AFTER]: `⏱️➡️ ${getMessage('marginAfter')} 🔼`,
  [HotkeyAction.SET_MARGIN_AFTER]: `⏱️➡️ ${getMessage('marginAfter')} =`,
  [HotkeyAction.TOGGLE_MARGIN_AFTER]: `⏱️➡️ ${getMessage('marginAfter')} ${getMessage('toggle')} 🔄`,

  [HotkeyAction.REWIND]: `⬅️ ${getMessage('rewind')}`,
  [HotkeyAction.ADVANCE]: `➡️ ${getMessage('advance')}`,
  [HotkeyAction.TOGGLE_PAUSE]: `⏯️ ${getMessage('togglePause')}`,
  [HotkeyAction.TOGGLE_MUTE]: `🔇 ${getMessage('toggleMute')}`,
  [HotkeyAction.DECREASE_VOLUME]: `🔉 ${getMessage('decreaseVolume')}`,
  [HotkeyAction.INCREASE_VOLUME]: `🔊 ${getMessage('increaseVolume')}`,
};
