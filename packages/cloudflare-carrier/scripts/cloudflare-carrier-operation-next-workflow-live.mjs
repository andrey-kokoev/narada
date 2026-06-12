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
const productReadScript = resolve(scriptDir, 'cloudflare-carrier-product-read.mjs');
const evidenceReadScript = resolve(scriptDir, 'cloudflare-carrier-operation-evidence-read.mjs');
const focusWorkflowScript = resolve(scriptDir, 'cloudflare-carrier-operation-focus-workflow-live.mjs');
const sessionWorkflowScript = resolve(scriptDir, 'cloudflare-carrier-operation-session-workflow-live.mjs');
const continuationWorkflowScript = resolve(scriptDir, 'cloudflare-carrier-operation-continuation-workflow-live.mjs');
const continuityWorkflowScript = resolve(scriptDir, 'cloudflare-carrier-operation-continuity-workflow-live.mjs');

const ROUTE_TO_WORKFLOW = new Map([
  ['start_or_select_session', { name: 'session', script: sessionWorkflowScript, flag: '--execute-operation-session' }],
  ['resume_operation_continuation', { name: 'continuation', script: continuationWorkflowScript, flag: '--execute-operation-continuation-resume' }],
  ['refresh_site_continuity_loop', { name: 'continuity', script: continuityWorkflowScript, flag: '--execute-operation-continuity' }],
]);

export function parseOperationNextWorkflowLiveArgs(argv = [], env = process.env) {
  const args = [...argv];
  const workerUrl = option(args, '--url') ?? env.CLOUDFLARE_CARRIER_URL ?? '';
  const siteId = option(args, '--site') ?? env.CLOUDFLARE_CARRIER_SITE_ID ?? 'site_live_smoke';
  const expectedListRouteAction = option(args, '--expected-list-route-action') ?? env.CLOUDFLARE_CARRIER_OPERATION_NEXT_EXPECTED_LIST_ROUTE_ACTION ?? null;
  const expectedOperationId = option(args, '--operation-id') ?? option(args, '--carrier-operation') ?? env.CLOUDFLARE_CARRIER_OPERATION_ID ?? null;
  const auth = resolveAuth(args, env);
  const executeAcknowledged = flag(args, '--execute-operation-next')
    || env.CLOUDFLARE_CARRIER_OPERATION_NEXT_EXECUTE_LIVE === '1';

  if (!executeAcknowledged) {
    throw new Error('operation_next_workflow_live_requires_--execute-operation-next_or_CLOUDFLARE_CARRIER_OPERATION_NEXT_EXECUTE_LIVE=1');
  }
  if (!workerUrl) throw new Error('operation_next_workflow_live_requires_--url_or_CLOUDFLARE_CARRIER_URL');
  if (!siteId) throw new Error('operation_next_workflow_live_requires_site_id');
  if (!auth) throw new Error('operation_next_workflow_live_requires_bearer_token_or_operator_session');

  return {
    workerUrl,
    siteId,
    expectedListRouteAction,
    expectedOperationId,
    auth,
    executeAcknowledged,
  };
}

