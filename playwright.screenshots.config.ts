import { defineConfig } from '@playwright/test';
import base from './playwright.config';

/** Regenerates docs/screenshots/*.png from the built site:  npm run screenshots */
export default defineConfig({
  ...base,
  testIgnore: undefined,
  testMatch: '**/screenshots.spec.ts',
  projects: base.projects?.filter(p => p.name === 'chromium-android'),
  workers: 1,
});
