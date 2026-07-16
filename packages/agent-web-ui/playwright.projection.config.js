import { defineConfig } from '@playwright/test';
import baseConfig from './playwright.config.js';

export default defineConfig({
  ...baseConfig,
  // This is an explicitly isolated projection/layout fixture lane. It is not
  // a substitute for the runtime E2E gate.
  testIgnore: [],
  testMatch: '**/ux-smoke.spec.js',
});
