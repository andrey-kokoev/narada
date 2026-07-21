#!/usr/bin/env node
import assert from 'node:assert/strict';
import { execFileGoverned } from '@narada2/process-launch-posture';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { resolveAuth } from '../shared/cloudflare-carrier-auth-http.mjs';

const scriptPath = fileURLToPath(import.meta.url);
const scriptDir = dirname(scriptPath);
const packageRoot = resolve(scriptDir, '../..');
const productReadScript = resolve(scriptDir, '../read-models/cloudflare-carrier-product-read.mjs');
const evidenceReadScript = resolve(scriptDir, '../read-models/cloudflare-carrier-operation-evidence-read.mjs');
const persistenceReadScript = resolve(scriptDir, '../read-models/cloudflare-carrier-operation-persistence-read.mjs');
const recoveryReadScript = resolve(scriptDir, '../read-models/cloudflare-carrier-operation-recovery-read.mjs');
const mailboxOutlookDraftReadScript = resolve(scriptDir, '../read-models/cloudflare-carrier-mailbox-outlook-draft-read.mjs');
const mailboxSendAcceptedReadScript = resolve(scriptDir, '../read-models/cloudflare-carrier-mailbox-send-accepted-read.mjs');
const mailboxSendConfirmationReadScript = resolve(scriptDir, '../read-models/cloudflare-carrier-mailbox-send-confirmation-read.mjs');
const directiveDeliveryReviewScript = resolve(scriptDir, './cloudflare-carrier-directive-delivery-review.mjs');
const operationScopeReadScript = resolve(scriptDir, '../read-models/cloudflare-carrier-operation-scope-read.mjs');
const sessionEvidenceReadScript = resolve(scriptDir, '../read-models/cloudflare-carrier-session-evidence-read.mjs');
const siteAuthorityReadScript = resolve(scriptDir, '../read-models/cloudflare-carrier-site-authority-read.mjs');
const webhookDelayShadowReadScript = resolve(scriptDir, '../read-models/cloudflare-carrier-webhook-delay-shadow-read.mjs');
const localIngressRequestReadScript = resolve(scriptDir, '../read-models/cloudflare-carrier-local-ingress-request-read.mjs');
const localIngressEvidenceReadScript = resolve(scriptDir, '../read-models/cloudflare-carrier-local-ingress-evidence-read.mjs');
const localIngressProviderLivenessReadScript = resolve(scriptDir, './cloudflare-carrier-local-ingress-provider-liveness-read.mjs');
const mailboxDraftReplyProposalReadScript = resolve(scriptDir, '../read-models/cloudflare-carrier-mailbox-draft-reply-proposal-read.mjs');
const repositoryPublicationProviderLivenessReadScript = resolve(scriptDir, './cloudflare-carrier-repository-publication-provider-liveness-read.mjs');
const repositoryPublicationReadScript = resolve(scriptDir, '../read-models/cloudflare-carrier-repository-publication-read.mjs');
const repositoryPublicationRequestReviewScript = resolve(scriptDir, '../read-models/cloudflare-carrier-repository-publication-request-review.mjs');
const siteFileChangeProposalReviewScript = resolve(scriptDir, '../read-models/cloudflare-carrier-site-file-change-proposal-review.mjs');
const siteFileMaterializationReadScript = resolve(scriptDir, '../read-models/cloudflare-carrier-site-file-materialization-read.mjs');
const taskLifecycleReadScript = resolve(scriptDir, '../read-models/cloudflare-carrier-task-lifecycle-read.mjs');
const taskLifecycleNextWorkflowScript = resolve(scriptDir, './cloudflare-carrier-task-lifecycle-next-workflow-live.mjs');
const taskLifecycleCreateFromDirectiveIntentScript = resolve(scriptDir, '../commands/cloudflare-carrier-task-lifecycle-create-from-directive-intent.mjs');
const residentDispatchWindowsFallbackRequestScript = resolve(scriptDir, '../commands/cloudflare-carrier-resident-dispatch-windows-fallback-request.mjs');
const residentDispatchWindowsFallbackEvidenceScript = resolve(scriptDir, '../commands/cloudflare-carrier-resident-dispatch-windows-fallback-evidence.mjs');
const residentDispatchWindowsFallbackEvidenceReviewScript = resolve(scriptDir, '../read-models/cloudflare-carrier-resident-dispatch-windows-fallback-evidence-review.mjs');
const residentDispatchWindowsFallbackExecuteScript = resolve(scriptDir, '../commands/cloudflare-carrier-resident-dispatch-windows-fallback-execute.mjs');
const residentDispatchLocalResidentCarrierBridgeScript = resolve(scriptDir, '../commands/cloudflare-carrier-resident-dispatch-local-resident-carrier-bridge.mjs');
const residentDispatchLiveSmokeScript = resolve(scriptDir, './cloudflare-carrier-resident-dispatch-live-smoke.mjs');
const focusReviewScript = resolve(scriptDir, '../read-models/cloudflare-carrier-operation-focus-review.mjs');
const focusWorkflowScript = resolve(scriptDir, './cloudflare-carrier-operation-focus-workflow-live.mjs');
const sessionWorkflowScript = resolve(scriptDir, './cloudflare-carrier-operation-session-workflow-live.mjs');
const continuationWorkflowScript = resolve(scriptDir, './cloudflare-carrier-operation-continuation-workflow-live.mjs');
const continuityWorkflowScript = resolve(scriptDir, './cloudflare-carrier-operation-continuity-workflow-live.mjs');
const CHILD_STDIO_MAX_BUFFER = 64 * 1024 * 1024;

