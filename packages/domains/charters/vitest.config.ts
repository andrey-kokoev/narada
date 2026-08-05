import { defineConfig } from 'vitest/config';

const isBun = Boolean(process.versions.bun);

export default defineConfig({
  test: {
    server: {
      deps: {
        inline: isBun ? ['zod'] : [],
      },
    },
  },
});
