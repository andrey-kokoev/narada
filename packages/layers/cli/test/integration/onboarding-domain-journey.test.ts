import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = resolve(fileURLToPath(import.meta.url), '..');
const naradaProperRoot = resolve(__dirname, '..', '..', '..', '..', '..');
const cliEntrypoint = resolve(naradaProperRoot, 'packages', 'layers', 'cli', 'dist', 'main.js');

function runCli(args, env = {}) {
  return spawnSync(process.execPath, [cliEntrypoint, ...args], {
    cwd: naradaProperRoot,
    encoding: 'utf8',
    timeout: 30_000,
    env: { ...process.env, ...env },
  });
}

function parseJsonOutput(stdout, label) {
  const text = String(stdout ?? '');
  const start = text.search(/[\[{]/);
  assert.notEqual(start, -1, `${label}: no JSON payload found:\n${text}`);
  return JSON.parse(text.slice(start));
}

function clearProviderEnvironment() {
  const env = { ...process.env };
  for (const name of [
    'NARADA_INTELLIGENCE_PROVIDER',
    'NARADA_AI_API_KEY',
    'NARADA_AI_BASE_URL',
    'NARADA_AI_MODEL',
    'KIMI_CODE_API_KEY',
    'KIMI_CODE_API_BASE_URL',
    'KIMI_CODE_MODEL',
  ]) delete env[name];
  return env;
}

test('onboarding demo exposes a complete no-credential first-use path through the built CLI', () => {
  const siteRoot = mkdtempSync(join(tmpdir(), 'narada-onboarding-demo-e2e-'));
  try {
    const result = runCli([
      'onboarding', 'start',
      '--platform', 'windows',
      '--scope', 'user-site',
      '--site-root', siteRoot,
      '--demo',
      '--format', 'json',
    ]);
    assert.equal(result.status, 0, `stderr:\n${result.stderr}\nstdout:\n${result.stdout}`);
    const payload = parseJsonOutput(result.stdout, 'onboarding demo');
    assert.equal(payload.schema, 'narada.onboarding.start.v1');
    assert.equal(payload.status, 'demo_available');
    assert.equal(payload.mutation_performed, false);
    assert.equal(payload.readiness.status, 'demo_available');
    assert.match(payload.next_action, /no-credential/i);
    assert.match(payload.next_action, /narada demo/);
  } finally {
    rmSync(siteRoot, { recursive: true, force: true });
  }
});

test('operator-surface launch rejects removed launcher intelligence selection input before materialization', () => {
  const siteRoot = mkdtempSync(join(tmpdir(), 'narada-onboarding-refusal-e2e-'));
  try {
    const result = runCli([
      'operator-surface', 'runtime', 'start', 'agent-web-ui',
      '--site-root', siteRoot,
      '--workspace-root', siteRoot,
      '--target-site-id', 'onboarding-refusal-e2e',
      '--agent', 'onboarding-refusal-e2e.resident',
      '--runtime', 'narada-agent-runtime-server',
      '--intelligence-provider', 'missing-provider-for-e2e',
      '--mcp-scope', 'none',
      '--materialize-only',
      '--format', 'json',
    ], clearProviderEnvironment());
    assert.notEqual(result.status, 0, `expected launch refusal:\n${result.stdout}`);
    const output = `${result.stdout}\n${result.stderr}`;
    assert.match(output, /unknown option.*--intelligence-provider/i);
  } finally {
    rmSync(siteRoot, { recursive: true, force: true });
  }
});
