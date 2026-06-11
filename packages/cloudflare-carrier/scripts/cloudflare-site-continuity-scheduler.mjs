#!/usr/bin/env node
import { execFile as execFileCallback } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { readCloudflareSiteRegistryLocalProjection } from '@narada2/cloudflare-site-registry/local-projection';
import {
  SITE_CONTINUITY_EMBODIMENT_KINDS,
  listSiteContinuityBindingSites,
  validateSiteContinuityBindingRegistry,
} from '@narada2/site-continuity';
import {
  materializeCloudflareSiteRegistryProjection,
  resolveCloudflareSiteRegistryProjectionInputs,
} from './cloudflare-carrier-site-registry-projection.mjs';
import {
  readProductSurface,
  resolveAuth as resolveProductReadAuth,
} from './cloudflare-carrier-product-read.mjs';

const DEFAULT_TASK_NAME = '\\Narada\\CloudflareSiteContinuitySync';
const DEFAULT_INTERVAL_MINUTES = 5;
const DEFAULT_MAX_SYNC_ARTIFACT_AGE_MINUTES = 15;
const DEFAULT_RECONCILE_EXECUTION_TIMEOUT_MS = 120000;
const DEFAULT_HIDDEN_WRAPPER_RELATIVE_PATH = '.narada/site-continuity/cloudflare-site-continuity-sync.hidden.vbs';
const LIVE_SCHEDULER_TASK_ACTIONS = new Set(['install', 'disable', 'pause', 'resume', 'uninstall']);
const LIVE_SCHEDULER_READ_ACTIONS = new Set(['status', 'read-last', 'last', 'read-health-last', 'health-last', 'status-all', 'status-local', 'health', 'reconcile', 'reconcile-plan']);
const execFile = promisify(execFileCallback);

export function buildSiteContinuitySchedulerPlan({
  action = 'status',
  repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..'),
  taskName = DEFAULT_TASK_NAME,
  intervalMinutes = DEFAULT_INTERVAL_MINUTES,
  syncEntrypoint = 'packages/cloudflare-carrier/scripts/cloudflare-site-continuity-sync.mjs',
  scheduledTaskEntrypoint = 'packages/cloudflare-carrier/scripts/cloudflare-site-continuity-scheduled-task.mjs',
  localRoot = null,
  siteId = process.env.CLOUDFLARE_CARRIER_SITE_ID ?? process.env.NARADA_SITE_CONTINUITY_SITE_ID ?? null,
  packetPath = process.env.NARADA_SITE_CONTINUITY_PACKET ?? null,
  packetDirectory = process.env.NARADA_SITE_CONTINUITY_PACKET_DIR ?? null,
  outputPath = process.env.NARADA_SITE_CONTINUITY_SYNC_OUT ?? '.narada/site-continuity/cloudflare-sync-last.json',
  reconciliationExecutionOutputPath = process.env.NARADA_SITE_CONTINUITY_RECONCILE_EXECUTION_OUT ?? '.narada/site-continuity/reconciliation/cloudflare-reconcile-last.json',
  healthOutputPath = process.env.NARADA_SITE_CONTINUITY_HEALTH_OUT ?? '.narada/site-continuity/health/cloudflare-continuity-health-last.json',
  artifactDirectory = process.env.NARADA_SITE_CONTINUITY_ARTIFACT_DIR ?? null,
  configuredSites = process.env.NARADA_SITE_CONTINUITY_SITES ?? null,
  siteContinuityBindingRegistryPath = process.env.NARADA_SITE_CONTINUITY_BINDINGS ?? '.narada/site-continuity/bindings.json',
  sitesFilePath = process.env.NARADA_SITE_CONTINUITY_SITES_FILE ?? null,
  siteRegistryProjectionPath = process.env.NARADA_CLOUDFLARE_SITE_REGISTRY_PROJECTION ?? '.narada/site-registry/cloudflare-sites.json',
  maxArtifactAgeMinutes = process.env.NARADA_SITE_CONTINUITY_MAX_ARTIFACT_AGE_MINUTES ?? DEFAULT_MAX_SYNC_ARTIFACT_AGE_MINUTES,
  nodeCommand = resolveDefaultNodeCommand(),
  hiddenWrapperPath = null,
  now = () => new Date().toISOString(),
  dryRun = true,
} = {}) {
  const root = resolve(repoRoot);
  const syncEntryPoint = resolve(root, syncEntrypoint);
  const taskEntryPoint = resolve(root, scheduledTaskEntrypoint);
  const effectiveLocalRoot = resolvePath(root, localRoot ?? root);
  const effectivePacketPath = packetPath ? resolvePath(effectiveLocalRoot, packetPath) : null;
  const effectivePacketDirectory = packetDirectory ? resolvePath(effectiveLocalRoot, packetDirectory) : null;
  const effectiveOutputPath = outputPath ? resolvePath(effectiveLocalRoot, outputPath) : null;
  const effectiveReconciliationExecutionOutputPath = reconciliationExecutionOutputPath ? resolvePath(effectiveLocalRoot, reconciliationExecutionOutputPath) : null;
  const effectiveHealthOutputPath = healthOutputPath ? resolvePath(effectiveLocalRoot, healthOutputPath) : null;
  const effectiveArtifactDirectory = artifactDirectory ? resolvePath(effectiveLocalRoot, artifactDirectory) : effectiveOutputPath ? dirname(effectiveOutputPath) : null;
  const effectiveLocalInboundDirectory = effectiveArtifactDirectory ? join(effectiveArtifactDirectory, 'inbound') : null;
  const effectiveSiteContinuityBindingRegistryPath = siteContinuityBindingRegistryPath ? resolvePath(effectiveLocalRoot, siteContinuityBindingRegistryPath) : null;
  const effectiveSitesFilePath = sitesFilePath ? resolvePath(effectiveLocalRoot, sitesFilePath) : null;
  const effectiveSiteRegistryProjectionPath = siteRegistryProjectionPath ? resolvePath(effectiveLocalRoot, siteRegistryProjectionPath) : null;
  const localConfiguredSites = readLocalConfiguredSites({
    root,
    explicitSites: configuredSites,
    siteContinuityBindingRegistryPath: effectiveSiteContinuityBindingRegistryPath,
    sitesFilePath: effectiveSitesFilePath,
    siteRegistryProjectionPath: effectiveSiteRegistryProjectionPath,
  });
  const interval = normalizeIntervalMinutes(intervalMinutes);
  const status = readLocalSchedulerStatus({
    root,
    syncEntryPoint,
    taskEntryPoint,
    localRoot: effectiveLocalRoot,
    packetPath: effectivePacketPath,
    packetDirectory: effectivePacketDirectory,
    outputPath: effectiveOutputPath,
    configuredSites: localConfiguredSites,
  });
  const directTaskCommand = buildTaskCommand({
    nodeCommand,
    entrypoint: taskEntryPoint,
    siteId,
    packetPath: effectivePacketPath,
    outputPath: effectiveOutputPath,
  });
  const wrapperPath = resolvePath(root, hiddenWrapperPath ?? DEFAULT_HIDDEN_WRAPPER_RELATIVE_PATH);
  const hiddenWrapperContent = buildHiddenVbsWrapperContent(directTaskCommand);
  const taskCommand = buildHiddenTaskCommand({ wrapperPath });

  const base = {
    schema: 'narada.cloudflare_carrier.site_continuity_scheduler_plan.v1',
    action,
    dry_run: dryRun,
    task_name: taskName,
    interval_minutes: interval,
    node_command: nodeCommand,
    repo_root: root,
    sync_entrypoint: syncEntryPoint,
    scheduled_task_entrypoint: taskEntryPoint,
    local_root: effectiveLocalRoot,
    site_id: siteId ?? null,
    packet_path: effectivePacketPath,
    packet_directory: effectivePacketDirectory,
    output_path: effectiveOutputPath,
    reconciliation_execution_output_path: effectiveReconciliationExecutionOutputPath,
    health_output_path: effectiveHealthOutputPath,
    artifact_directory: effectiveArtifactDirectory,
    site_continuity_binding_registry_path: effectiveSiteContinuityBindingRegistryPath,
    sites_file_path: effectiveSitesFilePath,
    site_registry_projection_path: effectiveSiteRegistryProjectionPath,
    configured_sites: localConfiguredSites,
    hidden_wrapper_path: wrapperPath,
    hidden_wrapper_kind: 'windows_wscript_vbs_hidden',
    hidden_wrapper_content: hiddenWrapperContent,
    credential_posture: 'external_env_file_or_process_environment_only',
    embeds_credentials: false,
    cloudflare_mutation: 'site_continuity_packet_loop_report_and_reconciliation_execution_evidence_only',
    filesystem_mutation_admission: action === 'install' && !dryRun ? 'hidden_wrapper_file_write_and_local_sync_report_artifact_write_only' : 'local_sync_report_artifact_write_only',
    repository_publication_admission: 'not_admitted',
    task_command: taskCommand,
    direct_task_command: directTaskCommand,
    status,
  };

  switch (action) {
    case 'install':
      if (!dryRun) writeHiddenWrapper({ wrapperPath, content: hiddenWrapperContent });
      return {
        ...base,
        plan_status: dryRun ? 'dry_run_install_plan' : 'live_install_requires_operator_execution',
        scheduled_task_command: [
          'schtasks',
          '/Create',
          '/TN', taskName,
          '/SC', 'MINUTE',
          '/MO', String(interval),
          '/TR', taskCommand,
          '/F',
        ],
      };
    case 'disable':
    case 'pause':
      return {
        ...base,
        plan_status: dryRun ? 'dry_run_disable_plan' : 'live_disable_requires_operator_execution',
        scheduled_task_command: ['schtasks', '/Change', '/TN', taskName, '/DISABLE'],
      };
    case 'resume':
      return {
        ...base,
        plan_status: dryRun ? 'dry_run_resume_plan' : 'live_resume_requires_operator_execution',
        scheduled_task_command: ['schtasks', '/Change', '/TN', taskName, '/ENABLE'],
      };
    case 'uninstall':
      return {
        ...base,
        plan_status: dryRun ? 'dry_run_uninstall_plan' : 'live_uninstall_requires_operator_execution',
        scheduled_task_command: ['schtasks', '/Delete', '/TN', taskName, '/F'],
      };
    case 'status':
      return {
        ...base,
        plan_status: 'status_only_no_cloudflare_access',
        scheduled_task_command: ['schtasks', '/Query', '/TN', taskName, '/V', '/FO', 'LIST'],
      };
    case 'read-last':
    case 'last':
      return {
        ...base,
        plan_status: 'last_sync_artifact_read_only_no_cloudflare_access',
        scheduled_task_command: ['schtasks', '/Query', '/TN', taskName, '/V', '/FO', 'LIST'],
        last_sync: readLastSyncArtifact(effectiveOutputPath),
      };
    case 'read-health-last':
    case 'health-last':
      return {
        ...base,
        plan_status: 'last_scheduled_health_snapshot_read_only_no_cloudflare_access',
        scheduled_task_command: ['schtasks', '/Query', '/TN', taskName, '/V', '/FO', 'LIST'],
        last_scheduled_health: readLastScheduledHealthSnapshot(effectiveHealthOutputPath),
      };
    case 'status-all':
    case 'status-local':
      return {
        ...base,
        plan_status: 'local_sync_artifact_inventory_read_only_no_cloudflare_access',
        scheduled_task_command: ['schtasks', '/Query', '/TN', taskName, '/V', '/FO', 'LIST'],
        local_sync_artifacts: readLocalSyncArtifactInventory(effectiveArtifactDirectory, {
          lastOutputPath: effectiveOutputPath,
          configuredSites: localConfiguredSites.site_records,
          maxArtifactAgeMinutes,
          now,
        }),
        local_inbound_packets: readLocalInboundPacketInventory(effectiveLocalInboundDirectory, {
          configuredSites: localConfiguredSites.site_records,
          maxArtifactAgeMinutes,
          now,
        }),
        last_reconciliation_execution: readLastReconciliationExecutionArtifact(effectiveReconciliationExecutionOutputPath),
      };
    case 'health': {
      const localSyncArtifacts = readLocalSyncArtifactInventory(effectiveArtifactDirectory, {
        lastOutputPath: effectiveOutputPath,
        configuredSites: localConfiguredSites.site_records,
        maxArtifactAgeMinutes,
        now,
      });
      const localInboundPackets = readLocalInboundPacketInventory(effectiveLocalInboundDirectory, {
        configuredSites: localConfiguredSites.site_records,
        maxArtifactAgeMinutes,
        now,
      });
      const healthPlan = {
        ...base,
        plan_status: 'site_continuity_health_gate_read_only',
        scheduled_task_command: ['schtasks', '/Query', '/TN', taskName, '/V', '/FO', 'LIST'],
        local_sync_artifacts: localSyncArtifacts,
        local_inbound_packets: localInboundPackets,
        last_reconciliation_execution: readLastReconciliationExecutionArtifact(effectiveReconciliationExecutionOutputPath),
      };
      return {
        ...healthPlan,
        continuity_health: summarizeSiteContinuityHealth(healthPlan),
      };
    }
    case 'reconcile':
    case 'reconcile-plan': {
      const localSyncArtifacts = readLocalSyncArtifactInventory(effectiveArtifactDirectory, {
        lastOutputPath: effectiveOutputPath,
        configuredSites: localConfiguredSites.site_records,
        maxArtifactAgeMinutes,
        now,
      });
      const localInboundPackets = readLocalInboundPacketInventory(effectiveLocalInboundDirectory, {
        configuredSites: localConfiguredSites.site_records,
        maxArtifactAgeMinutes,
        now,
      });
      return {
        ...base,
        plan_status: 'site_continuity_reconciliation_plan_read_only_no_cloudflare_access',
        scheduled_task_command: ['schtasks', '/Query', '/TN', taskName, '/V', '/FO', 'LIST'],
        local_sync_artifacts: localSyncArtifacts,
        local_inbound_packets: localInboundPackets,
        reconciliation_plan: buildSiteContinuityReconciliationPlan({
          localSyncArtifacts,
          nodeCommand,
          syncEntryPoint,
          packetPath: effectivePacketPath,
          packetDirectory: effectivePacketDirectory,
          artifactDirectory: effectiveArtifactDirectory,
        }),
      };
    }
    default:
      throw new Error(`unknown_site_continuity_scheduler_action:${action}`);
  }
}

