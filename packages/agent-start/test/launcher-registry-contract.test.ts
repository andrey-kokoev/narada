import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { runHiddenPostureCommandSync } from '@narada-core/process-launch-posture';
import {
  ADMITTED_LAUNCH_SELECTION_KINDS,
  operatorSurfaceLaunchMatrixRow,
  defaultRuntimeForOperatorSurface,
  NARADA_AGENT_RUNTIME_SERVER_KIND,
} from '@narada-core/operator-surface-runtime-contract/operator-surface-runtime-selection';

const require: any = createRequire(import.meta.url);
const __dirname: any = dirname(fileURLToPath(import.meta.url));
const packageRoot: any = resolve(__dirname, '..');
const naradaProperRoot: any = resolve(packageRoot, '..', '..');
const fixtureRegistryPath: any = join(__dirname, 'fixtures', 'launch-registry.psd1');
const packagedLauncherPath: any = join(naradaProperRoot, 'packages', 'agent-start', 'src', 'narada-agent-start.ts');
const tsxLoaderPath: any = pathToFileURL(require.resolve('tsx')).href;
const admittedCarrierMatrix: any = Object.freeze([...ADMITTED_LAUNCH_SELECTION_KINDS]);
const requiredFields: any = Object.freeze(['Agent', 'NaradaRoot', 'WorkspaceRoot', 'SiteRoot', 'Launcher', 'Carrier', 'Runtime']);
const pwshAvailable: any = spawnHiddenSync('pwsh', ['-NoProfile', '-Command', '$PSVersionTable.PSVersion.Major'], { encoding: 'utf8' }).status === 0;
const nonNaradaProperSites: any = Object.freeze([
  'andrey-user',
  'narada-staccato',
  'narada-revolution',
  'narada-timour-marketing-agent',
  'narada-utz',
  'sonar',
  'smart-scheduling',
  'thoughts-project',
]);

function spawnHiddenSync(command: any, args: any, options: any = {}) : any{
  return runHiddenPostureCommandSync(command, args, { ...options, posture: 'test_child' });
}

