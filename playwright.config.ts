import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  use: {
    headless: true,
    // Launch Chromium with extension loaded
    launchOptions: {
      args: [
        '--disable-extensions-except=/app/dist-chromium',
        '--load-extension=/app/dist-chromium',
      ],
    },
  },
  webServer: {
    command: 'npx serve -s demo -l 3000',
    port: 3000,
    reuseExistingServer: true,
  },
});
