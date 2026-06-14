#!/usr/bin/env node
import { fileURLToPath } from 'node:url';
import { authHeaders, resolveAuth } from './cloudflare-carrier-product-read.mjs';

const STATUS_ALIASES = new Map([['paused', 'inactive']]);
const SUPPORTED_STATUSES = new Set(['active', 'inactive', 'needs_continuation', 'closed']);

export function parseOperationStatusPutArgs(argv = [], env = process.env, now = () => Date.now()) {
  const args = [...argv];
  const workerUrl = normalizeWorkerUrl(option(args, '--url') ?? env.CLOUDFLARE_CARRIER_URL ?? '');
  const siteId = option(args, '--site') ?? env.CLOUDFLARE_CARRIER_SITE_ID ?? null;
  const operationId = option(args, '--operation-id') ?? option(args, '--carrier-operation') ?? env.CLOUDFLARE_CARRIER_OPERATION_ID ?? null;
  const requestedStatus = option(args, '--status') ?? env.CLOUDFLARE_CARRIER_OPERATION_STATUS ?? null;
  const status = normalizeOperationStatus(requestedStatus);
  const reason = normalizeOptionalString(option(args, '--reason') ?? env.CLOUDFLARE_CARRIER_OPERATION_STATUS_REASON ?? null);
  const requestId = option(args, '--request-id') ?? `operation_status_put_${String(operationId ?? 'operation').replace(/[^a-z0-9]+/gi, '_')}_${now()}`;
  const format = option(args, '--format') ?? env.CLOUDFLARE_CARRIER_OPERATION_STATUS_PUT_FORMAT ?? 'json';
  const auth = resolveAuth(args, env);

  if (!workerUrl) throw new Error('operation_status_put_requires_--url_or_CLOUDFLARE_CARRIER_URL');
  if (!siteId) throw new Error('operation_status_put_requires_--site_or_CLOUDFLARE_CARRIER_SITE_ID');
  if (!operationId) throw new Error('operation_status_put_requires_--operation-id_or_CLOUDFLARE_CARRIER_OPERATION_ID');
  if (!requestedStatus) throw new Error('operation_status_put_requires_--status_or_CLOUDFLARE_CARRIER_OPERATION_STATUS');
  if (!SUPPORTED_STATUSES.has(status)) throw new Error(`operation_status_put_status_unsupported:${requestedStatus}`);
  if (!['json', 'text'].includes(format)) throw new Error(`operation_status_put_format_unsupported:${format}`);
  if (!auth) throw new Error('operation_status_put_requires_bearer_token_or_operator_session');

  return {
    workerUrl,
    requestId,
    format,
    auth,
    params: {
      site_id: siteId,
      operation_id: operationId,
      status,
      ...(reason ? { reason } : {}),
    },
  };
}

export async function putCloudflareOperationStatus(config, fetchImpl = fetch) {
  const response = await fetchImpl(new URL('/api/carrier', withTrailingSlash(config.workerUrl)), {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...authHeaders(config.auth),
    },
    body: JSON.stringify({
      operation: 'operation.status.put',
      request_id: config.requestId,
      params: config.params,
    }),
  });
  const text = await response.text();
  const body = parseJsonText(text);
  if (response.status < 200 || response.status >= 300) {
    const code = body?.code ?? body?.error ?? `http_${response.status}`;
    const error = new Error(`operation_status_put_request_failed:${code}`);
    error.code = code;
    error.http_status = response.status;
    error.response = body;
    error.summary = summarizeOperationStatusPut(body, config.params);
    error.config = config;
    throw error;
  }
  return {
    schema: 'narada.cloudflare_carrier.operation_status_put.v1',
    status: 'ok',
    request_id: config.requestId,
    worker_url: config.workerUrl,
    auth_source: config.auth.source,
    params: config.params,
    response: body,
    summary: summarizeOperationStatusPut(body, config.params),
  };
}

export function summarizeOperationStatusPut(body = {}, params = {}) {
  const operation = body?.operation ?? {};
  return {
    operation_id: operation.operation_id ?? body.operation_id ?? params.operation_id ?? null,
    site_id: operation.site_id ?? body.site_id ?? params.site_id ?? null,
    ok: body.ok ?? null,
    code: body.code ?? null,
    action: body.action ?? null,
    previous_status: body.previous_status ?? null,
    status: operation.status ?? body.status ?? params.status ?? null,
    requested_status: body.requested_status ?? params.status ?? null,
    reason: body.reason ?? operation.status_reason ?? params.reason ?? null,
    transition: body.transition ?? null,
    updated_at: operation.updated_at ?? body.updated_at ?? null,
  };
}

