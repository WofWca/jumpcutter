import { addOnChangedListener, getSettings, Settings, settingsChanges2NewValues } from '@/settings';

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
  chrome.browserAction.setIcon({ path });
}

export default async function initIconUpdater(): Promise<void> {
  const settings = await getSettings();
  handleNewSettings(settings);
  addOnChangedListener(changes => {
    Object.assign(settings, settingsChanges2NewValues(changes));
    handleNewSettings(settings);
  })
}
