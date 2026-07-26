import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));
const SCRIPT_PATH = fileURLToPath(new URL('./cloudflare-operator-check.ts', import.meta.url));

function runHelp() {
  return new Promise((resolve: any, reject: any) => {
    const child = spawn(process.execPath, [SCRIPT_PATH, '--help'], {
      cwd: REPO_ROOT,
      env: { ...process.env },
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk: any) => { stdout += chunk; });
    child.stderr.on('data', (chunk: any) => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', (code: any) => resolve({ code, stdout, stderr }));
  });
}

test('cloudflare operator check help describes the current product gate', async () => {
  const result: any = await runHelp();
  assert.equal(result.code, 0, result.stderr);
  assert.match(result.stdout, /Microsoft login surface/);
  assert.match(result.stdout, /cloudflare:operator:check:human/);
  assert.match(result.stdout, /cloudflare:operator:check:human-action/);
  assert.match(result.stdout, /canonical Site/);
  assert.match(result.stdout, /canonical Operation/);
  assert.match(result.stdout, /persistence posture/);
  assert.match(result.stdout, /recovery posture/);
  assert.match(result.stdout, /carrier evidence replay posture/);
  assert.match(result.stdout, /provider-liveness and site-continuity Task Scheduler readbacks/);
  assert.match(result.stdout, /hidden wscript wrapper/);
  assert.match(result.stdout, /task lifecycle cutover gates/);
  assert.match(result.stdout, /repository-publication readiness boundaries/);
  assert.match(result.stdout, /without granting hidden mutation authority/);
  assert.doesNotMatch(result.stdout, /Bearer\s+[A-Za-z0-9._-]+/i);
});
