import assert from 'node:assert/strict';
import { execFileGoverned } from '@narada2/process-launch-posture';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const packageRoot = fileURLToPath(new URL('..', import.meta.url));
const packageJsonPath = join(packageRoot, 'package.json');

test('cloudflare carrier package scripts point at parseable local node scripts', async () => {
  const packageJson = JSON.parse(await readFile(packageJsonPath, 'utf8'));
  assert.equal(
    packageJson.scripts?.['continuity:status:live'],
    'node scripts/cloudflare-site-continuity-scheduler.mjs --action status-all --live --refresh-site-registry-projection',
  );
  assert.equal(
    packageJson.scripts?.['continuity:health'],
    'node scripts/cloudflare-site-continuity-scheduler.mjs --action health --live --refresh-site-registry-projection',
  );
  assert.equal(
    packageJson.scripts?.['continuity:install'],
    'node scripts/cloudflare-site-continuity-scheduler.mjs --action install --live',
  );
  assert.equal(
    packageJson.scripts?.['continuity:reconcile'],
    'node scripts/cloudflare-site-continuity-scheduler.mjs --action reconcile',
  );
  assert.equal(
    packageJson.scripts?.['continuity:reconcile:live'],
    'node scripts/cloudflare-site-continuity-scheduler.mjs --action reconcile --refresh-site-registry-projection',
  );
  assert.equal(
    packageJson.scripts?.['continuity:reconcile:execute'],
    'node scripts/cloudflare-site-continuity-scheduler.mjs --action reconcile-execute --live',
  );
  assert.equal(
    packageJson.scripts?.['continuity:run-once'],
    'node scripts/cloudflare-site-continuity-scheduler.mjs --action reconcile-execute --live',
  );
  assert.equal(
    packageJson.scripts?.['continuity:health:last'],
    'node scripts/cloudflare-site-continuity-scheduler.mjs --action read-health-last',
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

function localNodeScriptPath(command) {
  const trimmed = String(command ?? '').trim();
  const match = /^node\s+(scripts\/[\w.-]+\.mjs|scripts\\[\w.-]+\.mjs)(?:\s|$)/.exec(trimmed);
  if (!match) return null;
  return join(packageRoot, ...match[1].split(/[\\/]/));
}
