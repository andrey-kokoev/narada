import assert from 'node:assert/strict';
import { execFile as execFileCallback } from 'node:child_process';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFile = promisify(execFileCallback);
const packageRoot = fileURLToPath(new URL('..', import.meta.url));
const packageJsonPath = join(packageRoot, 'package.json');

test('cloudflare carrier package scripts point at parseable local node scripts', async () => {
  const packageJson = JSON.parse(await readFile(packageJsonPath, 'utf8'));
  assert.equal(
    packageJson.scripts?.['continuity:status:live'],
    'node scripts/cloudflare-site-continuity-scheduler.mjs --action status-all --refresh-site-registry-projection',
  );
  const scriptEntries = Object.entries(packageJson.scripts ?? {})
    .map(([name, command]) => ({ name, command, scriptPath: localNodeScriptPath(command) }))
    .filter((entry) => entry.scriptPath);

  assert.ok(scriptEntries.length > 0, 'expected package scripts to reference local node scripts');

  for (const entry of scriptEntries) {
    assert.equal(existsSync(entry.scriptPath), true, `${entry.name} points at missing script ${entry.scriptPath}`);
    await execFile(process.execPath, ['--check', entry.scriptPath], { cwd: packageRoot, timeout: 30000, windowsHide: true });
  }
});

function localNodeScriptPath(command) {
  const trimmed = String(command ?? '').trim();
  const match = /^node\s+(scripts\/[\w.-]+\.mjs|scripts\\[\w.-]+\.mjs)(?:\s|$)/.exec(trimmed);
  if (!match) return null;
  return join(packageRoot, ...match[1].split(/[\\/]/));
}
