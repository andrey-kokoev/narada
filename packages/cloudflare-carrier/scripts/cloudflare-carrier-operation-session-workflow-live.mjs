#!/usr/bin/env node
import assert from 'node:assert/strict';
import { execFile as execFileCallback } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { resolveAuth } from './cloudflare-carrier-product-read.mjs';

const execFile = promisify(execFileCallback);
const scriptPath = fileURLToPath(import.meta.url);
const scriptDir = dirname(scriptPath);
const packageRoot = resolve(scriptDir, '..');
const CHILD_STDIO_MAX_BUFFER = 64 * 1024 * 1024;
const productReadScript = resolve(scriptDir, 'cloudflare-carrier-product-read.mjs');
const residentDispatchScript = resolve(scriptDir, 'cloudflare-carrier-resident-dispatch-live-smoke.mjs');

export function parseOperationSessionWorkflowLiveArgs(argv = [], env = process.env) {
  const args = [...argv];
  const workerUrl = option(args, '--url') ?? env.CLOUDFLARE_CARRIER_URL ?? '';
  const format = option(args, '--format') ?? env.CLOUDFLARE_CARRIER_OPERATION_SESSION_FORMAT ?? 'json';
  const siteId = option(args, '--site') ?? env.CLOUDFLARE_CARRIER_SITE_ID ?? 'site_live_smoke';
  const operationId = option(args, '--operation-id') ?? option(args, '--carrier-operation') ?? env.CLOUDFLARE_CARRIER_OPERATION_ID ?? '';
  const agentId = option(args, '--agent-id') ?? env.CLOUDFLARE_CARRIER_AGENT_ID ?? 'narada.cloudflare.operation.session.live';
  const siteRef = option(args, '--site-ref') ?? env.CLOUDFLARE_CARRIER_SITE_REF ?? `cloudflare://${siteId}`;
  const windowsFallbackRef = option(args, '--windows-fallback-ref') ?? env.CLOUDFLARE_CARRIER_WINDOWS_FALLBACK_REF ?? 'windows_local_site_resident_loop';
  const carrierSessionId = option(args, '--session') ?? env.CLOUDFLARE_CARRIER_SESSION_ID ?? null;
  const dispatchDecisionId = option(args, '--dispatch-decision-id') ?? env.CLOUDFLARE_CARRIER_DISPATCH_DECISION_ID ?? null;
  const expectedPreAction = option(args, '--expected-pre-action') ?? env.CLOUDFLARE_CARRIER_OPERATION_SESSION_EXPECTED_PRE_ACTION ?? 'start_or_select_session';
  const auth = resolveAuth(args, env);
  const executeAcknowledged = flag(args, '--execute-operation-session')
    || env.CLOUDFLARE_CARRIER_OPERATION_SESSION_EXECUTE_LIVE === '1';

  if (!executeAcknowledged) {
    throw new Error('operation_session_workflow_live_requires_--execute-operation-session_or_CLOUDFLARE_CARRIER_OPERATION_SESSION_EXECUTE_LIVE=1');
  }
  if (!workerUrl) throw new Error('operation_session_workflow_live_requires_--url_or_CLOUDFLARE_CARRIER_URL');
  if (!['json', 'text'].includes(format)) throw new Error(`operation_session_workflow_live_unknown_format:${format}`);
  if (!siteId) throw new Error('operation_session_workflow_live_requires_site_id');
  if (!operationId) throw new Error('operation_session_workflow_live_requires_operation_id');
  if (!auth) throw new Error('operation_session_workflow_live_requires_bearer_token_or_operator_session');

  return {
    workerUrl,
    format,
    siteId,
    operationId,
    agentId,
    siteRef,
    windowsFallbackRef,
    carrierSessionId,
    dispatchDecisionId,
    expectedPreAction,
    auth,
    executeAcknowledged,
  };
}