function isContinuitySyncArtifactSummary(artifact, lastOutputPath) {
  const artifactPath = artifact?.artifact_path ?? null;
  if (!artifactPath) return false;
  if (lastOutputPath && artifactPath === lastOutputPath) return true;
  if (artifact?.schema === 'narada.site_continuity_cloudflare_sync_once.v1') return true;
  return /(?:^|[\\/])[^\\/]*cloudflare-sync(?:-last)?\.json$/i.test(artifactPath);
}

async function executeSchedulerTaskReadback(plan, { execFileImpl = execFile, executionTimeoutMs = DEFAULT_RECONCILE_EXECUTION_TIMEOUT_MS } = {}) {
  const scheduledTaskCommand = plan?.scheduled_task_command ?? [];
  const [command, ...args] = scheduledTaskCommand;
  const base = {
    ...plan,
    dry_run: false,
    host_scheduler_read_admission: 'bounded_schtasks_query_from_scheduler_plan',
    embeds_credentials: false,
  };
  if (command !== 'schtasks' || args[0] !== '/Query') {
    return {
      ...base,
      scheduler_task_readback: {
        state: 'refused',
        status: 'needs_attention',
        reason: 'unsupported_scheduler_query_command',
        command: command ?? null,
        args,
        embeds_credentials: false,
      },
    };
  }
  const timeout = normalizeExecutionTimeoutMs(executionTimeoutMs);
  try {
    const result = await execFileImpl(command, args, { cwd: plan.repo_root, timeout, windowsHide: true });
    const parsed = parseSchedulerTaskListOutput(result?.stdout ?? '');
    const readback = summarizeSchedulerTaskReadback({
      state: 'completed',
      command,
      args,
      stdout: result?.stdout ?? '',
      stderr: result?.stderr ?? '',
      timeout_ms: timeout,
      parsed,
      expectedIntervalMinutes: plan.interval_minutes,
      expectedTaskCommand: plan.task_command,
      expectedTaskEntrypoint: plan.scheduled_task_entrypoint,
      hiddenWrapperReadback: readHiddenWrapperFileReadback({
        wrapperPath: plan.hidden_wrapper_path,
        expectedContent: plan.hidden_wrapper_content,
      }),
    });
    const next = {
      ...base,
      scheduler_task_readback: readback,
    };
    return plan.action === 'health'
      ? { ...next, continuity_health: summarizeSiteContinuityHealth(next, readback) }
      : next;
  } catch (error) {
    const readback = {
      state: 'failed',
      status: 'needs_attention',
      command,
      args,
      exit_code: error.code ?? null,
      signal: error.signal ?? null,
      stdout: error.stdout ?? '',
      stderr: error.stderr ?? '',
      timeout_ms: timeout,
      embeds_credentials: false,
    };
    const next = {
      ...base,
      scheduler_task_readback: readback,
    };
    return plan.action === 'health'
      ? { ...next, continuity_health: summarizeSiteContinuityHealth(next, readback) }
      : next;
  }
}

function summarizeSiteContinuityHealth(plan, schedulerTaskReadback = plan?.scheduler_task_readback ?? null) {
  const configuredSites = plan?.configured_sites ?? {};
  const bindingRegistry = configuredSites.site_continuity_binding_registry ?? {};
  const localSyncArtifacts = plan?.local_sync_artifacts ?? null;
  const localInboundPackets = plan?.local_inbound_packets ?? null;
  const status = plan?.status ?? {};
  const attentionReasons = [
    configuredSites.state !== 'configured' ? 'site_continuity_sites_not_configured' : null,
    configuredSites.site_count <= 0 ? 'site_continuity_no_sites_selected' : null,
    bindingRegistry.state !== 'read' ? `site_continuity_binding_registry_${bindingRegistry.state ?? 'unread'}` : null,
    status.command_args_complete !== true ? 'site_continuity_scheduler_command_args_incomplete' : null,
    localSyncArtifacts?.status && localSyncArtifacts.status !== 'synced' ? `site_continuity_local_sync_${localSyncArtifacts.status}` : null,
    localInboundPackets?.status && localInboundPackets.status !== 'synced' ? `site_continuity_local_inbound_${localInboundPackets.status}` : null,
    schedulerTaskReadback ? schedulerTaskReadback.status !== 'ok' ? 'site_continuity_scheduler_readback_needs_attention' : null : 'site_continuity_scheduler_live_readback_required',
  ].filter(Boolean);
  return {
    schema: 'narada.cloudflare_carrier.site_continuity_health.v1',
    status: attentionReasons.length === 0 ? 'ok' : 'needs_attention',
    attention_reasons: attentionReasons,
    site_count: configuredSites.site_count ?? 0,
    selection_source: configuredSites.selection_source ?? 'unknown',
    binding_registry_state: bindingRegistry.state ?? null,
    binding_count: bindingRegistry.binding_count ?? 0,
    local_sync_status: localSyncArtifacts?.status ?? null,
    local_sync_artifact_count: localSyncArtifacts?.artifact_count ?? 0,
    local_inbound_status: localInboundPackets?.status ?? null,
    local_inbound_artifact_count: localInboundPackets?.artifact_count ?? 0,
    scheduler_readback_status: schedulerTaskReadback?.status ?? null,
    scheduler_last_result: schedulerTaskReadback?.last_result ?? null,
    scheduler_task_state: schedulerTaskReadback?.scheduled_task_state ?? null,
    scheduler_power_management_status: schedulerTaskReadback?.power_management_status ?? null,
    embeds_credentials: false,
  };
}

export function formatSiteContinuitySchedulerResultForText(result) {
  const lines = ['Site Continuity'];
  const continuityHealth = result?.continuity_health ?? result?.last_scheduled_health?.continuity_health ?? null;
  const configuredSites = result?.configured_sites ?? null;
  const localSyncArtifacts = result?.local_sync_artifacts ?? null;
  const localInboundPackets = result?.local_inbound_packets ?? null;
  const lastScheduledHealth = result?.last_scheduled_health ?? null;
  const productPosture = result?.cloudflare_product_posture ?? lastScheduledHealth ?? null;
  const operatorAction = result?.operator_next_action ?? lastScheduledHealth?.operator_next_action ?? null;
  const operatorTarget = result?.operator_next_target_site_id ?? lastScheduledHealth?.operator_next_target_site_id ?? null;
  const operatorReason = result?.operator_next_reason ?? lastScheduledHealth?.operator_next_reason ?? null;
  const localPostureStatuses = [localSyncArtifacts?.status, localInboundPackets?.status].filter(Boolean);
  const derivedLocalStatus = localPostureStatuses.length === 0
    ? null
    : localPostureStatuses.every((statusValue) => statusValue === 'synced') ? 'synced' : 'needs_attention';
  const resultStatus = typeof result?.status === 'string' ? result.status : null;
  const status = continuityHealth?.status ?? derivedLocalStatus ?? resultStatus ?? result?.plan_status ?? 'unknown';

  lines.push(`Status: ${status}`);
  if (result?.action) lines.push(`Action: ${result.action}`);
  if (result?.plan_status) lines.push(`Plan: ${result.plan_status}`);
  if (result?.scheduler_task_readback?.hidden_wrapper_readback) lines.push(`Hidden Wrapper: ${result.scheduler_task_readback.hidden_wrapper_readback.status ?? 'unknown'}`);
  if (configuredSites) lines.push(`Sites: ${configuredSites.site_count ?? 0} (${configuredSites.selection_source ?? 'unknown'})`);
  if (continuityHealth) {
    lines.push(`Bindings: ${continuityHealth.binding_count ?? 0} (${continuityHealth.binding_registry_state ?? 'unknown'})`);
    lines.push(`Local Sync: ${continuityHealth.local_sync_status ?? 'unknown'} (${continuityHealth.local_sync_artifact_count ?? 0})`);
    lines.push(`Local Inbound: ${continuityHealth.local_inbound_status ?? 'unknown'} (${continuityHealth.local_inbound_artifact_count ?? 0})`);
    lines.push(`Scheduler: ${continuityHealth.scheduler_readback_status ?? 'unknown'} last=${continuityHealth.scheduler_last_result ?? 'unknown'} power=${continuityHealth.scheduler_power_management_status ?? 'unknown'}`);
    if (continuityHealth.attention_reasons?.length) lines.push(`Attention: ${continuityHealth.attention_reasons.join(', ')}`);
  } else {
    if (localSyncArtifacts) lines.push(`Local Sync: ${localSyncArtifacts.status ?? 'unknown'} (${localSyncArtifacts.artifact_count ?? 0})`);
    if (localInboundPackets) lines.push(`Local Inbound: ${localInboundPackets.status ?? 'unknown'} (${localInboundPackets.artifact_count ?? 0})`);
  }
  if (productPosture?.cloudflare_product_posture_status || productPosture?.cloudflare_product_posture_state) {
    lines.push(`Cloudflare Product: ${productPosture.cloudflare_product_posture_state ?? 'unknown'}/${productPosture.cloudflare_product_posture_status ?? 'unknown'} next=${productPosture.cloudflare_product_next_site_id ?? 'none'} action=${productPosture.cloudflare_product_next_action ?? 'none'}`);
  } else if (result?.cloudflare_product_posture) {
    lines.push(`Cloudflare Product: ${result.cloudflare_product_posture.state ?? 'unknown'}/${result.cloudflare_product_posture.status ?? 'unknown'} next=${result.cloudflare_product_posture.summary?.next_site_id ?? 'none'} action=${result.cloudflare_product_posture.summary?.next_action ?? 'none'}`);
  }
  if (operatorAction) lines.push(`Operator Next: ${operatorAction} target=${operatorTarget ?? 'none'} reason=${operatorReason ?? 'none'}`);

  const syncBySite = new Map((localSyncArtifacts?.configured_site_sync_statuses ?? []).map((site) => [site.site_id, site]));
  const inboundBySite = new Map((localInboundPackets?.configured_site_inbound_statuses ?? []).map((site) => [site.site_id, site]));
  const siteIds = [...new Set([...syncBySite.keys(), ...inboundBySite.keys()])].sort();
  if (siteIds.length > 0) {
    lines.push('Site Details:');
    for (const siteId of siteIds) {
      const sync = syncBySite.get(siteId);
      const inbound = inboundBySite.get(siteId);
      lines.push(`- ${siteId}: sync=${sync?.status ?? 'unknown'} inbound=${inbound?.status ?? 'unknown'}`);
    }
  }
  return `${lines.join('\n')}\n`;
}

function summarizeSchedulerTaskReadback({ state, command, args, stdout, stderr, timeout_ms: timeoutMs, parsed, expectedIntervalMinutes, expectedTaskCommand, expectedTaskEntrypoint, hiddenWrapperReadback = null }) {
  const repeatEvery = parsed['Repeat: Every'] ?? null;
  const taskToRun = parsed['Task To Run'] ?? null;
  const actualIntervalMinutes = parseSchedulerRepeatMinutes(repeatEvery);
  const expectedInterval = normalizeIntervalMinutes(expectedIntervalMinutes);
  const lastResult = parsed['Last Result'] ?? null;
  const scheduledTaskState = parsed['Scheduled Task State'] ?? null;
  const statusText = parsed.Status ?? null;
  const powerManagement = parsed['Power Management'] ?? null;
  const powerManagementStatus = summarizeSchedulerPowerManagementStatus(powerManagement);
  const cadenceStatus = actualIntervalMinutes === null
    ? 'unknown'
    : actualIntervalMinutes === expectedInterval ? 'matches_plan' : 'differs_from_plan';
  const expectedCommandNeedle = expectedTaskCommand ?? expectedTaskEntrypoint;
  const taskCommandMatches = taskToRun && expectedCommandNeedle
    ? normalizeCommandForComparison(taskToRun).includes(normalizeCommandForComparison(expectedCommandNeedle))
    : null;
  const taskCommandStatus = taskCommandMatches === null ? 'unknown' : taskCommandMatches ? 'matches_plan' : 'differs_from_plan';
  const attentionReasons = [
    cadenceStatus === 'differs_from_plan' ? 'scheduler_cadence_differs_from_plan' : null,
    taskCommandStatus === 'differs_from_plan' ? 'scheduler_task_command_differs_from_plan' : null,
    hiddenWrapperReadback && hiddenWrapperReadback.status !== 'matches_plan' ? `hidden_wrapper_${hiddenWrapperReadback.status}` : null,
    isSchedulerLastResultHealthy(lastResult, statusText) ? null : 'scheduler_last_result_nonzero',
    scheduledTaskState && !/^enabled$/i.test(scheduledTaskState) ? 'scheduler_task_disabled' : null,
    powerManagementStatus === 'blocks_battery_execution' ? 'scheduler_power_policy_blocks_battery_execution' : null,
  ].filter(Boolean);
  return {
    state,
    status: attentionReasons.length === 0 ? 'ok' : 'needs_attention',
    command,
    args,
    stdout,
    stderr,
    timeout_ms: timeoutMs,
    parsed,
    task_name: parsed.TaskName ?? null,
    scheduled_task_state: scheduledTaskState,
    status_text: statusText,
    power_management: powerManagement,
    power_management_status: powerManagementStatus,
    last_run_time: parsed['Last Run Time'] ?? null,
    last_result: lastResult,
    next_run_time: parsed['Next Run Time'] ?? null,
    task_to_run: taskToRun,
    repeat_every: repeatEvery,
    expected_interval_minutes: expectedInterval,
    actual_interval_minutes: actualIntervalMinutes,
    cadence_status: cadenceStatus,
    task_command_status: taskCommandStatus,
    hidden_wrapper_readback: hiddenWrapperReadback,
    attention_reasons: attentionReasons,
    embeds_credentials: false,
  };
}

