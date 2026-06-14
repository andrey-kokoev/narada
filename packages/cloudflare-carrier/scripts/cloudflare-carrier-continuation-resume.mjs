#!/usr/bin/env node
import { fileURLToPath } from 'node:url';

import { putCloudflareOperationStatus } from './cloudflare-carrier-operation-status-put.mjs';
import { authHeaders, resolveAuth } from './cloudflare-carrier-product-read.mjs';

const CONTINUATION_RESUME_ACTION = 'resume_operation_continuation';

export function parseContinuationResumeArgs(argv = [], env = process.env, now = () => Date.now()) {
  const args = [...argv];
  const workerUrl = normalizeWorkerUrl(option(args, '--url') ?? env.CLOUDFLARE_CARRIER_URL ?? '');
  const siteId = option(args, '--site') ?? env.CLOUDFLARE_CARRIER_SITE_ID ?? null;
  const operationId = option(args, '--operation-id') ?? option(args, '--carrier-operation') ?? env.CLOUDFLARE_CARRIER_OPERATION_ID ?? null;
  const agentId = option(args, '--agent-id') ?? option(args, '--agent') ?? env.CLOUDFLARE_CARRIER_AGENT_ID ?? null;
  const carrierSessionId = option(args, '--carrier-session-id') ?? option(args, '--session') ?? env.CLOUDFLARE_CARRIER_SESSION_ID ?? generatedSessionId(operationId, now);
  const siteRoot = option(args, '--site-root') ?? env.CLOUDFLARE_CARRIER_SITE_ROOT ?? env.CLOUDFLARE_CARRIER_SITE_REF ?? null;
  const reason = option(args, '--reason') ?? env.CLOUDFLARE_CARRIER_OPERATION_STATUS_REASON ?? 'operation_continuation_resumed_by_operator';
  const requestId = option(args, '--request-id') ?? `continuation_resume_${sanitizeId(operationId ?? 'operation')}_${now()}`;
  const format = option(args, '--format') ?? env.CLOUDFLARE_CARRIER_CONTINUATION_RESUME_FORMAT ?? 'json';
  const activateOperation = !flag(args, '--skip-activate') && !parseBoolean(env.CLOUDFLARE_CARRIER_CONTINUATION_RESUME_SKIP_ACTIVATE ?? '');
  const routeCheck = !flag(args, '--skip-route-check') && !parseBoolean(env.CLOUDFLARE_CARRIER_CONTINUATION_RESUME_SKIP_ROUTE_CHECK ?? '');
  const auth = resolveAuth(args, env);

  if (!workerUrl) throw new Error('continuation_resume_requires_--url_or_CLOUDFLARE_CARRIER_URL');
  if (!siteId) throw new Error('continuation_resume_requires_--site_or_CLOUDFLARE_CARRIER_SITE_ID');
  if (!operationId) throw new Error('continuation_resume_requires_--operation-id_or_CLOUDFLARE_CARRIER_OPERATION_ID');
  if (!agentId) throw new Error('continuation_resume_requires_--agent-id_or_CLOUDFLARE_CARRIER_AGENT_ID');
  if (!carrierSessionId) throw new Error('continuation_resume_requires_--carrier-session-id_or_generated_session_id');
  if (!['json', 'text'].includes(format)) throw new Error(`continuation_resume_format_unsupported:${format}`);
  if (!auth) throw new Error('continuation_resume_requires_bearer_token_or_operator_session');

  return {
    workerUrl,
    requestId,
    format,
    activateOperation,
    routeCheck,
    auth,
    params: {
      site_id: siteId,
      operation_id: operationId,
      carrier_session_id: carrierSessionId,
      agent_id: agentId,
      ...(siteRoot ? { site_root: siteRoot } : {}),
      ...(reason ? { reason } : {}),
    },
  };
}

