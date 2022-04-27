// This is for when `browser`'s and `chrome`'s utility have the same signature and behavior, in order to minimize
// the usage of 'webextension-polyfill' in Chromium.
export const browserOrChrome = BUILD_DEFINITIONS.BROWSER === 'chromium'
  // Not just `chrome` because hopefully chromium will add `browser` and deprecate `chrome`
  ? (typeof browser !== 'undefined' ? browser : chrome)
  : browser;
