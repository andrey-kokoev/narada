#!/usr/bin/env node
import { fileURLToPath } from 'node:url';
import { authHeaders, resolveAuth } from './cloudflare-carrier-product-read.mjs';

export function parseOperationCreateArgs(argv = [], env = process.env, now = () => Date.now()) {
  const args = [...argv];
  const workerUrl = normalizeWorkerUrl(option(args, '--url') ?? env.CLOUDFLARE_CARRIER_URL ?? '');
  const siteId = option(args, '--site') ?? env.CLOUDFLARE_CARRIER_SITE_ID ?? null;
  const operationId = option(args, '--operation-id') ?? option(args, '--carrier-operation') ?? env.CLOUDFLARE_CARRIER_OPERATION_ID ?? `operation_${now()}`;
  const displayName = option(args, '--display-name') ?? option(args, '--name') ?? env.CLOUDFLARE_CARRIER_OPERATION_DISPLAY_NAME ?? operationId;
  const operationKind = option(args, '--operation-kind') ?? option(args, '--kind') ?? env.CLOUDFLARE_CARRIER_OPERATION_KIND ?? 'operator';
  const status = option(args, '--status') ?? env.CLOUDFLARE_CARRIER_OPERATION_STATUS ?? 'active';
  const requestId = option(args, '--request-id') ?? `operation_create_${operationId.replace(/[^a-z0-9]+/gi, '_')}_${now()}`;
  const format = option(args, '--format') ?? env.CLOUDFLARE_CARRIER_OPERATION_CREATE_FORMAT ?? 'json';
  const auth = resolveAuth(args, env);

  if (!workerUrl) throw new Error('operation_create_requires_--url_or_CLOUDFLARE_CARRIER_URL');
  if (!siteId) throw new Error('operation_create_requires_--site_or_CLOUDFLARE_CARRIER_SITE_ID');
  if (!operationId) throw new Error('operation_create_requires_operation_id');
  if (!['active', 'paused', 'closed'].includes(status)) throw new Error(`operation_create_status_unsupported:${status}`);
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
    throw new Error(`operation_create_request_failed:${code}`);
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

export function formatOperationCreateText(result) {
  const summary = result?.summary ?? summarizeOperationCreate(result?.response ?? {});
  return [
    'Operation Create: ok',
    `Worker: ${result?.worker_url ?? 'unknown'}`,
    `Auth: ${result?.auth_source ?? 'unknown'}`,
    `Site: ${summary.site_id ?? result?.params?.site_id ?? 'unknown'}`,
    `Operation: ${summary.operation_id ?? result?.params?.operation_id ?? 'unknown'}`,
    `Name: ${summary.display_name ?? result?.params?.display_name ?? 'unknown'}`,
    `Kind: ${summary.operation_kind ?? result?.params?.operation_kind ?? 'unknown'}`,
    `Status: ${summary.status ?? result?.params?.status ?? 'unknown'}`,
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
    return { raw: text };
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    const config = parseOperationCreateArgs(process.argv.slice(2));
    const result = await createCloudflareOperation(config);
    if (config.format === 'text') {
      process.stdout.write(formatOperationCreateText(result));
    } else {
      process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    }
  } catch (error) {
    process.stderr.write(JSON.stringify({ ok: false, code: error?.message ?? String(error) }, null, 2) + '\n');
    process.exit(1);
  }
}
