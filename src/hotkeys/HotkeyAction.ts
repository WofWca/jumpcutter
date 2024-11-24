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

export const HotkeyAction_INCREASE_VOLUME = HotkeyAction.INCREASE_VOLUME;
export const HotkeyAction_DECREASE_VOLUME = HotkeyAction.DECREASE_VOLUME;

export const HotkeyAction_INCREASE_VOLUME_THRESHOLD = HotkeyAction.INCREASE_VOLUME_THRESHOLD;
export const HotkeyAction_DECREASE_VOLUME_THRESHOLD = HotkeyAction.DECREASE_VOLUME_THRESHOLD;
export const HotkeyAction_TOGGLE_VOLUME_THRESHOLD = HotkeyAction.TOGGLE_VOLUME_THRESHOLD;
export const HotkeyAction_SET_VOLUME_THRESHOLD = HotkeyAction.SET_VOLUME_THRESHOLD;

export const HotkeyAction_INCREASE_SOUNDED_SPEED = HotkeyAction.INCREASE_SOUNDED_SPEED;
export const HotkeyAction_DECREASE_SOUNDED_SPEED = HotkeyAction.DECREASE_SOUNDED_SPEED;
export const HotkeyAction_TOGGLE_SOUNDED_SPEED = HotkeyAction.TOGGLE_SOUNDED_SPEED;
export const HotkeyAction_SET_SOUNDED_SPEED = HotkeyAction.SET_SOUNDED_SPEED;

export const HotkeyAction_INCREASE_SILENCE_SPEED = HotkeyAction.INCREASE_SILENCE_SPEED;
export const HotkeyAction_DECREASE_SILENCE_SPEED = HotkeyAction.DECREASE_SILENCE_SPEED;
export const HotkeyAction_TOGGLE_SILENCE_SPEED = HotkeyAction.TOGGLE_SILENCE_SPEED;
export const HotkeyAction_SET_SILENCE_SPEED = HotkeyAction.SET_SILENCE_SPEED;

export const HotkeyAction_INCREASE_MARGIN_BEFORE = HotkeyAction.INCREASE_MARGIN_BEFORE;
export const HotkeyAction_DECREASE_MARGIN_BEFORE = HotkeyAction.DECREASE_MARGIN_BEFORE;
export const HotkeyAction_TOGGLE_MARGIN_BEFORE = HotkeyAction.TOGGLE_MARGIN_BEFORE;
export const HotkeyAction_SET_MARGIN_BEFORE = HotkeyAction.SET_MARGIN_BEFORE;

export const HotkeyAction_INCREASE_MARGIN_AFTER = HotkeyAction.INCREASE_MARGIN_AFTER;
export const HotkeyAction_DECREASE_MARGIN_AFTER = HotkeyAction.DECREASE_MARGIN_AFTER;
export const HotkeyAction_TOGGLE_MARGIN_AFTER = HotkeyAction.TOGGLE_MARGIN_AFTER;
export const HotkeyAction_SET_MARGIN_AFTER = HotkeyAction.SET_MARGIN_AFTER;

export const HotkeyAction_TOGGLE_PAUSE = HotkeyAction.TOGGLE_PAUSE
