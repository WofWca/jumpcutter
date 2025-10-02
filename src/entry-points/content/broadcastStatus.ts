/**
 * @license
 * Copyright (C) 2020, 2021, 2022  WofWca <wofwca@protonmail.com>
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

import { browserOrChrome } from '@/webextensions-api-browser-or-chrome';

export default async function broadcastStatus(
  status: { elementLastActivatedAt: undefined | number }
): Promise<void> {
  const p = (browserOrChrome as typeof chrome).runtime.sendMessage({
    type: 'contentStatus', // TODO DRY this?
    ...status,
  });
  // Try-catch in order to not print this error in production.
  try {
    await p
  } catch (error) {
    IS_DEV_MODE &&
      console.log(
        "broadcastStatus failed. This is normal if the popup is not open",
        error
      );
  }
}
