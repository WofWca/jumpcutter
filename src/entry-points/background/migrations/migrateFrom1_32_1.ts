import { browserOrChrome } from "@/webextensions-api-browser-or-chrome";

export default async function () {
  const res = await browserOrChrome.storage.local.get([
    "lifetimeTimeSavedComparedToSoundedSpeed",
    "lifetimeTimeSavedComparedToIntrinsicSpeed",
    "lifetimeWouldHaveLastedIfSpeedWasSounded",
    "lifetimeWouldHaveLastedIfSpeedWasIntrinsic",
  ]);
  // Note that `vals` might not have all the 4 keys.
  const vals = Object.values(res);
  if (vals.length !== 4 || vals.some((v) => !Number.isFinite(v))) {
    console.warn(
      "Time saved data appears to be corrupted",
      res,
      "will reset to 0"
    );
    await browserOrChrome.storage.local.set({
      lifetimeTimeSavedComparedToSoundedSpeed: 0,
      lifetimeTimeSavedComparedToIntrinsicSpeed: 0,
      lifetimeWouldHaveLastedIfSpeedWasSounded: 0,
      lifetimeWouldHaveLastedIfSpeedWasIntrinsic: 0,
    });
  }
}
