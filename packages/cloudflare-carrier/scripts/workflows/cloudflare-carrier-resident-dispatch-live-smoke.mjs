#!/usr/bin/env node
import assert from 'node:assert/strict';
import { resolveAuth } from '../shared/cloudflare-carrier-auth-http.mjs';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { authHeaders } from '../shared/cloudflare-carrier-auth-http.mjs';

const scriptPath = fileURLToPath(import.meta.url);
const scriptDir = dirname(scriptPath);
const repoRoot = resolve(scriptDir, '../../../..');
loadLocalEnv(join(repoRoot, '.env'));
const DISPATCH_STARTED = 'cloudflare_primary_started';
const DISPATCH_FALLBACK_STATUS_PREFIX = 'cloudflare_primary_failed_windows_fallback';

export function parseResidentDispatchLiveSmokeArgs(argv = [], env = process.env, now = () => new Date()) {
  const args = [...argv];
  const workerUrl = trimTrailingSlash(option(args, '--url') ?? env.CLOUDFLARE_CARRIER_URL ?? '');
  const format = option(args, '--format') ?? env.CLOUDFLARE_RESIDENT_DISPATCH_LIVE_FORMAT ?? 'json';
  const siteId = option(args, '--site') ?? env.CLOUDFLARE_CARRIER_SITE_ID ?? 'site_narada_cloudflare';
  const siteRef = option(args, '--site-ref') ?? env.CLOUDFLARE_CARRIER_SITE_REF ?? `cloudflare://${siteId}`;
  const operationId = option(args, '--operation') ?? option(args, '--operation-id') ?? env.CLOUDFLARE_CARRIER_OPERATION_ID ?? 'operation_narada_cloudflare_control';
  const agentId = option(args, '--agent-id') ?? env.CLOUDFLARE_CARRIER_AGENT_ID ?? 'narada.cloudflare.dispatch.live';
  const windowsFallbackRef = option(args, '--windows-fallback-ref') ?? env.CLOUDFLARE_CARRIER_WINDOWS_FALLBACK_REF ?? 'windows_local_site_resident_loop';
  const auth = resolveAuth(args, env);

  if (!workerUrl) throw new Error('resident_dispatch_live_smoke_requires_--url_or_CLOUDFLARE_CARRIER_URL');
  if (!['json', 'text'].includes(format)) throw new Error(`resident_dispatch_live_smoke_unknown_format:${format}`);
  if (!auth) throw new Error('resident_dispatch_live_smoke_requires_bearer_token_or_operator_session');
  if (!siteId) throw new Error('resident_dispatch_live_smoke_requires_site_id');

  const suffix = now().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
  const carrierSessionId = option(args, '--session') ?? `carrier_session_cloudflare_dispatch_${suffix}`;
  const dispatchDecisionId = option(args, '--dispatch-decision-id') ?? `resident_dispatch_live_${suffix}`;

  return {
    workerUrl,
    format,
    siteId,
    siteRef,
    operationId,
    agentId,
    windowsFallbackRef,
    auth,
    carrierSessionId,
    dispatchDecisionId,
    suffix,
  };
}

