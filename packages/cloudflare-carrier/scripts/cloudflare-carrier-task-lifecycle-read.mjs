#!/usr/bin/env node
import { fileURLToPath } from 'node:url';
import { authHeaders, resolveAuth } from './cloudflare-carrier-product-read.mjs';

export function parseTaskLifecycleReadArgs(argv = [], env = process.env) {
  const args = [...argv];
  const workerUrl = normalizeWorkerUrl(option(args, '--url') ?? env.CLOUDFLARE_CARRIER_URL ?? '');
  const siteId = option(args, '--site') ?? env.CLOUDFLARE_CARRIER_SITE_ID ?? null;
  const operationId = option(args, '--operation-id') ?? env.CLOUDFLARE_CARRIER_OPERATION_ID ?? null;
  const taskId = option(args, '--task-id') ?? env.CLOUDFLARE_TASK_LIFECYCLE_TASK_ID ?? null;
  const carrierSessionId = option(args, '--carrier-session-id') ?? option(args, '--session-id') ?? env.CLOUDFLARE_CARRIER_SESSION_ID ?? null;
  const defaultLimit = (carrierSessionId || operationId) && !taskId ? 100 : 25;
  const limit = clampInteger(option(args, '--limit') ?? env.CLOUDFLARE_TASK_LIFECYCLE_TASK_LIMIT ?? defaultLimit, 1, 100, defaultLimit);
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
      ...(operationId ? { operation_id: operationId } : {}),
      ...(taskId ? { task_lifecycle_task_id: taskId } : {}),
      ...(carrierSessionId ? { carrier_session_id: carrierSessionId } : {}),
    },
    carrierSessionId,
  };
}

