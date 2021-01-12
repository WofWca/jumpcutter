import { addOnChangedListener, getSettings, Settings, settingsChanges2NewValues } from '@/settings';

export default async function initIconUpdater(): Promise<void> {
  const settings = await getSettings();
  let currentIconPath: string | undefined = undefined;
  function handleNewSettings(settings: Settings) {
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
  }
  handleNewSettings(settings);
  addOnChangedListener(changes => {
    Object.assign(settings, settingsChanges2NewValues(changes));
    handleNewSettings(settings);
  })
}
