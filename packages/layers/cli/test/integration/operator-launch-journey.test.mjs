import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const naradaProperRoot = resolve(__dirname, '..', '..', '..', '..', '..');
const workspaceLauncher = 'C:\\Users\\Andrey\\Narada\\Start-NaradaWorkspace.ps1';

function parseJsonOutput(stdout) {
  const text = String(stdout);
  const start = text.search(/[\[{]/);
  assert.notEqual(start, -1, `no JSON payload found in stdout:\n${text}`);
  return JSON.parse(text.slice(start));
}

test('operator launch journey dry-run maps one agent to agent-cli and agent-web-ui sibling projections', { skip: !existsSync(workspaceLauncher) }, () => {
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
  assert.deepEqual(agent.launch_carriers, ['agent-cli', 'agent-web-ui']);
  assert.equal(agent.launch_carrier, 'agent-cli');
  assert.equal(agent.launch_runtime, 'narada-agent-runtime-server');

  const separatorCount = agent.wt_args.filter((arg) => arg === ';').length;
  assert.equal(separatorCount, 1, JSON.stringify(agent.wt_args, null, 2));
  const commandText = agent.wt_args.join(' ');
  assert.match(commandText, /'carrier' 'start' 'agent-cli'/);
  assert.match(commandText, /'--runtime' 'narada-agent-runtime-server'/);
  assert.match(commandText, /'agent-web-ui' 'attach'/);
  assert.match(commandText, /'--agent' 'resident'/);
  assert.match(commandText, /'--wait-for-session-ms' '60000'/);
});

test('operator launch journey dry-run admits agent-web-ui as the primary NARS launch carrier', { skip: !existsSync(workspaceLauncher) }, () => {
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
  assert.deepEqual(agent.launch_carriers, ['agent-web-ui']);
  assert.equal(agent.launch_carrier, 'agent-web-ui');
  assert.equal(agent.launch_runtime, 'narada-agent-runtime-server');
  const commandText = agent.wt_args.join(' ');
  assert.match(commandText, /'carrier' 'start' 'agent-web-ui'/);
  assert.match(commandText, /'--runtime' 'narada-agent-runtime-server'/);
  assert.match(commandText, /'agent-web-ui' 'attach'/);
  assert.match(commandText, /'--agent' 'resident'/);
});
