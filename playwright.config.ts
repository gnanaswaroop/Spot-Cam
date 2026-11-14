import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end tests run against the production build, served like GitHub Pages.
 *   npm run test:e2e
 * Locally on Windows you can reuse the installed Edge instead of downloading a browser:
 *   PW_CHANNEL=msedge npm run test:e2e
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:4173',
    ...devices['Pixel 7'],
    channel: process.env.PW_CHANNEL || undefined,
    launchOptions: {
      // Fake camera so getUserMedia works without hardware when permission is granted.
      args: ['--use-fake-device-for-media-stream'],
    },
  },
  webServer: {
    command: 'npm run build && node e2e/pages-server.mjs',
    url: 'http://localhost:4173/Spot-Cam/',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
