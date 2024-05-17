/**
 * @license
 * Copyright (C) 2020, 2021, 2022, 2023  WofWca <wofwca@protonmail.com>
 *
 * This file is part of Jump Cutter Browser Extension.
 *
 * Jump Cutter Browser Extension is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * Jump Cutter Browser Extension is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with Jump Cutter Browser Extension.  If not, see <https://www.gnu.org/licenses/>.
 */

import { setSettings, getSettings } from '@/settings';

type ListenerType = Parameters<typeof browser.commands.onCommand.addListener>[0];

export const onCommand: ListenerType = async (command) => {
  switch (command) {
    case 'toggle_enabled': {
      // How about sharing the settings cache object with between all background scripts?
      const { enabled } = await getSettings('enabled');
      await setSettings({ enabled: !enabled });
      break;
    }
    default: {
      if (IS_DEV_MODE) {
        console.error('Unrecognized command', command);
      }
    }
  }
}