export async function readCloudflareTaskLifecycle(config, fetchImpl = fetch) {
  const operation = config.params?.operation_id ? 'operation.read' : 'task_lifecycle.task.list';
  const response = await fetchImpl(new URL('/api/carrier', withTrailingSlash(config.workerUrl)), {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...authHeaders(config.auth),
    },
    body: JSON.stringify({
      operation,
      request_id: `${operation.replace(/\./g, '_')}_${Date.now()}`,
      params: config.params?.operation_id
        ? {
            site_id: config.params.site_id,
            operation_id: config.params.operation_id,
            task_lifecycle_task_limit: config.params.limit,
            ...(config.params.task_lifecycle_task_id ? { task_lifecycle_include_task_ids: [config.params.task_lifecycle_task_id] } : {}),
          }
        : config.params,
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
  const tasks = Array.isArray(body?.task_lifecycle_tasks)
    ? body.task_lifecycle_tasks
    : Array.isArray(body?.tasks)
      ? body.tasks
      : [];
  const newestTasks = [...tasks].reverse();
  const sessionFocusedTask = params.carrier_session_id
    ? newestTasks.find((entry) => entry?.carrier_session_id === params.carrier_session_id) ?? null
    : null;
  const openStatuses = new Set(['open', 'opened', 'claimed', 'active', 'needs_continuation']);
  const operationFocusedTask = params.operation_id
    ? newestTasks.find((entry) => openStatuses.has(String(entry?.status ?? '').toLowerCase())) ?? newestTasks[0] ?? null
    : null;
  const focusedTask = tasks.find((entry) => entry?.task_id === params.task_lifecycle_task_id)
    ?? sessionFocusedTask
    ?? operationFocusedTask
    ?? tasks[0]
    ?? null;
  const openTaskCount = tasks.filter((entry) => openStatuses.has(String(entry?.status ?? '').toLowerCase())).length;
  return {
    ok: body.ok ?? null,
    code: body.code ?? null,
    site_id: body.site_id ?? body.operation?.site_id ?? params.site_id ?? null,
    operation_id: body.operation?.operation_id ?? params.operation_id ?? null,
    task_count: tasks.length,
    open_task_count: openTaskCount,
    mutation_authority: body.mutation_authority ?? focusedTask?.mutation_authority ?? null,
    mutation_class: body.mutation_class ?? focusedTask?.mutation_class ?? null,
    cloudflare_write_admission: body.cloudflare_write_admission ?? focusedTask?.cloudflare_write_admission ?? null,
    task_id: focusedTask?.task_id ?? params.task_lifecycle_task_id ?? null,
    task_number: focusedTask?.task_number ?? null,
    task_status: focusedTask?.status ?? null,
    report_id: focusedTask?.report_id ?? null,
    finish_id: focusedTask?.finish_id ?? null,
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
  const workerUrl = result?.worker_url ?? null;
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
    ...(workerUrl && summary.site_id ? [`Site Read: pnpm --filter @narada2/cloudflare-carrier product:site:read:text -- --url ${workerUrl} --site ${summary.site_id} --operator-session-file <operator-session-file>`] : []),
    ...(workerUrl && summary.site_id ? [`Site Next Workflow: pnpm --filter @narada2/cloudflare-carrier product:site:next:workflow:live:text -- --url ${workerUrl} --site ${summary.site_id} --operator-session-file <operator-session-file> --execute-site-next`] : []),
    ...(workerUrl && summary.site_id && summary.carrier_session_id ? [`Session Evidence: pnpm --filter @narada2/cloudflare-carrier product:session:evidence:text -- --url ${workerUrl} --site ${summary.site_id} --carrier-session-id ${summary.carrier_session_id} --operator-session-file <operator-session-file>`] : []),
    ...(workerUrl && summary.site_id && summary.operation_id ? [`Operation Review: pnpm --filter @narada2/cloudflare-carrier product:operation:read:text -- --url ${workerUrl} --site ${summary.site_id} --operation-id ${summary.operation_id} --operator-session-file <operator-session-file>`] : []),
    ...(workerUrl && summary.site_id && summary.operation_id ? [`Operation Next Workflow: pnpm --filter @narada2/cloudflare-carrier product:operation:next:workflow:live:text -- --url ${workerUrl} --site ${summary.site_id} --operation-id ${summary.operation_id} --operator-session-file <operator-session-file> --execute-operation-next`] : []),
    ...(summary.claimed_by_agent_id ? [`Claimed By: ${summary.claimed_by_agent_id}`] : []),
    ...(summary.reported_by_agent_id ? [`Reported By: ${summary.reported_by_agent_id}`] : []),
    ...(summary.finished_by_agent_id ? [`Finished By: ${summary.finished_by_agent_id}`] : []),
    ...formatTaskLifecycleNextCommands(result, summary),
    ...(summary.changed_file_evidence_count != null ? [`Changed File Evidence: ${summary.changed_file_evidence_count}`] : []),
    ...(summary.role_resolution_write_count != null ? [`Role Resolution Writes: ${summary.role_resolution_write_count}`] : []),
    ...(summary.roster_mutation_write_count != null ? [`Roster Mutation Writes: ${summary.roster_mutation_write_count}`] : []),
    ...(summary.code ? [`Code: ${summary.code}`] : []),
  ].join('\n') + '\n';
}

function formatTaskLifecycleNextCommands(result, summary) {
  const workerUrl = result?.worker_url ?? null;
  const siteId = summary.site_id ?? result?.params?.site_id ?? null;
  const taskId = summary.task_id ?? result?.params?.task_lifecycle_task_id ?? null;
  if (!workerUrl || !siteId || !taskId) return [];
  const normalizedStatus = normalizeTaskStatus(summary.task_status);
  const claimAgent = '<agent-id>';
  const reportAgent = summary.claimed_by_agent_id ?? null;
  const finishAgent = summary.reported_by_agent_id ?? summary.claimed_by_agent_id ?? null;
  const workflowAgentOption = normalizedStatus === 'open'
    ? ` --agent-id ${claimAgent}`
    : '';
  const workflowCommand = `Task Workflow: pnpm --filter @narada2/cloudflare-carrier product:task-lifecycle:next:workflow:live:text -- --url ${workerUrl} --site ${siteId} --task-id ${taskId}${workflowAgentOption} --operator-session-file <operator-session-file> --execute-task-lifecycle-next`;
  if (summary.report_id && !summary.finish_id) {
    return finishAgent
      ? [
          workflowCommand,
          `Finish Command: pnpm --filter @narada2/cloudflare-carrier product:task-lifecycle:finish:text -- --url ${workerUrl} --site ${siteId} --task-id ${taskId} --finalizer-agent ${finishAgent} --finish-verdict accepted --operator-session-file <operator-session-file>`,
        ]
      : [workflowCommand];
  }
  if (normalizedStatus === 'claimed') {
    return reportAgent
      ? [
          workflowCommand,
          `Report Command: pnpm --filter @narada2/cloudflare-carrier product:task-lifecycle:report:text -- --url ${workerUrl} --site ${siteId} --task-id ${taskId} --reporter-agent ${reportAgent} --summary <summary> --operator-session-file <operator-session-file>`,
        ]
      : [workflowCommand];
  }
  if (normalizedStatus === 'open') {
    return [
      workflowCommand,
      `Claim Command: pnpm --filter @narada2/cloudflare-carrier product:task-lifecycle:claim:text -- --url ${workerUrl} --site ${siteId} --task-id ${taskId} --claimant-agent ${claimAgent} --operator-session-file <operator-session-file>`,
    ];
  }
  return [];
}

function normalizeTaskStatus(value) {
  const status = String(value ?? '').trim().toLowerCase();
  if (status === 'open' || status === 'opened' || status === 'todo' || status === 'pending') return 'open';
  if (status === 'claimed' || status === 'active' || status === 'needs_continuation') return 'claimed';
  if (status === 'reported') return 'reported';
  if (status === 'done' || status === 'resolved' || status === 'closed' || status === 'finished') return 'closed';
  return status;
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
