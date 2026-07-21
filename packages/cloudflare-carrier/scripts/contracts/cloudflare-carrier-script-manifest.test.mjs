import assert from 'node:assert/strict';
import { execFileGoverned } from '@narada2/process-launch-posture';
import { existsSync, readdirSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  CARRIER_SCRIPT_SURFACES,
  CARRIER_SCRIPT_SURFACE_IDS,
  carrierScriptSurfaceFor,
} from '../shared/carrier-script-surfaces.mjs';

const packageRoot = fileURLToPath(new URL('../..', import.meta.url));
const packageJsonPath = join(packageRoot, 'package.json');

test('cloudflare carrier package scripts point at parseable local node scripts', async () => {
  const packageJson = JSON.parse(await readFile(packageJsonPath, 'utf8'));
  assert.equal(
    packageJson.scripts?.['continuity:status:live'],
    'node scripts/workflows/cloudflare-site-continuity-scheduler.mjs --action status-all --live --refresh-site-registry-projection',
  );
  assert.equal(
    packageJson.scripts?.['continuity:health'],
    'node scripts/workflows/cloudflare-site-continuity-scheduler.mjs --action health --live --refresh-site-registry-projection',
  );
  assert.equal(
    packageJson.scripts?.['continuity:install'],
    'node scripts/workflows/cloudflare-site-continuity-scheduler.mjs --action install --live',
  );
  assert.equal(
    packageJson.scripts?.['continuity:reconcile'],
    'node scripts/workflows/cloudflare-site-continuity-scheduler.mjs --action reconcile',
  );
  assert.equal(
    packageJson.scripts?.['continuity:reconcile:live'],
    'node scripts/workflows/cloudflare-site-continuity-scheduler.mjs --action reconcile --refresh-site-registry-projection',
  );
  assert.equal(
    packageJson.scripts?.['continuity:reconcile:execute'],
    'node scripts/workflows/cloudflare-site-continuity-scheduler.mjs --action reconcile-execute --live',
  );
  assert.equal(
    packageJson.scripts?.['continuity:run-once'],
    'node scripts/workflows/cloudflare-site-continuity-scheduler.mjs --action reconcile-execute --live',
  );
  assert.equal(
    packageJson.scripts?.['continuity:health:last'],
    'node scripts/workflows/cloudflare-site-continuity-scheduler.mjs --action read-health-last',
  );
  const scriptEntries = Object.entries(packageJson.scripts ?? {})
    .map(([name, command]) => ({ name, command, scriptPath: localNodeScriptPath(command) }))
    .filter((entry) => entry.scriptPath);

  assert.ok(scriptEntries.length > 0, 'expected package scripts to reference local node scripts');

  for (const entry of scriptEntries) {
    assert.equal(existsSync(entry.scriptPath), true, `${entry.name} points at missing script ${entry.scriptPath}`);
    await execFileGoverned(process.execPath, ['--check', entry.scriptPath], { cwd: packageRoot, timeout: 30000, windowsHide: true });
  }
});

test('cloudflare carrier script ownership is explicit and canonical surfaces exist', async () => {
  assert.deepEqual(CARRIER_SCRIPT_SURFACE_IDS, ['commands', 'read_models', 'workflows', 'shared', 'contracts']);
  for (const surface of Object.values(CARRIER_SCRIPT_SURFACES)) {
    assert.equal(existsSync(join(packageRoot, surface.directory)), true, `${surface.directory} must exist`);
    for (const canonicalFile of surface.canonical_files) {
      assert.equal(existsSync(join(packageRoot, canonicalFile)), true, `${canonicalFile} must exist`);
      await execFileGoverned(process.execPath, ['--check', join(packageRoot, canonicalFile)], { cwd: packageRoot, timeout: 30000, windowsHide: true });
    }
  }

  const scriptFiles = listFiles(join(packageRoot, 'scripts'))
    .filter((file) => file.endsWith('.mjs'))
    .map((file) => relative(packageRoot, file).replaceAll('\\', '/'));
  for (const scriptFile of scriptFiles) {
    const surface = carrierScriptSurfaceFor(scriptFile);
    assert.equal(CARRIER_SCRIPT_SURFACE_IDS.includes(surface), true, `${scriptFile} must have a declared surface`);
  }
});

function localNodeScriptPath(command) {
  const trimmed = String(command ?? '').trim();
  const match = /^node\s+(scripts[\\/]\w[\w.-]*(?:[\\/]\w[\w.-]*)*\.mjs)(?:\s|$)/.exec(trimmed);
  if (!match) return null;
  return join(packageRoot, ...match[1].split(/[\\/]/));
}

function listFiles(directory) {
  const entries = readdirSync(directory, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? listFiles(path) : [path];
  });
}
