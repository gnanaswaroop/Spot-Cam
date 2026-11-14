import { defineConfig, devices } from '@playwright/test';

/**
 * Post-deploy smoke tests against the real, deployed site. Run by the deploy workflow after every
 * release; if they fail, the workflow rolls the site back to the last good version.
 *
 *   LIVE_URL=https://spotcam.in npm run test:live-site
 *   EXPECTED_SHA=<commit>        also require /version.txt to match (proves the new build is the one being served)
 *
 * Read-only: it browses the site with the camera and address services mocked; nothing is submitted.
 */
export default defineConfig({
  testDir: './e2e/live',
  fullyParallel: false,
  workers: 1,
  retries: 1, // one retry absorbs a CDN hiccup; a genuinely broken site fails both attempts
  reporter: [['list']],
  use: {
    baseURL: process.env.LIVE_URL ?? 'https://spotcam.in',
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'live-chromium',
      use: {
        ...devices['Pixel 7'],
        channel: process.env.PW_CHANNEL || 'chromium',
        launchOptions: { args: ['--use-fake-device-for-media-stream'] },
      },
    },
  ],
});
