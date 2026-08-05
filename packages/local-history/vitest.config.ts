import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const isBun = Boolean(process.versions.bun);
const packageRoot = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: isBun
      ? {
          '@narada-core/sqlite': resolve(packageRoot, '../../../narada-core/packages/sqlite/dist/index-bun.js'),
        }
      : {},
    conditions: isBun
      ? ['bun', 'import', 'default']
      : ['node', 'import', 'default'],
  },
  test: {
    server: {
      deps: {
        inline: isBun ? ['@narada-core/sqlite'] : [],
      },
    },
  },
});
