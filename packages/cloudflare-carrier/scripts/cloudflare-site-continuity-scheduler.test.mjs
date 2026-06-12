import assert from 'node:assert/strict';
import { execFile as execFileCallback } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { createSiteContinuityBinding, createSiteContinuityBindingRegistry } from '@narada2/site-continuity';
import {
  buildHiddenVbsWrapperContent,
  buildSiteContinuityReconciliationPlan,
  buildSiteContinuitySchedulerPlan,
  buildSiteContinuitySchedulerPlanWithOptionalRefresh,
  formatSiteContinuitySchedulerResultForText,
  readCloudflareOperationPostureForHealthSnapshot,
  readCloudflareProductPostureForHealthSnapshot,
  readLastReconciliationExecutionArtifact,
  readLastScheduledHealthSnapshot,
  readLastSyncArtifact,
  readLocalConfiguredSites,
  readLocalInboundPacketArtifact,
  readLocalInboundPacketInventory,
  readLocalSyncArtifactInventory,
  resolveSiteContinuitySchedulerProductReadAuth,
  runSiteContinuitySchedulerActionWithOptionalRefresh,
  summarizeCloudflareProductBindingAlignment,
  summarizeCloudflareProductBindingPreparation,
  summarizeScheduledHealthOperatorNextAction,
  summarizeScheduledHealthSnapshotStatus,
} from './cloudflare-site-continuity-scheduler.mjs';

const SCRIPT_PATH = fileURLToPath(new URL('./cloudflare-site-continuity-scheduler.mjs', import.meta.url));
const execFile = promisify(execFileCallback);

async function writeInboundPacketArtifact(artifactDirectory, siteId, {
  packetId = `packet-${siteId}-cloudflare`,
  generatedAt = '2026-06-11T13:45:00.000Z',
} = {}) {
  const inboundDirectory = join(artifactDirectory, 'inbound');
  await mkdir(inboundDirectory, { recursive: true });
  const artifactPath = join(inboundDirectory, `${siteId}-cloudflare-inbound.json`);
  await writeFile(artifactPath, `${JSON.stringify({
    schema: 'narada.site_continuity_cloudflare_to_local_windows_inbound_packet.v1',
    status: 'ok',
    site_id: siteId,
    generated_at: generatedAt,
    source: 'cloudflare.site.read.exchange_packet',
    target: 'local_windows_site_continuity_inbox',
    filesystem_mutation_admission: 'local_inbound_packet_artifact_write_only',
    cloudflare_to_local_windows_admission_action: 'projection_only',
    cloudflare_to_local_windows_admission_reason: 'site_continuity_exchange_packet_projection_admitted',
    packet_id: packetId,
    packet_source_embodiment_kind: 'cloudflare_carrier',
    packet_target_embodiment_kind: 'local_windows',
    packet: {
      schema: 'narada.site_continuity_exchange_packet.v1',
      site_id: siteId,
      packet_id: packetId,
      source_embodiment_kind: 'cloudflare_carrier',
      target_embodiment_kind: 'local_windows',
    },
  }, null, 2)}\n`, 'utf8');
  await utimes(artifactPath, new Date(generatedAt), new Date(generatedAt));
  return artifactPath;
}

