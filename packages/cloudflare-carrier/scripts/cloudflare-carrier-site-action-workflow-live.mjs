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
const operationNextWorkflowScript = resolve(scriptDir, 'cloudflare-carrier-operation-next-workflow-live.mjs');
const siteContinuityPublishScript = resolve(scriptDir, 'cloudflare-carrier-site-continuity-publish.mjs');
const continuityBindingsScript = resolve(scriptDir, 'cloudflare-site-continuity-bindings.mjs');
const continuitySchedulerScript = resolve(scriptDir, 'cloudflare-site-continuity-scheduler.mjs');
const siteAuthorityReadScript = resolve(scriptDir, 'cloudflare-carrier-site-authority-read.mjs');
const siteScopeReadScript = resolve(scriptDir, 'cloudflare-carrier-site-scope-read.mjs');
const siteMembershipPutScript = resolve(scriptDir, 'cloudflare-carrier-site-membership-put.mjs');
const authorityTransferReadScript = resolve(scriptDir, 'cloudflare-carrier-authority-transfer-read.mjs');

const ACTION_TO_WORKFLOW = {
  monitor_site: { name: 'monitor_site' },
  focus_site_operation: { name: 'focus_site_operation', script: operationNextWorkflowScript },
  focus_next_operation: { name: 'focus_next_operation', script: operationNextWorkflowScript },
  publish_cloudflare_continuity_packet: { name: 'publish_continuity_packet', script: siteContinuityPublishScript },
  bind_cloudflare_product_next_site_locally: { name: 'prepare_next_site_binding', script: continuityBindingsScript },
  refresh_site_continuity_loop: { name: 'refresh_site_continuity_loop', script: continuitySchedulerScript },
  load_or_create_membership: { name: 'site_membership_put', script: siteMembershipPutScript },
  put_membership: { name: 'site_membership_put', script: siteMembershipPutScript },
  read_site_scope: { name: 'site_scope', script: siteScopeReadScript },
  read_membership_site: { name: 'site_scope', script: siteScopeReadScript },
  read_site_authority: { name: 'site_authority', script: siteAuthorityReadScript },
  focus_membership_authority: { name: 'site_authority', script: siteAuthorityReadScript },
  inspect_inactive_membership: { name: 'site_authority', script: siteAuthorityReadScript },
};

function resolveActionWorkflow(action) {
  if (typeof action === 'string' && (action.startsWith('transfer_') || action === 'continue_authority_transfer' || action === 'verify_full_cloudflare_authority')) {
    return { name: 'authority_transfer', script: authorityTransferReadScript };
  }
  return ACTION_TO_WORKFLOW[action];
}

export function parseSiteActionWorkflowLiveArgs(argv = [], env = process.env) {
  const args = [...argv];
  const workerUrl = option(args, '--url') ?? env.CLOUDFLARE_CARRIER_URL ?? '';
  const format = option(args, '--format') ?? env.CLOUDFLARE_CARRIER_SITE_ACTION_FORMAT ?? 'json';
  const siteId = option(args, '--site') ?? option(args, '--focused-site-id') ?? env.CLOUDFLARE_CARRIER_SITE_ID ?? env.CLOUDFLARE_CARRIER_FOCUSED_SITE_ID ?? null;
  const expectedAction = option(args, '--expected-action') ?? env.CLOUDFLARE_CARRIER_SITE_ACTION_EXPECTED_ACTION ?? null;
  const localSiteRef = option(args, '--local-site-ref') ?? env.CLOUDFLARE_CARRIER_LOCAL_SITE_REF ?? null;
  const cloudflareSiteRef = option(args, '--cloudflare-site-ref') ?? env.CLOUDFLARE_CARRIER_CLOUDFLARE_SITE_REF ?? null;
  const memberPrincipalId = option(args, '--member-principal-id') ?? option(args, '--principal-id') ?? env.CLOUDFLARE_CARRIER_MEMBER_PRINCIPAL_ID ?? null;
  const membershipRole = option(args, '--membership-role') ?? option(args, '--role') ?? env.CLOUDFLARE_CARRIER_MEMBERSHIP_ROLE ?? null;
  const membershipStatus = option(args, '--membership-status') ?? option(args, '--status') ?? env.CLOUDFLARE_CARRIER_MEMBERSHIP_STATUS ?? null;
  const operationId = option(args, '--carrier-operation') ?? option(args, '--operation-id') ?? env.CLOUDFLARE_CARRIER_OPERATION_ID ?? null;
  const auth = resolveAuth(args, env);
  const executeAcknowledged = flag(args, '--execute-site-action')
    || env.CLOUDFLARE_CARRIER_SITE_ACTION_EXECUTE_LIVE === '1';

  if (!executeAcknowledged) {
    throw new Error('site_action_workflow_live_requires_--execute-site-action_or_CLOUDFLARE_CARRIER_SITE_ACTION_EXECUTE_LIVE=1');
  }
  if (!workerUrl) throw new Error('site_action_workflow_live_requires_--url_or_CLOUDFLARE_CARRIER_URL');
  if (!['json', 'text'].includes(format)) throw new Error(`site_action_workflow_live_unknown_format:${format}`);
  if (!siteId) throw new Error('site_action_workflow_live_requires_--site_or_--focused-site-id');
  if (!auth) throw new Error('site_action_workflow_live_requires_bearer_token_or_operator_session');

  return {
    workerUrl,
    format,
    siteId,
    expectedAction,
    localSiteRef,
    cloudflareSiteRef,
    memberPrincipalId,
    membershipRole,
    membershipStatus,
    operationId,
    auth,
    executeAcknowledged,
  };
}

