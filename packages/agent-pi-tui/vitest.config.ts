import { defineConfig } from 'vitest/config';

const isBun = Boolean(process.versions.bun);

export default defineConfig({
  resolve: {
    conditions: isBun
      ? ['bun', 'import', 'default']
      : ['node', 'import', 'default'],
  },
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    server: {
      deps: {
        inline: isBun ? ['zod'] : [],
      },
    },
  },
});
