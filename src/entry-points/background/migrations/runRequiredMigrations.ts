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

import migrateFrom1_3_0 from "./migrateFrom1_3_0";
import migrateFrom1_6_0 from "./migrateFrom1_6_0";
import migrateFrom1_8_0 from "./migrateFrom1_8_0";
import migrateFrom1_10_0 from "./migrateFrom1_10_0";
import migrateFrom1_16_7 from "./migrateFrom1_16_7";
import migrateFrom1_18_2 from "./migrateFrom1_18_2";
import migrateFrom1_18_3 from "./migrateFrom1_18_3";
import migrateFrom1_22_1 from "./migrateFrom1_22_1";
import migrateFrom1_25_1 from "./migrateFrom1_25_1";
import migrateFrom1_27_5 from "./migrateFrom1_27_5";

function compareVersions(a: string, b: string) {
  if (IS_DEV_MODE) {
    for (const ver of [a, b]) {
      // From https://semver.org/spec/v2.0.0.html
      if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(ver)) {
        console.error('Invalid or unsupported version string', ver);
      }
    }
  }

  const aParts = a.split('.');
  const bParts = b.split('.');
  for (let partI = 0; partI < 3; partI++) {
    // The actual value carries no meaning. What matters is its relation to 0.
    const diff = parseInt(aParts[partI]) - parseInt(bParts[partI]);
    if (diff !== 0) {
      return diff;
    }
  }
  return 0;
}

const sortedMigrationsFrom: Array<{ ver: `${number}.${number}.${number}`, fn: () => void }> = [];
// Pre-Firefox extensions store migrations. These versions have never been published to that store, so we never need
// to migrate from them.
if (BUILD_DEFINITIONS.BROWSER !== 'gecko') {
  sortedMigrationsFrom.push(
    { ver: '1.3.0', fn: migrateFrom1_3_0, },
    { ver: '1.6.0', fn: migrateFrom1_6_0, },
    { ver: '1.8.0', fn: migrateFrom1_8_0, },
    { ver: '1.10.0', fn: migrateFrom1_10_0, },
  );
}
// Post-Firefox extensions store migrations
sortedMigrationsFrom.push(
  { ver: '1.16.7', fn: migrateFrom1_16_7, },
  { ver: '1.18.2', fn: migrateFrom1_18_2, },
  { ver: '1.18.3', fn: migrateFrom1_18_3, },
  { ver: '1.22.1', fn: migrateFrom1_22_1, },
  { ver: '1.25.1', fn: migrateFrom1_25_1, },
  { ver: '1.27.5', fn: migrateFrom1_27_5, },
);

export default async function runRequiredMigrations(
  previousVersion: Exclude<browser.runtime._OnInstalledDetails['previousVersion'], undefined>
): Promise<void>
{
  const firstRequiredMigrationI = sortedMigrationsFrom
    .findIndex(({ ver: migrationFromVer }) => compareVersions(previousVersion, migrationFromVer) <= 0);
  const sortedRequiredMigrations = firstRequiredMigrationI === -1
    ? []
    : sortedMigrationsFrom.splice(firstRequiredMigrationI);
  for (const { fn } of sortedRequiredMigrations) {
    await fn();
  }
}
