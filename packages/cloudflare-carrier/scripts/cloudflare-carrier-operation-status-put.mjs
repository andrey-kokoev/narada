#!/usr/bin/env node
import { fileURLToPath } from 'node:url';
import { authHeaders, resolveAuth } from './cloudflare-carrier-product-read.mjs';

const SUPPORTED_STATUSES = new Set(['active', 'paused', 'closed']);

export function parseOperationStatusPutArgs(argv = [], env = process.env, now = () => Date.now()) {
  const args = [...argv];
  const workerUrl = normalizeWorkerUrl(option(args, '--url') ?? env.CLOUDFLARE_CARRIER_URL ?? '');
  const siteId = option(args, '--site') ?? env.CLOUDFLARE_CARRIER_SITE_ID ?? null;
  const operationId = option(args, '--operation-id') ?? option(args, '--carrier-operation') ?? env.CLOUDFLARE_CARRIER_OPERATION_ID ?? null;
  const status = option(args, '--status') ?? env.CLOUDFLARE_CARRIER_OPERATION_STATUS ?? null;
  const requestId = option(args, '--request-id') ?? `operation_status_put_${String(operationId ?? 'operation').replace(/[^a-z0-9]+/gi, '_')}_${now()}`;
  const format = option(args, '--format') ?? env.CLOUDFLARE_CARRIER_OPERATION_STATUS_PUT_FORMAT ?? 'json';
  const auth = resolveAuth(args, env);

  if (!workerUrl) throw new Error('operation_status_put_requires_--url_or_CLOUDFLARE_CARRIER_URL');
  if (!siteId) throw new Error('operation_status_put_requires_--site_or_CLOUDFLARE_CARRIER_SITE_ID');
  if (!operationId) throw new Error('operation_status_put_requires_--operation-id_or_CLOUDFLARE_CARRIER_OPERATION_ID');
  if (!status) throw new Error('operation_status_put_requires_--status_or_CLOUDFLARE_CARRIER_OPERATION_STATUS');
  if (!SUPPORTED_STATUSES.has(status)) throw new Error(`operation_status_put_status_unsupported:${status}`);
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
    throw new Error(`operation_status_put_request_failed:${code}`);
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
    status: operation.status ?? body.status ?? params.status ?? null,
    updated_at: operation.updated_at ?? body.updated_at ?? null,
  };
}

export function formatOperationStatusPutText(result) {
  const summary = result?.summary ?? summarizeOperationStatusPut(result?.response ?? {}, result?.params ?? {});
  return [
    'Operation Status Put: ok',
    `Worker: ${result?.worker_url ?? 'unknown'}`,
    `Auth: ${result?.auth_source ?? 'unknown'}`,
    `Site: ${summary.site_id ?? result?.params?.site_id ?? 'unknown'}`,
    `Operation: ${summary.operation_id ?? result?.params?.operation_id ?? 'unknown'}`,
    `Status: ${summary.status ?? result?.params?.status ?? 'unknown'}`,
    `Updated: ${summary.updated_at ?? 'unknown'}`,
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
    const config = parseOperationStatusPutArgs(process.argv.slice(2));
    const result = await putCloudflareOperationStatus(config);
    if (config.format === 'text') {
      process.stdout.write(formatOperationStatusPutText(result));
    } else {
      process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    }
  } catch (error) {
    process.stderr.write(JSON.stringify({ ok: false, code: error?.message ?? String(error) }, null, 2) + '\n');
    process.exit(1);
  }
}
