import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

export default defineConfig({
  resolve: {
    alias: [
      { find: /^sqlite$/, replacement: resolve(__dirname, 'src/sqlite/node-sqlite-shim.ts') },
    ],
  },
  ssr: {
    external: ['node:sqlite'],
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['test/**/*.test.ts'],
    setupFiles: ['./test/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      thresholds: {
        lines: 70,
        functions: 70,
        branches: 60,
        statements: 70
      },
      exclude: [
        'node_modules/',
        'dist/',
        'test/',
        '**/*.d.ts',
        '**/*.config.ts',
        'src/cli/**'
      ]
    },
    testTimeout: 30000,
    hookTimeout: 30000
  },
});
