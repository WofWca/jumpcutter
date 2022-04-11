import browser from '@/webextensions-api';
import { addOnStorageChangedListener, getSettings, Settings, MyStorageChanges, settingsChanges2NewValues } from '@/settings';

function setBadge(text: string, color: string) {
  browser.browserAction.setBadgeBackgroundColor({ color });
  browser.browserAction.setBadgeText({ text });
}
type SupportedSettings = keyof Pick<Settings, 'soundedSpeed' | 'silenceSpeedRaw' | 'volumeThreshold' | 'marginBefore'
  | 'marginAfter'>;
function settingToBadgeParams<T extends SupportedSettings>(
  settingName: T,
  value: Settings[T]
): Parameters<typeof setBadge>
{
  switch (settingName) {
    // TODO DRY colors? Though here they're darker anyway, to account for the white text.
    // TODO Also DRY `toFixed` precision, to match the popup?
    case 'soundedSpeed': return [value.toFixed(2), '#0d0'];
    case 'silenceSpeedRaw': return [value.toFixed(2), '#d00'];
    // I guess it's better when it's blue and not red, so it's not confused with `silenceSpeed`.
    case 'volumeThreshold': return [value.toFixed(4), '#00d'];
    // TODO any better ideas for background colors for these two?
    case 'marginBefore': return [value.toFixed(3), '#333'];
    case 'marginAfter': return [value.toFixed(3), '#333'];
    // default: assertNever(settingName); Does not work because of the generic type. TODO
    default: throw new Error();
  }
}
function setBadgeToDefault(settings: Settings) {
  if (settings.badgeWhatSettingToDisplayByDefault === 'none' || !settings.enabled) {
    browser.browserAction.setBadgeText({ text: '' });
  } else {
    const settingName = settings.badgeWhatSettingToDisplayByDefault;
    setBadge(...settingToBadgeParams(settingName, settings[settingName]));
  }
}
let setBadgeToDefaultTimeout = -1;
function temporarelySetBadge(text: string, color: string, settings: Settings) {
  setBadge(text, color);
  clearTimeout(setBadgeToDefaultTimeout);
  // TODO customizable timeout duration
  setBadgeToDefaultTimeout = (setTimeout as typeof window.setTimeout)(setBadgeToDefault, 1500, settings);
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
      browser.browserAction.setIcon({ path });
      currentIconPath = path;
    }

    if (changes) {
      // TODO also display `video.volume` changes? Perhaps this script belongs to `content/main.ts`?
      const orderedSetingsNames =
        ['soundedSpeed', 'silenceSpeedRaw', 'volumeThreshold', 'marginBefore', 'marginAfter'] as const;
      for (const settingName of orderedSetingsNames) {
        const currSettingChange = changes[settingName];
        if (currSettingChange) {
          temporarelySetBadge(...settingToBadgeParams(settingName, currSettingChange.newValue!), settings);
          break;
        }
      }
      // TODO it would be cooler if we wrote the badge's dependencies more declaratively.
      if (changes.badgeWhatSettingToDisplayByDefault || changes.enabled) {
        setBadgeToDefault(settings);
      }
    } else {
      setBadgeToDefault(settings); // In case e.g. `settings.badgeWhatSettingToDisplayByDefault !== 'none'`
    }
  }
  handleSettingsChanges(null);
  addOnStorageChangedListener(handleSettingsChanges);
}
