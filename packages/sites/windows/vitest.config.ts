import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["test/**/*.test.ts"],
    passWithNoTests: true,
    testTimeout: 60000,
    hookTimeout: 30000,
  },
  resolve: {
    alias: {
      "^(.+\\.js)$": "$1",
    },
  },
});
