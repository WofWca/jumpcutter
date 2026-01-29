import { browserOrChrome } from "@/webextensions-api-browser-or-chrome";

export default async function () {
  const { lifetimeTimeSavedComparedToSoundedSpeed } =
    await browserOrChrome.storage.local.get(
      "lifetimeTimeSavedComparedToSoundedSpeed",
    );
  if (!Number.isFinite(lifetimeTimeSavedComparedToSoundedSpeed)) {
    await browserOrChrome.storage.local.set({
      lifetimeTimeSavedComparedToSoundedSpeed: 0,
    });
  }
}
