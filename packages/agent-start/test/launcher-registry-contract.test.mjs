import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { runHiddenPostureCommandSync } from '@narada2/process-launch-posture';

const require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(__dirname, '..');
const naradaProperRoot = resolve(packageRoot, '..', '..');
const fixtureRegistryPath = join(__dirname, 'fixtures', 'launch-registry.psd1');
const packagedLauncherPath = join(naradaProperRoot, 'packages', 'agent-start', 'src', 'narada-agent-start.ts');
const tsxLoaderPath = pathToFileURL(require.resolve('tsx')).href;
const admittedCarrierMatrix = Object.freeze(['agent-cli', 'agent-tui', 'codex', 'opencode']);
const requiredFields = Object.freeze(['Agent', 'NaradaRoot', 'WorkspaceRoot', 'SiteRoot', 'Launcher', 'Carrier', 'Runtime']);
const pwshAvailable = spawnHiddenSync('pwsh', ['-NoProfile', '-Command', '$PSVersionTable.PSVersion.Major'], { encoding: 'utf8' }).status === 0;
const nonNaradaProperSites = Object.freeze([
  'narada-andrey',
  'narada-staccato',
  'narada-revolution',
  'narada-timour-marketing-agent',
  'narada-utz',
  'sonar',
  'smart-scheduling',
  'thoughts-project',
]);

function spawnHiddenSync(command, args, options = {}) {
  return runHiddenPostureCommandSync(command, args, { ...options, posture: 'test_child' });
}

