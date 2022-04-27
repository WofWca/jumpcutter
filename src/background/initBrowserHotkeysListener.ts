import { browserOrChrome as browser } from '@/webextensions-api-browser-or-chrome';
import { setSettings, getSettings } from '@/settings';

export default function initBrowserHotkeysListener(): void {
  browser.commands.onCommand.addListener(async (command) => {
    switch (command) {
      case 'toggle_enabled': {
        // How about sharing the settings cache object with between all background scripts?
        const { enabled } = await getSettings('enabled');
        await setSettings({ enabled: !enabled });
        break;
      }
      default: {
        if (process.env.NODE_ENV !== 'production') {
          console.error('Unrecognized command', command);
        }
      }
    }
  });
}
