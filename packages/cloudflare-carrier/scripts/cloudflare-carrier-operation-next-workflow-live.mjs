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
const recoveryReadScript = resolve(scriptDir, 'cloudflare-carrier-operation-recovery-read.mjs');
const localIngressProviderLivenessReadScript = resolve(scriptDir, 'cloudflare-carrier-local-ingress-provider-liveness-read.mjs');
const mailboxDraftReplyProposalReadScript = resolve(scriptDir, 'cloudflare-carrier-mailbox-draft-reply-proposal-read.mjs');
const repositoryPublicationProviderLivenessReadScript = resolve(scriptDir, 'cloudflare-carrier-repository-publication-provider-liveness-read.mjs');
const repositoryPublicationRequestReviewScript = resolve(scriptDir, 'cloudflare-carrier-repository-publication-request-review.mjs');
const siteFileChangeProposalReviewScript = resolve(scriptDir, 'cloudflare-carrier-site-file-change-proposal-review.mjs');
const residentDispatchWindowsFallbackRequestScript = resolve(scriptDir, 'cloudflare-carrier-resident-dispatch-windows-fallback-request.mjs');
const residentDispatchWindowsFallbackEvidenceScript = resolve(scriptDir, 'cloudflare-carrier-resident-dispatch-windows-fallback-evidence.mjs');
const residentDispatchWindowsFallbackEvidenceReviewScript = resolve(scriptDir, 'cloudflare-carrier-resident-dispatch-windows-fallback-evidence-review.mjs');
const residentDispatchWindowsFallbackExecuteScript = resolve(scriptDir, 'cloudflare-carrier-resident-dispatch-windows-fallback-execute.mjs');
const residentDispatchLocalResidentCarrierBridgeScript = resolve(scriptDir, 'cloudflare-carrier-resident-dispatch-local-resident-carrier-bridge.mjs');
const focusReviewScript = resolve(scriptDir, 'cloudflare-carrier-operation-focus-review.mjs');
const focusWorkflowScript = resolve(scriptDir, 'cloudflare-carrier-operation-focus-workflow-live.mjs');
const sessionWorkflowScript = resolve(scriptDir, 'cloudflare-carrier-operation-session-workflow-live.mjs');
const continuationWorkflowScript = resolve(scriptDir, 'cloudflare-carrier-operation-continuation-workflow-live.mjs');
const continuityWorkflowScript = resolve(scriptDir, 'cloudflare-carrier-operation-continuity-workflow-live.mjs');
const CHILD_STDIO_MAX_BUFFER = 64 * 1024 * 1024;

