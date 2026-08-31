/**
 * @license
 * Copyright (C) 2021, 2022  WofWca <wofwca@protonmail.com>
 *
 * This file is part of Jump Cutter Browser Extension.
 *
 * Jump Cutter Browser Extension is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * Jump Cutter Browser Extension is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with Jump Cutter Browser Extension.  If not, see <https://www.gnu.org/licenses/>.
 */

import { getMessage } from "@/helpers";
import { HotkeyAction } from "./HotkeyAction";

export const hotkeyActionToString: Record<HotkeyAction, string> = {
  // TODO check if emojis are ok with screen readers, though I think they should be.

  // 📉🎚️
  [HotkeyAction.DECREASE_VOLUME_THRESHOLD]: `🔉📉 ${getMessage("volumeThreshold")} 🔽`,
  [HotkeyAction.INCREASE_VOLUME_THRESHOLD]: `🔉📉 ${getMessage("volumeThreshold")} 🔼`,
  [HotkeyAction.SET_VOLUME_THRESHOLD]: `🔉📉 ${getMessage("volumeThreshold")} =`,
  [HotkeyAction.TOGGLE_VOLUME_THRESHOLD]: `🔉📉 ${getMessage("volumeThreshold")} ${getMessage("switch")} 🔄`,

  // Maybe 📢📣💬, 🟩 could also fit here.
  [HotkeyAction.DECREASE_SOUNDED_SPEED]: `▶️🗣️ ${getMessage("soundedSpeed")} 🔽`,
  [HotkeyAction.INCREASE_SOUNDED_SPEED]: `▶️🗣️ ${getMessage("soundedSpeed")} 🔼`,
  [HotkeyAction.SET_SOUNDED_SPEED]: `▶️🗣️ ${getMessage("soundedSpeed")} =`,
  [HotkeyAction.TOGGLE_SOUNDED_SPEED]: `▶️🗣️ ${getMessage("soundedSpeed")} ${getMessage("switch")} 🔄`,

  // 🤐, 🟥 could also fit.
  [HotkeyAction.DECREASE_SILENCE_SPEED]: `⏩🙊 ${getMessage("silenceSpeed")} 🔽`,
  [HotkeyAction.INCREASE_SILENCE_SPEED]: `⏩🙊 ${getMessage("silenceSpeed")} 🔼`,
  [HotkeyAction.SET_SILENCE_SPEED]: `⏩🙊 ${getMessage("silenceSpeed")} =`,
  [HotkeyAction.TOGGLE_SILENCE_SPEED]: `⏩🙊 ${getMessage("silenceSpeed")} ${getMessage("switch")} 🔄`,

  // TODO should we specify here that the values are in seconds?
  // 📏? Couldn't find anything better.
  [HotkeyAction.DECREASE_MARGIN_BEFORE]: `⏱️⬅️ ${getMessage("marginBefore")} 🔽`,
  [HotkeyAction.INCREASE_MARGIN_BEFORE]: `⏱️⬅️ ${getMessage("marginBefore")} 🔼`,
  [HotkeyAction.SET_MARGIN_BEFORE]: `⏱️⬅️ ${getMessage("marginBefore")} =`,
  [HotkeyAction.TOGGLE_MARGIN_BEFORE]: `⏱️⬅️ ${getMessage("marginBefore")} ${getMessage("switch")} 🔄`,

  [HotkeyAction.DECREASE_MARGIN_AFTER]: `⏱️➡️ ${getMessage("marginAfter")} 🔽`,
  [HotkeyAction.INCREASE_MARGIN_AFTER]: `⏱️➡️ ${getMessage("marginAfter")} 🔼`,
  [HotkeyAction.SET_MARGIN_AFTER]: `⏱️➡️ ${getMessage("marginAfter")} =`,
  [HotkeyAction.TOGGLE_MARGIN_AFTER]: `⏱️➡️ ${getMessage("marginAfter")} ${getMessage("switch")} 🔄`,

  [HotkeyAction.REWIND]: `⬅️ ${getMessage("rewind")}`,
  [HotkeyAction.ADVANCE]: `➡️ ${getMessage("advance")}`,
  [HotkeyAction.TOGGLE_PAUSE]: `⏯️ ${getMessage("togglePause")}`,
  [HotkeyAction.TOGGLE_MUTE]: `🔇 ${getMessage("toggleMute")}`,
  [HotkeyAction.DECREASE_VOLUME]: `🔉 ${getMessage("decreaseVolume")}`,
  [HotkeyAction.INCREASE_VOLUME]: `🔊 ${getMessage("increaseVolume")}`,
};
