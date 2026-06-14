#!/usr/bin/env node
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { authHeaders, resolveAuth } from './cloudflare-carrier-product-read.mjs';

const scriptPath = fileURLToPath(import.meta.url);
const scriptDir = dirname(scriptPath);
const repoRoot = resolve(scriptDir, '../../..');

export function parseTaskLifecycleCreateLiveSmokeArgs(argv = [], env = process.env, { loadEnv = true } = {}) {
  const args = [...argv];
  if (loadEnv) loadLocalEnv(join(repoRoot, '.env'), env);

  const workerUrl = trimTrailingSlash(option(args, '--url') ?? env.CLOUDFLARE_CARRIER_URL ?? '');
  const format = option(args, '--format') ?? env.CLOUDFLARE_TASK_LIFECYCLE_CREATE_LIVE_SMOKE_FORMAT ?? 'json';
  const siteId = option(args, '--site') ?? env.CLOUDFLARE_CARRIER_SITE_ID ?? 'site_narada_cloudflare';
  const operationId = option(args, '--operation') ?? env.CLOUDFLARE_CARRIER_OPERATION_ID ?? 'operation_narada_cloudflare_control';
  const admissionId = option(args, '--admission-id') ?? null;
  const title = option(args, '--title') ?? null;
  const cutoverPointRef = option(args, '--cutover-point-ref') ?? env.CLOUDFLARE_TASK_LIFECYCLE_CREATE_CUTOVER_POINT_REF ?? 'cutover:task-lifecycle-create:v1';
  const governedWriteContractRef = option(args, '--governed-write-contract-ref') ?? env.CLOUDFLARE_TASK_LIFECYCLE_CREATE_CONTRACT_REF ?? 'contract:task-lifecycle-create:v1';
  const confirmationEvidenceRef = option(args, '--confirmation-evidence-ref') ?? env.CLOUDFLARE_TASK_LIFECYCLE_CREATE_CONFIRMATION_EVIDENCE_REF ?? 'evidence:live-smoke:task-lifecycle-create';
  const auth = resolveAuth(args, env) ?? resolveBearerFromEnv(args, env);

  if (!workerUrl) throw new Error('task_lifecycle_create_live_smoke_requires_--url_or_CLOUDFLARE_CARRIER_URL');
  if (!['json', 'text'].includes(format)) throw new Error(`task_lifecycle_create_live_smoke_unknown_format:${format}`);
  if (!auth) throw new Error('task_lifecycle_create_live_smoke_requires_bearer_token_or_operator_session');
  if (!siteId) throw new Error('task_lifecycle_create_live_smoke_requires_site_id');

  return {
    workerUrl,
    format,
    auth,
    siteId,
    operationId,
    admissionId,
    title,
    cutoverPointRef,
    governedWriteContractRef,
    confirmationEvidenceRef,
  };
}

export function formatTaskLifecycleCreateLiveSmokeText(result) {
  const lines = [
    `Task Lifecycle Create Smoke: ${result.status}`,
    `Worker: ${result.worker_url}`,
    `Site: ${result.site_id}`,
    `Operation: ${result.operation_id}`,
    `Task: ${result.task_id} #${result.task_number}`,
    `Admission: ${result.admission_id}`,
    `Authority: mutation=${result.mutation_authority ?? 'unknown'} cloudflare_write=${result.cloudflare_write_admission ?? 'unknown'} effect=${result.write_effect ?? 'unknown'}`,
    `Counts: tasks=${result.task_lifecycle_task_count ?? 0} write_admissions=${result.task_lifecycle_write_admission_count ?? 0}`,
    `Site Read: pnpm --filter @narada2/cloudflare-carrier product:site:read:text -- --url ${result.worker_url} --site ${result.site_id} --operator-session-file <operator-session-file>`,
    `Site Next Workflow: pnpm --filter @narada2/cloudflare-carrier product:site:next:workflow:live:text -- --url ${result.worker_url} --site ${result.site_id} --operator-session-file <operator-session-file> --execute-site-next`,
    `Posture Coherence Review: pnpm --filter @narada2/cloudflare-carrier product:posture:coherence:live:text -- --url ${result.worker_url} --site ${result.site_id} --operator-session-file <operator-session-file>`,
    `Durability Coherence Review: pnpm --filter @narada2/cloudflare-carrier product:durability:coherence:live:text -- --url ${result.worker_url} --site ${result.site_id} --operator-session-file <operator-session-file>`,
    `Task Review: pnpm --filter @narada2/cloudflare-carrier product:task-lifecycle:review:text -- --url ${result.worker_url} --site ${result.site_id} --task-id ${result.task_id} --operator-session-file <operator-session-file>`,
    `Task Workflow: pnpm --filter @narada2/cloudflare-carrier product:task-lifecycle:next:workflow:live:text -- --url ${result.worker_url} --site ${result.site_id} --task-id ${result.task_id} --agent-id <agent-id> --operator-session-file <operator-session-file> --execute-task-lifecycle-next`,
    `Operation Review: pnpm --filter @narada2/cloudflare-carrier product:operation:read:text -- --url ${result.worker_url} --site ${result.site_id} --operation-id ${result.operation_id} --operator-session-file <operator-session-file>`,
    `Operation Next Workflow: pnpm --filter @narada2/cloudflare-carrier product:operation:next:workflow:live:text -- --url ${result.worker_url} --site ${result.site_id} --operation-id ${result.operation_id} --operator-session-file <operator-session-file> --execute-operation-next`,
  ];
  return `${lines.join('\n')}\n`;
}

