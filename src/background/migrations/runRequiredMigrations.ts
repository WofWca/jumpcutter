import migrateFrom1_3_0 from "./migrateFrom1_3_0";
import migrateFrom1_6_0 from "./migrateFrom1_6_0";
import migrateFrom1_8_0 from "./migrateFrom1_8_0";

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

const sortedMigrationsFrom = [
  { ver: '1.3.0', fn: migrateFrom1_3_0, },
  { ver: '1.6.0', fn: migrateFrom1_6_0, },
  { ver: '1.8.0', fn: migrateFrom1_8_0, },
];

export default async function runRequiredMigrations(
  previousVersion: Exclude<chrome.runtime.InstalledDetails['previousVersion'], undefined>
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