export async function runOperationNextWorkflowLive(
  config,
  { runNodeScript = defaultRunNodeScript } = {},
) {
  const listBefore = parseJsonStdout(
    await runNodeScript(buildOperationListArgs(config), { cwd: packageRoot }),
    'operation_list_before_next_workflow',
  );
  assert.equal(listBefore.schema, 'narada.cloudflare_carrier.product_read.v1');
  const selectedOperationId = listBefore.summary.next_operation_id ?? null;
  assert.ok(selectedOperationId, 'operation_next_workflow_live_requires_next_operation');
  if (config.expectedOperationId) {
    assert.equal(
      selectedOperationId,
      config.expectedOperationId,
      `operation_next_workflow_live_expected_operation_mismatch:${config.expectedOperationId}:${selectedOperationId}`,
    );
  }
  if (config.expectedListRouteAction) {
    assert.equal(
      listBefore.summary.route_next_action,
      config.expectedListRouteAction,
      `operation_next_workflow_live_expected_list_route_action_mismatch:${config.expectedListRouteAction}:${listBefore.summary.route_next_action ?? 'null'}`,
    );
  }

  const readBefore = parseJsonStdout(
    await runNodeScript(buildOperationReadArgs(config, selectedOperationId), { cwd: packageRoot }),
    'operation_read_before_next_workflow',
  );
  assert.equal(readBefore.schema, 'narada.cloudflare_carrier.product_read.v1');
  const routeAction = readBefore.summary.workflow_next_action ?? null;
  const workflow = ROUTE_TO_WORKFLOW.get(routeAction);
  const evidenceRouteLooksStale = listBefore.summary.next_action === 'inspect_operation_evidence'
    && workflow
    && routeAction !== 'monitor_operation';
  if (listBefore.summary.next_action === 'inspect_operation_evidence') {
    if (evidenceRouteLooksStale) {
      const workflowResult = parseJsonStdout(
        await runNodeScript(buildWorkflowArgs(config, workflow, selectedOperationId), { cwd: packageRoot }),
        `operation_next_workflow_${workflow.name}`,
      );

      const readAfter = parseJsonStdout(
        await runNodeScript(buildOperationReadArgs(config, selectedOperationId), { cwd: packageRoot }),
        'operation_read_after_next_workflow',
      );
      assert.equal(readAfter.schema, 'narada.cloudflare_carrier.product_read.v1');

      return {
        schema: 'narada.cloudflare_carrier.operation_next_workflow_live.v1',
        status: 'ok',
        worker_url: config.workerUrl,
        site_id: config.siteId,
        selected_operation_id: selectedOperationId,
        list_before_next: listBefore.summary,
        read_before_next: readBefore.summary,
        delegated_workflow: workflow.name,
        delegated_route_action: routeAction,
        delegated_result: workflowResult,
        read_after_next: readAfter.summary,
      };
    }
    const evidenceResult = parseJsonStdout(
      await runNodeScript(buildEvidenceArgs(config, selectedOperationId), { cwd: packageRoot }),
      'operation_next_workflow_evidence',
    );
    if (!isEvidenceReviewSatisfied(evidenceResult.summary)) {
      const readAfter = parseJsonStdout(
        await runNodeScript(buildOperationReadArgs(config, selectedOperationId), { cwd: packageRoot }),
        'operation_read_after_next_workflow',
      );
      assert.equal(readAfter.schema, 'narada.cloudflare_carrier.product_read.v1');
      return {
        schema: 'narada.cloudflare_carrier.operation_next_workflow_live.v1',
        status: 'ok',
        worker_url: config.workerUrl,
        site_id: config.siteId,
        selected_operation_id: selectedOperationId,
        list_before_next: listBefore.summary,
        read_before_next: readBefore.summary,
        delegated_workflow: 'evidence',
        delegated_route_action: listBefore.summary.next_action,
        delegated_result: evidenceResult,
        read_after_next: readAfter.summary,
      };
    }
    const readAfter = parseJsonStdout(
      await runNodeScript(buildOperationReadArgs(config, selectedOperationId), { cwd: packageRoot }),
      'operation_read_after_next_workflow',
    );
    assert.equal(readAfter.schema, 'narada.cloudflare_carrier.product_read.v1');
    const routeActionAfterEvidence = readAfter.summary.workflow_next_action ?? null;
    const workflowAfterEvidence = ROUTE_TO_WORKFLOW.get(routeActionAfterEvidence);
    if (!workflowAfterEvidence) {
      return {
        schema: 'narada.cloudflare_carrier.operation_next_workflow_live.v1',
        status: 'ok',
        worker_url: config.workerUrl,
        site_id: config.siteId,
        selected_operation_id: selectedOperationId,
        list_before_next: listBefore.summary,
        read_before_next: readBefore.summary,
        delegated_workflow: 'evidence_reviewed',
        delegated_route_action: routeActionAfterEvidence ?? listBefore.summary.next_action,
        delegated_result: evidenceResult,
        read_after_next: readAfter.summary,
      };
    }
    const workflowResult = parseJsonStdout(
      await runNodeScript(buildWorkflowArgs(config, workflowAfterEvidence, selectedOperationId), { cwd: packageRoot }),
      `operation_next_workflow_${workflowAfterEvidence.name}`,
    );
    const readAfterWorkflow = parseJsonStdout(
      await runNodeScript(buildOperationReadArgs(config, selectedOperationId), { cwd: packageRoot }),
      'operation_read_after_follow_on_workflow',
    );
    assert.equal(readAfterWorkflow.schema, 'narada.cloudflare_carrier.product_read.v1');
    return {
      schema: 'narada.cloudflare_carrier.operation_next_workflow_live.v1',
      status: 'ok',
      worker_url: config.workerUrl,
      site_id: config.siteId,
      selected_operation_id: selectedOperationId,
      list_before_next: listBefore.summary,
      read_before_next: readBefore.summary,
      delegated_workflow: workflowAfterEvidence.name,
      delegated_route_action: routeActionAfterEvidence,
      evidence_result: evidenceResult,
      delegated_result: workflowResult,
      read_after_next: readAfterWorkflow.summary,
    };
  }
  if (!workflow) {
    throw new Error(`operation_next_workflow_live_route_unsupported:${routeAction ?? 'missing_route'}`);
  }

  const workflowResult = parseJsonStdout(
    await runNodeScript(buildWorkflowArgs(config, workflow, selectedOperationId), { cwd: packageRoot }),
    `operation_next_workflow_${workflow.name}`,
  );

  const readAfter = parseJsonStdout(
    await runNodeScript(buildOperationReadArgs(config, selectedOperationId), { cwd: packageRoot }),
    'operation_read_after_next_workflow',
  );
  assert.equal(readAfter.schema, 'narada.cloudflare_carrier.product_read.v1');

  return {
    schema: 'narada.cloudflare_carrier.operation_next_workflow_live.v1',
    status: 'ok',
    worker_url: config.workerUrl,
    site_id: config.siteId,
    selected_operation_id: selectedOperationId,
    list_before_next: listBefore.summary,
    read_before_next: readBefore.summary,
    delegated_workflow: workflow.name,
    delegated_route_action: routeAction,
    delegated_result: workflowResult,
    read_after_next: readAfter.summary,
  };
}