function isSchedulerLastResultHealthy(lastResult, statusText) {
  if (!lastResult || lastResult === '0') return true;
  const normalizedLastResult = String(lastResult).trim().toLowerCase();
  const normalizedStatus = String(statusText ?? '').trim().toLowerCase();
  return normalizedStatus === 'running' && ['267009', '0x41301'].includes(normalizedLastResult);
}

function summarizeSchedulerPowerManagementStatus(powerManagement) {
  if (!powerManagement) return 'unknown';
  const normalized = String(powerManagement).toLowerCase();
  return normalized.includes('no start on batteries') || normalized.includes('stop on battery')
    ? 'blocks_battery_execution'
    : 'allows_battery_execution';
}

function parseSchedulerTaskListOutput(output) {
  const parsed = {};
  for (const line of String(output ?? '').split(/\r?\n/)) {
    const repeatEvery = /^Repeat:\s*Every:\s*(.*)$/i.exec(line);
    if (repeatEvery) {
      parsed['Repeat: Every'] = repeatEvery[1].trim();
      continue;
    }
    const separator = line.indexOf(':');
    if (separator <= 0) continue;
    const key = line.slice(0, separator).trim();
    const value = line.slice(separator + 1).trim();
    if (key) parsed[key] = value;
  }
  return parsed;
}

function parseSchedulerRepeatMinutes(value) {
  const text = String(value ?? '').trim();
  if (!text || /^none$/i.test(text)) return null;
  const hours = text.match(/(\d+)\s*Hour/i);
  const minutes = text.match(/(\d+)\s*Minute/i);
  const total = (hours ? Number.parseInt(hours[1], 10) * 60 : 0) + (minutes ? Number.parseInt(minutes[1], 10) : 0);
  return Number.isFinite(total) && total > 0 ? total : null;
}

function normalizeCommandForComparison(value) {
  return String(value ?? '').replaceAll('"', '').replace(/\s+/g, ' ').trim().toLowerCase();
}

function readHiddenWrapperFileReadback({ wrapperPath, expectedContent }) {
  if (!wrapperPath) {
    return {
      status: 'unknown',
      path: null,
      embeds_credentials: false,
    };
  }
  if (!existsSync(wrapperPath)) {
    return {
      status: 'missing',
      path: wrapperPath,
      embeds_credentials: false,
    };
  }
  try {
    const actualContent = readFileSync(wrapperPath, 'utf8');
    const matches = normalizeWrapperContentForComparison(actualContent) === normalizeWrapperContentForComparison(expectedContent);
    return {
      status: matches ? 'matches_plan' : 'differs_from_plan',
      path: wrapperPath,
      embeds_credentials: false,
    };
  } catch (error) {
    return {
      status: 'read_failed',
      path: wrapperPath,
      error_code: error.code ?? null,
      embeds_credentials: false,
    };
  }
}

function normalizeWrapperContentForComparison(value) {
  return String(value ?? '').replace(/\r\n/g, '\n').trimEnd();
}

function resolveDefaultNodeCommand() {
  if (process.env.NARADA_NODE_COMMAND) return process.env.NARADA_NODE_COMMAND;
  const fnmDir = process.env.FNM_DIR;
  if (fnmDir) {
    const fnmNode = join(fnmDir, 'node-versions', `v${process.versions.node}`, 'installation', process.platform === 'win32' ? 'node.exe' : 'bin/node');
    if (existsSync(fnmNode)) return fnmNode;
  }
  return 'node';
}

function countResultStatuses(results) {
  const counts = {};
  for (const result of results) {
    const status = result?.status ?? 'unknown';
    counts[status] = (counts[status] ?? 0) + 1;
  }
  return counts;
}

export async function runSiteContinuitySchedulerActionWithOptionalRefresh(
  options = {},
  {
    env = process.env,
    materializeSiteRegistryProjection = materializeCloudflareSiteRegistryProjection,
    execFileImpl = execFile,
    productReadSurface = readProductSurface,
  } = {},
) {
  const action = options.action ?? 'status';
  if (action !== 'reconcile-execute') {
    const plan = await buildSiteContinuitySchedulerPlanWithOptionalRefresh(options, { env, materializeSiteRegistryProjection });
    if (options.dryRun === false && LIVE_SCHEDULER_TASK_ACTIONS.has(action)) {
      return executeSchedulerTaskPlan(plan, { execFileImpl, executionTimeoutMs: options.executionTimeoutMs });
    }
    if (options.dryRun === false && LIVE_SCHEDULER_READ_ACTIONS.has(action)) {
      return executeSchedulerTaskReadback(plan, { execFileImpl, executionTimeoutMs: options.executionTimeoutMs });
    }
    return plan;
  }
  const planningOptions = { ...options, action: 'reconcile' };
  const plan = await buildSiteContinuitySchedulerPlanWithOptionalRefresh(planningOptions, { env, materializeSiteRegistryProjection });
  const reconciliationExecution = await executeSiteContinuityReconciliationPlan(plan, {
    dryRun: options.dryRun !== false,
    executionTimeoutMs: options.executionTimeoutMs,
    execFileImpl,
    now: options.now,
  });
  if (options.dryRun !== false) return reconciliationExecution;
  const healthPlan = buildSiteContinuitySchedulerPlan({ ...planningOptions, action: 'health' });
  const healthReadback = await executeSchedulerTaskReadback(healthPlan, { execFileImpl, executionTimeoutMs: options.executionTimeoutMs });
  const continuityHealth = healthReadback.continuity_health ?? summarizeSiteContinuityHealth(healthPlan, healthReadback.scheduler_task_readback ?? null);
  const cloudflareProductPosture = await readCloudflareProductPostureForHealthSnapshot({
    env,
    now: options.now,
    productReadSurface,
  });
  const cloudflareProductBindingAlignment = summarizeCloudflareProductBindingAlignment({
    configuredSites: healthPlan.configured_sites,
    cloudflareProductPosture,
  });
  const cloudflareProductBindingPreparation = summarizeCloudflareProductBindingPreparation({
    configuredSites: healthPlan.configured_sites,
    cloudflareProductPosture,
    cloudflareProductBindingAlignment,
  });
  const cloudflareOperationPosture = await readCloudflareOperationPostureForHealthSnapshot({
    env,
    now: options.now,
    productReadSurface,
    siteId: cloudflareProductPosture.summary?.next_site_id ?? null,
  });
  return {
    ...reconciliationExecution,
    scheduled_health_snapshot: persistSiteContinuityHealthSnapshot({
      schema: 'narada.cloudflare_carrier.site_continuity_scheduled_health_snapshot.v1',
      status: summarizeScheduledHealthSnapshotStatus({
        continuityHealth,
        cloudflareProductPosture,
        cloudflareProductBindingAlignment,
        cloudflareProductBindingPreparation,
        cloudflareOperationPosture,
      }),
      generated_at: options.now?.() ?? new Date().toISOString(),
      health_output_path: plan.health_output_path ?? null,
      embeds_credentials: false,
      trigger: env.NARADA_SITE_CONTINUITY_SYNC_TRIGGER ?? null,
      reconciliation_execution: summarizeReconciliationExecutionForHealthSnapshot(reconciliationExecution),
      continuity_health: continuityHealth,
      cloudflare_product_posture: cloudflareProductPosture,
      cloudflare_product_binding_alignment: cloudflareProductBindingAlignment,
      cloudflare_product_binding_preparation: cloudflareProductBindingPreparation,
      cloudflare_operation_posture: cloudflareOperationPosture,
      scheduler_task_readback: healthReadback.scheduler_task_readback ?? null,
    }, { dryRun: false, now: options.now }),
  };
}

export function summarizeScheduledHealthSnapshotStatus({
  continuityHealth = null,
  cloudflareProductPosture = null,
  cloudflareProductBindingAlignment = null,
  cloudflareProductBindingPreparation = null,
  cloudflareOperationPosture = null,
} = {}) {
  const statuses = [
    continuityHealth?.status,
    cloudflareProductPosture?.status,
    cloudflareProductBindingAlignment?.status,
    cloudflareProductBindingPreparation?.status,
    cloudflareOperationPosture?.status,
  ].filter(Boolean);
  return statuses.includes('needs_attention') ? 'needs_attention' : 'ok';
}

export function summarizeCloudflareProductBindingAlignment({
  configuredSites = {},
  cloudflareProductPosture = null,
} = {}) {
  const localSiteIds = normalizeConfiguredSiteList([
    ...(Array.isArray(configuredSites?.sites) ? configuredSites.sites : []),
    ...(Array.isArray(configuredSites?.site_records) ? configuredSites.site_records.map((site) => site?.site_id) : []),
  ]);
  const nextSiteId = cloudflareProductPosture?.summary?.next_site_id ?? null;
  const nextAction = cloudflareProductPosture?.summary?.next_action ?? null;
  const nextHealth = cloudflareProductPosture?.summary?.next_health ?? null;
  const base = {
    schema: 'narada.cloudflare_carrier.product_binding_alignment.v1',
    selection_source: configuredSites?.selection_source ?? 'unknown',
    local_site_count: localSiteIds.length,
    local_site_ids: localSiteIds,
    cloudflare_product_posture_state: cloudflareProductPosture?.state ?? null,
    cloudflare_product_posture_status: cloudflareProductPosture?.status ?? null,
    cloudflare_product_next_site_id: nextSiteId,
    cloudflare_product_next_action: nextAction,
    cloudflare_product_next_health: nextHealth,
    embeds_credentials: false,
  };
  if (cloudflareProductPosture?.state !== 'loaded') {
    return {
      ...base,
      state: 'not_evaluated',
      status: 'not_available',
      reason: `cloudflare_product_posture_${cloudflareProductPosture?.state ?? 'missing'}`,
    };
  }
  if (!nextSiteId) {
    return {
      ...base,
      state: 'aligned',
      status: 'ok',
      reason: 'cloudflare_product_next_site_not_required',
    };
  }
  if (localSiteIds.includes(nextSiteId)) {
    return {
      ...base,
      state: 'aligned',
      status: 'ok',
      reason: 'cloudflare_product_next_site_in_local_continuity_set',
    };
  }
  return {
    ...base,
    state: 'unbound_remote_next_site',
    status: 'needs_attention',
    reason: 'cloudflare_product_next_site_not_in_local_continuity_set',
  };
}

export function summarizeCloudflareProductBindingPreparation({
  configuredSites = {},
  cloudflareProductPosture = null,
  cloudflareProductBindingAlignment = null,
} = {}) {
  const targetSiteId = cloudflareProductBindingAlignment?.cloudflare_product_next_site_id
    ?? cloudflareProductPosture?.summary?.next_site_id
    ?? null;
  const operatorAction = cloudflareProductBindingAlignment?.state === 'unbound_remote_next_site'
    ? 'bind_cloudflare_product_next_site_locally'
    : null;
  const localSiteRecords = normalizeConfiguredSiteRecords([
    ...(Array.isArray(configuredSites?.site_records) ? configuredSites.site_records : []),
    ...(Array.isArray(configuredSites?.site_continuity_binding_registry?.site_records) ? configuredSites.site_continuity_binding_registry.site_records : []),
  ]);
  const projectedSiteRecords = normalizeConfiguredSiteRecords([
    ...(Array.isArray(configuredSites?.site_registry_projection?.site_records) ? configuredSites.site_registry_projection.site_records : []),
  ]);
  const localRecord = localSiteRecords.find((site) => site.site_id === targetSiteId) ?? null;
  const projectedRecord = projectedSiteRecords.find((site) => site.site_id === targetSiteId) ?? null;
  const localSiteRef = localRecord?.local_site_ref ?? null;
  const cloudflareSiteRef = localRecord?.cloudflare_site_ref ?? localRecord?.site_ref ?? projectedRecord?.cloudflare_site_ref ?? projectedRecord?.site_ref ?? null;
  const missingInputs = operatorAction
    ? [localSiteRef ? null : 'local_site_ref', cloudflareSiteRef ? null : 'cloudflare_site_ref'].filter(Boolean)
    : [];
  const state = !operatorAction
    ? 'not_required'
    : missingInputs.length > 0
      ? 'blocked_missing_refs'
      : 'ready';
  return {
    schema: 'narada.cloudflare_carrier.product_binding_preparation.v1',
    state,
    status: state === 'blocked_missing_refs' ? 'needs_attention' : 'ok',
    reason: state === 'not_required'
      ? 'cloudflare_product_binding_preparation_not_required'
      : state === 'ready'
        ? 'site_continuity_binding_refs_available'
        : 'site_continuity_binding_refs_missing',
    target_site_id: targetSiteId,
    operator_action: operatorAction,
    required_inputs: missingInputs,
    local_site_ref_available: Boolean(localSiteRef),
    cloudflare_site_ref_available: Boolean(cloudflareSiteRef),
    local_site_record_state: localRecord ? 'found' : 'missing',
    cloudflare_site_projection_state: projectedRecord ? 'found' : 'missing',
    command_hint: operatorAction
      ? 'pnpm --filter @narada2/cloudflare-carrier continuity:bindings:prepare-next -- --local-site-ref <file-or-site-ref> --cloudflare-site-ref <cloudflare-site-ref>'
      : null,
    embeds_credentials: false,
  };
}