function parseRegistry(text: any) : any{
  const records: any = [];
  let current: any = null;
  for (const rawLine of text.replace(/^\uFEFF/, '').split(/\r?\n/)) {
    const line: any = rawLine.trim();
    if (line === '@{') {
      current = {};
      records.push(current);
      continue;
    }
    if (!current) continue;
    if (line === '}') {
      current = null;
      continue;
    }
    const value: any = line.match(/^(Agent|Title|Site|NaradaRoot|WorkspaceRoot|SiteRoot|Launcher|LauncherPath|Carrier|Runtime)\s*=\s*['\"]([^'\"]+)['\"]/);
    if (value) current[value[1]] = value[2];
  }
  return records.filter((record: any) => record.Agent);
}

function recordsFrom(path: any) : any{
  return parseRegistry(readFileSync(path, 'utf8'));
}

function siteId(record: any) : any{
  return record.Site ?? record.Agent.replace(/\.(architect|builder2?|resident|Kevin|Bob|Robin)$/u, '');
}

function normalizePath(value: any) : any{
  return resolve(String(value)).replace(/[\\/]+$/, '').toLowerCase();
}

function launcherPathFor(record: any) : any{
  return record.LauncherPath ?? join(record.NaradaRoot, record.Launcher);
}

function assertRegistryContract(records: any, sourceLabel: any) : any{
  assert.equal(records.length > 0, true, `${sourceLabel}: registry must contain records`);
  const agents: any = new Set();
  const sites: any = new Set();
  for (const record of records) {
    for (const field of requiredFields) {
      assert.equal(Boolean(record[field]), true, `${sourceLabel}:${record.Agent}: missing ${field}`);
    }
    assert.equal(agents.has(record.Agent), false, `${sourceLabel}:${record.Agent}: duplicate agent`);
    agents.add(record.Agent);
    sites.add(siteId(record));
    assert.equal(admittedCarrierMatrix.includes(record.Carrier), true, `${sourceLabel}:${record.Agent}: carrier ${record.Carrier} not in admitted carrier matrix`);
    assert.equal(record.Launcher.includes('tools\\agent-start'), false, `${sourceLabel}:${record.Agent}: launcher must not point at site-local start-agent`);
    assert.equal(record.Launcher.includes('tools/agent-start'), false, `${sourceLabel}:${record.Agent}: launcher must not point at site-local start-agent`);
    assert.equal(normalizePath(record.SiteRoot).startsWith(normalizePath(record.NaradaRoot)), true, `${sourceLabel}:${record.Agent}: SiteRoot must be under NaradaRoot`);
  }
  for (const expectedSite of nonNaradaProperSites) {
    assert.equal(sites.has(expectedSite), true, `${sourceLabel}: missing registered site ${expectedSite}`);
  }
}

function buildSiteLaunchContracts(records: any) : any{
  const contracts: any = new Map();
  for (const record of records) {
    const site: any = siteId(record);
    const envelope: any = {
      narada_root: normalizePath(record.NaradaRoot),
      workspace_root: normalizePath(record.WorkspaceRoot),
      site_root: normalizePath(record.SiteRoot),
      launcher: normalizePath(launcherPathFor(record)),
    };
    const existing: any = contracts.get(site);
    if (!existing) {
      contracts.set(site, { site_id: site, agent_count: 1, envelope });
      continue;
    }
    assert.deepEqual(existing.envelope, envelope, `${site}: roles must share one launch envelope`);
    existing.agent_count += 1;
  }
  return [...contracts.values()].sort((left: any, right: any) => left.site_id.localeCompare(right.site_id));
}

function assertGeneratedSiteLaunchContracts(records: any, sourceLabel: any) : any{
  const contracts: any = buildSiteLaunchContracts(records);
  assert.equal(contracts.length > 0, true, `${sourceLabel}: at least one site launch contract is required`);
  for (const contract of contracts) {
    assert.equal(contract.agent_count > 0, true, `${sourceLabel}:${contract.site_id}: site must have an agent`);
    for (const field of ['narada_root', 'workspace_root', 'site_root', 'launcher']) {
      assert.equal(contract.envelope[field].length > 0, true, `${sourceLabel}:${contract.site_id}: ${field} is required`);
    }
  }
}

function assertLauncherFileShape(records: any, sourceLabel: any) : any{
  for (const record of records) {
    const launcherPath: any = launcherPathFor(record);
    assert.equal(existsSync(launcherPath), true, `${sourceLabel}:${record.Agent}: launcher missing ${launcherPath}`);
    const text: any = readFileSync(launcherPath, 'utf8');
    assert.equal(text.includes('packages\\agent-start\\src\\narada-agent-start.ts'), true, `${sourceLabel}:${record.Agent}: launcher must delegate to packaged TS agent-start`);
    assert.equal(text.includes('packages\\agent-start\\bin\\narada-agent-start.ts'), false, `${sourceLabel}:${record.Agent}: launcher must not delegate to removed mjs bin`);
    assert.equal(text.includes('tools\\agent-start\\start-agent.ts'), false, `${sourceLabel}:${record.Agent}: launcher must not delegate to site-local start-agent`);
    assert.equal(text.includes('--import $tsxLoader'), true, `${sourceLabel}:${record.Agent}: launcher must use explicit TSX loader variable`);
  }
}

function dryRunEnv(carrier: any) : any{
  if (carrier === 'codex') return { NARADA_CODEX_CLI_SCRIPT: packagedLauncherPath };
  if (operatorSurfaceLaunchMatrixRow(carrier)?.runtime_host_kind === NARADA_AGENT_RUNTIME_SERVER_KIND) return {
    NARADA_INTELLIGENCE_PROVIDER: 'kimi-code-api',
    NARADA_PROVIDER_SECRET_STORE: 'disabled',
    NARADA_PROVIDER_ENV_FALLBACK: '1',
    NARADA_CODEX_SUBSCRIPTION_PREFLIGHT: 'defer',
    KIMI_CODE_API_KEY: 'test-key',
  };
  if (carrier === 'agent-tui') return {
    NARADA_PROVIDER_SECRET_STORE: 'disabled',
    NARADA_PROVIDER_ENV_FALLBACK: '1',
    NARADA_CODEX_SUBSCRIPTION_PREFLIGHT: 'defer',
    NARADA_INTELLIGENCE_PROVIDER: 'kimi-code-api',
    KIMI_CODE_API_BASE_URL: 'https://api.kimi.com/coding/',
    KIMI_CODE_MODEL: 'kimi-k2.7',
    KIMI_CODE_API_KEY: 'test-key',
  };
  return {};
}

function parseJsonOutput(output: any) : any{
  const text: any = String(output ?? '').trim();
  const start: any = text.indexOf('{');
  const end: any = text.lastIndexOf('}');
  assert.ok(start >= 0 && end >= start, `json object missing from output: ${text.slice(0, 500)}`);
  return JSON.parse(text.slice(start, end + 1));
}

function assertCarrierMatrixDryRuns(records: any, sourceLabel: any) : any{
  for (const record of records) {
    for (const carrier of admittedCarrierMatrix) {
      const matrixRow: any = operatorSurfaceLaunchMatrixRow(carrier);
      assert.ok(matrixRow, `${sourceLabel}:${record.Agent}:${carrier}: carrier matrix row is required`);
      const runtime: any = defaultRuntimeForOperatorSurface(carrier);
      assert.equal(runtime, matrixRow.runtime_substrate_kind);
      const result: any = spawnHiddenSync(process.execPath, [
        '--import',
        tsxLoaderPath,
        packagedLauncherPath,
        record.Agent,
        '--site-root',
        record.NaradaRoot,
        '--target-site-root',
        record.SiteRoot,
        '--carrier',
        carrier,
        '--runtime',
        runtime,
        '--dry-run',
        '--json',
      ], {
        cwd: record.NaradaRoot,
        encoding: 'utf8',
        env: { ...process.env, ...dryRunEnv(carrier) },
      });
      assert.equal(result.status, 0, `${sourceLabel}:${record.Agent}:${carrier}/${runtime}: ${result.stderr || result.stdout}`);
      const launch: any = parseJsonOutput(result.stdout);
      assert.equal(launch.status, 'dry_run', `${sourceLabel}:${record.Agent}:${carrier}/${runtime}: ${result.stdout}`);
      assert.equal(launch.carrier_kind, matrixRow.launch_selection_kind);
      assert.equal(launch.launch_selection_kind, matrixRow.launch_selection_kind);
      assert.equal(launch.operator_surface_kind, matrixRow.operator_surface_kind);
      assert.equal(launch.carrier_implementation_kind, matrixRow.carrier_implementation_kind);
      assert.equal(launch.runtime_substrate_kind, matrixRow.runtime_substrate_kind);
      assert.equal(launch.runtime_host_kind, matrixRow.runtime_host_kind);
      assert.equal(launch.runtime_resolution.status, 'accepted');
      assert.equal(launch.carrier_session.record.launch_selection_kind, matrixRow.launch_selection_kind);
      assert.equal(launch.carrier_session.record.launch_operator_surface_kind, matrixRow.operator_surface_kind);
      assert.equal(launch.carrier_session.record.operator_surface_kind, matrixRow.operator_surface_kind);
      assert.equal(launch.tool_fabric_adapter_kind, matrixRow.tool_fabric_adapter_kind);
      assert.equal(launch.tool_fabric_adapter.runtime_substrate_kind, matrixRow.runtime_substrate_kind);
      assert.equal(launch.tool_fabric_adapter.runtime_host_kind, matrixRow.runtime_host_kind);
      assert.equal(launch.tool_fabric_adapter.launch_selection_kind, matrixRow.launch_selection_kind);
      assert.equal(launch.tool_fabric_adapter.operator_surface_kind, matrixRow.operator_surface_kind);
      assert.equal(launch.tool_fabric_adapter.carrier_implementation_kind, matrixRow.carrier_implementation_kind);
      assert.equal(launch.tool_fabric_adapter.tool_fabric_source, matrixRow.tool_fabric_source);
      assert.equal(launch.tool_fabric_adapter.adapter_entrypoint, matrixRow.adapter_entrypoint);
      assert.deepEqual(launch.tool_fabric_adapter.projection_capabilities, matrixRow.projection_capabilities);
      assert.equal(launch.tool_fabric_adapter.expected_tools_scope, matrixRow.expected_tools_scope);
      assert.deepEqual(launch.tool_fabric_adapter.expected_tools, matrixRow.expected_tools);
      assert.deepEqual(launch.tool_fabric_adapter.states, matrixRow.states);
    }
  }
}

test('package fixture encodes the launcher registry boundary', () => {
  const records: any = recordsFrom(fixtureRegistryPath);
  assertRegistryContract(records, 'fixture');
  assertGeneratedSiteLaunchContracts(records, 'fixture');
  assertLauncherFileShape(records, 'fixture');
  const deterministicCarrierRecords: any = records.filter((record: any) => normalizePath(record.NaradaRoot) === normalizePath(naradaProperRoot));
  assert.equal(deterministicCarrierRecords.length > 0, true, 'fixture: deterministic Narada proper record is required for the carrier matrix');
  assertCarrierMatrixDryRuns([deterministicCarrierRecords[0]], 'fixture');
  assert.equal(existsSync(packagedLauncherPath), true, 'packaged TS launcher must exist in Narada proper');
});

test('live operator registry conforms when explicitly supplied', { skip: !process.env.NARADA_AGENT_START_LIVE_REGISTRY }, () => {
  const records: any = recordsFrom(process.env.NARADA_AGENT_START_LIVE_REGISTRY);
  assertRegistryContract(records, 'live');
  assertGeneratedSiteLaunchContracts(records, 'live');
  assertLauncherFileShape(records, 'live');
});

test('registered launcher verifier documents sharding filters', () => {
  const result: any = spawnHiddenSync(process.execPath, [join(packageRoot, 'bin', 'verify-registered-site-launchers.ts'), '--help'], {
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /--agent <agent>/);
  assert.match(result.stdout, /--site <site>/);
  assert.match(result.stdout, /--record-offset <n>/);
  assert.match(result.stdout, /--record-limit <n>/);
  assert.match(result.stdout, /--launch-timeout-ms <n>/);
  assert.match(result.stdout, /--jobs <n>/);
  assert.match(result.stdout, /--retries <n>/);
  assert.match(result.stdout, /agent-tui-only/);
});

test('registered launcher verifier exercises the PowerShell dry-run handoff', { skip: !pwshAvailable }, () => {
  const tempRoot: any = mkdtempSync(join(tmpdir(), 'narada-launcher-verifier-'));
  try {
    const naradaRoot: any = join(tempRoot, 'site');
    const workspaceRoot: any = naradaRoot;
    const siteRoot: any = join(naradaRoot, '.narada');
    mkdirSync(siteRoot, { recursive: true });

    const launcherPath: any = join(naradaRoot, 'narada-test.ps1');
    writeFileSync(launcherPath, [
      '$tsxLoader = "tsx"',
      'node --import $tsxLoader packages\\agent-start\\src\\narada-agent-start.ts',
      '',
    ].join('\n'), 'utf8');

    const registryPath: any = join(tempRoot, 'agents.psd1');
    writeFileSync(registryPath, [
      '@{',
      '  Agents = @(',
      '    @{',
      '      Agent = "narada-test.resident"',
      '      Title = "Narada Test Resident"',
      '      Site = "narada-test"',
      `      NaradaRoot = "${naradaRoot.replaceAll('\\', '\\\\')}"`,
      `      WorkspaceRoot = "${workspaceRoot.replaceAll('\\', '\\\\')}"`,
      `      SiteRoot = "${siteRoot.replaceAll('\\', '\\\\')}"`,
      '      Launcher = "narada-test.ps1"',
      '      Carrier = "agent-cli"',
      '      Runtime = "narada-agent-runtime-server"',
      '    }',
      '    @{',
      '      Agent = "narada-test.builder"',
      '      Title = "Narada Test Builder"',
      '      Site = "narada-test"',
      `      NaradaRoot = "${naradaRoot.replaceAll('\\', '\\\\')}"`,
      `      WorkspaceRoot = "${workspaceRoot.replaceAll('\\', '\\\\')}"`,
      `      SiteRoot = "${siteRoot.replaceAll('\\', '\\\\')}"`,
      '      Launcher = "narada-test.ps1"',
      '      Carrier = "agent-cli"',
      '      Runtime = "narada-agent-runtime-server"',
      '    }',
      '  )',
      '}',
      '',
    ].join('\n'), 'utf8');

    const startAgentPath: any = join(tempRoot, 'Start-NaradaAgent.ps1');
    writeFileSync(startAgentPath, [
      'param(',
      '  [string]$NaradaRoot,',
      '  [string]$SiteRoot,',
      '  [string]$Agent,',
      '  [string]$Carrier,',
      '  [string]$Runtime,',
      '  [string]$WorkspaceRoot,',
      '  [switch]$DryRun',
      ')',
      "$segments = $Agent -split '\\.'",
      "$siteId = if ($segments.Length -gt 1) { ($segments[0..($segments.Length - 2)] -join '.') } else { $null }",
      '$localAgentId = if ($segments.Length -gt 1) { $segments[-1] } else { $Agent }',
      "$role = $localAgentId -replace '\\d+$', ''",
      '$result = @{',
      '  schema = "narada.agent_start.result.v0"',
      '  status = "dry_run"',
      '  identity = $Agent',
      '  agent_identity_ref = @{',
      '    schema = "narada.agent_identity_ref.v2"',
      '    identity_scope = if ($siteId) { @{ kind = "narada_site"; site_id = $siteId } } else { @{ kind = "unscoped" } }',
      '    local_agent_id = $localAgentId',
      '    role = $role',
      '    canonical_agent_id = if ($siteId) { "$siteId.$localAgentId" } else { $localAgentId }',
      '    display = if ($siteId) { "$siteId.$localAgentId" } else { $localAgentId }',
      '    legacy_agent_id = $Agent',
      '  }',
      '  carrier_kind = $Carrier',
      '  runtime = $Runtime',
      '  tool_fabric_adapter_kind = "narada-agent-runtime-server-mcp-client"',
      '  required_environment = @{',
      '    NARADA_SITE_ROOT = $SiteRoot',
      '    NARADA_WORKSPACE_ROOT = $WorkspaceRoot',
      '  }',
      '  runtime_args = @()',
      '}',
      '$result | ConvertTo-Json -Depth 8',
      '',
    ].join('\n'), 'utf8');

    const result: any = spawnHiddenSync(process.execPath, [
      join(packageRoot, 'bin', 'verify-registered-site-launchers.ts'),
      '--registry',
      registryPath,
      '--start-agent',
      startAgentPath,
      '--runtime-policy',
      'default-only',
      '--agent',
      'narada-test.resident',
    ], {
      cwd: workspaceRoot,
      encoding: 'utf8',
      env: { ...process.env, NARADA_PROPER_ROOT: naradaProperRoot },
    });

    assert.equal(result.status, 0, result.stderr || result.stdout);
    const output: any = JSON.parse(result.stdout);
    assert.equal(output.status, 'ok');
    assert.equal(output.registered_records, 2);
    assert.equal(output.filtered_records, 1);
    assert.equal(output.selected_records, 1);
    assert.equal(output.checked_launches, 1);
    assert.equal(output.runtime_policy, 'default-only');
    assert.deepEqual(output.filters.agents, ['narada-test.resident']);
    assert.deepEqual(output.shard, { record_offset: 0, record_limit: null, launch_timeout_ms: 30000, jobs: 1, retries: 1 });

    const shard: any = spawnHiddenSync(process.execPath, [
      join(packageRoot, 'bin', 'verify-registered-site-launchers.ts'),
      '--registry',
      registryPath,
      '--start-agent',
      startAgentPath,
      '--runtime-policy',
      'default-only',
      '--record-offset',
      '1',
      '--record-limit',
      '1',
    ], {
      cwd: workspaceRoot,
      encoding: 'utf8',
      env: { ...process.env, NARADA_PROPER_ROOT: naradaProperRoot },
    });

    assert.equal(shard.status, 0, shard.stderr || shard.stdout);
    const shardOutput: any = JSON.parse(shard.stdout);
    assert.equal(shardOutput.status, 'ok');
    assert.equal(shardOutput.registered_records, 2);
    assert.equal(shardOutput.filtered_records, 2);
    assert.equal(shardOutput.selected_records, 1);
    assert.equal(shardOutput.checked_launches, 1);
    assert.deepEqual(shardOutput.shard, { record_offset: 1, record_limit: 1, launch_timeout_ms: 30000, jobs: 1, retries: 1 });

    const progressShard: any = spawnHiddenSync(process.execPath, [
      join(packageRoot, 'bin', 'verify-registered-site-launchers.ts'),
      '--registry',
      registryPath,
      '--start-agent',
      startAgentPath,
      '--runtime-policy',
      'default-only',
      '--record-offset',
      '0',
      '--record-limit',
      '1',
      '--jobs',
      '2',
      '--progress',
    ], {
      cwd: workspaceRoot,
      encoding: 'utf8',
      env: { ...process.env, NARADA_PROPER_ROOT: naradaProperRoot },
    });

    assert.equal(progressShard.status, 0, progressShard.stderr || progressShard.stdout);
    const progressOutput: any = JSON.parse(progressShard.stdout);
    assert.equal(progressOutput.status, 'ok');
    assert.equal(progressOutput.checked_launches, 1);
    assert.deepEqual(progressOutput.shard, { record_offset: 0, record_limit: 1, launch_timeout_ms: 30000, jobs: 2, retries: 1 });
    assert.match(progressShard.stderr, /launcher-verifier: selected 1\/2 records; planned launches=1; policy=default-only; jobs=2; retries=1/);
    assert.match(progressShard.stderr, /launcher-verifier: \[1\/1\] narada-test\.resident carrier=agent-cli runtime=narada-agent-runtime-server/);
    assert.match(progressShard.stderr, /launcher-verifier: checked launches=1; failures=0/);

    const emptyShard: any = spawnHiddenSync(process.execPath, [
      join(packageRoot, 'bin', 'verify-registered-site-launchers.ts'),
      '--registry',
      registryPath,
      '--start-agent',
      startAgentPath,
      '--runtime-policy',
      'default-only',
      '--record-offset',
      '2',
      '--record-limit',
      '1',
    ], {
      cwd: workspaceRoot,
      encoding: 'utf8',
      env: { ...process.env, NARADA_PROPER_ROOT: naradaProperRoot },
    });
    assert.equal(emptyShard.status, 1, emptyShard.stdout || emptyShard.stderr);
    const emptyShardOutput: any = JSON.parse(emptyShard.stderr);
    assert.equal(emptyShardOutput.reason, 'launcher_verification_shard_matched_no_records');
    assert.equal(emptyShardOutput.filtered_records, 2);
    assert.deepEqual(emptyShardOutput.shard, { record_offset: 2, record_limit: 1, launch_timeout_ms: 30000, jobs: 1, retries: 1 });

    const noMatch: any = spawnHiddenSync(process.execPath, [
      join(packageRoot, 'bin', 'verify-registered-site-launchers.ts'),
      '--registry',
      registryPath,
      '--start-agent',
      startAgentPath,
      '--runtime-policy',
      'default-only',
      '--site',
      'missing-site',
    ], {
      cwd: workspaceRoot,
      encoding: 'utf8',
      env: { ...process.env, NARADA_PROPER_ROOT: naradaProperRoot },
    });
    assert.equal(noMatch.status, 1, noMatch.stdout || noMatch.stderr);
    const noMatchOutput: any = JSON.parse(noMatch.stderr);
    assert.equal(noMatchOutput.reason, 'launcher_verification_filter_matched_no_records');
    assert.deepEqual(noMatchOutput.filters.sites, ['missing-site']);

    mkdirSync(join(siteRoot, 'tools', 'agent-start'), { recursive: true });
    writeFileSync(join(siteRoot, 'tools', 'agent-start', 'start-agent.ts'), 'throw new Error("stale fork");\n', 'utf8');
    const staleFork: any = spawnHiddenSync(process.execPath, [
      join(packageRoot, 'bin', 'verify-registered-site-launchers.ts'),
      '--registry',
      registryPath,
      '--start-agent',
      startAgentPath,
      '--runtime-policy',
      'default-only',
      '--agent',
      'narada-test.resident',
    ], {
      cwd: workspaceRoot,
      encoding: 'utf8',
      env: { ...process.env, NARADA_PROPER_ROOT: naradaProperRoot },
    });
    assert.equal(staleFork.status, 1, staleFork.stdout || staleFork.stderr);
    const staleForkOutput: any = JSON.parse(staleFork.stderr);
    assert.equal(staleForkOutput.reason, 'launcher_verification_failed');
    assert.equal(staleForkOutput.failures[0].reason, 'site_owns_forked_start_agent_implementation');

    const siteLocalMissingSiteRegistryPath: any = join(tempRoot, 'agents-site-local-missing-site.psd1');
    writeFileSync(siteLocalMissingSiteRegistryPath, [
      '@{',
      '  Agents = @(',
      '    @{',
      '      Agent = "resident"',
      '      Title = "Unscoped Resident"',
      `      NaradaRoot = "${naradaRoot.replaceAll('\\', '\\\\')}"`,
      `      WorkspaceRoot = "${workspaceRoot.replaceAll('\\', '\\\\')}"`,
      `      SiteRoot = "${siteRoot.replaceAll('\\', '\\\\')}"`,
      '      Launcher = "narada-test.ps1"',
      '      Carrier = "agent-cli"',
      '      Runtime = "narada-agent-runtime-server"',
      '    }',
      '  )',
      '}',
      '',
    ].join('\n'), 'utf8');

    const siteLocalMissingSite: any = spawnHiddenSync(process.execPath, [
      join(packageRoot, 'bin', 'verify-registered-site-launchers.ts'),
      '--registry',
      siteLocalMissingSiteRegistryPath,
      '--start-agent',
      startAgentPath,
      '--runtime-policy',
      'default-only',
    ], {
      cwd: workspaceRoot,
      encoding: 'utf8',
      env: { ...process.env, NARADA_PROPER_ROOT: naradaProperRoot },
    });
    assert.equal(siteLocalMissingSite.status, 1, siteLocalMissingSite.stdout || siteLocalMissingSite.stderr);
    const siteLocalMissingSiteOutput: any = JSON.parse(siteLocalMissingSite.stderr);
    assert.equal(siteLocalMissingSiteOutput.reason, 'launcher_verification_failed');
    assert.equal(siteLocalMissingSiteOutput.failures.some((failure: any) => failure.reason === 'site_local_agent_missing_site'), true);
    assert.equal(siteLocalMissingSiteOutput.failures.some((failure: any) => failure.reason === 'agent_identity_ref_unscoped'), true);
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});