export async function runOperationSessionWorkflowLive(
  config,
  { runNodeScript = defaultRunNodeScript } = {},
) {
  const readBefore = parseJsonStdout(
    await runNodeScript(buildOperationReadArgs(config), { cwd: packageRoot }),
    'operation_read_before_session',
  );
  assert.equal(readBefore.schema, 'narada.cloudflare_carrier.product_read.v1');
  assert.equal(readBefore.summary.operation_id, config.operationId);
  assert.equal(
    readBefore.summary.workflow_next_action,
    config.expectedPreAction,
    `operation_session_workflow_live_expected_pre_action_mismatch:${config.expectedPreAction}:${readBefore.summary.workflow_next_action ?? 'null'}`,
  );

  const residentDispatch = parseJsonStdout(
    await runNodeScript(buildResidentDispatchArgs(config), { cwd: packageRoot }),
    'resident_dispatch_live',
  );
  assert.equal(residentDispatch.schema, 'narada.cloudflare_carrier.resident_dispatch_live_smoke.v1');
  assert.equal(residentDispatch.status, 'ok');
  assert.equal(residentDispatch.operation_id, config.operationId);

  const readAfter = parseJsonStdout(
    await runNodeScript(buildOperationReadArgs(config), { cwd: packageRoot }),
    'operation_read_after_session',
  );
  assert.equal(readAfter.schema, 'narada.cloudflare_carrier.product_read.v1');
  assert.equal(readAfter.summary.operation_id, config.operationId);
  const postActionAdvanced = readAfter.summary.workflow_next_action !== config.expectedPreAction;

  return {
    schema: 'narada.cloudflare_carrier.operation_session_workflow_live.v1',
    status: 'ok',
    worker_url: config.workerUrl,
    site_id: config.siteId,
    operation_id: config.operationId,
    pre_workflow_next_action: readBefore.summary.workflow_next_action ?? null,
    resident_dispatch: residentDispatch,
    read_before_session: readBefore.summary,
    read_after_session: readAfter.summary,
    post_action_advanced: postActionAdvanced,
  };
}

export function formatOperationSessionWorkflowLiveText(result) {
  const lines = [
    `Operation Session Workflow: ${result.status}`,
    `Worker: ${result.worker_url}`,
    `Site: ${result.site_id}`,
    `Operation: ${result.operation_id}`,
    `Pre Action: ${result.pre_workflow_next_action ?? 'unknown'}`,
    `Dispatch: state=${result.resident_dispatch?.dispatch_state ?? 'unknown'} session=${result.resident_dispatch?.carrier_session_id ?? 'none'} decision=${result.resident_dispatch?.dispatch_decision_id ?? 'none'}`,
    `Post Action: next=${result.read_after_session?.workflow_next_action ?? 'unknown'} advanced=${result.post_action_advanced ? 'yes' : 'no'}`,
    `Operation Review: pnpm --filter @narada2/cloudflare-carrier product:operation:read:text -- --url ${result.worker_url} --site ${result.site_id} --operation-id ${result.operation_id} --operator-session-file <operator-session-file>`,
  ];
  const carrierSessionId = result.read_after_session?.active_session_id
    ?? result.resident_dispatch?.carrier_session_id
    ?? null;
  if (carrierSessionId) {
    lines.push(`Session Evidence: pnpm --filter @narada2/cloudflare-carrier product:session:evidence:text -- --url ${result.worker_url} --site ${result.site_id} --operation-id ${result.operation_id} --carrier-session-id ${carrierSessionId} --operator-session-file <operator-session-file>`);
  }
  return `${lines.join('\n')}\n`;
}

async function defaultRunNodeScript(args, options) {
  const result = await execFile(process.execPath, args, {
    ...options,
    timeout: 120000,
    windowsHide: true,
    maxBuffer: CHILD_STDIO_MAX_BUFFER,
  });
  return result.stdout;
}

function buildOperationReadArgs(config) {
  const args = [
    productReadScript,
    '--operation', 'operation.read',
    '--url', config.workerUrl,
    '--site', config.siteId,
    '--operation-id', config.operationId,
  ];
  appendAuthOptions(args, config);
  return args;
}

function buildResidentDispatchArgs(config) {
  const args = [
    residentDispatchScript,
    '--url', config.workerUrl,
    '--site', config.siteId,
    '--operation-id', config.operationId,
    '--agent-id', config.agentId,
    '--site-ref', config.siteRef,
    '--windows-fallback-ref', config.windowsFallbackRef,
  ];
  if (config.carrierSessionId) {
    args.push('--session', config.carrierSessionId);
  }
  if (config.dispatchDecisionId) {
    args.push('--dispatch-decision-id', config.dispatchDecisionId);
  }
  appendAuthOptions(args, config);
  return args;
}

function appendAuthOptions(args, config) {
  if (config.auth?.kind === 'bearer') {
    args.push('--token', config.auth.value);
    return;
  }
  if (config.auth?.kind === 'operator_session') {
    args.push('--operator-session-cookie', config.auth.value);
  }
}

function parseJsonStdout(stdout, label) {
  const text = String(stdout ?? '').trim();
  if (!text) throw new Error(`${label}_stdout_empty`);
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`${label}_stdout_invalid_json:${error.message}`);
  }
}

function option(args, name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : null;
}

function flag(args, name) {
  return args.includes(name);
}

if (resolve(process.argv[1] ?? '') === scriptPath) {
  const config = parseOperationSessionWorkflowLiveArgs(process.argv.slice(2));
  const result = await runOperationSessionWorkflowLive(config);
  if (config.format === 'text') {
    process.stdout.write(formatOperationSessionWorkflowLiveText(result));
  } else {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  }
}
