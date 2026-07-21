#!/usr/bin/env node
import { resolveAuth } from '../shared/cloudflare-carrier-auth-http.mjs';
import { fileURLToPath } from 'node:url';
import { authHeaders } from '../shared/cloudflare-carrier-auth-http.mjs';

const STATUS_ALIASES = new Map([['paused', 'inactive']]);
const SUPPORTED_STATUSES = new Set(['active', 'inactive', 'needs_continuation', 'closed']);

export function parseOperationCreateArgs(argv = [], env = process.env, now = () => Date.now()) {
  const args = [...argv];
  const workerUrl = normalizeWorkerUrl(option(args, '--url') ?? env.CLOUDFLARE_CARRIER_URL ?? '');
  const siteId = option(args, '--site') ?? env.CLOUDFLARE_CARRIER_SITE_ID ?? null;
  const operationId = option(args, '--operation-id') ?? option(args, '--carrier-operation') ?? env.CLOUDFLARE_CARRIER_OPERATION_ID ?? `operation_${now()}`;
  const displayName = option(args, '--display-name') ?? option(args, '--name') ?? env.CLOUDFLARE_CARRIER_OPERATION_DISPLAY_NAME ?? operationId;
  const operationKind = option(args, '--operation-kind') ?? option(args, '--kind') ?? env.CLOUDFLARE_CARRIER_OPERATION_KIND ?? 'operator';
  const requestedStatus = option(args, '--status') ?? env.CLOUDFLARE_CARRIER_OPERATION_STATUS ?? 'active';
  const status = normalizeOperationStatus(requestedStatus);
  const requestId = option(args, '--request-id') ?? `operation_create_${operationId.replace(/[^a-z0-9]+/gi, '_')}_${now()}`;
  const format = option(args, '--format') ?? env.CLOUDFLARE_CARRIER_OPERATION_CREATE_FORMAT ?? 'json';
  const auth = resolveAuth(args, env);

  if (!workerUrl) throw new Error('operation_create_requires_--url_or_CLOUDFLARE_CARRIER_URL');
  if (!siteId) throw new Error('operation_create_requires_--site_or_CLOUDFLARE_CARRIER_SITE_ID');
  if (!operationId) throw new Error('operation_create_requires_operation_id');
  if (!SUPPORTED_STATUSES.has(status)) throw new Error(`operation_create_status_unsupported:${requestedStatus}`);
  if (!['json', 'text'].includes(format)) throw new Error(`operation_create_format_unsupported:${format}`);
  if (!auth) throw new Error('operation_create_requires_bearer_token_or_operator_session');

  return {
    workerUrl,
    requestId,
    format,
    auth,
    params: {
      site_id: siteId,
      operation_id: operationId,
      display_name: displayName,
      operation_kind: operationKind,
      status,
    },
  };
}

export async function createCloudflareOperation(config, fetchImpl = fetch) {
  const response = await fetchImpl(new URL('/api/carrier', withTrailingSlash(config.workerUrl)), {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...authHeaders(config.auth),
    },
    body: JSON.stringify({
      operation: 'operation.create',
      request_id: config.requestId,
      params: config.params,
    }),
  });
  const text = await response.text();
  const body = parseJsonText(text);
  if (response.status < 200 || response.status >= 300) {
    const code = body?.code ?? body?.error ?? `http_${response.status}`;
    const error = new Error(`operation_create_request_failed:${code}`);
    error.code = code;
    error.http_status = response.status;
    error.response = body;
    error.summary = summarizeOperationCreateFailure(body, config.params);
    error.config = config;
    throw error;
  }
  return {
    schema: 'narada.cloudflare_carrier.operation_create.v1',
    status: 'ok',
    request_id: config.requestId,
    worker_url: config.workerUrl,
    auth_source: config.auth.source,
    params: config.params,
    response: body,
    summary: summarizeOperationCreate(body),
  };
}