export function formatResidentDispatchLiveSmokeText(result) {
  const workerUrl = typeof result?.worker_url === 'string' && result.worker_url.length > 0 ? result.worker_url : null;
  const siteId = typeof result?.site_id === 'string' && result.site_id.length > 0 ? result.site_id : null;
  const operationId = typeof result?.operation_id === 'string' && result.operation_id.length > 0 ? result.operation_id : null;
  const carrierSessionId = typeof result?.carrier_session_id === 'string' && result.carrier_session_id.length > 0 ? result.carrier_session_id : null;
  const lines = [
    `Resident Dispatch Workflow: ${result.status}`,
    `Worker: ${result.worker_url}`,
    `Site: ${result.site_id}`,
    `Operation: ${result.operation_id}`,
    `Dispatch Decision: ${result.dispatch_decision_id}`,
    `Carrier Session: ${result.carrier_session_id}`,
    `Dispatch: state=${result.dispatch_state ?? 'unknown'} action=${result.dispatch_action ?? 'unknown'}`,
    `Fallback: status=${result.fallback_status ?? 'unknown'} authority=${result.fallback_authority ?? 'unknown'}`,
    `Workflow Next Action: ${result.workflow_next_action ?? 'unknown'}`,
  ];
  if (workerUrl && siteId) {
    lines.push(`Site Read: pnpm --filter @narada2/cloudflare-carrier product:site:read:text -- --url ${workerUrl} --site ${siteId} --operator-session-file <operator-session-file>`);
    lines.push(`Site Next Workflow: pnpm --filter @narada2/cloudflare-carrier product:site:next:workflow:live:text -- --url ${workerUrl} --site ${siteId} --operator-session-file <operator-session-file> --execute-site-next`);
    lines.push(`Posture Coherence Review: pnpm --filter @narada2/cloudflare-carrier product:posture:coherence:live:text -- --url ${workerUrl} --site ${siteId} --operator-session-file <operator-session-file>`);
    lines.push(`Durability Coherence Review: pnpm --filter @narada2/cloudflare-carrier product:durability:coherence:live:text -- --url ${workerUrl} --site ${siteId} --operator-session-file <operator-session-file>`);
  }
  if (workerUrl && siteId && operationId) {
    lines.push(`Operation Review: pnpm --filter @narada2/cloudflare-carrier product:operation:read:text -- --url ${workerUrl} --site ${siteId} --operation-id ${operationId} --operator-session-file <operator-session-file>`);
    lines.push(`Operation Next Workflow: pnpm --filter @narada2/cloudflare-carrier product:operation:next:workflow:live:text -- --url ${workerUrl} --site ${siteId} --operation-id ${operationId} --operator-session-file <operator-session-file> --execute-operation-next`);
  }
  if (workerUrl && siteId && operationId && carrierSessionId) {
    lines.push(`Session Evidence: pnpm --filter @narada2/cloudflare-carrier product:session:evidence:text -- --url ${workerUrl} --site ${siteId} --operation-id ${operationId} --carrier-session-id ${carrierSessionId} --operator-session-file <operator-session-file>`);
    lines.push(`Task Review: pnpm --filter @narada2/cloudflare-carrier product:task-lifecycle:review:text -- --url ${workerUrl} --site ${siteId} --carrier-session-id ${carrierSessionId} --operator-session-file <operator-session-file>`);
    lines.push(`Task Workflow: pnpm --filter @narada2/cloudflare-carrier product:task-lifecycle:next:workflow:live:text -- --url ${workerUrl} --site ${siteId} --carrier-session-id ${carrierSessionId} --agent-id <agent-id> --operator-session-file <operator-session-file> --execute-task-lifecycle-next`);
  }
  return `${lines.join('\n')}\n`;
}

