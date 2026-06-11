import assert from 'node:assert/strict';
import { execFile as execFileCallback } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { buildSiteContinuitySchedulerPlan, readLastSyncArtifact } from './cloudflare-site-continuity-scheduler.mjs';

const SCRIPT_PATH = fileURLToPath(new URL('./cloudflare-site-continuity-scheduler.mjs', import.meta.url));
const execFile = promisify(execFileCallback);

test('site continuity scheduler install plan is bounded and secret-free', async () => {
  const root = await mkdtemp(join(tmpdir(), 'narada-site-continuity-scheduler-'));
  const syncEntrypoint = join(root, 'packages/cloudflare-carrier/scripts/cloudflare-site-continuity-sync.mjs');
  const scheduledTaskEntrypoint = join(root, 'packages/cloudflare-carrier/scripts/cloudflare-site-continuity-scheduled-task.mjs');
  const packetPath = join(root, '.narada/site-continuity/local-packet.json');
  const outputPath = join(root, '.narada/site-continuity/cloudflare-sync-last.json');
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
    assert.equal(plan.filesystem_mutation_admission, 'local_sync_report_artifact_write_only');
    assert.equal(plan.repository_publication_admission, 'not_admitted');
    assert.equal(plan.status.repo_root_exists, true);
    assert.equal(plan.status.sync_entrypoint_exists, true);
    assert.equal(plan.status.scheduled_task_entrypoint_exists, true);
    assert.equal(plan.status.local_root_exists, true);
    assert.equal(plan.status.packet_path_exists, true);
    assert.equal(plan.status.output_path_parent_exists, true);
    assert.equal(plan.status.command_args_complete, true);
    assert.equal(plan.output_path, outputPath);
    assert.deepEqual(plan.status.required_env_keys_observed, ['CLOUDFLARE_CARRIER_URL', 'CLOUDFLARE_CARRIER_TOKEN_FILE']);
    assert.deepEqual(plan.scheduled_task_command.slice(0, 7), ['schtasks', '/Create', '/TN', 'Narada Cloudflare Site Continuity Sync', '/SC', 'MINUTE', '/MO']);
    assert.equal(plan.scheduled_task_command[7], '5');
    assert.match(plan.task_command, /cloudflare-site-continuity-scheduled-task\.mjs/);
    assert.match(plan.task_command, /--site/);
    assert.match(plan.task_command, /site_fixture/);
    assert.match(plan.task_command, /--packet/);
    assert.match(plan.task_command, /local-packet\.json/);
    assert.match(plan.task_command, /--out/);
    assert.match(plan.task_command, /cloudflare-sync-last\.json/);
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
  assert.equal(body.output_path.endsWith('.narada\\site-continuity\\cloudflare-sync-last.json') || body.output_path.endsWith('.narada/site-continuity/cloudflare-sync-last.json'), true);
  assert.equal(body.embeds_credentials, false);
  assert.equal(body.scheduled_task_command[0], 'schtasks');
  assert.equal(body.scheduled_task_command[1], '/Query');
});

test('site continuity scheduler read-last reports missing local sync artifact', async () => {
  const root = await mkdtemp(join(tmpdir(), 'narada-site-continuity-read-last-missing-'));
  try {
    const outputPath = join(root, '.narada/site-continuity/cloudflare-sync-last.json');
    const plan = buildSiteContinuitySchedulerPlan({
      action: 'read-last',
      repoRoot: root,
      outputPath,
    });

    assert.equal(plan.plan_status, 'last_sync_artifact_read_only_no_cloudflare_access');
    assert.equal(plan.last_sync.state, 'missing');
    assert.equal(plan.last_sync.artifact_present, false);
    assert.equal(plan.last_sync.status, 'never_synced');
    assert.equal(plan.last_sync.artifact_path, outputPath);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('site continuity scheduler read-last summarizes local sync artifact', async () => {
  const root = await mkdtemp(join(tmpdir(), 'narada-site-continuity-read-last-'));
  const outputPath = join(root, '.narada/site-continuity/cloudflare-sync-last.json');
  await mkdir(join(root, '.narada/site-continuity'), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify({
    schema: 'narada.site_continuity_cloudflare_sync_once.v1',
    status: 'ok',
    site_id: 'site_fixture',
    worker_url: 'https://worker.example',
    pushed_packet_id: 'packet-local',
    pulled_packet_id: 'packet-cloudflare',
    continuity_loop_report_recorded: true,
    continuity_loop_report: {
      schema: 'narada.site_continuity_productized_loop.v1',
      site_id: 'site_fixture',
      status: 'ok',
      generated_at: '2026-06-11T09:00:00.000Z',
      cloudflare_push: {
        status: 'imported',
        pushed_packet_id: 'packet-local',
        returned_packet_id: 'packet-cloudflare',
        durability_action: 'refreshed_existing_packet',
        imported_at: '2026-06-11T09:00:00.000Z',
        previous_imported_at: '2026-06-11T08:59:00.000Z',
      },
    },
  }, null, 2)}\n`, 'utf8');
  try {
    const summary = readLastSyncArtifact(outputPath);
    assert.equal(summary.state, 'read');
    assert.equal(summary.artifact_present, true);
    assert.equal(summary.status, 'synced');
    assert.equal(summary.schema, 'narada.site_continuity_cloudflare_sync_once.v1');
    assert.equal(summary.site_id, 'site_fixture');
    assert.equal(summary.worker_url, 'https://worker.example');
    assert.equal(summary.generated_at, '2026-06-11T09:00:00.000Z');
    assert.equal(summary.pushed_packet_id, 'packet-local');
    assert.equal(summary.pulled_packet_id, 'packet-cloudflare');
    assert.equal(summary.cloudflare_push_status, 'imported');
    assert.equal(summary.cloudflare_push_durability_action, 'refreshed_existing_packet');
    assert.equal(summary.cloudflare_push_imported_at, '2026-06-11T09:00:00.000Z');
    assert.equal(summary.cloudflare_push_previous_imported_at, '2026-06-11T08:59:00.000Z');
    assert.equal(summary.continuity_loop_report_recorded, true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