export function formatOperationStatusPutText(result) {
  const summary = result?.summary ?? summarizeOperationStatusPut(result?.response ?? {}, result?.params ?? {});
  const ok = summary.ok === false || result?.status === 'refused' ? false : true;
  const workerUrl = result?.worker_url ?? null;
  return [
    `Operation Status Put: ${ok === false ? 'refused' : 'ok'}`,
    `Worker: ${workerUrl ?? 'unknown'}`,
    `Auth: ${result?.auth_source ?? 'unknown'}`,
    `Site: ${summary.site_id ?? result?.params?.site_id ?? 'unknown'}`,
    `Operation: ${summary.operation_id ?? result?.params?.operation_id ?? 'unknown'}`,
    ...(summary.code ? [`Code: ${summary.code}`] : []),
    `Status: ${summary.status ?? summary.requested_status ?? result?.params?.status ?? 'unknown'}`,
    ...(summary.requested_status && summary.requested_status !== summary.status ? [`Requested Status: ${summary.requested_status}`] : []),
    ...(summary.reason ? [`Reason: ${summary.reason}`] : []),
    ...(summary.previous_status ? [`Transition: ${summary.previous_status} -> ${summary.status ?? summary.requested_status ?? result?.params?.status ?? 'unknown'}`] : []),
    ...(summary.transition ? [`Transition Evidence: ${summary.transition}`] : []),
    `Updated: ${summary.updated_at ?? 'unknown'}`,
    ...(ok !== false && workerUrl && summary.site_id ? [
      `Site Read: pnpm --filter @narada2/cloudflare-carrier product:site:read:text -- --url ${workerUrl} --site ${summary.site_id} --operator-session-file <operator-session-file>`,
      `Site Next Workflow: pnpm --filter @narada2/cloudflare-carrier product:site:next:workflow:live:text -- --url ${workerUrl} --site ${summary.site_id} --operator-session-file <operator-session-file> --execute-site-next`,
      `Posture Coherence Review: pnpm --filter @narada2/cloudflare-carrier product:posture:coherence:live:text -- --url ${workerUrl} --site ${summary.site_id} --operator-session-file <operator-session-file>`,
      `Durability Coherence Review: pnpm --filter @narada2/cloudflare-carrier product:durability:coherence:live:text -- --url ${workerUrl} --site ${summary.site_id} --operator-session-file <operator-session-file>`,
    ] : []),
    ...(ok !== false && workerUrl && summary.site_id && summary.operation_id ? [
      `Operation Review: pnpm --filter @narada2/cloudflare-carrier product:operation:read:text -- --url ${workerUrl} --site ${summary.site_id} --operation-id ${summary.operation_id} --operator-session-file <operator-session-file>`,
      `Operation Next Workflow: pnpm --filter @narada2/cloudflare-carrier product:operation:next:workflow:live:text -- --url ${workerUrl} --site ${summary.site_id} --operation-id ${summary.operation_id} --operator-session-file <operator-session-file> --execute-operation-next`,
    ] : []),
  ].join('\n') + '\n';
}

function option(args, name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : null;
}

function normalizeOperationStatus(value) {
  const text = String(value ?? '').trim();
  return STATUS_ALIASES.get(text) ?? text;
}

function normalizeOptionalString(value) {
  const text = String(value ?? '').trim();
  return text || null;
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
    return { raw: text };
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    const config = parseOperationStatusPutArgs(process.argv.slice(2));
    const result = await putCloudflareOperationStatus(config);
    if (config.format === 'text') {
      process.stdout.write(formatOperationStatusPutText(result));
    } else {
      process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    }
  } catch (error) {
    if (error?.response && error?.summary && error?.config?.format === 'text') {
      process.stderr.write(formatOperationStatusPutText({
        status: 'refused',
        worker_url: error.config.workerUrl,
        auth_source: error.config.auth?.source,
        params: error.config.params,
        response: error.response,
        summary: error.summary,
      }));
    } else {
      process.stderr.write(JSON.stringify({ ok: false, code: error?.message ?? String(error), response: error?.response }, null, 2) + '\n');
    }
    process.exit(1);
  }
}
