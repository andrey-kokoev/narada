import assert from 'node:assert/strict';
import { execFile as execFileCallback } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { buildSiteContinuitySchedulerPlan } from './cloudflare-site-continuity-scheduler.mjs';

const SCRIPT_PATH = fileURLToPath(new URL('./cloudflare-site-continuity-scheduler.mjs', import.meta.url));
const execFile = promisify(execFileCallback);

test('site continuity scheduler install plan is bounded and secret-free', async () => {
  const root = await mkdtemp(join(tmpdir(), 'narada-site-continuity-scheduler-'));
  const syncEntrypoint = join(root, 'packages/cloudflare-carrier/scripts/cloudflare-site-continuity-sync.mjs');
  const scheduledTaskEntrypoint = join(root, 'packages/cloudflare-carrier/scripts/cloudflare-site-continuity-scheduled-task.mjs');
  const packetPath = join(root, '.narada/site-continuity/local-packet.json');
  await mkdir(join(root, 'packages/cloudflare-carrier/scripts'), { recursive: true });
  await mkdir(join(root, '.narada/site-continuity'), { recursive: true });
  await writeFile(syncEntrypoint, '#!/usr/bin/env node\n', 'utf8');
  await writeFile(scheduledTaskEntrypoint, '#!/usr/bin/env node\n', 'utf8');
  await writeFile(packetPath, '{"packet":{"site_id":"site_fixture"}}\n', 'utf8');
  await writeFile(join(root, '.env'), 'CLOUDFLARE_CARRIER_URL=https://worker.example\nCLOUDFLARE_CARRIER_TOKEN_FILE=.secrets/token\n', 'utf8');
  try {
    const plan = buildSiteContinuitySchedulerPlan({
      action: 'install',
      repoRoot: root,
      intervalMinutes: 5,
      siteId: 'site_fixture',
      packetPath: '.narada/site-continuity/local-packet.json',
    });

    assert.equal(plan.schema, 'narada.cloudflare_carrier.site_continuity_scheduler_plan.v1');
    assert.equal(plan.plan_status, 'dry_run_install_plan');
    assert.equal(plan.interval_minutes, 5);
    assert.equal(plan.node_command, 'node');
    assert.equal(plan.embeds_credentials, false);
    assert.equal(plan.credential_posture, 'external_env_file_or_process_environment_only');
    assert.equal(plan.cloudflare_mutation, 'site_continuity_packet_and_loop_report_only');
    assert.equal(plan.filesystem_mutation_admission, 'not_admitted');
    assert.equal(plan.repository_publication_admission, 'not_admitted');
    assert.equal(plan.status.repo_root_exists, true);
    assert.equal(plan.status.sync_entrypoint_exists, true);
    assert.equal(plan.status.scheduled_task_entrypoint_exists, true);
    assert.equal(plan.status.local_root_exists, true);
    assert.equal(plan.status.packet_path_exists, true);
    assert.equal(plan.status.command_args_complete, true);
    assert.deepEqual(plan.status.required_env_keys_observed, ['CLOUDFLARE_CARRIER_URL', 'CLOUDFLARE_CARRIER_TOKEN_FILE']);
    assert.deepEqual(plan.scheduled_task_command.slice(0, 7), ['schtasks', '/Create', '/TN', 'Narada Cloudflare Site Continuity Sync', '/SC', 'MINUTE', '/MO']);
    assert.equal(plan.scheduled_task_command[7], '5');
    assert.match(plan.task_command, /cloudflare-site-continuity-scheduled-task\.mjs/);
    assert.match(plan.task_command, /--site/);
    assert.match(plan.task_command, /site_fixture/);
    assert.match(plan.task_command, /--packet/);
    assert.match(plan.task_command, /local-packet\.json/);
    assert.doesNotMatch(JSON.stringify(plan), /secret-token-value/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('site continuity scheduler CLI emits status without Cloudflare access', async () => {
  const result = await execFile(process.execPath, [SCRIPT_PATH, '--action', 'status'], { timeout: 30000, windowsHide: true });
  const body = JSON.parse(result.stdout);

  assert.equal(body.schema, 'narada.cloudflare_carrier.site_continuity_scheduler_plan.v1');
  assert.equal(body.action, 'status');
  assert.equal(body.plan_status, 'status_only_no_cloudflare_access');
  assert.equal(body.status.task_scheduler_query_required, true);
  assert.equal(body.embeds_credentials, false);
  assert.equal(body.scheduled_task_command[0], 'schtasks');
  assert.equal(body.scheduled_task_command[1], '/Query');
});
