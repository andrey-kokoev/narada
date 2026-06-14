#!/usr/bin/env node
import { execFile as execFileCallback } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { stdin, stdout, stderr } from 'node:process';
import { promisify } from 'node:util';
import { classifySiteContinuityExchangePacket } from '../../site-continuity/src/site-continuity.mjs';
import { authHeaders, resolveAuth } from './cloudflare-carrier-product-read.mjs';

const execFile = promisify(execFileCallback);

const args = process.argv.slice(2);
const command = args[0] ?? 'help';

if (command === 'help' || command === '--help' || command === '-h') {
  printHelp();
  process.exit(0);
}

function classifyRepositoryPublicationRequest(request) {
  const errors = [];
  if (!request || typeof request !== 'object' || Array.isArray(request)) errors.push('repository_publication_request_object_required');
  const value = request && typeof request === 'object' ? request : {};
  if (!value.repository_publication_request_id) errors.push('repository_publication_request_id_required');
  if (!value.publication_ref) errors.push('repository_publication_request_publication_ref_required');
  if (!value.requested_action_ref) errors.push('repository_publication_request_action_ref_required');
  if (!value.repository_ref) errors.push('repository_publication_request_repository_ref_required');
  if (!value.branch_ref) errors.push('repository_publication_request_branch_ref_required');
  if (!value.source_change_ref) errors.push('repository_publication_request_source_change_ref_required');
  const cloudflareAdmission = value.cloudflare_repository_publication_admission;
  if (!cloudflareAdmission || typeof cloudflareAdmission !== 'object') errors.push('repository_publication_cloudflare_admission_required');
  if (cloudflareAdmission && cloudflareAdmission.admission_action !== 'admit') errors.push('repository_publication_cloudflare_admission_not_admitted');
  if (cloudflareAdmission && cloudflareAdmission.repository_publication_admission !== 'admitted_by_cloudflare_repository_publication') errors.push('repository_publication_cloudflare_admission_state_invalid');
  if ((value.repository_publication_admission ?? 'pending_windows_publication_admission') !== 'pending_windows_publication_admission') errors.push('repository_publication_request_admission_invalid');
  if ((value.cloudflare_git_push_admission ?? 'not_admitted') !== 'not_admitted') errors.push('repository_publication_request_cloudflare_git_push_admission_invalid');
  if ((value.direct_cloudflare_repository_mutation_admission ?? 'not_admitted') !== 'not_admitted') errors.push('repository_publication_request_direct_cloudflare_repository_mutation_admission_invalid');
  if (errors.length > 0) return { action: 'refuse', reason: 'repository_publication_request_invalid', validation_errors: errors };
  return { action: 'admit', reason: 'repository_publication_request_valid_for_windows_local_resolution' };
}

async function buildRepositoryPublicationExecutionEvidence(request, { repoPath, remote, shouldPush }) {
  const requestAdmission = classifyRepositoryPublicationRequest(request);
  const gitState = await readGitState(repoPath);
  const base = {
    repository_publication_request_id: String(request?.repository_publication_request_id ?? ''),
    publication_execution_id: `repository-publication-execution-${safeToken(String(request?.repository_publication_request_id ?? Date.now()))}`,
    publication_ref: String(request?.publication_ref ?? request?.repository_publication_request_id ?? ''),
    requested_action_ref: String(request?.requested_action_ref ?? request?.publication_ref ?? ''),
    repository_ref: String(request?.repository_ref ?? gitState.repository_ref ?? ''),
    branch_ref: String(request?.branch_ref ?? gitState.branch_ref ?? ''),
    source_change_ref: String(request?.source_change_ref ?? `git:commit:${gitState.head}`),
    cloudflare_git_push_admission: 'not_admitted',
    direct_cloudflare_repository_mutation_admission: 'not_admitted',
    cloudflare_repository_publication_admission_id: request?.cloudflare_repository_publication_admission?.repository_publication_admission_id ?? null,
    cloudflare_repository_publication_admission_action: request?.cloudflare_repository_publication_admission?.admission_action ?? null,
  };
  if (requestAdmission.action === 'refuse') {
    return {
      ...base,
      windows_admission_action: 'refuse',
      windows_admission_reason: requestAdmission.reason,
      publication_status: 'refused',
      rollback_evidence_ref: `rollback:not-needed:${base.publication_execution_id}`,
    };
  }
  if (!gitState.ok) {
    return {
      ...base,
      windows_admission_action: 'refuse',
      windows_admission_reason: gitState.reason,
      publication_status: 'failed',
      rollback_evidence_ref: `rollback:not-needed:${base.publication_execution_id}`,
    };
  }
  const branchAdmission = classifyBranchRef(request.branch_ref, gitState.branch_ref);
  if (branchAdmission.action === 'refuse') {
    return {
      ...base,
      windows_admission_action: 'refuse',
      windows_admission_reason: branchAdmission.reason,
      publication_status: 'refused',
      rollback_evidence_ref: `rollback:not-needed:${base.publication_execution_id}`,
    };
  }
  if (!shouldPush) {
    return {
      ...base,
      windows_admission_action: 'refuse',
      windows_admission_reason: 'repository_publication_push_not_enabled',
      publication_status: 'refused',
      rollback_evidence_ref: `rollback:not-needed:${base.publication_execution_id}`,
    };
  }
  if (gitState.dirty) {
    return {
      ...base,
      windows_admission_action: 'refuse',
      windows_admission_reason: 'repository_publication_local_repository_dirty',
      publication_status: 'refused',
      rollback_evidence_ref: `rollback:not-needed:${base.publication_execution_id}`,
    };
  }
  const pushBranchRef = `refs/heads/${normalizeBranchRef(request.branch_ref)}`;
  const push = await runGit(repoPath, ['push', remote, `${gitState.head}:${pushBranchRef}`]);
  if (!push.ok) {
    return {
      ...base,
      windows_admission_action: 'refuse',
      windows_admission_reason: 'repository_publication_git_push_failed',
      publication_status: 'failed',
      rollback_evidence_ref: `rollback:git-push-failed:${base.publication_execution_id}`,
    };
  }
  return {
    ...base,
    windows_admission_action: 'admit',
    windows_admission_reason: 'governed_repository_publication_request_admitted',
    publication_status: 'completed',
    published_commit_ref: `git:commit:${gitState.head}`,
    rollback_evidence_ref: `rollback:published:${gitState.head}`,
  };
}

