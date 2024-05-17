/**
 * @license
 * Copyright (C) 2021, 2022  WofWca <wofwca@protonmail.com>
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

import type { Settings } from '@/settings';
import { browserOrChrome } from '@/webextensions-api-browser-or-chrome';

export default async function (): Promise<void> {
  const newSettings: Partial<Settings> = {};

  // `popupChartJumpPeriod` is now expressed as a fraction of `popupChartLengthInSeconds`.
  const { popupChartLengthInSeconds, popupChartJumpPeriod } = await browserOrChrome.storage.local.get({
    popupChartLengthInSeconds: 8,
    popupChartJumpPeriod: 0,
  });
  let percent = popupChartJumpPeriod / popupChartLengthInSeconds * 100;
  const sane = 0 <= percent && percent <= 100;
  if (!sane) {
    percent = 0;
  }
  newSettings.popupChartJumpPeriod = percent;

  // Just the new default.
  newSettings.popupChartSpeed = 'soundedSpeedTime';

  await browserOrChrome.storage.local.set(newSettings);
}
