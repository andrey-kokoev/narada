import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import ts from 'typescript';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const srcRoot = resolve(packageRoot, 'src');
const forbiddenInternalIdentity = /\b(?:site_id|sites|agent_id|agents|session_id|sessions|runtime_session_id)\b/;

test('Host Fleet source has no internal-host identity vocabulary', () => {
  for (const name of readdirSync(srcRoot).filter((candidate) => candidate.endsWith('.ts'))) {
    const source = readFileSync(resolve(srcRoot, name), 'utf8');
    assert.doesNotMatch(source, forbiddenInternalIdentity, name);
  }
});

test('Host Fleet source imports only its own files and node:crypto', () => {
  for (const name of readdirSync(srcRoot).filter((candidate) => candidate.endsWith('.ts'))) {
    const source = readFileSync(resolve(srcRoot, name), 'utf8');
    const imports = ts.preProcessFile(source, true, true).importedFiles.map((entry) => entry.fileName);
    for (const specifier of imports) {
      assert.ok(
        specifier.startsWith('./') || specifier === 'node:crypto',
        `${name} imports forbidden boundary dependency ${specifier}`,
      );
    }
  }
});

test('Host Fleet has no production package dependencies', () => {
  const manifest = JSON.parse(readFileSync(resolve(packageRoot, 'package.json'), 'utf8')) as Record<string, unknown>;
  for (const field of ['dependencies', 'peerDependencies', 'optionalDependencies']) {
    assert.deepEqual(manifest[field] ?? {}, {}, `${field} must remain empty`);
  }
  const scripts = manifest.scripts as Record<string, unknown>;
  assert.equal(scripts.build, 'node --import tsx scripts/build.ts');
  const buildScript = readFileSync(resolve(packageRoot, 'scripts', 'build.ts'), 'utf8');
  assert.match(buildScript, /rmSync\(resolve\(root, 'dist'\), \{ recursive: true, force: true \}\)/);
});
