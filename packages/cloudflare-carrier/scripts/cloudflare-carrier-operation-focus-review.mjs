#!/usr/bin/env node
import { fileURLToPath } from 'node:url';
import { authHeaders, resolveAuth } from './cloudflare-carrier-product-read.mjs';

const VALID_OPERATIONS = new Set(['operation_focus_review.acknowledge', 'operation_focus_review.list']);

export function parseOperationFocusReviewArgs(argv = [], env = process.env, now = () => Date.now()) {
  const args = [...argv];
  const operation = option(args, '--operation') ?? env.CLOUDFLARE_OPERATION_FOCUS_REVIEW_OPERATION ?? 'operation_focus_review.acknowledge';
  const workerUrl = normalizeWorkerUrl(option(args, '--url') ?? env.CLOUDFLARE_CARRIER_URL ?? '');
  const siteId = option(args, '--site') ?? env.CLOUDFLARE_CARRIER_SITE_ID ?? null;
  const focusKind = normalizeOptionalString(option(args, '--focus-kind') ?? env.CLOUDFLARE_OPERATION_FOCUS_REVIEW_FOCUS_KIND ?? null);
  const focusRef = normalizeOptionalString(option(args, '--focus-ref') ?? env.CLOUDFLARE_OPERATION_FOCUS_REVIEW_FOCUS_REF ?? null);
  const operationId = normalizeOptionalString(option(args, '--operation-id') ?? option(args, '--carrier-operation') ?? env.CLOUDFLARE_CARRIER_OPERATION_ID ?? null);
  const reviewId = normalizeOptionalString(option(args, '--review-id') ?? env.CLOUDFLARE_OPERATION_FOCUS_REVIEW_ID ?? null);
  const reviewAction = normalizeOptionalString(option(args, '--review-action') ?? env.CLOUDFLARE_OPERATION_FOCUS_REVIEW_ACTION ?? null) ?? 'acknowledge_operation_focus_review';
  const reviewStatus = normalizeOptionalString(option(args, '--review-status') ?? env.CLOUDFLARE_OPERATION_FOCUS_REVIEW_STATUS ?? null) ?? 'acknowledged';
  const note = normalizeOptionalString(option(args, '--note') ?? env.CLOUDFLARE_OPERATION_FOCUS_REVIEW_NOTE ?? null);
  const generatedAt = normalizeOptionalString(option(args, '--generated-at') ?? env.CLOUDFLARE_OPERATION_FOCUS_REVIEW_GENERATED_AT ?? null) ?? new Date(now()).toISOString();
  const limit = parseOptionalInteger(option(args, '--limit') ?? env.CLOUDFLARE_OPERATION_FOCUS_REVIEW_LIMIT ?? null, 'limit');
  const requestId = option(args, '--request-id')
    ?? env.CLOUDFLARE_OPERATION_FOCUS_REVIEW_REQUEST_ID
    ?? `operation_focus_review_${safeToken(operation)}_${safeToken(reviewId ?? focusRef ?? siteId ?? now())}`;
  const format = option(args, '--format') ?? env.CLOUDFLARE_OPERATION_FOCUS_REVIEW_FORMAT ?? 'json';
  const auth = resolveAuth(args, env);

  if (!VALID_OPERATIONS.has(operation)) throw new Error(`operation_focus_review_operation_unsupported:${operation}`);
  if (!workerUrl) throw new Error('operation_focus_review_requires_--url_or_CLOUDFLARE_CARRIER_URL');
  if (!siteId) throw new Error('operation_focus_review_requires_--site_or_CLOUDFLARE_CARRIER_SITE_ID');
  if (!['json', 'text'].includes(format)) throw new Error(`operation_focus_review_format_unsupported:${format}`);
  if (!auth) throw new Error('operation_focus_review_requires_bearer_token_or_operator_session');
  if (operation === 'operation_focus_review.acknowledge') {
    if (!focusKind) throw new Error('operation_focus_review_acknowledge_requires_--focus-kind');
    if (!focusRef) throw new Error('operation_focus_review_acknowledge_requires_--focus-ref');
  }

  return {
    workerUrl,
    operation,
    requestId,
    format,
    auth,
    params: buildOperationFocusReviewParams({
      operation,
      siteId,
      focusKind,
      focusRef,
      operationId,
      reviewId,
      reviewAction,
      reviewStatus,
      note,
      generatedAt,
      limit,
    }),
  };
}

export function buildOperationFocusReviewParams(input = {}) {
  const params = { site_id: input.siteId };
  if (input.operation === 'operation_focus_review.list') {
    if (Number.isInteger(input.limit)) {
      params.limit = input.limit;
      params.operation_focus_review_limit = input.limit;
    }
    return params;
  }
  if (input.reviewId) params.review_id = input.reviewId;
  if (input.operationId) params.operation_id = input.operationId;
  params.focus_kind = input.focusKind;
  params.focus_ref = input.focusRef;
  params.review_action = input.reviewAction;
  params.review_status = input.reviewStatus;
  params.generated_at = input.generatedAt;
  if (input.note) params.note = input.note;
  return params;
}

export async function callOperationFocusReview(config, fetchImpl = fetch) {
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
    const error = new Error(`operation_focus_review_failed:${code}`);
    error.code = code;
    error.http_status = response.status;
    error.response = body;
    error.summary = summarizeOperationFocusReview(config.operation, body, config.params);
    error.config = config;
    throw error;
  }
  return {
    schema: 'narada.cloudflare_carrier.operation_focus_review.v1',
    status: 'ok',
    operation: config.operation,
    request_id: config.requestId,
    worker_url: config.workerUrl,
    auth_source: config.auth.source,
    params: { ...config.params },
    response: body,
    summary: summarizeOperationFocusReview(config.operation, body, config.params),
  };
}

