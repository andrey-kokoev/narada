#!/usr/bin/env node
import { fileURLToPath } from 'node:url';

import { createCloudflareTaskLifecycleTask } from './cloudflare-carrier-task-lifecycle-create.mjs';
import { readProductSurface, resolveAuth } from './cloudflare-carrier-product-read.mjs';

export function parseTaskLifecycleCreateFromDirectiveIntentArgs(argv = [], env = process.env, now = () => Date.now()) {
  const args = [...argv];
  const workerUrl = normalizeWorkerUrl(option(args, '--url') ?? env.CLOUDFLARE_CARRIER_URL ?? '');
  const siteId = option(args, '--site') ?? env.CLOUDFLARE_CARRIER_SITE_ID ?? null;
  const operationId = option(args, '--operation-id') ?? option(args, '--carrier-operation') ?? env.CLOUDFLARE_CARRIER_OPERATION_ID ?? null;
  const format = option(args, '--format') ?? env.CLOUDFLARE_TASK_LIFECYCLE_CREATE_FROM_DIRECTIVE_INTENT_FORMAT ?? 'json';
  const requestId = option(args, '--request-id') ?? `task_create_from_directive_intent_${now()}`;
  const auth = resolveAuth(args, env);

  if (!workerUrl) throw new Error('task_lifecycle_create_from_directive_intent_requires_--url_or_CLOUDFLARE_CARRIER_URL');
  if (!siteId) throw new Error('task_lifecycle_create_from_directive_intent_requires_--site_or_CLOUDFLARE_CARRIER_SITE_ID');
  if (!operationId) throw new Error('task_lifecycle_create_from_directive_intent_requires_--operation-id_or_--carrier-operation');
  if (!['json', 'text'].includes(format)) throw new Error(`task_lifecycle_create_from_directive_intent_format_unsupported:${format}`);
  if (!auth) throw new Error('task_lifecycle_create_from_directive_intent_requires_bearer_token_or_operator_session');

  return { workerUrl, siteId, operationId, format, requestId, auth };
}

export async function createTaskFromDirectiveIntent(config, fetchImpl = fetch, now = () => Date.now()) {
  const operationRead = await readProductSurface({
    workerUrl: config.workerUrl,
    operation: 'operation.read',
    requestId: `${config.requestId}_operation_read`,
    params: { site_id: config.siteId, operation_id: config.operationId },
    format: 'json',
    auth: config.auth,
  }, fetchImpl);

  const directiveIntent = selectDirectiveIntentWithoutTask(operationRead.response);
  if (!directiveIntent) throw new Error('task_lifecycle_create_from_directive_intent_requires_unmapped_directive_intent');

  const existingTask = taskForDirectiveIntent(directiveIntent, operationRead.response);
  if (existingTask) {
    return {
      schema: 'narada.cloudflare_carrier.task_lifecycle_create_from_directive_intent.v1',
      status: 'ok',
      worker_url: config.workerUrl,
      auth_source: config.auth.source,
      site_id: config.siteId,
      operation_id: config.operationId,
      mode: 'existing_task',
      title: directiveIntentTaskTitle(directiveIntent),
      directive_record_id: directiveIntent.directive_record_id ?? null,
      existing_task_id: existingTask.task_id ?? null,
      operation_read_summary: operationRead.summary,
    };
  }

  const title = directiveIntentTaskTitle(directiveIntent);
  const createResult = await createCloudflareTaskLifecycleTask({
    workerUrl: config.workerUrl,
    requestId: `${config.requestId}_task_create_${now()}`,
    format: 'json',
    auth: config.auth,
    params: {
      site_id: config.siteId,
      admission_id: `${config.operationId}_directive_intent_${directiveIntent.directive_record_id ?? 'unknown'}`,
      title,
    },
  }, fetchImpl);

  return {
    schema: 'narada.cloudflare_carrier.task_lifecycle_create_from_directive_intent.v1',
    status: 'ok',
    worker_url: config.workerUrl,
    auth_source: config.auth.source,
    site_id: config.siteId,
    operation_id: config.operationId,
    mode: 'task_created',
    title,
    directive_record_id: directiveIntent.directive_record_id ?? null,
    created_task_id: createResult.summary?.task_id ?? null,
    task_create_summary: createResult.summary,
    operation_read_summary: operationRead.summary,
  };
}

export function directiveIntentTaskTitle(record = {}) {
  const directiveId = record.directive_record_id || record.directive_intent?.directive_id || 'directive_intent';
  const classification = record.classification_state || record.classification?.state || 'unknown';
  const delay = record.latest_delay_minutes ?? record.classification?.latest_delay_minutes ?? 'unknown';
  return ['directive', directiveId, classification, 'webhook_delay', delay].filter(Boolean).join(' ');
}