export async function resumeCloudflareContinuation(config, fetchImpl = fetch) {
  const route = config.routeCheck === false ? null : await readContinuationRoute(config, fetchImpl);
  if (route && route.workflow_next_action !== CONTINUATION_RESUME_ACTION) {
    const error = new Error(`continuation_resume_route_refused:${route.workflow_next_action ?? 'missing_route'}`);
    error.code = 'continuation_resume_route_refused';
    error.summary = summarizeContinuationRouteRefusal(route, config.params);
    error.config = config;
    throw error;
  }
  const activation = config.activateOperation === false ? null : await putCloudflareOperationStatus({
    workerUrl: config.workerUrl,
    requestId: `${config.requestId}_activate`,
    format: config.format,
    auth: config.auth,
    params: {
      site_id: config.params.site_id,
      operation_id: config.params.operation_id,
      status: 'active',
      reason: config.params.reason ?? 'operation_continuation_resumed_by_operator',
    },
  }, fetchImpl);

  const response = await fetchImpl(new URL('/api/carrier', withTrailingSlash(config.workerUrl)), {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...authHeaders(config.auth),
    },
    body: JSON.stringify({
      operation: 'session.start',
      request_id: `${config.requestId}_session_start`,
      params: {
        carrier_session_id: config.params.carrier_session_id,
        agent_id: config.params.agent_id,
        site_id: config.params.site_id,
        operation_id: config.params.operation_id,
        ...(config.params.site_root ? { site_root: config.params.site_root } : {}),
      },
    }),
  });
  const text = await response.text();
  const body = parseJsonText(text);
  if (response.status < 200 || response.status >= 300) {
    const code = body?.code ?? body?.error ?? `http_${response.status}`;
    const error = new Error(`continuation_resume_session_start_failed:${code}`);
    error.code = code;
    error.http_status = response.status;
    error.response = body;
    error.summary = summarizeContinuationResumeFailure(body, config.params);
    error.config = config;
    throw error;
  }

  return {
    schema: 'narada.cloudflare_carrier.continuation_resume.v1',
    status: 'ok',
    request_id: config.requestId,
    worker_url: config.workerUrl,
    auth_source: config.auth.source,
    params: config.params,
    route,
    activation,
    session_start: body,
    summary: summarizeContinuationResume({ route, activation, session_start: body }, config.params),
  };
}

export async function readContinuationRoute(config, fetchImpl = fetch) {
  const response = await fetchImpl(new URL('/api/carrier', withTrailingSlash(config.workerUrl)), {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...authHeaders(config.auth),
    },
    body: JSON.stringify({
      operation: 'operation.read',
      request_id: `${config.requestId}_route_read`,
      params: {
        site_id: config.params.site_id,
        operation_id: config.params.operation_id,
      },
    }),
  });
  const text = await response.text();
  const body = parseJsonText(text);
  if (response.status < 200 || response.status >= 300) {
    const code = body?.code ?? body?.error ?? `http_${response.status}`;
    const error = new Error(`continuation_resume_route_read_failed:${code}`);
    error.code = code;
    error.http_status = response.status;
    error.response = body;
    error.summary = summarizeContinuationResumeFailure(body, config.params);
    error.config = config;
    throw error;
  }
  return summarizeContinuationRoute(body, config.params);
}

export function summarizeContinuationRoute(body = {}, params = {}) {
  const lifecycle = body?.operation_lifecycle_status ?? null;
  const workflowRoute = body?.operation_workflow_route ?? null;
  return {
    site_id: body?.operation?.site_id ?? body?.site_id ?? params.site_id ?? null,
    operation_id: body?.operation?.operation_id ?? body?.operation_id ?? params.operation_id ?? null,
    current_status: body?.operation?.status ?? lifecycle?.phase ?? null,
    lifecycle_next_action: lifecycle?.next_action ?? null,
    workflow_next_action: workflowRoute?.next_action ?? null,
    workflow_reason: workflowRoute?.reason ?? null,
    workflow_target: workflowRoute?.target ?? null,
  };
}

export function summarizeContinuationResume(result = {}, params = {}) {
  const activationSummary = result.activation?.summary ?? null;
  const sessionStart = result.session_start ?? {};
  const event = sessionStart.event ?? null;
  return {
    site_id: params.site_id ?? activationSummary?.site_id ?? sessionStart.site_id ?? null,
    operation_id: params.operation_id ?? activationSummary?.operation_id ?? sessionStart.operation_id ?? event?.payload?.operation_id ?? null,
    carrier_session_id: sessionStart.carrier_session_id ?? params.carrier_session_id ?? event?.carrier_session_id ?? null,
    agent_id: params.agent_id ?? event?.payload?.agent_id ?? null,
    activation_status: activationSummary?.status ?? (result.activation ? 'unknown' : 'skipped'),
    activation_transition: activationSummary?.transition ?? null,
    activation_reason: activationSummary?.reason ?? params.reason ?? null,
    route_next_action: result.route?.workflow_next_action ?? null,
    route_reason: result.route?.workflow_reason ?? null,
    session_event_kind: event?.event_kind ?? null,
    session_event_sequence: event?.sequence ?? null,
  };
}

export function summarizeContinuationRouteRefusal(route = {}, params = {}) {
  return {
    ok: false,
    code: 'continuation_resume_route_refused',
    action: 'deny',
    reason: route.workflow_next_action ? 'operation_route_not_continuation_resume' : 'operation_route_missing',
    site_id: route.site_id ?? params.site_id ?? null,
    operation_id: route.operation_id ?? params.operation_id ?? null,
    current_status: route.current_status ?? null,
    lifecycle_next_action: route.lifecycle_next_action ?? null,
    workflow_next_action: route.workflow_next_action ?? null,
    workflow_reason: route.workflow_reason ?? null,
  };
}

