declare module 'tippy.js/dist/tippy.css'; // Not sure if it's the best way to go about suppressing that error.

declare module 'webextension-polyfill' {
  export = browser;
}

declare const BUILD_DEFINITIONS: {
  BROWSER: 'chromium' | 'gecko',
}
