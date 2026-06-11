#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const VALID_OPERATIONS = new Set(['site.list', 'site.read', 'operation.list', 'operation.read']);

export function parseProductReadArgs(argv = [], env = process.env) {
  const args = [...argv];
  const positional = positionalArgs(args);
  const operation = option(args, '--operation') ?? positional[0] ?? env.CLOUDFLARE_CARRIER_PRODUCT_OPERATION ?? 'site.list';
  const workerUrl = normalizeWorkerUrl(option(args, '--url') ?? env.CLOUDFLARE_CARRIER_URL ?? '');
  const siteId = option(args, '--site') ?? env.CLOUDFLARE_CARRIER_SITE_ID ?? null;
  const operationId = option(args, '--carrier-operation') ?? option(args, '--operation-id') ?? env.CLOUDFLARE_CARRIER_OPERATION_ID ?? null;
  const limit = parseOptionalInteger(option(args, '--limit') ?? env.CLOUDFLARE_CARRIER_PRODUCT_LIMIT ?? null, 'limit');
  const format = option(args, '--format') ?? env.CLOUDFLARE_CARRIER_PRODUCT_FORMAT ?? 'json';
  const requestId = option(args, '--request-id') ?? `product_read_${operation.replace(/[^a-z0-9]+/gi, '_')}_${Date.now()}`;
  const auth = resolveAuth(args, env);

  if (!workerUrl) throw new Error('product_read_requires_--url_or_CLOUDFLARE_CARRIER_URL');
  if (!VALID_OPERATIONS.has(operation)) throw new Error(`product_read_operation_unsupported:${operation}`);
  if (!['json', 'summary', 'text'].includes(format)) throw new Error(`product_read_format_unsupported:${format}`);
  if ((operation === 'site.read' || operation === 'operation.list' || operation === 'operation.read') && !siteId) throw new Error(`product_read_${operation}_requires_--site`);
  if (operation === 'operation.read' && !operationId) throw new Error('product_read_operation.read_requires_--operation-id_or_--carrier-operation');
  if (!auth) throw new Error('product_read_requires_bearer_token_or_operator_session');

  return {
    workerUrl,
    operation,
    requestId,
    params: buildParams({ operation, siteId, operationId, limit }),
    format,
    auth,
  };
}

export function buildParams({ operation, siteId, operationId, limit }) {
  const params = {};
  if (operation === 'site.read' || operation === 'operation.list' || operation === 'operation.read') params.site_id = siteId;
  if (operation === 'operation.read') params.operation_id = operationId;
  if (Number.isInteger(limit)) params.limit = limit;
  return params;
}

export async function readProductSurface(config, fetchImpl = fetch) {
  const response = await fetchImpl(new URL('/api/carrier', withTrailingSlash(config.workerUrl)), {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...authHeaders(config.auth),
    },
    body: JSON.stringify({
      operation: config.operation,
      request_id: config.requestId,
      params: config.params,
    }),
  });
  const text = await response.text();
  const body = parseJsonText(text);
  if (response.status < 200 || response.status >= 300) {
    const code = body?.code ?? body?.error ?? `http_${response.status}`;
    throw new Error(`product_read_request_failed:${code}`);
  }
  return {
    schema: 'narada.cloudflare_carrier.product_read.v1',
    status: 'ok',
    operation: config.operation,
    request_id: config.requestId,
    worker_url: config.workerUrl,
    auth_source: config.auth.source,
    params: config.params,
    response: body,
    summary: summarizeProductSurface(config.operation, body),
  };
}

