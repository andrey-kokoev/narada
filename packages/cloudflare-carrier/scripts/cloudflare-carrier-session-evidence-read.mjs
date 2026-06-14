#!/usr/bin/env node
import { fileURLToPath } from 'node:url';

import { authHeaders, resolveAuth } from './cloudflare-carrier-product-read.mjs';

export function parseSessionEvidenceReadArgs(argv = [], env = process.env) {
  const args = [...argv];
  const workerUrl = normalizeWorkerUrl(option(args, '--url') ?? env.CLOUDFLARE_CARRIER_URL ?? '');
  const siteId = option(args, '--site') ?? env.CLOUDFLARE_CARRIER_SITE_ID ?? null;
  const operationId = option(args, '--carrier-operation') ?? option(args, '--operation-id') ?? env.CLOUDFLARE_CARRIER_OPERATION_ID ?? null;
  const carrierSessionId = option(args, '--carrier-session-id') ?? option(args, '--session-id') ?? env.CLOUDFLARE_CARRIER_SESSION_ID ?? null;
  const afterSequence = parseOptionalInteger(option(args, '--after-sequence') ?? env.CLOUDFLARE_CARRIER_SESSION_EVIDENCE_AFTER_SEQUENCE ?? '0', 'after_sequence', { minimum: 0 });
  const limit = parseOptionalInteger(option(args, '--limit') ?? env.CLOUDFLARE_CARRIER_SESSION_EVIDENCE_LIMIT ?? '200', 'limit', { minimum: 1 });
  const requestId = option(args, '--request-id') ?? env.CLOUDFLARE_CARRIER_SESSION_EVIDENCE_REQUEST_ID ?? `session_evidence_read_${Date.now()}`;
  const format = option(args, '--format') ?? env.CLOUDFLARE_CARRIER_SESSION_EVIDENCE_FORMAT ?? 'json';
  const auth = resolveAuth(args, env);

  if (!workerUrl) throw new Error('session_evidence_read_requires_--url_or_CLOUDFLARE_CARRIER_URL');
  if (!carrierSessionId) throw new Error('session_evidence_read_requires_--carrier-session-id_or_--session-id_or_CLOUDFLARE_CARRIER_SESSION_ID');
  if (!['json', 'text'].includes(format)) throw new Error(`session_evidence_read_format_unsupported:${format}`);
  if (!auth) throw new Error('session_evidence_read_requires_bearer_token_or_operator_session');

  return {
    workerUrl,
    siteId,
    operationId,
    carrierSessionId,
    afterSequence,
    limit,
    requestId,
    format,
    auth,
  };
}

export async function readSessionEvidence(config, fetchImpl = fetch) {
  const response = await fetchImpl(new URL('/api/carrier', withTrailingSlash(config.workerUrl)), {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...authHeaders(config.auth),
    },
    body: JSON.stringify({
      operation: 'session.events.read',
      request_id: config.requestId,
      carrier_session_id: config.carrierSessionId,
      params: {
        after_sequence: config.afterSequence,
        limit: config.limit,
      },
    }),
  });
  const text = await response.text();
  const body = parseJsonText(text);
  if (response.status < 200 || response.status >= 300) {
    const code = body?.code ?? body?.error ?? `http_${response.status}`;
    const error = new Error(`session_evidence_read_request_failed:${code}`);
    error.code = code;
    error.http_status = response.status;
    error.response = body;
    throw error;
  }
  return {
    schema: 'narada.cloudflare_carrier.session_evidence_read.v1',
    status: 'ok',
    request_id: config.requestId,
    worker_url: config.workerUrl,
    auth_source: config.auth.source,
    params: {
      site_id: config.siteId ?? null,
      operation_id: config.operationId ?? null,
      carrier_session_id: config.carrierSessionId,
      after_sequence: config.afterSequence,
      limit: config.limit,
    },
    summary: summarizeSessionEvidence(body, config),
    response: body,
  };
}

export function summarizeSessionEvidence(body = {}, config = {}) {
  const events = Array.isArray(body?.events) ? body.events : [];
  const firstSequence = events.length > 0 ? events[0]?.sequence ?? null : null;
  const lastSequence = events.length > 0 ? events[events.length - 1]?.sequence ?? null : null;
  const latestEvent = events.length > 0 ? events[events.length - 1] : null;
  return {
    site_id: config.siteId ?? null,
    operation_id: config.operationId ?? null,
    carrier_session_id: config.carrierSessionId ?? null,
    event_count: events.length,
    next_cursor: body?.next_cursor ?? null,
    first_sequence: firstSequence,
    last_sequence: lastSequence,
    latest_event_kind: latestEvent?.event_kind ?? null,
    event_kind_counts: countBy(events, (event) => event?.event_kind ?? 'unknown'),
  };
}

