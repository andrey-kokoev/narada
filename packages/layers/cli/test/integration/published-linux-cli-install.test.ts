import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = resolve(fileURLToPath(import.meta.url), '..');
const naradaProperRoot = resolve(__dirname, '..', '..', '..', '..', '..');
const cliPackageRoot = resolve(naradaProperRoot, 'packages', 'layers', 'cli');
const runPublicationE2e = process.platform === 'linux' && process.env.NARADA_RUN_PUBLICATION_E2E === '1';
const packageManagerEntrypoint = process.env.npm_execpath ?? null;
const packageManagerUsesNode = packageManagerEntrypoint !== null && /\.(?:cjs|mjs|js)$/i.test(packageManagerEntrypoint);
const packageManager = packageManagerEntrypoint
  ? packageManagerUsesNode ? process.execPath : packageManagerEntrypoint
  : 'pnpm';

function packageManagerArgs(args: string[]): string[] {
  return packageManagerUsesNode ? [packageManagerEntrypoint!, ...args] : args;
}

function run(command: string, args: string[], options: {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  timeout?: number;
} = {}) {
  return spawnSync(command, args, {
    cwd: options.cwd,
    encoding: 'utf8',
    timeout: options.timeout ?? 300_000,
    env: options.env ?? process.env,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
}

function outputOf(result: ReturnType<typeof spawnSync>): string {
  return [
    'status=' + String(result.status),
    'error=' + String(result.error ?? ''),
    'stdout=' + String(result.stdout ?? ''),
    'stderr=' + String(result.stderr ?? ''),
  ].join('\n');
}

function cleanProfileEnv(consumerRoot: string, siteRoot: string): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    HOME: consumerRoot,
    USERPROFILE: consumerRoot,
    NARADA_USER_SITE_ROOT: siteRoot,
    XDG_CONFIG_HOME: join(consumerRoot, '.config'),
    XDG_DATA_HOME: join(consumerRoot, '.local', 'share'),
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
    'NARADA_CLI_ENTRYPOINT',
    'NARADA_PROPER_ROOT',
  ]) delete env[key];
  return env;
}

