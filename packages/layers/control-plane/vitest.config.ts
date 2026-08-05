import { defineConfig } from 'vitest/config';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const isBun = Boolean(process.versions.bun);
const packageRoot = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: isBun
      ? {
          '@narada-core/sqlite': resolve(packageRoot, '../../../../narada-core/packages/sqlite/dist/index-bun.js'),
        }
      : {},
    conditions: isBun
      ? ['bun', 'import', 'default']
      : ['node', 'import', 'default'],
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
    hookTimeout: 30000,
    server: {
      deps: {
        inline: isBun ? ['@narada-core/sqlite'] : [],
      },
    },
  },
});