export async function runResidentDispatchLiveSmoke(config, { fetchImpl = fetch } = {}) {
  const dispatched = await postCarrier(config, {
    operation: 'resident_dispatch.primary_with_fallback.start',
    request_id: `resident_dispatch_live_start_${config.suffix}`,
    params: {
      site_id: config.siteId,
      operation_id: config.operationId,
      carrier_session_id: config.carrierSessionId,
      dispatch_decision_id: config.dispatchDecisionId,
      agent_id: config.agentId,
      site_root: config.siteRef,
      site_ref: config.siteRef,
      windows_fallback_ref: config.windowsFallbackRef,
    },
  }, fetchImpl);
  assert.ok(isAcceptedDispatchStatus(dispatched.body.status), JSON.stringify(dispatched.body));
  if (dispatched.body.status === DISPATCH_STARTED) {
    assert.equal(dispatched.http_status, 200, JSON.stringify(dispatched.body));
  } else {
    assert.ok(
      dispatched.http_status === 200 || dispatched.http_status === 400,
      JSON.stringify({ http_status: dispatched.http_status, body: dispatched.body }),
    );
  }

  const listed = await postCarrier(config, {
    operation: 'resident_dispatch.primary_with_fallback.list',
    request_id: `resident_dispatch_live_list_${config.suffix}`,
    params: { site_id: config.siteId, limit: 20 },
  }, fetchImpl);
  assert.equal(listed.http_status, 200, JSON.stringify(listed.body));
  assert.equal(listed.body.ok, true);
  const listedDecision = listed.body.dispatch_decisions.find((entry) => entry.dispatch_decision_id === config.dispatchDecisionId);
  assert.ok(listedDecision, JSON.stringify(listed.body.dispatch_decisions));

  const operationRead = await postCarrier(config, {
    operation: 'operation.read',
    request_id: `resident_dispatch_live_operation_read_${config.suffix}`,
    params: { site_id: config.siteId, operation_id: config.operationId, resident_dispatch_limit: 20, carrier_event_limit: 10 },
  }, fetchImpl);
  assert.equal(operationRead.http_status, 200, JSON.stringify(operationRead.body));
  assert.equal(operationRead.body.ok, true);
  assert.ok(operationRead.body.resident_dispatch_decisions.some((entry) => entry.dispatch_decision_id === config.dispatchDecisionId));
  assert.ok(operationRead.body.operation_product_surface.resident_dispatch_decision_count >= 1);
  const sessionPresent = operationRead.body.sessions.some((session) => session.carrier_session_id === config.carrierSessionId);

  return {
    schema: 'narada.cloudflare_carrier.resident_dispatch_live_smoke.v1',
    status: 'ok',
    worker_url: config.workerUrl,
    auth_source: config.auth.source,
    site_id: config.siteId,
    operation_id: config.operationId,
    dispatch_decision_id: config.dispatchDecisionId,
    carrier_session_id: config.carrierSessionId,
    dispatch_ok: dispatched.body.ok === true,
    dispatch_state: dispatched.body.status,
    dispatch_authority: dispatched.body.dispatch_authority,
    fallback_authority: dispatched.body.fallback_authority,
    fallback_status: dispatched.body.fallback_status,
    dispatch_action: dispatched.body.dispatch_action,
    session_start_event_kind: dispatched.body.session_start?.event?.event_kind ?? null,
    listed_dispatch_decision_count: listed.body.dispatch_decisions.length,
    listed_dispatch_state: listedDecision.decision_state ?? null,
    operation_surface_dispatch_decision_count: operationRead.body.operation_product_surface.resident_dispatch_decision_count,
    session_present: sessionPresent,
    workflow_next_action: operationRead.body.summary?.workflow_next_action ?? null,
  };
}

function isAcceptedDispatchStatus(status) {
  return status === DISPATCH_STARTED || (typeof status === 'string' && status.startsWith(DISPATCH_FALLBACK_STATUS_PREFIX));
}

async function postCarrier(config, body, fetchImpl) {
  const response = await fetchImpl(`${config.workerUrl}/api/carrier`, {
    method: 'POST',
    headers: {
      ...authHeaders(config.auth),
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  return { http_status: response.status, body: await response.json().catch(() => ({})) };
}

function option(args, name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : null;
}

function loadLocalEnv(envPath) {
  if (!existsSync(envPath)) return;
  const content = readFileSync(envPath, 'utf8');
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const index = trimmed.indexOf('=');
    if (index <= 0) continue;
    const key = trimmed.slice(0, index).trim();
    const value = trimmed.slice(index + 1).trim().replace(/^['"]|['"]$/g, '');
    if (!(key in process.env)) process.env[key] = value;
  }
}

function trimTrailingSlash(value) {
  return String(value ?? '').replace(/\/+$/g, '');
}

if (resolve(process.argv[1] ?? '') === scriptPath) {
  const config = parseResidentDispatchLiveSmokeArgs(process.argv.slice(2));
  const result = await runResidentDispatchLiveSmoke(config);
  if (config.format === 'text') {
    process.stdout.write(formatResidentDispatchLiveSmokeText(result));
  } else {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  }
}
