import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';

const packageRoot = fileURLToPath(new URL('..', import.meta.url));
const workspaceRoot = join(packageRoot, '..', '..');
const projectionBuild = 'pnpm --filter @narada2/cloudflare-nars-projection build';

function readPackage(relativePath: string): Record<string, unknown> {
  return JSON.parse(readFileSync(join(workspaceRoot, relativePath), 'utf8')) as Record<string, unknown>;
}

function scriptsFor(relativePath: string): Record<string, string> {
  return (readPackage(relativePath).scripts ?? {}) as Record<string, string>;
}

test('clean-dist consumers have explicit projection build gates', () => {
  const projection = readPackage('packages/cloudflare-nars-projection/package.json');
  const exports = projection.exports as Record<string, string | Record<string, string>>;
  const exportTargets = Object.values(exports).flatMap((entry) => (
    typeof entry === 'string'
      ? [entry]
      : Object.values(entry)
  ));

  expect(projection.main).toMatch(/^\.\/dist\//);
  expect(projection.types).toMatch(/^\.\/dist\//);
  expect(exportTargets.length).toBeGreaterThan(0);
  expect(exportTargets.every((target) => target.startsWith('./dist/'))).toBe(true);
  expect(scriptsFor('packages/cloudflare-nars-projection/package.json').build).toBe('tsc');

  for (const relativePath of ['packages/agent-web-ui/package.json', 'packages/layers/cli/package.json']) {
    const scripts = scriptsFor(relativePath);
    for (const lifecycle of ['prebuild', 'pretest', 'pretypecheck']) {
      expect(scripts[lifecycle], relativePath + ' ' + lifecycle).toContain(projectionBuild);
    }
  }
});