function parseRegistry(text) {
  const records = [];
  let current = null;
  for (const rawLine of text.replace(/^\uFEFF/, '').split(/\r?\n/)) {
    const line = rawLine.trim();
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
    const value = line.match(/^(Agent|Title|Site|NaradaRoot|WorkspaceRoot|SiteRoot|Launcher|LauncherPath|Carrier|Runtime)\s*=\s*['\"]([^'\"]+)['\"]/);
    if (value) current[value[1]] = value[2];
  }
  return records.filter((record) => record.Agent);
}

function recordsFrom(path) {
  return parseRegistry(readFileSync(path, 'utf8'));
}

function siteId(record) {
  return record.Site ?? record.Agent.replace(/\.(architect|builder2?|resident|Kevin|Bob|Robin)$/u, '');
}

function normalizePath(value) {
  return resolve(String(value)).replace(/[\\/]+$/, '').toLowerCase();
}

function launcherPathFor(record) {
  return record.LauncherPath ?? join(record.NaradaRoot, record.Launcher);
}

function assertRegistryContract(records, sourceLabel) {
  assert.equal(records.length > 0, true, `${sourceLabel}: registry must contain records`);
  const agents = new Set();
  const sites = new Set();
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

function assertLauncherFileShape(records, sourceLabel) {
  for (const record of records) {
    const launcherPath = launcherPathFor(record);
    assert.equal(existsSync(launcherPath), true, `${sourceLabel}:${record.Agent}: launcher missing ${launcherPath}`);
    const text = readFileSync(launcherPath, 'utf8');
    assert.equal(text.includes('packages\\agent-start\\src\\narada-agent-start.ts'), true, `${sourceLabel}:${record.Agent}: launcher must delegate to packaged TS agent-start`);
    assert.equal(text.includes('packages\\agent-start\\bin\\narada-agent-start.mjs'), false, `${sourceLabel}:${record.Agent}: launcher must not delegate to removed mjs bin`);
    assert.equal(text.includes('tools\\agent-start\\start-agent.mjs'), false, `${sourceLabel}:${record.Agent}: launcher must not delegate to site-local start-agent`);
    assert.equal(text.includes('--import $tsxLoader'), true, `${sourceLabel}:${record.Agent}: launcher must use explicit TSX loader variable`);
  }
}

function dryRunEnv(carrier) {
  if (carrier === 'codex') return { NARADA_CODEX_CLI_SCRIPT: packagedLauncherPath };
  if (carrier === 'agent-cli') return {
    NARADA_PROVIDER_SECRET_STORE: 'disabled',
    NARADA_CODEX_SUBSCRIPTION_PREFLIGHT: 'defer',
    KIMI_CODE_API_KEY: 'test-key',
  };
  if (carrier === 'agent-tui') return {
    NARADA_PROVIDER_SECRET_STORE: 'disabled',
    NARADA_CODEX_SUBSCRIPTION_PREFLIGHT: 'defer',
    NARADA_INTELLIGENCE_PROVIDER: 'kimi-code-api',
    KIMI_CODE_API_BASE_URL: 'https://api.kimi.com/coding/',
    KIMI_CODE_MODEL: 'kimi-k2.7',
    KIMI_CODE_API_KEY: 'test-key',
  };
  return {};
}

function assertCarrierMatrixDryRuns(records, sourceLabel) {
  for (const record of records) {
    for (const carrier of admittedCarrierMatrix) {
      const runtime = carrier === 'agent-cli' ? 'narada-agent-runtime-server' : carrier;
      const result = spawnHiddenSync(process.execPath, [
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
    }
  }
}

test('package fixture encodes the launcher registry boundary', () => {
  const records = recordsFrom(fixtureRegistryPath);
  assertRegistryContract(records, 'fixture');
  assertLauncherFileShape(records, 'fixture');
  const deterministicCarrierRecords = records.filter((record) => normalizePath(record.NaradaRoot) === normalizePath(naradaProperRoot));
  assertCarrierMatrixDryRuns(deterministicCarrierRecords, 'fixture');
  assert.equal(existsSync(packagedLauncherPath), true, 'packaged TS launcher must exist in Narada proper');
});

test('live operator registry conforms when explicitly supplied', { skip: !process.env.NARADA_AGENT_START_LIVE_REGISTRY }, () => {
  const records = recordsFrom(process.env.NARADA_AGENT_START_LIVE_REGISTRY);
  assertRegistryContract(records, 'live');
  assertLauncherFileShape(records, 'live');
});

test('registered launcher verifier documents sharding filters', () => {
  const result = spawnHiddenSync(process.execPath, [join(packageRoot, 'bin', 'verify-registered-site-launchers.mjs'), '--help'], {
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
  const tempRoot = mkdtempSync(join(tmpdir(), 'narada-launcher-verifier-'));
  try {
    const naradaRoot = join(tempRoot, 'site');
    const workspaceRoot = naradaRoot;
    const siteRoot = join(naradaRoot, '.narada');
    mkdirSync(siteRoot, { recursive: true });

    const launcherPath = join(naradaRoot, 'narada-test.ps1');
    writeFileSync(launcherPath, [
      '$tsxLoader = "tsx"',
      'node --import $tsxLoader packages\\agent-start\\src\\narada-agent-start.ts',
      '',
    ].join('\n'), 'utf8');

    const registryPath = join(tempRoot, 'agents.psd1');
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

    const startAgentPath = join(tempRoot, 'Start-NaradaAgent.ps1');
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

    const result = spawnHiddenSync(process.execPath, [
      join(packageRoot, 'bin', 'verify-registered-site-launchers.mjs'),
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
    const output = JSON.parse(result.stdout);
    assert.equal(output.status, 'ok');
    assert.equal(output.registered_records, 2);
    assert.equal(output.filtered_records, 1);
    assert.equal(output.selected_records, 1);
    assert.equal(output.checked_launches, 1);
    assert.equal(output.runtime_policy, 'default-only');
    assert.deepEqual(output.filters.agents, ['narada-test.resident']);
    assert.deepEqual(output.shard, { record_offset: 0, record_limit: null, launch_timeout_ms: 30000, jobs: 1, retries: 1 });

    const shard = spawnHiddenSync(process.execPath, [
      join(packageRoot, 'bin', 'verify-registered-site-launchers.mjs'),
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
    const shardOutput = JSON.parse(shard.stdout);
    assert.equal(shardOutput.status, 'ok');
    assert.equal(shardOutput.registered_records, 2);
    assert.equal(shardOutput.filtered_records, 2);
    assert.equal(shardOutput.selected_records, 1);
    assert.equal(shardOutput.checked_launches, 1);
    assert.deepEqual(shardOutput.shard, { record_offset: 1, record_limit: 1, launch_timeout_ms: 30000, jobs: 1, retries: 1 });

    const progressShard = spawnHiddenSync(process.execPath, [
      join(packageRoot, 'bin', 'verify-registered-site-launchers.mjs'),
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
    const progressOutput = JSON.parse(progressShard.stdout);
    assert.equal(progressOutput.status, 'ok');
    assert.equal(progressOutput.checked_launches, 1);
    assert.deepEqual(progressOutput.shard, { record_offset: 0, record_limit: 1, launch_timeout_ms: 30000, jobs: 2, retries: 1 });
    assert.match(progressShard.stderr, /launcher-verifier: selected 1\/2 records; planned launches=1; policy=default-only; jobs=2; retries=1/);
    assert.match(progressShard.stderr, /launcher-verifier: \[1\/1\] narada-test\.resident carrier=agent-cli runtime=narada-agent-runtime-server/);
    assert.match(progressShard.stderr, /launcher-verifier: checked launches=1; failures=0/);

    const emptyShard = spawnHiddenSync(process.execPath, [
      join(packageRoot, 'bin', 'verify-registered-site-launchers.mjs'),
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
    const emptyShardOutput = JSON.parse(emptyShard.stderr);
    assert.equal(emptyShardOutput.reason, 'launcher_verification_shard_matched_no_records');
    assert.equal(emptyShardOutput.filtered_records, 2);
    assert.deepEqual(emptyShardOutput.shard, { record_offset: 2, record_limit: 1, launch_timeout_ms: 30000, jobs: 1, retries: 1 });

    const noMatch = spawnHiddenSync(process.execPath, [
      join(packageRoot, 'bin', 'verify-registered-site-launchers.mjs'),
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
    const noMatchOutput = JSON.parse(noMatch.stderr);
    assert.equal(noMatchOutput.reason, 'launcher_verification_filter_matched_no_records');
    assert.deepEqual(noMatchOutput.filters.sites, ['missing-site']);

    mkdirSync(join(siteRoot, 'tools', 'agent-start'), { recursive: true });
    writeFileSync(join(siteRoot, 'tools', 'agent-start', 'start-agent.mjs'), 'throw new Error("stale fork");\n', 'utf8');
    const staleFork = spawnHiddenSync(process.execPath, [
      join(packageRoot, 'bin', 'verify-registered-site-launchers.mjs'),
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
    const staleForkOutput = JSON.parse(staleFork.stderr);
    assert.equal(staleForkOutput.reason, 'launcher_verification_failed');
    assert.equal(staleForkOutput.failures[0].reason, 'site_owns_forked_start_agent_implementation');

    const siteLocalMissingSiteRegistryPath = join(tempRoot, 'agents-site-local-missing-site.psd1');
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

    const siteLocalMissingSite = spawnHiddenSync(process.execPath, [
      join(packageRoot, 'bin', 'verify-registered-site-launchers.mjs'),
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
    const siteLocalMissingSiteOutput = JSON.parse(siteLocalMissingSite.stderr);
    assert.equal(siteLocalMissingSiteOutput.reason, 'launcher_verification_failed');
    assert.equal(siteLocalMissingSiteOutput.failures.some((failure) => failure.reason === 'site_local_agent_missing_site'), true);
    assert.equal(siteLocalMissingSiteOutput.failures.some((failure) => failure.reason === 'agent_identity_ref_unscoped'), true);
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});
