import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = resolve(fileURLToPath(import.meta.url), '..');
const naradaProperRoot = resolve(__dirname, '..', '..', '..', '..', '..');
const cliPackageRoot = resolve(naradaProperRoot, 'packages', 'layers', 'cli');
const runPublicationE2e = process.platform === 'win32' && process.env.NARADA_RUN_PUBLICATION_E2E === '1';
const packageManagerEntrypoint = process.env.npm_execpath ?? null;
const packageManagerUsesNode = packageManagerEntrypoint !== null && /\.(?:cjs|mjs|js)$/i.test(packageManagerEntrypoint);
const packageManager = packageManagerEntrypoint
  ? packageManagerUsesNode ? process.execPath : packageManagerEntrypoint
  : 'pnpm';

function packageManagerArgs(args) {
  return packageManagerUsesNode ? [packageManagerEntrypoint, ...args] : args;
}

function cleanProfileEnv(consumerRoot, siteRoot) {
  const env = {
    ...process.env,
    USERPROFILE: consumerRoot,
    HOME: consumerRoot,
    NARADA_USER_SITE_ROOT: siteRoot,
  };
  for (const key of [
    'NARADA_SITE_ROOT',
    'NARADA_WORKSPACE_ROOT',
    'NARADA_AGENT_ID',
    'NARADA_AI_API_KEY',
    'OPENAI_API_KEY',
    'KIMI_API_KEY',
    'KIMI_CODE_API_KEY',
    'DEEPSEEK_API_KEY',
    'NARADA_PROVIDER_ENV_FALLBACK',
    'NARADA_CODEX_AUTH_HOME',
  ]) delete env[key];
  return env;
}

function run(command, args, options = {}) {
  return spawnSync(command, args, {
    cwd: options.cwd,
    encoding: 'utf8',
    timeout: options.timeout ?? 300_000,
    env: options.env ?? process.env,
    stdio: options.inherit ? 'inherit' : ['pipe', 'pipe', 'pipe'],
  });
}

function outputOf(result) {
  return `status=${String(result.status)}\nerror=${String(result.error ?? '')}\nstdout=${String(result.stdout ?? '')}\nstderr=${String(result.stderr ?? '')}`;
}

function findInstalledPackageRoot(root, packageName) {
  const parts = packageName.split('/');
  const pending = [root];
  const seen = new Set();
  while (pending.length > 0) {
    const current = pending.pop();
    if (!current || seen.has(current)) continue;
    seen.add(current);
    const candidate = join(current, ...parts);
    if (existsSync(join(candidate, 'package.json'))) return candidate;
    let entries;
    try {
      entries = readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (entry.isDirectory() && !entry.isSymbolicLink()) pending.push(join(current, entry.name));
    }
  }
  return null;
}

