#!/usr/bin/env node
import { fileURLToPath } from 'node:url';
import { authHeaders, resolveAuth } from './cloudflare-carrier-product-read.mjs';

export function parseTaskLifecycleReadArgs(argv = [], env = process.env) {
  const args = [...argv];
  const workerUrl = normalizeWorkerUrl(option(args, '--url') ?? env.CLOUDFLARE_CARRIER_URL ?? '');
  const siteId = option(args, '--site') ?? env.CLOUDFLARE_CARRIER_SITE_ID ?? null;
  const taskId = option(args, '--task-id') ?? env.CLOUDFLARE_TASK_LIFECYCLE_TASK_ID ?? null;
  const carrierSessionId = option(args, '--carrier-session-id') ?? option(args, '--session-id') ?? env.CLOUDFLARE_CARRIER_SESSION_ID ?? null;
  const limit = clampInteger(option(args, '--limit') ?? env.CLOUDFLARE_TASK_LIFECYCLE_TASK_LIMIT ?? 25, 1, 100, 25);
  const format = option(args, '--format') ?? env.CLOUDFLARE_TASK_LIFECYCLE_TASK_FORMAT ?? 'json';
  const auth = resolveAuth(args, env);

  if (!workerUrl) throw new Error('task_lifecycle_read_requires_--url_or_CLOUDFLARE_CARRIER_URL');
  if (!siteId) throw new Error('task_lifecycle_read_requires_--site_or_CLOUDFLARE_CARRIER_SITE_ID');
  if (!['json', 'text'].includes(format)) throw new Error(`task_lifecycle_read_format_unsupported:${format}`);
  if (!auth) throw new Error('task_lifecycle_read_requires_bearer_token_or_operator_session');

  return {
    workerUrl,
    format,
    auth,
    params: {
      site_id: siteId,
      limit,
      ...(taskId ? { task_lifecycle_task_id: taskId } : {}),
    },
    carrierSessionId,
  };
}

export async function readCloudflareTaskLifecycle(config, fetchImpl = fetch) {
  const response = await fetchImpl(new URL('/api/carrier', withTrailingSlash(config.workerUrl)), {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...authHeaders(config.auth),
    },
    body: JSON.stringify({
      operation: 'task_lifecycle.task.list',
      request_id: `task_lifecycle_task_list_${Date.now()}`,
      params: config.params,
    }),
  });
  const text = await response.text();
  const body = parseJsonText(text);
  if (response.status < 200 || response.status >= 300) {
    const code = body?.code ?? body?.error ?? `http_${response.status}`;
    const error = new Error(`task_lifecycle_read_request_failed:${code}`);
    error.code = code;
    error.http_status = response.status;
    error.response = body;
    error.summary = summarizeTaskLifecycleRead(body, config.params);
    throw error;
  }
  return {
    schema: 'narada.cloudflare_carrier.task_lifecycle_read.v1',
    status: 'ok',
    worker_url: config.workerUrl,
    auth_source: config.auth.source,
    params: { ...config.params },
    response: body,
    summary: summarizeTaskLifecycleRead(body, config.params),
  };
}

