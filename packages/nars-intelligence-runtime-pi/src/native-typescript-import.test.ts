import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { dirname } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

test('package source imports under native Node TypeScript stripping', () => {
  const sourceRoot = dirname(fileURLToPath(import.meta.url));
  const result = spawnSync(process.execPath, [
    '--disable-warning=ExperimentalWarning',
    '--experimental-strip-types',
    '--input-type=module',
    '--eval',
    "import('./index.ts').then((module) => { if (typeof module.createIntelligenceKernel !== 'function') process.exit(2); })",
  ], {
    cwd: sourceRoot,
    encoding: 'utf8',
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
});