async function persistLocalInboundPacketArtifact({ siteId, packet, admission, loopReport, inboundDirectory, generatedAt }) {
  const base = {
    schema: 'narada.site_continuity_cloudflare_to_local_windows_inbound_packet.v1',
    status: 'ok',
    site_id: siteId,
    generated_at: generatedAt,
    source: 'cloudflare.site.read.exchange_packet',
    target: 'local_windows_site_continuity_inbox',
    filesystem_mutation_admission: 'local_inbound_packet_artifact_write_only',
    cloudflare_to_local_windows_admission_action: admission?.action ?? null,
    cloudflare_to_local_windows_admission_reason: admission?.reason ?? null,
    packet_id: packet?.packet_id ?? null,
    packet_source_embodiment_kind: packet?.source_embodiment_kind ?? null,
    packet_target_embodiment_kind: packet?.target_embodiment_kind ?? null,
    continuity_loop_report_id: loopReport?.loop_report_id ?? null,
    packet,
  };
  if (!inboundDirectory) {
    return {
      ...base,
      status: 'not_configured',
      written: false,
      reason: 'local_inbound_directory_not_configured',
    };
  }
  const artifactPath = `${inboundDirectory.replace(/[\\/]+$/, '')}/${safeToken(siteId)}-${safeToken(packet?.packet_id ?? generatedAt)}-cloudflare-inbound.json`;
  await writeJson(artifactPath, base);
  return {
    ...base,
    written: true,
    artifact_path: artifactPath,
  };
}

async function readGitState(repoPath) {
  const root = await runGit(repoPath, ['rev-parse', '--show-toplevel']);
  if (!root.ok) return { ok: false, reason: 'repository_publication_git_root_unavailable' };
  const head = await runGit(repoPath, ['rev-parse', 'HEAD']);
  if (!head.ok) return { ok: false, reason: 'repository_publication_git_head_unavailable' };
  const branch = await runGit(repoPath, ['rev-parse', '--abbrev-ref', 'HEAD']);
  if (!branch.ok) return { ok: false, reason: 'repository_publication_git_branch_unavailable' };
  const status = await runGit(repoPath, ['status', '--porcelain']);
  if (!status.ok) return { ok: false, reason: 'repository_publication_git_status_unavailable' };
  return {
    ok: true,
    repository_ref: `file:${root.stdout.trim()}`,
    head: head.stdout.trim(),
    branch_ref: branch.stdout.trim(),
    dirty: status.stdout.trim().length > 0,
  };
}

async function runGit(repoPath, gitArgs) {
  try {
    const result = await execFile('git', ['-C', repoPath, ...gitArgs], { timeout: 30000, windowsHide: true });
    return { ok: true, stdout: result.stdout, stderr: result.stderr };
  } catch (error) {
    return { ok: false, stdout: error.stdout ?? '', stderr: error.stderr ?? error.message };
  }
}

