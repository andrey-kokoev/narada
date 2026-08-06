import { defineConfig } from "vitest/config";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const isBun = Boolean(process.versions.bun);
const packageRoot = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "^(.+\\.js)$": "$1",
      ...(isBun
        ? {
            "@narada-core/sqlite": resolve(packageRoot, "../../../../narada-core/packages/sqlite/dist/index-bun.js"),
          }
        : {}),
    },
    conditions: isBun
      ? ["bun", "import", "default"]
      : ["node", "import", "default"],
  },
  test: {
    globals: true,
    environment: "node",
    include: ["test/**/*.test.ts"],
    passWithNoTests: true,
    testTimeout: 30000,
    hookTimeout: 30000,
    server: {
      deps: {
        inline: isBun ? ["@narada-core/control-plane", "@narada-core/sqlite", "zod"] : [],
      },
    },
  },
});
