#!/usr/bin/env node
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import { readFile, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stderr, stdout } from 'node:process';
import {
  classifyCloudflareAuthorityCommandState,
  classifyCloudflareEvidenceCommandState,
  classifyCloudflareMembershipCommandState,
  classifyCloudflareOperationCommandState,
  classifyCloudflareSessionCommandState,
  classifyCloudflareSiteCommandState,
  classifyCloudflareTaskCommandState,
} from '../packages/cloudflare-carrier/src/cloudflare-worker.mjs';

const args = process.argv.slice(2);
const repoRoot = new URL('..', import.meta.url);
const envPath = new URL('.env', repoRoot);
const require = createRequire(import.meta.url);
const CANONICAL_CLOUDFLARE_SITE_ID = 'site_narada_cloudflare';
const CANONICAL_CLOUDFLARE_SITE_REF = 'cloudflare://narada-cloudflare-carrier';
const CANONICAL_CLOUDFLARE_OPERATION_ID = 'operation_narada_cloudflare_control';

loadLocalEnv(envPath);

if (flag('--help') || flag('-h')) {
  printHelp();
  process.exit(0);
}

const siteId = option('--site') ?? process.env.CLOUDFLARE_CARRIER_SITE_ID ?? CANONICAL_CLOUDFLARE_SITE_ID;
const siteRef = option('--site-ref') ?? process.env.CLOUDFLARE_CARRIER_SITE_REF ?? CANONICAL_CLOUDFLARE_SITE_REF;
const operationId = option('--operation') ?? process.env.CLOUDFLARE_CARRIER_OPERATION_ID ?? CANONICAL_CLOUDFLARE_OPERATION_ID;
const workerUrl = trimTrailingSlash(option('--url') ?? process.env.CLOUDFLARE_CARRIER_URL ?? '');
const tokenFile = option('--token-file') ?? process.env.CLOUDFLARE_CARRIER_TOKEN_FILE ?? '';
const operatorCookieFile = option('--operator-cookie-file') ?? process.env.CLOUDFLARE_OPERATOR_COOKIE_FILE ?? '';
const registryPath = option('--registry') ?? process.env.NARADA_SITE_CONTINUITY_REGISTRY ?? join(tmpdir(), 'narada-cloudflare-operator-continuity.db');
const expectToolEffectPosture = option('--expect-tool-effect-posture') ?? process.env.CLOUDFLARE_CARRIER_EXPECT_TOOL_EFFECT_POSTURE ?? 'configured';
const requireOperatorSession = flag('--require-operator-session');

if (flag('--write-env')) await writeLocalEnv({ workerUrl, tokenFile });
if (!workerUrl) fail('cloudflare_operator_check_requires_--url_or_CLOUDFLARE_CARRIER_URL');
if (!tokenFile) fail('cloudflare_operator_check_requires_--token-file_or_CLOUDFLARE_CARRIER_TOKEN_FILE');
if (requireOperatorSession && !operatorCookieFile) fail('cloudflare_operator_check_requires_--operator-cookie-file');

const tokenStat = await readableFileStat(tokenFile);
if (!tokenStat.ok) fail('cloudflare_operator_check_token_file_unreadable', { token_file: tokenFile, error: tokenStat.error });
const bearerToken = (await readFile(tokenFile, 'utf8')).trim();
if (!bearerToken) fail('cloudflare_operator_check_token_file_empty', { token_file: tokenFile });