function classifyBranchRef(requestedBranchRef, localBranchRef) {
  const requested = normalizeBranchRef(requestedBranchRef);
  const local = normalizeBranchRef(localBranchRef);
  if (!requested || !local) return { action: 'refuse', reason: 'repository_publication_branch_ref_unresolved' };
  if (requested !== local) return { action: 'refuse', reason: 'repository_publication_branch_ref_mismatch' };
  return { action: 'admit', reason: 'repository_publication_branch_ref_matches_local_repo' };
}

function normalizeBranchRef(value) {
  return String(value ?? '').replace(/^refs\/heads\//, '');
}

function safeToken(value) {
  return String(value).replace(/[^A-Za-z0-9_.-]+/g, '-').replace(/^-+|-+$/g, '') || 'unknown';
}

const workerUrl = option('--url') ?? process.env.CLOUDFLARE_CARRIER_URL;
const auth = resolveAuth(args, process.env);
const outputFormat = option('--format') ?? 'json';
const operatorSessionFile = option('--operator-session-file') ?? process.env.CLOUDFLARE_OPERATOR_SESSION_FILE ?? null;

if (!workerUrl) fail('site_continuity_sync_requires_--url_or_CLOUDFLARE_CARRIER_URL');
if (!auth) fail('site_continuity_sync_requires_bearer_token_or_operator_session');
if (!['json', 'text'].includes(outputFormat)) fail(`unsupported_output_format:${outputFormat}`);

if (command === 'pull-cloudflare') {
  const siteId = requiredOption('--site');
  const read = await post({ operation: 'site.read', params: { site_id: siteId } });
  if (read.http_status !== 200 || read.body?.ok === false) failApi('cloudflare_site_read_failed', read);
  const packet = read.body?.site_continuity?.exchange_packet;
  if (!packet) fail('cloudflare_site_read_missing_site_continuity_exchange_packet');
  const admission = classifySiteContinuityExchangePacket(packet);
  if (admission.action === 'refuse') {
    failJson('cloudflare_site_continuity_packet_refused_before_export', { admission });
  }
  await writeOutput(option('--out'), {
    schema: 'narada.site_continuity_cloudflare_pull.v1',
    status: 'ok',
    site_id: siteId,
    worker_url: workerUrl,
    auth_source: auth.source,
    site_continuity_packet_admission: admission,
    packet,
  });
  process.exit(0);
}

if (command === 'push-cloudflare') {
  const packetEnvelope = await readPacketEnvelope();
  const packet = packetEnvelope?.packet ?? packetEnvelope;
  if (!packet || typeof packet !== 'object') fail('site_continuity_push_requires_packet_json');
  const admission = classifySiteContinuityExchangePacket(packet);
  if (admission.action === 'refuse') {
    failJson('site_continuity_packet_refused_before_push', { admission });
  }
  const siteId = option('--site') ?? packet.site_id;
  if (!siteId) fail('site_continuity_push_requires_--site_or_packet_site_id');
  if (packet.site_id && siteId !== packet.site_id) failJson('site_continuity_push_site_id_mismatch', { site_id: siteId, packet_site_id: packet.site_id });
  const pushed = await post({ operation: 'site.continuity.packet.put', params: { site_id: siteId, packet } });
  if (pushed.http_status !== 200 || pushed.body?.ok === false) failApi('cloudflare_site_continuity_packet_push_failed', pushed);
  await writeOutput(option('--out'), {
    schema: 'narada.site_continuity_cloudflare_push.v1',
    status: 'ok',
    site_id: siteId,
    worker_url: workerUrl,
    auth_source: auth.source,
    local_packet_admission: admission,
    cloudflare_response: pushed.body,
  });
  process.exit(0);
}

if (command === 'read-cloudflare') {
  const siteId = requiredOption('--site');
  const read = await post({ operation: 'site.read', params: { site_id: siteId } });
  if (read.http_status !== 200 || read.body?.ok === false) failApi('cloudflare_site_read_failed', read);
  await writeOutput(option('--out'), {
    schema: 'narada.site_continuity_cloudflare_read.v1',
    status: 'ok',
    site_id: siteId,
    worker_url: workerUrl,
    auth_source: auth.source,
    site_continuity: read.body.site_continuity ?? null,
    site_continuity_packets: read.body.site_continuity_packets ?? [],
  });
  process.exit(0);
}

if (command === 'reconciliation-execution-put') {
  const siteId = requiredOption('--site');
  const executionEnvelope = await readJsonEnvelope(option('--execution'));
  const execution = executionEnvelope?.execution ?? executionEnvelope;
  if (!execution || typeof execution !== 'object') fail('site_continuity_reconciliation_execution_required');
  if (execution.schema !== 'narada.cloudflare_carrier.site_continuity_reconciliation_execution.v1') {
    fail('site_continuity_reconciliation_execution_schema_unsupported');
  }
  const pushed = await post({ operation: 'site.continuity.reconciliation_execution.put', params: { site_id: siteId, execution } });
  if (pushed.http_status !== 200 || pushed.body?.ok === false) failApi('cloudflare_site_continuity_reconciliation_execution_push_failed', pushed);
  await writeOutput(option('--out'), {
    schema: 'narada.site_continuity_cloudflare_reconciliation_execution_push.v1',
    status: 'ok',
    site_id: siteId,
    worker_url: workerUrl,
    auth_source: auth.source,
    reconciliation_execution_recorded: true,
    execution_status: execution.status ?? null,
    execution_generated_at: execution.generated_at ?? null,
    cloudflare_response: pushed.body,
  });
  process.exit(0);
}

if (command === 'sync-once') {
  const packetEnvelope = await readPacketEnvelope();
  const localPacket = packetEnvelope?.packet ?? packetEnvelope;
  if (!localPacket || typeof localPacket !== 'object') fail('site_continuity_sync_once_requires_packet_json');
  const localAdmission = classifySiteContinuityExchangePacket(localPacket);
  if (localAdmission.action === 'refuse') {
    failJson('site_continuity_packet_refused_before_sync', { admission: localAdmission });
  }
  const siteId = option('--site') ?? localPacket.site_id;
  if (!siteId) fail('site_continuity_sync_once_requires_--site_or_packet_site_id');
  if (localPacket.site_id && siteId !== localPacket.site_id) failJson('site_continuity_sync_once_site_id_mismatch', { site_id: siteId, packet_site_id: localPacket.site_id });
  const pushed = await post({ operation: 'site.continuity.packet.put', params: { site_id: siteId, packet: localPacket } });
  if (pushed.http_status !== 200 || pushed.body?.ok === false) failApi('cloudflare_site_continuity_packet_push_failed', pushed);
  const read = await post({ operation: 'site.read', params: { site_id: siteId } });
  if (read.http_status !== 200 || read.body?.ok === false) failApi('cloudflare_site_read_failed_after_sync_push', read);
  const cloudflarePacket = read.body?.site_continuity?.exchange_packet;
  if (!cloudflarePacket) fail('cloudflare_site_read_missing_site_continuity_exchange_packet_after_sync_push');
  const cloudflareAdmission = classifySiteContinuityExchangePacket(cloudflarePacket);
  if (cloudflareAdmission.action === 'refuse') {
    failJson('cloudflare_site_continuity_packet_refused_after_sync_push', { admission: cloudflareAdmission });
  }
  const loopReport = buildSiteContinuityLoopReport({
    siteId,
    localPacket,
    cloudflarePacket,
    pushed,
    generatedAt: new Date().toISOString(),
  });
  const localInboundArtifact = await persistLocalInboundPacketArtifact({
    siteId,
    packet: cloudflarePacket,
    admission: cloudflareAdmission,
    loopReport,
    inboundDirectory: option('--local-inbound-dir'),
    generatedAt: new Date().toISOString(),
  });
  const reportPut = await post({ operation: 'site.continuity.loop.report.put', params: { site_id: siteId, report: loopReport } });
  if (reportPut.http_status !== 200 || reportPut.body?.ok === false) failApi('cloudflare_site_continuity_loop_report_push_failed', reportPut);
  await writeOutput(option('--out'), {
    schema: 'narada.site_continuity_cloudflare_sync_once.v1',
    status: 'ok',
    site_id: siteId,
    worker_url: workerUrl,
    auth_source: auth.source,
    local_packet_admission: localAdmission,
    cloudflare_packet_admission: cloudflareAdmission,
    pushed_packet_id: localPacket.packet_id ?? null,
    pulled_packet_id: cloudflarePacket.packet_id ?? null,
    local_to_cloudflare_recorded: true,
    cloudflare_to_local_windows_returned: true,
    cloudflare_to_local_windows_local_artifact_written: localInboundArtifact.written,
    continuity_loop_report_recorded: true,
    local_inbound_artifact: localInboundArtifact,
    cloudflare_response: pushed.body,
    continuity_loop_report_response: reportPut.body,
    continuity_loop_report: loopReport,
    packet: cloudflarePacket,
  });
  process.exit(0);
}

if (command === 'repository-publication-execute-pending') {
  const siteId = requiredOption('--site');
  const repoPath = option('--repo') ?? process.cwd();
  const requestLimit = Number(option('--limit') ?? 10);
  const remote = option('--remote') ?? 'origin';
  const shouldPush = hasFlag('--push');
  const heartbeatId = option('--heartbeat-id') ?? `repository-publication-provider-heartbeat-${safeToken(siteId)}-${Date.now()}`;
  const providerId = option('--provider-id') ?? 'windows_repository_publication_drain_loop';
  const startedAt = new Date().toISOString();
  const selected = await post({ operation: 'repository_publication.request.next', params: { site_id: siteId, limit: requestLimit } });
  if (selected.http_status !== 200 || selected.body?.ok === false) failApi('cloudflare_repository_publication_request_next_failed', selected);
  const requests = selected.body?.request ? [{
    ...selected.body.request,
    cloudflare_repository_publication_admission: selected.body.admission ?? selected.body.request.cloudflare_repository_publication_admission ?? null,
  }] : [];
  const results = [];
  for (const request of requests) {
    const evidence = await buildRepositoryPublicationExecutionEvidence(request, { repoPath, remote, shouldPush });
    const admission = classifyRepositoryPublicationEvidence(evidence);
    if (admission.action === 'refuse') {
      results.push({ request_id: request.repository_publication_request_id ?? null, status: 'local_evidence_refused', admission, evidence });
      continue;
    }
    const pushed = await post({ operation: 'repository_publication.evidence.put', params: { site_id: siteId, source_payload: evidence } });
    results.push({
      request_id: request.repository_publication_request_id ?? null,
      status: pushed.http_status === 200 && pushed.body?.ok !== false ? 'evidence_recorded' : 'evidence_record_failed',
      local_evidence_admission: admission,
      cloudflare_response: pushed.body,
      http_status: pushed.http_status,
      evidence,
    });
  }
  const completedCount = results.filter((result) => result.evidence?.publication_status === 'completed').length;
  const refusedCount = results.filter((result) => result.evidence?.publication_status === 'refused').length;
  const resolvedCount = results.filter((result) => ['completed', 'refused', 'failed'].includes(String(result.evidence?.publication_status ?? ''))).length;
  const heartbeat = await post({
    operation: 'repository_publication.provider_heartbeat.put',
    params: {
      site_id: siteId,
      repository_publication_provider_heartbeat_id: heartbeatId,
      generated_at: startedAt,
      last_run_at: new Date().toISOString(),
      provider_id: providerId,
      provider_authority: 'windows_repository_publication_executor',
      provider_embodiment: 'windows_current_user_startup_provider',
      status: results.some((result) => result.status !== 'evidence_recorded') ? 'needs_attention' : 'ready',
      max_cycles: 1,
      iteration_count: 1,
      completed_publication_count: completedCount,
      refused_publication_count: refusedCount,
      resolved_publication_count: resolvedCount,
      drained: selected.body?.status === 'drained' || requests.length === 0,
      cloudflare_dispatch_authority: 'cloudflare_repository_publication_request_queue',
      cloudflare_git_push_admission: 'not_admitted',
      direct_cloudflare_repository_mutation_admission: 'not_admitted',
    },
  });
  await writeOutput(option('--out'), {
    schema: 'narada.repository_publication_cloudflare_pending_execution.v1',
    status: results.every((result) => result.status === 'evidence_recorded') && heartbeat.http_status === 200 && heartbeat.body?.ok !== false ? 'ok' : 'needs_attention',
    site_id: siteId,
    worker_url: workerUrl,
    auth_source: auth.source,
    repository_path: repoPath,
    push_enabled: shouldPush,
    request_selection_status: selected.body?.status ?? 'unknown',
    request_count: requests.length,
    evidence_recorded_count: results.filter((result) => result.status === 'evidence_recorded').length,
    repository_publication_provider_heartbeat_id: heartbeatId,
    provider_heartbeat_recorded: heartbeat.http_status === 200 && heartbeat.body?.ok !== false,
    provider_heartbeat_http_status: heartbeat.http_status,
    provider_heartbeat_response: heartbeat.body,
    results,
  });
  process.exit(0);
}

if (command === 'repository-publication-evidence-put') {
  const siteId = requiredOption('--site');
  const evidenceEnvelope = await readJsonEnvelope(option('--evidence'));
  const evidence = evidenceEnvelope?.evidence ?? evidenceEnvelope;
  const admission = classifyRepositoryPublicationEvidence(evidence);
  if (admission.action === 'refuse') {
    failJson('repository_publication_evidence_refused_before_push', { admission });
  }
  const pushed = await post({ operation: 'repository_publication.evidence.put', params: { site_id: siteId, source_payload: evidence } });
  if (pushed.http_status !== 200 || pushed.body?.ok === false) failApi('cloudflare_repository_publication_evidence_push_failed', pushed);
  await writeOutput(option('--out'), {
    schema: 'narada.repository_publication_cloudflare_evidence_push.v1',
    status: 'ok',
    site_id: siteId,
    worker_url: workerUrl,
    auth_source: auth.source,
    repository_publication_request_id: evidence.repository_publication_request_id ?? null,
    publication_execution_id: evidence.publication_execution_id ?? null,
    local_evidence_admission: admission,
    cloudflare_response: pushed.body,
  });
  process.exit(0);
}

fail(`unsupported_site_continuity_sync_command:${command}`);

function option(name) {
  const index = args.indexOf(name);
  if (index < 0) return null;
  return args[index + 1] ?? null;
}

function hasFlag(name) {
  return args.includes(name);
}

function requiredOption(name) {
  const value = option(name);
  if (!value) fail(`missing_required_option:${name}`);
  return value;
}

async function readPacketEnvelope() {
  const packetPath = option('--packet');
  return readJsonEnvelope(packetPath);
}

async function readJsonEnvelope(path) {
  const text = path ? await readFile(path, 'utf8') : await readAllStdin();
  try {
    return JSON.parse(text);
  } catch (error) {
    failJson('site_continuity_json_invalid', { error: error.message });
  }
}

function classifyRepositoryPublicationEvidence(evidence) {
  const errors = [];
  if (!evidence || typeof evidence !== 'object' || Array.isArray(evidence)) errors.push('repository_publication_evidence_object_required');
  const value = evidence && typeof evidence === 'object' ? evidence : {};
  const windowsAdmissionAction = String(value.windows_admission_action ?? '');
  const publicationStatus = String(value.publication_status ?? '');
  if (!value.repository_publication_request_id) errors.push('repository_publication_evidence_request_id_required');
  if (!value.publication_execution_id) errors.push('repository_publication_evidence_execution_id_required');
  if (!['admit', 'refuse'].includes(windowsAdmissionAction)) errors.push('repository_publication_evidence_windows_admission_action_invalid');
  if (!['completed', 'refused', 'failed'].includes(publicationStatus)) errors.push('repository_publication_evidence_status_invalid');
  if (windowsAdmissionAction === 'admit' && publicationStatus !== 'completed') errors.push('repository_publication_evidence_admitted_status_invalid');
  if (windowsAdmissionAction === 'refuse' && publicationStatus === 'completed') errors.push('repository_publication_evidence_refused_status_invalid');
  if (!value.repository_ref) errors.push('repository_publication_evidence_repository_ref_required');
  if (!value.branch_ref) errors.push('repository_publication_evidence_branch_ref_required');
  if (!value.source_change_ref) errors.push('repository_publication_evidence_source_change_ref_required');
  if (windowsAdmissionAction === 'admit' && !value.published_commit_ref) errors.push('repository_publication_evidence_published_commit_ref_required');
  if ((value.cloudflare_git_push_admission ?? 'not_admitted') !== 'not_admitted') errors.push('repository_publication_evidence_cloudflare_git_push_admission_invalid');
  if ((value.direct_cloudflare_repository_mutation_admission ?? 'not_admitted') !== 'not_admitted') errors.push('repository_publication_evidence_direct_cloudflare_repository_mutation_admission_invalid');
  if (errors.length > 0) return { action: 'refuse', reason: 'repository_publication_evidence_invalid', validation_errors: errors };
  return {
    action: 'admit',
    reason: 'repository_publication_evidence_valid_for_cloudflare_recording',
    authority_partition: 'windows_admits_or_refuses_repository_publication_cloudflare_records_evidence_without_direct_repository_authority',
  };
}

function buildSiteContinuityLoopReport({ siteId, localPacket, cloudflarePacket, pushed, generatedAt }) {
  const packetRecord = pushed.body?.packet_record ?? null;
  return {
    schema: 'narada.site_continuity_productized_loop.v1',
    site_id: siteId,
    status: 'ok',
    generated_at: generatedAt,
    cloudflare_source: 'cloudflare.site.read',
    cloudflare_worker_url: workerUrl,
    cloudflare_credential_source: auth.source,
    cloudflare_push: {
      status: 'imported',
      pushed_packet_id: localPacket.packet_id ?? null,
      returned_packet_id: cloudflarePacket.packet_id ?? null,
      http_status: pushed.http_status,
      packet_record: packetRecord,
      durability_action: packetRecord?.durability_action ?? null,
      imported_at: packetRecord?.imported_at ?? null,
      previous_imported_at: packetRecord?.previous_imported_at ?? null,
    },
    windows_packet_count: 1,
    authority_boundary: {
      executable_cross_embodiment_mutation: 'refused_by_site_continuity_classifier',
      durable_mutation_authority: 'unchanged; routed_by_site_authority_map',
    },
  };
}

async function readAllStdin() {
  const chunks = [];
  for await (const chunk of stdin) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString('utf8');
}

async function writeJson(path, value) {
  const text = `${JSON.stringify(value, null, 2)}\n`;
  if (path) {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, text, 'utf8');
    return;
  }
  stdout.write(text);
}