function parseJsonOutput(stdout: string, label: string): Record<string, any> {
  const text = String(stdout ?? '');
  const start = text.search(/[\\[{]/);
  assert.notEqual(start, -1, label + ': no JSON payload found\n' + text);
  return JSON.parse(text.slice(start)) as Record<string, any>;
}

function packCli(packRoot: string): string {
  mkdirSync(packRoot, { recursive: true });
  const pack = run(packageManager, packageManagerArgs([
    '--config.node-linker=hoisted',
    'pack',
    '--pack-destination',
    packRoot,
  ]), { cwd: cliPackageRoot, timeout: 180_000 });
  assert.equal(pack.status, 0, 'published Linux CLI pack failed\n' + outputOf(pack));
  const tarball = readdirSync(packRoot).find((name) => name.endsWith('.tgz'));
  assert.ok(tarball, 'published Linux CLI pack produced no tarball\n' + outputOf(pack));
  return join(packRoot, tarball!);
}

function installTarball(consumerRoot: string, tarball: string, env: NodeJS.ProcessEnv) {
  mkdirSync(consumerRoot, { recursive: true });
  writeFileSync(join(consumerRoot, 'package.json'), JSON.stringify({
    name: 'narada-linux-publication-consumer',
    private: true,
    version: '0.0.0',
  }, null, 2) + '\n', 'utf8');
  return run(packageManager, packageManagerArgs([
    'add',
    '--config.node-linker=hoisted',
    '--ignore-scripts',
    '--config.fetch-retries=1',
    '--config.fetch-timeout=30000',
    tarball,
  ]), { cwd: consumerRoot, env, timeout: 360_000 });
}

function assertInstalledCliArtifact(cliRoot: string): void {
  const packageJsonPath = join(cliRoot, 'package.json');
  assert.equal(existsSync(packageJsonPath), true, 'published CLI package.json is missing');
  const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8')) as { name?: string; version?: string };
  assert.equal(packageJson.name, '@narada2/cli');
  assert.ok(packageJson.version, 'published CLI version is missing');
  for (const relativePath of ['dist/main.js', 'dist/index.js', 'dist/mcp-main.js', 'dist/ui/workbench.html']) {
    assert.equal(
      existsSync(join(cliRoot, relativePath)),
      true,
      'published_cli_artifact_incompatible: missing ' + relativePath,
    );
  }
}

function writePublicationEvidence(payload: Record<string, unknown>): void {
  const evidenceRoot = process.env.NARADA_LINUX_INSTALLATION_EVIDENCE_DIR;
  if (!evidenceRoot) return;
  mkdirSync(evidenceRoot, { recursive: true });
  writeFileSync(
    join(evidenceRoot, 'published-cli-install.json'),
    JSON.stringify(payload, null, 2) + '\n',
    'utf8',
  );
}

test('published Linux CLI installs independently and provisions the resident launch handoff', {
  skip: !runPublicationE2e,
}, () => {
  const tempRoot = mkdtempSync(join(tmpdir(), 'narada-linux-publication-e2e-'));
  const packRoot = join(tempRoot, 'pack');
  const consumerRoot = join(tempRoot, 'consumer');
  const siteRoot = join(tempRoot, 'user-site');
  const evidenceRoot = join(tempRoot, 'evidence');
  const tarball = packCli(packRoot);
  const tarballSha256 = createHash('sha256').update(readFileSync(tarball)).digest('hex');

  try {
    const env = cleanProfileEnv(consumerRoot, siteRoot);
    env.NARADA_WORKSPACE_LAUNCH_HIDDEN_RUNTIME_LOG = join(evidenceRoot, 'resident-runtime-command.jsonl');
    env.NARADA_WORKSPACE_LAUNCH_HIDDEN_PROJECTION_LOG = join(evidenceRoot, 'resident-surface-command.log');
    const install = installTarball(consumerRoot, tarball, env);
    assert.equal(install.status, 0, 'published Linux CLI install failed\n' + outputOf(install));

    const installedCliRoot = join(consumerRoot, 'node_modules', '@narada2', 'cli');
    const installedCliEntrypoint = join(installedCliRoot, 'dist', 'main.js');
    assertInstalledCliArtifact(installedCliRoot);
    assert.notEqual(resolve(installedCliRoot), resolve(cliPackageRoot));
    assert.doesNotMatch(readFileSync(join(installedCliRoot, 'package.json'), 'utf8'), /D:\\\\code\\\\narada/i);

    const onboarding = run(process.execPath, [
      installedCliEntrypoint,
      'onboarding', 'start',
      '--platform', 'linux',
      '--scope', 'user-site',
      '--site-root', siteRoot,
      '--format', 'json',
    ], { cwd: consumerRoot, env, timeout: 180_000 });
    assert.equal(onboarding.status, 0, 'published Linux resident launch handoff failed\n' + outputOf(onboarding));
    const onboardingPayload = parseJsonOutput(String(onboarding.stdout), 'published Linux onboarding');
    assert.equal(onboardingPayload.schema, 'narada.onboarding.start.v1');
    assert.equal(onboardingPayload.status, 'launched');
    assert.equal(onboardingPayload.mutation_performed, true);
    assert.equal(existsSync(join(siteRoot, 'config.json')), true);
    const registryPath = join(siteRoot, 'config', 'launch', 'agents.json');
    const registry = JSON.parse(readFileSync(registryPath, 'utf8')) as {
      Agents?: Array<Record<string, unknown>>;
    };
    assert.deepEqual(registry.Agents, [{
      Agent: 'user-site.resident',
      Title: 'General assistant',
      Role: 'resident',
      Site: 'user-site',
      NaradaRoot: siteRoot,
      WorkspaceRoot: siteRoot,
      SiteRoot: siteRoot,
      LauncherPath: installedCliEntrypoint,
      OperatorSurface: 'agent-web-ui',
      Runtime: 'narada-agent-runtime-server',
      EnableNativeShell: false,
    }]);
    assert.equal(existsSync(env.NARADA_WORKSPACE_LAUNCH_HIDDEN_RUNTIME_LOG!), true);
    assert.match(readFileSync(env.NARADA_WORKSPACE_LAUNCH_HIDDEN_RUNTIME_LOG!, 'utf8'), /operator-surface.*runtime.*start/);

    const doctor = run(process.execPath, [
      installedCliEntrypoint,
      'doctor', '--bootstrap',
      '--cwd', consumerRoot,
      '--format', 'json',
    ], { cwd: consumerRoot, env });
    assert.equal(doctor.status, 0, 'published Linux doctor failed\n' + outputOf(doctor));
    const doctorPayload = parseJsonOutput(String(doctor.stdout), 'published Linux doctor');
    assert.equal(doctorPayload.installation_boundary, 'published_cli');
    assert.equal(doctorPayload.summary.fail, 0);
    assert.ok(doctorPayload.provider_readiness.some((row: any) => row.provider === 'demo' && row.status === 'ready'));
    assert.ok(doctorPayload.provider_readiness.every((row: any) => !Object.hasOwn(row, 'value')));

    writePublicationEvidence({
      schema: 'narada.native_linux.published_cli_installation_evidence.v1',
      status: 'passed',
      platform: process.platform,
      node: process.version,
      artifact: {
        path: tarball,
        sha256: tarballSha256,
        installed_root: installedCliRoot,
        version: JSON.parse(readFileSync(join(installedCliRoot, 'package.json'), 'utf8')).version,
      },
      user_site: {
        root: siteRoot,
        registry: registryPath,
        resident: 'user-site.resident',
        launcher_path: installedCliEntrypoint,
      },
      diagnostics: {
        missing_artifact: 'covered',
        corrupt_artifact: 'covered',
        incompatible_artifact: 'covered',
      },
    });
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('published Linux artifact failures remain actionable for missing and corrupt inputs', {
  skip: !runPublicationE2e,
}, () => {
  const tempRoot = mkdtempSync(join(tmpdir(), 'narada-linux-publication-failure-e2e-'));
  const env = cleanProfileEnv(join(tempRoot, 'missing-consumer'), join(tempRoot, 'missing-site'));
  try {
    const missing = installTarball(join(tempRoot, 'missing-consumer'), join(tempRoot, 'does-not-exist.tgz'), env);
    assert.notEqual(missing.status, 0);
    assert.match(outputOf(missing), /ENOENT|no such file|not found|ERR_PNPM/i);

    const corrupt = join(tempRoot, 'corrupt.tgz');
    writeFileSync(corrupt, 'not a gzip archive\n', 'utf8');
    const corruptResult = installTarball(join(tempRoot, 'corrupt-consumer'), corrupt, env);
    assert.notEqual(corruptResult.status, 0);
    assert.match(outputOf(corruptResult), /ERR_PNPM|tar|gzip|archive|integrity|invalid/i);

    const incompatibleRoot = join(tempRoot, 'incompatible-package');
    const incompatiblePackRoot = join(tempRoot, 'incompatible-pack');
    mkdirSync(incompatibleRoot, { recursive: true });
    mkdirSync(incompatiblePackRoot, { recursive: true });
    writeFileSync(join(incompatibleRoot, 'package.json'), JSON.stringify({
      name: 'narada-incompatible-artifact-fixture',
      version: '99.0.0',
      engines: { node: '>=99.0.0' },
    }, null, 2) + '\n', 'utf8');
    const incompatiblePack = run('npm', ['pack', '--pack-destination', incompatiblePackRoot], { cwd: incompatibleRoot });
    assert.equal(incompatiblePack.status, 0, 'incompatible fixture pack failed\n' + outputOf(incompatiblePack));
    const incompatibleTarball = join(incompatiblePackRoot, 'narada-incompatible-artifact-fixture-99.0.0.tgz');
    const incompatible = installTarball(join(tempRoot, 'incompatible-consumer'), incompatibleTarball, env);
    assert.notEqual(incompatible.status, 0, 'incompatible artifact unexpectedly installed under the current Node contract\n' + outputOf(incompatible));
    assert.match(outputOf(incompatible), /engine|node.*99|unsupported|incompatible|ERR_PNPM/i);
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});
