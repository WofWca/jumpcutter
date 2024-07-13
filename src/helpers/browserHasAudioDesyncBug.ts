import { getChromiumMajorVersion } from "./getBrowserMajorVersion";

let chromiumVersion
/**
 * If `false`, it is guaranteed that it doesn't have this bug,
 * however, there were preview builds of Chromium 128 without this
 * bug fixed, but no released versions. But let's not care about this,
 * because this is not critical anyway.
 * If `true`, I think there is a very minor chance that it actually doesn't,
 * maybe it's some Canary build or something.
 *
 * https://issues.chromium.org/issues/40190553#comment20
 * The bug is fixed in Chromium 128.
 * > It'll go out with M128 as normal.
 */
export const browserHasAudioDesyncBug =
  BUILD_DEFINITIONS.BROWSER_MAY_HAVE_AUDIO_DESYNC_BUG &&
  (chromiumVersion = getChromiumMajorVersion()) != undefined &&
  chromiumVersion < 128;
