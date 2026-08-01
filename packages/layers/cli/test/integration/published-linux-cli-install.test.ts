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
import { fileURLToPath, pathToFileURL } from 'node:url';

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
  const build = run(packageManager, packageManagerArgs([
    '--filter', '@narada2/cli...',
    '--filter', '!@narada2/cli',
    'build',
  ]), { cwd: naradaProperRoot, timeout: 300_000 });
  assert.equal(build.status, 0, 'published Linux CLI dependency build failed\n' + outputOf(build));
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
    '--config.engine-strict=true',
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

function assertPublishedAdmissionClosure(cliRoot: string): void {
  const admissionRoot = join(cliRoot, 'node_modules', '@narada2', 'carrier-action-admission');
  const admissionManifest = JSON.parse(
    readFileSync(join(admissionRoot, 'package.json'), 'utf8'),
  ) as {
    dependencies?: Record<string, unknown>;
    peerDependencies?: Record<string, unknown>;
  };
  const siteToolsSpec = admissionManifest.dependencies?.['@narada2/site-common-tools']
    ?? admissionManifest.peerDependencies?.['@narada2/site-common-tools'];
  assert.notEqual(
    admissionManifest.dependencies?.['@narada2/site-common-tools'],
    'workspace:*',
    'published carrier-action-admission retains a workspace-only dependency',
  );
  assert.equal(
    siteToolsSpec,
    '0.1.0',
    'published carrier-action-admission must declare a concrete site-common-tools boundary dependency',
  );

  const toolMetadataEntry = join(admissionRoot, 'dist', 'tool-metadata.js');
  assert.equal(existsSync(toolMetadataEntry), true, 'published carrier-action-admission entrypoint is missing');
  const probe = run(process.execPath, [
    '--input-type=module',
    '-e',
    `import(${JSON.stringify(pathToFileURL(toolMetadataEntry).href)})`
      + '.then(() => process.stdout.write("published_admission_probe_ok\\n"))'
      + '.catch((error) => { console.error(error); process.exitCode = 1; })',
  ], { cwd: cliRoot, timeout: 30_000 });
  assert.equal(probe.status, 0, 'published carrier-action-admission dependency closure failed\n' + outputOf(probe));
}

function assertPublishedRuntimeExports(packageRoot: string): void {
  const packageJson = JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8')) as {
    exports?: Record<string, unknown>;
  };
  const serializedExports = JSON.stringify(packageJson.exports ?? {});
  assert.doesNotMatch(
    serializedExports,
    /(?:^|[\\/])src[\\/]|\\.tsx?$/,
    'published_runtime_export_points_to_source: ' + packageRoot,
  );
}

function assertPublishedWorkspaceDependencyClosure(cliRoot: string, packageRoot: string): void {
  const packageJson = JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8')) as {
    dependencies?: Record<string, unknown>;
  };
  for (const dependencyName of Object.keys(packageJson.dependencies ?? {}).filter((name) => name.startsWith('@narada2/'))) {
    assert.ok(
      findInstalledPackageRoot(join(cliRoot, 'node_modules'), dependencyName),
      'published_workspace_dependency_missing: ' + dependencyName,
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

test('published Linux CLI installs independently and reports the resident intelligence setup boundary', {
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
    assertPublishedAdmissionClosure(installedCliRoot);
    const siteToolsRoot = join(installedCliRoot, 'node_modules', '@narada2', 'site-common-tools');
    assert.equal(existsSync(join(siteToolsRoot, 'dist', 'compat', 'mcp-payload-file.legacy-site.js')), true);
    assertPublishedRuntimeExports(siteToolsRoot);
    assertPublishedWorkspaceDependencyClosure(installedCliRoot, siteToolsRoot);
    const fabricContractsRoot = join(installedCliRoot, 'node_modules', '@narada2', 'mcp-fabric-contracts');
    const fabricZod = JSON.parse(readFileSync(join(fabricContractsRoot, 'node_modules', 'zod', 'package.json'), 'utf8')) as { version?: string };
    assert.match(fabricZod.version ?? '', /^4\\./, 'published_mcp_fabric_contracts_requires_zod_4');
    assert.notEqual(resolve(installedCliRoot), resolve(cliPackageRoot));
    assert.doesNotMatch(readFileSync(join(installedCliRoot, 'package.json'), 'utf8'), /D:\\\\code\\\\narada/i);

    const demo = run(process.execPath, [
      installedCliEntrypoint,
      'onboarding', 'start',
      '--scope', 'user-site',
      '--site-root', siteRoot,
      '--demo',
      '--format', 'json',
    ], { cwd: consumerRoot, env, timeout: 180_000 });
    assert.equal(demo.status, 0, 'published Linux demo onboarding failed\n' + outputOf(demo));
    const demoPayload = parseJsonOutput(String(demo.stdout), 'published Linux demo onboarding');
    assert.equal(demoPayload.schema, 'narada.onboarding.start.v1');
    assert.equal(demoPayload.status, 'demo_available');
    assert.equal(demoPayload.mutation_performed, false);

    const onboarding = run(process.execPath, [
      installedCliEntrypoint,
      'onboarding', 'start',
      '--scope', 'user-site',
      '--site-root', siteRoot,
      '--format', 'json',
    ], { cwd: consumerRoot, env, timeout: 180_000 });
    assert.equal(onboarding.status, 0, 'published Linux resident first-use boundary failed\n' + outputOf(onboarding));
    const onboardingPayload = parseJsonOutput(String(onboarding.stdout), 'published Linux onboarding');
    assert.equal(onboardingPayload.schema, 'narada.onboarding.start.v1');
    assert.equal(onboardingPayload.status, 'blocked');
    assert.equal(onboardingPayload.reason_code, 'intelligence_catalog_setup_required');
    assert.equal(onboardingPayload.mutation_performed, true);
    assert.equal(onboardingPayload.user_site.resident_agent, 'user-site.resident');
    assert.match(JSON.stringify(onboardingPayload), /intelligence_context_not_configured/);
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
      McpScope: 'none',
      EnableNativeShell: false,
    }]);
    assert.equal(
      existsSync(env.NARADA_WORKSPACE_LAUNCH_HIDDEN_RUNTIME_LOG!),
      false,
      'resident runtime must not start before explicit intelligence setup',
    );
    assert.equal(
      existsSync(env.NARADA_WORKSPACE_LAUNCH_HIDDEN_PROJECTION_LOG!),
      false,
      'resident operator surface must not start before explicit intelligence setup',
    );

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
    assert.ok(['needs_setup', 'check_required'].includes(doctorPayload.intelligence_catalog_readiness.status));
    assert.doesNotMatch(JSON.stringify(doctorPayload), /api[_-]?key|secret[_-]?value/i);

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
      first_use: {
        mode: 'demo_available',
        resident_launch: 'blocked_until_explicit_intelligence_setup',
        reason_code: onboardingPayload.reason_code,
      },
      diagnostics: {
        missing_artifact: 'covered',
        corrupt_artifact: 'covered',
        incompatible_artifact: 'covered',
      },
    });
  } finally {
    rmSync(tempRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
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
    rmSync(tempRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
});