export function formatSiteActionWorkflowLiveText(result) {
  const lines = [
    `Site Action Workflow: ${result.status}`,
    `Worker: ${result.worker_url}`,
    `Site: ${result.site_id}`,
    `Delegated Workflow: ${result.delegated_workflow ?? 'unknown'}`,
    `Action: ${result.delegated_action ?? 'unknown'}`,
    `Pre Action: ${result.read_before_action?.next_action ?? 'unknown'}`,
    `Post Action: ${result.read_after_action?.next_action ?? 'unknown'}`,
  ];
  if (result.site_id) {
    lines.push(`Site Read: pnpm --filter @narada2/cloudflare-carrier product:site:read:text -- --url ${result.worker_url} --site ${result.site_id} --operator-session-file <operator-session-file>`);
    lines.push(`Site Next Workflow: pnpm --filter @narada2/cloudflare-carrier product:site:next:workflow:live:text -- --url ${result.worker_url} --site ${result.site_id} --operator-session-file <operator-session-file> --execute-site-next`);
  }
  const operationId = result.read_after_action?.active_operation_id ?? result.read_before_action?.active_operation_id ?? null;
  const operationAction = result.read_after_action?.active_operation_next_action ?? result.read_before_action?.active_operation_next_action ?? null;
  const operationFocusKind = result.read_after_action?.active_operation_focus_kind ?? result.read_before_action?.active_operation_focus_kind ?? null;
  const operationFocusRef = result.read_after_action?.active_operation_focus_ref ?? result.read_before_action?.active_operation_focus_ref ?? null;
  if (result.site_id && operationId) {
    lines.push(`Operation Review: pnpm --filter @narada2/cloudflare-carrier product:operation:read:text -- --url ${result.worker_url} --site ${result.site_id} --operation-id ${operationId} --operator-session-file <operator-session-file>`);
    lines.push(`Operation Next Workflow: pnpm --filter @narada2/cloudflare-carrier product:operation:next:workflow:live:text -- --url ${result.worker_url} --site ${result.site_id} --operation-id ${operationId} --operator-session-file <operator-session-file> --execute-operation-next`);
    if (operationAction === 'refresh_site_continuity_loop') {
      lines.push(`Continuity Workflow: pnpm --filter @narada2/cloudflare-carrier product:operation:continuity:workflow:live:text -- --url ${result.worker_url} --site ${result.site_id} --operation-id ${operationId} --expected-pre-action refresh_site_continuity_loop --operator-session-file <operator-session-file> --execute-operation-continuity`);
    }
    if (operationAction === 'review_site_continuity_reconciliation_execution' && operationFocusRef) {
      lines.push(`Review Ack: pnpm --filter @narada2/cloudflare-carrier product:operation:focus-review:text -- --url ${result.worker_url} --site ${result.site_id} --operation-id ${operationId} --focus-kind ${operationFocusKind ?? 'site_continuity_reconciliation_execution'} --focus-ref ${operationFocusRef} --operator-session-file <operator-session-file>`);
    }
  }
  if (result.delegated_followup_result) {
    lines.push('Follow-up: executed');
  }
  return `${lines.join('\n')}\n`;
}