const ROUTE_TO_WORKFLOW = new Map([
  ['review_persistence_posture', { name: 'operation_persistence', script: persistenceReadScript, flag: null }],
  ['review_recovery_posture', { name: 'operation_recovery', script: recoveryReadScript, flag: null }],
  ['read_operation_scope', { name: 'operation_scope', script: operationScopeReadScript, flag: null }],
  ['review_site_continuity_reconciliation_execution', { name: 'focus_review', script: focusReviewScript, flag: null }],
  ['review_operation_operator_focus', { name: 'evidence', script: evidenceReadScript, flag: null }],
  ['review_carrier_evidence_replay', { name: 'evidence', script: evidenceReadScript, flag: null }],
  ['focus_evidence', { name: 'evidence', script: evidenceReadScript, flag: null }],
  ['focus_lifecycle_read_evidence', { name: 'evidence', script: evidenceReadScript, flag: null }],
  ['read_operation_evidence', { name: 'evidence', script: evidenceReadScript, flag: null }],
  ['review_outlook_draft_create_evidence', { name: 'mailbox_outlook_draft', script: mailboxOutlookDraftReadScript, flag: null }],
  ['review_mailbox_outlook_draft_create', { name: 'mailbox_outlook_draft', script: mailboxOutlookDraftReadScript, flag: null }],
  ['review_mailbox_send_confirmation', { name: 'mailbox_send_confirmation', script: mailboxSendConfirmationReadScript, flag: null }],
  ['review_mailbox_send_acceptance', { name: 'mailbox_send_accepted', script: mailboxSendAcceptedReadScript, flag: null }],
  ['review_directive_delivery', { name: 'directive_delivery', script: directiveDeliveryReviewScript, flag: null }],
  ['focus_webhook_delay_directive_intent', { name: 'directive_delivery', script: directiveDeliveryReviewScript, flag: null }],
  ['focus_webhook_delay_directive_delivery', { name: 'directive_delivery', script: directiveDeliveryReviewScript, flag: null }],
  ['focus_webhook_delay_shadow_read', { name: 'webhook_delay_shadow_read', script: webhookDelayShadowReadScript, flag: null }],
  ['review_local_ingress_request', { name: 'local_ingress_request', script: localIngressRequestReadScript, flag: null }],
  ['review_local_ingress_evidence', { name: 'local_ingress_evidence', script: localIngressEvidenceReadScript, flag: null }],
  ['review_local_ingress_provider_liveness', { name: 'local_ingress_provider_liveness', script: localIngressProviderLivenessReadScript, flag: null }],
  ['restore_windows_local_ingress_executor', { name: 'local_ingress_provider_liveness', script: localIngressProviderLivenessReadScript, flag: null }],
  ['review_mailbox_draft_reply_proposal', { name: 'mailbox_draft_reply_proposal', script: mailboxDraftReplyProposalReadScript, flag: null }],
  ['review_repository_publication_provider_liveness', { name: 'repository_publication_provider_liveness', script: repositoryPublicationProviderLivenessReadScript, flag: null }],
  ['restore_windows_repository_publication_provider', { name: 'repository_publication_provider_liveness', script: repositoryPublicationProviderLivenessReadScript, flag: null }],
  ['review_repository_publication_request', { name: 'repository_publication_request', script: repositoryPublicationRequestReviewScript, flag: null }],
  ['review_repository_publication_execution', { name: 'repository_publication_cloudflare_execution', script: repositoryPublicationReadScript, flag: null, mode: 'repository_publication.cloudflare_execution.list' }],
  ['review_cloudflare_github_repository_publication_execution', { name: 'repository_publication_cloudflare_execution', script: repositoryPublicationReadScript, flag: null, mode: 'repository_publication.cloudflare_execution.list' }],
  ['review_repository_publication_evidence', { name: 'repository_publication_evidence', script: repositoryPublicationReadScript, flag: null, mode: 'repository_publication.evidence.list' }],
  ['review_site_file_change_proposal', { name: 'site_file_change_proposal', script: siteFileChangeProposalReviewScript, flag: null }],
  ['review_site_file_materialization', { name: 'site_file_materialization_review', script: siteFileMaterializationReadScript, flag: null }],
  ['create_task_from_directive_intent', { name: 'task_lifecycle_create_from_directive_intent', script: taskLifecycleCreateFromDirectiveIntentScript, flag: null }],
  ['focus_open_task', { name: 'task_lifecycle_next', script: taskLifecycleNextWorkflowScript, flag: '--execute-task-lifecycle-next' }],
  ['focus_lifecycle_open_task', { name: 'task_lifecycle_next', script: taskLifecycleNextWorkflowScript, flag: '--execute-task-lifecycle-next' }],
  ['focus_lifecycle_start_session', { name: 'session', script: sessionWorkflowScript, flag: '--execute-operation-session' }],
  ['focus_lifecycle_continuity', { name: 'continuity', script: continuityWorkflowScript, flag: '--execute-operation-continuity' }],
  ['focus_lifecycle_continuity_loop_report', { name: 'continuity', script: continuityWorkflowScript, flag: '--execute-operation-continuity' }],
  ['focus_lifecycle_directive_delivery', { name: 'directive_delivery', script: directiveDeliveryReviewScript, flag: null }],
  ['focus_task_path_evidence', { name: 'task_lifecycle_review', script: taskLifecycleReadScript, flag: null }],
  ['focus_operation_path_attention', { name: 'evidence', script: evidenceReadScript, flag: null }],
  ['focus_operation_path_task', { name: 'task_lifecycle_next', script: taskLifecycleNextWorkflowScript, flag: '--execute-task-lifecycle-next' }],
  ['read_session_evidence', { name: 'session_evidence', script: sessionEvidenceReadScript, flag: null }],
  ['inspect_session_evidence', { name: 'session_evidence', script: sessionEvidenceReadScript, flag: null }],
  ['focus_session_path_evidence', { name: 'session_evidence', script: sessionEvidenceReadScript, flag: null }],
  ['focus_session_path_task', { name: 'task_lifecycle_next', script: taskLifecycleNextWorkflowScript, flag: '--execute-task-lifecycle-next' }],
  ['focus_authority_path_evidence', { name: 'site_authority', script: siteAuthorityReadScript, flag: null }],
  ['focus_authority_evidence', { name: 'site_authority', script: siteAuthorityReadScript, flag: null }],
  ['review_refused_authority', { name: 'site_authority', script: siteAuthorityReadScript, flag: null }],
  ['review_unresolved_locus', { name: 'site_authority', script: siteAuthorityReadScript, flag: null }],
  ['monitor_authority_admissions', { name: 'site_authority', script: siteAuthorityReadScript, flag: null }],
  ['focus_open_attention', { name: 'evidence', script: evidenceReadScript, flag: null }],
  ['monitor_operation_evidence', { name: 'evidence', script: evidenceReadScript, flag: null }],
  ['start_resident_dispatch', { name: 'resident_dispatch', script: residentDispatchLiveSmokeScript, flag: null }],
  ['request_windows_fallback_resident_dispatch', { name: 'resident_dispatch_windows_fallback_request', script: residentDispatchWindowsFallbackRequestScript, flag: null }],
  ['await_windows_fallback_resident_dispatch', { name: 'resident_dispatch_windows_fallback_execute', script: residentDispatchWindowsFallbackExecuteScript, flag: '--execute-windows-fallback' }],
  ['review_windows_fallback_resident_dispatch_evidence', { name: 'resident_dispatch_windows_fallback_evidence_review', script: residentDispatchWindowsFallbackEvidenceReviewScript, flag: null }],
  ['bridge_local_resident_carrier_evidence', { name: 'local_resident_carrier_bridge', script: residentDispatchLocalResidentCarrierBridgeScript, flag: null }],
  ['review_continuity_packet', { name: 'continuity', script: continuityWorkflowScript, flag: '--execute-operation-continuity' }],
  ['observe_continuity_packet', { name: 'continuity', script: continuityWorkflowScript, flag: '--execute-operation-continuity' }],
  ['review_continuity_loop_report', { name: 'continuity', script: continuityWorkflowScript, flag: '--execute-operation-continuity' }],
  ['start_or_select_session', { name: 'session', script: sessionWorkflowScript, flag: '--execute-operation-session' }],
  ['resume_operation_continuation', { name: 'continuation', script: continuationWorkflowScript, flag: '--execute-operation-continuation-resume' }],
  ['refresh_site_continuity_loop', { name: 'continuity', script: continuityWorkflowScript, flag: '--execute-operation-continuity' }],
]);

