import { defineConfig } from 'vitest/config';

// Unit tests are plain TypeScript (no browser). End-to-end tests live in e2e/ and run with Playwright.
export default defineConfig({
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
  },
});
