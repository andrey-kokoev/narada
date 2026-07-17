import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = resolve(fileURLToPath(import.meta.url), '..');
const naradaProperRoot = resolve(__dirname, '..', '..', '..', '..', '..');
const builtCliEntrypoint = resolve(naradaProperRoot, 'packages', 'layers', 'cli', 'dist', 'main.js');

function runCli(args, env = {}, cwd = naradaProperRoot) {
  return spawnSync(process.execPath, [builtCliEntrypoint, ...args], {
    cwd,
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

test('built CLI boundary provisions an empty Windows User Site and exposes repairable bootstrap state', { skip: process.platform !== 'win32' }, () => {
  const siteRoot = mkdtempSync(join(tmpdir(), 'narada-clean-install-e2e-'));
  const consumerRoot = mkdtempSync(join(tmpdir(), 'narada-clean-consumer-e2e-'));
  try {
    const install = runCli([
      'install', 'windows-user-site',
      '--site-root', siteRoot,
      '--format', 'json',
    ]);
    assert.equal(install.status, 0, `install stderr:\n${install.stderr}\nstdout:\n${install.stdout}`);
    const installPayload = parseJsonOutput(install.stdout, 'clean install');
    assert.equal(installPayload.schema, 'narada.install.windows_user_site.v1');
    assert.equal(installPayload.status, 'installed');
    assert.equal(installPayload.mutation_performed, true);
    assert.equal(existsSync(join(siteRoot, 'config.json')), true);
    assert.equal(existsSync(join(siteRoot, 'config', 'launch', 'agents.psd1')), true);
    assert.equal(existsSync(join(siteRoot, 'Start-NaradaWorkspace.ps1')), true);
    assert.equal(existsSync(join(siteRoot, 'tools', 'operator-secrets', 'Set-NaradaProviderSecret.ps1')), true);

    const doctor = runCli([
      'doctor', '--bootstrap',
      '--cwd', consumerRoot,
      '--format', 'json',
    ], { NARADA_USER_SITE_ROOT: siteRoot }, consumerRoot);
    assert.equal(doctor.status, 0, `doctor stderr:\n${doctor.stderr}\nstdout:\n${doctor.stdout}`);
    const doctorPayload = parseJsonOutput(doctor.stdout, 'clean install doctor');
    assert.equal(doctorPayload.schema, 'narada.doctor.bootstrap.v1');
    assert.equal(doctorPayload.installation_boundary, 'published_cli');
    assert.equal(doctorPayload.status, 'healthy');
    assert.equal(doctorPayload.summary.fail, 0);

    rmSync(join(siteRoot, 'Start-NaradaWorkspace.ps1'), { force: true });
    const degradedDoctor = runCli([
      'doctor', '--bootstrap',
      '--cwd', consumerRoot,
      '--format', 'json',
    ], { NARADA_USER_SITE_ROOT: siteRoot }, consumerRoot);
    assert.notEqual(degradedDoctor.status, 0);
    const degradedPayload = parseJsonOutput(degradedDoctor.stdout, 'degraded install doctor');
    assert.equal(degradedPayload.status, 'degraded');
    assert.equal(degradedPayload.repair_command, 'narada install windows-user-site --repair');

    const repair = runCli([
      'install', 'windows-user-site',
      '--site-root', siteRoot,
      '--repair',
      '--format', 'json',
    ]);
    assert.equal(repair.status, 0, `repair stderr:\n${repair.stderr}\nstdout:\n${repair.stdout}`);
    assert.equal(existsSync(join(siteRoot, 'Start-NaradaWorkspace.ps1')), true);

    const demo = runCli([
      'onboarding', 'start',
      '--platform', 'windows',
      '--scope', 'user-site',
      '--site-root', siteRoot,
      '--demo',
      '--format', 'json',
    ]);
    assert.equal(demo.status, 0, `demo stderr:\n${demo.stderr}\nstdout:\n${demo.stdout}`);
    const demoPayload = parseJsonOutput(demo.stdout, 'clean install demo');
    assert.equal(demoPayload.schema, 'narada.onboarding.start.v1');
    assert.equal(demoPayload.status, 'demo_available');
    assert.equal(demoPayload.mutation_performed, false);
  } finally {
    rmSync(siteRoot, { recursive: true, force: true });
    rmSync(consumerRoot, { recursive: true, force: true });
  }
});
