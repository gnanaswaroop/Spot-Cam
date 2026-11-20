import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end tests run against the production build, served like GitHub Pages.
 *   npm run test:e2e                 all browsers
 *   npm run test:e2e -- --project=firefox
 *
 * Projects: Chromium (Android Pixel 7), Firefox (desktop), WebKit (iPhone 15, Safari's engine).
 * One-time setup:  npx playwright install chromium firefox webkit
 * Locally on Windows you can reuse the installed Edge for the Chromium project:
 *   PW_CHANNEL=msedge npm run test:e2e
 */
// Lets a test rewrite the service worker script request (see e2e/pwa.spec.ts, the update test).
process.env.PW_EXPERIMENTAL_SERVICE_WORKER_NETWORK_EVENTS = '1';

export default defineConfig({
  testDir: './e2e',
  // screenshots: `npm run screenshots`; live: post-deploy checks against the real site (see playwright.live.config.ts)
  testIgnore: ['**/screenshots.spec.ts', '**/live/**'],
  fullyParallel: true,
  // Three browser engines in parallel is heavy, so a laptop stays light with two. A GitHub runner has four cores, and each
  // browser already runs in its own job there, so use them all.
  workers: process.env.CI ? 4 : 2,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:4173',
    trace: 'retain-on-failure',
    // The service worker caches pages and would hide requests from the mocks. Only e2e/pwa.spec.ts turns it on.
    serviceWorkers: 'block',
  },
  projects: [
    {
      name: 'chromium-android',
      use: {
        ...devices['Pixel 7'],
        // 'chromium' = full Chromium in new headless mode; the default headless shell has no fake camera.
        channel: process.env.PW_CHANNEL || 'chromium',
        // Fake capture device so getUserMedia works without hardware when permission is granted.
        launchOptions: { args: ['--use-fake-device-for-media-stream'] },
      },
    },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit-iphone', use: { ...devices['iPhone 15'] } },
  ],
  webServer: {
    command: 'npm run build && node e2e/pages-server.mjs',
    url: `http://localhost:4173${(process.env.BASE_PATH ?? '').replace(/\/$/, '')}/`,
    // SITE_URL is only needed for the absolute addresses in the SEO tags; any placeholder will do for tests.
    env: { SITE_URL: 'https://example.test' },
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
