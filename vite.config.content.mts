import { defineConfig } from 'vite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const isDev = process.env.NODE_ENV !== 'production';
const contentEntryPoints = {
  main: {
    name: 'content/main',
    file: path.resolve(__dirname, 'src/entry-points/content/main.ts'),
  },
  cloneExtension: {
    name: 'content/cloneMediaSources-for-extension-world',
    file: path.resolve(__dirname, 'src/entry-points/content/cloneMediaSources/main-for-extension-world.ts'),
  },
  clonePage: {
    name: 'content/cloneMediaSources-for-page-world',
    file: path.resolve(__dirname, 'src/entry-points/content/cloneMediaSources/main-for-page-world.ts'),
  },
  silenceDetectorProcessor: {
    name: 'content/SilenceDetectorProcessor',
    file: path.resolve(__dirname, 'src/entry-points/content/SilenceDetector/SilenceDetectorProcessor.ts'),
  },
  volumeFilterProcessor: {
    name: 'content/VolumeFilterProcessor',
    file: path.resolve(__dirname, 'src/entry-points/content/VolumeFilter/VolumeFilterProcessor.ts'),
  },
} as const;
const selectedContentEntry = process.env.VITE_CONTENT_ENTRY as keyof typeof contentEntryPoints | undefined;
const contentInputs = selectedContentEntry
  ? { [contentEntryPoints[selectedContentEntry].name]: contentEntryPoints[selectedContentEntry].file }
  : Object.fromEntries(Object.values(contentEntryPoints).map((entry) => [entry.name, entry.file]));
const isContentMainBuild = selectedContentEntry === 'main';
const buildDefinitions = {
  BROWSER: 'chromium',
  BROWSER_MAY_HAVE_AUDIO_DESYNC_BUG: true,
  BROWSER_MAY_HAVE_EQUAL_OLD_AND_NEW_VALUE_IN_STORAGE_CHANGE_OBJECT: false,
  CONTACT_EMAIL: 'wofwca@protonmail.com',
} as const;

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  define: {
    IS_DEV_MODE: JSON.stringify(isDev),
    BUILD_DEFINITIONS: JSON.stringify(buildDefinitions),
  },
  build: {
    outDir: 'dist',
    emptyOutDir: false,
    sourcemap: isDev,
    target: 'es2021',
    rollupOptions: {
      input: contentInputs,
      output: {
        format: isContentMainBuild ? 'iife' : 'es',
        ...(isContentMainBuild ? { name: 'jumpCutterContentMain' } : {}),
        entryFileNames: '[name].js',
        ...(isContentMainBuild ? {} : { chunkFileNames: 'chunks/[name]-[hash].js' }),
        assetFileNames: 'assets/[name]-[hash][extname]',
        inlineDynamicImports: isContentMainBuild,
      },
    },
  },
});