export async function readCloudflareProductPostureForHealthSnapshot({
  env = process.env,
  now = () => new Date().toISOString(),
  productReadSurface = readProductSurface,
} = {}) {
  const workerUrl = String(env.CLOUDFLARE_CARRIER_URL ?? '').replace(/\/+$/, '');
  const generatedAt = typeof now === 'function' ? now() : new Date().toISOString();
  if (!workerUrl) {
    return {
      schema: 'narada.cloudflare_carrier.product_posture_snapshot.v1',
      state: 'not_configured',
      status: 'not_available',
      generated_at: generatedAt,
      operation: 'site.list',
      missing: ['CLOUDFLARE_CARRIER_URL'],
      embeds_credentials: false,
    };
  }
  const auth = resolveProductReadAuth([], env);
  if (!auth) {
    return {
      schema: 'narada.cloudflare_carrier.product_posture_snapshot.v1',
      state: 'not_configured',
      status: 'not_available',
      generated_at: generatedAt,
      worker_url: workerUrl,
      operation: 'site.list',
      missing: ['cloudflare_product_read_auth'],
      embeds_credentials: false,
    };
  }
  try {
    const productRead = await productReadSurface({
      workerUrl,
      operation: 'site.list',
      requestId: `scheduled_health_product_read_${Date.parse(generatedAt) || Date.now()}`,
      params: {},
      format: 'json',
      auth,
    });
    return {
      schema: 'narada.cloudflare_carrier.product_posture_snapshot.v1',
      state: 'loaded',
      status: 'ok',
      generated_at: generatedAt,
      worker_url: workerUrl,
      operation: 'site.list',
      auth_kind: auth.kind,
      summary: productRead.summary ?? null,
      site_product_overview: productRead.response?.site_product_overview ?? null,
      site_posture_route: productRead.response?.site_posture_route ?? null,
      embeds_credentials: false,
    };
  } catch (error) {
    return {
      schema: 'narada.cloudflare_carrier.product_posture_snapshot.v1',
      state: 'failed',
      status: 'needs_attention',
      generated_at: generatedAt,
      worker_url: workerUrl,
      operation: 'site.list',
      auth_kind: auth.kind,
      reason: sanitizeProductPostureError(error),
      embeds_credentials: false,
    };
  }
}

export async function readCloudflareOperationPostureForHealthSnapshot({
  env = process.env,
  now = () => new Date().toISOString(),
  productReadSurface = readProductSurface,
  siteId = null,
} = {}) {
  const workerUrl = String(env.CLOUDFLARE_CARRIER_URL ?? '').replace(/\/+$/, '');
  const generatedAt = typeof now === 'function' ? now() : new Date().toISOString();
  if (!workerUrl) {
    return {
      schema: 'narada.cloudflare_carrier.operation_posture_snapshot.v1',
      state: 'not_configured',
      status: 'not_available',
      generated_at: generatedAt,
      operation: 'operation.list',
      missing: ['CLOUDFLARE_CARRIER_URL'],
      embeds_credentials: false,
    };
  }
  if (!siteId) {
    return {
      schema: 'narada.cloudflare_carrier.operation_posture_snapshot.v1',
      state: 'not_selected',
      status: 'not_available',
      generated_at: generatedAt,
      worker_url: workerUrl,
      operation: 'operation.list',
      reason: 'cloudflare_product_next_site_id_not_available',
      embeds_credentials: false,
    };
  }
  const auth = resolveProductReadAuth([], env);
  if (!auth) {
    return {
      schema: 'narada.cloudflare_carrier.operation_posture_snapshot.v1',
      state: 'not_configured',
      status: 'not_available',
      generated_at: generatedAt,
      worker_url: workerUrl,
      operation: 'operation.list',
      site_id: siteId,
      missing: ['cloudflare_product_read_auth'],
      embeds_credentials: false,
    };
  }
  try {
    const productRead = await productReadSurface({
      workerUrl,
      operation: 'operation.list',
      requestId: `scheduled_health_operation_read_${Date.parse(generatedAt) || Date.now()}`,
      params: { site_id: siteId },
      format: 'json',
      auth,
    });
    return {
      schema: 'narada.cloudflare_carrier.operation_posture_snapshot.v1',
      state: 'loaded',
      status: 'ok',
      generated_at: generatedAt,
      worker_url: workerUrl,
      operation: 'operation.list',
      site_id: siteId,
      auth_kind: auth.kind,
      summary: productRead.summary ?? null,
      operation_posture_overview: productRead.response?.operation_posture_overview ?? null,
      operation_posture_route: productRead.response?.operation_posture_route ?? null,
      embeds_credentials: false,
    };
  } catch (error) {
    return {
      schema: 'narada.cloudflare_carrier.operation_posture_snapshot.v1',
      state: 'failed',
      status: 'needs_attention',
      generated_at: generatedAt,
      worker_url: workerUrl,
      operation: 'operation.list',
      site_id: siteId,
      auth_kind: auth.kind,
      reason: sanitizeProductPostureError(error),
      embeds_credentials: false,
    };
  }
}

function sanitizeProductPostureError(error) {
  return String(error?.message ?? error ?? 'cloudflare_product_posture_read_failed')
    .replace(/Bearer\s+[^\s]+/gi, 'Bearer [redacted]')
    .replace(/narada_operator_session=[^;\s]+/gi, 'narada_operator_session=[redacted]');
}

function persistSiteContinuityHealthSnapshot(snapshot, { dryRun = true, now = () => new Date().toISOString() } = {}) {
  if (dryRun) return snapshot;
  const outputPath = snapshot.health_output_path;
  if (!outputPath) {
    return {
      ...snapshot,
      health_snapshot_artifact: {
        state: 'not_configured',
        written: false,
        status: 'needs_configuration',
      },
    };
  }
  try {
    mkdirSync(dirname(outputPath), { recursive: true });
    const artifact = {
      ...snapshot,
      persisted_at: now(),
    };
    writeFileSync(outputPath, `${JSON.stringify(artifact, null, 2)}\n`, 'utf8');
    return {
      ...snapshot,
      health_snapshot_artifact: {
        state: 'written',
        written: true,
        artifact_path: outputPath,
        status: 'recorded',
        persisted_at: artifact.persisted_at,
      },
    };
  } catch (error) {
    return {
      ...snapshot,
      health_snapshot_artifact: {
        state: 'write_failed',
        written: false,
        artifact_path: outputPath,
        status: 'needs_attention',
        error: error.message,
      },
    };
  }
}

function summarizeReconciliationExecutionForHealthSnapshot(result) {
  return {
    schema: result?.schema ?? null,
    status: result?.status ?? null,
    reconciliation_plan_status: result?.reconciliation_plan_status ?? null,
    selected_site_count: result?.selected_site_count ?? 0,
    executed_site_count: result?.executed_site_count ?? 0,
    completed_site_count: result?.completed_site_count ?? 0,
    failed_site_count: result?.failed_site_count ?? 0,
    refusal_reason: result?.refusal_reason ?? null,
    reconciliation_execution_artifact: result?.reconciliation_execution_artifact ?? null,
    cloudflare_reconciliation_execution_evidence: result?.cloudflare_reconciliation_execution_evidence
      ? {
        state: result.cloudflare_reconciliation_execution_evidence.state ?? null,
        status: result.cloudflare_reconciliation_execution_evidence.status ?? null,
        recorded_count: result.cloudflare_reconciliation_execution_evidence.recorded_count ?? null,
        failed_count: result.cloudflare_reconciliation_execution_evidence.failed_count ?? null,
      }
      : null,
  };
}

async function executeSchedulerTaskPlan(plan, { execFileImpl = execFile, executionTimeoutMs = DEFAULT_RECONCILE_EXECUTION_TIMEOUT_MS } = {}) {
  const scheduledTaskCommand = plan?.scheduled_task_command ?? [];
  const [command, ...args] = scheduledTaskCommand;
  const action = plan?.action ?? 'unknown';
  const base = {
    ...plan,
    dry_run: false,
    host_scheduler_mutation_admission: 'bounded_schtasks_command_from_scheduler_plan',
    embeds_credentials: false,
  };
  if (command !== 'schtasks' || !LIVE_SCHEDULER_TASK_ACTIONS.has(action)) {
    return {
      ...base,
      plan_status: `live_${action}_refused`,
      scheduler_task_execution: {
        state: 'refused',
        status: 'needs_attention',
        reason: 'unsupported_scheduler_task_command',
        command: command ?? null,
        args,
        embeds_credentials: false,
      },
    };
  }
  const timeout = normalizeExecutionTimeoutMs(executionTimeoutMs);
  try {
    const result = await execFileImpl(command, args, { cwd: plan.repo_root, timeout, windowsHide: true });
    return {
      ...base,
      plan_status: `live_${action}_completed`,
      scheduler_task_execution: {
        state: 'completed',
        status: 'ok',
        command,
        args,
        stdout: result?.stdout ?? '',
        stderr: result?.stderr ?? '',
        timeout_ms: timeout,
        embeds_credentials: false,
      },
    };
  } catch (error) {
    return {
      ...base,
      plan_status: `live_${action}_failed`,
      scheduler_task_execution: {
        state: 'failed',
        status: 'needs_attention',
        command,
        args,
        exit_code: error.code ?? null,
        signal: error.signal ?? null,
        stdout: error.stdout ?? '',
        stderr: error.stderr ?? '',
        timeout_ms: timeout,
        embeds_credentials: false,
      },
    };
  }
}

export async function executeSiteContinuityReconciliationPlan(
  plan,
  { dryRun = true, executionTimeoutMs = DEFAULT_RECONCILE_EXECUTION_TIMEOUT_MS, execFileImpl = execFile, now = () => new Date().toISOString() } = {},
) {
  const reconciliationPlan = plan?.reconciliation_plan ?? null;
  const selectedSites = reconciliationPlan?.selected_sites ?? [];
  const base = {
    schema: 'narada.cloudflare_carrier.site_continuity_reconciliation_execution.v1',
    status: 'refused',
    dry_run: dryRun,
    plan_status: plan?.plan_status ?? null,
    reconciliation_plan_status: reconciliationPlan?.status ?? null,
    selected_site_count: selectedSites.length,
    cloudflare_mutation_admission: dryRun ? 'not_executed_dry_run' : 'pending_guarded_sync_once_execution',
    filesystem_mutation_admission: dryRun ? 'not_executed_dry_run' : 'pending_guarded_sync_once_artifact_and_inbound_packet_write',
    embeds_credentials: false,
    generated_at: now(),
    reconciliation_execution_output_path: plan?.reconciliation_execution_output_path ?? null,
    plan,
  };
  if (!reconciliationPlan) {
    return persistReconciliationExecutionResult({ ...base, refusal_reason: 'reconciliation_plan_required', results: [] }, { dryRun, now });
  }
  if (dryRun) {
    return { ...base, status: 'dry_run', refusal_reason: 'reconcile_execute_requires_live_flag', results: [] };
  }
  if (reconciliationPlan.status === 'synced' && selectedSites.length === 0) {
    return persistReconciliationExecutionResult({
      ...base,
      status: 'completed',
      reconciliation_plan_status: 'synced',
      cloudflare_mutation_admission: 'not_executed_already_synced',
      filesystem_mutation_admission: 'reconciliation_execution_artifact_write_only',
      execution_timeout_ms: normalizeExecutionTimeoutMs(executionTimeoutMs),
      executed_site_count: 0,
      completed_site_count: 0,
      failed_site_count: 0,
      results: [],
      cloudflare_reconciliation_execution_evidence: {
        state: 'skipped',
        status: 'not_recorded',
        reason: 'reconciliation_plan_already_synced',
        record_count: 0,
        recorded_count: 0,
        failed_count: 0,
      },
    }, { dryRun, now });
  }
  if (reconciliationPlan.status !== 'ready') {
    return persistReconciliationExecutionResult({
      ...base,
      status: 'refused',
      refusal_reason: 'reconciliation_plan_not_ready',
      filesystem_mutation_admission: 'reconciliation_execution_artifact_write_only',
      command_blockers: selectedSites.flatMap((site) => site.command_blockers ?? []),
      results: selectedSites.map((site) => ({
        site_id: site.site_id,
        status: 'refused',
        reason: site.command_status === 'ready' ? 'reconciliation_plan_not_ready' : 'site_sync_command_not_ready',
        command_status: site.command_status,
        command_blockers: site.command_blockers ?? [],
      })),
    }, { dryRun, now });
  }
  const timeout = normalizeExecutionTimeoutMs(executionTimeoutMs);
  const results = [];
  for (const site of selectedSites) {
    const args = [
      plan.sync_entrypoint,
      'sync-once',
      '--site',
      site.site_id,
      '--packet',
      site.packet_path,
      '--out',
      site.output_path,
      '--local-inbound-dir',
      site.local_inbound_directory,
    ];
    try {
      await execFileImpl(process.execPath, args, { cwd: plan.repo_root, timeout, windowsHide: true });
      results.push({
        site_id: site.site_id,
        status: 'completed',
        reason: 'sync_once_completed',
        argv: [process.execPath, ...args],
        output_path: site.output_path,
        output_summary: readLastSyncArtifact(site.output_path),
      });
    } catch (error) {
      results.push({
        site_id: site.site_id,
        status: 'failed',
        reason: 'sync_once_failed',
        argv: [process.execPath, ...args],
        output_path: site.output_path,
        exit_code: error.code ?? null,
        signal: error.signal ?? null,
        output_summary: readLastSyncArtifact(site.output_path),
      });
    }
  }
  const completedCount = results.filter((result) => result.status === 'completed').length;
  const failedCount = results.filter((result) => result.status === 'failed').length;
  const persisted = persistReconciliationExecutionResult({
    ...base,
    status: failedCount === 0 ? 'completed' : completedCount > 0 ? 'partial' : 'failed',
    cloudflare_mutation_admission: 'executed_via_guarded_site_continuity_sync_once_and_records_reconciliation_execution_evidence',
    filesystem_mutation_admission: 'sync_once_inbound_packet_and_reconciliation_execution_artifact_write_only',
    execution_timeout_ms: timeout,
    executed_site_count: results.length,
    completed_site_count: completedCount,
    failed_site_count: failedCount,
    results,
  }, { dryRun, now });
  const cloudflareReconciliationExecutionEvidence = await recordCloudflareReconciliationExecutionEvidence(persisted, plan, {
    execFileImpl,
    timeout,
  });
  return persistReconciliationExecutionResult({
    ...persisted,
    cloudflare_reconciliation_execution_evidence: cloudflareReconciliationExecutionEvidence,
  }, { dryRun, now });
}

