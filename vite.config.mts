import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import sveltePreprocess from 'svelte-preprocess';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const isDev = process.env.NODE_ENV !== 'production';
const uiEntryPoints = {
  popup: {
    name: 'popup/main',
    file: path.resolve(__dirname, 'src/entry-points/popup/main.ts'),
  },
  options: {
    name: 'options/main',
    file: path.resolve(__dirname, 'src/entry-points/options/main.ts'),
  },
  'local-file-player': {
    name: 'local-file-player/main',
    file: path.resolve(__dirname, 'src/entry-points/local-file-player/main.ts'),
  },
} as const;
const selectedUiEntry = process.env.VITE_UI_ENTRY as keyof typeof uiEntryPoints | undefined;
const uiInputs = selectedUiEntry
  ? { [uiEntryPoints[selectedUiEntry].name]: uiEntryPoints[selectedUiEntry].file }
  : Object.fromEntries(Object.values(uiEntryPoints).map((entry) => [entry.name, entry.file]));
const buildDefinitions = {
  BROWSER: 'chromium',
  BROWSER_MAY_HAVE_AUDIO_DESYNC_BUG: true,
  BROWSER_MAY_HAVE_EQUAL_OLD_AND_NEW_VALUE_IN_STORAGE_CHANGE_OBJECT: false,
  CONTACT_EMAIL: 'wofwca@protonmail.com',
} as const;

export default defineConfig({
  plugins: [
    svelte({
      preprocess: sveltePreprocess(),
      compilerOptions: {
        dev: isDev,
        css: 'injected',
      },
    }),
  ],
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
      input: uiInputs,
      output: {
        format: 'es',
        entryFileNames: '[name].js',
        chunkFileNames: 'chunks/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
      },
    },
  },
});