const consoleCheck = await readConsole(workerUrl);
assert.equal(consoleCheck.http_status, 200);
const consoleScript = consoleCheck.body.match(/<script type="module">([\s\S]*)<\/script>/)?.[1] || '';
assert.ok(consoleScript, 'console module script is rendered');
assert.doesNotThrow(() => new Function(consoleScript));
assert.match(consoleCheck.body, /Narada Cloudflare Carrier/);
assert.match(consoleCheck.body, /naradaCloudflareCarrierClient/);
assert.match(consoleCheck.body, /auth\/microsoft\/login|Microsoft/i);
assert.match(consoleCheck.body, /Operation Surface/);
assert.match(consoleCheck.body, /Operation ID/);
assert.match(consoleCheck.body, /Operation Sessions/);
assert.match(consoleCheck.body, /Active Session/);
assert.match(consoleCheck.body, /readOperation/);
assert.match(consoleCheck.body, /readSite/);
assert.match(consoleCheck.body, /autoRefreshOperation/);
assert.match(consoleCheck.body, /Auto Refresh/);
assert.match(consoleCheck.body, /Control Room/);
assert.match(consoleCheck.body, /Control Room Action/);
assert.match(consoleCheck.body, /controlRoomActionSummary/);
assert.match(consoleCheck.body, /controlRoomActionContext/);
assert.match(consoleCheck.body, /renderControlRoomActionSummary/);
assert.match(consoleCheck.body, /applyControlRoomNextAction/);
assert.match(consoleCheck.body, /controlRoomNextAction/);
assert.match(consoleCheck.body, /focus_lifecycle_continuity_loop_report/);
assert.match(consoleCheck.body, /operation_lifecycle_missing_continuity_loop_report/);
assert.match(consoleCheck.body, /focus_operation_path_attention/);
assert.match(consoleCheck.body, /focus_operation_path_task/);
assert.match(consoleCheck.body, /focus_session_path_evidence/);
assert.match(consoleCheck.body, /focus_session_path_task/);
assert.match(consoleCheck.body, /focus_task_path_evidence/);
assert.match(consoleCheck.body, /focus_authority_path_evidence/);
assert.match(consoleCheck.body, /select_site_or_operation/);
assert.match(consoleCheck.body, /membership_authority_bridge_needs_attention/);
assert.match(consoleCheck.body, /workbench_ready_for_monitoring/);
assert.match(consoleCheck.body, /Operation Flight Deck/);
assert.match(consoleCheck.body, /Continuity Workflow/);
assert.match(consoleCheck.body, /Operator Route/);
assert.match(consoleCheck.body, /operatorRoute/);
assert.match(consoleCheck.body, /operatorRouteStages/);
assert.match(consoleCheck.body, /renderOperatorRoute/);
assert.match(consoleCheck.body, /applyOperatorRouteNextAction/);
assert.match(consoleCheck.body, /operatorRouteNextAction/);
assert.match(consoleCheck.body, /Focus Route Next Action/);
assert.match(consoleCheck.body, /Workbench Readiness Gate/);
assert.match(consoleCheck.body, /Operation Control Board/);
assert.match(consoleCheck.body, /operationControlBoard/);
assert.match(consoleCheck.body, /operationControlTarget/);
assert.match(consoleCheck.body, /operationControlTargetNextAction/);
assert.match(consoleCheck.body, /operationControlTargetEvidenceAction/);
assert.match(consoleCheck.body, /operationControlTargetReadinessAction/);
assert.match(consoleCheck.body, /operationControlBoardContext/);
assert.match(consoleCheck.body, /renderOperationControlBoard/);
assert.match(consoleCheck.body, /Control Command/);
assert.match(consoleCheck.body, /Focused Control Target/);
assert.match(consoleCheck.body, /Apply Target Action/);
assert.match(consoleCheck.body, /Focus Target Evidence/);
assert.match(consoleCheck.body, /Focus Target Readiness/);
assert.match(consoleCheck.body, /control_domain/);
assert.match(consoleCheck.body, /control_action/);
assert.match(consoleCheck.body, /control_target/);
assert.match(consoleCheck.body, /operation_focus/);
assert.match(consoleCheck.body, /session_focus/);
assert.match(consoleCheck.body, /task_focus/);
assert.match(consoleCheck.body, /authority_focus/);
assert.match(consoleCheck.body, /evidence_focus/);
assert.match(consoleCheck.body, /Control Posture/);
assert.match(consoleCheck.body, /Active Work Path/);
assert.match(consoleCheck.body, /Session Evidence Posture/);
assert.match(consoleCheck.body, /provider_events/);
assert.match(consoleCheck.body, /session_next_action/);
assert.match(consoleCheck.body, /Authority Posture/);
assert.match(consoleCheck.body, /Task Lifecycle Posture/);
assert.match(consoleCheck.body, /focused_status/);
assert.match(consoleCheck.body, /next_task/);
assert.match(consoleCheck.body, /controlled_action/);
assert.match(consoleCheck.body, /authority_evidence/);
assert.match(consoleCheck.body, /Readiness Gaps/);
assert.match(consoleCheck.body, /workbenchReadinessGate/);
assert.match(consoleCheck.body, /workbenchReadinessGateItems/);
assert.match(consoleCheck.body, /renderWorkbenchReadinessGate/);
assert.match(consoleCheck.body, /applyWorkbenchReadinessNextAction/);
assert.match(consoleCheck.body, /workbenchReadinessNextAction/);
assert.match(consoleCheck.body, /Focus Readiness Gap/);
assert.match(consoleCheck.body, /operator_identity_ready/);
assert.match(consoleCheck.body, /membership_authority_ready/);
assert.match(consoleCheck.body, /next_control_action_ready/);
assert.match(consoleCheck.body, /continuityWorkflow/);
assert.match(consoleCheck.body, /continuityWorkflowSteps/);
assert.match(consoleCheck.body, /applyContinuityWorkflowNextStep/);
assert.match(consoleCheck.body, /continuityWorkflowNextAction/);
assert.match(consoleCheck.body, /Focus Next Workflow Step/);
assert.match(consoleCheck.body, /operation_scope_loaded/);
assert.match(consoleCheck.body, /session_evidence_loaded/);
assert.match(consoleCheck.body, /authority_state_loaded/);
assert.match(consoleCheck.body, /evidence_focus_set/);
assert.match(consoleCheck.body, /Product Scope/);
assert.match(consoleCheck.body, /controlProductScope/);
assert.match(consoleCheck.body, /productScopeDetail/);
assert.match(consoleCheck.body, /productScopeSummary/);
assert.match(consoleCheck.body, /productScopeContext/);
assert.match(consoleCheck.body, /renderProductScopeDetail/);
assert.match(consoleCheck.body, /readOperationScope/);
assert.match(consoleCheck.body, /readSiteScope/);
assert.match(consoleCheck.body, /refreshSiteProduct/);
assert.match(consoleCheck.body, /read_operation_or_site_scope/);
assert.match(consoleCheck.body, /read_site_scope_for_membership_and_operations/);
assert.match(consoleCheck.body, /read_operation_scope_for_active_operation/);
assert.match(consoleCheck.body, /operationFlightDeck/);
assert.match(consoleCheck.body, /operationFlightDeckContext/);
assert.match(consoleCheck.body, /renderOperationFlightDeck/);
assert.match(consoleCheck.body, /Next Action/);
assert.match(consoleCheck.body, /operationFlightDeckTargets/);
assert.match(consoleCheck.body, /applyFlightDeckNextAction/);
assert.match(consoleCheck.body, /flightDeckNextAction/);
assert.match(consoleCheck.body, /flightDeckFocusSession/);
assert.match(consoleCheck.body, /flightDeckFocusAttention/);
assert.match(consoleCheck.body, /flightDeckFocusTask/);
assert.match(consoleCheck.body, /flightDeckFocusAuthority/);
assert.match(consoleCheck.body, /flightDeckFocusEvidence/);
assert.match(consoleCheck.body, /Focus Next Action/);
assert.match(consoleCheck.body, /Runtime Posture/);
assert.match(consoleCheck.body, /runtimePostureDetail/);
assert.match(consoleCheck.body, /runtimePostureContext/);
assert.match(consoleCheck.body, /renderRuntimePosture/);
assert.match(consoleCheck.body, /Operator Identity/);
assert.match(consoleCheck.body, /controlOperator/);
assert.match(consoleCheck.body, /operatorIdentity/);
assert.match(consoleCheck.body, /operatorPrincipalLabel/);
assert.match(consoleCheck.body, /operatorPrincipalContext/);
assert.match(consoleCheck.body, /renderOperatorIdentity/);
assert.match(consoleCheck.body, /Controlled Actions/);
assert.match(consoleCheck.body, /Operation Focus/);
assert.match(consoleCheck.body, /Operation Navigator/);
assert.match(consoleCheck.body, /Operation Posture/);
assert.match(consoleCheck.body, /operationPostureOverview/);
assert.match(consoleCheck.body, /renderOperationPostureOverview/);
assert.match(consoleCheck.body, /operationPostureReason/);
assert.match(consoleCheck.body, /narada\.cloudflare_operation_posture_overview\.v1/);
assert.match(consoleCheck.body, /Reason Counts/);
assert.match(consoleCheck.body, /Command State Counts/);
assert.match(consoleCheck.body, /Operation Work Queue/);
assert.match(consoleCheck.body, /operationWorkQueue/);
assert.match(consoleCheck.body, /operationWorkQueueItems/);
assert.match(consoleCheck.body, /renderOperationWorkQueue/);
assert.match(consoleCheck.body, /operationWorkQueueButtonId/);
assert.match(consoleCheck.body, /Operation Action/);
assert.match(consoleCheck.body, /operationActionSummary/);
assert.match(consoleCheck.body, /operationActionContext/);
assert.match(consoleCheck.body, /classifyCloudflareOperationCommandState/);
assert.match(consoleCheck.body, /applyOperationCommandAction/);
assert.match(consoleCheck.body, /renderOperationActionSummary/);
assert.match(consoleCheck.body, /Command State/);
assert.match(consoleCheck.body, /Command Action/);
assert.match(consoleCheck.body, /operationCommandNextAction/);
assert.match(consoleCheck.body, /operationCommandSessionAction/);
assert.match(consoleCheck.body, /operationCommandTaskAction/);
assert.match(consoleCheck.body, /operationCommandAuthorityAction/);
assert.match(consoleCheck.body, /operationCommandEvidenceAction/);
assert.match(consoleCheck.body, /Run Operation Command/);
assert.match(consoleCheck.body, /focusedOperation/);
assert.match(consoleCheck.body, /operationScopeLoaded/);
assert.match(consoleCheck.body, /operationEvidenceLoaded/);
assert.match(consoleCheck.body, /useFocusedOperation/);
assert.match(consoleCheck.body, /focusOperationSession/);
assert.match(consoleCheck.body, /operationActionUseOperation/);
assert.match(consoleCheck.body, /operationActionReadOperation/);
assert.match(consoleCheck.body, /operationActionFocusSession/);
assert.match(consoleCheck.body, /use_focused_operation/);
assert.match(consoleCheck.body, /read_operation_scope/);
assert.match(consoleCheck.body, /Create Operation ID/);
assert.match(consoleCheck.body, /newOperationId/);
assert.match(consoleCheck.body, /Create Operation Display Name/);
assert.match(consoleCheck.body, /newOperationDisplayName/);
assert.match(consoleCheck.body, /Create Operation Kind/);
assert.match(consoleCheck.body, /newOperationKind/);
assert.match(consoleCheck.body, /createOperation/);
assert.match(consoleCheck.body, /createOperationFromWorkbench/);
assert.match(consoleCheck.body, /Operation Focus Detail/);
assert.match(consoleCheck.body, /operationFocusDetail/);
assert.match(consoleCheck.body, /operationFocusContext/);
assert.match(consoleCheck.body, /renderOperationFocusDetail/);
assert.match(consoleCheck.body, /Operation Path/);
assert.match(consoleCheck.body, /operationPath/);
assert.match(consoleCheck.body, /operationPathContext/);
assert.match(consoleCheck.body, /renderOperationPath/);
assert.match(consoleCheck.body, /operationEvents/);
assert.match(consoleCheck.body, /operationTasks/);
assert.match(consoleCheck.body, /focusOperationPathSession/);
assert.match(consoleCheck.body, /focusOperationPathTask/);
assert.match(consoleCheck.body, /focusOperationPathAttention/);
assert.match(consoleCheck.body, /focusOperationPathAuthority/);
assert.match(consoleCheck.body, /focusOperationPathEvidence/);
assert.match(consoleCheck.body, /operationNavigator/);
assert.match(consoleCheck.body, /renderOperationNavigator/);
assert.match(consoleCheck.body, /selectOperation/);
assert.match(consoleCheck.body, /setCurrentOperation/);
assert.match(consoleCheck.body, /operation-item/);
assert.match(consoleCheck.body, /\.operation-item\.selected/);
assert.match(consoleCheck.body, /Session Focus/);
assert.match(consoleCheck.body, /Session Navigator/);
assert.match(consoleCheck.body, /Session Work Queue/);
assert.match(consoleCheck.body, /sessionWorkQueue/);
assert.match(consoleCheck.body, /sessionWorkQueueItems/);
assert.match(consoleCheck.body, /renderSessionWorkQueue/);
assert.match(consoleCheck.body, /sessionWorkQueueButtonId/);
assert.match(consoleCheck.body, /Session Action/);
assert.match(consoleCheck.body, /sessionActionSummary/);
assert.match(consoleCheck.body, /sessionActionContext/);
assert.match(consoleCheck.body, /classifyCloudflareSessionCommandState/);
assert.match(consoleCheck.body, /renderSessionActionSummary/);
assert.match(consoleCheck.body, /Command State/);
assert.match(consoleCheck.body, /Command Action/);
assert.match(consoleCheck.body, /focusedSession/);
assert.match(consoleCheck.body, /sessionEvidenceLoaded/);
assert.match(consoleCheck.body, /useFocusedSession/);
assert.match(consoleCheck.body, /focusFocusedSessionEvidence/);
assert.match(consoleCheck.body, /sessionActionUseSession/);
assert.match(consoleCheck.body, /sessionActionReadEvidence/);
assert.match(consoleCheck.body, /sessionActionFocusEvidence/);
assert.equal([...consoleCheck.body.matchAll(/id="sessionActionFocusEvidence"/g)].length, 1);
assert.match(consoleCheck.body, /use_focused_session/);
assert.match(consoleCheck.body, /Session Focus Detail/);
assert.match(consoleCheck.body, /sessionFocusDetail/);
assert.match(consoleCheck.body, /sessionFocusContext/);
assert.match(consoleCheck.body, /renderSessionFocusDetail/);
assert.match(consoleCheck.body, /Session Evidence Path/);
assert.match(consoleCheck.body, /sessionEvidencePath/);
assert.match(consoleCheck.body, /sessionEvidencePathContext/);
assert.match(consoleCheck.body, /renderSessionEvidencePath/);
assert.match(consoleCheck.body, /Session Evidence Control/);
assert.match(consoleCheck.body, /sessionEvidenceControl/);
assert.match(consoleCheck.body, /sessionEvidenceControlContext/);
assert.match(consoleCheck.body, /renderSessionEvidenceControl/);
assert.match(consoleCheck.body, /applySessionEvidenceAction/);
assert.match(consoleCheck.body, /sessionEvidenceApplyAction/);
assert.match(consoleCheck.body, /sessionEvidenceFocusAction/);
assert.match(consoleCheck.body, /sessionEvidenceTaskAction/);
assert.match(consoleCheck.body, /Apply Session Evidence Action/);
assert.match(consoleCheck.body, /Focus Session Task/);
assert.match(consoleCheck.body, /review_session_failures/);
assert.match(consoleCheck.body, /review_session_open_task/);
assert.match(consoleCheck.body, /review_session_delivery/);
assert.match(consoleCheck.body, /monitor_session_evidence/);
assert.match(consoleCheck.body, /sessionEvidenceEvents/);
assert.match(consoleCheck.body, /sessionTasks/);
assert.match(consoleCheck.body, /directiveDeliveryForSession/);
assert.match(consoleCheck.body, /focusSessionPathEvidence/);
assert.match(consoleCheck.body, /focusSessionPathTask/);
assert.match(consoleCheck.body, /focusSessionPathDelivery/);
assert.match(consoleCheck.body, /focusSessionPathChain/);
assert.match(consoleCheck.body, /sessionNavigator/);
assert.match(consoleCheck.body, /renderSessionNavigator/);
assert.match(consoleCheck.body, /selectOperationSession/);
assert.match(consoleCheck.body, /session-item/);
assert.match(consoleCheck.body, /Authority Locus/);
assert.match(consoleCheck.body, /Authority Focus/);
assert.match(consoleCheck.body, /Site Membership/);
assert.match(consoleCheck.body, /Membership Navigator/);
assert.match(consoleCheck.body, /Membership Focus Detail/);
assert.match(consoleCheck.body, /membershipNavigator/);
assert.match(consoleCheck.body, /membershipFocusDetail/);
assert.match(consoleCheck.body, /membershipFocusContext/);
assert.match(consoleCheck.body, /renderMembershipNavigator/);
assert.match(consoleCheck.body, /renderMembershipFocusDetail/);
assert.match(consoleCheck.body, /selectMembership/);
assert.match(consoleCheck.body, /\.membership-item\.selected/);
assert.match(consoleCheck.body, /Site Continuity/);
assert.match(consoleCheck.body, /Continuity Focus Detail/);
assert.match(consoleCheck.body, /continuityNavigator/);
assert.match(consoleCheck.body, /continuityFocusDetail/);
assert.match(consoleCheck.body, /continuityItems/);
assert.match(consoleCheck.body, /continuityFocusContext/);
assert.match(consoleCheck.body, /renderContinuityNavigator/);
assert.match(consoleCheck.body, /renderContinuityFocusDetail/);
assert.match(consoleCheck.body, /selectContinuity/);
assert.match(consoleCheck.body, /\.continuity-item\.selected/);
assert.match(consoleCheck.body, /Authority State/);
assert.match(consoleCheck.body, /controlAuthorityFocus/);
assert.match(consoleCheck.body, /authorityState/);
assert.match(consoleCheck.body, /authorityFocusDetail/);
assert.match(consoleCheck.body, /Authority Path/);
assert.match(consoleCheck.body, /authorityPath/);
assert.match(consoleCheck.body, /authorityPathContext/);
assert.match(consoleCheck.body, /renderAuthorityPath/);
assert.match(consoleCheck.body, /authorityEvidenceEvents/);
assert.match(consoleCheck.body, /focusAuthorityPathDecision/);
assert.match(consoleCheck.body, /refreshAuthorityPath/);
assert.match(consoleCheck.body, /authorityPathFocusDecision/);
assert.match(consoleCheck.body, /authorityPathFocusEvidence/);
assert.match(consoleCheck.body, /authorityPathRefresh/);
assert.match(consoleCheck.body, /Authority Action/);
assert.match(consoleCheck.body, /authorityActionSummary/);
assert.match(consoleCheck.body, /authorityActionContext/);
assert.match(consoleCheck.body, /classifyCloudflareAuthorityCommandState/);
assert.match(consoleCheck.body, /renderAuthorityActionSummary/);
assert.match(consoleCheck.body, /Command State/);
assert.match(consoleCheck.body, /Command Action/);
assert.match(consoleCheck.body, /authorityActorMembership/);
assert.match(consoleCheck.body, /applyAuthorityNextAction/);
assert.match(consoleCheck.body, /focusAuthorityEvidence/);
assert.match(consoleCheck.body, /authorityNextAction/);
assert.match(consoleCheck.body, /authorityReadSiteAction/);
assert.match(consoleCheck.body, /authorityActionEvidenceAction/);
assert.match(consoleCheck.body, /inspect_refused_authority/);
assert.match(consoleCheck.body, /monitor_authority_admissions/);
assert.match(consoleCheck.body, /focus_authority_evidence/);
assert.match(consoleCheck.body, /authorityDecisionKey/);
assert.match(consoleCheck.body, /selectAuthorityDecision/);
assert.match(consoleCheck.body, /Authority Decision Queue/);
assert.match(consoleCheck.body, /Authority Decision Control/);
assert.match(consoleCheck.body, /authorityDecisionControl/);
assert.match(consoleCheck.body, /authorityDecisionControlContext/);
assert.match(consoleCheck.body, /renderAuthorityDecisionControl/);
assert.match(consoleCheck.body, /applyAuthorityDecisionReview/);
assert.match(consoleCheck.body, /authorityDecisionApplyAction/);
assert.match(consoleCheck.body, /authorityDecisionEvidenceAction/);
assert.match(consoleCheck.body, /authorityDecisionRefreshAction/);
assert.match(consoleCheck.body, /Apply Decision Review/);
assert.match(consoleCheck.body, /Focus Decision Evidence/);
assert.match(consoleCheck.body, /Refresh Decision Authority/);
assert.match(consoleCheck.body, /Review State/);
assert.match(consoleCheck.body, /Review Action/);
assert.match(consoleCheck.body, /review_refused_authority/);
assert.match(consoleCheck.body, /review_unresolved_locus/);
assert.match(consoleCheck.body, /load_decision_evidence/);
assert.match(consoleCheck.body, /authorityDecisionQueue/);
assert.match(consoleCheck.body, /authorityDecisionQueueItems/);
assert.match(consoleCheck.body, /renderAuthorityDecisionQueue/);
assert.match(consoleCheck.body, /authorityDecisionEvidenceEvents/);
assert.match(consoleCheck.body, /authorityDecisionQueueButtonId/);
assert.match(consoleCheck.body, /authorityDecisionContext/);
assert.match(consoleCheck.body, /renderAuthorityFocusDetail/);
assert.match(consoleCheck.body, /authorityFocusEvidenceAction/);
assert.match(consoleCheck.body, /resolve_authority_locus/);
assert.match(consoleCheck.body, /inspect_authority_locus/);
assert.match(consoleCheck.body, /\.authority-decision\.selected/);
assert.match(consoleCheck.body, /Task Focus/);
assert.match(consoleCheck.body, /Task Focus Detail/);
assert.match(consoleCheck.body, /taskFocusDetail/);
assert.match(consoleCheck.body, /taskFocusContext/);
assert.match(consoleCheck.body, /classifyCloudflareTaskCommandState/);
assert.match(consoleCheck.body, /taskLifecyclePathContext/);
assert.match(consoleCheck.body, /focusTaskLifecyclePath/);
assert.match(consoleCheck.body, /renderTaskFocusDetail/);
assert.match(consoleCheck.body, /Command State/);
assert.match(consoleCheck.body, /Command Action/);
assert.match(consoleCheck.body, /taskFocusEvidenceAction/);
assert.match(consoleCheck.body, /taskFocusPathAction/);
assert.match(consoleCheck.body, /taskFocusOpenAction/);
assert.match(consoleCheck.body, /taskFocusDoneAction/);
assert.match(consoleCheck.body, /Next Lifecycle Action/);
assert.match(consoleCheck.body, /Task Lifecycle Control/);
assert.match(consoleCheck.body, /taskLifecycleControl/);
assert.match(consoleCheck.body, /taskLifecycleControlContext/);
assert.match(consoleCheck.body, /renderTaskLifecycleControl/);
assert.match(consoleCheck.body, /applyTaskLifecycleAction/);
assert.match(consoleCheck.body, /taskLifecycleApplyAction/);
assert.match(consoleCheck.body, /taskLifecycleEvidenceAction/);
assert.match(consoleCheck.body, /taskLifecycleSessionAction/);
assert.match(consoleCheck.body, /Apply Lifecycle Action/);
assert.match(consoleCheck.body, /Focus Lifecycle Evidence/);
assert.match(consoleCheck.body, /Focus Lifecycle Session/);
assert.match(consoleCheck.body, /Lifecycle Action/);
assert.match(consoleCheck.body, /mark_task_done/);
assert.match(consoleCheck.body, /inspect_task_evidence/);
assert.match(consoleCheck.body, /normalize_task_open/);
assert.match(consoleCheck.body, /Task Path/);
assert.match(consoleCheck.body, /normalize_status_or_update/);
assert.match(consoleCheck.body, /reopen_or_inspect_evidence/);
assert.match(consoleCheck.body, /Operation Attention/);
assert.match(consoleCheck.body, /Attention Focus Detail/);
assert.match(consoleCheck.body, /attentionFocusDetail/);
assert.match(consoleCheck.body, /attentionFocusContext/);
assert.match(consoleCheck.body, /renderAttentionFocusDetail/);
assert.match(consoleCheck.body, /attentionFocusEvidenceAction/);
assert.match(consoleCheck.body, /attentionFocusTaskAction/);
assert.match(consoleCheck.body, /attentionFocusResolveAction/);
assert.match(consoleCheck.body, /createTaskFromFocusedAttention/);
assert.match(consoleCheck.body, /resolveFocusedAttention/);
assert.match(consoleCheck.body, /create_or_select_resolution_task/);
assert.match(consoleCheck.body, /inspect_resolving_task/);
assert.match(consoleCheck.body, /\.attention-item\.selected/);
assert.match(consoleCheck.body, /Raise Attention/);
assert.match(consoleCheck.body, /Task From Attention/);
assert.match(consoleCheck.body, /Resolve Attention/);
assert.match(consoleCheck.body, /Evidence Window/);
assert.match(consoleCheck.body, /Evidence Focus/);
assert.match(consoleCheck.body, /Evidence Action/);
assert.match(consoleCheck.body, /evidenceActionSummary/);
assert.match(consoleCheck.body, /evidence-summary/);
assert.match(consoleCheck.body, /evidence-field/);
assert.match(consoleCheck.body, /evidenceMeaning/);
assert.match(consoleCheck.body, /evidenceActionContext/);
assert.match(consoleCheck.body, /evidenceTargetContext/);
assert.match(consoleCheck.body, /classifyCloudflareEvidenceCommandState/);
assert.match(consoleCheck.body, /evidenceActionSummaryContext/);
assert.match(consoleCheck.body, /evidenceNextAction/);
assert.match(consoleCheck.body, /Command State/);
assert.match(consoleCheck.body, /Command Action/);
assert.match(consoleCheck.body, /tryParseTaskId/);
assert.match(consoleCheck.body, /focusEvidenceLaneForCurrent/);
assert.match(consoleCheck.body, /selectEvidenceSession/);
assert.match(consoleCheck.body, /focusEvidenceTarget/);
assert.match(consoleCheck.body, /focusEvidencePath/);
assert.match(consoleCheck.body, /renderEvidenceActionSummary/);
assert.match(consoleCheck.body, /evidenceActionLaneAction/);
assert.match(consoleCheck.body, /evidenceActionSessionAction/);
assert.match(consoleCheck.body, /evidenceActionTargetAction/);
assert.match(consoleCheck.body, /evidenceActionPathAction/);
assert.match(consoleCheck.body, /Focus Evidence Target/);
assert.match(consoleCheck.body, /Focus Evidence Path/);
assert.match(consoleCheck.body, /inspect_failure_and_retry_or_escalate/);
assert.match(consoleCheck.body, /resolve_or_acknowledge_directive/);
assert.match(consoleCheck.body, /trace_input_lifecycle/);
assert.match(consoleCheck.body, /evidenceTrailContext/);
assert.match(consoleCheck.body, /evidenceFocusIndex/);
assert.match(consoleCheck.body, /focusAdjacentEvidence/);
assert.match(consoleCheck.body, /Trail Position/);
assert.match(consoleCheck.body, /evidenceFocusPreviousAction/);
assert.match(consoleCheck.body, /evidenceFocusNextAction/);
assert.match(consoleCheck.body, /Previous Evidence/);
assert.match(consoleCheck.body, /Next Evidence/);
assert.match(consoleCheck.body, /evidenceLanes/);
assert.match(consoleCheck.body, /evidenceReviewQueue/);
assert.match(consoleCheck.body, /evidenceReviewQueueItems/);
assert.match(consoleCheck.body, /renderEvidenceReviewQueue/);
assert.match(consoleCheck.body, /evidenceReviewPriority/);
assert.match(consoleCheck.body, /evidenceReviewQueueButtonId/);
assert.match(consoleCheck.body, /classifyEvidenceLane/);
assert.match(consoleCheck.body, /renderEvidenceLanes/);
assert.match(consoleCheck.body, /Input Lifecycle/);
assert.match(consoleCheck.body, /Provider Turns/);
assert.match(consoleCheck.body, /Tools \/ Effects/);
assert.match(consoleCheck.body, /compactEvidenceValue/);
assert.match(consoleCheck.body, /controlEvidenceFocus/);
assert.match(consoleCheck.body, /Evidence Filter/);
assert.match(consoleCheck.body, /Session Filter/);
assert.match(consoleCheck.body, /updateControlRoom/);
assert.match(consoleCheck.body, /Workbench Readiness/);
assert.match(consoleCheck.body, /controlWorkbenchReadiness/);
assert.match(consoleCheck.body, /operationWorkbenchReadiness/);
assert.match(consoleCheck.body, /shadow-read/);
assert.match(consoleCheck.body, /extractOperationAttention/);
assert.match(consoleCheck.body, /renderAttentionQueue/);
assert.match(consoleCheck.body, /selectedAttention/);
assert.match(consoleCheck.body, /resolved_attention/);
assert.match(consoleCheck.body, /controlAttention/);
assert.match(consoleCheck.body, /directive\.emit/);
assert.match(consoleCheck.body, /operation_attention/);
assert.match(consoleCheck.body, /visibleEvents/);
assert.match(consoleCheck.body, /focusEvidence/);
assert.match(consoleCheck.body, /focusEvidenceFor/);
assert.match(consoleCheck.body, /setEvidenceLane/);
assert.match(consoleCheck.body, /selectAttentionItem/);
assert.match(consoleCheck.body, /renderEvidenceFocus/);
assert.match(consoleCheck.body, /eventTitle/);
assert.match(consoleCheck.body, /event selected/);
assert.match(consoleCheck.body, /refreshEventKindFilter/);
assert.match(consoleCheck.body, /Use Session/);
assert.match(consoleCheck.body, /Read Session Evidence/);
assert.match(consoleCheck.body, /readSessionEvidence/);
assert.match(consoleCheck.body, /readSelectedSessionEvidence/);
assert.match(consoleCheck.body, /sessionFocusReadEvidenceAction/);
assert.match(consoleCheck.body, /sessionFocusEvidenceAction/);
assert.match(consoleCheck.body, /read_session_evidence/);
assert.match(consoleCheck.body, /inspect_session_evidence/);
assert.match(consoleCheck.body, /Active Session Detail/);
assert.match(consoleCheck.body, /activeSessionDetail/);
assert.match(consoleCheck.body, /renderActiveSessionDetail/);
assert.match(consoleCheck.body, /Evidence Replay/);
assert.match(consoleCheck.body, /evidenceReplayStatus/);
assert.match(consoleCheck.body, /evidenceReplayStatus\(/);
assert.match(consoleCheck.body, /evidenceReplaySources/);
assert.match(consoleCheck.body, /evidenceReplaySessionSummary/);
assert.match(consoleCheck.body, /renderEvidenceReplayMetric/);
assert.match(consoleCheck.body, /Evidence Replay State/);
assert.match(consoleCheck.body, /Evidence Replay Source/);
assert.match(consoleCheck.body, /Evidence Replay Sessions/);
assert.match(consoleCheck.body, /operation\.status\.put/);
assert.match(consoleCheck.body, /putOperationStatus/);
assert.match(consoleCheck.body, /putFocusedOperationStatus/);
assert.match(consoleCheck.body, /operationLifecycleActionRow/);
assert.match(consoleCheck.body, /operationLifecyclePause/);
assert.match(consoleCheck.body, /operationLifecycleResume/);
assert.match(consoleCheck.body, /operationLifecycleArchive/);
assert.match(consoleCheck.body, /operation_status_history/);
assert.match(consoleCheck.body, /operationStatusHistory/);
assert.match(consoleCheck.body, /operationStatusTransitionSummary/);
assert.match(consoleCheck.body, /operationLatestStatusTransitionLabel/);
assert.match(consoleCheck.body, /Status Transitions/);
assert.match(consoleCheck.body, /Latest Status Transition/);
assert.match(consoleCheck.body, /operation_activity_timeline/);
assert.match(consoleCheck.body, /operationActivityTimeline/);
assert.match(consoleCheck.body, /operationActivityTimelineSummary/);
assert.match(consoleCheck.body, /operationLatestActivityLabel/);
assert.match(consoleCheck.body, /selectOperationActivity/);
assert.match(consoleCheck.body, /renderOperationActivityTimeline/);
assert.match(consoleCheck.body, /Operation Activity Timeline/);
assert.match(consoleCheck.body, /Activity Items/);
assert.match(consoleCheck.body, /Latest Activity/);
assert.match(consoleCheck.body, /operationActivityFocus/);
assert.match(consoleCheck.body, /operationActivityFocusDetail/);
assert.match(consoleCheck.body, /operationActivityFocusContext/);
assert.match(consoleCheck.body, /renderOperationActivityFocusDetail/);
assert.match(consoleCheck.body, /applyFocusedOperationActivity/);
assert.match(consoleCheck.body, /operationActivityApplyFocus/);
assert.match(consoleCheck.body, /Activity Focus/);
assert.match(consoleCheck.body, /Apply Activity Focus/);
assert.match(consoleCheck.body, /apply_activity_focus/);
assert.match(consoleCheck.body, /Persistence Posture/);
assert.match(consoleCheck.body, /persistencePostureDetail/);
assert.match(consoleCheck.body, /persistencePostureContext/);
assert.match(consoleCheck.body, /renderPersistencePosture/);
assert.match(consoleCheck.body, /cloudflare_persistence_posture/);
assert.match(consoleCheck.body, /monitor_persistence_posture/);
assert.match(consoleCheck.body, /Persistence State/);
assert.match(consoleCheck.body, /Persistence Next Action/);
assert.match(consoleCheck.body, /Recovery Posture/);
assert.match(consoleCheck.body, /recoveryPostureDetail/);
assert.match(consoleCheck.body, /recoveryPostureContext/);
assert.match(consoleCheck.body, /renderRecoveryPosture/);
assert.match(consoleCheck.body, /cloudflare_recovery_posture/);
assert.match(consoleCheck.body, /monitor_recovery_posture/);
assert.match(consoleCheck.body, /Recovery State/);
assert.match(consoleCheck.body, /Recovery Next Action/);
assert.match(consoleCheck.body, /recoveryWorkflow/);
assert.match(consoleCheck.body, /recoveryWorkflowItems/);
assert.match(consoleCheck.body, /renderRecoveryWorkflow/);
assert.match(consoleCheck.body, /applyRecoveryNextAction/);
assert.match(consoleCheck.body, /recoveryNextAction/);
assert.match(consoleCheck.body, /Apply Recovery Next Action/);
assert.match(consoleCheck.body, /snapshot_reload_available/);
assert.match(consoleCheck.body, /evidence_replay_loaded/);
assert.match(consoleCheck.body, /reconstructability_confirmed/);
assert.match(consoleCheck.body, /focus_kind/);
assert.match(consoleCheck.body, /focus_ref/);
assert.match(consoleCheck.body, /Focus Task Evidence/);
assert.match(consoleCheck.body, /Task Lifecycle Summary/);
assert.match(consoleCheck.body, /taskLifecycleSummary/);
assert.match(consoleCheck.body, /Task Work Queue/);
assert.match(consoleCheck.body, /taskWorkQueue/);
assert.match(consoleCheck.body, /taskWorkQueueItems/);
assert.match(consoleCheck.body, /renderTaskWorkQueue/);
assert.match(consoleCheck.body, /taskWorkQueueButtonId/);
assert.match(consoleCheck.body, /Task Command Preview/);
assert.match(consoleCheck.body, /taskCommandPreview/);
assert.match(consoleCheck.body, /taskCommandPreviewContext/);
assert.match(consoleCheck.body, /renderTaskCommandPreview/);
assert.match(consoleCheck.body, /createTaskFromWorkbench/);
assert.match(consoleCheck.body, /create_task_for_operation/);
assert.match(consoleCheck.body, /update_task_lifecycle_state/);
assert.match(consoleCheck.body, /create_then_select_task/);
assert.match(consoleCheck.body, /create_task_from_attention/);
assert.match(consoleCheck.body, /taskLifecycleStatus/);
assert.match(consoleCheck.body, /Task Evidence Path/);
assert.match(consoleCheck.body, /taskEvidencePath/);
assert.match(consoleCheck.body, /taskEvidencePathContext/);
assert.match(consoleCheck.body, /renderTaskEvidencePath/);
assert.match(consoleCheck.body, /directiveIntentForTask/);
assert.match(consoleCheck.body, /directiveDeliveryForTask/);
assert.match(consoleCheck.body, /taskEvidenceEvents/);
assert.match(consoleCheck.body, /focusTaskPathSession/);
assert.match(consoleCheck.body, /focusTaskPathEvidence/);
assert.match(consoleCheck.body, /focusTaskPathDirective/);
assert.match(consoleCheck.body, /focusTaskPathDelivery/);
assert.match(consoleCheck.body, /focusTaskPathChain/);
assert.match(consoleCheck.body, /renderTaskLifecycleSummary/);
assert.match(consoleCheck.body, /mark_done_or_update/);
assert.match(consoleCheck.body, /focusActionButton/);
assert.match(consoleCheck.body, /focusActionRow/);
assert.match(consoleCheck.body, /authorityPostureSummary/);
assert.match(consoleCheck.body, /renderAuthorityPostureSummary/);
assert.match(consoleCheck.body, /inspect_refusals/);
assert.match(consoleCheck.body, /monitor_admissions/);
assert.match(consoleCheck.body, /Local-Cloud Continuity/);
assert.match(consoleCheck.body, /localCloudContinuityBridge/);
assert.match(consoleCheck.body, /localCloudContinuityBridgeContext/);
assert.match(consoleCheck.body, /renderLocalCloudContinuityBridge/);
assert.match(consoleCheck.body, /local_cloud_binding_declared/);
assert.match(consoleCheck.body, /authority_map_projection_reviewed/);
assert.match(consoleCheck.body, /read_model_projection_reviewed/);
assert.match(consoleCheck.body, /mutation_evidence_reference_reviewed/);
assert.match(consoleCheck.body, /cross_embodiment_execution_guarded/);
assert.match(consoleCheck.body, /durable_mutation_authority/);
assert.match(consoleCheck.body, /routed_by_site_authority_map/);
assert.match(consoleCheck.body, /Continuity Loop Evidence/);
assert.match(consoleCheck.body, /continuityLoopEvidence/);
assert.match(consoleCheck.body, /continuityLoopEvidenceContext/);
assert.match(consoleCheck.body, /renderContinuityLoopEvidence/);
assert.match(consoleCheck.body, /focusContinuityLoopReport/);
assert.match(consoleCheck.body, /continuity_loop_report_recorded/);
assert.match(consoleCheck.body, /site_continuity_loop_report/);
assert.match(consoleCheck.body, /review_continuity_loop_report/);
assert.match(consoleCheck.body, /run_site_continuity_loop/);
assert.match(consoleCheck.body, /Site Product/);
assert.match(consoleCheck.body, /Site Action/);
assert.match(consoleCheck.body, /classifyCloudflareSiteCommandState/);
assert.match(consoleCheck.body, /siteActionSummary/);
assert.match(consoleCheck.body, /siteActionContext/);
assert.match(consoleCheck.body, /renderSiteActionSummary/);
assert.match(consoleCheck.body, /focusedSite/);
assert.match(consoleCheck.body, /siteScopeLoaded/);
assert.match(consoleCheck.body, /focusSiteOperation/);
assert.match(consoleCheck.body, /focusSiteMembership/);
assert.match(consoleCheck.body, /siteActionReadSite/);
assert.match(consoleCheck.body, /siteActionFocusOperation/);
assert.match(consoleCheck.body, /siteActionFocusMembership/);
assert.match(consoleCheck.body, /read_site_scope/);
assert.match(consoleCheck.body, /load_or_create_membership/);
assert.match(consoleCheck.body, /inspect_site_operations/);
assert.match(consoleCheck.body, /Sites Overview/);
assert.match(consoleCheck.body, /Next Reason/);
assert.match(consoleCheck.body, /Action Counts/);
assert.match(consoleCheck.body, /Missing Counts/);
assert.match(consoleCheck.body, /Attention Counts/);
assert.match(consoleCheck.body, /Read Sites/);
assert.match(consoleCheck.body, /Focus Next Site/);
assert.match(consoleCheck.body, /readSites/);
assert.match(consoleCheck.body, /renderSitesProduct/);
assert.match(consoleCheck.body, /countMapSummary/);
assert.match(consoleCheck.body, /narada\.cloudflare_site_product_overview\.v1/);
assert.match(consoleCheck.body, /narada\.cloudflare_site_product_status\.v1/);
assert.match(consoleCheck.body, /Site Focus Detail/);
assert.match(consoleCheck.body, /siteFocusDetail/);
assert.match(consoleCheck.body, /siteFocusContext/);
assert.match(consoleCheck.body, /renderSiteFocusDetail/);
assert.match(consoleCheck.body, /Membership Action/);
assert.match(consoleCheck.body, /classifyCloudflareMembershipCommandState/);
assert.match(consoleCheck.body, /membershipActionSummary/);
assert.match(consoleCheck.body, /membershipActionContext/);
assert.match(consoleCheck.body, /renderMembershipActionSummary/);
assert.match(consoleCheck.body, /focusedMembership/);
assert.match(consoleCheck.body, /membershipAuthorityLoaded/);
assert.match(consoleCheck.body, /putFocusedMembership/);
assert.match(consoleCheck.body, /focusMembershipAuthority/);
assert.match(consoleCheck.body, /membershipActionPut/);
assert.match(consoleCheck.body, /membershipActionReadSite/);
assert.match(consoleCheck.body, /membershipActionFocusAuthority/);
assert.match(consoleCheck.body, /read_membership_site/);
assert.match(consoleCheck.body, /put_membership/);
assert.match(consoleCheck.body, /monitor_membership_authority/);
assert.match(consoleCheck.body, /Webhook Delay Shadow Read/);
assert.match(consoleCheck.body, /webhookDelayShadowNavigator/);
assert.match(consoleCheck.body, /webhookDelayShadowFocusDetail/);
assert.match(consoleCheck.body, /renderWebhookDelayShadowNavigator/);
assert.match(consoleCheck.body, /webhookDelayShadowFocusContext/);
assert.match(consoleCheck.body, /cloudflare_shadow_read/);
assert.match(consoleCheck.body, /windows_primary_dispatcher/);
assert.match(consoleCheck.body, /Dispatch Action/);
assert.match(consoleCheck.body, /Resident Loop Shadow Read/);
assert.match(consoleCheck.body, /residentLoopShadowNavigator/);
assert.match(consoleCheck.body, /residentLoopShadowFocusDetail/);
assert.match(consoleCheck.body, /renderResidentLoopShadowNavigator/);
assert.match(consoleCheck.body, /residentLoopShadowFocusContext/);
assert.match(consoleCheck.body, /selectResidentLoopShadow/);
assert.match(consoleCheck.body, /resident_loop_shadow_reads/);
assert.match(consoleCheck.body, /resident_loop_shadow_run_count/);
assert.match(consoleCheck.body, /Operator Attention/);
assert.match(consoleCheck.body, /Resident Dispatch/);
assert.match(consoleCheck.body, /Webhook Delay Directive Intent/);
assert.match(consoleCheck.body, /Task From Directive Intent/);
assert.match(consoleCheck.body, /taskFromDirectiveIntent/);
assert.match(consoleCheck.body, /createTaskFromFocusedDirectiveIntent/);
assert.match(consoleCheck.body, /directiveIntentTaskTitle/);
assert.match(consoleCheck.body, /directiveIntentTaskPredicate/);
assert.match(consoleCheck.body, /taskForDirectiveIntent/);
assert.match(consoleCheck.body, /create_task_from_directive_intent/);
assert.match(consoleCheck.body, /directive_intent_has_no_task/);
assert.match(consoleCheck.body, /Directive Task/);
assert.match(consoleCheck.body, /webhookDelayDirectiveNavigator/);
assert.match(consoleCheck.body, /webhookDelayDirectiveFocusDetail/);
assert.match(consoleCheck.body, /renderWebhookDelayDirectiveNavigator/);
assert.match(consoleCheck.body, /Webhook Delay Directive Delivery/);
assert.match(consoleCheck.body, /webhookDelayDirectiveDeliveryNavigator/);
assert.match(consoleCheck.body, /webhookDelayDirectiveDeliveryFocusDetail/);
assert.match(consoleCheck.body, /renderWebhookDelayDirectiveDeliveryNavigator/);
assert.match(consoleCheck.body, /webhookDelayDirectiveDeliveryFocusContext/);
assert.match(consoleCheck.body, /selectWebhookDelayDirectiveDelivery/);
assert.match(consoleCheck.body, /focusWebhookDelayDirectiveDelivery/);
assert.match(consoleCheck.body, /focus_webhook_delay_directive_delivery/);
assert.match(consoleCheck.body, /directive_delivery_needs_operator_focus/);
assert.match(consoleCheck.body, /Directive Delivery Session/);
assert.match(consoleCheck.body, /Webhook Delay Evidence Chain/);
assert.match(consoleCheck.body, /webhookDelayEvidenceChain/);
assert.match(consoleCheck.body, /webhookDelayEvidenceChainContext/);
assert.match(consoleCheck.body, /renderWebhookDelayEvidenceChain/);
assert.match(consoleCheck.body, /focusWebhookDelayChainObservation/);
assert.match(consoleCheck.body, /focusWebhookDelayChainIntent/);
assert.match(consoleCheck.body, /focusWebhookDelayChainDelivery/);
assert.match(consoleCheck.body, /focusWebhookDelayChainSession/);
assert.match(consoleCheck.body, /focusWebhookDelayChainTask/);
assert.match(consoleCheck.body, /flightDeckFocusEvidenceChain/);
assert.match(consoleCheck.body, /webhookDelayDirectiveFocusContext/);
assert.match(consoleCheck.body, /selectWebhookDelayDirective/);
assert.match(consoleCheck.body, /focusWebhookDelayDirective/);
assert.match(consoleCheck.body, /focusWebhookDelayShadow/);
assert.match(consoleCheck.body, /focus_webhook_delay_directive_intent/);
assert.match(consoleCheck.body, /focus_webhook_delay_shadow_read/);
assert.match(consoleCheck.body, /directive_intent_record_needs_operator_focus/);
assert.match(consoleCheck.body, /directive_intent_not_recorded_from_shadow_read/);
assert.match(consoleCheck.body, /flightDeckFocusDirectiveIntent/);
assert.match(consoleCheck.body, /webhook_delay_directive_records/);
assert.match(consoleCheck.body, /webhook_delay_directive_record_count/);
assert.match(consoleCheck.body, /webhook-delay-directive-intent/);
assert.match(consoleCheck.body, /cloudflare_directive_dual_recorded/);
assert.match(consoleCheck.body, /focus_webhook_delay_directive_intent/);
assert.match(consoleCheck.body, /directive_intent_record_needs_operator_focus/);
assert.match(consoleCheck.body, /directive_intent_not_recorded_from_shadow_read/);
assert.match(consoleCheck.body, /flightDeckFocusDirectiveIntent/);
assert.match(consoleCheck.body, /Start Resident Dispatch/);
assert.match(consoleCheck.body, /startResidentDispatch/);
assert.match(consoleCheck.body, /startResidentDispatchFromWorkbench/);
assert.match(consoleCheck.body, /start_resident_dispatch/);
assert.match(consoleCheck.body, /cloudflare_primary_dispatch_not_recorded/);
assert.match(consoleCheck.body, /resident_dispatch\.primary_with_fallback\.start/);
assert.match(consoleCheck.body, /residentDispatchNavigator/);
assert.match(consoleCheck.body, /residentDispatchFocusDetail/);
assert.match(consoleCheck.body, /renderResidentDispatchNavigator/);
assert.match(consoleCheck.body, /residentDispatchFocusContext/);
assert.match(consoleCheck.body, /selectResidentDispatch/);
assert.match(consoleCheck.body, /focusResidentDispatch/);
assert.match(consoleCheck.body, /resident_dispatch_decisions/);
assert.match(consoleCheck.body, /resident_dispatch_decision_count/);
assert.match(consoleCheck.body, /Fallback Authority/);
assert.match(consoleCheck.body, /Fallback Status/);
assert.match(consoleCheck.body, /cloudflare_primary_dispatcher/);
assert.match(consoleCheck.body, /windows_fallback_dispatcher/);
assert.match(consoleCheck.body, /Mark Open/);
assert.match(consoleCheck.body, /Mark Done/);
assert.match(consoleCheck.body, /taskEvidencePredicate/);
assert.match(consoleCheck.body, /selectedTaskFromWorkbench/);
assert.match(consoleCheck.body, /selectTask/);
assert.match(consoleCheck.body, /updateFocusedTask/);
assert.match(consoleCheck.body, /\.task\.selected/);
assert.match(consoleCheck.body, /Update Task/);
assert.match(consoleCheck.body, /Auto Refresh/);
assert.match(consoleCheck.body, /narada\.cloudflare\.operationWorkbench\.v1/);
assert.match(consoleCheck.body, /loadWorkbenchState/);
assert.match(consoleCheck.body, /saveWorkbenchState/);
assert.match(consoleCheck.body, /console_action_failed/);
assert.match(consoleCheck.body, /appendConsoleEvidence/);
assert.match(consoleCheck.body, /operation\.read/);
assert.match(consoleCheck.body, /operation_product_surface/);
assert.match(consoleCheck.body, /Continuity Packets/);
assert.match(consoleCheck.body, /Continuity Loop Reports/);
assert.match(consoleCheck.body, /continuity_loop_reports/);
assert.match(consoleCheck.body, /loop_report/);
assert.match(consoleCheck.body, /Continuity Loop/);
assert.match(consoleCheck.body, /site:continuity:loop/);
assert.match(consoleCheck.body, /sync-cloudflare/);
assert.match(consoleCheck.body, /Authority Decisions/);
assert.match(consoleCheck.body, /renderAuthorityState/);
assert.match(consoleCheck.body, /authority-decision/);
assert.match(consoleCheck.body, /credentials: 'same-origin'/);
const consoleStructure = verifyOperatorConsoleStructure(consoleCheck.body, consoleScript);

const smoke = await runJsonCommand('live-carrier-smoke', [
  'node',
  'packages/cloudflare-carrier/scripts/cloudflare-carrier-live-smoke.mjs',
  '--url',
  workerUrl,
  '--token-file',
  tokenFile,
  '--site',
  siteId,
  '--operation',
  operationId,
  '--site-root',
  siteRef,
  '--expect-tool-effect-posture',
  expectToolEffectPosture,
]);
assert.equal(smoke.status, 'ok');
assert.equal(smoke.worker_url, workerUrl);
assert.equal(smoke.principal_id, 'service');
assert.equal(smoke.provider_adapter_posture, 'cloudflare-workers-ai');
assert.equal(smoke.tool_effect_posture, expectToolEffectPosture);

const siteRead = await postCarrier(workerUrl, bearerToken, {
  operation: 'site.read',
  request_id: `operator_check_site_read_${Date.now()}`,
  params: {
    site_id: siteId,
    carrier_event_limit: 20,
    session_limit: 10,
  },
});
assert.equal(siteRead.http_status, 200);
assert.equal(siteRead.body.ok, true);
assert.equal((siteRead.body.site?.site_id ?? siteRead.body.site_id), siteId);
assert.equal(siteRead.body.site_product_status?.schema, 'narada.cloudflare_site_product_status.v1');
assert.equal(siteRead.body.site_product_status?.site_id, siteId);
assert.equal(siteRead.body.site_product_status?.carrier_evidence_read_status?.schema, 'narada.cloudflare_carrier_evidence_read_status.v1');
assert.match(siteRead.body.site_product_status.carrier_evidence_read_status.state, /^(loaded|degraded|no_sessions)$/);
assert.match(siteRead.body.site_product_status.continuity_loop_state, /^(loop_report_observed|no_loop_report_observed)$/);
assert.equal(typeof siteRead.body.site_product_status.continuity_loop_report_count, 'number');
const memberships = siteRead.body.product?.memberships ?? siteRead.body.memberships ?? [];
const currentMembership = siteRead.body.product?.membership ?? siteRead.body.membership ?? null;
const operations = siteRead.body.product?.operations ?? siteRead.body.operations ?? [];
const siteAuthorityEvents = siteRead.body.product?.authority_events ?? siteRead.body.authority_events ?? [];
const siteAuthorityDecisions = siteRead.body.product?.site_authority?.decisions ?? siteRead.body.site_authority?.decisions ?? [];
assert.ok(Array.isArray(memberships));
assert.ok(memberships.length > 0);
assert.ok(Array.isArray(operations));

const siteList = await postCarrier(workerUrl, bearerToken, {
  operation: 'site.list',
  request_id: `operator_check_site_list_${Date.now()}`,
  params: {
    limit: 20,
    site_status_limit: 20,
  },
});
assert.equal(siteList.http_status, 200);
assert.equal(siteList.body.ok, true);
assert.ok(Array.isArray(siteList.body.sites));
assert.ok(siteList.body.sites.some((site) => site.site_id === siteId));
assert.ok(Array.isArray(siteList.body.site_product_statuses));
const focusedSiteProductStatus = siteList.body.site_product_statuses.find((status) => status.site_id === siteId) ?? null;
assert.ok(focusedSiteProductStatus);
assert.equal(focusedSiteProductStatus.schema, 'narada.cloudflare_site_product_status.v1');
assert.match(focusedSiteProductStatus.health, /^(ready|attention|incomplete)$/);
assert.equal(focusedSiteProductStatus.carrier_evidence_read_status?.schema, 'narada.cloudflare_carrier_evidence_read_status.v1');
assert.match(focusedSiteProductStatus.carrier_evidence_read_status.state, /^(loaded|degraded|no_sessions)$/);
assert.match(focusedSiteProductStatus.continuity_loop_state, /^(loop_report_observed|no_loop_report_observed)$/);
assert.equal(typeof focusedSiteProductStatus.continuity_loop_report_count, 'number');
assert.ok(Array.isArray(focusedSiteProductStatus.missing));
assert.ok(Array.isArray(focusedSiteProductStatus.attention));
assert.equal(siteList.body.site_product_overview?.schema, 'narada.cloudflare_site_product_overview.v1');
assert.equal(siteList.body.site_product_overview?.site_count, siteList.body.site_product_statuses.length);
assert.ok(siteList.body.site_product_overview.site_count >= 1);
assert.ok(siteList.body.site_product_overview.health_counts);
assert.ok(siteList.body.site_product_overview.action_counts);
assert.ok(siteList.body.site_product_overview.missing_counts);
assert.ok(siteList.body.site_product_overview.attention_counts);
assert.equal(typeof siteList.body.site_product_overview.next_reason, 'string');
assert.match(siteList.body.site_product_overview.next_action, /^(monitor_sites|active_membership|operation|session|carrier_evidence|continuity_packet|continuity_loop_report|open_tasks)$/);

const operationRead = await postCarrier(workerUrl, bearerToken, {
  operation: 'operation.read',
  request_id: `operator_check_operation_read_${Date.now()}`,
  params: {
    site_id: siteId,
    operation_id: operationId,
    carrier_event_limit: 20,
    session_limit: 10,
  },
});
assert.equal(operationRead.http_status, 200);
assert.equal(operationRead.body.ok, true);
assert.equal(operationRead.body.operation?.operation_id, operationId);
assert.equal(operationRead.body.operation?.site_id, siteId);
assert.equal(operationRead.body.operation?.status, 'active');
assert.equal(operationRead.body.sessions?.some((session) => session.carrier_session_id === smoke.carrier_session_id), true);
assert.equal(operationRead.body.tasks?.some((task) => task.carrier_session_id === smoke.carrier_session_id), true);
assert.equal(operationRead.body.carrier_evidence?.some((entry) => entry.carrier_session_id === smoke.carrier_session_id && entry.ok === true), true);
assert.equal(operationRead.body.carrier_evidence_read_status?.schema, 'narada.cloudflare_carrier_evidence_read_status.v1');
assert.match(operationRead.body.carrier_evidence_read_status.state, /^(loaded|degraded|no_sessions)$/);
assert.equal(operationRead.body.operation_product_surface?.operation_id, operationId);
assert.ok(operationRead.body.operation_product_surface?.session_count >= 1);
assert.ok(operationRead.body.operation_product_surface?.task_count >= 1);
assert.deepEqual(operationRead.body.operation_product_surface.carrier_evidence_read_status, operationRead.body.carrier_evidence_read_status);

const liveCommandStates = commandStatesForOperationProduct(operationRead.body, { session_id: smoke.carrier_session_id });
const focusedMembership = currentMembership ?? memberships[0] ?? null;
liveCommandStates.site = classifyCloudflareSiteCommandState({
  site_id: siteRead.body.site?.site_id ?? siteRead.body.site_id ?? siteId,
  scope_loaded: true,
  membership_count: memberships.length,
  operation_count: operations.length,
  authority_count: siteAuthorityEvents.length + siteAuthorityDecisions.length,
});
liveCommandStates.membership = classifyCloudflareMembershipCommandState({
  principal: focusedMembership?.principal_id || focusedMembership?.email || '',
  site_loaded: true,
  known: Boolean(focusedMembership),
  status: focusedMembership?.status || 'unknown',
  authority_loaded: siteAuthorityEvents.length > 0 || siteAuthorityDecisions.length > 0,
});
assert.match(liveCommandStates.site.next_action, /^(load_or_create_membership|create_or_select_operation|read_site_authority|inspect_site_operations)$/);
assert.match(liveCommandStates.membership.next_action, /^(put_membership|inspect_inactive_membership|focus_membership_authority|monitor_membership_authority)$/);
assert.match(liveCommandStates.operation.next_action, /^(inspect_operation_evidence|read_operation_evidence|start_or_select_session)$/);
assert.equal(liveCommandStates.session.next_action, 'inspect_session_evidence');
assert.match(liveCommandStates.task.next_action, /^(mark_done_or_update|reopen_or_inspect_evidence|normalize_status_or_update)$/);
assert.match(liveCommandStates.authority.next_action, /^(read_site_authority|inspect_refused_authority|resolve_authority_locus|monitor_authority_admissions|focus_authority_evidence)$/);
assert.match(liveCommandStates.evidence.next_action, /^(inspect_authority_locus|trace_input_lifecycle|inspect_tool_effect|inspect_failure_and_retry_or_escalate|inspect_provider_turn|resolve_or_acknowledge_directive|inspect_evidence_payload)$/);

const humanOperator = await checkHumanOperatorSession({
  workerUrl,
  siteId,
  operatorCookieFile,
  required: requireOperatorSession,
});

const continuityFirst = await runJsonCommand('site-continuity-loop:first', continuityCommand());
assert.equal(continuityFirst.status, 'ok');
assert.equal(continuityFirst.site_id, siteId);
assert.equal(continuityFirst.windows_packet_count, 1);

const continuitySecond = await runJsonCommand('site-continuity-loop:idempotent', continuityCommand());
assert.equal(continuitySecond.status, 'ok');
assert.equal(continuitySecond.windows_packet_count, 1);

const operationReadAfterContinuity = await postCarrier(workerUrl, bearerToken, {
  operation: 'operation.read',
  request_id: `operator_check_operation_continuity_read_${Date.now()}`,
  params: {
    site_id: siteId,
    operation_id: operationId,
    carrier_event_limit: 20,
    session_limit: 10,
  },
});
assert.equal(operationReadAfterContinuity.http_status, 200);
assert.equal(operationReadAfterContinuity.body.ok, true);
const operationSurface = operationReadAfterContinuity.body.operation_product_surface;
const operationContinuityPackets = operationReadAfterContinuity.body.site_continuity_packets ?? [];
const operationContinuityStatus = operationReadAfterContinuity.body.site_continuity_status;
const operationContinuityLoopReports = operationReadAfterContinuity.body.site_continuity_loop_reports ?? [];
const operationContinuityLoopStatus = operationReadAfterContinuity.body.site_continuity_loop_status;
const localCloudContinuityBridge = operationReadAfterContinuity.body.local_cloud_continuity_bridge;
const operationLifecycleStatus = operationReadAfterContinuity.body.operation_lifecycle_status;
assert.equal(operationSurface?.operation_id, operationId);
assert.ok(Array.isArray(operationContinuityPackets));
assert.ok(operationContinuityPackets.length >= 1);
assert.equal(operationSurface?.continuity_packet_count, operationContinuityPackets.length);
assert.equal(operationContinuityStatus?.schema, 'narada.cloudflare_site_continuity_status.v1');
assert.equal(operationContinuityStatus?.state, 'packet_observed');
assert.equal(operationContinuityStatus?.packet_count, operationContinuityPackets.length);
assert.equal(operationSurface?.continuity_status?.state, operationContinuityStatus.state);
assert.equal(operationContinuityLoopStatus?.schema, 'narada.cloudflare_site_continuity_loop_status.v1');
assert.equal(operationContinuityLoopStatus?.state, 'loop_report_observed');
assert.ok(operationContinuityLoopReports.length >= 1);
assert.equal(operationSurface?.continuity_loop_report_count, operationContinuityLoopReports.length);
assert.equal(operationSurface?.continuity_loop_status?.state, operationContinuityLoopStatus.state);
assert.equal(localCloudContinuityBridge?.schema, 'narada.local_cloud_continuity_bridge.v1');
assert.equal(localCloudContinuityBridge?.next_action, 'review_continuity_packet');
assert.equal(operationSurface?.local_cloud_continuity_bridge?.schema, localCloudContinuityBridge.schema);
assert.equal(operationLifecycleStatus?.schema, 'narada.cloudflare_operation_lifecycle_status.v1');
assert.equal(operationLifecycleStatus?.phase, 'inhabited');
assert.match(operationLifecycleStatus?.health, /^(ready|attention)$/);
assert.match(operationLifecycleStatus?.next_action, /^(monitor_operation|open_tasks|undelivered_directives)$/);
assert.equal(operationLifecycleStatus?.continuity_loop_state, 'loop_report_observed');
assert.ok((operationLifecycleStatus?.continuity_loop_report_count ?? 0) >= 1);
assert.equal(operationSurface?.lifecycle_status?.health, operationLifecycleStatus.health);
assert.equal(operationSurface?.lifecycle_status?.next_action, operationLifecycleStatus.next_action);

const microsoftLoginUrl = new URL('/auth/microsoft/login', withTrailingSlash(workerUrl)).toString();
const apiClientPath = new URL('/api/carrier', withTrailingSlash(workerUrl)).toString();
const report = {
  schema: 'narada.cloudflare_operator_check.v1',
  status: 'ok',
  generated_at: new Date().toISOString(),
  site_id: siteId,
  site_ref: siteRef,
  operation_id: operationId,
  worker_url: workerUrl,
  console_url: workerUrl,
  microsoft_login_url: microsoftLoginUrl,
  api_client_path: apiClientPath,
  credential_posture: {
    env_file_loaded: existsSync(envPath),
    url_source: option('--url') ? 'flag:--url' : 'env:CLOUDFLARE_CARRIER_URL',
    token_source: option('--token-file') ? 'flag:--token-file' : 'env:CLOUDFLARE_CARRIER_TOKEN_FILE',
    token_file_readable: true,
    operator_cookie_source: operatorCookieFile ? (option('--operator-cookie-file') ? 'flag:--operator-cookie-file' : 'env:CLOUDFLARE_OPERATOR_COOKIE_FILE') : null,
  },
  checks: {
    console_surface: 'ok',
    console_workbench_structure: 'ok',
    microsoft_login_surface: 'ok',
    live_carrier_smoke: 'ok',
    site_read: 'ok',
    site_product_status: 'ok',
    site_list_product_overview: 'ok',
    console_multi_site_surface: 'ok',
    console_continuity_loop_guidance: 'ok',
    local_cloud_continuity_bridge: 'ok',
    continuity_loop_report_status: 'ok',
    membership_visibility: 'ok',
    operation_read: 'ok',
    canonical_operation_active: 'ok',
    operation_inhabited_by_live_work: 'ok',
    operation_continuity_packets: 'ok',
    operation_continuity_status: 'ok',
    operation_lifecycle_status: 'ok',
    human_operator_session: humanOperator.status,
    human_operator_membership: humanOperator.membership_status,
    human_operator_operation_read: humanOperator.operation_status,
    continuity_loop: 'ok',
    continuity_idempotence: 'ok',
  },
  service_principal_ready: true,
  console_structure: consoleStructure,
  human_operator_login_ready: humanOperator.login_ready,
  human_operator_membership_ready: humanOperator.membership_ready,
  principal: {
    smoke_principal_id: smoke.principal_id,
    site_read_principal_id: siteRead.body.principal?.principal_id ?? siteRead.body.reader_principal?.principal_id ?? null,
    human_operator_principal_id: humanOperator.principal?.principal_id ?? null,
    human_operator_email: humanOperator.principal?.email ?? null,
  },
  membership: {
    count: memberships.length,
    current_role: currentMembership?.role ?? null,
  },
  sites: {
    count: siteList.body.sites.length,
    product_status_count: siteList.body.site_product_statuses.length,
    overview: siteList.body.site_product_overview,
    focused_site_status: focusedSiteProductStatus,
  },
  operation: {
    operation_id: operationRead.body.operation.operation_id,
    display_name: operationRead.body.operation.display_name,
    operation_kind: operationRead.body.operation.operation_kind,
    status: operationRead.body.operation.status,
    listed_on_site_read: operations.some((operation) => operation.operation_id === operationId),
    session_count: operationSurface.session_count,
    task_count: operationSurface.task_count,
    carrier_evidence_count: operationSurface.carrier_evidence_count,
    continuity_packet_count: operationSurface.continuity_packet_count,
    continuity_status: operationSurface.continuity_status,
    lifecycle_status: operationSurface.lifecycle_status,
    carrier_evidence_read_status: operationRead.body.carrier_evidence_read_status,
    smoke_session_bound: operationRead.body.sessions.some((session) => session.carrier_session_id === smoke.carrier_session_id),
  },
  command_states: liveCommandStates,
  carrier: {
    session_id: smoke.carrier_session_id,
    provider_adapter_posture: smoke.provider_adapter_posture,
    tool_effect_posture: smoke.tool_effect_posture,
    task_create_status: smoke.task_create_status,
    task_update_status: smoke.task_update_status,
    persisted_task_count: smoke.persisted_tasks?.length ?? 0,
  },
  continuity: {
    registry_path: registryPath,
    cloudflare_push_status: continuitySecond.cloudflare_push?.status ?? null,
    windows_packet_count: continuitySecond.windows_packet_count,
    windows_packet_ids: continuitySecond.windows_packets?.map((packet) => packet.packet_id) ?? [],
    authority_boundary: continuitySecond.authority_boundary,
  },
  enter: {
    console_url: workerUrl,
    microsoft_login_url: microsoftLoginUrl,
    operator_session_check: operatorCookieFile ? 'verified' : 'provide --operator-cookie-file to verify the current browser operator session',
    site_id: siteId,
    operation_id: operationId,
  },
};

stdout.write(`${JSON.stringify(report, null, 2)}\n`);

function continuityCommand() {
  return [
    'node',
    'scripts/site-continuity-loop.mjs',
    'sync-cloudflare',
    '--site',
    siteId,
    '--url',
    workerUrl,
    '--token-file',
    tokenFile,
    '--registry',
    registryPath,
  ];
}

function loadLocalEnv(pathUrl) {
  if (!existsSync(pathUrl)) return;
  const text = require('node:fs').readFileSync(pathUrl, 'utf8');
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const separator = trimmed.indexOf('=');
    if (separator < 0) continue;
    const key = trimmed.slice(0, separator).trim();
    const value = trimmed.slice(separator + 1).trim();
    if (key && process.env[key] === undefined) process.env[key] = unquoteEnvValue(value);
  }
}

