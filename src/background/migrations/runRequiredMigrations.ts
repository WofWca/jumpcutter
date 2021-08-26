import type browser from '@/webextensions-api';
import migrateFrom1_3_0 from "./migrateFrom1_3_0";
import migrateFrom1_6_0 from "./migrateFrom1_6_0";
import migrateFrom1_8_0 from "./migrateFrom1_8_0";
import migrateFrom1_10_0 from "./migrateFrom1_10_0";
import migrateFrom1_16_7 from "./migrateFrom1_16_7";

function compareVersions(a: string, b: string) {
  if (process.env.NODE_ENV !== 'production') {
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
sortedMigrationsFrom.push(
  { ver: '1.16.7', fn: migrateFrom1_16_7, },
);
// Post-Firefox extensions store migrations
// sortedMigrationsFrom.push();

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
