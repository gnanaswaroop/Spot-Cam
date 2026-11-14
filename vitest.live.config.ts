import { defineConfig } from 'vitest/config';

// Opt-in live check of the real address services. Run with `npm run test:live`; never part of `npm test` or CI.
export default defineConfig({
  test: {
    include: ['tests/live/**/*.live.test.ts'],
    environment: 'node',
  },
});
