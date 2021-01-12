import { addOnChangedListener, getSettings, MyStorageChanges, settingsChanges2NewValues } from '@/settings';

function setBadge(text: string, color: string) {
  chrome.browserAction.setBadgeBackgroundColor({ color });
  chrome.browserAction.setBadgeText({ text });
}
function setBadgeToDefault() {
  chrome.browserAction.setBadgeText({ text: '' });
}
let setBadgeToDefaultTimeout = -1;
function temporarelySetBadge(...badgeParams: Parameters<typeof setBadge>) {
  setBadge(...badgeParams);
  clearTimeout(setBadgeToDefaultTimeout);
  // TODO customizable timeout duration
  setBadgeToDefaultTimeout = (setTimeout as typeof window.setTimeout)(setBadgeToDefault, 1500);
}

export default async function initIconUpdater(): Promise<void> {
  const settings = await getSettings();
  let currentIconPath: string | undefined = undefined;
  /**
   * @param changes - pass `null` to initialize.
   */
  function handleSettingsChanges(changes: MyStorageChanges | null) {
    if (changes) {
      Object.assign(settings, settingsChanges2NewValues(changes));
    }
    let path = 'icons/';
    // TODO these image files are just copy-pasted, with only class name being different. DRY.
    if (!settings.enabled) {
      path += 'icon-disabled.svg'
    } else if (settings.volumeThreshold === 0) {
      path += 'icon-only-sounded.svg'
    } else {
      path += 'icon.svg';
    }
    // Apparently it doesn't perform this check internally. TODO.
    if (currentIconPath !== path) {
      chrome.browserAction.setIcon({ path });
      currentIconPath = path;
    }

    if (changes) {
      // TODO also display `video.volume` changes? Perhaps this script belongs to `content/main.ts`?
      // TODO DRY colors? Though here they're darker anyway, to account for the white text.
      // TODO Also DRY `toFixed` precision, to match the popup?
      if (changes.soundedSpeed) {
        temporarelySetBadge(changes.soundedSpeed.newValue!.toFixed(2), '#0d0');
      } else if (changes.silenceSpeedRaw) {
        temporarelySetBadge(changes.silenceSpeedRaw.newValue!.toFixed(2), '#d00');
      } else if (changes.volumeThreshold) {
        // I guess it's better when it's blue and not red, so it's not confused with `silenceSpeed`.
        temporarelySetBadge(changes.volumeThreshold.newValue!.toFixed(4), '#00d');
      } else if (changes.marginBefore) {
        // TODO any better ideas for background colors for these two?
        temporarelySetBadge(changes.marginBefore.newValue!.toFixed(3), '#333');
      } else if (changes.marginAfter) {
        temporarelySetBadge(changes.marginAfter.newValue!.toFixed(3), '#333');
      }
    }
  }
  handleSettingsChanges(null);
  addOnChangedListener(handleSettingsChanges);
}