async function writeOutput(path, value) {
  if (outputFormat === 'text') {
    const text = formatSiteContinuitySyncText(command, value, { operatorSessionFile });
    if (path) {
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, text, 'utf8');
      return;
    }
    stdout.write(text);
    return;
  }
  await writeJson(path, value);
}

async function post(body) {
  const response = await fetch(apiUrl(), {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...authHeaders(auth),
    },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = { raw: text };
  }
  return { http_status: response.status, body: parsed };
}

function apiUrl() {
  return new URL('/api/carrier', withTrailingSlash(workerUrl));
}

function withTrailingSlash(value) {
  return String(value).endsWith('/') ? value : `${value}/`;
}

function failApi(code, response) {
  failJson(code, {
    http_status: response.http_status,
    body: response.body,
  });
}

function failJson(code, detail = {}) {
  stderr.write(`${JSON.stringify({ ok: false, code, ...detail }, null, 2)}\n`);
  process.exit(1);
}

function fail(code) {
  failJson(code);
}

function printHelp() {
  stdout.write(`Narada Cloudflare site-continuity transport\n\nCommands:\n  pull-cloudflare --site <site_id> [--out <packet.json>]\n  push-cloudflare --packet <packet.json> [--site <site_id>] [--out <result.json>]\n  read-cloudflare --site <site_id> [--out <result.json>]\n  reconciliation-execution-put --site <site_id> --execution <execution.json> [--out <result.json>]\n  sync-once --packet <packet.json> [--site <site_id>] [--out <result.json>] [--local-inbound-dir <dir>]\n  repository-publication-execute-pending --site <site_id> [--repo <path>] [--limit <n>] [--push] [--remote <name>] [--out <result.json>]\n  repository-publication-evidence-put --site <site_id> [--evidence <evidence.json>] [--out <result.json>]\n\nAuth:\n  --url <worker-url> or CLOUDFLARE_CARRIER_URL\n  --token-file <path> or CLOUDFLARE_CARRIER_TOKEN_FILE\n  --token <bearer-token> or CLOUDFLARE_CARRIER_TOKEN\n  --operator-session-file <path> or CLOUDFLARE_OPERATOR_SESSION_FILE\n  --operator-session-cookie <cookie> or CLOUDFLARE_OPERATOR_SESSION_COOKIE\n\nOutput:\n  --format json|text (default json)\n\nNotes:\n  pull-cloudflare exports the packet emitted by site.read.\n  push-cloudflare imports a packet through site.continuity.packet.put.\n  reconciliation-execution-put records Windows reconciliation execution evidence in Cloudflare without granting Cloudflare execution authority.\n  sync-once imports the local packet, then returns the Cloudflare packet for local observation.\n  The script refuses locally invalid/executable-mutation packets before sending them.\n  repository-publication-execute-pending consumes queued Cloudflare publication requests and returns Windows-side evidence; it only runs git push when --push is explicit.\n  repository-publication-evidence-put returns Windows-side publication evidence to Cloudflare without granting Cloudflare git push authority.\n`);
}

