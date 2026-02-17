import { defineConfig } from 'vite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const isDev = process.env.NODE_ENV !== 'production';
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
      input: {
        'background/main': path.resolve(__dirname, 'src/entry-points/background/main.ts'),
      },
      output: {
        format: 'es',
        entryFileNames: '[name].js',
        chunkFileNames: 'chunks/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
      },
    },
  },
});