export function summarizeProductSurface(operation, body) {
  if (operation === 'site.list') {
    const overview = body?.site_product_overview ?? {};
    return {
      operation,
      site_count: overview.site_count ?? body?.sites?.length ?? 0,
      next_site_id: overview.next_site_id ?? null,
      next_health: overview.next_health ?? null,
      next_action: overview.next_action ?? null,
      health_counts: overview.health_counts ?? null,
    };
  }
  if (operation === 'site.read') {
    const status = body?.site_product_status ?? body?.product_status ?? null;
    return {
      operation,
      site_id: body?.site?.site_id ?? body?.site_id ?? status?.site_id ?? null,
      display_name: body?.site?.display_name ?? null,
      health: status?.health ?? null,
      next_action: status?.next_action ?? null,
      continuity_state: status?.continuity_state ?? null,
      continuity_direction_state: status?.continuity_direction_state ?? null,
      continuity_direction_missing: status?.continuity_direction_missing ?? null,
      continuity_loop_state: status?.continuity_loop_state ?? null,
      continuity_reconciliation_execution_state: status?.continuity_reconciliation_execution_state ?? null,
      continuity_reconciliation_execution_health: status?.site_continuity_reconciliation_execution_status?.health ?? status?.continuity_reconciliation_execution_health ?? null,
      continuity_packet_count: status?.continuity_packet_count ?? 0,
      continuity_loop_report_count: status?.continuity_loop_report_count ?? 0,
      continuity_reconciliation_execution_count: status?.continuity_reconciliation_execution_count ?? 0,
      persistence_state: status?.cloudflare_persistence_posture?.state ?? body?.cloudflare_persistence_posture?.state ?? null,
      recovery_state: status?.cloudflare_recovery_posture?.state ?? body?.cloudflare_recovery_posture?.state ?? null,
      membership_count: Array.isArray(body?.memberships) ? body.memberships.length : 0,
      session_count: Array.isArray(body?.sessions) ? body.sessions.length : status?.session_count ?? 0,
    };
  }
  if (operation === 'operation.list') {
    const operations = Array.isArray(body?.operations) ? body.operations : [];
    const overview = body?.operation_posture_overview ?? body?.operation_product_overview ?? {};
    return {
      operation,
      site_id: body?.site?.site_id ?? body?.site_id ?? operations[0]?.site_id ?? null,
      operation_count: overview.operation_count ?? operations.length,
      active_operation_id: overview.active_operation_id ?? null,
      next_operation_id: overview.next_operation_id ?? operations[0]?.operation_id ?? null,
      next_status: overview.next_status ?? null,
      next_action: overview.next_action ?? null,
      next_reason: overview.next_reason ?? null,
      health_counts: overview.health_counts ?? null,
    };
  }
  if (operation === 'operation.read') {
    const lifecycle = body?.operation_lifecycle_status ?? null;
    return {
      operation,
      site_id: body?.operation?.site_id ?? body?.site_id ?? null,
      operation_id: body?.operation?.operation_id ?? body?.operation_id ?? null,
      phase: lifecycle?.phase ?? null,
      health: lifecycle?.health ?? null,
      next_action: lifecycle?.next_action ?? body?.operation_product_surface?.next_action ?? null,
      session_count: lifecycle?.session_count ?? body?.operation_product_surface?.session_count ?? 0,
      task_count: lifecycle?.task_count ?? body?.operation_product_surface?.task_count ?? 0,
    };
  }
  return { operation };
}

export function formatProductSurfaceText(result) {
  const summary = result?.summary ?? summarizeProductSurface(result?.operation, result?.response ?? {});
  const operation = summary?.operation ?? result?.operation ?? 'unknown';
  const lines = [
    `Product Read: ${operation}`,
    `Worker: ${result?.worker_url ?? 'unknown'}`,
    `Auth: ${result?.auth_source ?? 'unknown'}`,
  ];
  if (operation === 'site.list') {
    lines.push(`Sites: count=${summary.site_count ?? 0} next=${summary.next_site_id ?? 'none'} health=${summary.next_health ?? 'unknown'}`);
    lines.push(`Next Action: ${summary.next_action ?? 'none'}`);
    if (summary.health_counts) lines.push(`Health Counts: ${formatKeyValueMap(summary.health_counts)}`);
    return `${lines.join('\n')}\n`;
  }
  if (operation === 'site.read') {
    lines.push(`Site: ${summary.site_id ?? 'unknown'}${summary.display_name ? ` (${summary.display_name})` : ''}`);
    lines.push(`Health: ${summary.health ?? 'unknown'}`);
    lines.push(`Next Action: ${summary.next_action ?? 'none'}`);
    lines.push(`Continuity: state=${summary.continuity_state ?? 'unknown'} direction=${summary.continuity_direction_state ?? 'unknown'} loop=${summary.continuity_loop_state ?? 'unknown'}`);
    if (summary.continuity_direction_missing?.length > 0) lines.push(`Continuity Missing: ${summary.continuity_direction_missing.join(', ')}`);
    lines.push(`Reconciliation: state=${summary.continuity_reconciliation_execution_state ?? 'unknown'} health=${summary.continuity_reconciliation_execution_health ?? 'unknown'}`);
    lines.push(`Evidence Counts: packets=${summary.continuity_packet_count ?? 0} loops=${summary.continuity_loop_report_count ?? 0} reconciliations=${summary.continuity_reconciliation_execution_count ?? 0}`);
    lines.push(`Durability: persistence=${summary.persistence_state ?? 'unknown'} recovery=${summary.recovery_state ?? 'unknown'}`);
    lines.push(`Authority: memberships=${summary.membership_count ?? 0} sessions=${summary.session_count ?? 0}`);
    return `${lines.join('\n')}\n`;
  }
  if (operation === 'operation.list') {
    lines.push(`Site: ${summary.site_id ?? 'unknown'}`);
    lines.push(`Operations: count=${summary.operation_count ?? 0} active=${summary.active_operation_id ?? 'none'} next=${summary.next_operation_id ?? 'none'}`);
    lines.push(`Next: status=${summary.next_status ?? 'unknown'} action=${summary.next_action ?? 'none'} reason=${summary.next_reason ?? 'none'}`);
    if (summary.health_counts) lines.push(`Health Counts: ${formatKeyValueMap(summary.health_counts)}`);
    return `${lines.join('\n')}\n`;
  }
  if (operation === 'operation.read') {
    lines.push(`Site: ${summary.site_id ?? 'unknown'}`);
    lines.push(`Operation: ${summary.operation_id ?? 'unknown'}`);
    lines.push(`Lifecycle: phase=${summary.phase ?? 'unknown'} health=${summary.health ?? 'unknown'}`);
    lines.push(`Next Action: ${summary.next_action ?? 'none'}`);
    lines.push(`Evidence Counts: sessions=${summary.session_count ?? 0} tasks=${summary.task_count ?? 0}`);
    return `${lines.join('\n')}\n`;
  }
  return `${lines.join('\n')}\n`;
}