async function recordCloudflareReconciliationExecutionEvidence(result, plan, { execFileImpl = execFile, timeout = DEFAULT_RECONCILE_EXECUTION_TIMEOUT_MS } = {}) {
  const artifactPath = result?.reconciliation_execution_artifact?.artifact_path ?? null;
  if (!artifactPath || result?.reconciliation_execution_artifact?.state !== 'written') {
    return { state: 'skipped', status: 'not_recorded', reason: 'reconciliation_execution_artifact_not_written' };
  }
  const siteIds = [...new Set((result.results ?? []).map((entry) => entry?.site_id).filter(Boolean))];
  if (siteIds.length === 0) return { state: 'skipped', status: 'not_recorded', reason: 'reconciliation_execution_site_id_missing' };
  const records = [];
  for (const siteId of siteIds) {
    const args = [
      plan.sync_entrypoint,
      'reconciliation-execution-put',
      '--site',
      siteId,
      '--execution',
      artifactPath,
    ];
    try {
      await execFileImpl(process.execPath, args, { cwd: plan.repo_root, timeout, windowsHide: true });
      records.push({ site_id: siteId, status: 'recorded', argv: [process.execPath, ...args] });
    } catch (error) {
      records.push({
        site_id: siteId,
        status: 'failed',
        reason: 'reconciliation_execution_evidence_push_failed',
        argv: [process.execPath, ...args],
        exit_code: error.code ?? null,
        signal: error.signal ?? null,
      });
    }
  }
  const recordedCount = records.filter((record) => record.status === 'recorded').length;
  const failedCount = records.filter((record) => record.status === 'failed').length;
  return {
    state: failedCount === 0 ? 'recorded' : recordedCount > 0 ? 'partial' : 'failed',
    status: failedCount === 0 ? 'recorded' : 'needs_attention',
    record_count: records.length,
    recorded_count: recordedCount,
    failed_count: failedCount,
    records,
  };
}

function persistReconciliationExecutionResult(result, { dryRun = true, now = () => new Date().toISOString() } = {}) {
  if (dryRun) return result;
  const outputPath = result.reconciliation_execution_output_path;
  if (!outputPath) {
    return {
      ...result,
      reconciliation_execution_artifact: {
        state: 'not_configured',
        written: false,
        status: 'needs_configuration',
      },
    };
  }
  try {
    mkdirSync(dirname(outputPath), { recursive: true });
    const artifact = {
      ...result,
      persisted_at: now(),
    };
    writeFileSync(outputPath, `${JSON.stringify(artifact, null, 2)}\n`, 'utf8');
    return {
      ...result,
      reconciliation_execution_artifact: {
        state: 'written',
        written: true,
        artifact_path: outputPath,
        status: 'recorded',
        persisted_at: artifact.persisted_at,
      },
    };
  } catch (error) {
    return {
      ...result,
      reconciliation_execution_artifact: {
        state: 'write_failed',
        written: false,
        artifact_path: outputPath,
        status: 'needs_attention',
        error: error.message,
      },
    };
  }
}

export async function buildSiteContinuitySchedulerPlanWithOptionalRefresh(
  options = {},
  { env = process.env, materializeSiteRegistryProjection = materializeCloudflareSiteRegistryProjection } = {},
) {
  if (!options.refreshSiteRegistryProjection) return buildSiteContinuitySchedulerPlan(options);

  const root = resolve(options.repoRoot ?? resolve(dirname(fileURLToPath(import.meta.url)), '../../..'));
  const projectionRefresh = await refreshSiteRegistryProjection({
    ...options,
    repoRoot: root,
    env,
    materializeSiteRegistryProjection,
  });
  return {
    ...buildSiteContinuitySchedulerPlan({ ...options, repoRoot: root }),
    site_registry_projection_refresh: projectionRefresh,
  };
}

async function refreshSiteRegistryProjection({
  repoRoot,
  siteRegistryProjectionPath = process.env.NARADA_CLOUDFLARE_SITE_REGISTRY_PROJECTION ?? '.narada/site-registry/cloudflare-sites.json',
  projectionWorkerUrl = null,
  projectionToken = null,
  projectionTokenFile = null,
  envPath = null,
  env = process.env,
  materializeSiteRegistryProjection,
}) {
  try {
    const inputs = resolveCloudflareSiteRegistryProjectionInputs({
      repoRoot,
      env,
      args: {
        outputPath: siteRegistryProjectionPath,
        workerUrl: projectionWorkerUrl,
        token: projectionToken,
        tokenFile: projectionTokenFile,
        envPath,
        dryRun: false,
      },
    });
    const result = await materializeSiteRegistryProjection(inputs);
    return summarizeSiteRegistryProjectionRefresh(result);
  } catch (error) {
    return {
      schema: 'narada.cloudflare_site_registry.local_projection_refresh_summary.v1',
      status: 'failed',
      reason: error.message,
      output_path: siteRegistryProjectionPath ? resolvePath(repoRoot, siteRegistryProjectionPath) : null,
      embeds_credentials: false,
      written: false,
    };
  }
}

function summarizeSiteRegistryProjectionRefresh(result) {
  return {
    schema: 'narada.cloudflare_site_registry.local_projection_refresh_summary.v1',
    status: result?.status ?? 'failed',
    reason: result?.reason ?? null,
    http_status: result?.http_status ?? null,
    code: result?.code ?? null,
    worker_url: result?.worker_url ?? null,
    token_source: result?.token_source ?? null,
    output_path: result?.output_path ?? null,
    written: result?.written ?? false,
    embeds_credentials: false,
    site_count: result?.projection?.site_count ?? null,
    generated_at: result?.projection?.generated_at ?? null,
  };
}