export function parseOperationNextWorkflowLiveArgs(argv = [], env = process.env) {
  const args = [...argv];
  const workerUrl = option(args, '--url') ?? env.CLOUDFLARE_CARRIER_URL ?? '';
  const format = option(args, '--format') ?? env.CLOUDFLARE_CARRIER_OPERATION_NEXT_FORMAT ?? 'json';
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
  if (!['json', 'text'].includes(format)) throw new Error(`operation_next_workflow_live_unknown_format:${format}`);
  if (!siteId) throw new Error('operation_next_workflow_live_requires_site_id');
  if (!auth) throw new Error('operation_next_workflow_live_requires_bearer_token_or_operator_session');

  return {
    workerUrl,
    format,
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

export function formatOperationNextWorkflowLiveText(result) {
  const hasWorkerUrl = typeof result.worker_url === 'string' && result.worker_url.length > 0;
  const hasSiteId = typeof result.site_id === 'string' && result.site_id.length > 0;
  const hasSelectedOperationId = typeof result.selected_operation_id === 'string' && result.selected_operation_id.length > 0;
  const lines = [
    `Operation Next Workflow: ${result.status}`,
    `Worker: ${result.worker_url}`,
    `Site: ${result.site_id}`,
    `Selected Operation: ${result.selected_operation_id}`,
    `List Route: ${result.list_before_next?.route_next_action ?? 'unknown'} target=${result.list_before_next?.route_target ?? 'none'} reason=${result.list_before_next?.route_reason ?? 'unknown'}`,
    `Pre Action: ${result.read_before_next?.workflow_next_action ?? 'unknown'}`,
    `Delegated Workflow: ${result.delegated_workflow ?? 'unknown'} route=${result.delegated_route_action ?? 'unknown'}`,
    `Post Action: ${result.read_after_next?.workflow_next_action ?? 'unknown'}`,
  ];
  if (hasWorkerUrl && hasSiteId) {
    lines.push(`Operation List: pnpm --filter @narada2/cloudflare-carrier product:operation:list:text -- --url ${result.worker_url} --site ${result.site_id} --operator-session-file <operator-session-file>`);
    lines.push(`Site Read: pnpm --filter @narada2/cloudflare-carrier product:site:read:text -- --url ${result.worker_url} --site ${result.site_id} --operator-session-file <operator-session-file>`);
    lines.push(`Site Next Workflow: pnpm --filter @narada2/cloudflare-carrier product:site:next:workflow:live:text -- --url ${result.worker_url} --site ${result.site_id} --operator-session-file <operator-session-file> --execute-site-next`);
  }
  if (hasWorkerUrl && hasSiteId && hasSelectedOperationId) {
    lines.push(`Operation Review: pnpm --filter @narada2/cloudflare-carrier product:operation:read:text -- --url ${result.worker_url} --site ${result.site_id} --operation-id ${result.selected_operation_id} --operator-session-file <operator-session-file>`);
  }
  const postActionWorkflow = buildPostActionWorkflowCommand(result);
  if (postActionWorkflow) {
    lines.push(`${postActionWorkflow.label}: ${postActionWorkflow.command}`);
  }
  const carrierSessionId = result.read_after_next?.active_session_id ?? result.delegated_result?.read_after_next?.active_session_id ?? null;
  if (hasWorkerUrl && hasSiteId && hasSelectedOperationId && carrierSessionId) {
    lines.push(`Session Evidence: pnpm --filter @narada2/cloudflare-carrier product:session:evidence:text -- --url ${result.worker_url} --site ${result.site_id} --operation-id ${result.selected_operation_id} --carrier-session-id ${carrierSessionId} --operator-session-file <operator-session-file>`);
    lines.push(`Task Review: pnpm --filter @narada2/cloudflare-carrier product:task-lifecycle:review:text -- --url ${result.worker_url} --site ${result.site_id} --carrier-session-id ${carrierSessionId} --operator-session-file <operator-session-file>`);
    lines.push(`Task Workflow: pnpm --filter @narada2/cloudflare-carrier product:task-lifecycle:next:workflow:live:text -- --url ${result.worker_url} --site ${result.site_id} --carrier-session-id ${carrierSessionId} --agent-id <agent-id> --operator-session-file <operator-session-file> --execute-task-lifecycle-next`);
  }
  return `${lines.join('\n')}\n`;
}

function buildPostActionWorkflowCommand(result) {
  if (!hasConcreteSiteAndSelectedOperation(result)) {
    return null;
  }
  const nextAction = result.read_after_next?.workflow_next_action ?? null;
  const focusKind = result.read_after_next?.workflow_focus_kind ?? null;
  const focusRef = result.read_after_next?.workflow_focus_ref ?? null;
  if (nextAction === 'start_or_select_session') {
    return {
      label: 'Session Workflow',
      command: `pnpm --filter @narada2/cloudflare-carrier product:operation:session:workflow:live:text -- --url ${result.worker_url} --site ${result.site_id} --operation-id ${result.selected_operation_id} --operator-session-file <operator-session-file> --execute-operation-session`,
    };
  }
  if (nextAction === 'resume_operation_continuation') {
    return {
      label: 'Continuation Workflow',
      command: `pnpm --filter @narada2/cloudflare-carrier product:operation:continuation:workflow:live:text -- --url ${result.worker_url} --site ${result.site_id} --operation-id ${result.selected_operation_id} --operator-session-file <operator-session-file> --execute-operation-continuation-resume`,
    };
  }
  if (nextAction === 'refresh_site_continuity_loop') {
    return {
      label: 'Continuity Workflow',
      command: `pnpm --filter @narada2/cloudflare-carrier product:operation:continuity:workflow:live:text -- --url ${result.worker_url} --site ${result.site_id} --operation-id ${result.selected_operation_id} --expected-pre-action refresh_site_continuity_loop --operator-session-file <operator-session-file> --execute-operation-continuity`,
    };
  }
  if (nextAction === 'review_site_continuity_reconciliation_execution' && focusRef) {
    return {
      label: 'Review Ack',
      command: `pnpm --filter @narada2/cloudflare-carrier product:operation:focus-review:text -- --url ${result.worker_url} --site ${result.site_id} --operation-id ${result.selected_operation_id} --focus-kind ${focusKind ?? 'site_continuity_reconciliation_execution'} --focus-ref ${focusRef} --operator-session-file <operator-session-file>`,
    };
  }
  return null;
}

function hasConcreteSiteAndSelectedOperation(result) {
  return typeof result.worker_url === 'string'
    && result.worker_url.length > 0
    && typeof result.site_id === 'string'
    && result.site_id.length > 0
    && typeof result.selected_operation_id === 'string'
    && result.selected_operation_id.length > 0;
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

  const followOnRouteAction = readAfter.summary.workflow_next_action ?? null;
  const followOnWorkflow = ROUTE_TO_WORKFLOW.get(followOnRouteAction);
  if (workflow.name === 'continuity' && followOnWorkflow?.name === 'focus_review') {
    const followOnWorkflowResult = parseJsonStdout(
      await runNodeScript(buildWorkflowArgs(config, followOnWorkflow, selectedOperationId, readAfter.summary ?? {}), { cwd: packageRoot }),
      `operation_next_workflow_${followOnWorkflow.name}`,
    );
    const readAfterFollowOn = parseJsonStdout(
      await runNodeScript(buildOperationReadArgs(config, selectedOperationId), { cwd: packageRoot }),
      'operation_read_after_follow_on_workflow',
    );
    assert.equal(readAfterFollowOn.schema, 'narada.cloudflare_carrier.product_read.v1');
    return {
      schema: 'narada.cloudflare_carrier.operation_next_workflow_live.v1',
      status: 'ok',
      worker_url: config.workerUrl,
      site_id: config.siteId,
      selected_operation_id: selectedOperationId,
      list_before_next: listBefore.summary,
      read_before_next: readBefore.summary,
      delegated_workflow: followOnWorkflow.name,
      delegated_route_action: followOnRouteAction,
      continuity_result: workflowResult,
      delegated_result: followOnWorkflowResult,
      read_after_next: readAfterFollowOn.summary,
    };
  }

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
  const result = await execFileGoverned(process.execPath, args, {
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
  if (workflow.name === 'continuity') {
    const expectedPreAction = typeof readSummary.workflow_next_action === 'string' && readSummary.workflow_next_action.trim()
      ? readSummary.workflow_next_action.trim()
      : null;
    if (expectedPreAction) args.push('--expected-pre-action', expectedPreAction);
  }
  if (workflow.name === 'local_resident_carrier_bridge') {
    const localResidentSessionRef = typeof readSummary.local_resident_session_ref === 'string'
      ? readSummary.local_resident_session_ref.trim()
      : '';
    if (localResidentSessionRef) args.push('--local-resident-session-ref', localResidentSessionRef);
  }
  if (workflow.name === 'session_evidence') {
    const carrierSessionId = typeof readSummary.active_session_id === 'string' && readSummary.active_session_id.trim()
      ? readSummary.active_session_id.trim()
      : typeof readSummary.workflow_focus_ref === 'string' && readSummary.workflow_focus_ref.trim()
        ? readSummary.workflow_focus_ref.trim()
        : '';
    if (!carrierSessionId) throw new Error('operation_next_workflow_session_evidence_requires_active_session_id');
    args.push('--carrier-session-id', carrierSessionId);
  }
  if (workflow.name === 'task_lifecycle_review' && readSummary.workflow_next_action === 'focus_session_path_task') {
    const carrierSessionId = typeof readSummary.active_session_id === 'string' && readSummary.active_session_id.trim()
      ? readSummary.active_session_id.trim()
      : '';
    if (!carrierSessionId) throw new Error('operation_next_workflow_task_lifecycle_requires_active_session_id');
    args.push('--carrier-session-id', carrierSessionId);
  }
  if (workflow.name === 'task_lifecycle_next') {
    const taskId = resolveTaskLifecycleTaskId(readSummary);
    const carrierSessionId = typeof readSummary.active_session_id === 'string' && readSummary.active_session_id.trim()
      ? readSummary.active_session_id.trim()
      : '';
    const operationScopedTask = readSummary.workflow_next_action === 'focus_operation_path_task';
    if (!taskId && !carrierSessionId && !operationScopedTask) {
      throw new Error('operation_next_workflow_task_lifecycle_next_requires_task_id_or_active_session_id');
    }
    if (taskId) args.push('--task-id', taskId);
    if (!taskId && carrierSessionId) args.push('--carrier-session-id', carrierSessionId);
    if (!taskId && !carrierSessionId && operationScopedTask) args.push('--operation-id', operationId);
    if (config.agentId) args.push('--agent-id', config.agentId);
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

function resolveTaskLifecycleTaskId(readSummary = {}) {
  const candidates = [
    readSummary.task_id,
    readSummary.route_target,
    readSummary.workflow_focus_ref,
  ];
  for (const candidate of candidates) {
    if (typeof candidate !== 'string') continue;
    const value = candidate.trim();
    if (!value) continue;
    if (value.startsWith('task_') || value.startsWith('cloudflare-task-lifecycle-')) return value;
  }
  return '';
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
  if (config.format === 'text') {
    process.stdout.write(formatOperationNextWorkflowLiveText(result));
  } else {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  }
}

