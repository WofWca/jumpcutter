import { browserOrChrome } from "@/webextensions-api-browser-or-chrome"
import { getTimeSavedComparedToSoundedSpeedFraction } from "@/helpers/timeSavedMath"
import { requestIdleCallbackPolyfill } from "./helpers"
import type { MyStorageChanges, Settings } from "@/settings"
import type TimeSavedTracker from "./TimeSavedTracker"

/**
 * @param settings A live, constantly updated object that is in sync with
 * `browser.storage`.
 */
export async function startSendingTimeSavedMessagesForBadge(
  el: HTMLMediaElement,
  settings: Pick<Settings, 'timeSavedRepresentation'>,
  addOnSettingsChangedListener: (
    listener: (changes: MyStorageChanges) => void
  ) => (() => void),
  timeSavedTrackerPromise: Promise<TimeSavedTracker>,
  onStop: (callback: () => void) => void,
) {
  let timeSavedPort_:
    undefined | ReturnType<typeof browserOrChrome.runtime.connect>
  const getTimeSavedPort = () => {
    if (timeSavedPort_ == undefined) {
      // TODO fix: this may connect to two destinations:
      // "local file player" if it's open
      // (when `.connect()` gets executed on another website),
      // and the background script.
      // In such a case in Chromium `onDisconnect` will not fire
      // when the background script gets unloaded,
      // as long as the local file player is open.
      // This results in the badge not getting updated.
      // See
      // - https://bugzilla.mozilla.org/show_bug.cgi?id=1465514
      // - https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/runtime/Port#lifecycle
      // - https://developer.chrome.com/docs/extensions/develop/concepts/messaging#port-lifetime
      timeSavedPort_ = browserOrChrome.runtime.connect({
        name: 'timeSavedBadgeText'
      })

      // The port might get disconnected by the remote party,
      // i.e. the background script getting shut down.
      // In this case we'll want to open another port.
      timeSavedPort_.onDisconnect.addListener(() => {
        timeSavedPort_ = undefined
      })
    }
    return timeSavedPort_
  }
  onStop(() => {
    timeSavedPort_?.disconnect()
    timeSavedPort_ = undefined
  });

  let lastSentTimeSavedValue: undefined | string = undefined;

  const timeSavedTracker = await timeSavedTrackerPromise
  const maybeSendTimeSavedInfo = () => {
    let timeSaved: string
    // Time calculations from `TimeSaved.svelte`.
    // TODO feat: an option to show speed compared to intrinsic speed,
    // or absolute value.
    switch (settings.timeSavedRepresentation) {
      case 'minutesOutOfHour': {
        const fraction = getTimeSavedComparedToSoundedSpeedFraction(
          timeSavedTracker.timeSavedData
        )

        timeSaved = (fraction * 60).toFixed(1);
        break;
      }
      case 'effectivePlaybackRate': {
        const {
          wouldHaveLastedIfSpeedWasSounded,
          timeSavedComparedToSoundedSpeed
        } = timeSavedTracker.timeSavedData;

        timeSaved = (
          wouldHaveLastedIfSpeedWasSounded /
          (wouldHaveLastedIfSpeedWasSounded - timeSavedComparedToSoundedSpeed)
        ).toFixed(2);
        break;
      }
      case 'percentage': {
        const fraction = getTimeSavedComparedToSoundedSpeedFraction(
          timeSavedTracker.timeSavedData
        )

        timeSaved = (fraction * 100).toFixed(1) + '%';
        break;
      }
    }

    if (lastSentTimeSavedValue !== timeSaved) {
      getTimeSavedPort().postMessage(timeSaved);
      lastSentTimeSavedValue = timeSaved;
    }

    el.removeEventListener('timeupdate', maybeSendTimeSavedInfo)
    attachListenerAfterIdle()
  }

  let idleCallbackCancelled = false
  onStop(() => (idleCallbackCancelled = true));
  const attachListener_ = () => {
    if (idleCallbackCancelled) {
      return
    }
    el.addEventListener('timeupdate', maybeSendTimeSavedInfo);
  }
  const attachListenerAfterIdle = () => {
    requestIdleCallbackPolyfill(attachListener_)
  }

  attachListenerAfterIdle()
  onStop(() => {
    el.removeEventListener('timeupdate', maybeSendTimeSavedInfo)
  });
  // Note that we don't remove the listener
  // when the setting value gets changed.

  const removeStorageListener = addOnSettingsChangedListener((changes) => {
    if (changes.timeSavedRepresentation != undefined) {
      maybeSendTimeSavedInfo()
    }
  })
  onStop(removeStorageListener)
}
