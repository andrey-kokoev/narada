import assert from 'node:assert/strict';
import { execFile as execFileCallback } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import {
  buildHiddenVbsWrapperContent,
  buildProviderLivenessSchedulerPlan,
  formatProviderLivenessSchedulerText,
  runProviderLivenessSchedulerAction,
  summarizeProviderLivenessSchedulerReadback,
} from './cloudflare-carrier-provider-liveness-scheduler.mjs';

const SCRIPT_PATH = fileURLToPath(new URL('./cloudflare-carrier-provider-liveness-scheduler.mjs', import.meta.url));
const execFile = promisify(execFileCallback);

test('provider liveness scheduler install plan is bounded and secret-free', async () => {
  const root = await mkdtemp(join(tmpdir(), 'narada-provider-liveness-scheduler-'));
  const entrypoint = join(root, 'packages/cloudflare-carrier/scripts/cloudflare-carrier-provider-liveness-refresh.mjs');
  const scheduledTaskEntrypoint = join(root, 'packages/cloudflare-carrier/scripts/cloudflare-carrier-provider-liveness-scheduled-task.mjs');
  await mkdir(join(root, 'packages/cloudflare-carrier/scripts'), { recursive: true });
  await writeFile(entrypoint, '#!/usr/bin/env node\n', 'utf8');
  await writeFile(scheduledTaskEntrypoint, '#!/usr/bin/env node\n', 'utf8');
  await writeFile(join(root, '.env'), 'CLOUDFLARE_CARRIER_URL=https://worker.example\nCLOUDFLARE_CARRIER_TOKEN_FILE=.secrets/token\n', 'utf8');
  try {
    const plan = buildProviderLivenessSchedulerPlan({ action: 'install', repoRoot: root, intervalMinutes: 2, nodeCommand: 'node' });

    assert.equal(plan.schema, 'narada.cloudflare_carrier.provider_liveness_scheduler_plan.v1');
    assert.equal(plan.plan_status, 'dry_run_install_plan');
    assert.equal(plan.interval_minutes, 2);
    assert.equal(plan.node_command, 'node');
    assert.equal(plan.embeds_credentials, false);
    assert.equal(plan.credential_posture, 'external_env_file_or_process_environment_only');
    assert.equal(plan.cloudflare_mutation, 'provider_liveness_heartbeat_only');
    assert.equal(plan.filesystem_mutation_admission, 'not_admitted');
    assert.equal(plan.repository_publication_admission, 'not_admitted');
    assert.equal(plan.status.repo_root_exists, true);
    assert.equal(plan.status.refresh_entrypoint_exists, true);
    assert.equal(plan.status.scheduled_task_entrypoint_exists, true);
    assert.equal(plan.status.local_root_exists, true);
    assert.deepEqual(plan.status.required_env_keys_observed, ['CLOUDFLARE_CARRIER_URL', 'CLOUDFLARE_CARRIER_TOKEN_FILE']);
    assert.deepEqual(plan.scheduled_task_command.slice(0, 7), ['schtasks', '/Create', '/TN', '\\Narada\\CloudflareProviderLivenessRefresh', '/SC', 'MINUTE', '/MO']);
    assert.equal(plan.scheduled_task_command[7], '2');
    assert.equal(plan.task_command.startsWith('wscript.exe //B '), true);
    assert.match(plan.task_command, /cloudflare-provider-liveness-refresh\.hidden\.vbs/);
    assert.match(plan.direct_task_command, /cloudflare-carrier-provider-liveness-scheduled-task\.mjs/);
    assert.match(plan.direct_task_command, /--local-root/);
    assert.equal(plan.direct_task_command.includes('--refresh-trigger'), false);
    assert.equal(plan.hidden_wrapper_kind, 'windows_wscript_vbs_hidden');
    assert.match(plan.hidden_wrapper_content, /CreateObject\("WScript\.Shell"\)/);
    assert.match(plan.hidden_wrapper_content, /shell\.Run /);
    assert.match(plan.hidden_wrapper_content, /, 0, False/);
    assert.doesNotMatch(JSON.stringify(plan), /secret-token-value/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('provider liveness scheduler install plan resolves default FNM node command for hidden wrapper parity', async () => {
  const root = await mkdtemp(join(tmpdir(), 'narada-provider-liveness-scheduler-fnm-node-'));
  const entrypoint = join(root, 'packages/cloudflare-carrier/scripts/cloudflare-carrier-provider-liveness-refresh.mjs');
  const scheduledTaskEntrypoint = join(root, 'packages/cloudflare-carrier/scripts/cloudflare-carrier-provider-liveness-scheduled-task.mjs');
  const fnmDir = join(root, '.fnm');
  const fnmInstallDir = join(fnmDir, 'node-versions', `v${process.versions.node}`, 'installation');
  const fnmNode = process.platform === 'win32' ? join(fnmInstallDir, 'node.exe') : join(fnmInstallDir, 'bin/node');
  const originalFnmDir = process.env.FNM_DIR;
  const originalNaradaNodeCommand = process.env.NARADA_NODE_COMMAND;
  await mkdir(join(root, 'packages/cloudflare-carrier/scripts'), { recursive: true });
  await mkdir(process.platform === 'win32' ? fnmInstallDir : join(fnmInstallDir, 'bin'), { recursive: true });
  await writeFile(entrypoint, '#!/usr/bin/env node\n', 'utf8');
  await writeFile(scheduledTaskEntrypoint, '#!/usr/bin/env node\n', 'utf8');
  await writeFile(fnmNode, '', 'utf8');
  try {
    process.env.FNM_DIR = fnmDir;
    delete process.env.NARADA_NODE_COMMAND;
    const plan = buildProviderLivenessSchedulerPlan({ action: 'install', repoRoot: root, intervalMinutes: 2 });

    assert.equal(plan.node_command, fnmNode);
    assert.equal(plan.direct_task_command.includes(fnmNode), true);
    assert.equal(plan.hidden_wrapper_content.includes(fnmNode), true);
    assert.doesNotMatch(plan.direct_task_command, /^"?node"?\s/);
    assert.equal(plan.task_command.startsWith('wscript.exe //B '), true);
  } finally {
    if (originalFnmDir === undefined) delete process.env.FNM_DIR;
    else process.env.FNM_DIR = originalFnmDir;
    if (originalNaradaNodeCommand === undefined) delete process.env.NARADA_NODE_COMMAND;
    else process.env.NARADA_NODE_COMMAND = originalNaradaNodeCommand;
    await rm(root, { recursive: true, force: true });
  }
});

test('provider liveness scheduler live install materializes hidden VBS wrapper and executes task plan', async () => {
  const root = await mkdtemp(join(tmpdir(), 'narada-provider-liveness-scheduler-live-'));
  const entrypoint = join(root, 'packages/cloudflare-carrier/scripts/cloudflare-carrier-provider-liveness-refresh.mjs');
  const scheduledTaskEntrypoint = join(root, 'packages/cloudflare-carrier/scripts/cloudflare-carrier-provider-liveness-scheduled-task.mjs');
  await mkdir(join(root, 'packages/cloudflare-carrier/scripts'), { recursive: true });
  await writeFile(entrypoint, '#!/usr/bin/env node\n', 'utf8');
  await writeFile(scheduledTaskEntrypoint, '#!/usr/bin/env node\n', 'utf8');
  try {
    const plan = await runProviderLivenessSchedulerAction({ action: 'install', repoRoot: root, dryRun: false }, {
      execFileImpl: async (command, args, options) => {
        assert.equal(command, 'schtasks');
        assert.deepEqual(args.slice(0, 6), ['/Create', '/TN', '\\Narada\\CloudflareProviderLivenessRefresh', '/SC', 'MINUTE', '/MO']);
        assert.equal(args[6], '2');
        assert.equal(args[7], '/TR');
        assert.equal(args[8].startsWith('wscript.exe //B '), true);
        assert.equal(args[9], '/F');
        assert.equal(options.cwd, root);
        assert.equal(options.windowsHide, true);
        return { stdout: 'SUCCESS: The scheduled task was created.\n', stderr: '' };
      },
    });

    assert.equal(plan.plan_status, 'live_install_completed');
    assert.equal(plan.host_scheduler_mutation_admission, 'bounded_schtasks_command_from_scheduler_plan');
    assert.equal(plan.scheduler_task_execution.status, 'ok');
    assert.equal(plan.scheduler_task_execution.command, 'schtasks');
    assert.equal(plan.scheduler_task_execution.args[0], '/Create');
    assert.equal(plan.filesystem_mutation_admission, 'hidden_wrapper_file_write_admitted');
    assert.equal(plan.task_command.startsWith('wscript.exe //B '), true);
    const wrapperContent = await import('node:fs/promises').then(({ readFile }) => readFile(plan.hidden_wrapper_path, 'utf8'));
    assert.equal(wrapperContent, plan.hidden_wrapper_content);
    assert.equal(wrapperContent, buildHiddenVbsWrapperContent(plan.direct_task_command));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('provider liveness scheduler CLI emits status without Cloudflare access', async () => {
  const result = await execFile(process.execPath, [SCRIPT_PATH, '--action', 'status'], { timeout: 30000, windowsHide: true });
  const body = JSON.parse(result.stdout);

  assert.equal(body.schema, 'narada.cloudflare_carrier.provider_liveness_scheduler_plan.v1');
  assert.equal(body.action, 'status');
  assert.equal(body.plan_status, 'status_only_no_cloudflare_access');
  assert.equal(body.status.task_scheduler_query_required, true);
  assert.equal(body.embeds_credentials, false);
  assert.equal(body.scheduled_task_command[0], 'schtasks');
  assert.equal(body.scheduled_task_command[1], '/Query');
  assert.deepEqual(body.scheduled_task_command.slice(-3), ['/V', '/FO', 'LIST']);
  assert.equal(body.task_command.startsWith('wscript.exe //B '), true);
});

test('provider liveness scheduler live status reads hidden wrapper task posture', async () => {
  const root = await mkdtemp(join(tmpdir(), 'narada-provider-liveness-readback-'));
  const entrypoint = join(root, 'packages/cloudflare-carrier/scripts/cloudflare-carrier-provider-liveness-refresh.mjs');
  const scheduledTaskEntrypoint = join(root, 'packages/cloudflare-carrier/scripts/cloudflare-carrier-provider-liveness-scheduled-task.mjs');
  const wrapperPath = join(root, '.narada/site-continuity/cloudflare-provider-liveness-refresh.hidden.vbs');
  await mkdir(join(root, 'packages/cloudflare-carrier/scripts'), { recursive: true });
  await writeFile(entrypoint, '#!/usr/bin/env node\n', 'utf8');
  await writeFile(scheduledTaskEntrypoint, '#!/usr/bin/env node\n', 'utf8');
  await mkdir(join(root, '.narada/site-continuity'), { recursive: true });
  const statusPlan = buildProviderLivenessSchedulerPlan({ action: 'status', repoRoot: root });
  await writeFile(wrapperPath, statusPlan.hidden_wrapper_content, 'utf8');
  try {
    const result = await runProviderLivenessSchedulerAction({ action: 'status', repoRoot: root, dryRun: false }, {
      execFileImpl: async (command, args, options) => {
        assert.equal(command, 'schtasks');
        assert.deepEqual(args, ['/Query', '/TN', '\\Narada\\CloudflareProviderLivenessRefresh', '/V', '/FO', 'LIST']);
        assert.equal(options.windowsHide, true);
        return {
          stdout: [
            'TaskName: \\Narada\\CloudflareProviderLivenessRefresh',
            'Next Run Time: 6/11/2026 11:39:00 AM',
            'Status: Ready',
            'Last Run Time: 6/11/2026 11:37:01 AM',
            'Last Result: 0',
            `Task To Run: wscript.exe //B "${wrapperPath}"`,
            'Scheduled Task State: Enabled',
            'Repeat: Every: 0 Hour(s), 2 Minute(s)',
            '',
          ].join('\n'),
          stderr: '',
        };
      },
    });

    assert.equal(result.host_scheduler_read_admission, 'bounded_schtasks_query_from_scheduler_plan');
    assert.equal(result.scheduler_task_readback.status, 'ok');
    assert.equal(result.scheduler_task_readback.cadence_status, 'matches_plan');
    assert.equal(result.scheduler_task_readback.task_command_status, 'matches_plan');
    assert.equal(result.scheduler_task_readback.hidden_wrapper_readback.status, 'matches_plan');
    assert.deepEqual(result.scheduler_task_readback.attention_reasons, []);
    assert.equal(result.scheduler_task_readback.task_to_run, `wscript.exe //B "${wrapperPath}"`);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('provider liveness scheduler readback surfaces drift', () => {
  const readback = summarizeProviderLivenessSchedulerReadback({
    state: 'completed',
    command: 'schtasks',
    args: ['/Query'],
    stdout: '',
    stderr: '',
    timeout_ms: 30000,
    parsed: {
      Status: 'Ready',
      'Last Result': '1',
      'Scheduled Task State': 'Enabled',
      'Task To Run': 'node old-entrypoint.mjs',
      'Repeat: Every': '0 Hour(s), 10 Minute(s)',
    },
    expectedIntervalMinutes: 2,
    expectedTaskCommand: 'wscript.exe //B hidden.vbs',
    hiddenWrapperReadback: { status: 'differs_from_plan', path: 'hidden.vbs', embeds_credentials: false },
  });

  assert.equal(readback.status, 'needs_attention');
  assert.equal(readback.cadence_status, 'differs_from_plan');
  assert.equal(readback.task_command_status, 'differs_from_plan');
  assert.deepEqual(readback.attention_reasons, [
    'scheduler_cadence_differs_from_plan',
    'scheduler_task_command_differs_from_plan',
    'hidden_wrapper_differs_from_plan',
    'scheduler_last_result_nonzero',
  ]);
});

test('provider liveness scheduler text output summarizes operator posture', () => {
  const text = formatProviderLivenessSchedulerText({
    task_name: '\\Narada\\CloudflareProviderLivenessRefresh',
    plan_status: 'status_only_no_cloudflare_access',
    scheduler_task_readback: {
      status: 'ok',
      scheduled_task_state: 'Enabled',
      status_text: 'Ready',
      last_result: '0',
      next_run_time: '6/11/2026 11:43:00 AM',
      expected_interval_minutes: 2,
      actual_interval_minutes: 2,
      cadence_status: 'matches_plan',
      task_command_status: 'matches_plan',
      hidden_wrapper_readback: { status: 'matches_plan', path: 'hidden.vbs', embeds_credentials: false },
      task_to_run: 'wscript.exe //B hidden.vbs',
      attention_reasons: [],
    },
  });

  assert.match(text, /Provider Liveness: ok/);
  assert.match(text, /Scheduler: state=Enabled status=Ready last=0/);
  assert.match(text, /Cadence: expected=2m actual=2m matches_plan/);
  assert.match(text, /Command: matches_plan/);
  assert.match(text, /Hidden Wrapper: matches_plan/);
});

test('provider liveness scheduler CLI emits operator text status', async () => {
  const result = await execFile(process.execPath, [SCRIPT_PATH, '--action', 'status', '--format', 'text'], { timeout: 30000, windowsHide: true });

  assert.match(result.stdout, /Provider Liveness:/);
  assert.match(result.stdout, /Task: \\Narada\\CloudflareProviderLivenessRefresh/);
  assert.match(result.stdout, /Task Scheduler: live readback required/);
});
