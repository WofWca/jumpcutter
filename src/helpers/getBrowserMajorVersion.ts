export function getChromiumMajorVersion(): number | undefined {
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