export function summarizeTaskLifecycleRead(body = {}, params = {}) {
  const tasks = Array.isArray(body?.tasks) ? body.tasks : [];
  const focusedTask = tasks.find((entry) => entry?.task_id === params.task_lifecycle_task_id)
    ?? tasks.find((entry) => entry?.carrier_session_id === params.carrier_session_id)
    ?? tasks[0]
    ?? null;
  const openStatuses = new Set(['open', 'opened', 'claimed', 'active', 'needs_continuation']);
  const openTaskCount = tasks.filter((entry) => openStatuses.has(String(entry?.status ?? '').toLowerCase())).length;
  return {
    ok: body.ok ?? null,
    code: body.code ?? null,
    site_id: body.site_id ?? params.site_id ?? null,
    task_count: tasks.length,
    open_task_count: openTaskCount,
    mutation_authority: body.mutation_authority ?? null,
    mutation_class: body.mutation_class ?? null,
    cloudflare_write_admission: body.cloudflare_write_admission ?? null,
    task_id: focusedTask?.task_id ?? params.task_lifecycle_task_id ?? null,
    task_number: focusedTask?.task_number ?? null,
    task_status: focusedTask?.status ?? null,
    task_title: focusedTask?.title ?? null,
    carrier_session_id: focusedTask?.carrier_session_id ?? params.carrier_session_id ?? null,
    claimed_by_agent_id: focusedTask?.claimed_by_agent_id ?? null,
    reported_by_agent_id: focusedTask?.reported_by_agent_id ?? null,
    finished_by_agent_id: focusedTask?.finished_by_agent_id ?? null,
    changed_file_evidence_count: focusedTask?.changed_file_evidence_count ?? null,
    role_resolution_write_count: focusedTask?.role_resolution_write_count ?? null,
    roster_mutation_write_count: focusedTask?.roster_mutation_write_count ?? null,
  };
}

export function formatTaskLifecycleReadText(result) {
  const summary = result?.summary ?? summarizeTaskLifecycleRead(result?.response ?? {}, result?.params ?? {});
  return [
    `Task Lifecycle Review: ${summary.ok === false ? 'refused' : 'ok'}`,
    `Worker: ${result?.worker_url ?? 'unknown'}`,
    `Auth: ${result?.auth_source ?? 'unknown'}`,
    `Site: ${summary.site_id ?? 'unknown'}`,
    `Tasks: count=${summary.task_count ?? 0} open=${summary.open_task_count ?? 0}`,
    `Authority: mutation=${summary.mutation_authority ?? 'unknown'} class=${summary.mutation_class ?? 'unknown'} cloudflare_write=${summary.cloudflare_write_admission ?? 'unknown'}`,
    `Task: ${summary.task_id ?? 'unknown'}${summary.task_number ? ` #${summary.task_number}` : ''}`,
    `Status: ${summary.task_status ?? 'unknown'}`,
    ...(summary.task_title ? [`Title: ${summary.task_title}`] : []),
    ...(summary.carrier_session_id ? [`Session: ${summary.carrier_session_id}`] : []),
    ...(summary.claimed_by_agent_id ? [`Claimed By: ${summary.claimed_by_agent_id}`] : []),
    ...(summary.reported_by_agent_id ? [`Reported By: ${summary.reported_by_agent_id}`] : []),
    ...(summary.finished_by_agent_id ? [`Finished By: ${summary.finished_by_agent_id}`] : []),
    ...(summary.changed_file_evidence_count != null ? [`Changed File Evidence: ${summary.changed_file_evidence_count}`] : []),
    ...(summary.role_resolution_write_count != null ? [`Role Resolution Writes: ${summary.role_resolution_write_count}`] : []),
    ...(summary.roster_mutation_write_count != null ? [`Roster Mutation Writes: ${summary.roster_mutation_write_count}`] : []),
    ...(summary.code ? [`Code: ${summary.code}`] : []),
  ].join('\n') + '\n';
}

function option(args, name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : null;
}

function normalizeWorkerUrl(value) {
  return String(value ?? '').replace(/\/+$/, '');
}

function withTrailingSlash(value) {
  return String(value).endsWith('/') ? value : `${value}/`;
}

function parseJsonText(text) {
  try {
    return JSON.parse(text);
  } catch {
    return { ok: false, code: 'invalid_json', raw_text: text };
  }
}

function clampInteger(value, min, max, fallback) {
  const numeric = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(max, Math.max(min, numeric));
}

const entrypoint = process.argv[1] ? fileURLToPath(import.meta.url) === process.argv[1] : false;

if (entrypoint) {
  const config = parseTaskLifecycleReadArgs(process.argv.slice(2), process.env);
  const result = await readCloudflareTaskLifecycle(config);
  if (config.format === 'text') {
    process.stdout.write(formatTaskLifecycleReadText(result));
  } else {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  }
}
