#!/usr/bin/env node
import assert from 'node:assert/strict';
import { resolveAuth } from '../shared/cloudflare-carrier-auth-http.mjs';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { authHeaders } from '../shared/cloudflare-carrier-auth-http.mjs';

const scriptPath = fileURLToPath(import.meta.url);
const scriptDir = dirname(scriptPath);
const repoRoot = resolve(scriptDir, '../../../..');

export function parseSiteFileChangeProposalLiveSmokeArgs(argv = [], env = process.env, { loadEnv = true } = {}) {
  const args = [...argv];
  if (loadEnv) loadLocalEnv(join(repoRoot, '.env'), env);

  const workerUrl = trimTrailingSlash(option(args, '--url') ?? env.CLOUDFLARE_CARRIER_URL ?? '');
  const format = option(args, '--format') ?? env.CLOUDFLARE_SITE_FILE_CHANGE_PROPOSAL_LIVE_SMOKE_FORMAT ?? 'json';
  const siteId = option(args, '--site') ?? env.CLOUDFLARE_CARRIER_SITE_ID ?? 'site_narada_cloudflare';
  const operationId = option(args, '--operation') ?? env.CLOUDFLARE_CARRIER_OPERATION_ID ?? 'operation_narada_cloudflare_control';
  const taskId = option(args, '--task-id') ?? 'cloudflare-site-file-change-proposal-live-smoke';
  const summary = option(args, '--summary') ?? null;
  const filePath = option(args, '--file') ?? 'docs/architecture/cloudflare-carrier/target.md';
  const changeKind = option(args, '--change-kind') ?? 'update';
  const auth = resolveAuth(args, env) ?? resolveBearerFromEnv(args, env);

  if (!workerUrl) throw new Error('site_file_change_proposal_live_smoke_requires_--url_or_CLOUDFLARE_CARRIER_URL');
  if (!['json', 'text'].includes(format)) throw new Error(`site_file_change_proposal_live_smoke_unknown_format:${format}`);
  if (!auth) throw new Error('site_file_change_proposal_live_smoke_requires_bearer_token_or_operator_session');
  if (!siteId) throw new Error('site_file_change_proposal_live_smoke_requires_site_id');

  return {
    workerUrl,
    format,
    auth,
    siteId,
    operationId,
    taskId,
    summary,
    filePath,
    changeKind,
  };
}

export function formatSiteFileChangeProposalLiveSmokeText(result) {
  const lines = [
    `Site File Change Proposal Smoke: ${result.status}`,
    `Worker: ${result.worker_url}`,
    `Site: ${result.site_id}`,
    `Operation: ${result.operation_id}`,
    `Proposal: ${result.proposal_id}`,
    `Authority: proposal=${result.proposal_authority ?? 'unknown'} filesystem_executor=${result.filesystem_executor_authority ?? 'unknown'}`,
    `Admissions: filesystem_mutation=${result.filesystem_mutation_admission ?? 'unknown'} repository_publication=${result.repository_publication_admission ?? 'unknown'}`,
    `Partition: ${result.site_file_change_authority_partition ?? 'unknown'}`,
    `Site Read: pnpm --filter @narada2/cloudflare-carrier product:site:read:text -- --url ${result.worker_url} --site ${result.site_id} --operator-session-file <operator-session-file>`,
    `Site Next Workflow: pnpm --filter @narada2/cloudflare-carrier product:site:next:workflow:live:text -- --url ${result.worker_url} --site ${result.site_id} --operator-session-file <operator-session-file> --execute-site-next`,
    `Posture Coherence Review: pnpm --filter @narada2/cloudflare-carrier product:posture:coherence:live:text -- --url ${result.worker_url} --site ${result.site_id} --operator-session-file <operator-session-file>`,
    `Durability Coherence Review: pnpm --filter @narada2/cloudflare-carrier product:durability:coherence:live:text -- --url ${result.worker_url} --site ${result.site_id} --operator-session-file <operator-session-file>`,
    `Proposal Review: pnpm --filter @narada2/cloudflare-carrier product:site-file-change:proposal:review:text -- --url ${result.worker_url} --site ${result.site_id} --focus-ref ${result.proposal_id} --operator-session-file <operator-session-file>`,
    `Operation Review: pnpm --filter @narada2/cloudflare-carrier product:operation:read:text -- --url ${result.worker_url} --site ${result.site_id} --operation-id ${result.operation_id} --operator-session-file <operator-session-file>`,
    `Operation Next Workflow: pnpm --filter @narada2/cloudflare-carrier product:operation:next:workflow:live:text -- --url ${result.worker_url} --site ${result.site_id} --operation-id ${result.operation_id} --operator-session-file <operator-session-file> --execute-operation-next`,
  ];
  return `${lines.join('\n')}\n`;
}