export function directiveIntentTaskPredicate(record = {}) {
  const tokens = [record.directive_record_id, record.directive_intent?.directive_id, record.directive_intent?.input_event_id].filter(Boolean);
  return (task = {}) => {
    const taskText = JSON.stringify(task);
    return tokens.some((token) => taskText.includes(token));
  };
}

export function taskForDirectiveIntent(record = {}, operationReadBody = {}) {
  const tasks = Array.isArray(operationReadBody?.tasks) ? operationReadBody.tasks : [];
  return tasks.find(directiveIntentTaskPredicate(record)) ?? null;
}

export function selectDirectiveIntentWithoutTask(operationReadBody = {}) {
  const records = Array.isArray(operationReadBody?.webhook_delay_directive_records) ? operationReadBody.webhook_delay_directive_records : [];
  return records.find((record) => !taskForDirectiveIntent(record, operationReadBody)) ?? records[0] ?? null;
}

export function formatTaskLifecycleCreateFromDirectiveIntentText(result) {
  const taskId = result?.existing_task_id ?? result?.created_task_id ?? null;
  const workerUrl = result?.worker_url ?? null;
  const lines = [
    'Task Lifecycle Create From Directive Intent: ok',
    `Worker: ${result?.worker_url ?? 'unknown'}`,
    `Auth: ${result?.auth_source ?? 'unknown'}`,
    `Site: ${result?.site_id ?? 'unknown'}`,
    `Operation: ${result?.operation_id ?? 'unknown'}`,
    `Mode: ${result?.mode ?? 'unknown'}`,
    `Directive Record: ${result?.directive_record_id ?? 'unknown'}`,
    `Title: ${result?.title ?? 'unknown'}`,
  ];
  if (result?.existing_task_id) lines.push(`Existing Task: ${result.existing_task_id}`);
  if (result?.created_task_id) lines.push(`Created Task: ${result.created_task_id}`);
  if (workerUrl && result?.site_id) {
    lines.push(`Site Read: pnpm --filter @narada2/cloudflare-carrier product:site:read:text -- --url ${workerUrl} --site ${result.site_id} --operator-session-file <operator-session-file>`);
    lines.push(`Site Next Workflow: pnpm --filter @narada2/cloudflare-carrier product:site:next:workflow:live:text -- --url ${workerUrl} --site ${result.site_id} --operator-session-file <operator-session-file> --execute-site-next`);
    lines.push(`Posture Coherence Review: pnpm --filter @narada2/cloudflare-carrier product:posture:coherence:live:text -- --url ${workerUrl} --site ${result.site_id} --operator-session-file <operator-session-file>`);
    lines.push(`Durability Coherence Review: pnpm --filter @narada2/cloudflare-carrier product:durability:coherence:live:text -- --url ${workerUrl} --site ${result.site_id} --operator-session-file <operator-session-file>`);
  }
  if (workerUrl && result?.site_id && taskId) {
    lines.push(`Task Review: pnpm --filter @narada2/cloudflare-carrier product:task-lifecycle:review:text -- --url ${workerUrl} --site ${result.site_id} --task-id ${taskId} --operator-session-file <operator-session-file>`);
    lines.push(`Task Workflow: pnpm --filter @narada2/cloudflare-carrier product:task-lifecycle:next:workflow:live:text -- --url ${workerUrl} --site ${result.site_id} --task-id ${taskId} --agent-id <agent-id> --operator-session-file <operator-session-file> --execute-task-lifecycle-next`);
  }
  if (workerUrl && result?.site_id && result?.operation_id) {
    lines.push(`Operation Review: pnpm --filter @narada2/cloudflare-carrier product:operation:read:text -- --url ${workerUrl} --site ${result.site_id} --operation-id ${result.operation_id} --operator-session-file <operator-session-file>`);
    lines.push(`Operation Next Workflow: pnpm --filter @narada2/cloudflare-carrier product:operation:next:workflow:live:text -- --url ${workerUrl} --site ${result.site_id} --operation-id ${result.operation_id} --operator-session-file <operator-session-file> --execute-operation-next`);
  }
  return `${lines.join('\n')}\n`;
}


function option(args, name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : null;
}

function normalizeWorkerUrl(value) {
  return String(value ?? '').replace(/\/+$/, '');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    const config = parseTaskLifecycleCreateFromDirectiveIntentArgs(process.argv.slice(2));
    const result = await createTaskFromDirectiveIntent(config);
    if (config.format === 'text') {
      process.stdout.write(formatTaskLifecycleCreateFromDirectiveIntentText(result));
    } else {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    }
  } catch (error) {
    process.stderr.write(JSON.stringify({ ok: false, code: error?.message ?? String(error), response: error?.response }, null, 2) + '\n');
    process.exit(1);
  }
}