async function defaultRunNodeScript(args, options) {
  const result = await execFile(process.execPath, args, { ...options, timeout: 120000, windowsHide: true });
  return result.stdout;
}

function buildOperationListArgs(config) {
  const args = [
    productReadScript,
    '--operation', 'operation.list',
    '--url', config.workerUrl,
    '--site', config.siteId,
  ];
  appendAuthOptions(args, config);
  return args;
}

function buildOperationReadArgs(config, operationId) {
  const args = [
    productReadScript,
    '--operation', 'operation.read',
    '--url', config.workerUrl,
    '--site', config.siteId,
    '--operation-id', operationId,
  ];
  appendAuthOptions(args, config);
  return args;
}

function buildWorkflowArgs(config, workflow, operationId) {
  const args = [
    workflow.script,
    '--url', config.workerUrl,
    '--site', config.siteId,
    '--operation-id', operationId,
    workflow.flag,
  ];
  appendAuthOptions(args, config);
  return args;
}

function buildEvidenceArgs(config, operationId) {
  const args = [
    evidenceReadScript,
    '--url', config.workerUrl,
    '--site', config.siteId,
    '--operation-id', operationId,
  ];
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

function isEvidenceReviewSatisfied(summary = {}) {
  if (!summary?.reviewable_focus_kind || !summary?.reviewable_focus_ref) return false;
  const latestReview = summary.latest_focus_review ?? null;
  if (!latestReview) return false;
  return latestReview.focus_kind === summary.reviewable_focus_kind
    && latestReview.focus_ref === summary.reviewable_focus_ref
    && latestReview.review_status === 'acknowledged';
}

function option(args, name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : null;
}

function flag(args, name) {
  return args.includes(name);
}

if (resolve(process.argv[1] ?? '') === scriptPath) {
  const config = parseOperationNextWorkflowLiveArgs(process.argv.slice(2));
  const result = await runOperationNextWorkflowLive(config);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}