export async function runSiteFileChangeProposalLiveSmoke(config, { fetchImpl = fetch } = {}) {
  const suffix = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
  const proposalId = `site_file_change_proposal_live_${suffix}`;
  const generatedAt = new Date().toISOString();
  const sourcePayload = {
    schema: 'narada.sonar.site_file_change_proposal.v1',
    generated_at: generatedAt,
    operation_id: config.operationId,
    task_id: config.taskId,
    proposal_ref: `proposal:site-file-change-live:${suffix}`,
    proposal_summary: config.summary ?? 'live Cloudflare site file change proposal',
    authority_locus: 'cloudflare_carrier_site',
    filesystem_executor_authority: 'windows_filesystem_executor',
    filesystem_mutation_admission: 'not_admitted',
    repository_publication_admission: 'not_admitted',
    proposal_posture: 'proposal_only_no_filesystem_write',
    files: [{
      file_path: config.filePath,
      change_kind: config.changeKind,
      material_source_ref: `material-source:site-file-change-proposal-live:${suffix}`,
    }],
  };

  const refusedMutation = await postCarrier(config, {
    operation: 'site_file_change_proposal.record',
    request_id: `site_file_change_proposal_refused_mutation_${suffix}`,
    params: {
      site_id: config.siteId,
      proposal_id: `${proposalId}_refused_mutation`,
      source_payload: { ...sourcePayload, filesystem_mutation_admission: 'admitted' },
    },
  }, fetchImpl);
  assert.equal(refusedMutation.http_status, 400, JSON.stringify(refusedMutation.body));
  assert.equal(refusedMutation.body.code, 'site_file_change_proposal_filesystem_mutation_admission_invalid');

  const recorded = await postCarrier(config, {
    operation: 'site_file_change_proposal.record',
    request_id: `site_file_change_proposal_record_${suffix}`,
    params: { site_id: config.siteId, proposal_id: proposalId, source_payload: sourcePayload },
  }, fetchImpl);
  assert.equal(recorded.http_status, 200, JSON.stringify(recorded.body));
  assert.equal(recorded.body.status, 'recorded');
  assert.equal(recorded.body.proposal_authority, 'cloudflare_carrier_site');
  assert.equal(recorded.body.filesystem_executor_authority, 'windows_filesystem_executor');
  assert.equal(recorded.body.filesystem_mutation_admission, 'not_admitted');
  assert.equal(recorded.body.repository_publication_admission, 'not_admitted');

  const listed = await postCarrier(config, {
    operation: 'site_file_change_proposal.list',
    request_id: `site_file_change_proposal_list_${suffix}`,
    params: { site_id: config.siteId, site_file_change_proposal_limit: 20 },
  }, fetchImpl);
  assert.equal(listed.http_status, 200, JSON.stringify(listed.body));
  assert.ok(listed.body.proposals.some((entry) => entry.proposal_id === proposalId));
  assert.equal(listed.body.filesystem_executor_authority, 'windows_filesystem_executor');
  assert.equal(listed.body.filesystem_mutation_admission, 'not_admitted');
  assert.equal(listed.body.repository_publication_admission, 'not_admitted');
  assert.equal(listed.body.authority_partition, 'site_file_change_proposal_cloudflare_recorded_filesystem_and_publication_windows_owned');

  const operationRead = await postCarrier(config, {
    operation: 'operation.read',
    request_id: `site_file_change_proposal_operation_read_${suffix}`,
    params: { site_id: config.siteId, operation_id: config.operationId, site_file_change_proposal_limit: 20 },
  }, fetchImpl);
  assert.equal(operationRead.http_status, 200, JSON.stringify(operationRead.body));
  assert.ok(operationRead.body.site_file_change_proposals.some((entry) => entry.proposal_id === proposalId));
  assert.ok(operationRead.body.operation_product_surface.site_file_change_proposal_count >= 1);
  assert.equal(operationRead.body.operation_product_surface.site_file_change_proposal_authority, 'cloudflare_carrier_site');
  assert.equal(operationRead.body.operation_product_surface.filesystem_executor_authority, 'windows_filesystem_executor');
  assert.equal(operationRead.body.operation_product_surface.filesystem_mutation_admission, 'not_admitted');
  assert.equal(operationRead.body.operation_product_surface.repository_publication_admission, 'not_admitted');
  assert.equal(operationRead.body.operation_product_surface.site_file_change_authority_partition, 'site_file_change_proposal_cloudflare_recorded_filesystem_and_publication_windows_owned');

  return {
    schema: 'narada.cloudflare_carrier.site_file_change_proposal_live_smoke.v1',
    status: 'ok',
    worker_url: config.workerUrl,
    auth_source: config.auth.source,
    site_id: config.siteId,
    operation_id: config.operationId,
    proposal_id: proposalId,
    proposal_authority: recorded.body.proposal_authority,
    filesystem_executor_authority: recorded.body.filesystem_executor_authority,
    filesystem_mutation_admission: recorded.body.filesystem_mutation_admission,
    repository_publication_admission: recorded.body.repository_publication_admission,
    site_file_change_proposal_count: operationRead.body.operation_product_surface.site_file_change_proposal_count,
    site_file_change_authority_partition: operationRead.body.operation_product_surface.site_file_change_authority_partition,
  };
}

