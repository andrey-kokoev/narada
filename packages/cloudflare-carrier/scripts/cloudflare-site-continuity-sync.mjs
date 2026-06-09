#!/usr/bin/env node
import { execFile as execFileCallback } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { stdin, stdout, stderr } from 'node:process';
import { promisify } from 'node:util';
import { classifySiteContinuityExchangePacket } from '../../site-continuity/src/site-continuity.mjs';

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
  const push = await runGit(repoPath, ['push', remote, `${gitState.head}:${normalizeBranchRef(request.branch_ref)}`]);
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
const bearerToken = await resolveBearerToken();

if (!workerUrl) fail('site_continuity_sync_requires_--url_or_CLOUDFLARE_CARRIER_URL');
if (!bearerToken) fail('site_continuity_sync_requires_--token_or_--token-file_or_CLOUDFLARE_CARRIER_TOKEN');

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
  await writeJson(option('--out'), {
    schema: 'narada.site_continuity_cloudflare_pull.v1',
    status: 'ok',
    site_id: siteId,
    worker_url: workerUrl,
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
  const pushed = await post({ operation: 'site.continuity.packet.put', params: { site_id: siteId, packet } });
  if (pushed.http_status !== 200 || pushed.body?.ok === false) failApi('cloudflare_site_continuity_packet_push_failed', pushed);
  await writeJson(option('--out'), {
    schema: 'narada.site_continuity_cloudflare_push.v1',
    status: 'ok',
    site_id: siteId,
    worker_url: workerUrl,
    local_packet_admission: admission,
    cloudflare_response: pushed.body,
  });
  process.exit(0);
}

if (command === 'read-cloudflare') {
  const siteId = requiredOption('--site');
  const read = await post({ operation: 'site.read', params: { site_id: siteId } });
  if (read.http_status !== 200 || read.body?.ok === false) failApi('cloudflare_site_read_failed', read);
  await writeJson(option('--out'), {
    schema: 'narada.site_continuity_cloudflare_read.v1',
    status: 'ok',
    site_id: siteId,
    worker_url: workerUrl,
    site_continuity: read.body.site_continuity ?? null,
    site_continuity_packets: read.body.site_continuity_packets ?? [],
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
  const requests = selected.body?.request ? [selected.body.request] : [];
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
  await writeJson(option('--out'), {
    schema: 'narada.repository_publication_cloudflare_pending_execution.v1',
    status: results.every((result) => result.status === 'evidence_recorded') && heartbeat.http_status === 200 && heartbeat.body?.ok !== false ? 'ok' : 'needs_attention',
    site_id: siteId,
    worker_url: workerUrl,
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
  await writeJson(option('--out'), {
    schema: 'narada.repository_publication_cloudflare_evidence_push.v1',
    status: 'ok',
    site_id: siteId,
    worker_url: workerUrl,
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

async function resolveBearerToken() {
  const flagToken = option('--token');
  if (flagToken) return { value: flagToken, source: 'flag:--token' };
  const tokenFile = option('--token-file') ?? process.env.CLOUDFLARE_CARRIER_TOKEN_FILE ?? null;
  if (tokenFile) return { value: (await readFile(tokenFile, 'utf8')).trim(), source: tokenFileSource(tokenFile) };
  if (process.env.CLOUDFLARE_CARRIER_TOKEN) return { value: process.env.CLOUDFLARE_CARRIER_TOKEN, source: 'env:CLOUDFLARE_CARRIER_TOKEN' };
  return null;
}

function tokenFileSource(path) {
  return path === process.env.CLOUDFLARE_CARRIER_TOKEN_FILE ? 'env:CLOUDFLARE_CARRIER_TOKEN_FILE' : 'flag:--token-file';
}

async function readAllStdin() {
  const chunks = [];
  for await (const chunk of stdin) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString('utf8');
}

async function writeJson(path, value) {
  const text = `${JSON.stringify(value, null, 2)}\n`;
  if (path) {
    await writeFile(path, text, 'utf8');
    return;
  }
  stdout.write(text);
}

async function post(body) {
  const response = await fetch(apiUrl(), {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${bearerToken.value}`,
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
  stdout.write(`Narada Cloudflare site-continuity transport\n\nCommands:\n  pull-cloudflare --site <site_id> [--out <packet.json>]\n  push-cloudflare --packet <packet.json> [--site <site_id>] [--out <result.json>]\n  read-cloudflare --site <site_id> [--out <result.json>]\n  repository-publication-execute-pending --site <site_id> [--repo <path>] [--limit <n>] [--push] [--remote <name>] [--out <result.json>]\n  repository-publication-evidence-put --site <site_id> [--evidence <evidence.json>] [--out <result.json>]\n\nAuth:\n  --url <worker-url> or CLOUDFLARE_CARRIER_URL\n  --token-file <path> or CLOUDFLARE_CARRIER_TOKEN_FILE\n  --token <bearer-token> or CLOUDFLARE_CARRIER_TOKEN\n\nNotes:\n  pull-cloudflare exports the packet emitted by site.read.\n  push-cloudflare imports a packet through site.continuity.packet.put.\n  The script refuses locally invalid/executable-mutation packets before sending them.\n  repository-publication-execute-pending consumes queued Cloudflare publication requests and returns Windows-side evidence; it only runs git push when --push is explicit.\n  repository-publication-evidence-put returns Windows-side publication evidence to Cloudflare without granting Cloudflare git push authority.\n`);
}
