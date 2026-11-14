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
export default defineConfig({
  testDir: './e2e',
  testIgnore: '**/screenshots.spec.ts', // run with `npm run screenshots`
  fullyParallel: true,
  // Three browser engines in parallel is heavy; keep the default light so a laptop stays responsive.
  workers: 2,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:4173',
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium-android',
      use: {
        ...devices['Pixel 7'],
        channel: process.env.PW_CHANNEL || undefined,
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
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
