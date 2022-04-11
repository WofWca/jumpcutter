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

export const HotkeyAction_TOGGLE_PAUSE = HotkeyAction.TOGGLE_PAUSE