export function summarizeContinuationResumeFailure(body = {}, params = {}) {
  return {
    ok: body.ok ?? false,
    code: body.code ?? body.error ?? null,
    action: body.action ?? null,
    reason: body.reason ?? null,
    site_id: body.site_id ?? params.site_id ?? null,
    operation_id: body.operation_id ?? params.operation_id ?? null,
    carrier_session_id: body.carrier_session_id ?? params.carrier_session_id ?? null,
    agent_id: params.agent_id ?? null,
  };
}

export function formatContinuationResumeText(result) {
  const summary = result?.summary ?? summarizeContinuationResume(result ?? {}, result?.params ?? {});
  const refused = result?.status === 'refused' || summary?.ok === false;
  const actionableRoute = summary.route_next_action && !['none', 'monitor_operation'].includes(summary.route_next_action);
  const lines = [
    `Continuation Resume: ${refused ? 'refused' : 'ok'}`,
    `Worker: ${result?.worker_url ?? 'unknown'}`,
    `Auth: ${result?.auth_source ?? 'unknown'}`,
    `Site: ${summary.site_id ?? result?.params?.site_id ?? 'unknown'}`,
    `Operation: ${summary.operation_id ?? result?.params?.operation_id ?? 'unknown'}`,
    `Session: ${summary.carrier_session_id ?? result?.params?.carrier_session_id ?? 'unknown'}`,
    `Agent: ${summary.agent_id ?? result?.params?.agent_id ?? 'unknown'}`,
  ];
  if (refused) {
    if (summary.code) lines.push(`Code: ${summary.code}`);
    lines.push(`Refusal: action=${summary.action ?? 'deny'} reason=${summary.reason ?? 'unknown'}`);
    return `${lines.join('\n')}\n`;
  }
  if (summary.route_next_action || summary.route_reason) lines.push(`Route: action=${summary.route_next_action ?? 'unknown'} reason=${summary.route_reason ?? 'none'}`);
  lines.push(`Activation: status=${summary.activation_status ?? 'unknown'} transition=${summary.activation_transition ?? 'none'} reason=${summary.activation_reason ?? 'none'}`);
  lines.push(`Session Event: kind=${summary.session_event_kind ?? 'unknown'} sequence=${summary.session_event_sequence ?? 'unknown'}`);
  if (summary.site_id && summary.carrier_session_id) {
    lines.push(`Session Evidence: pnpm --filter @narada2/cloudflare-carrier product:session:evidence:text -- --url ${result?.worker_url ?? 'unknown'} --site ${summary.site_id} --carrier-session-id ${summary.carrier_session_id} --operator-session-file <operator-session-file>`);
  }
  if (summary.site_id && summary.operation_id) {
    lines.push(`Operation Review: pnpm --filter @narada2/cloudflare-carrier product:operation:read:text -- --url ${result?.worker_url ?? 'unknown'} --site ${summary.site_id} --operation-id ${summary.operation_id} --operator-session-file <operator-session-file>`);
    if (actionableRoute) {
      lines.push(`Operation Next Workflow: pnpm --filter @narada2/cloudflare-carrier product:operation:next:workflow:live:text -- --url ${result?.worker_url ?? 'unknown'} --site ${summary.site_id} --operation-id ${summary.operation_id} --operator-session-file <operator-session-file> --execute-operation-next`);
    }
  }
  return `${lines.join('\n')}\n`;
}

function option(args, name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : null;
}

function flag(args, name) {
  return args.includes(name);
}

function parseBoolean(value) {
  return ['1', 'true', 'yes', 'on'].includes(String(value ?? '').trim().toLowerCase());
}

function generatedSessionId(operationId, now) {
  if (!operationId) return null;
  return `carrier_session_${sanitizeId(operationId)}_${now()}`;
}

function sanitizeId(value) {
  return String(value ?? 'operation').replace(/[^a-z0-9]+/gi, '_').replace(/^_+|_+$/g, '') || 'operation';
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
    const config = parseContinuationResumeArgs(process.argv.slice(2));
    const result = await resumeCloudflareContinuation(config);
    if (config.format === 'text') {
      process.stdout.write(formatContinuationResumeText(result));
    } else {
      process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    }
  } catch (error) {
    if (error?.summary && error?.config?.format === 'text') {
      process.stderr.write(formatContinuationResumeText({
        status: 'refused',
        worker_url: error.config.workerUrl,
        auth_source: error.config.auth?.source,
        params: error.config.params,
        response: error.response,
        summary: error.summary,
      }));
    } else {
      process.stderr.write(JSON.stringify({ ok: false, code: error?.message ?? String(error), response: error?.response, summary: error?.summary }, null, 2) + '\n');
    }
    process.exit(1);
  }
}