async function postCarrier(config, body, fetchImpl) {
  const response = await fetchImpl(`${config.workerUrl}/api/carrier`, {
    method: 'POST',
    headers: {
      ...authHeaders(config.auth),
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  return { http_status: response.status, body: await response.json().catch(() => ({})) };
}

function resolveBearerFromEnv(args, env) {
  const tokenFile = option(args, '--token-file') ?? env.CLOUDFLARE_CARRIER_TOKEN_FILE ?? null;
  if (tokenFile) return { kind: 'bearer', value: readTokenFile(tokenFile), source: tokenFile === env.CLOUDFLARE_CARRIER_TOKEN_FILE ? 'env:CLOUDFLARE_CARRIER_TOKEN_FILE' : 'token-file' };
  const token = option(args, '--token') ?? env.CLOUDFLARE_CARRIER_TOKEN ?? null;
  if (token) return { kind: 'bearer', value: token, source: option(args, '--token') ? 'flag:--token' : 'env:CLOUDFLARE_CARRIER_TOKEN' };
  return null;
}

function option(args, name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : null;
}

function readTokenFile(tokenFilePath) {
  const resolved = isAbsolute(tokenFilePath) ? tokenFilePath : join(repoRoot, tokenFilePath);
  if (!existsSync(resolved)) throw new Error(`site_file_change_proposal_live_smoke_token_file_missing:${resolved}`);
  return readFileSync(resolved, 'utf8').trim();
}

function loadLocalEnv(envPath, env = process.env) {
  if (!existsSync(envPath)) return;
  const content = readFileSync(envPath, 'utf8');
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim().replace(/^[\"']|[\"']$/g, '');
    if (!(key in env)) env[key] = value;
  }
}

function trimTrailingSlash(value) {
  return String(value ?? '').replace(/\/+$/, '');
}

if (process.argv[1] === scriptPath) {
  const config = parseSiteFileChangeProposalLiveSmokeArgs(process.argv.slice(2));
  const result = await runSiteFileChangeProposalLiveSmoke(config);
  if (config.format === 'text') {
    process.stdout.write(formatSiteFileChangeProposalLiveSmokeText(result));
  } else {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  }
}