export function summarizeOperationCreate(body = {}) {
  const operation = body?.operation ?? {};
  return {
    operation_id: operation.operation_id ?? body.operation_id ?? null,
    site_id: operation.site_id ?? body.site_id ?? null,
    display_name: operation.display_name ?? null,
    operation_kind: operation.operation_kind ?? null,
    status: operation.status ?? null,
    created_at: operation.created_at ?? null,
    updated_at: operation.updated_at ?? null,
  };
}

export function summarizeOperationCreateFailure(body = {}, params = {}) {
  return {
    ok: body?.ok ?? false,
    code: body?.code ?? body?.error ?? null,
    action: body?.action ?? null,
    reason: body?.reason ?? null,
    site_id: body?.site_id ?? params.site_id ?? null,
    operation_id: body?.operation_id ?? params.operation_id ?? null,
    status: body?.status ?? params.status ?? null,
  };
}

export function formatOperationCreateText(result) {
  const summary = result?.summary ?? summarizeOperationCreate(result?.response ?? {});
  const refused = result?.status === 'refused' || summary?.ok === false;
  const workerUrl = result?.worker_url ?? null;
  if (refused) {
    return [
      'Operation Create: refused',
      `Worker: ${result?.worker_url ?? 'unknown'}`,
      `Auth: ${result?.auth_source ?? 'unknown'}`,
      `Code: ${summary.code ?? 'unknown'}`,
      `Site: ${summary.site_id ?? result?.params?.site_id ?? 'unknown'}`,
      `Operation: ${summary.operation_id ?? result?.params?.operation_id ?? 'unknown'}`,
      `Refusal: action=${summary.action ?? 'unknown'} reason=${summary.reason ?? 'unknown'}`,
      `Status: ${summary.status ?? result?.params?.status ?? 'unknown'}`,
    ].join('\n') + '\n';
  }
  return [
    'Operation Create: ok',
    `Worker: ${workerUrl ?? 'unknown'}`,
    `Auth: ${result?.auth_source ?? 'unknown'}`,
    `Site: ${summary.site_id ?? result?.params?.site_id ?? 'unknown'}`,
    `Operation: ${summary.operation_id ?? result?.params?.operation_id ?? 'unknown'}`,
    `Name: ${summary.display_name ?? result?.params?.display_name ?? 'unknown'}`,
    `Kind: ${summary.operation_kind ?? result?.params?.operation_kind ?? 'unknown'}`,
    `Status: ${summary.status ?? result?.params?.status ?? 'unknown'}`,
    ...(workerUrl && summary.site_id ? [
      `Site Read: pnpm --filter @narada2/cloudflare-carrier product:site:read:text -- --url ${workerUrl} --site ${summary.site_id} --operator-session-file <operator-session-file>`,
      `Site Next Workflow: pnpm --filter @narada2/cloudflare-carrier product:site:next:workflow:live:text -- --url ${workerUrl} --site ${summary.site_id} --operator-session-file <operator-session-file> --execute-site-next`,
      `Posture Coherence Review: pnpm --filter @narada2/cloudflare-carrier product:posture:coherence:live:text -- --url ${workerUrl} --site ${summary.site_id} --operator-session-file <operator-session-file>`,
      `Durability Coherence Review: pnpm --filter @narada2/cloudflare-carrier product:durability:coherence:live:text -- --url ${workerUrl} --site ${summary.site_id} --operator-session-file <operator-session-file>`,
    ] : []),
    ...(workerUrl && summary.site_id && summary.operation_id ? [
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

export async function main(argv = process.argv.slice(2), env = process.env) {
  try {
    const config = parseOperationCreateArgs(argv, env);
    const result = await createCloudflareOperation(config);
    if (config.format === 'text') {
      process.stdout.write(formatOperationCreateText(result));
    } else {
      process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    }
  } catch (error) {
    if (error?.response && error?.summary && error?.config?.format === 'text') {
      process.stderr.write(formatOperationCreateText({
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

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  await main();
}