export function readLocalSyncArtifactInventory(
  artifactDirectory,
  { lastOutputPath = null, configuredSites = [], maxArtifactAgeMinutes = DEFAULT_MAX_SYNC_ARTIFACT_AGE_MINUTES, now = () => new Date().toISOString() } = {},
) {
  const configuredSiteRecords = normalizeConfiguredSiteRecords(configuredSites);
  const normalizedConfiguredSites = configuredSiteRecords.map((site) => site.site_id);
  const effectiveMaxArtifactAgeMinutes = normalizeMaxArtifactAgeMinutes(maxArtifactAgeMinutes);
  if (!artifactDirectory) {
    return {
      state: 'not_configured',
      artifact_directory: null,
      artifact_count: 0,
      configured_site_count: normalizedConfiguredSites.length,
      max_sync_artifact_age_minutes: effectiveMaxArtifactAgeMinutes,
      status: 'needs_configuration',
      artifacts: [],
      configured_site_sync_statuses: buildConfiguredSiteSyncStatuses(configuredSiteRecords, [], { maxArtifactAgeMinutes: effectiveMaxArtifactAgeMinutes, now }),
    };
  }
  if (!existsSync(artifactDirectory)) {
    return {
      state: 'missing_directory',
      artifact_directory: artifactDirectory,
      artifact_count: 0,
      configured_site_count: normalizedConfiguredSites.length,
      max_sync_artifact_age_minutes: effectiveMaxArtifactAgeMinutes,
      status: normalizedConfiguredSites.length > 0 ? 'needs_attention' : 'never_synced',
      artifacts: [],
      configured_site_sync_statuses: buildConfiguredSiteSyncStatuses(configuredSiteRecords, [], { maxArtifactAgeMinutes: effectiveMaxArtifactAgeMinutes, now }),
      last_sync: lastOutputPath ? readLastSyncArtifact(lastOutputPath) : null,
    };
  }
  const allArtifactSummaries = readdirSync(artifactDirectory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
    .map((entry) => readLastSyncArtifact(join(artifactDirectory, entry.name)))
    .filter((artifact) => isContinuitySyncArtifactSummary(artifact, lastOutputPath));
  const artifacts = allArtifactSummaries
    .sort(compareArtifactSummaries);
  const configuredSiteSyncStatuses = buildConfiguredSiteSyncStatuses(configuredSiteRecords, artifacts, { maxArtifactAgeMinutes: effectiveMaxArtifactAgeMinutes, now });
  const needsAttention = artifacts.some((artifact) => artifact.status !== 'synced')
    || configuredSiteSyncStatuses.some((site) => site.status !== 'synced');
  const lastSync = lastOutputPath ? readLastSyncArtifact(lastOutputPath) : null;
  return {
    state: 'read',
    artifact_directory: artifactDirectory,
    artifact_count: artifacts.length,
    configured_site_count: normalizedConfiguredSites.length,
    max_sync_artifact_age_minutes: effectiveMaxArtifactAgeMinutes,
    status: artifacts.length === 0 && normalizedConfiguredSites.length === 0 ? 'never_synced' : needsAttention ? 'needs_attention' : 'synced',
    last_sync: lastSync,
    artifacts,
    configured_site_sync_statuses: configuredSiteSyncStatuses,
  };
}

export function readLocalInboundPacketInventory(
  inboundDirectory,
  { configuredSites = [], maxArtifactAgeMinutes = DEFAULT_MAX_SYNC_ARTIFACT_AGE_MINUTES, now = () => new Date().toISOString() } = {},
) {
  const configuredSiteRecords = normalizeConfiguredSiteRecords(configuredSites);
  const normalizedConfiguredSites = configuredSiteRecords.map((site) => site.site_id);
  const effectiveMaxArtifactAgeMinutes = normalizeMaxArtifactAgeMinutes(maxArtifactAgeMinutes);
  if (!inboundDirectory) {
    return {
      state: 'not_configured',
      artifact_directory: null,
      artifact_count: 0,
      configured_site_count: normalizedConfiguredSites.length,
      max_inbound_artifact_age_minutes: effectiveMaxArtifactAgeMinutes,
      status: 'needs_configuration',
      artifacts: [],
      configured_site_inbound_statuses: buildConfiguredSiteInboundStatuses(configuredSiteRecords, [], { maxArtifactAgeMinutes: effectiveMaxArtifactAgeMinutes, now }),
    };
  }
  if (!existsSync(inboundDirectory)) {
    return {
      state: 'missing_directory',
      artifact_directory: inboundDirectory,
      artifact_count: 0,
      configured_site_count: normalizedConfiguredSites.length,
      max_inbound_artifact_age_minutes: effectiveMaxArtifactAgeMinutes,
      status: normalizedConfiguredSites.length > 0 ? 'needs_attention' : 'never_observed',
      artifacts: [],
      configured_site_inbound_statuses: buildConfiguredSiteInboundStatuses(configuredSiteRecords, [], { maxArtifactAgeMinutes: effectiveMaxArtifactAgeMinutes, now }),
    };
  }
  const artifacts = readdirSync(inboundDirectory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
    .map((entry) => readLocalInboundPacketArtifact(join(inboundDirectory, entry.name)))
    .filter((artifact) => artifact.artifact_present)
    .sort(compareArtifactSummaries);
  const configuredSiteInboundStatuses = buildConfiguredSiteInboundStatuses(configuredSiteRecords, artifacts, { maxArtifactAgeMinutes: effectiveMaxArtifactAgeMinutes, now });
  const needsAttention = artifacts.some((artifact) => artifact.status !== 'synced')
    || configuredSiteInboundStatuses.some((site) => site.status !== 'synced');
  return {
    schema: 'narada.cloudflare_carrier.local_inbound_packet_inventory.v1',
    state: 'read',
    artifact_directory: inboundDirectory,
    artifact_count: artifacts.length,
    configured_site_count: normalizedConfiguredSites.length,
    max_inbound_artifact_age_minutes: effectiveMaxArtifactAgeMinutes,
    status: artifacts.length === 0 && normalizedConfiguredSites.length === 0 ? 'never_observed' : needsAttention ? 'needs_attention' : 'synced',
    artifacts,
    configured_site_inbound_statuses: configuredSiteInboundStatuses,
  };
}

export function readLocalInboundPacketArtifact(outputPath) {
  if (!outputPath) {
    return {
      state: 'not_configured',
      artifact_present: false,
      status: 'needs_configuration',
    };
  }
  if (!existsSync(outputPath)) {
    return {
      state: 'missing',
      artifact_path: outputPath,
      artifact_present: false,
      status: 'never_observed',
    };
  }
  const stat = statSync(outputPath);
  let artifact;
  try {
    artifact = JSON.parse(readFileSync(outputPath, 'utf8'));
  } catch (error) {
    return {
      state: 'invalid_json',
      artifact_path: outputPath,
      artifact_present: true,
      artifact_updated_at: stat.mtime.toISOString(),
      status: 'needs_attention',
      reason: 'local_inbound_packet_artifact_json_invalid',
      error: error.message,
    };
  }
  if (artifact?.schema !== 'narada.site_continuity_cloudflare_to_local_windows_inbound_packet.v1') {
    return {
      state: 'unsupported_schema',
      artifact_path: outputPath,
      artifact_present: true,
      artifact_updated_at: stat.mtime.toISOString(),
      status: 'needs_attention',
      schema: artifact?.schema ?? null,
      site_id: artifact?.site_id ?? null,
      reason: 'unsupported_local_inbound_packet_artifact_schema',
    };
  }
  const packet = artifact.packet ?? null;
  const status = artifact.status === 'ok'
    && artifact.cloudflare_to_local_windows_admission_action === 'projection_only'
    && artifact.packet_source_embodiment_kind === SITE_CONTINUITY_EMBODIMENT_KINDS.CLOUDFLARE_CARRIER
    && artifact.packet_target_embodiment_kind === SITE_CONTINUITY_EMBODIMENT_KINDS.LOCAL_WINDOWS
    ? 'synced'
    : 'needs_attention';
  return {
    state: 'read',
    artifact_path: outputPath,
    artifact_present: true,
    artifact_updated_at: stat.mtime.toISOString(),
    status,
    schema: artifact.schema,
    site_id: artifact.site_id ?? packet?.site_id ?? null,
    generated_at: artifact.generated_at ?? null,
    packet_id: artifact.packet_id ?? packet?.packet_id ?? null,
    cloudflare_to_local_windows_admission_action: artifact.cloudflare_to_local_windows_admission_action ?? null,
    cloudflare_to_local_windows_admission_reason: artifact.cloudflare_to_local_windows_admission_reason ?? null,
    packet_source_embodiment_kind: artifact.packet_source_embodiment_kind ?? packet?.source_embodiment_kind ?? null,
    packet_target_embodiment_kind: artifact.packet_target_embodiment_kind ?? packet?.target_embodiment_kind ?? null,
    filesystem_mutation_admission: artifact.filesystem_mutation_admission ?? null,
  };
}

export function buildSiteContinuityReconciliationPlan({
  localSyncArtifacts,
  nodeCommand = resolveDefaultNodeCommand(),
  syncEntryPoint,
  packetPath = null,
  packetDirectory = null,
  artifactDirectory = null,
} = {}) {
  const configuredStatuses = localSyncArtifacts?.configured_site_sync_statuses ?? [];
  const selectedSites = configuredStatuses
    .filter((site) => site.status !== 'synced')
    .map((site) => buildReconciliationSiteAction(site, { nodeCommand, syncEntryPoint, packetPath, packetDirectory, artifactDirectory }));
  const packetSummary = packetDirectory ? null : readSiteContinuityPacketSummary(packetPath);
  const commandReadyCount = selectedSites.filter((site) => site.command_status === 'ready').length;
  return {
    schema: 'narada.cloudflare_carrier.site_continuity_reconciliation_plan.v1',
    status: selectedSites.length === 0 ? 'synced' : commandReadyCount === selectedSites.length ? 'ready' : 'needs_configuration',
    read_only: true,
    executes_cloudflare_mutation: false,
    writes_local_artifacts: false,
    cloudflare_mutation_admission: 'not_executed_plan_only',
    filesystem_mutation_admission: 'not_executed_plan_only',
    selected_site_count: selectedSites.length,
    command_ready_count: commandReadyCount,
    packet_summary: packetSummary,
    packet_directory: packetDirectory,
    packet_resolution: packetDirectory ? 'per_site_packet_directory' : 'single_packet_path',
    selected_reason_counts: countSelectedReasons(selectedSites),
    selected_sites: selectedSites,
  };
}

export function readLocalConfiguredSites({ root, explicitSites = null, siteContinuityBindingRegistryPath = null, sitesFilePath = null, siteRegistryProjectionPath = null } = {}) {
  const sources = [];
  const explicit = normalizeConfiguredSiteList(explicitSites);
  if (explicit.length > 0) {
    sources.push('explicit_sites');
  }
  const siteContinuityBindingRegistry = readSiteContinuityBindingRegistryFile(siteContinuityBindingRegistryPath);
  if (siteContinuityBindingRegistry.state === 'read' && siteContinuityBindingRegistry.sites.length > 0) {
    sources.push('site_continuity_binding_registry');
  }
  const fileSites = readConfiguredSitesFile(sitesFilePath);
  if (fileSites.state === 'read' && fileSites.sites.length > 0) {
    sources.push('sites_file');
  }
  const siteRegistryProjection = readCloudflareSiteRegistryLocalProjection(siteRegistryProjectionPath);
  if (siteRegistryProjection.state === 'read' && siteRegistryProjection.sites.length > 0) {
    sources.push('cloudflare_site_registry_local_projection');
  }
  const envSites = readConfiguredSitesFromEnvFile(root ? resolve(root, '.env') : null);
  if (envSites.sites.length > 0) {
    sources.push('safe_env_file_site_keys');
  }
  const processSites = normalizeConfiguredSiteList([
    process.env.CLOUDFLARE_CARRIER_SITE_ID,
    process.env.NARADA_SITE_CONTINUITY_SITE_ID,
    process.env.NARADA_SITE_CONTINUITY_SITES,
  ]);
  if (processSites.length > 0) {
    sources.push('process_environment_site_keys');
  }
  const selectedSource = [
    ['explicit_sites', explicit],
    ['site_continuity_binding_registry', siteContinuityBindingRegistry.sites],
    ['sites_file', fileSites.sites],
    ['safe_env_file_site_keys', envSites.sites],
    ['process_environment_site_keys', processSites],
    ['cloudflare_site_registry_local_projection', siteRegistryProjection.sites],
  ].find(([, sites]) => sites.length > 0) ?? ['not_configured', []];
  const [selectionSource, selectedSites] = selectedSource;
  const normalizedSites = normalizeConfiguredSiteList(selectedSites);
  const bindingRecordBySiteId = new Map(normalizeConfiguredSiteRecords(siteContinuityBindingRegistry.site_records ?? [])
    .map((site) => [site.site_id, site]));
  const registryRecordBySiteId = new Map(normalizeConfiguredSiteRecords(siteRegistryProjection.site_records ?? [])
    .map((site) => [site.site_id, site]));
  const siteRecords = normalizeConfiguredSiteRecords(normalizedSites.map((siteId) => ({
    ...(bindingRecordBySiteId.get(siteId) ?? {}),
    ...(registryRecordBySiteId.get(siteId) ?? {}),
    site_id: siteId,
  })));
  return {
    state: normalizedSites.length > 0 ? 'configured' : 'not_configured',
    sources,
    selection_source: selectionSource,
    site_count: normalizedSites.length,
    sites: normalizedSites,
    site_records: siteRecords,
    site_continuity_binding_registry: siteContinuityBindingRegistry,
    sites_file: fileSites,
    site_registry_projection: siteRegistryProjection,
  };
}

export function readLastSyncArtifact(outputPath) {
  if (!outputPath) {
    return {
      state: 'not_configured',
      artifact_present: false,
      status: 'needs_configuration',
    };
  }
  if (!existsSync(outputPath)) {
    return {
      state: 'missing',
      artifact_path: outputPath,
      artifact_present: false,
      status: 'never_synced',
    };
  }
  const stat = statSync(outputPath);
  let artifact;
  try {
    artifact = JSON.parse(readFileSync(outputPath, 'utf8'));
  } catch (error) {
    return {
      state: 'invalid_json',
      artifact_path: outputPath,
      artifact_present: true,
      artifact_updated_at: stat.mtime.toISOString(),
      status: 'needs_attention',
      reason: 'last_sync_artifact_json_invalid',
      error: error.message,
    };
  }
  const loopReport = artifact?.continuity_loop_report ?? null;
  const cloudflarePush = loopReport?.cloudflare_push ?? null;
  const status = artifact?.status === 'ok' && loopReport?.status === 'ok' ? 'synced' : 'needs_attention';
  return {
    state: 'read',
    artifact_path: outputPath,
    artifact_present: true,
    artifact_updated_at: stat.mtime.toISOString(),
    status,
    schema: artifact?.schema ?? null,
    site_id: artifact?.site_id ?? loopReport?.site_id ?? null,
    worker_url: artifact?.worker_url ?? loopReport?.cloudflare_worker_url ?? null,
    generated_at: loopReport?.generated_at ?? null,
    pushed_packet_id: artifact?.pushed_packet_id ?? cloudflarePush?.pushed_packet_id ?? null,
    pulled_packet_id: artifact?.pulled_packet_id ?? cloudflarePush?.returned_packet_id ?? null,
    cloudflare_push_status: cloudflarePush?.status ?? null,
    cloudflare_push_durability_action: cloudflarePush?.durability_action ?? null,
    cloudflare_push_imported_at: cloudflarePush?.imported_at ?? null,
    cloudflare_push_previous_imported_at: cloudflarePush?.previous_imported_at ?? null,
    continuity_loop_report_recorded: artifact?.continuity_loop_report_recorded ?? null,
  };
}

export function readLastReconciliationExecutionArtifact(outputPath) {
  if (!outputPath) {
    return {
      state: 'not_configured',
      artifact_present: false,
      status: 'needs_configuration',
    };
  }
  if (!existsSync(outputPath)) {
    return {
      state: 'missing',
      artifact_path: outputPath,
      artifact_present: false,
      status: 'never_executed',
    };
  }
  const stat = statSync(outputPath);
  let artifact;
  try {
    artifact = JSON.parse(readFileSync(outputPath, 'utf8'));
  } catch (error) {
    return {
      state: 'invalid_json',
      artifact_path: outputPath,
      artifact_present: true,
      artifact_updated_at: stat.mtime.toISOString(),
      status: 'needs_attention',
      reason: 'reconciliation_execution_artifact_json_invalid',
      error: error.message,
    };
  }
  if (artifact?.schema !== 'narada.cloudflare_carrier.site_continuity_reconciliation_execution.v1') {
    return {
      state: 'unsupported_schema',
      artifact_path: outputPath,
      artifact_present: true,
      artifact_updated_at: stat.mtime.toISOString(),
      status: 'needs_attention',
      schema: artifact?.schema ?? null,
      reason: 'unsupported_reconciliation_execution_artifact_schema',
    };
  }
  return {
    state: 'read',
    artifact_path: outputPath,
    artifact_present: true,
    artifact_updated_at: stat.mtime.toISOString(),
    status: artifact.status ?? 'unknown',
    schema: artifact.schema,
    generated_at: artifact.generated_at ?? null,
    persisted_at: artifact.persisted_at ?? null,
    reconciliation_plan_status: artifact.reconciliation_plan_status ?? null,
    selected_site_count: artifact.selected_site_count ?? 0,
    executed_site_count: artifact.executed_site_count ?? 0,
    completed_site_count: artifact.completed_site_count ?? 0,
    failed_site_count: artifact.failed_site_count ?? 0,
    refusal_reason: artifact.refusal_reason ?? null,
    cloudflare_mutation_admission: artifact.cloudflare_mutation_admission ?? null,
    filesystem_mutation_admission: artifact.filesystem_mutation_admission ?? null,
    cloudflare_reconciliation_execution_evidence_state: artifact.cloudflare_reconciliation_execution_evidence?.state ?? null,
    cloudflare_reconciliation_execution_evidence_status: artifact.cloudflare_reconciliation_execution_evidence?.status ?? null,
    cloudflare_reconciliation_execution_recorded_count: artifact.cloudflare_reconciliation_execution_evidence?.recorded_count ?? null,
    cloudflare_reconciliation_execution_failed_count: artifact.cloudflare_reconciliation_execution_evidence?.failed_count ?? null,
    result_status_counts: countResultStatuses(artifact.results ?? []),
  };
}

export function readLastScheduledHealthSnapshot(outputPath) {
  if (!outputPath) {
    return {
      state: 'not_configured',
      artifact_present: false,
      status: 'needs_configuration',
    };
  }
  if (!existsSync(outputPath)) {
    return {
      state: 'missing',
      artifact_path: outputPath,
      artifact_present: false,
      status: 'never_recorded',
    };
  }
  const stat = statSync(outputPath);
  let artifact;
  try {
    artifact = JSON.parse(readFileSync(outputPath, 'utf8'));
  } catch (error) {
    return {
      state: 'invalid_json',
      artifact_path: outputPath,
      artifact_present: true,
      artifact_updated_at: stat.mtime.toISOString(),
      status: 'needs_attention',
      reason: 'scheduled_health_snapshot_json_invalid',
      error: error.message,
    };
  }
  if (artifact?.schema !== 'narada.cloudflare_carrier.site_continuity_scheduled_health_snapshot.v1') {
    return {
      state: 'unsupported_schema',
      artifact_path: outputPath,
      artifact_present: true,
      artifact_updated_at: stat.mtime.toISOString(),
      status: 'needs_attention',
      schema: artifact?.schema ?? null,
      reason: 'unsupported_scheduled_health_snapshot_schema',
    };
  }
  const operatorNextAction = summarizeScheduledHealthOperatorNextAction(artifact);
  return {
    state: 'read',
    artifact_path: outputPath,
    artifact_present: true,
    artifact_updated_at: stat.mtime.toISOString(),
    status: artifact.status ?? 'unknown',
    schema: artifact.schema,
    generated_at: artifact.generated_at ?? null,
    persisted_at: artifact.persisted_at ?? null,
    trigger: artifact.trigger ?? null,
    embeds_credentials: artifact.embeds_credentials === false ? false : null,
    reconciliation_execution_status: artifact.reconciliation_execution?.status ?? null,
    reconciliation_plan_status: artifact.reconciliation_execution?.reconciliation_plan_status ?? null,
    selected_site_count: artifact.reconciliation_execution?.selected_site_count ?? 0,
    executed_site_count: artifact.reconciliation_execution?.executed_site_count ?? 0,
    completed_site_count: artifact.reconciliation_execution?.completed_site_count ?? 0,
    failed_site_count: artifact.reconciliation_execution?.failed_site_count ?? 0,
    continuity_health_status: artifact.continuity_health?.status ?? null,
    continuity_health_attention_reasons: artifact.continuity_health?.attention_reasons ?? [],
    cloudflare_product_posture_state: artifact.cloudflare_product_posture?.state ?? null,
    cloudflare_product_posture_status: artifact.cloudflare_product_posture?.status ?? null,
    cloudflare_product_next_site_id: artifact.cloudflare_product_posture?.summary?.next_site_id ?? null,
    cloudflare_product_next_action: artifact.cloudflare_product_posture?.summary?.next_action ?? null,
    cloudflare_product_binding_alignment_state: artifact.cloudflare_product_binding_alignment?.state ?? null,
    cloudflare_product_binding_alignment_status: artifact.cloudflare_product_binding_alignment?.status ?? null,
    cloudflare_product_binding_alignment_reason: artifact.cloudflare_product_binding_alignment?.reason ?? null,
    cloudflare_product_binding_preparation_state: artifact.cloudflare_product_binding_preparation?.state ?? null,
    cloudflare_product_binding_preparation_status: artifact.cloudflare_product_binding_preparation?.status ?? null,
    cloudflare_product_binding_preparation_reason: artifact.cloudflare_product_binding_preparation?.reason ?? null,
    cloudflare_product_binding_preparation_required_inputs: artifact.cloudflare_product_binding_preparation?.required_inputs ?? [],
    operator_next_action: operatorNextAction.action,
    operator_next_target_site_id: operatorNextAction.target_site_id,
    operator_next_reason: operatorNextAction.reason,
    operator_next_source: operatorNextAction.source,
    cloudflare_operation_posture_state: artifact.cloudflare_operation_posture?.state ?? null,
    cloudflare_operation_posture_status: artifact.cloudflare_operation_posture?.status ?? null,
    cloudflare_operation_next_operation_id: artifact.cloudflare_operation_posture?.summary?.next_operation_id ?? null,
    cloudflare_operation_next_action: artifact.cloudflare_operation_posture?.summary?.next_action ?? null,
    scheduler_task_readback_status: artifact.scheduler_task_readback?.status ?? null,
    scheduler_task_status_text: artifact.scheduler_task_readback?.status_text ?? null,
    scheduler_last_result: artifact.scheduler_task_readback?.last_result ?? null,
    scheduler_next_run_time: artifact.scheduler_task_readback?.next_run_time ?? null,
  };
}

export function summarizeScheduledHealthOperatorNextAction(artifact) {
  const bindingAlignment = artifact?.cloudflare_product_binding_alignment ?? null;
  if (bindingAlignment?.state === 'unbound_remote_next_site') {
    return {
      action: 'bind_cloudflare_product_next_site_locally',
      target_site_id: bindingAlignment.cloudflare_product_next_site_id ?? artifact?.cloudflare_product_posture?.summary?.next_site_id ?? null,
      reason: bindingAlignment.reason ?? 'cloudflare_product_next_site_not_in_local_continuity_set',
      source: 'cloudflare_product_binding_alignment',
    };
  }
  const continuityAttentionReasons = artifact?.continuity_health?.attention_reasons ?? [];
  if (Array.isArray(continuityAttentionReasons) && continuityAttentionReasons.length > 0) {
    return {
      action: 'inspect_local_continuity_health',
      target_site_id: artifact?.cloudflare_product_posture?.summary?.next_site_id ?? null,
      reason: continuityAttentionReasons[0],
      source: 'continuity_health',
    };
  }
  const operationNextAction = artifact?.cloudflare_operation_posture?.summary?.next_action ?? null;
  if (operationNextAction) {
    return {
      action: operationNextAction,
      target_site_id: artifact?.cloudflare_operation_posture?.summary?.site_id ?? null,
      reason: artifact?.cloudflare_operation_posture?.summary?.next_reason ?? null,
      source: 'cloudflare_operation_posture',
    };
  }
  const productNextAction = artifact?.cloudflare_product_posture?.summary?.next_action ?? null;
  if (productNextAction) {
    return {
      action: productNextAction,
      target_site_id: artifact?.cloudflare_product_posture?.summary?.next_site_id ?? null,
      reason: artifact?.cloudflare_product_posture?.site_product_overview?.next_reason ?? null,
      source: 'cloudflare_product_posture',
    };
  }
  return {
    action: 'monitor_continuity_health',
    target_site_id: null,
    reason: artifact?.status ?? null,
    source: 'scheduled_health_snapshot',
  };
}

export function readLocalSchedulerStatus({ root, syncEntryPoint, taskEntryPoint, localRoot, packetPath, packetDirectory = null, outputPath, configuredSites = null }) {
  const envPath = resolve(root, '.env');
  const envKeys = existsSync(envPath) ? readEnvKeys(envPath) : [];
  return {
    state: 'not_queried',
    task_scheduler_query_required: true,
    repo_root_exists: existsSync(root),
    sync_entrypoint_exists: existsSync(syncEntryPoint),
    scheduled_task_entrypoint_exists: existsSync(taskEntryPoint),
    local_root_exists: existsSync(localRoot),
    packet_path_exists: packetPath ? existsSync(packetPath) : false,
    packet_directory_exists: packetDirectory ? existsSync(packetDirectory) : false,
    output_path_parent_exists: outputPath ? existsSync(dirname(outputPath)) : false,
    env_file_present: existsSync(envPath),
    required_env_keys_observed: [
      'CLOUDFLARE_CARRIER_URL',
      envKeys.includes('CLOUDFLARE_CARRIER_TOKEN_FILE') ? 'CLOUDFLARE_CARRIER_TOKEN_FILE' : envKeys.includes('CLOUDFLARE_CARRIER_TOKEN') ? 'CLOUDFLARE_CARRIER_TOKEN' : null,
    ].filter(Boolean),
    site_configured: Boolean(process.env.CLOUDFLARE_CARRIER_SITE_ID || process.env.NARADA_SITE_CONTINUITY_SITE_ID || configuredSites?.site_count > 0),
    packet_configured: Boolean(process.env.NARADA_SITE_CONTINUITY_PACKET || process.env.NARADA_SITE_CONTINUITY_PACKET_DIR || packetPath || packetDirectory),
    command_args_complete: Boolean((packetPath || packetDirectory) && outputPath),
    embeds_credentials: false,
  };
}

function buildTaskCommand({ nodeCommand, entrypoint }) {
  const parts = [quote(nodeCommand), quote(entrypoint)];
  return parts.join(' ');
}

function buildHiddenTaskCommand({ wrapperPath }) {
  return [
    'wscript.exe',
    '//B',
    quote(wrapperPath),
  ].join(' ');
}

export function buildHiddenVbsWrapperContent(command) {
  return [
    'Set shell = CreateObject("WScript.Shell")',
    `shell.Run ${vbsString(command)}, 0, False`,
    '',
  ].join('\r\n');
}

function writeHiddenWrapper({ wrapperPath, content }) {
  mkdirSync(dirname(wrapperPath), { recursive: true });
  writeFileSync(wrapperPath, content, 'utf8');
}

function readEnvKeys(envPath) {
  const keys = [];
  const content = readFileSync(envPath, 'utf8');
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq > 0) keys.push(trimmed.slice(0, eq).trim());
  }
  return keys;
}