export function formatSessionEvidenceText(result) {
  const summary = result?.summary ?? {};
  const workerUrl = result?.worker_url ?? null;
  const lines = [
    'Session Evidence: ok',
    `Worker: ${result?.worker_url ?? 'unknown'}`,
    `Auth: ${result?.auth_source ?? 'unknown'}`,
    `Site: ${summary.site_id ?? 'unknown'}`,
    `Operation: ${summary.operation_id ?? 'unknown'}`,
    `Session: ${summary.carrier_session_id ?? 'unknown'}`,
    `Events: count=${summary.event_count ?? 0} first=${summary.first_sequence ?? 'none'} last=${summary.last_sequence ?? 'none'} next_cursor=${summary.next_cursor ?? 'none'}`,
    `Latest Event: ${summary.latest_event_kind ?? 'none'}`,
    `Event Kinds: ${formatKeyValueMap(summary.event_kind_counts ?? {})}`,
  ];
  if (workerUrl && summary.site_id) {
    lines.push(
      `Site Read: pnpm --filter @narada2/cloudflare-carrier product:site:read:text -- --url ${workerUrl} --site ${summary.site_id} --operator-session-file <operator-session-file>`,
    );
    lines.push(
      `Site Next Workflow: pnpm --filter @narada2/cloudflare-carrier product:site:next:workflow:live:text -- --url ${workerUrl} --site ${summary.site_id} --operator-session-file <operator-session-file> --execute-site-next`,
    );
    lines.push(
      `Posture Coherence Review: pnpm --filter @narada2/cloudflare-carrier product:posture:coherence:live:text -- --url ${workerUrl} --site ${summary.site_id} --operator-session-file <operator-session-file>`,
    );
    lines.push(
      `Durability Coherence Review: pnpm --filter @narada2/cloudflare-carrier product:durability:coherence:live:text -- --url ${workerUrl} --site ${summary.site_id} --operator-session-file <operator-session-file>`,
    );
  }
  if (workerUrl && summary.site_id && summary.carrier_session_id) {
    lines.push(
      `Task Review: pnpm --filter @narada2/cloudflare-carrier product:task-lifecycle:review:text -- --url ${workerUrl} --site ${summary.site_id} --carrier-session-id ${summary.carrier_session_id} --operator-session-file <operator-session-file>`,
    );
    lines.push(
      `Task Workflow: pnpm --filter @narada2/cloudflare-carrier product:task-lifecycle:next:workflow:live:text -- --url ${workerUrl} --site ${summary.site_id} --carrier-session-id ${summary.carrier_session_id} --agent-id <agent-id> --operator-session-file <operator-session-file> --execute-task-lifecycle-next`,
    );
  }
  if (workerUrl && summary.site_id && summary.operation_id) {
    lines.push(
      `Operation Review: pnpm --filter @narada2/cloudflare-carrier product:operation:read:text -- --url ${workerUrl} --site ${summary.site_id} --operation-id ${summary.operation_id} --operator-session-file <operator-session-file>`,
    );
    lines.push(
      `Operation Next Workflow: pnpm --filter @narada2/cloudflare-carrier product:operation:next:workflow:live:text -- --url ${workerUrl} --site ${summary.site_id} --operation-id ${summary.operation_id} --operator-session-file <operator-session-file> --execute-operation-next`,
    );
  }
  return `${lines.join('\n')}\n`;
}

function option(args, name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : null;
}

function parseOptionalInteger(value, label, { minimum = 0 } = {}) {
  const parsed = Number.parseInt(String(value ?? '').trim(), 10);
  if (!Number.isInteger(parsed) || parsed < minimum) throw new Error(`session_evidence_read_${label}_invalid`);
  return parsed;
}

function normalizeWorkerUrl(value) {
  const text = String(value ?? '').trim();
  return text ? new URL(text).toString().replace(/\/$/, '') : '';
}

function withTrailingSlash(value) {
  return value.endsWith('/') ? value : `${value}/`;
}

function parseJsonText(text) {
  const trimmed = String(text ?? '').trim();
  if (!trimmed) return {};
  return JSON.parse(trimmed);
}

function countBy(items, classifier) {
  const counts = {};
  for (const item of Array.isArray(items) ? items : []) {
    const key = classifier(item) || 'unknown';
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}

function formatKeyValueMap(entries) {
  const items = Object.entries(entries ?? {});
  if (items.length === 0) return 'none';
  return items.map(([key, value]) => `${key}=${value}`).join(' ');
}

const scriptPath = fileURLToPath(import.meta.url);

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const config = parseSessionEvidenceReadArgs(process.argv.slice(2), process.env);
  const result = await readSessionEvidence(config);
  if (config.format === 'text') {
    process.stdout.write(formatSessionEvidenceText(result));
  } else {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  }
}