export function summarizeOperationFocusReview(operation, body = {}, params = {}) {
  if (operation === 'operation_focus_review.list') {
    const reviews = Array.isArray(body?.reviews) ? body.reviews : [];
    const latest = reviews[0] ?? null;
    return {
      operation,
      ok: body.ok ?? null,
      code: body.code ?? null,
      status: body.status ?? null,
      site_id: body.site_id ?? params.site_id ?? null,
      review_count: reviews.length,
      latest_review_id: latest?.review_id ?? null,
      latest_focus_kind: latest?.focus_kind ?? null,
      latest_focus_ref: latest?.focus_ref ?? null,
      latest_review_status: latest?.review_status ?? null,
      latest_recorded_at: latest?.recorded_at ?? null,
      operation_focus_review_authority: body.operation_focus_review_authority ?? null,
      review_admission: body.review_admission ?? null,
    };
  }
  const record = body?.record ?? {};
  return {
    operation,
    ok: body.ok ?? null,
    code: body.code ?? null,
    status: body.status ?? null,
    site_id: body.site_id ?? record.site_id ?? params.site_id ?? null,
    review_id: record.review_id ?? params.review_id ?? null,
    operation_id: record.operation_id ?? params.operation_id ?? null,
    focus_kind: record.focus_kind ?? params.focus_kind ?? null,
    focus_ref: record.focus_ref ?? params.focus_ref ?? null,
    review_action: record.review_action ?? params.review_action ?? null,
    review_status: record.review_status ?? params.review_status ?? null,
    note: record.note ?? params.note ?? null,
    operation_focus_review_authority: body.operation_focus_review_authority ?? record.review_authority ?? null,
    review_admission: body.review_admission ?? null,
    recorded_by_principal_id: record.recorded_by_principal_id ?? null,
    recorded_at: record.recorded_at ?? null,
  };
}

export function formatOperationFocusReviewText(result) {
  const summary = result?.summary ?? {};
  const refused = result?.status === 'refused' || summary?.ok === false;
  const lines = [
    `Operation Focus Review: ${labelForOperation(summary.operation ?? result?.operation ?? 'unknown')}${refused ? ' refused' : ''}`,
    `Worker: ${result?.worker_url ?? 'unknown'}`,
    `Auth: ${result?.auth_source ?? 'unknown'}`,
    `Site: ${summary.site_id ?? result?.params?.site_id ?? 'unknown'}`,
  ];
  if (summary.code) lines.push(`Code: ${summary.code}`);
  if (summary.status) lines.push(`Status: ${summary.status}`);
  if ((summary.operation ?? result?.operation) === 'operation_focus_review.list') {
    lines.push(`Reviews: count=${summary.review_count ?? 0}`);
    if (summary.latest_focus_kind || summary.latest_focus_ref) {
      lines.push(`Latest Review: ${summary.latest_focus_kind ?? 'unknown'}:${summary.latest_focus_ref ?? 'unknown'} status=${summary.latest_review_status ?? 'unknown'}`);
    }
    if (summary.latest_recorded_at) lines.push(`Latest Recorded: ${summary.latest_recorded_at}`);
  } else {
    if (summary.review_id) lines.push(`Review Id: ${summary.review_id}`);
    if (summary.operation_id) lines.push(`Operation: ${summary.operation_id}`);
    if (summary.focus_kind || summary.focus_ref) lines.push(`Focus: ${summary.focus_kind ?? 'unknown'}:${summary.focus_ref ?? 'unknown'}`);
    if (summary.review_action || summary.review_status) lines.push(`Decision: ${summary.review_action ?? 'unknown'} status=${summary.review_status ?? 'unknown'}`);
    if (summary.note) lines.push(`Note: ${summary.note}`);
    if (summary.recorded_by_principal_id) lines.push(`Recorded By: ${summary.recorded_by_principal_id}`);
    if (summary.recorded_at) lines.push(`Recorded At: ${summary.recorded_at}`);
  }
  if (summary.operation_focus_review_authority) lines.push(`Authority: ${summary.operation_focus_review_authority}`);
  if (summary.review_admission) lines.push(`Admission: ${summary.review_admission}`);
  return `${lines.join('\n')}\n`;
}

function labelForOperation(operation) {
  if (operation === 'operation_focus_review.list') return 'list';
  if (operation === 'operation_focus_review.acknowledge') return 'acknowledge';
  return operation;
}

function option(args, name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : null;
}

function parseOptionalInteger(value, label) {
  if (value == null || value === '') return null;
  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isFinite(parsed)) throw new Error(`operation_focus_review_invalid_${label}:${value}`);
  return parsed;
}

function normalizeOptionalString(value) {
  const text = String(value ?? '').trim();
  return text || null;
}

function normalizeWorkerUrl(value) {
  return String(value ?? '').replace(/\/+$/, '');
}

function parseJsonText(text) {
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

function withTrailingSlash(value) {
  return String(value).endsWith('/') ? value : `${value}/`;
}

function safeToken(value) {
  return String(value ?? '').replace(/[^a-z0-9]+/gi, '_');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    const config = parseOperationFocusReviewArgs(process.argv.slice(2));
    const result = await callOperationFocusReview(config);
    if (config.format === 'text') {
      process.stdout.write(formatOperationFocusReviewText(result));
    } else {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    }
  } catch (error) {
    if (error?.response && error?.summary && error?.config?.format === 'text') {
      process.stderr.write(formatOperationFocusReviewText({
        status: 'refused',
        operation: error.config.operation,
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