const ROUTE_TO_WORKFLOW = new Map([
  ['review_recovery_posture', { name: 'operation_recovery', script: recoveryReadScript, flag: null }],
  ['review_site_continuity_reconciliation_execution', { name: 'focus_review', script: focusReviewScript, flag: null }],
  ['read_operation_evidence', { name: 'evidence', script: evidenceReadScript, flag: null }],
  ['review_local_ingress_provider_liveness', { name: 'local_ingress_provider_liveness', script: localIngressProviderLivenessReadScript, flag: null }],
  ['review_mailbox_draft_reply_proposal', { name: 'mailbox_draft_reply_proposal', script: mailboxDraftReplyProposalReadScript, flag: null }],
  ['review_repository_publication_provider_liveness', { name: 'repository_publication_provider_liveness', script: repositoryPublicationProviderLivenessReadScript, flag: null }],
  ['review_repository_publication_request', { name: 'repository_publication_request', script: repositoryPublicationRequestReviewScript, flag: null }],
  ['review_site_file_change_proposal', { name: 'site_file_change_proposal', script: siteFileChangeProposalReviewScript, flag: null }],
  ['request_windows_fallback_resident_dispatch', { name: 'resident_dispatch_windows_fallback_request', script: residentDispatchWindowsFallbackRequestScript, flag: null }],
  ['await_windows_fallback_resident_dispatch', { name: 'resident_dispatch_windows_fallback_execute', script: residentDispatchWindowsFallbackExecuteScript, flag: '--execute-windows-fallback' }],
  ['review_windows_fallback_resident_dispatch_evidence', { name: 'resident_dispatch_windows_fallback_evidence_review', script: residentDispatchWindowsFallbackEvidenceReviewScript, flag: null }],
  ['bridge_local_resident_carrier_evidence', { name: 'local_resident_carrier_bridge', script: residentDispatchLocalResidentCarrierBridgeScript, flag: null }],
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
  const agentId = option(args, '--agent-id') ?? env.CLOUDFLARE_CARRIER_AGENT_ID ?? null;
  const siteRoot = option(args, '--site-root') ?? env.CLOUDFLARE_CARRIER_SITE_ROOT ?? env.CLOUDFLARE_CARRIER_SITE_REF ?? null;
  const continuationReason = option(args, '--continuation-reason') ?? env.CLOUDFLARE_CARRIER_CONTINUATION_REASON ?? null;
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
    agentId,
    siteRoot,
    continuationReason,
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
  let selectedOperationId = listBefore.summary.next_operation_id ?? null;
  assert.ok(selectedOperationId, 'operation_next_workflow_live_requires_next_operation');
  if (config.expectedListRouteAction) {
    assert.equal(
      listBefore.summary.route_next_action,
      config.expectedListRouteAction,
      `operation_next_workflow_live_expected_list_route_action_mismatch:${config.expectedListRouteAction}:${listBefore.summary.route_next_action ?? 'null'}`,
    );
  }

  let readBefore = parseJsonStdout(
    await runNodeScript(buildOperationReadArgs(config, selectedOperationId), { cwd: packageRoot }),
    'operation_read_before_next_workflow',
  );
  assert.equal(readBefore.schema, 'narada.cloudflare_carrier.product_read.v1');
  const visitedOperationIds = new Set([selectedOperationId]);
  while (shouldRetargetToPostureTarget(readBefore.summary, selectedOperationId)) {
    const nextOperationId = readBefore.summary.posture_target;
    if (visitedOperationIds.has(nextOperationId)) break;
    selectedOperationId = nextOperationId;
    visitedOperationIds.add(selectedOperationId);
    readBefore = parseJsonStdout(
      await runNodeScript(buildOperationReadArgs(config, selectedOperationId), { cwd: packageRoot }),
      'operation_read_retargeted_before_next_workflow',
    );
    assert.equal(readBefore.schema, 'narada.cloudflare_carrier.product_read.v1');
  }
  if (config.expectedOperationId) {
    assert.equal(
      selectedOperationId,
      config.expectedOperationId,
      `operation_next_workflow_live_expected_operation_mismatch:${config.expectedOperationId}:${selectedOperationId}`,
    );
  }
  const routeAction = readBefore.summary.workflow_next_action ?? null;
  const workflow = ROUTE_TO_WORKFLOW.get(routeAction);
  const evidenceRouteLooksStale = listBefore.summary.next_action === 'inspect_operation_evidence'
    && workflow
    && routeAction !== 'monitor_operation';
  const selectedMatchesListNext = selectedOperationId === (listBefore.summary.next_operation_id ?? null);
  if (listBefore.summary.next_action === 'inspect_operation_evidence' && selectedMatchesListNext) {
    if (evidenceRouteLooksStale) {
      const workflowResult = parseJsonStdout(
        await runNodeScript(buildWorkflowArgs(config, workflow, selectedOperationId, readBefore.summary ?? {}), { cwd: packageRoot }),
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
    if (isEvidenceReviewActionable(evidenceResult.summary)) {
      const focusReviewResult = parseJsonStdout(
        await runNodeScript(buildFocusReviewArgs(config, selectedOperationId, evidenceResult.summary), { cwd: packageRoot }),
        'operation_next_workflow_focus_review',
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
        delegated_workflow: 'focus_review',
        delegated_route_action: listBefore.summary.next_action,
        evidence_result: evidenceResult,
        delegated_result: focusReviewResult,
        read_after_next: readAfter.summary,
      };
    }
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
      await runNodeScript(buildWorkflowArgs(config, workflowAfterEvidence, selectedOperationId, readAfter.summary ?? {}), { cwd: packageRoot }),
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
  if (routeAction === 'review_recovery_posture') {
    const recoveryResult = parseJsonStdout(
      await runNodeScript(buildRecoveryArgs(config, selectedOperationId), { cwd: packageRoot }),
      'operation_next_workflow_recovery',
    );
    if (isRecoveryBridgeActionable(recoveryResult.summary)) {
      const evidenceResult = parseJsonStdout(
        await runNodeScript(buildEvidenceArgs(config, selectedOperationId), { cwd: packageRoot }),
        'operation_next_workflow_recovery_evidence',
      );
      if (!isLocalResidentBridgeActionable(evidenceResult.summary)) {
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
          delegated_workflow: 'operation_recovery',
          delegated_route_action: routeAction,
          recovery_result: recoveryResult,
          evidence_result: evidenceResult,
          delegated_result: recoveryResult,
          read_after_next: readAfter.summary,
        };
      }
      const bridgeWorkflow = ROUTE_TO_WORKFLOW.get('bridge_local_resident_carrier_evidence');
      const workflowResult = parseJsonStdout(
        await runNodeScript(buildWorkflowArgs(config, bridgeWorkflow, selectedOperationId, {
          ...(readBefore.summary ?? {}),
          local_resident_session_ref: evidenceResult.summary.local_resident_session_refs?.[0] ?? null,
        }), { cwd: packageRoot }),
        'operation_next_workflow_local_resident_carrier_bridge',
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
        delegated_workflow: bridgeWorkflow.name,
        delegated_route_action: routeAction,
        recovery_result: recoveryResult,
        evidence_result: evidenceResult,
        delegated_result: workflowResult,
        read_after_next: readAfter.summary,
      };
    }
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
      delegated_workflow: 'operation_recovery',
      delegated_route_action: routeAction,
      delegated_result: recoveryResult,
      read_after_next: readAfter.summary,
    };
  }
  if (!workflow) {
    if (routeAction === 'monitor_operation') {
      return {
        schema: 'narada.cloudflare_carrier.operation_next_workflow_live.v1',
        status: 'ok',
        worker_url: config.workerUrl,
        site_id: config.siteId,
        selected_operation_id: selectedOperationId,
        list_before_next: listBefore.summary,
        read_before_next: readBefore.summary,
        delegated_workflow: 'monitor_operation',
        delegated_route_action: routeAction,
        delegated_result: null,
        read_after_next: readBefore.summary,
      };
    }
    throw new Error(`operation_next_workflow_live_route_unsupported:${routeAction ?? 'missing_route'}`);
  }

  const workflowResult = parseJsonStdout(
    await runNodeScript(buildWorkflowArgs(config, workflow, selectedOperationId, readBefore.summary ?? {}), { cwd: packageRoot }),
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
  const result = await execFile(process.execPath, args, {
    ...options,
    timeout: 240000,
    windowsHide: true,
    maxBuffer: CHILD_STDIO_MAX_BUFFER,
  });
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

function buildWorkflowArgs(config, workflow, operationId, readSummary = {}) {
  const args = [
    workflow.script,
    '--url', config.workerUrl,
    '--site', config.siteId,
    '--operation-id', operationId,
  ];
  if (workflow.mode) args.push('--operation', workflow.mode);
  if (workflow.name === 'resident_dispatch_windows_fallback_request') {
    const dispatchDecisionId = readSummary.workflow_focus_ref ?? readSummary.route_target ?? null;
    if (workflow.mode !== 'list' && dispatchDecisionId) {
      args.push('--dispatch-decision-id', dispatchDecisionId);
    }
  }
  if (workflow.name === 'continuation') {
    if (config.agentId) args.push('--agent-id', config.agentId);
    if (config.siteRoot) args.push('--site-root', config.siteRoot);
    if (config.continuationReason) args.push('--continuation-reason', config.continuationReason);
  }
  if (workflow.name === 'local_resident_carrier_bridge') {
    const localResidentSessionRef = typeof readSummary.local_resident_session_ref === 'string'
      ? readSummary.local_resident_session_ref.trim()
      : '';
    if (localResidentSessionRef) args.push('--local-resident-session-ref', localResidentSessionRef);
  }
  if (workflow.name === 'focus_review') {
    const focusKind = typeof readSummary.workflow_focus_kind === 'string' && readSummary.workflow_focus_kind.trim()
      ? readSummary.workflow_focus_kind.trim()
      : typeof readSummary.reviewable_focus_kind === 'string' && readSummary.reviewable_focus_kind.trim()
        ? readSummary.reviewable_focus_kind.trim()
        : inferFocusKindFromRef(
          typeof readSummary.workflow_focus_ref === 'string' && readSummary.workflow_focus_ref.trim()
            ? readSummary.workflow_focus_ref.trim()
            : typeof readSummary.reviewable_focus_ref === 'string' && readSummary.reviewable_focus_ref.trim()
              ? readSummary.reviewable_focus_ref.trim()
              : '',
        );
    const focusRef = typeof readSummary.workflow_focus_ref === 'string' && readSummary.workflow_focus_ref.trim()
      ? readSummary.workflow_focus_ref.trim()
      : typeof readSummary.reviewable_focus_ref === 'string' && readSummary.reviewable_focus_ref.trim()
        ? readSummary.reviewable_focus_ref.trim()
        : '';
    if (focusKind) args.push('--focus-kind', focusKind);
    if (focusRef) args.push('--focus-ref', focusRef);
  }
  if (workflow.flag) args.push(workflow.flag);
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

function buildRecoveryArgs(config, operationId) {
  const args = [
    recoveryReadScript,
    '--url', config.workerUrl,
    '--site', config.siteId,
    '--operation-id', operationId,
  ];
  appendAuthOptions(args, config);
  return args;
}

function buildFocusReviewArgs(config, operationId, evidenceSummary = {}) {
  const focusRef = evidenceSummary.reviewable_focus_ref;
  const focusKind = evidenceSummary.reviewable_focus_kind
    || inferFocusKindFromRef(focusRef);
  const args = [
    focusReviewScript,
    '--url', config.workerUrl,
    '--site', config.siteId,
    '--operation-id', operationId,
    '--focus-kind', focusKind,
    '--focus-ref', focusRef,
  ];
  appendAuthOptions(args, config);
  return args;
}

function inferFocusKindFromRef(focusRef) {
  const value = typeof focusRef === 'string' ? focusRef.trim() : '';
  if (!value) return '';
  if (value.startsWith('site-continuity-reconciliation-execution:')) {
    return 'site_continuity_reconciliation_execution';
  }
  if (value.startsWith('resident_dispatch_windows_fallback_evidence_')) {
    return 'resident_dispatch_windows_fallback_evidence';
  }
  return '';
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

function isEvidenceReviewActionable(summary = {}) {
  return Boolean(summary?.reviewable_focus_kind && summary?.reviewable_focus_ref)
    && !isEvidenceReviewSatisfied(summary);
}

function isRecoveryBridgeActionable(summary = {}) {
  return summary?.recovery_next_action === 'local_resident_carrier_evidence_not_admitted';
}

function isLocalResidentBridgeActionable(summary = {}) {
  return Array.isArray(summary?.local_resident_session_refs)
    && summary.local_resident_session_refs.some((ref) => typeof ref === 'string' && ref.trim().length > 0);
}

function shouldRetargetToPostureTarget(summary = {}, selectedOperationId) {
  const currentWorkflowAction = typeof summary?.workflow_next_action === 'string'
    ? summary.workflow_next_action
    : null;
  return summary?.posture_next_action === 'focus_next_operation'
    && summary?.posture_next_status === 'needs_attention'
    && (!currentWorkflowAction || currentWorkflowAction === 'monitor_operation')
    && typeof summary?.posture_target === 'string'
    && summary.posture_target.length > 0
    && summary.posture_target !== selectedOperationId;
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