function parseJsonOutput(result, label) {
  const text = String(result.stdout ?? '');
  const start = text.search(/[\[{]/);
  assert.notEqual(start, -1, `${label}: no JSON payload found\n${outputOf(result)}`);
  return JSON.parse(text.slice(start));
}

test('published CLI installs into a blank Windows profile and provisions the User Site', { skip: !runPublicationE2e }, () => {
  const tempRoot = mkdtempSync(join(tmpdir(), 'narada-publication-e2e-'));
  const packRoot = join(tempRoot, 'pack');
  const consumerRoot = join(tempRoot, 'consumer');
  const siteRoot = join(tempRoot, 'user-site');
  const tarballRoot = resolve(packRoot);

  try {
    mkdirSync(packRoot, { recursive: true });
    mkdirSync(consumerRoot, { recursive: true });
    writeFileSync(join(tempRoot, 'placeholder'), 'publication boundary test\n', 'utf8');
    const pack = run(packageManager, packageManagerArgs([
      '--config.node-linker=hoisted',
      'pack',
      '--pack-destination',
      tarballRoot,
    ]), { cwd: cliPackageRoot, timeout: 180_000 });
    assert.equal(pack.status, 0, `pnpm pack failed\n${outputOf(pack)}`);

    const tarball = readdirSync(packRoot).find((name) => name.endsWith('.tgz'));
    assert.ok(tarball, `pnpm pack produced no tarball\n${outputOf(pack)}`);
    writeFileSync(join(consumerRoot, 'package.json'), JSON.stringify({
      name: 'narada-publication-consumer',
      private: true,
      version: '0.0.0',
    }, null, 2), 'utf8');

    const env = cleanProfileEnv(consumerRoot, siteRoot);
    const install = run(packageManager, packageManagerArgs([
      'add',
      '--ignore-scripts',
      '--config.fetch-retries=1',
      '--config.fetch-timeout=30000',
      join(packRoot, tarball),
    ]), { cwd: consumerRoot, env, timeout: 360_000 });
    assert.equal(install.status, 0, `published CLI install failed\n${outputOf(install)}`);

    const installedCliEntrypoint = join(consumerRoot, 'node_modules', '@narada2', 'cli', 'dist', 'main.js');
    assert.equal(existsSync(installedCliEntrypoint), true, `installed CLI entrypoint missing: ${installedCliEntrypoint}`);
    const installedCliRoot = join(consumerRoot, 'node_modules', '@narada2', 'cli');
    const packagedAsset = join(installedCliRoot, 'dist', 'assets', 'windows', 'Start-NaradaWorkspace.ps1');
    assert.equal(existsSync(packagedAsset), true, `published launcher asset missing: ${packagedAsset}`);
    assert.match(readFileSync(packagedAsset, 'utf8'), /narada-managed-asset: windows-user-site\.v1/);
    for (const packageName of ['agent-runtime-server', 'agent-web-ui']) {
      const packageRoot = findInstalledPackageRoot(join(consumerRoot, 'node_modules'), `@narada2/${packageName}`);
      assert.ok(packageRoot, `published runtime/UI package missing from bundled dependency tree: @narada2/${packageName}`);
      assert.equal(JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8')).name, `@narada2/${packageName}`);
      const requiredOutput = packageName === 'agent-runtime-server'
        ? join(packageRoot, 'bin', 'narada-agent-runtime-server.mjs')
        : join(packageRoot, 'dist', 'index.html');
      assert.equal(existsSync(requiredOutput), true, `published ${packageName} output missing: ${requiredOutput}`);
    }

    const installSite = run(process.execPath, [
      installedCliEntrypoint,
      'install', 'windows-user-site',
      '--site-root', siteRoot,
      '--format', 'json',
    ], { cwd: consumerRoot, env });
    assert.equal(installSite.status, 0, `published User Site install failed\n${outputOf(installSite)}`);
    const installPayload = parseJsonOutput(installSite, 'published User Site install');
    assert.equal(installPayload.schema, 'narada.install.windows_user_site.v1');
    assert.equal(installPayload.status, 'installed');
    assert.equal(installPayload.installation_profile, 'minimal');
    assert.deepEqual(installPayload.optional_modules, []);
    assert.equal(installPayload.package.bundled_components.runtime_server.name, '@narada2/agent-runtime-server');
    assert.equal(installPayload.package.bundled_components.web_ui.name, '@narada2/agent-web-ui');
    assert.equal(existsSync(join(siteRoot, 'Start-NaradaWorkspace.ps1')), true);
    assert.equal(existsSync(join(siteRoot, 'tools', 'operator-secrets', 'Set-NaradaProviderSecret.ps1')), true);

    const doctor = run(process.execPath, [
      installedCliEntrypoint,
      'doctor', '--bootstrap',
      '--cwd', consumerRoot,
      '--format', 'json',
    ], { cwd: consumerRoot, env });
    assert.equal(doctor.status, 0, `published doctor failed\n${outputOf(doctor)}`);
    const doctorPayload = parseJsonOutput(doctor, 'published doctor');
    assert.equal(doctorPayload.schema, 'narada.doctor.bootstrap.v1');
    assert.equal(doctorPayload.installation_boundary, 'published_cli');
    assert.equal(doctorPayload.summary.fail, 0);
    assert.equal(doctorPayload.installation_profile, 'minimal');
    assert.ok(doctorPayload.provider_readiness.some((row) => row.provider === 'demo' && row.status === 'ready'));

    const demo = run(process.execPath, [
      installedCliEntrypoint,
      'onboarding', 'start',
      '--platform', 'windows',
      '--scope', 'user-site',
      '--site-root', siteRoot,
      '--demo',
      '--format', 'json',
    ], { cwd: consumerRoot, env });
    assert.equal(demo.status, 0, `published onboarding demo failed\n${outputOf(demo)}`);
    const demoPayload = parseJsonOutput(demo, 'published onboarding demo');
    assert.equal(demoPayload.schema, 'narada.onboarding.start.v1');
    assert.equal(demoPayload.status, 'demo_available');
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});