export async function runTaskLifecycleCreateLiveSmoke(config, { fetchImpl = fetch } = {}) {
  const suffix = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
  const admissionId = config.admissionId ?? `task_lifecycle_create_live_${suffix}`;
  const title = config.title ?? `Cloudflare governed task create ${suffix}`;

  const refused = await postCarrier(config, {
    operation: 'task_lifecycle.task_create.admit',
    request_id: `task_lifecycle_create_live_refused_${suffix}`,
    params: {
      site_id: config.siteId,
      admission_id: `${admissionId}_refused`,
      title: `${title} refused guard`,
    },
  }, fetchImpl);
  assert.equal(refused.http_status, 403, JSON.stringify(refused.body));
  assert.equal(refused.body.code, 'task_lifecycle_create_not_admitted');
  assert.equal(refused.body.decision.action, 'refuse');
  assert.equal(refused.body.decision.reason, 'windows_task_lifecycle_mutation_authority_retained');

  const created = await postCarrier(config, {
    operation: 'task_lifecycle.task_create.admit',
    request_id: `task_lifecycle_create_live_admitted_${suffix}`,
    params: {
      site_id: config.siteId,
      admission_id: admissionId,
      title,
      description: 'Live proof that Cloudflare can own the task_create mutation class after explicit cutover evidence.',
      cloudflare_task_create_cutover: true,
      cutover_point_ref: config.cutoverPointRef,
      governed_write_contract_ref: config.governedWriteContractRef,
      confirmation_evidence_ref: config.confirmationEvidenceRef,
    },
  }, fetchImpl);
  assert.equal(created.http_status, 200, JSON.stringify(created.body));
  assert.equal(created.body.ok, true);
  assert.equal(created.body.status, 'created');
  assert.equal(created.body.decision.action, 'admit');
  assert.equal(created.body.decision.reason, 'cloudflare_task_create_cutover_admitted');
  assert.equal(created.body.mutation_authority, 'cloudflare_task_lifecycle_d1');
  assert.equal(created.body.cloudflare_write_admission, 'admitted');
  assert.equal(created.body.write_effect, 'task_lifecycle_create');
  assert.equal(created.body.task.site_id, config.siteId);
  assert.equal(created.body.task.status, 'opened');
  assert.equal(created.body.task.cutover_point_ref, config.cutoverPointRef);
  assert.equal(created.body.task.governed_write_contract_ref, config.governedWriteContractRef);
  assert.equal(created.body.task.confirmation_evidence_ref, config.confirmationEvidenceRef);

  const taskList = await postCarrier(config, {
    operation: 'task_lifecycle.task.list',
    request_id: `task_lifecycle_create_live_list_${suffix}`,
    params: { site_id: config.siteId, limit: 20 },
  }, fetchImpl);
  assert.equal(taskList.http_status, 200, JSON.stringify(taskList.body));
  assert.equal(taskList.body.ok, true);
  const listedTask = taskList.body.tasks.find((entry) => entry.task_id === created.body.task.task_id);
  assert.ok(listedTask, JSON.stringify(taskList.body.tasks));
  assert.equal(listedTask.mutation_authority, 'cloudflare_task_lifecycle_d1');
  assert.equal(listedTask.cloudflare_write_admission, 'admitted');

  const operationRead = await postCarrier(config, {
    operation: 'operation.read',
    request_id: `task_lifecycle_create_live_operation_read_${suffix}`,
    params: { site_id: config.siteId, operation_id: config.operationId, task_lifecycle_task_limit: 20, task_lifecycle_include_task_ids: [created.body.task.task_id], task_lifecycle_write_admission_limit: 20 },
  }, fetchImpl);
  assert.equal(operationRead.http_status, 200, JSON.stringify(operationRead.body));
  assert.equal(operationRead.body.ok, true);
  assert.ok(operationRead.body.task_lifecycle_tasks.some((entry) => entry.task_id === created.body.task.task_id));
  assert.equal(operationRead.body.operation_product_surface.task_lifecycle_default_mutation_authority, 'windows_task_lifecycle_sqlite');
  assert.equal(operationRead.body.operation_product_surface.task_lifecycle_default_cloudflare_write_admission, 'not_admitted');
  assert.equal(operationRead.body.operation_product_surface.task_lifecycle_task_create_authority, 'cloudflare_task_lifecycle_d1');
  assert.ok([
    'task_create_cloudflare_remaining_windows',
    'task_create_and_claim_cloudflare_remaining_windows',
    'task_create_claim_and_report_cloudflare_remaining_windows',
  ].includes(operationRead.body.operation_product_surface.task_lifecycle_authority_partition));
  assert.ok([
    'task_create_admitted_remaining_writes_not_admitted',
    'task_create_and_claim_admitted_remaining_writes_not_admitted',
    'task_create_claim_and_report_admitted_remaining_writes_not_admitted',
  ].includes(operationRead.body.operation_product_surface.task_lifecycle_write_admission_posture));
  assert.equal(operationRead.body.operation_product_surface.task_lifecycle_mutation_authority, 'split_by_mutation_class');
  assert.ok([
    'task_create_admitted',
    'task_create_and_claim_admitted',
    'task_create_claim_and_report_admitted',
  ].includes(operationRead.body.operation_product_surface.task_lifecycle_cloudflare_write_admission));

  return {
    schema: 'narada.cloudflare_carrier.task_lifecycle_create_live_smoke.v1',
    status: 'ok',
    worker_url: config.workerUrl,
    auth_source: config.auth.source,
    site_id: config.siteId,
    operation_id: config.operationId,
    task_id: created.body.task.task_id,
    task_number: created.body.task.task_number,
    admission_id: admissionId,
    mutation_authority: created.body.mutation_authority,
    cloudflare_write_admission: created.body.cloudflare_write_admission,
    write_effect: created.body.write_effect,
    task_lifecycle_task_count: operationRead.body.operation_product_surface.task_lifecycle_task_count,
    task_lifecycle_write_admission_count: operationRead.body.operation_product_surface.task_lifecycle_write_admission_count,
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
  if (!existsSync(resolved)) throw new Error(`task_lifecycle_create_live_smoke_token_file_missing:${resolved}`);
  return readFileSync(resolved, 'utf8').trim();
}

function loadLocalEnv(envPath, env = process.env) {
  if (!existsSync(envPath)) return;
  const content = readFileSync(envPath, 'utf8');
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const index = trimmed.indexOf('=');
    if (index <= 0) continue;
    const key = trimmed.slice(0, index).trim();
    const value = trimmed.slice(index + 1).trim().replace(/^[\"']|[\"']$/g, '');
    if (!(key in env)) env[key] = value;
  }
}

function trimTrailingSlash(value) {
  return String(value ?? '').replace(/\/+$/g, '');
}

if (process.argv[1] === scriptPath) {
  const config = parseTaskLifecycleCreateLiveSmokeArgs(process.argv.slice(2));
  const result = await runTaskLifecycleCreateLiveSmoke(config);
  if (config.format === 'text') {
    process.stdout.write(formatTaskLifecycleCreateLiveSmokeText(result));
  } else {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  }
}
