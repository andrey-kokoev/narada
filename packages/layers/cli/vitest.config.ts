import { defineConfig } from 'vitest/config';

const sqliteFocused = process.env.NARADA_CLI_SQLITE_FOCUSED === '1';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['test/**/*.test.ts'],
    setupFiles: ['./test/setup.ts'],
    pool: sqliteFocused ? 'forks' : undefined,
    fileParallelism: sqliteFocused ? false : undefined,
    maxWorkers: sqliteFocused ? 1 : undefined,
    minWorkers: sqliteFocused ? 1 : undefined,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      thresholds: {
        lines: 60,
        functions: 60,
        branches: 50,
        statements: 60
      },
      exclude: [
        'node_modules/',
        'dist/',
        'test/',
        '**/*.d.ts',
        '**/*.config.ts'
      ]
    },
    testTimeout: sqliteFocused ? 120000 : 30000,
    hookTimeout: sqliteFocused ? 120000 : 30000
  },
});