async function writeLocalEnv({ workerUrl, tokenFile }) {
  if (!workerUrl) fail('cloudflare_operator_write_env_requires_url');
  if (!tokenFile) fail('cloudflare_operator_write_env_requires_token_file');
  const content = [
    `CLOUDFLARE_CARRIER_URL=${workerUrl}`,
    `CLOUDFLARE_CARRIER_TOKEN_FILE=${tokenFile}`,
    '',
  ].join('\n');
  await writeFile(envPath, content, 'utf8');
}

async function readableFileStat(path) {
  try {
    const info = await stat(path);
    return { ok: info.isFile(), size: info.size };
  } catch (error) {
    return { ok: false, error: error.message };
  }
}

async function readConsole(baseUrl) {
  const response = await fetch(baseUrl);
  return {
    http_status: response.status,
    body: await response.text(),
  };
}

function verifyOperatorConsoleStructure(html, script) {
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
  const idSet = new Set(ids);
  const duplicateIds = ids.filter((id, index) => ids.indexOf(id) !== index);
  assert.deepEqual([...new Set(duplicateIds)], [], 'operator console must not render duplicate static ids');

  const panels = [
    ['Control Room', 'controlRoomActionSummary'],
    ['Operation Control Board', 'operationControlBoard'],
    ['Focused Control Target', 'operationControlTarget'],
    ['Operator Route', 'operatorRoute'],
    ['Workbench Readiness Gate', 'workbenchReadinessGate'],
    ['Operation Navigator', 'operationNavigator'],
    ['Operation Work Queue', 'operationWorkQueue'],
    ['Session Navigator', 'sessionNavigator'],
    ['Session Work Queue', 'sessionWorkQueue'],
    ['Session Evidence Control', 'sessionEvidenceControl'],
    ['Task State', 'taskWorkQueue'],
    ['Task Lifecycle Control', 'taskLifecycleControl'],
    ['Evidence Review Queue', 'evidenceReviewQueue'],
    ['Authority State', 'authorityState'],
    ['Authority Decision Control', 'authorityDecisionControl'],
    ['Authority Decision Queue', 'authorityDecisionQueue'],
    ['Site Continuity', 'continuityNavigator'],
  ];
  for (const [heading, targetId] of panels) {
    assert.match(html, new RegExp(escapeRegExp(heading)), `operator console panel missing: ${heading}`);
    assert.ok(idSet.has(targetId), `operator console panel target missing: ${targetId}`);
  }

  const actions = [
    ['controlRoomNextAction', 'applyControlRoomNextAction'],
    ['operationControlBoardNextAction', 'applyControlRoomNextAction'],
    ['operationControlBoardReadinessAction', 'applyWorkbenchReadinessNextAction'],
    ['operationControlBoardEvidenceAction', 'focusFlightDeckEvidence'],
    ['operationControlTargetNextAction', 'applyControlRoomNextAction'],
    ['operationControlTargetEvidenceAction', 'focusFlightDeckEvidence'],
    ['operationControlTargetReadinessAction', 'applyWorkbenchReadinessNextAction'],
    ['operatorRouteNextAction', 'applyOperatorRouteNextAction'],
    ['workbenchReadinessNextAction', 'applyWorkbenchReadinessNextAction'],
    ['operationActionUseOperation', 'useFocusedOperation'],
    ['operationActionReadOperation', 'refreshOperation'],
    ['operationActionFocusSession', 'focusOperationSession'],
    ['sessionActionUseSession', 'useFocusedSession'],
    ['sessionActionReadEvidence', 'readSelectedSessionEvidence'],
    ['sessionActionFocusEvidence', 'focusFocusedSessionEvidence'],
    ['sessionEvidenceApplyAction', 'applySessionEvidenceAction'],
    ['sessionEvidenceFocusAction', 'focusSessionPathEvidence'],
    ['sessionEvidenceTaskAction', 'focusSessionPathTask'],
    ['authorityNextAction', 'applyAuthorityNextAction'],
    ['authorityReadSiteAction', 'refreshSiteProduct'],
    ['authorityActionEvidenceAction', 'focusAuthorityEvidence'],
    ['authorityDecisionApplyAction', 'applyAuthorityDecisionReview'],
    ['authorityDecisionEvidenceAction', 'focusAuthorityEvidence'],
    ['authorityDecisionRefreshAction', 'refreshAuthorityPath'],
    ['taskLifecycleApplyAction', 'applyTaskLifecycleAction'],
    ['taskLifecycleEvidenceAction', 'focusTaskPathEvidence'],
    ['taskLifecycleSessionAction', 'focusTaskPathSession'],
    ['continuityWorkflowNextAction', 'applyContinuityWorkflowNextStep'],
    ['taskFromAttention', 'createTaskFromFocusedAttention'],
    ['taskFromDirectiveIntent', 'createTaskFromFocusedDirectiveIntent'],
  ];
  for (const [buttonId, handler] of actions) {
    assert.ok(idSet.has(buttonId), `operator console action button missing: ${buttonId}`);
    assert.ok(script.includes(handler), `operator console action handler missing: ${handler}`);
    assert.ok(script.includes(`el('${buttonId}').addEventListener`), `operator console action not wired: ${buttonId}`);
    assert.match(
      script,
      new RegExp(`el\\('${escapeRegExp(buttonId)}'\\)\\.addEventListener\\('click',[^;]*${escapeRegExp(handler)}`),
      `operator console action listener does not reference handler: ${buttonId} -> ${handler}`,
    );
  }

  const renderers = [
    'renderOperationControlBoard',
    'renderOperatorRoute',
    'renderWorkbenchReadinessGate',
    'renderOperationWorkQueue',
    'renderSessionWorkQueue',
    'renderSessionEvidenceControl',
    'renderTaskWorkQueue',
    'renderTaskLifecycleControl',
    'renderEvidenceReviewQueue',
    'renderAuthorityDecisionControl',
    'renderAuthorityDecisionQueue',
  ];
  for (const renderer of renderers) {
    assert.ok(script.includes(`function ${renderer}`), `operator console renderer missing: ${renderer}`);
  }

  const readinessKeys = [
    'operator_identity_ready',
    'membership_authority_ready',
    'operation_scope_ready',
    'session_navigation_ready',
    'evidence_inspection_ready',
    'task_lifecycle_ready',
    'authority_state_ready',
    'continuity_posture_ready',
    'next_control_action_ready',
  ];
  for (const key of readinessKeys) {
    assert.ok(script.includes(key), `operator console readiness key missing: ${key}`);
  }

  const elReferenceIds = [...new Set([...script.matchAll(/\bel\('([^']+)'\)/g)].map((match) => match[1]))].sort();
  const missingElTargets = elReferenceIds.filter((id) => !idSet.has(id));
  assert.deepEqual(missingElTargets, [], 'operator console script references missing DOM ids');

  return {
    panel_count: panels.length,
    action_count: actions.length,
    el_reference_count: elReferenceIds.length,
    readiness_key_count: readinessKeys.length,
    renderer_count: renderers.length,
  };
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function postCarrier(baseUrl, token, body) {
  const response = await fetch(new URL('/api/carrier', withTrailingSlash(baseUrl)), {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = { raw: text };
  }
  return { http_status: response.status, body: parsed };
}

function commandStatesForOperationProduct(product = {}, focus = {}) {
  const sessions = product.sessions ?? [];
  const tasks = product.tasks ?? [];
  const evidenceGroups = product.carrier_evidence ?? [];
  const authorityDecisions = product.site_authority?.decisions ?? [];
  const focusSessionId = focus.session_id || sessions[0]?.carrier_session_id || '';
  const focusSession = sessions.find((session) => session.carrier_session_id === focusSessionId) || sessions[0] || null;
  const focusEvidence = evidenceGroups.find((entry) => entry.carrier_session_id === focusSessionId) || evidenceGroups[0] || null;
  const evidenceEvents = focusEvidence?.events ?? [];
  const focusTask = tasks.find((task) => task.carrier_session_id === focusSessionId) || tasks[0] || null;
  const taskEvidenceCount = focusTask
    ? evidenceEvents.filter((event) => JSON.stringify(event.payload || {}).includes(focusTask.task_id)).length
    : 0;
  const hasOperationEvidence = evidenceGroups.some((entry) => (entry.events || []).length > 0);
  const openTasks = tasks.filter((task) => ['open', 'todo', 'pending'].includes(String(task.status || '').toLowerCase()));
  const operationPathNextAction = sessions.length === 0 ? 'start_or_select_session'
    : openTasks.length > 0 ? 'inspect_open_task'
    : hasOperationEvidence ? 'inspect_operation_evidence' : 'read_operation_evidence';
  const authorityEvents = product.authority_events ?? [];
  const evidenceEvent = evidenceEvents[0] || (product.carrier_evidence || []).flatMap((entry) => entry.events || [])[0] || {};
  return {
    operation: classifyCloudflareOperationCommandState({
      operation_id: product.operation?.operation_id || '',
      is_active: true,
      scope_loaded: Boolean(product.operation?.operation_id),
      session_count: sessions.length,
      evidence_loaded: hasOperationEvidence,
      operation_path_next_action: operationPathNextAction,
    }),
    session: classifyCloudflareSessionCommandState({
      session_id: focusSession?.carrier_session_id || '',
      is_active: true,
      evidence_loaded: evidenceEvents.length > 0,
    }),
    task: classifyCloudflareTaskCommandState({
      task_id: focusTask?.task_id || '',
      status: focusTask?.status || '',
      evidence_count: taskEvidenceCount,
    }),
    authority: classifyCloudflareAuthorityCommandState({
      decision_count: authorityDecisions.length,
      refusal_count: authorityDecisions.filter((decision) => ['refuse', 'deny'].includes(String(decision.action || '').toLowerCase())).length,
      unresolved_locus_count: authorityDecisions.filter((decision) => !decision.authority_locus || decision.authority_locus === 'unresolved').length,
      evidence_loaded: authorityEvents.length > 0,
    }),
    evidence: classifyCloudflareEvidenceCommandState(evidenceEvent),
  };
}

async function checkHumanOperatorSession({ workerUrl, siteId, operatorCookieFile, required }) {
  if (!operatorCookieFile) {
    if (required) fail('cloudflare_operator_check_requires_--operator-cookie-file');
    return {
      status: 'not_checked',
      membership_status: 'not_checked',
      operation_status: 'not_checked',
      login_ready: 'surface_only',
      membership_ready: 'not_checked',
      principal: null,
      membership: null,
    };
  }
  const cookieStat = await readableFileStat(operatorCookieFile);
  if (!cookieStat.ok) fail('cloudflare_operator_cookie_file_unreadable', { operator_cookie_file: operatorCookieFile, error: cookieStat.error });
  const cookieHeader = normalizeCookieHeader(await readFile(operatorCookieFile, 'utf8'));
  if (!cookieHeader) fail('cloudflare_operator_cookie_file_empty', { operator_cookie_file: operatorCookieFile });

  const session = await getOperatorSession(workerUrl, cookieHeader);
  if (session.http_status === 401 && !required) {
    return {
      status: 'unauthenticated',
      membership_status: 'not_checked',
      operation_status: 'not_checked',
      login_ready: false,
      membership_ready: false,
      principal: null,
      membership: null,
    };
  }
  assert.equal(session.http_status, 200);
  assert.equal(session.body.ok, true);
  assert.equal(session.body.principal?.auth_type, 'microsoft_oidc');

  const siteReadAsOperator = await postCarrierWithCookie(workerUrl, cookieHeader, {
    operation: 'site.read',
    request_id: `operator_check_human_site_read_${Date.now()}`,
    params: {
      site_id: siteId,
      carrier_event_limit: 10,
      session_limit: 5,
    },
  });
  assert.equal(siteReadAsOperator.http_status, 200);
  assert.equal(siteReadAsOperator.body.ok, true);
  const humanMembership = siteReadAsOperator.body.product?.membership ?? siteReadAsOperator.body.membership ?? null;
  assert.ok(humanMembership);
  assert.equal(humanMembership.status, 'active');

  const operationReadAsOperator = await postCarrierWithCookie(workerUrl, cookieHeader, {
    operation: 'operation.read',
    request_id: `operator_check_human_operation_read_${Date.now()}`,
    params: {
      site_id: siteId,
      operation_id: operationId,
      carrier_event_limit: 10,
      session_limit: 5,
    },
  });
  assert.equal(operationReadAsOperator.http_status, 200);
  assert.equal(operationReadAsOperator.body.ok, true);
  assert.equal(operationReadAsOperator.body.operation?.operation_id, operationId);
  assert.equal(operationReadAsOperator.body.operation?.status, 'active');
  assert.ok(operationReadAsOperator.body.operation_product_surface?.session_count >= 1);
  return {
    status: 'ok',
    membership_status: 'ok',
    operation_status: 'ok',
    login_ready: true,
    membership_ready: true,
    principal: session.body.principal,
    membership: humanMembership,
  };
}

async function getOperatorSession(baseUrl, cookieHeader) {
  const response = await fetch(new URL('/auth/session', withTrailingSlash(baseUrl)), {
    headers: { cookie: cookieHeader },
  });
  const text = await response.text();
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = { raw: text };
  }
  return { http_status: response.status, body: parsed };
}

async function postCarrierWithCookie(baseUrl, cookieHeader, body) {
  const response = await fetch(new URL('/api/carrier', withTrailingSlash(baseUrl)), {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      cookie: cookieHeader,
    },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = { raw: text };
  }
  return { http_status: response.status, body: parsed };
}

function normalizeCookieHeader(value) {
  const trimmed = String(value ?? '').trim();
  if (!trimmed) return '';
  if (/^cookie\s*:/i.test(trimmed)) return trimmed.replace(/^cookie\s*:/i, '').trim();
  if (trimmed.includes('narada_operator_session=')) return trimmed.split(/\r?\n/).find((line) => line.includes('narada_operator_session='))?.trim() ?? '';
  return `narada_operator_session=${trimmed}`;
}

async function runJsonCommand(label, command) {
  stderr.write(`[cloudflare:operator:check] ${label}\n`);
  const result = await spawnCapture(command[0], command.slice(1));
  if (result.code !== 0) {
    fail('cloudflare_operator_check_command_failed', {
      label,
      exit_code: result.code,
      stderr: tail(result.stderr),
      stdout: tail(result.stdout),
    });
  }
  try {
    return parseJsonObject(result.stdout);
  } catch (error) {
    fail('cloudflare_operator_check_command_json_parse_failed', {
      label,
      error: error.message,
      stdout: tail(result.stdout),
    });
  }
}

function spawnCapture(command, commandArgs) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, commandArgs, {
      cwd: fileURLToPath(repoRoot),
      shell: process.platform === 'win32',
      env: process.env,
      windowsHide: true,
    });
    let childStdout = '';
    let childStderr = '';
    child.stdout.on('data', (chunk) => {
      childStdout += chunk;
    });
    child.stderr.on('data', (chunk) => {
      childStderr += chunk;
    });
    child.on('error', reject);
    child.on('close', (code) => resolve({ code, stdout: childStdout, stderr: childStderr }));
  });
}

