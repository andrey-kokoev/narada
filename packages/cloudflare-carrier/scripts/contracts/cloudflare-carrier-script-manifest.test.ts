import assert from 'node:assert/strict';
import { execFileGoverned } from '@narada-core/process-launch-posture';
import { existsSync, readdirSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  CARRIER_SCRIPT_SURFACES,
  CARRIER_SCRIPT_SURFACE_IDS,
  carrierScriptSurfaceFor,
} from '../shared/carrier-script-surfaces.ts';

const packageRoot = fileURLToPath(new URL('../..', import.meta.url));
const packageJsonPath = join(packageRoot, 'package.json');

test('cloudflare carrier package scripts point at parseable local node scripts', async () => {
  const packageJson = JSON.parse(await readFile(packageJsonPath, 'utf8'));
  assert.equal(
    packageJson.scripts?.['continuity:status:live'],
    'node --import tsx scripts/workflows/cloudflare-site-continuity-scheduler.ts --action status-all --live --refresh-site-registry-projection',
  );
  assert.equal(
    packageJson.scripts?.['continuity:health'],
    'node --import tsx scripts/workflows/cloudflare-site-continuity-scheduler.ts --action health --live --refresh-site-registry-projection',
  );
  assert.equal(
    packageJson.scripts?.['continuity:install'],
    'node --import tsx scripts/workflows/cloudflare-site-continuity-scheduler.ts --action install --live',
  );
  assert.equal(
    packageJson.scripts?.['continuity:reconcile'],
    'node --import tsx scripts/workflows/cloudflare-site-continuity-scheduler.ts --action reconcile',
  );
  assert.equal(
    packageJson.scripts?.['continuity:reconcile:live'],
    'node --import tsx scripts/workflows/cloudflare-site-continuity-scheduler.ts --action reconcile --refresh-site-registry-projection',
  );
  assert.equal(
    packageJson.scripts?.['continuity:reconcile:execute'],
    'node --import tsx scripts/workflows/cloudflare-site-continuity-scheduler.ts --action reconcile-execute --live',
  );
  assert.equal(
    packageJson.scripts?.['continuity:run-once'],
    'node --import tsx scripts/workflows/cloudflare-site-continuity-scheduler.ts --action reconcile-execute --live',
  );
  assert.equal(
    packageJson.scripts?.['continuity:health:last'],
    'node --import tsx scripts/workflows/cloudflare-site-continuity-scheduler.ts --action read-health-last',
  );
  const scriptEntries = Object.entries(packageJson.scripts ?? {})
    .map(([name, command]: any) => ({ name, command, scriptPath: localNodeScriptPath(command) }))
    .filter((entry: any) => entry.scriptPath);

  assert.ok(scriptEntries.length > 0, 'expected package scripts to reference local node scripts');

  for (const entry of scriptEntries) {
    if (!entry.scriptPath) continue;
    assert.equal(existsSync(entry.scriptPath), true, `${entry.name} points at missing script ${entry.scriptPath}`);
    await execFileGoverned(process.execPath, ['--check', entry.scriptPath], { cwd: packageRoot, timeout: 30000, windowsHide: true });
  }
});

test('cloudflare carrier script ownership is explicit and canonical surfaces exist', async () => {
  assert.deepEqual(CARRIER_SCRIPT_SURFACE_IDS, ['commands', 'read_models', 'workflows', 'shared', 'contracts']);
  for (const surface of Object.values(CARRIER_SCRIPT_SURFACES) as any[]) {
    assert.equal(existsSync(join(packageRoot, surface.directory)), true, `${surface.directory} must exist`);
    for (const canonicalFile of surface.canonical_files) {
      assert.equal(existsSync(join(packageRoot, canonicalFile)), true, `${canonicalFile} must exist`);
      await execFileGoverned(process.execPath, ['--check', join(packageRoot, canonicalFile)], { cwd: packageRoot, timeout: 30000, windowsHide: true });
    }
  }

  const scriptFiles = listFiles(join(packageRoot, 'scripts'))
    .filter((file: any) => file.endsWith('.ts'))
    .map((file: any) => relative(packageRoot, file).replaceAll('\\', '/'));
  for (const scriptFile of scriptFiles) {
    const surface = carrierScriptSurfaceFor(scriptFile);
    assert.equal(CARRIER_SCRIPT_SURFACE_IDS.includes(surface), true, `${scriptFile} must have a declared surface`);
  }
});

function localNodeScriptPath(command: any) {
  const trimmed = String(command ?? '').trim();
  const match = /^node(?:\s+--import\s+tsx)?\s+(scripts[\\/]\w[\w.-]*(?:[\\/]\w[\w.-]*)*\.ts)(?:\s|$)/.exec(trimmed);
  if (!match) return null;
  return join(packageRoot, ...match[1].split(/[\\/]/));
}

function listFiles(directory: any): any[] {
  const entries = readdirSync(directory, { withFileTypes: true });
  return entries.flatMap((entry: any) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? listFiles(path) : [path];
  });
}