async function writePlannedSiteContinuityHiddenWrapper(options) {
  const plan = buildSiteContinuitySchedulerPlan({ action: 'status', ...options });
  await mkdir(dirname(plan.hidden_wrapper_path), { recursive: true });
  await writeFile(plan.hidden_wrapper_path, plan.hidden_wrapper_content, 'utf8');
  return plan;
}

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
      nodeCommand: 'node',
    });

    assert.equal(plan.schema, 'narada.cloudflare_carrier.site_continuity_scheduler_plan.v1');
    assert.equal(plan.plan_status, 'dry_run_install_plan');
    assert.equal(plan.interval_minutes, 5);
    assert.equal(plan.node_command, 'node');
    assert.equal(plan.embeds_credentials, false);
    assert.equal(plan.credential_posture, 'external_env_file_or_process_environment_only');
    assert.equal(plan.cloudflare_mutation, 'site_continuity_packet_loop_report_and_reconciliation_execution_evidence_only');
    assert.equal(plan.filesystem_mutation_admission, 'local_sync_report_artifact_write_only');
    assert.equal(plan.repository_publication_admission, 'not_admitted');
    assert.equal(plan.hidden_wrapper_path, join(root, '.narada/site-continuity/cloudflare-site-continuity-sync.hidden.vbs'));
    assert.equal(plan.hidden_wrapper_kind, 'windows_wscript_vbs_hidden');
    assert.match(plan.hidden_wrapper_content, /WScript\.Shell/);
    assert.equal(plan.status.repo_root_exists, true);
    assert.equal(plan.status.sync_entrypoint_exists, true);
    assert.equal(plan.status.scheduled_task_entrypoint_exists, true);
    assert.equal(plan.status.local_root_exists, true);
    assert.equal(plan.status.packet_path_exists, true);
    assert.equal(plan.status.output_path_parent_exists, true);
    assert.equal(plan.status.command_args_complete, true);
    assert.equal(plan.output_path, outputPath);
    assert.deepEqual(plan.status.required_env_keys_observed, ['CLOUDFLARE_CARRIER_URL', 'CLOUDFLARE_CARRIER_TOKEN_FILE']);
    assert.deepEqual(plan.scheduled_task_command.slice(0, 7), ['schtasks', '/Create', '/TN', '\\Narada\\CloudflareSiteContinuitySync', '/SC', 'MINUTE', '/MO']);
    assert.equal(plan.scheduled_task_command[7], '5');
    assert.equal(plan.scheduled_task_command[8], '/TR');
    assert.match(plan.task_command, /^wscript\.exe \/\/B /);
    assert.match(plan.task_command, /cloudflare-site-continuity-sync\.hidden\.vbs/);
    assert.match(plan.direct_task_command, /cloudflare-site-continuity-scheduled-task\.mjs/);
    assert.doesNotMatch(plan.direct_task_command, /--site|--sites|--packet|--out|site_fixture|local-packet\.json|cloudflare-sync-last\.json/);
    assert.doesNotMatch(JSON.stringify(plan), /secret-token-value/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('site continuity product posture snapshot reports missing config without live access', async () => {
  const posture = await readCloudflareProductPostureForHealthSnapshot({
    env: {},
    now: () => '2026-06-11T13:47:00.000Z',
    productReadSurface: async () => { throw new Error('unexpected_live_product_read'); },
  });

  assert.equal(posture.schema, 'narada.cloudflare_carrier.product_posture_snapshot.v1');
  assert.equal(posture.state, 'not_configured');
  assert.equal(posture.status, 'not_available');
  assert.deepEqual(posture.missing, ['CLOUDFLARE_CARRIER_URL']);
  assert.equal(posture.embeds_credentials, false);
});

test('site continuity product posture snapshot records non-secret auth posture when loaded', async () => {
  const posture = await readCloudflareProductPostureForHealthSnapshot({
    env: {
      CLOUDFLARE_CARRIER_URL: 'https://worker.example',
      CLOUDFLARE_OPERATOR_SESSION_COOKIE: 'narada_operator_session=session-fixture',
    },
    now: () => '2026-06-11T13:47:30.000Z',
    productReadSurface: async () => ({
      summary: { next_site_id: 'site_alpha', next_action: 'monitor_sites' },
      response: {
        site_product_overview: { site_count: 1 },
        site_posture_route: { domain: 'site' },
      },
    }),
  });

  assert.equal(posture.state, 'loaded');
  assert.equal(posture.status, 'ok');
  assert.equal(posture.auth_kind, 'operator_session');
  assert.equal(posture.auth_source, 'env:CLOUDFLARE_OPERATOR_SESSION_COOKIE');
  assert.equal(posture.embeds_credentials, false);
});

test('site continuity operation posture snapshot reports unselected site without live access', async () => {
  const posture = await readCloudflareOperationPostureForHealthSnapshot({
    env: { CLOUDFLARE_CARRIER_URL: 'https://worker.example' },
    now: () => '2026-06-11T13:48:00.000Z',
    siteId: null,
    productReadSurface: async () => { throw new Error('unexpected_live_operation_read'); },
  });

  assert.equal(posture.schema, 'narada.cloudflare_carrier.operation_posture_snapshot.v1');
  assert.equal(posture.state, 'not_selected');
  assert.equal(posture.status, 'not_available');
  assert.equal(posture.operation, 'operation.list');
  assert.equal(posture.reason, 'cloudflare_product_next_site_id_not_available');
  assert.equal(posture.embeds_credentials, false);
});

test('site continuity operation posture snapshot records non-secret auth posture when loaded', async () => {
  const posture = await readCloudflareOperationPostureForHealthSnapshot({
    env: {
      CLOUDFLARE_CARRIER_URL: 'https://worker.example',
      CLOUDFLARE_OPERATOR_SESSION_COOKIE: 'narada_operator_session=session-fixture',
    },
    now: () => '2026-06-11T13:48:30.000Z',
    siteId: 'site_alpha',
    productReadSurface: async () => ({
      summary: { next_operation_id: 'carrier_operation_next', next_action: 'start_operation' },
      response: {
        operation_posture_overview: { operation_count: 1 },
        operation_posture_route: { next_action: 'start_operation' },
      },
    }),
  });

  assert.equal(posture.state, 'loaded');
  assert.equal(posture.status, 'ok');
  assert.equal(posture.auth_kind, 'operator_session');
  assert.equal(posture.auth_source, 'env:CLOUDFLARE_OPERATOR_SESSION_COOKIE');
  assert.equal(posture.embeds_credentials, false);
});

test('site continuity scheduler product read auth prefers explicit operator session file over bearer env', async () => {
  const root = await mkdtemp(join(tmpdir(), 'narada-site-continuity-auth-'));
  const sessionFile = join(root, 'cloudflare-operator-session.json');
  const tokenFile = join(root, 'carrier-token.txt');
  await writeFile(sessionFile, `${JSON.stringify({ cookie: 'narada_operator_session=session-fixture' })}\n`, 'utf8');
  await writeFile(tokenFile, 'bearer-fixture\n', 'utf8');
  try {
    const auth = resolveSiteContinuitySchedulerProductReadAuth({
      operatorSessionFile: sessionFile,
    }, {
      CLOUDFLARE_CARRIER_TOKEN_FILE: tokenFile,
      CLOUDFLARE_CARRIER_TOKEN: 'bearer-env-fixture',
    });

    assert.equal(auth.kind, 'operator_session');
    assert.equal(auth.source, 'operator-session-file');
    assert.equal(auth.value, 'session-fixture');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('site continuity product binding alignment classifies remote next-site coverage', () => {
  const aligned = summarizeCloudflareProductBindingAlignment({
    configuredSites: {
      selection_source: 'site_continuity_binding_registry',
      sites: ['site_alpha'],
      site_records: [{ site_id: 'site_alpha' }],
    },
    cloudflareProductPosture: {
      state: 'loaded',
      status: 'ok',
      summary: {
        next_site_id: 'site_alpha',
        next_action: 'refresh_site_continuity_loop',
        next_health: 'attention',
      },
    },
  });

  assert.equal(aligned.schema, 'narada.cloudflare_carrier.product_binding_alignment.v1');
  assert.equal(aligned.state, 'aligned');
  assert.equal(aligned.status, 'ok');
  assert.equal(aligned.reason, 'cloudflare_product_next_site_in_local_continuity_set');
  assert.deepEqual(aligned.local_site_ids, ['site_alpha']);

  const unbound = summarizeCloudflareProductBindingAlignment({
    configuredSites: {
      selection_source: 'site_continuity_binding_registry',
      sites: ['site_alpha'],
      site_records: [{ site_id: 'site_alpha' }],
    },
    cloudflareProductPosture: {
      state: 'loaded',
      status: 'ok',
      summary: {
        next_site_id: 'site_beta',
        next_action: 'publish_cloudflare_continuity_packet',
        next_health: 'attention',
      },
    },
  });

  assert.equal(unbound.state, 'unbound_remote_next_site');
  assert.equal(unbound.status, 'needs_attention');
  assert.equal(unbound.reason, 'cloudflare_product_next_site_not_in_local_continuity_set');
  assert.equal(summarizeScheduledHealthSnapshotStatus({
    continuityHealth: { status: 'ok' },
    cloudflareProductPosture: { status: 'ok' },
    cloudflareProductBindingAlignment: unbound,
    cloudflareOperationPosture: { status: 'ok' },
  }), 'needs_attention');
});

test('site continuity scheduled health operator action targets unbound remote next site first', () => {
  const operatorNextAction = summarizeScheduledHealthOperatorNextAction({
    status: 'needs_attention',
    continuity_health: {
      status: 'ok',
      attention_reasons: [],
    },
    cloudflare_product_posture: {
      summary: {
        next_site_id: 'site_beta',
        next_action: 'publish_cloudflare_continuity_packet',
      },
    },
    cloudflare_product_binding_alignment: {
      state: 'unbound_remote_next_site',
      status: 'needs_attention',
      reason: 'cloudflare_product_next_site_not_in_local_continuity_set',
      cloudflare_product_next_site_id: 'site_beta',
    },
  });

  assert.deepEqual(operatorNextAction, {
    action: 'bind_cloudflare_product_next_site_locally',
    target_site_id: 'site_beta',
    reason: 'cloudflare_product_next_site_not_in_local_continuity_set',
    source: 'cloudflare_product_binding_alignment',
  });
});

test('site continuity scheduled health reports binding preparation readiness without synthesizing refs', () => {
  const missingRefs = summarizeCloudflareProductBindingPreparation({
    configuredSites: {
      site_records: [{ site_id: 'site_alpha', local_site_ref: 'file:///D:/code/narada', cloudflare_site_ref: 'cloudflare://site-alpha' }],
      site_registry_projection: {
        site_records: [{ site_id: 'site_beta', site_ref: null }],
      },
    },
    cloudflareProductPosture: { summary: { next_site_id: 'site_beta' } },
    cloudflareProductBindingAlignment: {
      state: 'unbound_remote_next_site',
      cloudflare_product_next_site_id: 'site_beta',
    },
  });

  assert.equal(missingRefs.state, 'blocked_missing_refs');
  assert.equal(missingRefs.status, 'needs_attention');
  assert.equal(missingRefs.reason, 'site_continuity_binding_refs_missing');
  assert.equal(missingRefs.target_site_id, 'site_beta');
  assert.deepEqual(missingRefs.required_inputs, ['local_site_ref', 'cloudflare_site_ref']);
  assert.equal(missingRefs.local_site_ref_available, false);
  assert.equal(missingRefs.cloudflare_site_ref_available, false);
  assert.equal(missingRefs.embeds_credentials, false);

  const ready = summarizeCloudflareProductBindingPreparation({
    configuredSites: {
      site_records: [{ site_id: 'site_beta', local_site_ref: 'file:///D:/code/narada', cloudflare_site_ref: 'cloudflare://site-beta' }],
    },
    cloudflareProductPosture: { summary: { next_site_id: 'site_beta' } },
    cloudflareProductBindingAlignment: {
      state: 'unbound_remote_next_site',
      cloudflare_product_next_site_id: 'site_beta',
    },
  });

  assert.equal(ready.state, 'ready');
  assert.equal(ready.status, 'ok');
  assert.deepEqual(ready.required_inputs, []);
  assert.equal(ready.local_site_ref_available, true);
  assert.equal(ready.cloudflare_site_ref_available, true);
});

test('site continuity reconciliation plan resolves one packet per configured site from packet directory', async () => {
  const root = await mkdtemp(join(tmpdir(), 'narada-site-continuity-reconcile-packet-dir-'));
  const artifactDirectory = join(root, '.narada/site-continuity');
  const bindingRegistryPath = join(artifactDirectory, 'bindings.json');
  const packetDirectory = join(root, '.narada/site-continuity-packets');
  const syncEntrypoint = join(root, 'packages/cloudflare-carrier/scripts/cloudflare-site-continuity-sync.mjs');
  await mkdir(artifactDirectory, { recursive: true });
  await mkdir(packetDirectory, { recursive: true });
  await mkdir(join(root, 'packages/cloudflare-carrier/scripts'), { recursive: true });
  await writeFile(syncEntrypoint, '#!/usr/bin/env node\n', 'utf8');
  await writeFile(join(packetDirectory, 'site_alpha-packet.json'), '{"packet":{"site_id":"site_alpha","packet_id":"packet-alpha"}}\n', 'utf8');
  await writeFile(join(packetDirectory, 'site_beta-packet.json'), '{"packet":{"site_id":"site_beta","packet_id":"packet-beta"}}\n', 'utf8');
  try {
    const plan = buildSiteContinuitySchedulerPlan({
      action: 'reconcile',
      repoRoot: root,
      syncEntrypoint,
      packetDirectory,
      artifactDirectory,
      configuredSites: 'site_alpha,site_beta',
    });

    assert.equal(plan.packet_path, null);
    assert.equal(plan.packet_directory, packetDirectory);
    assert.equal(plan.status.packet_directory_exists, true);
    assert.equal(plan.status.command_args_complete, true);
    assert.equal(plan.reconciliation_plan.status, 'ready');
    assert.equal(plan.reconciliation_plan.packet_resolution, 'per_site_packet_directory');
    assert.equal(plan.reconciliation_plan.packet_summary, null);
    assert.equal(plan.reconciliation_plan.selected_site_count, 2);
    assert.equal(plan.reconciliation_plan.command_ready_count, 2);
    assert.deepEqual(plan.reconciliation_plan.selected_sites.map((site) => [
      site.site_id,
      site.packet_path,
      site.packet_path_source,
      site.packet_site_id,
      site.local_inbound_directory,
      site.command_status,
      site.command_blockers,
    ]), [
      ['site_alpha', join(packetDirectory, 'site_alpha-packet.json'), 'packet_directory', 'site_alpha', join(artifactDirectory, 'inbound'), 'ready', []],
      ['site_beta', join(packetDirectory, 'site_beta-packet.json'), 'packet_directory', 'site_beta', join(artifactDirectory, 'inbound'), 'ready', []],
    ]);
    assert.match(plan.reconciliation_plan.selected_sites[0].sync_command, /site_alpha-packet\.json/);
    assert.match(plan.reconciliation_plan.selected_sites[0].sync_command, /--local-inbound-dir/);
    assert.match(plan.reconciliation_plan.selected_sites[0].sync_command, /inbound/);
    assert.match(plan.reconciliation_plan.selected_sites[1].sync_command, /site_beta-packet\.json/);
    assert.doesNotMatch(JSON.stringify(plan), /secret|token/i);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('site continuity reconciliation plan resolves default FNM node command for scheduled health parity', async () => {
  const root = await mkdtemp(join(tmpdir(), 'narada-site-continuity-reconcile-fnm-node-'));
  const artifactDirectory = join(root, '.narada/site-continuity');
  const packetDirectory = join(root, '.narada/site-continuity-packets');
  const syncEntrypoint = join(root, 'packages/cloudflare-carrier/scripts/cloudflare-site-continuity-sync.mjs');
  const fnmDir = join(root, '.fnm');
  const fnmNode = join(fnmDir, 'node-versions', `v${process.versions.node}`, 'installation', process.platform === 'win32' ? 'node.exe' : 'bin/node');
  const originalFnmDir = process.env.FNM_DIR;
  const originalNaradaNodeCommand = process.env.NARADA_NODE_COMMAND;
  await mkdir(artifactDirectory, { recursive: true });
  await mkdir(packetDirectory, { recursive: true });
  await mkdir(join(root, 'packages/cloudflare-carrier/scripts'), { recursive: true });
  await mkdir(dirname(fnmNode), { recursive: true });
  await writeFile(syncEntrypoint, '#!/usr/bin/env node\n', 'utf8');
  await writeFile(fnmNode, '', 'utf8');
  await writeFile(join(packetDirectory, 'site_alpha-packet.json'), '{"packet":{"site_id":"site_alpha","packet_id":"packet-alpha"}}\n', 'utf8');
  try {
    process.env.FNM_DIR = fnmDir;
    delete process.env.NARADA_NODE_COMMAND;
    const plan = buildSiteContinuitySchedulerPlan({
      action: 'reconcile',
      repoRoot: root,
      syncEntrypoint,
      packetDirectory,
      artifactDirectory,
      configuredSites: 'site_alpha',
    });

    assert.equal(plan.node_command, fnmNode);
    assert.equal(plan.reconciliation_plan.status, 'ready');
    assert.equal(plan.reconciliation_plan.selected_sites[0].sync_command.includes(fnmNode), true);
    assert.doesNotMatch(plan.reconciliation_plan.selected_sites[0].sync_command, /^"?node"?\s/);
  } finally {
    if (originalFnmDir === undefined) delete process.env.FNM_DIR;
    else process.env.FNM_DIR = originalFnmDir;
    if (originalNaradaNodeCommand === undefined) delete process.env.NARADA_NODE_COMMAND;
    else process.env.NARADA_NODE_COMMAND = originalNaradaNodeCommand;
    await rm(root, { recursive: true, force: true });
  }
});

test('site continuity scheduler live install executes bounded schtasks command', async () => {
  const root = await mkdtemp(join(tmpdir(), 'narada-site-continuity-live-install-'));
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
    const calls = [];
    const result = await runSiteContinuitySchedulerActionWithOptionalRefresh({
      action: 'install',
      repoRoot: root,
      intervalMinutes: 5,
      siteId: 'site_fixture',
      packetPath,
      dryRun: false,
      executionTimeoutMs: 5000,
    }, {
      execFileImpl: async (command, args, options) => {
        calls.push({ command, args, options });
        return { stdout: 'SUCCESS: scheduled task created', stderr: '' };
      },
    });

    assert.equal(result.plan_status, 'live_install_completed');
    assert.equal(result.host_scheduler_mutation_admission, 'bounded_schtasks_command_from_scheduler_plan');
    assert.equal(result.filesystem_mutation_admission, 'hidden_wrapper_file_write_and_local_sync_report_artifact_write_only');
    assert.equal(result.scheduler_task_execution.state, 'completed');
    assert.equal(result.scheduler_task_execution.status, 'ok');
    assert.equal(result.scheduler_task_settings_execution.status, 'ok');
    assert.equal(result.scheduler_task_settings_execution.command, 'powershell.exe');
    assert.equal(calls.length, 2);
    assert.equal(result.scheduler_task_execution.command, 'schtasks');
    assert.deepEqual(calls[0].args.slice(0, 7), ['/Create', '/TN', '\\Narada\\CloudflareSiteContinuitySync', '/SC', 'MINUTE', '/MO', '5']);
    assert.equal(calls[0].args.includes('/TR'), true);
    assert.match(calls[0].args[calls[0].args.indexOf('/TR') + 1], /^wscript\.exe \/\/B /);
    assert.match(calls[0].args[calls[0].args.indexOf('/TR') + 1], /cloudflare-site-continuity-sync\.hidden\.vbs/);
    assert.doesNotMatch(calls[0].args[calls[0].args.indexOf('/TR') + 1], /--site|--sites|--packet|--out|site_fixture|local-packet\.json/);
    const wrapperContent = await readFile(join(root, '.narada/site-continuity/cloudflare-site-continuity-sync.hidden.vbs'), 'utf8');
    assert.equal(wrapperContent, buildHiddenVbsWrapperContent(result.direct_task_command));
    assert.match(result.direct_task_command, /cloudflare-site-continuity-scheduled-task\.mjs/);
    assert.equal(calls[0].options.cwd, root);
    assert.equal(calls[0].options.timeout, 5000);
    assert.equal(calls[1].command, 'powershell.exe');
    assert.deepEqual(calls[1].args.slice(0, 4), ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command']);
    assert.match(calls[1].args[4], /Get-ScheduledTask -TaskPath '\\Narada\\' -TaskName 'CloudflareSiteContinuitySync'/);
    assert.match(calls[1].args[4], /DisallowStartIfOnBatteries = \$false/);
    assert.match(calls[1].args[4], /StopIfGoingOnBatteries = \$false/);
    assert.match(calls[1].args[4], /StartWhenAvailable = \$true/);
    assert.match(calls[1].args[4], /Set-ScheduledTask -InputObject \$task/);
    assert.equal(calls[1].options.cwd, root);
    assert.equal(calls[1].options.timeout, 5000);
    assert.equal(calls[1].options.windowsHide, true);
    assert.doesNotMatch(JSON.stringify(result), /secret-token-value|CLOUDFLARE_CARRIER_TOKEN=/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('site continuity scheduler live status attaches parsed Task Scheduler readback', async () => {
  const root = await mkdtemp(join(tmpdir(), 'narada-site-continuity-live-status-'));
  const syncEntrypoint = join(root, 'packages/cloudflare-carrier/scripts/cloudflare-site-continuity-sync.mjs');
  const scheduledTaskEntrypoint = join(root, 'packages/cloudflare-carrier/scripts/cloudflare-site-continuity-scheduled-task.mjs');
  const packetPath = join(root, '.narada/site-continuity/local-packet.json');
  await mkdir(join(root, 'packages/cloudflare-carrier/scripts'), { recursive: true });
  await mkdir(join(root, '.narada/site-continuity'), { recursive: true });
  await writeFile(syncEntrypoint, '#!/usr/bin/env node\n', 'utf8');
  await writeFile(scheduledTaskEntrypoint, '#!/usr/bin/env node\n', 'utf8');
  await writeFile(packetPath, '{"packet":{"site_id":"site_fixture"}}\n', 'utf8');
  await writePlannedSiteContinuityHiddenWrapper({ repoRoot: root });
  try {
    const calls = [];
    const result = await runSiteContinuitySchedulerActionWithOptionalRefresh({
      action: 'status-all',
      repoRoot: root,
      intervalMinutes: 5,
      siteId: 'site_fixture',
      packetPath,
      dryRun: false,
      executionTimeoutMs: 5000,
    }, {
      execFileImpl: async (command, args, options) => {
        calls.push({ command, args, options });
        return {
          stdout: [
            'TaskName: \\Narada\\CloudflareSiteContinuitySync',
            'Next Run Time: 6/11/2026 8:48:00 AM',
            'Status: Ready',
            'Last Run Time: 6/11/2026 7:52:45 AM',
            'Last Result: 0',
            `Task To Run: wscript.exe //B "${join(root, '.narada/site-continuity/cloudflare-site-continuity-sync.hidden.vbs')}"`,
            'Scheduled Task State: Enabled',
            'Repeat: Every: 0 Hour(s), 5 Minute(s)',
          ].join('\n'),
          stderr: '',
        };
      },
    });

    assert.equal(result.host_scheduler_read_admission, 'bounded_schtasks_query_from_scheduler_plan');
    assert.equal(result.scheduler_task_readback.state, 'completed');
    assert.equal(result.scheduler_task_readback.status, 'ok');
    assert.equal(result.scheduler_task_readback.task_name, '\\Narada\\CloudflareSiteContinuitySync');
    assert.equal(result.scheduler_task_readback.scheduled_task_state, 'Enabled');
    assert.equal(result.scheduler_task_readback.status_text, 'Ready');
    assert.equal(result.scheduler_task_readback.last_result, '0');
    assert.equal(result.scheduler_task_readback.actual_interval_minutes, 5);
    assert.equal(result.scheduler_task_readback.expected_interval_minutes, 5);
    assert.equal(result.scheduler_task_readback.cadence_status, 'matches_plan');
    assert.equal(result.scheduler_task_readback.task_command_status, 'matches_plan');
    assert.equal(result.scheduler_task_readback.hidden_wrapper_readback.status, 'matches_plan');
    assert.deepEqual(result.scheduler_task_readback.attention_reasons, []);
    assert.equal(calls[0].command, 'schtasks');
    assert.deepEqual(calls[0].args, ['/Query', '/TN', '\\Narada\\CloudflareSiteContinuitySync', '/V', '/FO', 'LIST']);
    assert.equal(calls[0].options.cwd, root);
    assert.equal(calls[0].options.timeout, 5000);
    assert.doesNotMatch(JSON.stringify(result), /secret-token-value|CLOUDFLARE_CARRIER_TOKEN=/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('site continuity scheduler reads local inbound packet inventory per configured site', async () => {
  const root = await mkdtemp(join(tmpdir(), 'narada-site-continuity-inbound-inventory-'));
  const artifactDirectory = join(root, '.narada/site-continuity');
  try {
    const inboundPath = await writeInboundPacketArtifact(artifactDirectory, 'site_synced', {
      generatedAt: '2026-06-11T10:30:00.000Z',
    });

    const artifact = readLocalInboundPacketArtifact(inboundPath);
    assert.equal(artifact.status, 'synced');
    assert.equal(artifact.site_id, 'site_synced');
    assert.equal(artifact.cloudflare_to_local_windows_admission_action, 'projection_only');

    const inventory = readLocalInboundPacketInventory(join(artifactDirectory, 'inbound'), {
      configuredSites: [{ site_id: 'site_synced' }, { site_id: 'site_missing' }],
      now: () => '2026-06-11T10:31:00.000Z',
    });
    assert.equal(inventory.status, 'needs_attention');
    assert.equal(inventory.artifact_count, 1);
    assert.deepEqual(inventory.configured_site_inbound_statuses.map((site) => [site.site_id, site.status, site.reason]), [
      ['site_missing', 'needs_attention', 'configured_site_inbound_packet_missing'],
      ['site_synced', 'synced', 'matching_inbound_packet_observed'],
    ]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('site continuity scheduler text summary surfaces local and inbound continuity posture', async () => {
  const root = await mkdtemp(join(tmpdir(), 'narada-site-continuity-text-summary-'));
  const artifactDirectory = join(root, '.narada/site-continuity');
  const outputPath = join(artifactDirectory, 'site_synced-cloudflare-sync.json');
  await mkdir(artifactDirectory, { recursive: true });
  await writeFile(outputPath, `${JSON.stringify({
    schema: 'narada.site_continuity_cloudflare_sync_once.v1',
    status: 'ok',
    site_id: 'site_synced',
    continuity_loop_report_recorded: true,
    continuity_loop_report: {
      status: 'ok',
      site_id: 'site_synced',
      generated_at: '2026-06-11T10:30:00.000Z',
      cloudflare_push: {
        status: 'imported',
        pushed_packet_id: 'packet-synced-local',
        returned_packet_id: 'packet-synced-cloudflare',
      },
    },
  }, null, 2)}\n`, 'utf8');
  await utimes(outputPath, new Date('2026-06-11T10:30:00.000Z'), new Date('2026-06-11T10:30:00.000Z'));
  await writeInboundPacketArtifact(artifactDirectory, 'site_synced', { generatedAt: '2026-06-11T10:30:00.000Z' });
  try {
    const plan = buildSiteContinuitySchedulerPlan({
      action: 'status-all',
      repoRoot: root,
      artifactDirectory,
      configuredSites: 'site_synced,site_missing',
      now: () => '2026-06-11T10:31:00.000Z',
    });
    plan.scheduler_task_readback = {
      hidden_wrapper_readback: { status: 'matches_plan', path: 'hidden.vbs', embeds_credentials: false },
    };
    const text = formatSiteContinuitySchedulerResultForText(plan);

    assert.match(text, /^Site Continuity\n/);
    assert.match(text, /Status: needs_attention/);
    assert.doesNotMatch(text, /\[object Object\]/);
    assert.match(text, /Sites: 2 \(explicit_sites\)/);
    assert.match(text, /Hidden Wrapper: matches_plan/);
    assert.match(text, /Local Sync: needs_attention \(1\)/);
    assert.match(text, /Local Inbound: needs_attention \(1\)/);
    assert.match(text, /- site_missing: sync=needs_attention inbound=needs_attention/);
    assert.match(text, /- site_synced: sync=synced inbound=synced/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('site continuity scheduler health summarizes binding, sync, and scheduler posture', async () => {
  const root = await mkdtemp(join(tmpdir(), 'narada-site-continuity-health-'));
  const artifactDirectory = join(root, '.narada/site-continuity');
  const syncEntrypoint = join(root, 'packages/cloudflare-carrier/scripts/cloudflare-site-continuity-sync.mjs');
  const scheduledTaskEntrypoint = join(root, 'packages/cloudflare-carrier/scripts/cloudflare-site-continuity-scheduled-task.mjs');
  const packetPath = join(artifactDirectory, 'local-packet.json');
  const outputPath = join(artifactDirectory, 'cloudflare-sync-last.json');
  const bindingRegistryPath = join(artifactDirectory, 'bindings.json');
  await mkdir(join(root, 'packages/cloudflare-carrier/scripts'), { recursive: true });
  await mkdir(artifactDirectory, { recursive: true });
  await writeFile(syncEntrypoint, '#!/usr/bin/env node\n', 'utf8');
  await writeFile(scheduledTaskEntrypoint, '#!/usr/bin/env node\n', 'utf8');
  await writeFile(packetPath, '{"packet":{"site_id":"site_bound"}}\n', 'utf8');
  await writeFile(bindingRegistryPath, `${JSON.stringify(createSiteContinuityBindingRegistry({
    registry_ref: 'operator-registry',
    generated_at: '2026-06-11T13:45:00.000Z',
    bindings: [createSiteContinuityBinding({ site_id: 'site_bound' })],
  }), null, 2)}\n`, 'utf8');
  await writeFile(outputPath, `${JSON.stringify({
    schema: 'narada.site_continuity_cloudflare_sync_once.v1',
    status: 'ok',
    site_id: 'site_bound',
    worker_url: 'https://worker.example',
    pushed_packet_id: 'packet-bound-local',
    pulled_packet_id: 'packet-bound-cloudflare',
    continuity_loop_report_recorded: true,
    continuity_loop_report: {
      status: 'ok',
      site_id: 'site_bound',
      generated_at: '2026-06-11T13:45:00.000Z',
      cloudflare_push: {
        status: 'imported',
        pushed_packet_id: 'packet-bound-local',
        returned_packet_id: 'packet-bound-cloudflare',
      },
    },
  }, null, 2)}\n`, 'utf8');
  await utimes(outputPath, new Date('2026-06-11T13:45:00.000Z'), new Date('2026-06-11T13:45:00.000Z'));
  await writeInboundPacketArtifact(artifactDirectory, 'site_bound');
  try {
    const plan = buildSiteContinuitySchedulerPlan({
      action: 'health',
      repoRoot: root,
      syncEntrypoint,
      scheduledTaskEntrypoint,
      packetPath,
      outputPath,
      artifactDirectory,
      siteContinuityBindingRegistryPath: bindingRegistryPath,
      now: () => '2026-06-11T13:46:00.000Z',
    });

    assert.equal(plan.plan_status, 'site_continuity_health_gate_read_only');
    assert.equal(plan.local_sync_artifacts.status, 'synced');
    assert.equal(plan.local_inbound_packets.status, 'synced');
    assert.equal(plan.continuity_health.status, 'needs_attention');
    assert.deepEqual(plan.continuity_health.attention_reasons, ['site_continuity_scheduler_live_readback_required']);
    assert.equal(plan.continuity_health.site_count, 1);
    assert.equal(plan.continuity_health.selection_source, 'site_continuity_binding_registry');
    assert.equal(plan.continuity_health.binding_registry_state, 'read');
    assert.equal(plan.continuity_health.local_sync_status, 'synced');
    assert.equal(plan.continuity_health.local_inbound_status, 'synced');
    assert.equal(plan.continuity_health.embeds_credentials, false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('site continuity scheduler live health passes with synced artifacts and healthy scheduler readback', async () => {
  const root = await mkdtemp(join(tmpdir(), 'narada-site-continuity-live-health-'));
  const artifactDirectory = join(root, '.narada/site-continuity');
  const syncEntrypoint = join(root, 'packages/cloudflare-carrier/scripts/cloudflare-site-continuity-sync.mjs');
  const scheduledTaskEntrypoint = join(root, 'packages/cloudflare-carrier/scripts/cloudflare-site-continuity-scheduled-task.mjs');
  const packetPath = join(artifactDirectory, 'local-packet.json');
  const outputPath = join(artifactDirectory, 'cloudflare-sync-last.json');
  const bindingRegistryPath = join(artifactDirectory, 'bindings.json');
  const operatorSessionFile = join(root, 'cloudflare-operator-session.json');
  await mkdir(join(root, 'packages/cloudflare-carrier/scripts'), { recursive: true });
  await mkdir(artifactDirectory, { recursive: true });
  await writeFile(syncEntrypoint, '#!/usr/bin/env node\n', 'utf8');
  await writeFile(scheduledTaskEntrypoint, '#!/usr/bin/env node\n', 'utf8');
  await writeFile(operatorSessionFile, `${JSON.stringify({ cookie: 'narada_operator_session=session-fixture' })}\n`, 'utf8');
  await writeFile(packetPath, '{"packet":{"site_id":"site_bound"}}\n', 'utf8');
  await writeFile(bindingRegistryPath, `${JSON.stringify(createSiteContinuityBindingRegistry({
    registry_ref: 'operator-registry',
    generated_at: '2026-06-11T13:45:00.000Z',
    bindings: [createSiteContinuityBinding({ site_id: 'site_bound' })],
  }), null, 2)}\n`, 'utf8');
  await writeFile(outputPath, `${JSON.stringify({
    schema: 'narada.site_continuity_cloudflare_sync_once.v1',
    status: 'ok',
    site_id: 'site_bound',
    continuity_loop_report_recorded: true,
    continuity_loop_report: {
      status: 'ok',
      site_id: 'site_bound',
      generated_at: '2026-06-11T13:45:00.000Z',
      cloudflare_push: {
        status: 'imported',
        pushed_packet_id: 'packet-bound-local',
        returned_packet_id: 'packet-bound-cloudflare',
      },
    },
  }, null, 2)}\n`, 'utf8');
  await utimes(outputPath, new Date('2026-06-11T13:45:00.000Z'), new Date('2026-06-11T13:45:00.000Z'));
  await writeInboundPacketArtifact(artifactDirectory, 'site_bound');
  await writePlannedSiteContinuityHiddenWrapper({
    action: 'health',
    repoRoot: root,
    syncEntrypoint,
    scheduledTaskEntrypoint,
    packetPath,
    outputPath,
    artifactDirectory,
    siteContinuityBindingRegistryPath: bindingRegistryPath,
    now: () => '2026-06-11T13:46:00.000Z',
  });
  try {
    const result = await runSiteContinuitySchedulerActionWithOptionalRefresh({
      action: 'health',
      repoRoot: root,
      syncEntrypoint,
      scheduledTaskEntrypoint,
      packetPath,
      outputPath,
      artifactDirectory,
      siteContinuityBindingRegistryPath: bindingRegistryPath,
      now: () => '2026-06-11T13:46:00.000Z',
      dryRun: false,
      operatorSessionFile,
    }, {
      env: {
        CLOUDFLARE_CARRIER_URL: 'https://worker.example',
        CLOUDFLARE_CARRIER_TOKEN: 'secret-token-that-must-not-win',
      },
      execFileImpl: async () => ({
        stdout: [
          'TaskName: \\\\Narada\\\\CloudflareSiteContinuitySync',
          'Status: Ready',
          'Last Result: 0',
          `Task To Run: wscript.exe //B "${join(root, '.narada/site-continuity/cloudflare-site-continuity-sync.hidden.vbs')}"`,
          'Scheduled Task State: Enabled',
          'Repeat: Every: 0 Hour(s), 5 Minute(s)',
        ].join('\n'),
        stderr: '',
      }),
      productReadSurface: async ({ operation, auth, params }) => {
        assert.equal(auth.kind, 'operator_session');
        assert.equal(auth.source, 'operator-session-file');
        assert.equal(auth.value, 'session-fixture');
        if (operation === 'site.list') {
          return {
            summary: {
              next_site_id: 'site_bound',
              next_action: 'monitor_sites',
              next_reason: 'continuity_loop_freshness',
            },
            response: {
              site_product_overview: { site_count: 1 },
              site_posture_route: { next_action: 'monitor_sites', status: 'ready' },
            },
          };
        }
        assert.equal(operation, 'operation.list');
        assert.deepEqual(params, { site_id: 'site_bound' });
        return {
          summary: {
            next_operation_id: 'carrier_operation_next',
            next_action: 'start_operation',
          },
          response: {
            operation_posture_overview: { operation_count: 1 },
            operation_posture_route: { next_action: 'start_operation', status: 'ready' },
          },
        };
      },
    });

    assert.equal(result.scheduler_task_readback.status, 'ok');
    assert.equal(result.continuity_health.status, 'ok');
    assert.deepEqual(result.continuity_health.attention_reasons, []);
    assert.equal(result.continuity_health.scheduler_readback_status, 'ok');
    assert.equal(result.continuity_health.scheduler_last_result, '0');
    assert.equal(result.scheduler_task_readback.hidden_wrapper_readback.status, 'matches_plan');
    assert.equal(result.continuity_health.local_sync_status, 'synced');
    assert.equal(result.continuity_health.local_inbound_status, 'synced');
    assert.equal(result.continuity_health.binding_count, 1);
    assert.equal(result.cloudflare_product_posture.state, 'loaded');
    assert.equal(result.cloudflare_product_posture.auth_kind, 'operator_session');
    assert.equal(result.cloudflare_product_posture.auth_source, 'operator-session-file');
    assert.equal(result.cloudflare_product_binding_alignment.state, 'aligned');
    assert.equal(result.cloudflare_product_binding_preparation.state, 'not_required');
    assert.equal(result.cloudflare_operation_posture.state, 'loaded');
    assert.equal(result.cloudflare_operation_posture.auth_kind, 'operator_session');
    assert.equal(result.cloudflare_operation_posture.auth_source, 'operator-session-file');
    assert.doesNotMatch(JSON.stringify(result), /secret-token-that-must-not-win|narada_operator_session=session-fixture|CLOUDFLARE_CARRIER_TOKEN=/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('site continuity scheduler live status surfaces cadence mismatch as attention evidence', async () => {
  const root = await mkdtemp(join(tmpdir(), 'narada-site-continuity-live-status-mismatch-'));
  const syncEntrypoint = join(root, 'packages/cloudflare-carrier/scripts/cloudflare-site-continuity-sync.mjs');
  const scheduledTaskEntrypoint = join(root, 'packages/cloudflare-carrier/scripts/cloudflare-site-continuity-scheduled-task.mjs');
  const packetPath = join(root, '.narada/site-continuity/local-packet.json');
  await mkdir(join(root, 'packages/cloudflare-carrier/scripts'), { recursive: true });
  await mkdir(join(root, '.narada/site-continuity'), { recursive: true });
  await writeFile(syncEntrypoint, '#!/usr/bin/env node\n', 'utf8');
  await writeFile(scheduledTaskEntrypoint, '#!/usr/bin/env node\n', 'utf8');
  await writeFile(packetPath, '{"packet":{"site_id":"site_fixture"}}\n', 'utf8');
  await writePlannedSiteContinuityHiddenWrapper({ repoRoot: root });
  try {
    const result = await runSiteContinuitySchedulerActionWithOptionalRefresh({
      action: 'status',
      repoRoot: root,
      intervalMinutes: 5,
      siteId: 'site_fixture',
      packetPath,
      dryRun: false,
    }, {
      execFileImpl: async () => ({
        stdout: [
          'TaskName: \\Narada\\CloudflareSiteContinuitySync',
          'Status: Ready',
          'Last Result: 0',
          `Task To Run: wscript.exe //B "${join(root, '.narada/site-continuity/cloudflare-site-continuity-sync.hidden.vbs')}"`,
          'Scheduled Task State: Enabled',
          'Repeat: Every: 1 Hour(s), 0 Minute(s)',
        ].join('\n'),
        stderr: '',
      }),
    });

    assert.equal(result.scheduler_task_readback.status, 'needs_attention');
    assert.equal(result.scheduler_task_readback.actual_interval_minutes, 60);
    assert.equal(result.scheduler_task_readback.expected_interval_minutes, 5);
    assert.equal(result.scheduler_task_readback.cadence_status, 'differs_from_plan');
    assert.equal(result.scheduler_task_readback.task_command_status, 'matches_plan');
    assert.deepEqual(result.scheduler_task_readback.attention_reasons, ['scheduler_cadence_differs_from_plan']);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('site continuity scheduler live status surfaces battery-blocking power policy as attention evidence', async () => {
  const root = await mkdtemp(join(tmpdir(), 'narada-site-continuity-live-status-power-'));
  const syncEntrypoint = join(root, 'packages/cloudflare-carrier/scripts/cloudflare-site-continuity-sync.mjs');
  const scheduledTaskEntrypoint = join(root, 'packages/cloudflare-carrier/scripts/cloudflare-site-continuity-scheduled-task.mjs');
  const packetPath = join(root, '.narada/site-continuity/local-packet.json');
  await mkdir(join(root, 'packages/cloudflare-carrier/scripts'), { recursive: true });
  await mkdir(join(root, '.narada/site-continuity'), { recursive: true });
  await writeFile(syncEntrypoint, '#!/usr/bin/env node\n', 'utf8');
  await writeFile(scheduledTaskEntrypoint, '#!/usr/bin/env node\n', 'utf8');
  await writeFile(packetPath, '{"packet":{"site_id":"site_fixture"}}\n', 'utf8');
  await writePlannedSiteContinuityHiddenWrapper({ repoRoot: root });
  try {
    const result = await runSiteContinuitySchedulerActionWithOptionalRefresh({
      action: 'status',
      repoRoot: root,
      intervalMinutes: 5,
      siteId: 'site_fixture',
      packetPath,
      dryRun: false,
    }, {
      execFileImpl: async () => ({
        stdout: [
          'TaskName: \\Narada\\CloudflareSiteContinuitySync',
          'Status: Ready',
          'Last Result: 0',
          `Task To Run: wscript.exe //B "${join(root, '.narada/site-continuity/cloudflare-site-continuity-sync.hidden.vbs')}"`,
          'Scheduled Task State: Enabled',
          'Power Management: Stop On Battery Mode, No Start On Batteries',
          'Repeat: Every: 0 Hour(s), 5 Minute(s)',
        ].join('\n'),
        stderr: '',
      }),
    });

    assert.equal(result.scheduler_task_readback.status, 'needs_attention');
    assert.equal(result.scheduler_task_readback.last_result, '0');
    assert.equal(result.scheduler_task_readback.cadence_status, 'matches_plan');
    assert.equal(result.scheduler_task_readback.task_command_status, 'matches_plan');
    assert.equal(result.scheduler_task_readback.power_management_status, 'blocks_battery_execution');
    assert.deepEqual(result.scheduler_task_readback.attention_reasons, ['scheduler_power_policy_blocks_battery_execution']);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('site continuity scheduler treats empty Task Scheduler power policy as battery-safe', async () => {
  const root = await mkdtemp(join(tmpdir(), 'narada-site-continuity-live-status-power-empty-'));
  const syncEntrypoint = join(root, 'packages/cloudflare-carrier/scripts/cloudflare-site-continuity-sync.mjs');
  const scheduledTaskEntrypoint = join(root, 'packages/cloudflare-carrier/scripts/cloudflare-site-continuity-scheduled-task.mjs');
  const packetPath = join(root, '.narada/site-continuity/local-packet.json');
  await mkdir(join(root, 'packages/cloudflare-carrier/scripts'), { recursive: true });
  await mkdir(join(root, '.narada/site-continuity'), { recursive: true });
  await writeFile(syncEntrypoint, '#!/usr/bin/env node\n', 'utf8');
  await writeFile(scheduledTaskEntrypoint, '#!/usr/bin/env node\n', 'utf8');
  await writeFile(packetPath, '{"packet":{"site_id":"site_fixture"}}\n', 'utf8');
  await writePlannedSiteContinuityHiddenWrapper({ repoRoot: root });
  try {
    const result = await runSiteContinuitySchedulerActionWithOptionalRefresh({
      action: 'status',
      repoRoot: root,
      intervalMinutes: 5,
      siteId: 'site_fixture',
      packetPath,
      dryRun: false,
    }, {
      execFileImpl: async () => ({
        stdout: [
          'TaskName: \\Narada\\CloudflareSiteContinuitySync',
          'Status: Ready',
          'Last Result: 0',
          `Task To Run: wscript.exe //B "${join(root, '.narada/site-continuity/cloudflare-site-continuity-sync.hidden.vbs')}"`,
          'Scheduled Task State: Enabled',
          'Power Management:',
          'Repeat: Every: 0 Hour(s), 5 Minute(s)',
        ].join('\n'),
        stderr: '',
      }),
    });

    assert.equal(result.scheduler_task_readback.status, 'ok');
    assert.equal(result.scheduler_task_readback.power_management_status, 'allows_battery_execution');
    assert.deepEqual(result.scheduler_task_readback.attention_reasons, []);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('site continuity scheduler live status surfaces nonzero last result as attention evidence', async () => {
  const root = await mkdtemp(join(tmpdir(), 'narada-site-continuity-live-status-last-result-'));
  const syncEntrypoint = join(root, 'packages/cloudflare-carrier/scripts/cloudflare-site-continuity-sync.mjs');
  const scheduledTaskEntrypoint = join(root, 'packages/cloudflare-carrier/scripts/cloudflare-site-continuity-scheduled-task.mjs');
  const packetPath = join(root, '.narada/site-continuity/local-packet.json');
  await mkdir(join(root, 'packages/cloudflare-carrier/scripts'), { recursive: true });
  await mkdir(join(root, '.narada/site-continuity'), { recursive: true });
  await writeFile(syncEntrypoint, '#!/usr/bin/env node\n', 'utf8');
  await writeFile(scheduledTaskEntrypoint, '#!/usr/bin/env node\n', 'utf8');
  await writeFile(packetPath, '{"packet":{"site_id":"site_fixture"}}\n', 'utf8');
  await writePlannedSiteContinuityHiddenWrapper({ repoRoot: root });
  try {
    const result = await runSiteContinuitySchedulerActionWithOptionalRefresh({
      action: 'status',
      repoRoot: root,
      intervalMinutes: 5,
      siteId: 'site_fixture',
      packetPath,
      dryRun: false,
    }, {
      execFileImpl: async () => ({
        stdout: [
          'TaskName: \\Narada\\CloudflareSiteContinuitySync',
          'Status: Ready',
          'Last Result: 1',
          `Task To Run: wscript.exe //B "${join(root, '.narada/site-continuity/cloudflare-site-continuity-sync.hidden.vbs')}"`,
          'Scheduled Task State: Enabled',
          'Repeat: Every: 0 Hour(s), 5 Minute(s)',
        ].join('\n'),
        stderr: '',
      }),
    });

    assert.equal(result.scheduler_task_readback.status, 'needs_attention');
    assert.equal(result.scheduler_task_readback.last_result, '1');
    assert.equal(result.scheduler_task_readback.cadence_status, 'matches_plan');
    assert.equal(result.scheduler_task_readback.task_command_status, 'matches_plan');
    assert.deepEqual(result.scheduler_task_readback.attention_reasons, ['scheduler_last_result_nonzero']);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('site continuity scheduler live status accepts Windows running task result as healthy', async () => {
  const root = await mkdtemp(join(tmpdir(), 'narada-site-continuity-live-status-running-'));
  const syncEntrypoint = join(root, 'packages/cloudflare-carrier/scripts/cloudflare-site-continuity-sync.mjs');
  const scheduledTaskEntrypoint = join(root, 'packages/cloudflare-carrier/scripts/cloudflare-site-continuity-scheduled-task.mjs');
  const packetPath = join(root, '.narada/site-continuity/local-packet.json');
  await mkdir(join(root, 'packages/cloudflare-carrier/scripts'), { recursive: true });
  await mkdir(join(root, '.narada/site-continuity'), { recursive: true });
  await writeFile(syncEntrypoint, '#!/usr/bin/env node\n', 'utf8');
  await writeFile(scheduledTaskEntrypoint, '#!/usr/bin/env node\n', 'utf8');
  await writeFile(packetPath, '{"packet":{"site_id":"site_fixture"}}\n', 'utf8');
  await writePlannedSiteContinuityHiddenWrapper({ repoRoot: root });
  try {
    const result = await runSiteContinuitySchedulerActionWithOptionalRefresh({
      action: 'status',
      repoRoot: root,
      intervalMinutes: 5,
      siteId: 'site_fixture',
      packetPath,
      dryRun: false,
    }, {
      execFileImpl: async () => ({
        stdout: [
          'TaskName: \\Narada\\CloudflareSiteContinuitySync',
          'Status: Running',
          'Last Result: 267009',
          `Task To Run: wscript.exe //B "${join(root, '.narada/site-continuity/cloudflare-site-continuity-sync.hidden.vbs')}"`,
          'Scheduled Task State: Enabled',
          'Repeat: Every: 0 Hour(s), 5 Minute(s)',
        ].join('\n'),
        stderr: '',
      }),
    });

    assert.equal(result.scheduler_task_readback.status, 'ok');
    assert.equal(result.scheduler_task_readback.status_text, 'Running');
    assert.equal(result.scheduler_task_readback.last_result, '267009');
    assert.deepEqual(result.scheduler_task_readback.attention_reasons, []);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('site continuity scheduler status-all distinguishes configured sites missing local artifacts', async () => {
  const root = await mkdtemp(join(tmpdir(), 'narada-site-continuity-configured-status-'));
  const artifactDirectory = join(root, '.narada/site-continuity');
  const outputPath = join(artifactDirectory, 'cloudflare-sync-last.json');
  const sitesFilePath = join(root, '.narada/site-continuity/sites.json');
  const siteRegistryProjectionPath = join(root, '.narada/site-registry/cloudflare-sites.json');
  await mkdir(artifactDirectory, { recursive: true });
  await mkdir(join(root, '.narada/site-registry'), { recursive: true });
  await writeFile(join(root, '.env'), 'CLOUDFLARE_CARRIER_SITE_ID=site_env\nCLOUDFLARE_CARRIER_TOKEN=secret-not-read\n', 'utf8');
  await writeFile(sitesFilePath, `${JSON.stringify({ sites: [{ site_id: 'site_file' }] }, null, 2)}\n`, 'utf8');
  await writeFile(siteRegistryProjectionPath, `${JSON.stringify({
    schema: 'narada.cloudflare_site_registry.snapshot.v1',
    sites: [
      { site_id: 'site_registry', display_name: 'Registry Site', status: 'active' },
      { site_id: 'site_registry_inactive', status: 'inactive' },
    ],
    token: 'registry-secret-not-read',
  }, null, 2)}\n`, 'utf8');
  await writeFile(outputPath, `${JSON.stringify({
    schema: 'narada.site_continuity_cloudflare_sync_once.v1',
    status: 'ok',
    site_id: 'site_synced',
    worker_url: 'https://worker.example',
    pushed_packet_id: 'packet-synced-local',
    pulled_packet_id: 'packet-synced-cloudflare',
    continuity_loop_report_recorded: true,
    continuity_loop_report: {
      status: 'ok',
      site_id: 'site_synced',
      generated_at: '2026-06-11T10:30:00.000Z',
      cloudflare_push: {
        status: 'imported',
        pushed_packet_id: 'packet-synced-local',
        returned_packet_id: 'packet-synced-cloudflare',
      },
    },
  }, null, 2)}\n`, 'utf8');
  await writeInboundPacketArtifact(artifactDirectory, 'site_synced', { generatedAt: '2026-06-11T10:30:00.000Z' });
  try {
    const configured = readLocalConfiguredSites({
      root,
      explicitSites: 'site_synced,site_missing,site_registry',
      sitesFilePath,
      siteRegistryProjectionPath,
    });
    assert.equal(configured.state, 'configured');
    assert.deepEqual(configured.sources, ['explicit_sites', 'sites_file', 'cloudflare_site_registry_local_projection', 'safe_env_file_site_keys']);
    assert.equal(configured.selection_source, 'explicit_sites');
    assert.deepEqual(configured.sites, ['site_missing', 'site_registry', 'site_synced']);
    assert.equal(configured.site_registry_projection.state, 'read');
    assert.deepEqual(configured.site_records.find((site) => site.site_id === 'site_registry'), {
      site_id: 'site_registry',
      display_name: 'Registry Site',
      site_ref: null,
      site_status: 'active',
    });
    assert.doesNotMatch(JSON.stringify(configured), /secret-not-read/);
    assert.doesNotMatch(JSON.stringify(configured), /registry-secret-not-read/);

    const plan = buildSiteContinuitySchedulerPlan({
      action: 'status-all',
      repoRoot: root,
      outputPath,
      artifactDirectory,
      configuredSites: 'site_synced,site_missing,site_registry',
      sitesFilePath,
      siteRegistryProjectionPath,
      now: () => '2026-06-11T10:31:00.000Z',
    });
    assert.equal(plan.configured_sites.site_count, 3);
    assert.equal(plan.configured_sites.selection_source, 'explicit_sites');
    assert.equal(plan.status.site_configured, true);
    assert.equal(plan.local_sync_artifacts.status, 'needs_attention');
    assert.equal(plan.local_sync_artifacts.max_sync_artifact_age_minutes, 15);
    assert.deepEqual(plan.local_sync_artifacts.configured_site_sync_statuses.map((site) => [site.site_id, site.status, site.reason]), [
      ['site_missing', 'needs_attention', 'configured_site_sync_artifact_missing'],
      ['site_registry', 'needs_attention', 'configured_site_sync_artifact_missing'],
      ['site_synced', 'synced', 'matching_sync_artifact_synced'],
    ]);
    assert.deepEqual(plan.local_sync_artifacts.configured_site_sync_statuses.find((site) => site.site_id === 'site_registry'), {
      site_id: 'site_registry',
      display_name: 'Registry Site',
      site_ref: null,
      site_status: 'active',
      status: 'needs_attention',
      reason: 'configured_site_sync_artifact_missing',
      artifact_present: false,
    });
    assert.equal(plan.local_inbound_packets.status, 'needs_attention');
    assert.deepEqual(plan.local_inbound_packets.configured_site_inbound_statuses.map((site) => [site.site_id, site.status, site.reason]), [
      ['site_missing', 'needs_attention', 'configured_site_inbound_packet_missing'],
      ['site_registry', 'needs_attention', 'configured_site_inbound_packet_missing'],
      ['site_synced', 'synced', 'matching_inbound_packet_observed'],
    ]);
    assert.doesNotMatch(JSON.stringify(plan), /secret-not-read/);
    assert.doesNotMatch(JSON.stringify(plan), /registry-secret-not-read/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('site continuity scheduler uses binding registry as managed site set before discovery registry', async () => {
  const root = await mkdtemp(join(tmpdir(), 'narada-site-continuity-binding-registry-'));
  const artifactDirectory = join(root, '.narada/site-continuity');
  const bindingRegistryPath = join(artifactDirectory, 'bindings.json');
  const siteRegistryProjectionPath = join(root, '.narada/site-registry/cloudflare-sites.json');
  await mkdir(artifactDirectory, { recursive: true });
  await mkdir(join(root, '.narada/site-registry'), { recursive: true });
  await writeFile(bindingRegistryPath, `${JSON.stringify(createSiteContinuityBindingRegistry({
    registry_ref: 'file:.narada/site-continuity/bindings.json',
    generated_at: '2026-06-11T13:30:00.000Z',
    bindings: [createSiteContinuityBinding({
      site_id: 'site_bound',
      cloudflare_site_ref: 'cloudflare://site-bound',
    })],
  }), null, 2)}\n`, 'utf8');
  await writeFile(siteRegistryProjectionPath, `${JSON.stringify({
    schema: 'narada.cloudflare_site_registry.snapshot.v1',
    sites: [
      { site_id: 'site_bound', display_name: 'Bound Site From Registry', site_ref: 'cloudflare://site-bound', status: 'active' },
      { site_id: 'site_discovered', display_name: 'Discovered Only Site', site_ref: 'cloudflare://site-discovered', status: 'active' },
    ],
  }, null, 2)}\n`, 'utf8');
  try {
    const plan = buildSiteContinuitySchedulerPlan({
      action: 'status-all',
      repoRoot: root,
      artifactDirectory,
      siteContinuityBindingRegistryPath: bindingRegistryPath,
      siteRegistryProjectionPath,
    });
    assert.equal(plan.configured_sites.selection_source, 'site_continuity_binding_registry');
    assert.deepEqual(plan.configured_sites.sites, ['site_bound']);
    assert.equal(plan.configured_sites.site_count, 1);
    assert.equal(plan.configured_sites.site_continuity_binding_registry.state, 'read');
    assert.equal(plan.configured_sites.site_registry_projection.site_count, 2);
    assert.deepEqual(plan.local_sync_artifacts.configured_site_sync_statuses.map((site) => site.site_id), ['site_bound']);
    assert.equal(plan.local_sync_artifacts.configured_site_sync_statuses[0].display_name, 'Bound Site From Registry');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('site continuity scheduler status-all inventories local sync artifacts', async () => {
  const root = await mkdtemp(join(tmpdir(), 'narada-site-continuity-status-all-'));
  const artifactDirectory = join(root, '.narada/site-continuity');
  const outputPath = join(artifactDirectory, 'cloudflare-sync-last.json');
  await mkdir(artifactDirectory, { recursive: true });
  await writeFile(outputPath, `${JSON.stringify({
    schema: 'narada.site_continuity_cloudflare_sync_once.v1',
    status: 'ok',
    site_id: 'site_alpha',
    worker_url: 'https://worker.example',
    pushed_packet_id: 'packet-alpha-local',
    pulled_packet_id: 'packet-alpha-cloudflare',
    continuity_loop_report_recorded: true,
    continuity_loop_report: {
      status: 'ok',
      site_id: 'site_alpha',
      generated_at: '2026-06-11T10:00:00.000Z',
      cloudflare_push: {
        status: 'imported',
        pushed_packet_id: 'packet-alpha-local',
        returned_packet_id: 'packet-alpha-cloudflare',
        durability_action: 'inserted_new_packet',
        imported_at: '2026-06-11T10:00:00.000Z',
      },
    },
  }, null, 2)}\n`, 'utf8');
  await writeFile(join(artifactDirectory, 'site-beta-sync.json'), `${JSON.stringify({
    schema: 'narada.site_continuity_cloudflare_sync_once.v1',
    status: 'failed',
    site_id: 'site_beta',
    worker_url: 'https://worker.example',
    continuity_loop_report: {
      status: 'failed',
      site_id: 'site_beta',
      generated_at: '2026-06-11T09:00:00.000Z',
    },
  }, null, 2)}\n`, 'utf8');
  await writeFile(join(artifactDirectory, 'notes.txt'), 'ignored\n', 'utf8');
  try {
    const inventory = readLocalSyncArtifactInventory(artifactDirectory, { lastOutputPath: outputPath });
    assert.equal(inventory.state, 'read');
    assert.equal(inventory.status, 'needs_attention');
    assert.equal(inventory.artifact_count, 2);
    assert.equal(inventory.last_sync.status, 'synced');
    assert.deepEqual(inventory.artifacts.map((artifact) => artifact.site_id), ['site_alpha', 'site_beta']);
    assert.deepEqual(inventory.artifacts.map((artifact) => artifact.status), ['synced', 'needs_attention']);

    const plan = buildSiteContinuitySchedulerPlan({
      action: 'status-all',
      repoRoot: root,
      outputPath,
      artifactDirectory,
    });
    assert.equal(plan.plan_status, 'local_sync_artifact_inventory_read_only_no_cloudflare_access');
    assert.equal(plan.local_sync_artifacts.artifact_count, 2);
    assert.equal(plan.local_sync_artifacts.status, 'needs_attention');
    assert.equal(plan.embeds_credentials, false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('site continuity scheduler reads the last scheduled health snapshot separately from sync artifacts', async () => {
  const root = await mkdtemp(join(tmpdir(), 'narada-site-continuity-health-last-'));
  const healthOutputPath = join(root, '.narada/site-continuity/health/cloudflare-continuity-health-last.json');
  await mkdir(join(root, '.narada/site-continuity/health'), { recursive: true });
  await writeFile(healthOutputPath, `${JSON.stringify({
    schema: 'narada.cloudflare_carrier.site_continuity_scheduled_health_snapshot.v1',
    status: 'ok',
    generated_at: '2026-06-11T14:05:52.209Z',
    persisted_at: '2026-06-11T14:05:52.210Z',
    trigger: 'windows_task_scheduler',
    embeds_credentials: false,
    reconciliation_execution: {
      status: 'completed',
      reconciliation_plan_status: 'ready',
      selected_site_count: 1,
      executed_site_count: 1,
      completed_site_count: 1,
      failed_site_count: 0,
    },
    continuity_health: {
      status: 'ok',
      attention_reasons: [],
    },
    scheduler_task_readback: {
      status: 'ok',
      status_text: 'Running',
      last_result: '267009',
      next_run_time: '6/11/2026 9:12:00 AM',
    },
  }, null, 2)}\n`, 'utf8');
  await utimes(healthOutputPath, new Date('2026-06-11T14:05:52.210Z'), new Date('2026-06-11T14:05:52.210Z'));
  try {
    const lastHealth = readLastScheduledHealthSnapshot(healthOutputPath);
    assert.equal(lastHealth.state, 'read');
    assert.equal(lastHealth.status, 'ok');
    assert.equal(lastHealth.trigger, 'windows_task_scheduler');
    assert.equal(lastHealth.embeds_credentials, false);
    assert.equal(lastHealth.reconciliation_execution_status, 'completed');
    assert.equal(lastHealth.selected_site_count, 1);
    assert.equal(lastHealth.completed_site_count, 1);
    assert.equal(lastHealth.continuity_health_status, 'ok');
    assert.deepEqual(lastHealth.continuity_health_attention_reasons, []);
    assert.equal(lastHealth.scheduler_task_readback_status, 'ok');
    assert.equal(lastHealth.scheduler_task_status_text, 'Running');
    assert.equal(lastHealth.scheduler_last_result, '267009');
    assert.doesNotMatch(JSON.stringify(lastHealth), /secret-token-value|CLOUDFLARE_CARRIER_TOKEN=/);

    const plan = buildSiteContinuitySchedulerPlan({
      action: 'read-health-last',
      repoRoot: root,
      healthOutputPath,
    });
    assert.equal(plan.plan_status, 'last_scheduled_health_snapshot_read_only_no_cloudflare_access');
    assert.equal(plan.last_scheduled_health.status, 'ok');
    assert.equal(plan.last_scheduled_health.artifact_path, healthOutputPath);
    assert.equal(plan.embeds_credentials, false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('site continuity scheduler status-all marks stale configured site artifacts', async () => {
  const root = await mkdtemp(join(tmpdir(), 'narada-site-continuity-stale-artifact-'));
  const artifactDirectory = join(root, '.narada/site-continuity');
  const outputPath = join(artifactDirectory, 'cloudflare-sync-last.json');
  await mkdir(artifactDirectory, { recursive: true });
  await writeFile(outputPath, `${JSON.stringify({
    schema: 'narada.site_continuity_cloudflare_sync_once.v1',
    status: 'ok',
    site_id: 'site_stale',
    worker_url: 'https://worker.example',
    pushed_packet_id: 'packet-stale-local',
    pulled_packet_id: 'packet-stale-cloudflare',
    continuity_loop_report_recorded: true,
    continuity_loop_report: {
      status: 'ok',
      site_id: 'site_stale',
      generated_at: '2026-06-11T10:00:00.000Z',
      cloudflare_push: {
        status: 'imported',
        pushed_packet_id: 'packet-stale-local',
        returned_packet_id: 'packet-stale-cloudflare',
      },
    },
  }, null, 2)}\n`, 'utf8');
  await utimes(outputPath, new Date('2026-06-11T10:00:00.000Z'), new Date('2026-06-11T10:00:00.000Z'));
  try {
    const inventory = readLocalSyncArtifactInventory(artifactDirectory, {
      lastOutputPath: outputPath,
      configuredSites: [{ site_id: 'site_stale', display_name: 'Stale Site', site_ref: 'site-ref:stale', status: 'active' }],
      maxArtifactAgeMinutes: 15,
      now: () => '2026-06-11T10:20:00.000Z',
    });
    assert.equal(inventory.status, 'needs_attention');
    assert.equal(inventory.max_sync_artifact_age_minutes, 15);
    assert.deepEqual(inventory.configured_site_sync_statuses, [{
      site_id: 'site_stale',
      display_name: 'Stale Site',
      site_ref: 'site-ref:stale',
      site_status: 'active',
      status: 'needs_attention',
      reason: 'configured_site_sync_artifact_stale',
      artifact_present: true,
      artifact_path: outputPath,
      artifact_updated_at: '2026-06-11T10:00:00.000Z',
      artifact_age_minutes: 20,
      max_sync_artifact_age_minutes: 15,
      pushed_packet_id: 'packet-stale-local',
      pulled_packet_id: 'packet-stale-cloudflare',
    }]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('site continuity health accepts fresh no-op reconciliation over stale local packet mtimes', async () => {
  const root = await mkdtemp(join(tmpdir(), 'narada-site-continuity-noop-reconcile-'));
  const artifactDirectory = join(root, '.narada/site-continuity');
  const inboundDirectory = join(artifactDirectory, 'inbound');
  const outputPath = join(artifactDirectory, 'site_fresh-cloudflare-sync.json');
  const reconciliationExecutionOutputPath = join(artifactDirectory, 'reconciliation/cloudflare-reconcile-last.json');
  const bindingRegistryPath = join(artifactDirectory, 'bindings.json');
  await mkdir(dirname(reconciliationExecutionOutputPath), { recursive: true });
  await mkdir(inboundDirectory, { recursive: true });
  await writeFile(bindingRegistryPath, `${JSON.stringify(createSiteContinuityBindingRegistry({
    registry_ref: 'file:.narada/site-continuity/bindings.json',
    bindings: [
      createSiteContinuityBinding({
        site_id: 'site_fresh',
        site_ref: 'site-ref:fresh',
        cloudflare_site_ref: 'cloudflare://site_fresh',
        local_site_ref: 'file:///tmp/site_fresh',
        site_status: 'active',
      }),
    ],
  }), null, 2)}\n`, 'utf8');
  await writeFile(outputPath, `${JSON.stringify({
    schema: 'narada.site_continuity_cloudflare_sync_once.v1',
    status: 'ok',
    site_id: 'site_fresh',
    worker_url: 'https://worker.example',
    pushed_packet_id: 'packet-fresh-local',
    pulled_packet_id: 'packet-fresh-cloudflare',
    cloudflare_push_status: 'imported',
    continuity_loop_report_recorded: true,
    generated_at: '2026-06-11T10:00:00.000Z',
    continuity_loop_report: {
      status: 'ok',
      site_id: 'site_fresh',
      generated_at: '2026-06-11T10:00:00.000Z',
      cloudflare_worker_url: 'https://worker.example',
      cloudflare_push: {
        status: 'imported',
        pushed_packet_id: 'packet-fresh-local',
        returned_packet_id: 'packet-fresh-cloudflare',
      },
    },
    cloudflare_push: {
      status: 'imported',
      pushed_packet_id: 'packet-fresh-local',
      returned_packet_id: 'packet-fresh-cloudflare',
    },
  }, null, 2)}\n`, 'utf8');
  await writeInboundPacketArtifact(artifactDirectory, 'site_fresh', {
    packetId: 'packet-fresh-cloudflare',
    generatedAt: '2026-06-11T10:00:00.000Z',
  });
  const staleDate = new Date(Date.now() - 20 * 60 * 1000);
  await utimes(outputPath, staleDate, staleDate);
  const inboundFile = join(inboundDirectory, readdirSync(inboundDirectory)[0]);
  await utimes(inboundFile, staleDate, staleDate);
  await writeFile(reconciliationExecutionOutputPath, `${JSON.stringify({
    schema: 'narada.cloudflare_carrier.site_continuity_reconciliation_execution.v1',
    status: 'completed',
    generated_at: new Date().toISOString(),
    persisted_at: new Date().toISOString(),
    reconciliation_plan_status: 'synced',
    selected_site_count: 0,
    executed_site_count: 0,
    completed_site_count: 0,
    failed_site_count: 0,
    refusal_reason: null,
    cloudflare_mutation_admission: 'not_executed_already_synced',
    filesystem_mutation_admission: 'reconciliation_execution_artifact_write_only',
    results: [],
  }, null, 2)}\n`, 'utf8');
  try {
    const plan = buildSiteContinuitySchedulerPlan({
      action: 'health',
      repoRoot: root,
      artifactDirectory,
      localInboundDirectory: inboundDirectory,
      outputPath,
      reconciliationExecutionOutputPath,
      siteContinuityBindingRegistryPath: bindingRegistryPath,
      configuredSites: [{ site_id: 'site_fresh', display_name: 'Fresh Site', site_ref: 'site-ref:fresh', status: 'active' }],
      maxArtifactAgeMinutes: 15,
    });
    assert.equal(plan.local_sync_artifacts.status, 'needs_attention');
    assert.equal(plan.local_inbound_packets.status, 'needs_attention');
    assert.equal(plan.last_reconciliation_execution.status, 'completed');
    assert.equal(plan.last_reconciliation_execution.reconciliation_plan_status, 'synced');
    assert.equal(plan.continuity_health.status, 'needs_attention');
    assert.doesNotMatch(JSON.stringify(plan.continuity_health.attention_reasons), /local_(sync|inbound)_needs_attention/);
    assert.equal(plan.continuity_health.local_sync_status, 'synced');
    assert.equal(plan.continuity_health.local_inbound_status, 'synced');
    assert.equal(plan.continuity_health.local_artifact_freshness_source, 'fresh_completed_noop_reconciliation_execution');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('site continuity scheduler reconcile plans stale and missing configured site sync commands only', async () => {
  const root = await mkdtemp(join(tmpdir(), 'narada-site-continuity-reconcile-plan-'));
  const artifactDirectory = join(root, '.narada/site-continuity');
  const packetPath = join(root, '.narada/site-continuity/local-packet.json');
  const syncEntrypoint = join(root, 'packages/cloudflare-carrier/scripts/cloudflare-site-continuity-sync.mjs');
  const staleArtifactPath = join(artifactDirectory, 'site-stale-sync.json');
  const syncedArtifactPath = join(artifactDirectory, 'site-synced-sync.json');
  await mkdir(artifactDirectory, { recursive: true });
  await mkdir(join(root, 'packages/cloudflare-carrier/scripts'), { recursive: true });
  await writeFile(syncEntrypoint, '#!/usr/bin/env node\n', 'utf8');
  await writeFile(packetPath, '{"packet":{"site_id":"site_stale"}}\n', 'utf8');
  await writeFile(staleArtifactPath, `${JSON.stringify({
    schema: 'narada.site_continuity_cloudflare_sync_once.v1',
    status: 'ok',
    site_id: 'site_stale',
    pushed_packet_id: 'packet-stale-local',
    pulled_packet_id: 'packet-stale-cloudflare',
    continuity_loop_report_recorded: true,
    continuity_loop_report: {
      status: 'ok',
      site_id: 'site_stale',
      generated_at: '2026-06-11T10:00:00.000Z',
    },
  }, null, 2)}\n`, 'utf8');
  await writeFile(syncedArtifactPath, `${JSON.stringify({
    schema: 'narada.site_continuity_cloudflare_sync_once.v1',
    status: 'ok',
    site_id: 'site_synced',
    pushed_packet_id: 'packet-synced-local',
    pulled_packet_id: 'packet-synced-cloudflare',
    continuity_loop_report_recorded: true,
    continuity_loop_report: {
      status: 'ok',
      site_id: 'site_synced',
      generated_at: '2026-06-11T10:19:00.000Z',
    },
  }, null, 2)}\n`, 'utf8');
  await utimes(staleArtifactPath, new Date('2026-06-11T10:00:00.000Z'), new Date('2026-06-11T10:00:00.000Z'));
  await utimes(syncedArtifactPath, new Date('2026-06-11T10:19:00.000Z'), new Date('2026-06-11T10:19:00.000Z'));
  try {
    const plan = buildSiteContinuitySchedulerPlan({
      action: 'reconcile',
      repoRoot: root,
      syncEntrypoint,
      packetPath,
      artifactDirectory,
      configuredSites: 'site_stale,site_synced,site_missing',
      maxArtifactAgeMinutes: 15,
      now: () => '2026-06-11T10:20:00.000Z',
    });

    assert.equal(plan.plan_status, 'site_continuity_reconciliation_plan_read_only_no_cloudflare_access');
    assert.equal(plan.reconciliation_plan.schema, 'narada.cloudflare_carrier.site_continuity_reconciliation_plan.v1');
    assert.equal(plan.reconciliation_plan.read_only, true);
    assert.equal(plan.reconciliation_plan.executes_cloudflare_mutation, false);
    assert.equal(plan.reconciliation_plan.writes_local_artifacts, false);
    assert.equal(plan.reconciliation_plan.cloudflare_mutation_admission, 'not_executed_plan_only');
    assert.equal(plan.reconciliation_plan.filesystem_mutation_admission, 'not_executed_plan_only');
    assert.equal(plan.reconciliation_plan.status, 'needs_configuration');
    assert.equal(plan.reconciliation_plan.selected_site_count, 2);
    assert.equal(plan.reconciliation_plan.command_ready_count, 1);
    assert.equal(plan.reconciliation_plan.packet_summary.site_id, 'site_stale');
    assert.deepEqual(plan.reconciliation_plan.selected_reason_counts, {
      configured_site_sync_artifact_missing: 1,
      configured_site_sync_artifact_stale: 1,
    });
    assert.deepEqual(plan.reconciliation_plan.selected_sites.map((site) => [site.site_id, site.reason]), [
      ['site_missing', 'configured_site_sync_artifact_missing'],
      ['site_stale', 'configured_site_sync_artifact_stale'],
    ]);
    assert.equal(plan.reconciliation_plan.selected_sites.some((site) => site.site_id === 'site_synced'), false);
    const staleSite = plan.reconciliation_plan.selected_sites.find((site) => site.site_id === 'site_stale');
    const missingSite = plan.reconciliation_plan.selected_sites.find((site) => site.site_id === 'site_missing');
    assert.equal(staleSite.command_status, 'ready');
    assert.deepEqual(staleSite.command_blockers, []);
    assert.match(staleSite.sync_command, /cloudflare-site-continuity-sync\.mjs/);
    assert.match(staleSite.sync_command, /sync-once/);
    assert.match(staleSite.sync_command, /--site/);
    assert.match(staleSite.sync_command, /site_stale/);
    assert.match(staleSite.sync_command, /--packet/);
    assert.match(staleSite.sync_command, /local-packet\.json/);
    assert.match(staleSite.sync_command, /--out/);
    assert.equal(staleSite.output_path, join(artifactDirectory, 'site_stale-cloudflare-sync.json'));
    assert.equal(missingSite.command_status, 'needs_configuration');
    assert.deepEqual(missingSite.command_blockers, ['packet_site_id_mismatch']);
    assert.equal(missingSite.packet_site_id, 'site_stale');
    assert.equal(missingSite.sync_command, null);
    assert.doesNotMatch(JSON.stringify(plan), /secret|token/i);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('site continuity reconciliation plan reports configuration blockers instead of synthesizing commands', () => {
  const plan = buildSiteContinuityReconciliationPlan({
    localSyncArtifacts: {
      configured_site_sync_statuses: [{
        site_id: 'site_missing_packet',
        status: 'needs_attention',
        reason: 'configured_site_sync_artifact_missing',
        artifact_present: false,
      }],
    },
    syncEntryPoint: 'D:/repo/packages/cloudflare-carrier/scripts/cloudflare-site-continuity-sync.mjs',
    artifactDirectory: 'D:/repo/.narada/site-continuity',
    packetPath: null,
  });

  assert.equal(plan.status, 'needs_configuration');
  assert.equal(plan.read_only, true);
  assert.equal(plan.executes_cloudflare_mutation, false);
  assert.equal(plan.writes_local_artifacts, false);
  assert.equal(plan.selected_site_count, 1);
  assert.equal(plan.command_ready_count, 0);
  assert.equal(plan.selected_sites[0].command_status, 'needs_configuration');
  assert.deepEqual(plan.selected_sites[0].command_blockers, ['packet_path_required']);
  assert.equal(plan.selected_sites[0].sync_command, null);
});

test('site continuity reconciliation plan refuses packet site mismatch before sync command synthesis', async () => {
  const root = await mkdtemp(join(tmpdir(), 'narada-site-continuity-reconcile-packet-site-'));
  const artifactDirectory = join(root, '.narada/site-continuity');
  const packetPath = join(root, '.narada/site-continuity-packets/local-packet.json');
  const syncEntrypoint = join(root, 'packages/cloudflare-carrier/scripts/cloudflare-site-continuity-sync.mjs');
  await mkdir(artifactDirectory, { recursive: true });
  await mkdir(join(root, '.narada/site-continuity-packets'), { recursive: true });
  await mkdir(join(root, 'packages/cloudflare-carrier/scripts'), { recursive: true });
  await writeFile(packetPath, '{"packet":{"site_id":"site_packet","packet_id":"packet-site-packet"}}\n', 'utf8');
  await writeFile(syncEntrypoint, '#!/usr/bin/env node\n', 'utf8');
  try {
    const plan = buildSiteContinuitySchedulerPlan({
      action: 'reconcile',
      repoRoot: root,
      syncEntrypoint,
      packetPath,
      artifactDirectory,
      configuredSites: 'site_other,site_packet',
    });

    assert.equal(plan.reconciliation_plan.status, 'needs_configuration');
    assert.equal(plan.reconciliation_plan.selected_site_count, 2);
    assert.equal(plan.reconciliation_plan.command_ready_count, 1);
    assert.equal(plan.reconciliation_plan.packet_summary.state, 'read');
    assert.equal(plan.reconciliation_plan.packet_summary.site_id, 'site_packet');
    const packetSite = plan.reconciliation_plan.selected_sites.find((site) => site.site_id === 'site_packet');
    const otherSite = plan.reconciliation_plan.selected_sites.find((site) => site.site_id === 'site_other');
    assert.equal(packetSite.command_status, 'ready');
    assert.deepEqual(packetSite.command_blockers, []);
    assert.match(packetSite.sync_command, /--site "site_packet"/);
    assert.equal(otherSite.command_status, 'needs_configuration');
    assert.deepEqual(otherSite.command_blockers, ['packet_site_id_mismatch']);
    assert.equal(otherSite.packet_site_id, 'site_packet');
    assert.equal(otherSite.sync_command, null);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('site continuity reconcile-execute defaults to dry-run refusal without executing sync', async () => {
  const root = await mkdtemp(join(tmpdir(), 'narada-site-continuity-reconcile-dry-run-'));
  const artifactDirectory = join(root, '.narada/site-continuity');
  const packetPath = join(root, '.narada/site-continuity/local-packet.json');
  const syncEntrypoint = join(root, 'packages/cloudflare-carrier/scripts/cloudflare-site-continuity-sync.mjs');
  await mkdir(artifactDirectory, { recursive: true });
  await mkdir(join(root, 'packages/cloudflare-carrier/scripts'), { recursive: true });
  await writeFile(packetPath, '{"packet":{"site_id":"site_missing"}}\n', 'utf8');
  await writeFile(syncEntrypoint, '#!/usr/bin/env node\n', 'utf8');
  try {
    let executedSync = false;
    const result = await runSiteContinuitySchedulerActionWithOptionalRefresh({
      action: 'reconcile-execute',
      repoRoot: root,
      syncEntrypoint,
      packetPath,
      artifactDirectory,
      configuredSites: 'site_missing',
    }, {
      execFileImpl: async (command) => { if (command === process.execPath) executedSync = true; },
    });

    assert.equal(result.schema, 'narada.cloudflare_carrier.site_continuity_reconciliation_execution.v1');
    assert.equal(result.status, 'dry_run');
    assert.equal(result.dry_run, true);
    assert.equal(result.refusal_reason, 'reconcile_execute_requires_live_flag');
    assert.equal(result.cloudflare_mutation_admission, 'not_executed_dry_run');
    assert.equal(result.filesystem_mutation_admission, 'not_executed_dry_run');
    assert.equal(result.selected_site_count, 1);
    assert.equal(executedSync, false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('site continuity reconcile-execute treats already synced plans as successful no-op', async () => {
  const root = await mkdtemp(join(tmpdir(), 'narada-site-continuity-reconcile-execute-synced-'));
  const artifactDirectory = join(root, '.narada/site-continuity');
  const outputPath = join(artifactDirectory, 'site_synced-cloudflare-sync.json');
  const reconciliationExecutionOutputPath = join(root, '.narada/site-continuity/reconciliation/cloudflare-reconcile-last.json');
  const packetPath = join(root, '.narada/site-continuity-packets/local-packet.json');
  const syncEntrypoint = join(root, 'packages/cloudflare-carrier/scripts/cloudflare-site-continuity-sync.mjs');
  await mkdir(artifactDirectory, { recursive: true });
  await mkdir(join(root, '.narada/site-continuity-packets'), { recursive: true });
  await mkdir(join(root, 'packages/cloudflare-carrier/scripts'), { recursive: true });
  await writeFile(packetPath, '{"packet":{"site_id":"site_synced"}}\n', 'utf8');
  await writeFile(syncEntrypoint, '#!/usr/bin/env node\n', 'utf8');
  await writeFile(outputPath, `${JSON.stringify({
    schema: 'narada.site_continuity_cloudflare_sync_once.v1',
    status: 'ok',
    site_id: 'site_synced',
    worker_url: 'https://worker.example',
    pushed_packet_id: 'packet-local',
    pulled_packet_id: 'packet-cloudflare',
    continuity_loop_report_recorded: true,
    continuity_loop_report: {
      status: 'ok',
      site_id: 'site_synced',
      generated_at: '2026-06-11T12:00:00.000Z',
    },
  }, null, 2)}\n`, 'utf8');
  try {
    const calls = [];
    const result = await runSiteContinuitySchedulerActionWithOptionalRefresh({
      action: 'reconcile-execute',
      repoRoot: root,
      syncEntrypoint,
      packetPath,
      artifactDirectory,
      reconciliationExecutionOutputPath,
      configuredSites: 'site_synced',
      dryRun: false,
      now: () => '2026-06-11T12:05:00.000Z',
    }, {
      execFileImpl: async (command, args, options) => {
        calls.push({ command, args, options });
      },
    });

    assert.equal(result.status, 'completed');
    assert.equal(result.reconciliation_plan_status, 'synced');
    assert.equal(result.cloudflare_mutation_admission, 'not_executed_already_synced');
    assert.equal(result.executed_site_count, 0);
    assert.equal(result.cloudflare_reconciliation_execution_evidence.reason, 'reconciliation_plan_already_synced');
    assert.equal(calls.length, 1);
    assert.equal(calls[0].command, 'schtasks');

    const executionSummary = readLastReconciliationExecutionArtifact(reconciliationExecutionOutputPath);
    assert.equal(executionSummary.state, 'read');
    assert.equal(executionSummary.status, 'completed');
    assert.equal(executionSummary.cloudflare_reconciliation_execution_evidence_state, 'skipped');
    assert.equal(executionSummary.cloudflare_reconciliation_execution_evidence_status, 'not_recorded');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('site continuity scheduled health reports remote product next-site outside local binding set', async () => {
  const root = await mkdtemp(join(tmpdir(), 'narada-site-continuity-remote-unbound-next-site-'));
  const artifactDirectory = join(root, '.narada/site-continuity');
  const bindingRegistryPath = join(artifactDirectory, 'bindings.json');
  const packetPath = join(root, '.narada/site-continuity/site_alpha-packet.json');
  const outputPath = join(artifactDirectory, 'site_alpha-cloudflare-sync.json');
  const reconciliationExecutionOutputPath = join(root, '.narada/site-continuity/reconciliation/cloudflare-reconcile-last.json');
  const healthOutputPath = join(root, '.narada/site-continuity/health/cloudflare-continuity-health-last.json');
  const syncEntrypoint = join(root, 'packages/cloudflare-carrier/scripts/cloudflare-site-continuity-sync.mjs');
  const scheduledTaskEntrypoint = join(root, 'packages/cloudflare-carrier/scripts/cloudflare-site-continuity-scheduled-task.mjs');
  await mkdir(artifactDirectory, { recursive: true });
  await mkdir(join(root, '.narada/site-continuity'), { recursive: true });
  await mkdir(join(root, 'packages/cloudflare-carrier/scripts'), { recursive: true });
  await writeFile(syncEntrypoint, '#!/usr/bin/env node\n', 'utf8');
  await writeFile(scheduledTaskEntrypoint, '#!/usr/bin/env node\n', 'utf8');
  await writeFile(packetPath, '{"packet":{"site_id":"site_alpha"}}\n', 'utf8');
  await writeFile(bindingRegistryPath, `${JSON.stringify(createSiteContinuityBindingRegistry({
    registry_ref: 'file:.narada/site-continuity/bindings.json',
    generated_at: '2026-06-11T14:58:00.000Z',
    bindings: [createSiteContinuityBinding({ site_id: 'site_alpha', cloudflare_site_ref: 'cloudflare://site-alpha' })],
  }), null, 2)}\n`, 'utf8');
  await writeFile(outputPath, `${JSON.stringify({
    schema: 'narada.site_continuity_cloudflare_sync_once.v1',
    status: 'ok',
    site_id: 'site_alpha',
    worker_url: 'https://worker.example',
    pushed_packet_id: 'packet-alpha-local',
    pulled_packet_id: 'packet-alpha-cloudflare',
    continuity_loop_report_recorded: true,
    continuity_loop_report: {
      status: 'ok',
      site_id: 'site_alpha',
      generated_at: '2026-06-11T14:55:00.000Z',
    },
  }, null, 2)}\n`, 'utf8');
  await writeInboundPacketArtifact(artifactDirectory, 'site_alpha', { generatedAt: '2026-06-11T14:55:00.000Z' });
  await writePlannedSiteContinuityHiddenWrapper({
    action: 'health',
    repoRoot: root,
    syncEntrypoint,
    scheduledTaskEntrypoint,
    packetPath,
    outputPath,
    artifactDirectory,
    siteContinuityBindingRegistryPath: bindingRegistryPath,
    reconciliationExecutionOutputPath,
    healthOutputPath,
    configuredSites: 'site_alpha',
    now: () => '2026-06-11T15:00:00.000Z',
  });
  try {
    const productReadCalls = [];
    const result = await runSiteContinuitySchedulerActionWithOptionalRefresh({
      action: 'reconcile-execute',
      repoRoot: root,
      syncEntrypoint,
      scheduledTaskEntrypoint,
      packetPath,
      outputPath,
      artifactDirectory,
      siteContinuityBindingRegistryPath: bindingRegistryPath,
      reconciliationExecutionOutputPath,
      healthOutputPath,
      configuredSites: 'site_alpha',
      dryRun: false,
      executionTimeoutMs: 5000,
      now: () => '2026-06-11T15:00:00.000Z',
    }, {
      env: {
        CLOUDFLARE_CARRIER_URL: 'https://worker.example',
        CLOUDFLARE_CARRIER_TOKEN: 'secret-token-value',
      },
      execFileImpl: async (command) => {
        if (command === 'schtasks') {
          return {
            stdout: [
              'TaskName: \\Narada\\CloudflareSiteContinuitySync',
              'Status: Ready',
              'Last Result: 0',
              `Task To Run: wscript.exe //B "${join(root, '.narada/site-continuity/cloudflare-site-continuity-sync.hidden.vbs')}"`,
              'Scheduled Task State: Enabled',
              'Repeat: Every: 0 Hour(s), 5 Minute(s)',
            ].join('\n'),
            stderr: '',
          };
        }
        throw new Error(`unexpected_command:${command}`);
      },
      productReadSurface: async (config) => {
        productReadCalls.push(config);
        assert.equal(config.auth.kind, 'bearer');
        assert.equal(config.auth.value, 'secret-token-value');
        if (config.operation === 'operation.list') {
          assert.deepEqual(config.params, { site_id: 'site_beta' });
          return {
            summary: {
              operation: 'operation.list',
              site_id: 'site_beta',
              operation_count: 0,
              active_operation_id: null,
              next_operation_id: null,
              next_status: null,
              next_action: null,
              next_reason: null,
              health_counts: { ready: 0, needs_attention: 0 },
            },
            response: {
              operation_posture_overview: {
                schema: 'narada.cloudflare_operation_posture_overview.v1',
                operation_count: 0,
                health_counts: { ready: 0, needs_attention: 0 },
              },
            },
          };
        }
        assert.equal(config.operation, 'site.list');
        return {
          summary: {
            operation: 'site.list',
            site_count: 2,
            next_site_id: 'site_beta',
            next_health: 'attention',
            next_action: 'publish_cloudflare_continuity_packet',
            health_counts: { ready: 1, attention: 1, incomplete: 0, other: 0 },
          },
          response: {
            site_product_overview: {
              schema: 'narada.cloudflare_site_product_overview.v1',
              site_count: 2,
              health_counts: { ready: 1, attention: 1, incomplete: 0, other: 0 },
              next_site_id: 'site_beta',
              next_health: 'attention',
              next_action: 'publish_cloudflare_continuity_packet',
              next_reason: 'continuity_direction',
            },
          },
        };
      },
    });

    assert.equal(result.status, 'completed');
    assert.equal(result.reconciliation_plan_status, 'synced');
    assert.equal(productReadCalls.length, 2);
    assert.equal(result.scheduled_health_snapshot.status, 'needs_attention');
    assert.equal(result.scheduled_health_snapshot.continuity_health.status, 'ok');
    assert.equal(result.scheduled_health_snapshot.cloudflare_product_binding_alignment.state, 'unbound_remote_next_site');
    assert.equal(result.scheduled_health_snapshot.cloudflare_product_binding_alignment.status, 'needs_attention');
    assert.equal(result.scheduled_health_snapshot.cloudflare_product_binding_alignment.reason, 'cloudflare_product_next_site_not_in_local_continuity_set');
    assert.deepEqual(result.scheduled_health_snapshot.cloudflare_product_binding_alignment.local_site_ids, ['site_alpha']);
    assert.equal(result.scheduled_health_snapshot.cloudflare_product_binding_preparation.state, 'blocked_missing_refs');
    assert.equal(result.scheduled_health_snapshot.cloudflare_product_binding_preparation.status, 'needs_attention');
    assert.equal(result.scheduled_health_snapshot.cloudflare_product_binding_preparation.reason, 'site_continuity_binding_refs_missing');
    assert.deepEqual(result.scheduled_health_snapshot.cloudflare_product_binding_preparation.required_inputs, ['local_site_ref', 'cloudflare_site_ref']);

    const healthSnapshot = JSON.parse(await readFile(healthOutputPath, 'utf8'));
    assert.equal(healthSnapshot.status, 'needs_attention');
    assert.equal(healthSnapshot.cloudflare_product_binding_alignment.cloudflare_product_next_site_id, 'site_beta');
    assert.equal(healthSnapshot.cloudflare_product_binding_preparation.target_site_id, 'site_beta');
    assert.equal(healthSnapshot.cloudflare_product_binding_preparation.embeds_credentials, false);
    assert.doesNotMatch(JSON.stringify(healthSnapshot), /secret-token-value/);

    const healthSummary = readLastScheduledHealthSnapshot(healthOutputPath);
    assert.equal(healthSummary.status, 'needs_attention');
    assert.equal(healthSummary.cloudflare_product_binding_alignment_state, 'unbound_remote_next_site');
    assert.equal(healthSummary.cloudflare_product_binding_alignment_status, 'needs_attention');
    assert.equal(healthSummary.cloudflare_product_binding_alignment_reason, 'cloudflare_product_next_site_not_in_local_continuity_set');
    assert.equal(healthSummary.cloudflare_product_binding_preparation_state, 'blocked_missing_refs');
    assert.equal(healthSummary.cloudflare_product_binding_preparation_status, 'needs_attention');
    assert.equal(healthSummary.cloudflare_product_binding_preparation_reason, 'site_continuity_binding_refs_missing');
    assert.deepEqual(healthSummary.cloudflare_product_binding_preparation_required_inputs, ['local_site_ref', 'cloudflare_site_ref']);
    assert.equal(healthSummary.operator_next_action, 'bind_cloudflare_product_next_site_locally');
    assert.equal(healthSummary.operator_next_target_site_id, 'site_beta');
    assert.equal(healthSummary.operator_next_reason, 'cloudflare_product_next_site_not_in_local_continuity_set');
    assert.equal(healthSummary.operator_next_source, 'cloudflare_product_binding_alignment');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('site continuity reconcile-execute refuses not-ready plans before sync execution', async () => {
  const root = await mkdtemp(join(tmpdir(), 'narada-site-continuity-reconcile-not-ready-'));
  const artifactDirectory = join(root, '.narada/site-continuity');
  const reconciliationExecutionOutputPath = join(root, '.narada/site-continuity/reconciliation/cloudflare-reconcile-last.json');
  await mkdir(artifactDirectory, { recursive: true });
  try {
    let executedSync = false;
    const result = await runSiteContinuitySchedulerActionWithOptionalRefresh({
      action: 'reconcile-execute',
      repoRoot: root,
      artifactDirectory,
      reconciliationExecutionOutputPath,
      configuredSites: 'site_missing_packet',
      dryRun: false,
      now: () => '2026-06-11T12:30:00.000Z',
    }, {
      execFileImpl: async (command) => { if (command === process.execPath) executedSync = true; },
    });

    assert.equal(result.status, 'refused');
    assert.equal(result.dry_run, false);
    assert.equal(result.refusal_reason, 'reconciliation_plan_not_ready');
    assert.deepEqual(result.command_blockers, ['packet_path_required']);
    assert.deepEqual(result.results, [{
      site_id: 'site_missing_packet',
      status: 'refused',
      reason: 'site_sync_command_not_ready',
      command_status: 'needs_configuration',
      command_blockers: ['packet_path_required'],
    }]);
    assert.equal(executedSync, false);
    assert.equal(result.filesystem_mutation_admission, 'reconciliation_execution_artifact_write_only');
    assert.equal(result.reconciliation_execution_artifact.state, 'written');

    const executionSummary = readLastReconciliationExecutionArtifact(reconciliationExecutionOutputPath);
    assert.equal(executionSummary.state, 'read');
    assert.equal(executionSummary.status, 'refused');
    assert.equal(executionSummary.refusal_reason, 'reconciliation_plan_not_ready');
    assert.deepEqual(executionSummary.result_status_counts, { refused: 1 });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('site continuity reconcile-execute uses per-site packet paths from packet directory', async () => {
  const root = await mkdtemp(join(tmpdir(), 'narada-site-continuity-reconcile-execute-packet-dir-'));
  const artifactDirectory = join(root, '.narada/site-continuity');
  const bindingRegistryPath = join(artifactDirectory, 'bindings.json');
  const packetDirectory = join(root, '.narada/site-continuity-packets');
  const reconciliationExecutionOutputPath = join(root, '.narada/site-continuity/reconciliation/cloudflare-reconcile-last.json');
  const healthOutputPath = join(root, '.narada/site-continuity/health/cloudflare-continuity-health-last.json');
  const syncEntrypoint = join(root, 'packages/cloudflare-carrier/scripts/cloudflare-site-continuity-sync.mjs');
  const scheduledTaskEntrypoint = join(root, 'packages/cloudflare-carrier/scripts/cloudflare-site-continuity-scheduled-task.mjs');
  await mkdir(artifactDirectory, { recursive: true });
  await mkdir(packetDirectory, { recursive: true });
  await mkdir(join(root, 'packages/cloudflare-carrier/scripts'), { recursive: true });
  await writeFile(syncEntrypoint, '#!/usr/bin/env node\n', 'utf8');
  await writeFile(scheduledTaskEntrypoint, '#!/usr/bin/env node\n', 'utf8');
  await writeFile(bindingRegistryPath, `${JSON.stringify(createSiteContinuityBindingRegistry({
    registry_ref: 'file:.narada/site-continuity/bindings.json',
    generated_at: '2026-06-11T12:45:00.000Z',
    bindings: [
      createSiteContinuityBinding({ site_id: 'site_alpha', cloudflare_site_ref: 'cloudflare://site-alpha' }),
      createSiteContinuityBinding({ site_id: 'site_beta', cloudflare_site_ref: 'cloudflare://site-beta' }),
    ],
  }), null, 2)}\n`, 'utf8');
  await writeFile(join(packetDirectory, 'site_alpha-packet.json'), '{"packet":{"site_id":"site_alpha"}}\n', 'utf8');
  await writeFile(join(packetDirectory, 'site_beta-packet.json'), '{"packet":{"site_id":"site_beta"}}\n', 'utf8');
  await writePlannedSiteContinuityHiddenWrapper({
    action: 'health',
    repoRoot: root,
    syncEntrypoint,
    scheduledTaskEntrypoint,
    packetDirectory,
    artifactDirectory,
    siteContinuityBindingRegistryPath: bindingRegistryPath,
    reconciliationExecutionOutputPath,
    healthOutputPath,
    configuredSites: 'site_alpha,site_beta',
    now: () => '2026-06-11T12:45:00.000Z',
  });
  try {
    const calls = [];
    const result = await runSiteContinuitySchedulerActionWithOptionalRefresh({
      action: 'reconcile-execute',
      repoRoot: root,
      syncEntrypoint,
      scheduledTaskEntrypoint,
      packetDirectory,
      artifactDirectory,
      siteContinuityBindingRegistryPath: bindingRegistryPath,
      reconciliationExecutionOutputPath,
      healthOutputPath,
      configuredSites: 'site_alpha,site_beta',
      dryRun: false,
      executionTimeoutMs: 5000,
      now: () => '2026-06-11T12:45:00.000Z',
    }, {
      execFileImpl: async (command, args, options) => {
        calls.push({ command, args, options });
        if (command === 'schtasks') {
          return {
            stdout: [
              'TaskName: \\Narada\\CloudflareSiteContinuitySync',
              'Status: Ready',
              'Last Result: 0',
              `Task To Run: wscript.exe //B "${join(root, '.narada/site-continuity/cloudflare-site-continuity-sync.hidden.vbs')}"`,
              'Scheduled Task State: Enabled',
              'Repeat: Every: 0 Hour(s), 5 Minute(s)',
            ].join('\n'),
            stderr: '',
          };
        }
        if (args[1] !== 'sync-once') return;
        const outIndex = args.indexOf('--out');
        const siteIndex = args.indexOf('--site');
        const localInboundDirIndex = args.indexOf('--local-inbound-dir');
        const siteId = args[siteIndex + 1];
        await writeFile(args[outIndex + 1], `${JSON.stringify({
          schema: 'narada.site_continuity_cloudflare_sync_once.v1',
          status: 'ok',
          site_id: siteId,
          pushed_packet_id: `packet-${siteId}-local`,
          pulled_packet_id: `packet-${siteId}-cloudflare`,
          continuity_loop_report_recorded: true,
          continuity_loop_report: {
            status: 'ok',
            site_id: siteId,
            generated_at: '2026-06-11T12:45:00.000Z',
          },
        }, null, 2)}\n`, 'utf8');
        if (localInboundDirIndex >= 0) {
          await writeInboundPacketArtifact(join(args[localInboundDirIndex + 1], '..'), siteId, {
            packetId: `packet-${siteId}-cloudflare`,
            generatedAt: '2026-06-11T12:45:00.000Z',
          });
        }
      },
    });
    const syncCalls = calls.filter((call) => call.command === process.execPath && call.args[1] === 'sync-once');
    assert.equal(result.status, 'completed');
    assert.equal(result.executed_site_count, 2);
    assert.equal(result.completed_site_count, 2);
    assert.equal(result.failed_site_count, 0);
    assert.equal(syncCalls.length, 2);
    assert.deepEqual(syncCalls.map((call) => [
      call.args[call.args.indexOf('--site') + 1],
      call.args[call.args.indexOf('--packet') + 1],
      call.args[call.args.indexOf('--out') + 1],
    ]), [
      ['site_alpha', join(packetDirectory, 'site_alpha-packet.json'), join(artifactDirectory, 'site_alpha-cloudflare-sync.json')],
      ['site_beta', join(packetDirectory, 'site_beta-packet.json'), join(artifactDirectory, 'site_beta-cloudflare-sync.json')],
    ]);
    assert.equal(result.scheduled_health_snapshot.status, 'ok');
    assert.doesNotMatch(JSON.stringify(result), /secret-token-value|CLOUDFLARE_CARRIER_TOKEN=/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('site continuity reconcile-execute runs ready sites through sync-once argv and records artifacts', async () => {
  const root = await mkdtemp(join(tmpdir(), 'narada-site-continuity-reconcile-execute-'));
  const artifactDirectory = join(root, '.narada/site-continuity');
  const bindingRegistryPath = join(artifactDirectory, 'bindings.json');
  const reconciliationExecutionOutputPath = join(root, '.narada/site-continuity/reconciliation/cloudflare-reconcile-last.json');
  const healthOutputPath = join(root, '.narada/site-continuity/health/cloudflare-continuity-health-last.json');
  const packetPath = join(root, '.narada/site-continuity-packets/local-packet.json');
  const syncEntrypoint = join(root, 'packages/cloudflare-carrier/scripts/cloudflare-site-continuity-sync.mjs');
  const scheduledTaskEntrypoint = join(root, 'packages/cloudflare-carrier/scripts/cloudflare-site-continuity-scheduled-task.mjs');
  await mkdir(artifactDirectory, { recursive: true });
  await mkdir(join(root, '.narada/site-continuity-packets'), { recursive: true });
  await mkdir(join(root, 'packages/cloudflare-carrier/scripts'), { recursive: true });
  await writeFile(packetPath, '{"packet":{"site_id":"site_missing"}}\n', 'utf8');
  await writeFile(syncEntrypoint, '#!/usr/bin/env node\n', 'utf8');
  await writeFile(scheduledTaskEntrypoint, '#!/usr/bin/env node\n', 'utf8');
  await writeFile(bindingRegistryPath, `${JSON.stringify(createSiteContinuityBindingRegistry({
    registry_ref: 'file:.narada/site-continuity/bindings.json',
    generated_at: '2026-06-11T12:00:00.000Z',
    bindings: [createSiteContinuityBinding({
      site_id: 'site_missing',
      cloudflare_site_ref: 'cloudflare://site-missing',
    })],
  }), null, 2)}\n`, 'utf8');
  await writePlannedSiteContinuityHiddenWrapper({
    action: 'health',
    repoRoot: root,
    syncEntrypoint,
    scheduledTaskEntrypoint,
    packetPath,
    artifactDirectory,
    reconciliationExecutionOutputPath,
    healthOutputPath,
    siteContinuityBindingRegistryPath: bindingRegistryPath,
    configuredSites: 'site_missing',
    now: () => '2026-06-11T12:30:00.000Z',
  });
  try {
    const calls = [];
    const productReadCalls = [];
    const result = await runSiteContinuitySchedulerActionWithOptionalRefresh({
      action: 'reconcile-execute',
      repoRoot: root,
      syncEntrypoint,
      packetPath,
      artifactDirectory,
      reconciliationExecutionOutputPath,
      healthOutputPath,
      scheduledTaskEntrypoint,
      siteContinuityBindingRegistryPath: bindingRegistryPath,
      configuredSites: 'site_missing',
      dryRun: false,
      executionTimeoutMs: 5000,
      now: () => '2026-06-11T12:30:00.000Z',
    }, {
      env: {
        CLOUDFLARE_CARRIER_URL: 'https://worker.example',
        CLOUDFLARE_CARRIER_TOKEN: 'secret-token-value',
      },
      execFileImpl: async (command, args, options) => {
        calls.push({ command, args, options });
        if (command === 'schtasks') {
          return {
            stdout: [
              'TaskName: \\Narada\\CloudflareSiteContinuitySync',
              'Status: Ready',
              'Last Result: 0',
              `Task To Run: wscript.exe //B "${join(root, '.narada/site-continuity/cloudflare-site-continuity-sync.hidden.vbs')}"`,
              'Scheduled Task State: Enabled',
              'Repeat: Every: 0 Hour(s), 5 Minute(s)',
            ].join('\n'),
            stderr: '',
          };
        }
        if (args[1] !== 'sync-once') return;
        const outIndex = args.indexOf('--out');
        const siteIndex = args.indexOf('--site');
        const localInboundDirIndex = args.indexOf('--local-inbound-dir');
        const siteId = args[siteIndex + 1];
        await writeFile(args[outIndex + 1], `${JSON.stringify({
          schema: 'narada.site_continuity_cloudflare_sync_once.v1',
          status: 'ok',
          site_id: siteId,
          worker_url: 'https://worker.example',
          pushed_packet_id: 'packet-local',
          pulled_packet_id: 'packet-cloudflare',
          continuity_loop_report_recorded: true,
          continuity_loop_report: {
            status: 'ok',
            site_id: siteId,
            generated_at: '2026-06-11T12:00:00.000Z',
          },
        }, null, 2)}\n`, 'utf8');
        if (localInboundDirIndex >= 0) {
          await writeInboundPacketArtifact(join(args[localInboundDirIndex + 1], '..'), siteId, {
            packetId: 'packet-cloudflare',
            generatedAt: '2026-06-11T12:30:00.000Z',
          });
        }
      },
      productReadSurface: async (config) => {
        productReadCalls.push(config);
        assert.equal(config.workerUrl, 'https://worker.example');
        assert.equal(config.auth.kind, 'bearer');
        assert.equal(config.auth.value, 'secret-token-value');
        if (config.operation === 'operation.list') {
          assert.deepEqual(config.params, { site_id: 'site_missing' });
          return {
            summary: {
              operation: 'operation.list',
              site_id: 'site_missing',
              operation_count: 1,
              active_operation_id: null,
              next_operation_id: 'carrier_operation_next',
              next_status: 'ready',
              next_action: 'start_operation',
              next_reason: 'operation_ready',
              health_counts: { ready: 1, needs_attention: 0 },
            },
            response: {
              operation_posture_overview: {
                schema: 'narada.cloudflare_operation_posture_overview.v1',
                operation_count: 1,
                active_operation_id: null,
                next_operation_id: 'carrier_operation_next',
                next_status: 'ready',
                next_action: 'start_operation',
                next_reason: 'operation_ready',
                health_counts: { ready: 1, needs_attention: 0 },
              },
              operation_posture_route: {
                schema: 'narada.cloudflare_operation_posture_route.v1',
                command_state: 'operation_ready',
                next_action: 'start_operation',
                target: 'carrier_operation_next',
              },
            },
          };
        }
        assert.equal(config.operation, 'site.list');
        return {
          summary: {
            operation: 'site.list',
            site_count: 1,
            next_site_id: 'site_missing',
            next_health: 'ready',
            next_action: 'monitor_sites',
            health_counts: { ready: 1, attention: 0, incomplete: 0, other: 0 },
          },
          response: {
            site_product_overview: {
              schema: 'narada.cloudflare_site_product_overview.v1',
              site_count: 1,
              health_counts: { ready: 1, attention: 0, incomplete: 0, other: 0 },
              next_site_id: 'site_missing',
              next_health: 'ready',
              next_action: 'monitor_sites',
            },
            site_posture_route: {
              schema: 'narada.cloudflare_site_posture_route.v1',
              command_state: 'site_posture_ready',
              next_action: 'monitor_sites',
              target: 'site_missing',
            },
          },
        };
      },
    });

    assert.equal(result.status, 'completed');
    assert.equal(result.dry_run, false);
    assert.equal(result.cloudflare_mutation_admission, 'executed_via_guarded_site_continuity_sync_once_and_records_reconciliation_execution_evidence');
    assert.equal(result.filesystem_mutation_admission, 'sync_once_inbound_packet_and_reconciliation_execution_artifact_write_only');
    assert.equal(result.executed_site_count, 1);
    assert.equal(result.completed_site_count, 1);
    assert.equal(result.failed_site_count, 0);
    assert.equal(calls.length, 3);
    assert.equal(productReadCalls.length, 2);
    assert.equal(productReadCalls[0].operation, 'site.list');
    assert.equal(productReadCalls[1].operation, 'operation.list');
    assert.equal(calls[0].command, process.execPath);
    assert.deepEqual(calls[0].args.slice(0, 6), [syncEntrypoint, 'sync-once', '--site', 'site_missing', '--packet', packetPath]);
    assert.equal(calls[0].args[6], '--out');
    assert.equal(calls[0].args[7], join(artifactDirectory, 'site_missing-cloudflare-sync.json'));
    assert.equal(calls[0].args[8], '--local-inbound-dir');
    assert.equal(calls[0].args[9], join(artifactDirectory, 'inbound'));
    assert.equal(calls[0].options.cwd, root);
    assert.equal(calls[0].options.timeout, 5000);
    assert.equal(calls[1].command, process.execPath);
    assert.deepEqual(calls[1].args, [syncEntrypoint, 'reconciliation-execution-put', '--site', 'site_missing', '--execution', reconciliationExecutionOutputPath]);
    assert.equal(calls[1].options.cwd, root);
    assert.equal(calls[1].options.timeout, 5000);
    assert.equal(calls[2].command, 'schtasks');
    assert.deepEqual(calls[2].args.slice(0, 3), ['/Query', '/TN', '\\Narada\\CloudflareSiteContinuitySync']);
    assert.equal(result.cloudflare_reconciliation_execution_evidence.state, 'recorded');
    assert.equal(result.cloudflare_reconciliation_execution_evidence.recorded_count, 1);
    assert.equal(result.results[0].status, 'completed');
    assert.equal(result.results[0].output_summary.status, 'synced');
    assert.equal(result.results[0].output_summary.site_id, 'site_missing');
    assert.equal(result.reconciliation_execution_artifact.state, 'written');
    assert.equal(result.scheduled_health_snapshot.status, 'ok');
    assert.equal(result.scheduled_health_snapshot.cloudflare_product_posture.state, 'loaded');
    assert.equal(result.scheduled_health_snapshot.cloudflare_product_posture.status, 'ok');
    assert.equal(result.scheduled_health_snapshot.cloudflare_product_posture.auth_kind, 'bearer');
    assert.equal(result.scheduled_health_snapshot.cloudflare_product_posture.auth_source, 'env:CLOUDFLARE_CARRIER_TOKEN');
    assert.equal(result.scheduled_health_snapshot.cloudflare_product_posture.summary.next_site_id, 'site_missing');
    assert.equal(result.scheduled_health_snapshot.cloudflare_product_posture.site_product_overview.site_count, 1);
    assert.equal(result.scheduled_health_snapshot.cloudflare_product_binding_alignment.state, 'aligned');
    assert.equal(result.scheduled_health_snapshot.cloudflare_product_binding_alignment.status, 'ok');
    assert.equal(result.scheduled_health_snapshot.cloudflare_product_binding_alignment.reason, 'cloudflare_product_next_site_in_local_continuity_set');
    assert.equal(result.scheduled_health_snapshot.cloudflare_product_binding_preparation.state, 'not_required');
    assert.equal(result.scheduled_health_snapshot.cloudflare_product_binding_preparation.status, 'ok');
    assert.equal(result.scheduled_health_snapshot.cloudflare_operation_posture.state, 'loaded');
    assert.equal(result.scheduled_health_snapshot.cloudflare_operation_posture.status, 'ok');
    assert.equal(result.scheduled_health_snapshot.cloudflare_operation_posture.auth_kind, 'bearer');
    assert.equal(result.scheduled_health_snapshot.cloudflare_operation_posture.auth_source, 'env:CLOUDFLARE_CARRIER_TOKEN');
    assert.equal(result.scheduled_health_snapshot.cloudflare_operation_posture.summary.next_operation_id, 'carrier_operation_next');
    assert.equal(result.scheduled_health_snapshot.health_snapshot_artifact.state, 'written');
    assert.equal(result.scheduled_health_snapshot.health_snapshot_artifact.artifact_path, healthOutputPath);

    const executionSummary = readLastReconciliationExecutionArtifact(reconciliationExecutionOutputPath);
    assert.equal(executionSummary.state, 'read');
    assert.equal(executionSummary.status, 'completed');
    assert.equal(executionSummary.persisted_at, '2026-06-11T12:30:00.000Z');
    assert.equal(executionSummary.completed_site_count, 1);
    assert.equal(executionSummary.cloudflare_reconciliation_execution_evidence_state, 'recorded');
    assert.equal(executionSummary.cloudflare_reconciliation_execution_evidence_status, 'recorded');
    assert.equal(executionSummary.cloudflare_reconciliation_execution_recorded_count, 1);
    assert.equal(executionSummary.cloudflare_reconciliation_execution_failed_count, 0);
    assert.deepEqual(executionSummary.result_status_counts, { completed: 1 });

    const healthSnapshot = JSON.parse(await readFile(healthOutputPath, 'utf8'));
    assert.equal(healthSnapshot.schema, 'narada.cloudflare_carrier.site_continuity_scheduled_health_snapshot.v1');
    assert.equal(healthSnapshot.status, 'ok');
    assert.equal(healthSnapshot.reconciliation_execution.status, 'completed');
    assert.equal(healthSnapshot.continuity_health.status, 'ok');
    assert.equal(healthSnapshot.cloudflare_product_posture.state, 'loaded');
    assert.equal(healthSnapshot.cloudflare_product_posture.auth_kind, 'bearer');
    assert.equal(healthSnapshot.cloudflare_product_posture.auth_source, 'env:CLOUDFLARE_CARRIER_TOKEN');
    assert.equal(healthSnapshot.cloudflare_product_posture.summary.next_action, 'monitor_sites');
    assert.equal(healthSnapshot.cloudflare_product_binding_alignment.state, 'aligned');
    assert.equal(healthSnapshot.cloudflare_product_binding_preparation.reason, 'cloudflare_product_binding_preparation_not_required');
    assert.equal(healthSnapshot.cloudflare_operation_posture.state, 'loaded');
    assert.equal(healthSnapshot.cloudflare_operation_posture.auth_kind, 'bearer');
    assert.equal(healthSnapshot.cloudflare_operation_posture.auth_source, 'env:CLOUDFLARE_CARRIER_TOKEN');
    assert.equal(healthSnapshot.cloudflare_operation_posture.summary.next_action, 'start_operation');
    assert.equal(healthSnapshot.scheduler_task_readback.status, 'ok');
    assert.equal(healthSnapshot.embeds_credentials, false);
    assert.doesNotMatch(JSON.stringify(healthSnapshot), /secret-token-value|CLOUDFLARE_CARRIER_TOKEN=|narada_operator_session=session-fixture/);

    const healthSummary = readLastScheduledHealthSnapshot(healthOutputPath);
    assert.equal(healthSummary.cloudflare_product_posture_state, 'loaded');
    assert.equal(healthSummary.cloudflare_product_posture_status, 'ok');
    assert.equal(healthSummary.cloudflare_product_auth_kind, 'bearer');
    assert.equal(healthSummary.cloudflare_product_auth_source, 'env:CLOUDFLARE_CARRIER_TOKEN');
    assert.equal(healthSummary.cloudflare_product_next_site_id, 'site_missing');
    assert.equal(healthSummary.cloudflare_product_next_action, 'monitor_sites');
    assert.equal(healthSummary.cloudflare_product_binding_alignment_state, 'aligned');
    assert.equal(healthSummary.cloudflare_product_binding_alignment_status, 'ok');
    assert.equal(healthSummary.cloudflare_product_binding_alignment_reason, 'cloudflare_product_next_site_in_local_continuity_set');
    assert.equal(healthSummary.cloudflare_operation_posture_state, 'loaded');
    assert.equal(healthSummary.cloudflare_operation_posture_status, 'ok');
    assert.equal(healthSummary.cloudflare_operation_auth_kind, 'bearer');
    assert.equal(healthSummary.cloudflare_operation_auth_source, 'env:CLOUDFLARE_CARRIER_TOKEN');
    assert.equal(healthSummary.cloudflare_operation_next_operation_id, 'carrier_operation_next');
    assert.equal(healthSummary.cloudflare_operation_next_action, 'start_operation');

    const statusPlan = buildSiteContinuitySchedulerPlan({
      action: 'status-all',
      repoRoot: root,
      outputPath: join(artifactDirectory, 'site_missing-cloudflare-sync.json'),
      artifactDirectory,
      reconciliationExecutionOutputPath,
      configuredSites: 'site_missing',
    });
    assert.equal(statusPlan.local_sync_artifacts.artifact_count, 1);
    assert.equal(statusPlan.last_reconciliation_execution.status, 'completed');
    assert.deepEqual(statusPlan.last_reconciliation_execution.result_status_counts, { completed: 1 });
    assert.doesNotMatch(JSON.stringify(result), /secret-token-value/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('site continuity scheduler can refresh site registry projection before status-all', async () => {
  const root = await mkdtemp(join(tmpdir(), 'narada-site-continuity-refresh-projection-'));
  const artifactDirectory = join(root, '.narada/site-continuity');
  const siteRegistryProjectionPath = join(root, '.narada/site-registry/cloudflare-sites.json');
  await mkdir(artifactDirectory, { recursive: true });
  await mkdir(join(root, '.narada/site-registry'), { recursive: true });
  await writeFile(join(root, '.env'), 'CLOUDFLARE_CARRIER_URL=https://worker.example\nCLOUDFLARE_CARRIER_TOKEN=secret-refresh-token\n', 'utf8');
  try {
    const plan = await buildSiteContinuitySchedulerPlanWithOptionalRefresh({
      action: 'status-all',
      repoRoot: root,
      artifactDirectory,
      siteRegistryProjectionPath,
      refreshSiteRegistryProjection: true,
    }, {
      env: {},
      materializeSiteRegistryProjection: async (inputs) => {
        assert.equal(inputs.workerUrl, 'https://worker.example');
        assert.equal(inputs.bearerToken.value, 'secret-refresh-token');
        assert.equal(inputs.bearerToken.source, 'env:CLOUDFLARE_CARRIER_TOKEN');
        assert.equal(inputs.outputPath, siteRegistryProjectionPath);
        await writeFile(siteRegistryProjectionPath, `${JSON.stringify({
          schema: 'narada.cloudflare_site_registry.snapshot.v1',
          generated_at: '2026-06-11T11:00:00.000Z',
          source: 'cloudflare_carrier_site_list',
          source_operation: 'site.list',
          worker_url: inputs.workerUrl,
          site_count: 1,
          sites: [{ site_id: 'site_refreshed', status: 'active' }],
          embeds_credentials: false,
        }, null, 2)}\n`, 'utf8');
        return {
          schema: 'narada.cloudflare_site_registry.local_projection_materialization.v1',
          status: 'ok',
          worker_url: inputs.workerUrl,
          token_source: inputs.bearerToken.source,
          output_path: inputs.outputPath,
          written: true,
          embeds_credentials: false,
          projection: { site_count: 1, generated_at: '2026-06-11T11:00:00.000Z' },
        };
      },
    });

    assert.equal(plan.plan_status, 'local_sync_artifact_inventory_read_only_no_cloudflare_access');
    assert.equal(plan.site_registry_projection_refresh.status, 'ok');
    assert.equal(plan.site_registry_projection_refresh.site_count, 1);
    assert.equal(plan.configured_sites.site_registry_projection.state, 'read');
    assert.deepEqual(plan.configured_sites.sites, ['site_refreshed']);
    assert.deepEqual(plan.local_sync_artifacts.configured_site_sync_statuses.map((site) => [site.site_id, site.reason]), [
      ['site_refreshed', 'configured_site_sync_artifact_missing'],
    ]);
    assert.doesNotMatch(JSON.stringify(plan), /secret-refresh-token/);
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
  assert.equal(body.scheduled_task_command.includes('/V'), true);
});

test('site continuity scheduler CLI emits operator text status when requested', async () => {
  const result = await execFile(process.execPath, [SCRIPT_PATH, '--action', 'status', '--format', 'text'], { timeout: 30000, windowsHide: true });

  assert.match(result.stdout, /^Site Continuity\n/);
  assert.match(result.stdout, /Action: status/);
  assert.match(result.stdout, /Plan: status_only_no_cloudflare_access/);
  assert.doesNotMatch(result.stdout, /^\{/);
});

test('site continuity scheduler CLI loads local continuity env for operator health readback', async () => {
  const root = await mkdtemp(join(tmpdir(), 'narada-site-continuity-cli-env-'));
  const packetPath = join(root, '.narada/site-continuity/local-packet.json');
  const outputPath = join(root, '.narada/site-continuity/cloudflare-sync-last.json');
  const reconciliationExecutionOutputPath = join(root, '.narada/site-continuity/reconciliation/cloudflare-reconcile-last.json');
  await mkdir(join(root, '.narada/site-continuity/reconciliation'), { recursive: true });
  await writeFile(packetPath, '{"packet":{"site_id":"site_fixture"}}\n', 'utf8');
  await writeFile(join(root, '.env'), 'CLOUDFLARE_CARRIER_URL=https://worker.example\nCLOUDFLARE_CARRIER_TOKEN_FILE=.secrets/token\n', 'utf8');
  await writeFile(join(root, '.narada/site-continuity/cloudflare-continuity.env'), [
    'NARADA_SITE_CONTINUITY_PACKET=.narada/site-continuity/local-packet.json',
    'NARADA_SITE_CONTINUITY_SITES=site_fixture',
    'NARADA_SITE_CONTINUITY_SYNC_OUT=.narada/site-continuity/cloudflare-sync-last.json',
    'NARADA_SITE_CONTINUITY_RECONCILE_EXECUTION_OUT=.narada/site-continuity/reconciliation/cloudflare-reconcile-last.json',
    '',
  ].join('\n'), 'utf8');
  try {
    const result = await execFile(process.execPath, [SCRIPT_PATH, '--action', 'status-all', '--repo-root', root], { timeout: 30000, windowsHide: true });
    const body = JSON.parse(result.stdout);

    assert.equal(body.packet_path, packetPath);
    assert.equal(body.output_path, outputPath);
    assert.equal(body.reconciliation_execution_output_path, reconciliationExecutionOutputPath);
    assert.deepEqual(body.configured_sites.sites, ['site_fixture']);
    assert.equal(body.status.packet_path_exists, true);
    assert.equal(body.status.packet_configured, true);
    assert.equal(body.status.site_configured, true);
    assert.deepEqual(body.status.required_env_keys_observed, ['CLOUDFLARE_CARRIER_URL', 'CLOUDFLARE_CARRIER_TOKEN_FILE']);
    assert.doesNotMatch(JSON.stringify(body), /\.secrets\/token|secret-token-value/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
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
