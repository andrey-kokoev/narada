import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';

const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as {
  scripts?: Record<string, string>;
};

describe('Host Fleet live runner wiring', () => {
  test('the smoke command is live-only and planning is explicit', () => {
    expect(packageJson.scripts?.['smoke:host-fleet-live']).toContain('cloudflare-host-fleet-live-e2e.js --live');
    expect(packageJson.scripts?.['smoke:host-fleet-live']).not.toContain('--plan');
    expect(packageJson.scripts?.['test:host-fleet-live']).toContain('smoke:host-fleet-live');
    expect(packageJson.scripts?.['plan:host-fleet-live']).toContain('cloudflare-host-fleet-live-e2e.js --plan');
  });
});
