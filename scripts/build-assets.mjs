import { cp, mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const distDir = path.join(rootDir, 'dist');

async function ensureDir(dirPath) {
  await mkdir(dirPath, { recursive: true });
}

async function copyFileRelative(from, to) {
  const absFrom = path.join(rootDir, from);
  const absTo = path.join(rootDir, to);
  await ensureDir(path.dirname(absTo));
  await cp(absFrom, absTo);
}

async function copyDirRelative(from, to) {
  const absFrom = path.join(rootDir, from);
  const absTo = path.join(rootDir, to);
  await ensureDir(path.dirname(absTo));
  await cp(absFrom, absTo, { recursive: true });
}

async function copyLocales() {
  const localesSrc = path.join(rootDir, 'src', '_locales');
  const localesDst = path.join(distDir, '_locales');
  await ensureDir(localesDst);

  const entries = await readdir(localesSrc, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === 'LICENSE_NOTICES') {
      await copyFileRelative('src/_locales/LICENSE_NOTICES', 'dist/_locales/LICENSE_NOTICES');
      continue;
    }
    if (!entry.isDirectory()) continue;

    const srcMessages = path.join(localesSrc, entry.name, 'messages.json');
    try {
      const raw = await readFile(srcMessages, 'utf8');
      const parsed = JSON.parse(raw);
      if (Object.keys(parsed).length === 0) continue;
      const dstMessages = path.join(localesDst, entry.name, 'messages.json');
      await ensureDir(path.dirname(dstMessages));
      await writeFile(dstMessages, `${JSON.stringify(parsed)}\n`, 'utf8');
    } catch {
      // Skip malformed or missing locales.
    }
  }

  const aliasMappings = [
    { from: 'nb_NO/messages.json', to: 'nb/messages.json' },
    { from: 'zh_Hans/messages.json', to: 'zh_CN/messages.json' },
    { from: 'zh_Hant/messages.json', to: 'zh_TW/messages.json' },
  ];
  for (const mapping of aliasMappings) {
    const srcFile = path.join(localesDst, mapping.from);
    const dstFile = path.join(localesDst, mapping.to);
    try {
      await stat(srcFile);
      await ensureDir(path.dirname(dstFile));
      await cp(srcFile, dstFile);
    } catch {
      // Ignore missing locale aliases.
    }
  }
}

async function copyIcons() {
  const iconsSrc = path.join(rootDir, 'src', 'icons');
  const iconsDst = path.join(distDir, 'icons');
  await ensureDir(iconsDst);

  const entries = await readdir(iconsSrc, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    if (!entry.name.endsWith('.png')) continue;
    await cp(path.join(iconsSrc, entry.name), path.join(iconsDst, entry.name));
  }
}

async function writeManifest() {
  const raw = await readFile(path.join(rootDir, 'src', 'manifest.chrome.json'), 'utf8');
  const parsed = JSON.parse(raw);
  await writeFile(path.join(distDir, 'manifest.json'), `${JSON.stringify(parsed)}\n`, 'utf8');
}

async function main() {
  await ensureDir(distDir);

  await Promise.all([
    copyFileRelative('COPYING', 'dist/COPYING'),
    copyFileRelative('docs/agplv3-with-text-162x68.png', 'dist/agplv3-with-text-162x68.png'),
    copyFileRelative('src/entry-points/license.html', 'dist/license.html'),
    copyFileRelative('src/entry-points/popup/popup.html', 'dist/popup/popup.html'),
    copyFileRelative('src/entry-points/popup/popup.css', 'dist/popup/popup.css'),
    copyFileRelative('src/entry-points/options/index.html', 'dist/options/index.html'),
    copyFileRelative('src/entry-points/local-file-player/index.html', 'dist/local-file-player/index.html'),
    copyFileRelative('src/entry-points/local-file-player/index.css', 'dist/local-file-player/index.css'),
    copyDirRelative('src/imgs', 'dist/imgs'),
  ]);

  await Promise.all([
    writeManifest(),
    copyLocales(),
    copyIcons(),
  ]);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
