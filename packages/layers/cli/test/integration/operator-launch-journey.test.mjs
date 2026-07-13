import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';

const __dirname = dirname(fileURLToPath(import.meta.url));
const naradaProperRoot = resolve(__dirname, '..', '..', '..', '..', '..');
const workspaceLauncher = resolve(process.env.NARADA_USER_SITE_ROOT ?? resolve(homedir(), 'Narada'), 'Start-NaradaWorkspace.ps1');

function parseJsonOutput(stdout) {
  const text = String(stdout);
  const start = text.search(/[\[{]/);
  assert.notEqual(start, -1, `no JSON payload found in stdout:\n${text}`);
  return JSON.parse(text.slice(start));
}

test('operator launch journey dry-run maps one agent to agent-cli and agent-web-ui sibling projections', { skip: process.platform !== 'win32' }, () => {
  assert.equal(existsSync(workspaceLauncher), true, `User Site launcher not found: ${workspaceLauncher}`);
  const result = spawnSync('pwsh', [
    '-File', workspaceLauncher,
    '-All',
    '-Runtime', 'nars',
    '-Carrier', 'agent-cli,agent-web-ui',
    '-Site', 'sonar',
    '-Role', 'resident',
    '-DryRun',
  ], {
    cwd: naradaProperRoot,
    encoding: 'utf8',
    timeout: 30_000,
    env: {
      ...process.env,
      NARADA_PROPER_ROOT: naradaProperRoot,
    },
  });

  assert.equal(result.status, 0, `stderr:\n${result.stderr}\nstdout:\n${result.stdout}`);
  assert.doesNotMatch(result.stderr, /narada_cli_dist_stale|source_hash_mismatch/i);
  const plan = parseJsonOutput(result.stdout);

  assert.equal(plan.schema, 'narada.workspace_launch.plan.v1');
  assert.equal(plan.mode, 'dry_run');
  assert.equal(plan.mutation_performed, false);
  assert.equal(plan.windows_terminal_invoked, false);
  assert.equal(plan.launcher_execution_owner, 'narada-cli');
  assert.equal(plan.selected_agents.length, 1);

  const agent = plan.selected_agents[0];
  assert.deepEqual(agent.launch_operator_surfaces, ['agent-cli', 'agent-web-ui']);
  assert.equal(agent.launch_operator_surface, 'agent-cli');
  assert.equal(agent.launch_runtime, 'narada-agent-runtime-server');

  const separatorCount = agent.wt_args.filter((arg) => arg === ';').length;
  assert.equal(separatorCount, 1, JSON.stringify(agent.wt_args, null, 2));
  const commandText = agent.wt_args.join(' ');
  assert.match(commandText, /'operator-surface' 'runtime' 'start' 'agent-cli'/);
  assert.match(commandText, /'--runtime' 'narada-agent-runtime-server'/);
  assert.match(commandText, /'agent-web-ui' 'attach'/);
  assert.match(commandText, /'--agent' 'resident'/);
  assert.match(commandText, /'--wait-for-session-ms' '60000'/);
});

test('operator launch journey dry-run admits agent-web-ui as the primary NARS launch carrier', { skip: process.platform !== 'win32' }, () => {
  assert.equal(existsSync(workspaceLauncher), true, `User Site launcher not found: ${workspaceLauncher}`);
  const result = spawnSync('pwsh', [
    '-File', workspaceLauncher,
    '-All',
    '-Runtime', 'nars',
    '-Carrier', 'agent-web-ui',
    '-Site', 'sonar',
    '-Role', 'resident',
    '-DryRun',
  ], {
    cwd: naradaProperRoot,
    encoding: 'utf8',
    timeout: 30_000,
    env: {
      ...process.env,
      NARADA_PROPER_ROOT: naradaProperRoot,
    },
  });

  assert.equal(result.status, 0, `stderr:\n${result.stderr}\nstdout:\n${result.stdout}`);
  const plan = parseJsonOutput(result.stdout);
  const agent = plan.selected_agents[0];
  assert.deepEqual(agent.launch_operator_surfaces, ['agent-web-ui']);
  assert.equal(agent.launch_operator_surface, 'agent-web-ui');
  assert.equal(agent.launch_runtime, 'narada-agent-runtime-server');
  const commandText = agent.wt_args.join(' ');
  assert.match(commandText, /'operator-surface' 'runtime' 'start' 'agent-web-ui'/);
  assert.match(commandText, /'--runtime' 'narada-agent-runtime-server'/);
  assert.match(commandText, /'agent-web-ui' 'attach'/);
  assert.match(commandText, /'--agent' 'resident'/);
});

test('PowerShell launcher executes the real CLI and composes the NARS/Web UI terminal handoff', { skip: process.platform !== 'win32' }, () => {
  assert.equal(existsSync(workspaceLauncher), true, `User Site launcher not found: ${workspaceLauncher}`);
  const fixtureRoot = mkdtempSync(resolve(tmpdir(), 'narada-launcher-composition-'));
  const siteRoot = resolve(fixtureRoot, 'site');
  const userSiteRoot = resolve(fixtureRoot, 'user-site');
  const registryPath = resolve(fixtureRoot, 'agents.json');
  const terminalLog = resolve(fixtureRoot, 'terminal-handoff.jsonl');
  mkdirSync(siteRoot, { recursive: true });
  mkdirSync(userSiteRoot, { recursive: true });
  writeFileSync(registryPath, JSON.stringify({
    Agents: [{
      Agent: 'launcher-e2e.resident',
      Role: 'resident',
      Site: 'launcher-e2e',
      NaradaRoot: siteRoot,
      SiteRoot: siteRoot,
      WorkspaceRoot: siteRoot,
      LauncherPath: resolve(siteRoot, 'narada-launcher-e2e.ps1'),
      OperatorSurface: 'agent-web-ui',
      Runtime: 'narada-agent-runtime-server',
    }],
  }), 'utf8');

  try {
    const result = spawnSync('pwsh', [
      '-NoProfile',
      '-File', workspaceLauncher,
      '-All',
      '-Runtime', 'nars',
      '-Carrier', 'agent-web-ui',
      '-Site', 'launcher-e2e',
      '-Role', 'resident',
      '-ConfigPath', registryPath,
      '-McpScope', 'none',
      '-NoWaitForEnterBeforeExec',
    ], {
      cwd: naradaProperRoot,
      encoding: 'utf8',
      timeout: 60_000,
      env: {
        ...process.env,
        NARADA_PROPER_ROOT: naradaProperRoot,
        NARADA_USER_SITE_ROOT: userSiteRoot,
        NARADA_NODE_EXECUTABLE: process.execPath,
        NARADA_WORKSPACE_LAUNCH_TERMINAL_LOG: terminalLog,
      },
    });

    assert.equal(result.status, 0, `stderr:\n${result.stderr}\nstdout:\n${result.stdout}`);
    const resultPathMatch = String(result.stdout).match(/Narada workspace launch started\. Result: ([^\r\n]+)/);
    assert.ok(resultPathMatch, `saved launch result path missing:\n${result.stdout}`);
    assert.equal(existsSync(resultPathMatch[1].trim()), true);
    const savedResult = JSON.parse(readFileSync(resultPathMatch[1].trim(), 'utf8'));
    assert.equal(savedResult.mutation_performed, true);
    assert.equal(savedResult.selected_agents?.[0]?.agent, 'launcher-e2e.resident');
    assert.doesNotMatch(result.stderr, /narada_cli_dist_stale|source_hash_mismatch/i);
    assert.equal(existsSync(terminalLog), true, `terminal handoff was not captured:\n${result.stdout}`);
    const terminalInvocations = readFileSync(terminalLog, 'utf8').trim().split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
    assert.equal(terminalInvocations.length, 1);
    const commandText = terminalInvocations[0].join(' ');
    assert.match(commandText, /'operator-surface' 'runtime' 'start' 'agent-web-ui'/);
    assert.match(commandText, /'--runtime' 'narada-agent-runtime-server'/);
    assert.match(commandText, /'--mcp-scope' 'none'/);
    assert.match(commandText, /'agent-web-ui' 'attach'/);
    assert.match(commandText, /'--agent' 'launcher-e2e\.resident'/);
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
});