function formatSiteContinuitySyncText(commandName, result, { operatorSessionFile: sessionFile = null } = {}) {
  const lines = ['Site Continuity Sync'];
  const siteId = result?.site_id ?? 'unknown';
  const status = result?.status ?? 'unknown';
  const worker = result?.worker_url ?? workerUrl ?? null;

  lines.push(`Command: ${commandName}`);
  lines.push(`Status: ${status}`);
  lines.push(`Site: ${siteId}`);
  if (result?.auth_source) lines.push(`Auth: ${result.auth_source}`);

  if (commandName === 'read-cloudflare') {
    const packet = result?.site_continuity?.exchange_packet ?? null;
    lines.push(`Packets: ${Array.isArray(result?.site_continuity_packets) ? result.site_continuity_packets.length : 0}`);
    if (packet?.packet_id) lines.push(`Exchange Packet: ${packet.packet_id}`);
    if (packet?.source_embodiment_kind || packet?.target_embodiment_kind) {
      lines.push(`Embodiments: ${packet?.source_embodiment_kind ?? 'unknown'} -> ${packet?.target_embodiment_kind ?? 'unknown'}`);
    }
  } else if (commandName === 'reconciliation-execution-put') {
    lines.push(`Execution Recorded: ${result?.reconciliation_execution_recorded === true ? 'yes' : 'no'}`);
    if (result?.execution_status) lines.push(`Execution Status: ${result.execution_status}`);
  } else if (commandName === 'sync-once') {
    lines.push(`Push Recorded: ${result?.local_to_cloudflare_recorded === true ? 'yes' : 'no'}`);
    lines.push(`Return Observed: ${result?.cloudflare_to_local_windows_returned === true ? 'yes' : 'no'}`);
    lines.push(`Inbound Artifact: ${result?.cloudflare_to_local_windows_local_artifact_written === true ? 'written' : 'not_written'}`);
    if (result?.pushed_packet_id || result?.pulled_packet_id) {
      lines.push(`Packets: pushed=${result?.pushed_packet_id ?? 'none'} pulled=${result?.pulled_packet_id ?? 'none'}`);
    }
    if (result?.continuity_loop_report?.cloudflare_push?.durability_action) {
      lines.push(`Durability Action: ${result.continuity_loop_report.cloudflare_push.durability_action}`);
    }
  } else if (commandName === 'repository-publication-execute-pending') {
    lines.push(`Selection: ${result?.request_selection_status ?? 'unknown'} requests=${result?.request_count ?? 0}`);
    lines.push(`Evidence Recorded: ${result?.evidence_recorded_count ?? 0}`);
    lines.push(`Provider Heartbeat: ${result?.provider_heartbeat_recorded === true ? 'recorded' : 'not_recorded'}`);
    const firstResult = Array.isArray(result?.results) ? result.results[0] ?? null : null;
    if (firstResult?.request_id) lines.push(`Request: ${firstResult.request_id} status=${firstResult.status ?? 'unknown'}`);
    if (firstResult?.evidence?.publication_execution_id) {
      lines.push(`Execution: ${firstResult.evidence.publication_execution_id}`);
    }
  } else if (commandName === 'repository-publication-evidence-put') {
    lines.push(`Evidence Recorded: ${result?.status === 'ok' ? 'yes' : 'no'}`);
    if (result?.repository_publication_request_id) lines.push(`Request: ${result.repository_publication_request_id}`);
    if (result?.publication_execution_id) lines.push(`Execution: ${result.publication_execution_id}`);
  }

  if (worker && sessionFile && siteId && siteId !== 'unknown') {
    const baseArgs = `-- --url ${worker} --site ${siteId} --operator-session-file ${sessionFile}`;
    lines.push(`Site Read: pnpm --filter @narada2/cloudflare-carrier product:site:read:text ${baseArgs}`);
    lines.push(`Operation List: pnpm --filter @narada2/cloudflare-carrier product:operation:list:text ${baseArgs}`);
    lines.push(`Site Next Workflow: pnpm --filter @narada2/cloudflare-carrier product:site:next:workflow:live:text ${baseArgs} --execute-site-next`);
    lines.push(`Posture Coherence Review: pnpm --filter @narada2/cloudflare-carrier product:posture:coherence:live:text ${baseArgs}`);
    lines.push(`Durability Coherence Review: pnpm --filter @narada2/cloudflare-carrier product:durability:coherence:live:text ${baseArgs}`);
    if (commandName === 'repository-publication-execute-pending') {
      const firstResult = Array.isArray(result?.results) ? result.results[0] ?? null : null;
      if (firstResult?.request_id) {
        lines.push(`Publication Request Review: pnpm --filter @narada2/cloudflare-carrier product:repository-publication:request:review:text ${baseArgs} --repository-publication-request-id ${firstResult.request_id}`);
      }
      if (firstResult?.evidence?.publication_execution_id) {
        lines.push(`Publication Execution Read: pnpm --filter @narada2/cloudflare-carrier product:repository-publication:cloudflare-execution:list:text ${baseArgs} --repository-publication-execution-id ${firstResult.evidence.publication_execution_id}`);
      }
      lines.push(`Publication Provider Liveness: pnpm --filter @narada2/cloudflare-carrier product:repository-publication:provider-liveness:text ${baseArgs}`);
    } else if (commandName === 'repository-publication-evidence-put') {
      if (result?.repository_publication_request_id) {
        lines.push(`Publication Request Review: pnpm --filter @narada2/cloudflare-carrier product:repository-publication:request:review:text ${baseArgs} --repository-publication-request-id ${result.repository_publication_request_id}`);
      }
      if (result?.publication_execution_id) {
        lines.push(`Publication Execution Read: pnpm --filter @narada2/cloudflare-carrier product:repository-publication:cloudflare-execution:list:text ${baseArgs} --repository-publication-execution-id ${result.publication_execution_id}`);
      }
    }
  }

  return `${lines.join('\n')}\n`;
}