export function resolveAuth(args = [], env = process.env) {
  const token = option(args, '--token') ?? null;
  if (token) return { kind: 'bearer', value: token, source: 'flag:--token' };
  const tokenFile = option(args, '--token-file') ?? null;
  if (tokenFile) return { kind: 'bearer', value: readFileSync(tokenFile, 'utf8').trim(), source: 'token-file' };

  const cookie = option(args, '--operator-session-cookie') ?? null;
  if (cookie) return { kind: 'operator_session', value: normalizeOperatorSessionCookie(cookie), source: 'operator-session-cookie' };
  const sessionFile = option(args, '--operator-session-file') ?? null;
  if (sessionFile) {
    const session = parseJsonText(readFileSync(sessionFile, 'utf8'));
    if (!session?.cookie) throw new Error('product_read_operator_session_file_missing_cookie');
    return { kind: 'operator_session', value: normalizeOperatorSessionCookie(session.cookie), source: 'operator-session-file' };
  }
  const envTokenFile = env.CLOUDFLARE_CARRIER_TOKEN_FILE ?? null;
  if (envTokenFile) return { kind: 'bearer', value: readFileSync(envTokenFile, 'utf8').trim(), source: 'env:CLOUDFLARE_CARRIER_TOKEN_FILE' };
  if (env.CLOUDFLARE_CARRIER_TOKEN) return { kind: 'bearer', value: env.CLOUDFLARE_CARRIER_TOKEN, source: 'env:CLOUDFLARE_CARRIER_TOKEN' };
  if (env.CLOUDFLARE_OPERATOR_SESSION_COOKIE) {
    return { kind: 'operator_session', value: normalizeOperatorSessionCookie(env.CLOUDFLARE_OPERATOR_SESSION_COOKIE), source: 'env:CLOUDFLARE_OPERATOR_SESSION_COOKIE' };
  }
  const envSessionFile = env.CLOUDFLARE_OPERATOR_SESSION_FILE ?? null;
  if (envSessionFile) {
    const session = parseJsonText(readFileSync(envSessionFile, 'utf8'));
    if (!session?.cookie) throw new Error('product_read_operator_session_file_missing_cookie');
    return { kind: 'operator_session', value: normalizeOperatorSessionCookie(session.cookie), source: 'env:CLOUDFLARE_OPERATOR_SESSION_FILE' };
  }
  return null;
}

export function authHeaders(auth) {
  if (auth.kind === 'bearer') return { authorization: `Bearer ${auth.value}` };
  if (auth.kind === 'operator_session') return { cookie: `narada_operator_session=${auth.value}` };
  throw new Error(`product_read_auth_kind_unsupported:${auth.kind}`);
}

function option(args, name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : null;
}

function positionalArgs(args) {
  const values = [];
  for (let index = 0; index < args.length; index += 1) {
    const entry = args[index];
    if (entry.startsWith('--')) {
      index += 1;
      continue;
    }
    values.push(entry);
  }
  return values;
}

function parseOptionalInteger(value, label) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isInteger(parsed) || parsed < 1) throw new Error(`product_read_${label}_invalid`);
  return parsed;
}

function normalizeWorkerUrl(value) {
  return String(value ?? '').replace(/\/+$/, '');
}

function withTrailingSlash(value) {
  return String(value).endsWith('/') ? value : `${value}/`;
}

function normalizeOperatorSessionCookie(value) {
  const text = String(value ?? '').trim();
  const match = /(?:^|;\s*)narada_operator_session=([^;]+)/.exec(text);
  return match ? match[1] : text;
}

function parseJsonText(text) {
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

function formatKeyValueMap(value) {
  return Object.entries(value ?? {})
    .map(([key, count]) => `${key}=${count}`)
    .join(' ');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    const config = parseProductReadArgs(process.argv.slice(2));
    const result = await readProductSurface(config);
    if (config.format === 'text') {
      process.stdout.write(formatProductSurfaceText(result));
    } else {
      process.stdout.write(JSON.stringify(config.format === 'summary' ? result.summary : result, null, 2) + '\n');
    }
  } catch (error) {
    process.stderr.write(JSON.stringify({ ok: false, code: error?.message ?? String(error) }, null, 2) + '\n');
    process.exit(1);
  }
}