export async function runSiteActionWorkflowLive(
  config,
  { runNodeScript = defaultRunNodeScript } = {},
) {
  const readBefore = parseJsonStdout(
    await runNodeScript(buildSiteReadArgs(config), { cwd: packageRoot }),
    'site_action_read_before',
  );
  assert.equal(readBefore.schema, 'narada.cloudflare_carrier.product_read.v1');

  const action = readBefore.summary.next_action ?? 'monitor_site';
  if (config.expectedAction) {
    assert.equal(
      action,
      config.expectedAction,
      `site_action_workflow_live_expected_action_mismatch:${config.expectedAction}:${action}`,
    );
  }

  const workflow = resolveActionWorkflow(action);
  if (!workflow) {
    throw new Error(`site_action_workflow_live_action_unsupported:${action}`);
  }

  if (!workflow.script) {
    return {
      schema: 'narada.cloudflare_carrier.site_action_workflow_live.v1',
      status: 'ok',
      worker_url: config.workerUrl,
      site_id: config.siteId,
      delegated_workflow: workflow.name,
      delegated_action: action,
      read_before_action: readBefore.summary,
      delegated_result: null,
      read_after_action: readBefore.summary,
    };
  }

  const delegatedResult = parseJsonStdout(
    await runNodeScript(buildWorkflowArgs({
      ...config,
      operationId: config.operationId ?? readBefore.summary?.active_operation_id ?? null,
    }, action, workflow.script), { cwd: packageRoot }),
    'site_action_workflow_delegate',
  );

  let readAfter = parseJsonStdout(
    await runNodeScript(buildSiteReadArgs(config), { cwd: packageRoot }),
    'site_action_read_after',
  );
  assert.equal(readAfter.schema, 'narada.cloudflare_carrier.product_read.v1');

  let delegatedFollowupResult = null;
  if (
    (action === 'focus_next_operation' || action === 'focus_site_operation')
    && readAfter.summary?.next_action === 'focus_next_operation'
  ) {
    delegatedFollowupResult = parseJsonStdout(
      await runNodeScript(buildWorkflowArgs(config, action, workflow.script), { cwd: packageRoot }),
      'site_action_workflow_delegate_followup',
    );
    readAfter = parseJsonStdout(
      await runNodeScript(buildSiteReadArgs(config), { cwd: packageRoot }),
      'site_action_read_after_followup',
    );
    assert.equal(readAfter.schema, 'narada.cloudflare_carrier.product_read.v1');
  }

  return {
    schema: 'narada.cloudflare_carrier.site_action_workflow_live.v1',
    status: 'ok',
    worker_url: config.workerUrl,
    site_id: config.siteId,
    delegated_workflow: workflow.name,
    delegated_action: action,
    read_before_action: readBefore.summary,
    delegated_result: delegatedResult,
    delegated_followup_result: delegatedFollowupResult,
    read_after_action: readAfter.summary,
  };
}

async function defaultRunNodeScript(args, options) {
  const result = await execFile(process.execPath, args, {
    ...options,
    timeout: 120000,
    maxBuffer: CHILD_STDIO_MAX_BUFFER,
    windowsHide: true,
  });
  return result.stdout;
}

function buildSiteReadArgs(config) {
  const args = [
    productReadScript,
    '--operation', 'site.read',
    '--url', config.workerUrl,
    '--site', config.siteId,
  ];
  appendAuthOptions(args, config);
  return args;
}

function buildWorkflowArgs(config, action, script) {
  if (action === 'focus_next_operation' || action === 'focus_site_operation') {
    const args = [script, '--url', config.workerUrl, '--site', config.siteId, '--execute-operation-next'];
    appendAuthOptions(args, config);
    return args;
  }
  if (action === 'publish_cloudflare_continuity_packet') {
    const args = [script, '--url', config.workerUrl, '--site', config.siteId];
    appendAuthOptions(args, config);
    return args;
  }
  if (action === 'bind_cloudflare_product_next_site_locally') {
    const args = [script, '--action', 'prepare-next-binding-packet', '--url', config.workerUrl, '--site', config.siteId];
    if (config.localSiteRef) args.push('--local-site-ref', config.localSiteRef);
    if (config.cloudflareSiteRef) args.push('--cloudflare-site-ref', config.cloudflareSiteRef);
    appendAuthOptions(args, config);
    return args;
  }
  if (action === 'refresh_site_continuity_loop') {
    const args = [
      script,
      '--action', 'reconcile-execute',
      '--live',
      '--site', config.siteId,
      '--refresh-site-registry-projection',
      '--projection-url', config.workerUrl,
    ];
    appendAuthOptions(args, config);
    return args;
  }
  if (action === 'load_or_create_membership' || action === 'put_membership') {
    if (!config.memberPrincipalId) throw new Error(`site_action_workflow_live_${action}_requires_--member-principal-id`);
    if (!config.membershipRole) throw new Error(`site_action_workflow_live_${action}_requires_--membership-role_or_--role`);
    const args = [
      script,
      '--url', config.workerUrl,
      '--site', config.siteId,
      '--member-principal-id', config.memberPrincipalId,
      '--role', config.membershipRole,
    ];
    if (config.membershipStatus) args.push('--membership-status', config.membershipStatus);
    appendAuthOptions(args, config);
    return args;
  }
  if (action === 'read_site_scope' || action === 'read_membership_site') {
    const args = [script, '--url', config.workerUrl, '--site', config.siteId];
    appendAuthOptions(args, config);
    return args;
  }
  if (action === 'read_site_authority' || action === 'focus_membership_authority' || action === 'inspect_inactive_membership') {
    const args = [script, '--url', config.workerUrl, '--site', config.siteId];
    appendAuthOptions(args, config);
    return args;
  }
  if (action.startsWith('transfer_') || action === 'continue_authority_transfer' || action === 'verify_full_cloudflare_authority') {
    if (!config.operationId) throw new Error(`site_action_workflow_live_${action}_requires_--operation-id_or_active_operation_id`);
    const args = [script, '--url', config.workerUrl, '--site', config.siteId, '--operation-id', config.operationId];
    appendAuthOptions(args, config);
    return args;
  }
  throw new Error(`site_action_workflow_live_action_unsupported:${action}`);
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
  const config = parseSiteActionWorkflowLiveArgs(process.argv.slice(2));
  const result = await runSiteActionWorkflowLive(config);
  if (config.format === 'text') {
    process.stdout.write(formatSiteActionWorkflowLiveText(result));
  } else {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  }
}
