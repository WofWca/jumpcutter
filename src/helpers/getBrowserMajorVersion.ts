/**
 * @return `undefined` in case parsing failed (which most likely means that the version is super-duper new).
 */
export function getGeckoMajorVersion(): number | undefined {
  if (IS_DEV_MODE) {
    if (BUILD_DEFINITIONS.BROWSER !== 'gecko') {
      console.warn('`parseGeckoVersion` should not be used in non-gecko builds.');
    }
  }

  // Example value: `Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:96.0) Gecko/20100101 Firefox/96.0`.
  const majorVersionString = navigator.userAgent.match(/rv:(\d+)\./)?.[1];
  if (!majorVersionString) {
    return undefined;
  }
  const majorVersion = parseInt(majorVersionString);
  return isNaN(majorVersion)
    ? undefined
    : majorVersion;
}

/**
 * @see {@link getGeckoMajorVersion}
 */
export function getChromiumMajorVersion(): number | undefined {
  if (IS_DEV_MODE) {
    if (BUILD_DEFINITIONS.BROWSER !== 'chromium') {
      console.warn('`getChromiumMajorVersion` should not be used in non-Chromium builds.');
    }
  }

  // Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36
  const majorVersionString = navigator.userAgent.match(/Chrome\/(\d+)\./)?.[1];
  if (!majorVersionString) {
    return undefined;
  }
  const majorVersion = parseInt(majorVersionString);
  return isNaN(majorVersion)
    ? undefined
    : majorVersion;
}
