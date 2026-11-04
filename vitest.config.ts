import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    root: '.',
    include: ['server/test/**/*.test.ts', 'client/src/**/*.test.ts'],
    environment: 'node',
  },
});
