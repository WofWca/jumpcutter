Object.assign(globalThis, {
  IS_DEV_MODE: false,
  BUILD_DEFINITIONS: {
    BROWSER: 'chromium',
    BROWSER_MAY_HAVE_AUDIO_DESYNC_BUG: true,
    BROWSER_MAY_HAVE_EQUAL_OLD_AND_NEW_VALUE_IN_STORAGE_CHANGE_OBJECT: false,
    CONTACT_EMAIL: 'wofwca@protonmail.com',
  },
  chrome: {
    i18n: {
      getMessage: () => '',
    },
    storage: {
      local: {
        get: async () => ({}),
        set: async () => undefined,
      },
    },
  },
});

Object.defineProperty(globalThis, 'navigator', {
  value: {
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  },
  configurable: true,
});