function readConfiguredSitesFromEnvFile(envPath) {
  if (!envPath || !existsSync(envPath)) return { state: 'missing', sites: [] };
  const values = [];
  const content = readFileSync(envPath, 'utf8');
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    if (!['CLOUDFLARE_CARRIER_SITE_ID', 'NARADA_SITE_CONTINUITY_SITE_ID', 'NARADA_SITE_CONTINUITY_SITES'].includes(key)) continue;
    values.push(stripEnvValueQuotes(trimmed.slice(eq + 1).trim()));
  }
  return { state: 'read', sites: normalizeConfiguredSiteList(values) };
}

function readConfiguredSitesFile(sitesFilePath) {
  if (!sitesFilePath) return { state: 'not_configured', path: null, sites: [] };
  if (!existsSync(sitesFilePath)) return { state: 'missing', path: sitesFilePath, sites: [] };
  let value;
  try {
    value = JSON.parse(readFileSync(sitesFilePath, 'utf8'));
  } catch (error) {
    return { state: 'invalid_json', path: sitesFilePath, sites: [], reason: 'configured_sites_file_json_invalid', error: error.message };
  }
  const sourceSites = Array.isArray(value) ? value : value?.sites ?? value?.configured_sites ?? [];
  return { state: 'read', path: sitesFilePath, sites: normalizeConfiguredSiteList(sourceSites) };
}

function readSiteContinuityBindingRegistryFile(bindingRegistryPath) {
  if (!bindingRegistryPath) return { state: 'not_configured', path: null, sites: [], site_records: [] };
  if (!existsSync(bindingRegistryPath)) return { state: 'missing', path: bindingRegistryPath, sites: [], site_records: [] };
  let registry;
  try {
    registry = JSON.parse(readFileSync(bindingRegistryPath, 'utf8'));
  } catch (error) {
    return { state: 'invalid_json', path: bindingRegistryPath, sites: [], site_records: [], reason: 'site_continuity_binding_registry_json_invalid', error: error.message };
  }
  const validation = validateSiteContinuityBindingRegistry(registry);
  if (!validation.ok) {
    return {
      state: 'invalid',
      path: bindingRegistryPath,
      sites: [],
      site_records: [],
      reason: 'site_continuity_binding_registry_invalid',
      validation_errors: validation.errors,
    };
  }
  const sites = listSiteContinuityBindingSites(registry);
  const siteRecords = registry.bindings
    .filter((binding) => sites.includes(binding.site_id))
    .map((binding) => {
      const cloudflareEmbodiment = findSiteContinuityEmbodiment(binding, SITE_CONTINUITY_EMBODIMENT_KINDS.CLOUDFLARE_CARRIER);
      const localEmbodiment = findSiteContinuityEmbodiment(binding, SITE_CONTINUITY_EMBODIMENT_KINDS.LOCAL_WINDOWS);
      return {
        site_id: binding.site_id,
        site_ref: cloudflareEmbodiment?.site_ref ?? null,
        ...(cloudflareEmbodiment?.site_ref ? { cloudflare_site_ref: cloudflareEmbodiment.site_ref } : {}),
        ...(localEmbodiment?.site_ref ? { local_site_ref: localEmbodiment.site_ref } : {}),
        site_status: 'active',
      };
    });
  return {
    state: 'read',
    path: bindingRegistryPath,
    schema: registry.schema ?? null,
    binding_count: registry.bindings.length,
    sites,
    site_records: siteRecords,
  };
}

function findSiteContinuityEmbodiment(binding, embodimentKind) {
  return binding?.embodiments?.find((embodiment) => embodiment.embodiment_kind === embodimentKind) ?? null;
}

function normalizeConfiguredSiteList(value) {
  return normalizeConfiguredSiteRecords(value).map((site) => site.site_id);
}

function normalizeConfiguredSiteRecords(value) {
  const values = Array.isArray(value) ? value : [value];
  const siteById = new Map();
  for (const item of values) {
    if (!item) continue;
    if (typeof item === 'string') {
      for (const siteId of item.split(',').map((part) => part.trim()).filter(Boolean)) {
        if (!siteById.has(siteId)) siteById.set(siteId, { site_id: siteId });
      }
    } else if (typeof item === 'object') {
      const siteId = String(item.site_id ?? item.siteId ?? item.id ?? '').trim();
      if (!siteId) continue;
      const existing = siteById.get(siteId) ?? { site_id: siteId };
      siteById.set(siteId, {
        ...existing,
        display_name: item.display_name ?? item.displayName ?? existing.display_name ?? null,
        site_ref: item.site_ref ?? item.siteRef ?? existing.site_ref ?? null,
        ...firstPresentObject('cloudflare_site_ref', item.cloudflare_site_ref, item.cloudflareSiteRef, existing.cloudflare_site_ref),
        ...firstPresentObject('local_site_ref', item.local_site_ref, item.localSiteRef, existing.local_site_ref),
        site_status: item.site_status ?? item.status ?? existing.site_status ?? null,
      });
    }
  }
  return [...siteById.values()].sort((left, right) => left.site_id.localeCompare(right.site_id));
}

function firstPresentObject(key, ...values) {
  const value = values.find((candidate) => candidate !== undefined && candidate !== null && candidate !== '');
  return value === undefined ? {} : { [key]: value };
}

function buildConfiguredSiteSyncStatuses(configuredSites, artifacts, { maxArtifactAgeMinutes = DEFAULT_MAX_SYNC_ARTIFACT_AGE_MINUTES, now = () => new Date().toISOString() } = {}) {
  const configuredSiteRecords = normalizeConfiguredSiteRecords(configuredSites);
  const artifactBySite = new Map();
  for (const artifact of artifacts) {
    if (!artifact?.site_id) continue;
    const existing = artifactBySite.get(artifact.site_id);
    if (!existing || String(artifact.artifact_updated_at ?? '') > String(existing.artifact_updated_at ?? '')) {
      artifactBySite.set(artifact.site_id, artifact);
    }
  }
  const maxArtifactAgeMilliseconds = normalizeMaxArtifactAgeMinutes(maxArtifactAgeMinutes) * 60 * 1000;
  const nowMilliseconds = Date.parse(now());
  return configuredSiteRecords.map((site) => {
    const siteId = site.site_id;
    const artifact = artifactBySite.get(siteId) ?? null;
    const siteMetadata = buildConfiguredSiteMetadata(site);
    if (!artifact) {
      return {
        site_id: siteId,
        ...siteMetadata,
        status: 'needs_attention',
        reason: 'configured_site_sync_artifact_missing',
        artifact_present: false,
      };
    }
    const artifactAgeMilliseconds = Number.isFinite(nowMilliseconds) && artifact.artifact_updated_at
      ? nowMilliseconds - Date.parse(artifact.artifact_updated_at)
      : null;
    const artifactIsStale = artifact.status === 'synced'
      && Number.isFinite(artifactAgeMilliseconds)
      && artifactAgeMilliseconds > maxArtifactAgeMilliseconds;
    return {
      site_id: siteId,
      ...siteMetadata,
      status: artifactIsStale ? 'needs_attention' : artifact.status,
      reason: artifactIsStale ? 'configured_site_sync_artifact_stale' : artifact.status === 'synced' ? 'matching_sync_artifact_synced' : 'matching_sync_artifact_needs_attention',
      artifact_present: true,
      artifact_path: artifact.artifact_path,
      artifact_updated_at: artifact.artifact_updated_at,
      artifact_age_minutes: Number.isFinite(artifactAgeMilliseconds) ? Math.max(0, Math.floor(artifactAgeMilliseconds / 60000)) : null,
      max_sync_artifact_age_minutes: normalizeMaxArtifactAgeMinutes(maxArtifactAgeMinutes),
      pushed_packet_id: artifact.pushed_packet_id,
      pulled_packet_id: artifact.pulled_packet_id,
    };
  });
}

