export const enum OppositeDayMode {
  /**
   * The user (probably) isn't aware of the "opposite day mode".
   * We have either not shown it anywhere yet, or we did show it,
   * but the user hasn't interacted with it.
   */
  UNDISCOVERED = 'undiscovered',
  ON = 'on',
  OFF = 'off',
  /**
   * The user has hidden the checkbox from the popup,
   * by toggling a setting on the options page.
   */
  HIDDEN_BY_USER = 'hiddenByUser',
}

export const OppositeDayMode_UNDISCOVERED = OppositeDayMode.UNDISCOVERED;
export const OppositeDayMode_ON = OppositeDayMode.ON;
export const OppositeDayMode_OFF = OppositeDayMode.OFF;
export const OppositeDayMode_HIDDEN_BY_USER = OppositeDayMode.HIDDEN_BY_USER;