function parseJsonObject(output) {
  const start = output.indexOf('{');
  const end = output.lastIndexOf('}');
  if (start < 0 || end < start) throw new Error('json_object_not_found');
  return JSON.parse(output.slice(start, end + 1));
}

function tail(value, length = 1200) {
  return String(value ?? '').slice(-length);
}

function option(name) {
  const index = args.indexOf(name);
  if (index < 0) return null;
  return args[index + 1] ?? null;
}

function flag(name) {
  return args.includes(name);
}

function trimTrailingSlash(value) {
  return String(value).replace(/\/+$/, '');
}

function withTrailingSlash(value) {
  return String(value).endsWith('/') ? value : `${value}/`;
}

function unquoteEnvValue(value) {
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }
  return value;
}

function fail(code, detail = {}) {
  stderr.write(`${JSON.stringify({ ok: false, code, ...detail }, null, 2)}\n`);
  process.exit(1);
}

function printHelp() {
  stdout.write(`Narada Cloudflare operator check\n\nCommand:\n  pnpm cloudflare:operator:check [--site <site_id>]\n\nConfiguration:\n  --url <worker-url> or CLOUDFLARE_CARRIER_URL\n  --token-file <path> or CLOUDFLARE_CARRIER_TOKEN_FILE\n  --operator-cookie-file <path> or CLOUDFLARE_OPERATOR_COOKIE_FILE\n  --operation <operation_id> or CLOUDFLARE_CARRIER_OPERATION_ID\n  --require-operator-session fails when no operator cookie file is supplied\n  --registry <registry.db> or NARADA_SITE_CONTINUITY_REGISTRY\n  --write-env writes --url and --token-file into the ignored root .env file\n\nEffect:\n  Loads the ignored root .env file.\n  Verifies the console and Microsoft login surface.\n  Optionally verifies the current Microsoft operator session, site membership, and Operation visibility from a browser cookie file.\n  Runs the live carrier smoke through Workers AI and Cloudflare task effects.\n  Reads site membership/product state and the canonical active Operation from the live Worker.\n  Runs the Windows/Cloudflare continuity loop twice to prove idempotent packet exchange.\n  Emits one JSON readiness report with console and login URLs, without printing token material.\n`);
}