function buildConfiguredSiteInboundStatuses(configuredSites, artifacts, { maxArtifactAgeMinutes = DEFAULT_MAX_SYNC_ARTIFACT_AGE_MINUTES, now = () => new Date().toISOString() } = {}) {
  const configuredSiteRecords = normalizeConfiguredSiteRecords(configuredSites);
  const artifactBySite = new Map();
  for (const artifact of artifacts) {
    if (!artifact?.site_id) continue;
    const existing = artifactBySite.get(artifact.site_id);
    if (!existing || String(artifact.artifact_updated_at ?? '') > String(existing.artifact_updated_at ?? '')) {
      artifactBySite.set(artifact.site_id, artifact);
    }
  }
  const maxArtifactAgeMilliseconds = normalizeMaxArtifactAgeMinutes(maxArtifactAgeMinutes) * 60 * 1000;
  const nowMilliseconds = Date.parse(now());
  return configuredSiteRecords.map((site) => {
    const siteId = site.site_id;
    const artifact = artifactBySite.get(siteId) ?? null;
    const siteMetadata = buildConfiguredSiteMetadata(site);
    if (!artifact) {
      return {
        site_id: siteId,
        ...siteMetadata,
        status: 'needs_attention',
        reason: 'configured_site_inbound_packet_missing',
        artifact_present: false,
      };
    }
    const artifactAgeMilliseconds = Number.isFinite(nowMilliseconds) && artifact.artifact_updated_at
      ? nowMilliseconds - Date.parse(artifact.artifact_updated_at)
      : null;
    const artifactIsStale = artifact.status === 'synced'
      && Number.isFinite(artifactAgeMilliseconds)
      && artifactAgeMilliseconds > maxArtifactAgeMilliseconds;
    return {
      site_id: siteId,
      ...siteMetadata,
      status: artifactIsStale ? 'needs_attention' : artifact.status,
      reason: artifactIsStale ? 'configured_site_inbound_packet_stale' : artifact.status === 'synced' ? 'matching_inbound_packet_observed' : 'matching_inbound_packet_needs_attention',
      artifact_present: true,
      artifact_path: artifact.artifact_path,
      artifact_updated_at: artifact.artifact_updated_at,
      artifact_age_minutes: Number.isFinite(artifactAgeMilliseconds) ? Math.max(0, Math.floor(artifactAgeMilliseconds / 60000)) : null,
      max_inbound_artifact_age_minutes: normalizeMaxArtifactAgeMinutes(maxArtifactAgeMinutes),
      packet_id: artifact.packet_id,
      cloudflare_to_local_windows_admission_action: artifact.cloudflare_to_local_windows_admission_action,
    };
  });
}

function buildConfiguredSiteMetadata(site) {
  return {
    display_name: site.display_name ?? null,
    site_ref: site.site_ref ?? null,
    site_status: site.site_status ?? null,
  };
}

function readSiteContinuityPacketSummary(packetPath) {
  if (!packetPath) return { state: 'not_configured', packet_path: null, site_id: null };
  if (!existsSync(packetPath)) return { state: 'missing', packet_path: packetPath, site_id: null };
  try {
    const envelope = JSON.parse(readFileSync(packetPath, 'utf8'));
    const packet = envelope?.packet ?? envelope;
    return {
      state: packet?.site_id ? 'read' : 'site_id_missing',
      packet_path: packetPath,
      site_id: packet?.site_id ?? null,
      packet_id: packet?.packet_id ?? null,
      schema: packet?.schema ?? null,
    };
  } catch (error) {
    return { state: 'invalid_json', packet_path: packetPath, site_id: null, error: error.message };
  }
}

function buildReconciliationSiteAction(site, { nodeCommand, syncEntryPoint, packetPath, packetDirectory = null, artifactDirectory }) {
  const outputPath = artifactDirectory ? join(artifactDirectory, `${safeFileToken(site.site_id)}-cloudflare-sync.json`) : null;
  const localInboundDirectory = artifactDirectory ? join(artifactDirectory, 'inbound') : null;
  const effectivePacketPath = resolveReconciliationPacketPath(site.site_id, { packetPath, packetDirectory });
  const packetSummary = readSiteContinuityPacketSummary(effectivePacketPath);
  const packetSiteId = packetSummary?.site_id ?? null;
  const packetSiteMismatch = Boolean(packetSiteId && site.site_id && packetSiteId !== site.site_id);
  const commandBlockers = [
    syncEntryPoint ? null : 'sync_entrypoint_required',
    effectivePacketPath ? null : 'packet_path_required',
    effectivePacketPath && packetSummary?.state === 'missing' ? 'packet_path_missing' : null,
    effectivePacketPath && packetSummary?.state === 'invalid_json' ? 'packet_json_invalid' : null,
    effectivePacketPath && packetSummary?.state === 'site_id_missing' ? 'packet_site_id_required' : null,
    packetSiteMismatch ? 'packet_site_id_mismatch' : null,
    outputPath ? null : 'artifact_directory_required',
    localInboundDirectory ? null : 'local_inbound_directory_required',
  ].filter(Boolean);
  const commandReady = commandBlockers.length === 0;
  return {
    site_id: site.site_id,
    display_name: site.display_name ?? null,
    site_ref: site.site_ref ?? null,
    site_status: site.site_status ?? null,
    status: site.status,
    reason: site.reason,
    artifact_present: site.artifact_present,
    artifact_path: site.artifact_path ?? null,
    artifact_updated_at: site.artifact_updated_at ?? null,
    artifact_age_minutes: site.artifact_age_minutes ?? null,
    max_sync_artifact_age_minutes: site.max_sync_artifact_age_minutes ?? null,
    output_path: outputPath,
    local_inbound_directory: localInboundDirectory,
    command_status: commandReady ? 'ready' : 'needs_configuration',
    command_blockers: commandBlockers,
    packet_site_id: packetSiteId,
    packet_path: effectivePacketPath ?? null,
    packet_path_source: packetDirectory ? 'packet_directory' : 'single_packet_path',
    sync_command: commandReady ? buildSyncOnceCommand({ nodeCommand, syncEntryPoint, siteId: site.site_id, packetPath: effectivePacketPath, outputPath, localInboundDirectory }) : null,
  };
}

function resolveReconciliationPacketPath(siteId, { packetPath = null, packetDirectory = null } = {}) {
  if (packetDirectory) return join(packetDirectory, `${safeFileToken(siteId)}-packet.json`);
  return packetPath;
}

function buildSyncOnceCommand({ nodeCommand, syncEntryPoint, siteId, packetPath, outputPath, localInboundDirectory }) {
  return [
    quote(nodeCommand),
    quote(syncEntryPoint),
    'sync-once',
    '--site',
    quote(siteId),
    '--packet',
    quote(packetPath),
    '--out',
    quote(outputPath),
    '--local-inbound-dir',
    quote(localInboundDirectory),
  ].join(' ');
}

function countSelectedReasons(selectedSites) {
  const counts = {};
  for (const site of selectedSites) {
    const reason = site.reason ?? 'unknown';
    counts[reason] = (counts[reason] ?? 0) + 1;
  }
  return counts;
}

function safeFileToken(value) {
  return String(value ?? 'site').replace(/[^A-Za-z0-9_.-]+/g, '-').replace(/^-+|-+$/g, '') || 'site';
}

function normalizeMaxArtifactAgeMinutes(value) {
  const parsed = Number.parseInt(value ?? DEFAULT_MAX_SYNC_ARTIFACT_AGE_MINUTES, 10);
  if (!Number.isFinite(parsed) || parsed < 1) return DEFAULT_MAX_SYNC_ARTIFACT_AGE_MINUTES;
  return Math.min(parsed, 24 * 60);
}

function normalizeExecutionTimeoutMs(value) {
  const parsed = Number.parseInt(value ?? DEFAULT_RECONCILE_EXECUTION_TIMEOUT_MS, 10);
  if (!Number.isFinite(parsed) || parsed < 1000) return DEFAULT_RECONCILE_EXECUTION_TIMEOUT_MS;
  return Math.min(parsed, 10 * 60 * 1000);
}

function stripEnvValueQuotes(value) {
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }
  return value;
}

function normalizeIntervalMinutes(value) {
  const parsed = Number.parseInt(value ?? DEFAULT_INTERVAL_MINUTES, 10);
  if (!Number.isFinite(parsed) || parsed < 1) return DEFAULT_INTERVAL_MINUTES;
  return Math.min(parsed, 60);
}

function resolvePath(root, value) {
  return isAbsolute(value) ? value : resolve(root, value);
}

function compareArtifactSummaries(left, right) {
  const leftSite = left.site_id ?? '';
  const rightSite = right.site_id ?? '';
  if (leftSite !== rightSite) return leftSite.localeCompare(rightSite);
  return String(left.artifact_path ?? '').localeCompare(String(right.artifact_path ?? ''));
}

function quote(value) {
  return `"${String(value).replaceAll('"', '\\"')}"`;
}

function vbsString(value) {
  return `"${String(value).replaceAll('"', '""')}"`;
}

function parseArgs(argv) {
  const args = { action: 'status', dryRun: true };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--live') args.dryRun = false;
    else if (arg === '--dry-run') args.dryRun = true;
    else if (arg === '--action') args.action = argv[++index];
    else if (arg === '--repo-root') args.repoRoot = argv[++index];
    else if (arg === '--task-name') args.taskName = argv[++index];
    else if (arg === '--interval-minutes') args.intervalMinutes = argv[++index];
    else if (arg === '--sync-entrypoint') args.syncEntrypoint = argv[++index];
    else if (arg === '--scheduled-task-entrypoint') args.scheduledTaskEntrypoint = argv[++index];
    else if (arg === '--local-root') args.localRoot = argv[++index];
    else if (arg === '--site') args.siteId = argv[++index];
    else if (arg === '--packet') args.packetPath = argv[++index];
    else if (arg === '--packet-dir') args.packetDirectory = argv[++index];
    else if (arg === '--out') args.outputPath = argv[++index];
    else if (arg === '--reconciliation-execution-out') args.reconciliationExecutionOutputPath = argv[++index];
    else if (arg === '--health-out') args.healthOutputPath = argv[++index];
    else if (arg === '--artifact-dir') args.artifactDirectory = argv[++index];
    else if (arg === '--sites') args.configuredSites = argv[++index];
    else if (arg === '--sites-file') args.sitesFilePath = argv[++index];
    else if (arg === '--site-registry-projection') args.siteRegistryProjectionPath = argv[++index];
    else if (arg === '--max-artifact-age-minutes') args.maxArtifactAgeMinutes = argv[++index];
    else if (arg === '--execution-timeout-ms') args.executionTimeoutMs = argv[++index];
    else if (arg === '--refresh-site-registry-projection') args.refreshSiteRegistryProjection = true;
    else if (arg === '--projection-url') args.projectionWorkerUrl = argv[++index];
    else if (arg === '--projection-token') args.projectionToken = argv[++index];
    else if (arg === '--projection-token-file') args.projectionTokenFile = argv[++index];
    else if (arg === '--env') args.envPath = argv[++index];
    else if (arg === '--node-command') args.nodeCommand = argv[++index];
    else if (arg === '--hidden-wrapper-path') args.hiddenWrapperPath = argv[++index];
    else if (arg === '--format') args.format = argv[++index];
    else throw new Error(`unknown_argument:${arg}`);
  }
  return args;
}

function loadLocalEnvFile(envPath) {
  if (!envPath || !existsSync(envPath)) return;
  const content = readFileSync(envPath, 'utf8');
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    if (!key || process.env[key] !== undefined) continue;
    process.env[key] = stripEnvValueQuotes(trimmed.slice(eq + 1).trim());
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = parseArgs(process.argv.slice(2));
  const repoRoot = resolve(args.repoRoot ?? resolve(dirname(fileURLToPath(import.meta.url)), '../../..'));
  loadLocalEnvFile(resolve(repoRoot, '.env'));
  loadLocalEnvFile(resolve(repoRoot, '.narada/site-continuity/cloudflare-continuity.env'));
  const result = await runSiteContinuitySchedulerActionWithOptionalRefresh({ ...args, repoRoot });
  const outputFormat = args.format ?? 'json';
  if (!['json', 'text'].includes(outputFormat)) throw new Error(`unsupported_format:${outputFormat}`);
  if (result.site_registry_projection_refresh?.status && result.site_registry_projection_refresh.status !== 'ok') process.exitCode = 1;
  if (result.scheduler_task_execution?.status && result.scheduler_task_execution.status !== 'ok') process.exitCode = 1;
  if (result.scheduler_task_readback?.status && result.scheduler_task_readback.status !== 'ok') process.exitCode = 1;
  if (result.continuity_health?.status && result.continuity_health.status !== 'ok') process.exitCode = 1;
  if (result.schema === 'narada.cloudflare_carrier.site_continuity_reconciliation_execution.v1' && !['completed', 'dry_run'].includes(result.status)) process.exitCode = 1;
  const output = outputFormat === 'text'
    ? formatSiteContinuitySchedulerResultForText(result)
    : `${JSON.stringify(result, null, 2)}\n`;
  process.stdout.write(output);
}
