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
assert.match(consoleCheck.body, /sitePostureRouteStage/);
assert.match(consoleCheck.body, /site_posture/);
assert.match(consoleCheck.body, /focus_next_site/);
assert.match(consoleCheck.body, /operationPostureRouteStage/);
assert.match(consoleCheck.body, /operation_posture/);
assert.match(consoleCheck.body, /focus_next_operation/);
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
assert.match(consoleCheck.body, /next_site_action/);
assert.match(consoleCheck.body, /next_site_reason/);
assert.match(consoleCheck.body, /next_operation_action/);
assert.match(consoleCheck.body, /next_operation_reason/);
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
assert.match(consoleCheck.body, /operationPostureNextAction/);
assert.match(consoleCheck.body, /Focus Next Operation/);
assert.match(consoleCheck.body, /nextOperationFromPosture/);
assert.match(consoleCheck.body, /focusNextOperationFromPosture/);
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

const projectionWriteSmoke = await runJsonCommand('task-lifecycle-projection-write-smoke:live', [
  'node',
  'packages/cloudflare-carrier/scripts/cloudflare-carrier-task-lifecycle-projection-write-live-smoke.mjs',
  '--url',
  workerUrl,
  '--token-file',
  tokenFile,
  '--site',
  siteId,
  '--operation',
  operationId,
]);
assert.equal(projectionWriteSmoke.status, 'ok');
assert.equal(projectionWriteSmoke.worker_url, workerUrl);
assert.equal(projectionWriteSmoke.site_id, siteId);
assert.equal(projectionWriteSmoke.operation_id, operationId);
assert.equal(projectionWriteSmoke.mutation_authority, 'cloudflare_task_lifecycle_d1');
assert.equal(projectionWriteSmoke.cloudflare_write_admission, 'admitted');
assert.equal(projectionWriteSmoke.write_effect, 'task_lifecycle_projection_write');
assert.equal(projectionWriteSmoke.sqlite_mutation_admission, 'not_admitted');
assert.equal(projectionWriteSmoke.filesystem_mutation_admission, 'not_admitted');
assert.equal(projectionWriteSmoke.repository_publication_admission, 'not_admitted');
assert.ok(new Set([
  'task_create_claim_report_finish_changed_file_evidence_and_projection_write_cloudflare_remaining_windows',
  'task_create_claim_report_finish_changed_file_evidence_projection_write_and_source_state_cloudflare_remaining_windows_effects',
  'task_create_claim_report_finish_changed_file_evidence_projection_write_source_state_and_assignment_cloudflare_remaining_windows_effects',
  'task_create_claim_report_finish_changed_file_evidence_projection_write_source_state_assignment_and_role_resolution_cloudflare_remaining_windows_effects',
]).has(projectionWriteSmoke.authority_partition), `unexpected projection write smoke authority partition: ${projectionWriteSmoke.authority_partition}`);

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
assert.match(siteRead.body.site_product_status.carrier_evidence_read_status.state, /^(loaded|partial|degraded|no_sessions)$/);
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
    focused_site_id: siteId,
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
assert.match(focusedSiteProductStatus.carrier_evidence_read_status.state, /^(loaded|partial|degraded|no_sessions)$/);
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
const expectedSiteOverview = expectedSiteProductOverview(siteList.body.site_product_statuses);
assert.deepEqual(siteList.body.site_product_overview.health_counts, expectedSiteOverview.health_counts);
assert.deepEqual(siteList.body.site_product_overview.action_counts, expectedSiteOverview.action_counts);
assert.deepEqual(siteList.body.site_product_overview.missing_counts, expectedSiteOverview.missing_counts);
assert.deepEqual(siteList.body.site_product_overview.attention_counts, expectedSiteOverview.attention_counts);
assert.equal(siteList.body.site_product_overview.next_site_id, expectedSiteOverview.next_site_id);
assert.equal(siteList.body.site_product_overview.next_health, expectedSiteOverview.next_health);
assert.equal(siteList.body.site_product_overview.next_action, expectedSiteOverview.next_action);
assert.equal(siteList.body.site_product_overview.next_reason, expectedSiteOverview.next_reason);
const sitePostureRoute = sitePostureRouteInvariant(siteList.body.site_product_overview, siteId);
assert.deepEqual(siteList.body.site_posture_route, sitePostureRoute);
assert.match(sitePostureRoute.command_state, /^(site_posture_ready|site_posture_attention)$/);
assert.match(sitePostureRoute.next_action, /^(monitor_sites|focus_next_site)$/);
if (sitePostureRoute.status === 'needs_attention') {
  assert.notEqual(sitePostureRoute.target, siteId);
  assert.ok(siteList.body.site_product_statuses.some((status) => status.site_id === sitePostureRoute.target));
} else {
  assert.notEqual(sitePostureRoute.next_action, 'focus_next_site');
}

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
assert.match(operationRead.body.carrier_evidence_read_status.state, /^(loaded|partial|degraded|no_sessions)$/);
assert.equal(operationRead.body.operation_product_surface?.operation_id, operationId);
assert.ok(operationRead.body.operation_product_surface?.session_count >= 1);
assert.ok(operationRead.body.operation_product_surface?.task_count >= 1);
assert.deepEqual(operationRead.body.operation_product_surface.carrier_evidence_read_status, operationRead.body.carrier_evidence_read_status);
assert.ok(Array.isArray(operationRead.body.operations));
assert.ok(operationRead.body.operations.some((operation) => operation.operation_id === operationId));

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
const expectedOperationPosture = expectedOperationPostureOverview(operationRead.body.operations, operationRead.body, { activeOperationId: operationId, siteId });
const operationPostureOverview = operationRead.body.operation_posture_overview;
assert.equal(operationPostureOverview.schema, 'narada.cloudflare_operation_posture_overview.v1');
assert.deepEqual(operationPostureOverview, expectedOperationPosture);
assert.deepEqual(operationRead.body.operation_product_surface.operation_posture_overview, operationPostureOverview);
assert.equal(operationPostureOverview.operation_count, operationRead.body.operations.length);
assert.ok(operationPostureOverview.operation_count >= 1);
assert.ok(operationPostureOverview.health_counts);
assert.ok(operationPostureOverview.action_counts);
assert.ok(operationPostureOverview.reason_counts);
assert.ok(operationPostureOverview.command_state_counts);
assert.equal(operationPostureOverview.active_operation_id, operationId);
assert.match(operationPostureOverview.next_status, /^(ready|needs_attention)$/);
assert.match(operationPostureOverview.next_action, /^(select_or_create_operation|use_focused_operation|read_operation_scope|start_or_select_session|inspect_operation_evidence|read_operation_evidence)$/);
const operationPostureRoute = operationPostureRouteInvariant(operationPostureOverview, operationId);
assert.deepEqual(operationRead.body.operation_posture_route, operationPostureRoute);
assert.deepEqual(operationRead.body.operation_product_surface.operation_posture_route, operationPostureRoute);
assert.match(operationPostureRoute.command_state, /^(operation_posture_ready|operation_posture_attention)$/);
assert.match(operationPostureRoute.next_action, /^(monitor_operations|focus_next_operation)$/);
if (operationPostureRoute.status === 'needs_attention') {
  assert.notEqual(operationPostureRoute.target, operationId);
  assert.ok(operations.some((operation) => operation.operation_id === operationPostureRoute.target));
} else {
  assert.notEqual(operationPostureRoute.next_action, 'focus_next_operation');
}

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

const taskLifecycleWriteAdmission = await postCarrier(workerUrl, bearerToken, {
  operation: 'task_lifecycle.write_admission.classify',
  request_id: `operator_check_task_lifecycle_write_admission_${Date.now()}`,
  params: {
    site_id: siteId,
    admission_id: `operator_check_task_lifecycle_write_admission_${operationId}`,
    mutation_class: 'task_finish',
  },
});
assert.equal(taskLifecycleWriteAdmission.http_status, 200);
assert.equal(taskLifecycleWriteAdmission.body.ok, true);
assert.equal(taskLifecycleWriteAdmission.body.schema, 'narada.sonar.cloudflare_task_lifecycle_write_admission.v1');
assert.equal(taskLifecycleWriteAdmission.body.decision?.schema, 'narada.sonar.cloudflare_task_lifecycle_write_admission_decision.v1');
assert.equal(taskLifecycleWriteAdmission.body.decision?.action, 'refuse');
assert.equal(taskLifecycleWriteAdmission.body.decision?.reason, 'windows_task_lifecycle_mutation_authority_retained');
assert.equal(taskLifecycleWriteAdmission.body.mutation_authority, 'windows_task_lifecycle_sqlite');
assert.equal(taskLifecycleWriteAdmission.body.cloudflare_write_admission, 'not_admitted');
assert.equal(taskLifecycleWriteAdmission.body.write_effect, 'none');

const taskLifecycleSourceStateWriteAdmission = await postCarrier(workerUrl, bearerToken, {
  operation: 'task_lifecycle.write_admission.classify',
  request_id: `operator_check_task_lifecycle_source_state_write_admission_${Date.now()}`,
  params: {
    site_id: siteId,
    admission_id: `operator_check_task_lifecycle_source_state_write_admission_${operationId}`,
    mutation_class: 'task_source_state_write',
  },
});
assert.equal(taskLifecycleSourceStateWriteAdmission.http_status, 200);
assert.equal(taskLifecycleSourceStateWriteAdmission.body.ok, true);
assert.equal(taskLifecycleSourceStateWriteAdmission.body.decision?.action, 'refuse');
assert.equal(taskLifecycleSourceStateWriteAdmission.body.decision?.reason, 'windows_task_lifecycle_mutation_authority_retained');
assert.equal(taskLifecycleSourceStateWriteAdmission.body.mutation_authority, 'windows_task_lifecycle_sqlite');
assert.equal(taskLifecycleSourceStateWriteAdmission.body.cloudflare_write_admission, 'not_admitted');
assert.equal(taskLifecycleSourceStateWriteAdmission.body.write_effect, 'none');

const taskLifecycleAssignmentWriteSmoke = await runJsonCommand('task-lifecycle-assignment-write-smoke:live', [
  'node',
  'packages/cloudflare-carrier/scripts/cloudflare-carrier-task-lifecycle-assignment-write-live-smoke.mjs',
  '--url',
  workerUrl,
  '--token-file',
  tokenFile,
  '--site',
  siteId,
  '--operation',
  operationId,
]);
assert.equal(taskLifecycleAssignmentWriteSmoke.status, 'ok');
assert.equal(taskLifecycleAssignmentWriteSmoke.worker_url, workerUrl);
assert.equal(taskLifecycleAssignmentWriteSmoke.site_id, siteId);
assert.equal(taskLifecycleAssignmentWriteSmoke.operation_id, operationId);
assert.equal(taskLifecycleAssignmentWriteSmoke.mutation_authority, 'cloudflare_task_lifecycle_d1');
assert.equal(taskLifecycleAssignmentWriteSmoke.cloudflare_write_admission, 'admitted');
assert.equal(taskLifecycleAssignmentWriteSmoke.write_effect, 'task_lifecycle_assignment_write');
assert.equal(taskLifecycleAssignmentWriteSmoke.assignment_authority_admission, 'admitted');
assert.equal(taskLifecycleAssignmentWriteSmoke.roster_mutation_admission, 'not_admitted');
assert.equal(taskLifecycleAssignmentWriteSmoke.role_resolution_authority_admission, 'not_admitted');
assert.equal(taskLifecycleAssignmentWriteSmoke.mailbox_mutation_admission, 'not_admitted');
assert.equal(taskLifecycleAssignmentWriteSmoke.filesystem_mutation_admission, 'not_admitted');
assert.equal(taskLifecycleAssignmentWriteSmoke.repository_publication_admission, 'not_admitted');
assert.equal(taskLifecycleAssignmentWriteSmoke.task_lifecycle_assignment_write_count, 1);
assert.ok(new Set([
  'task_create_claim_report_finish_changed_file_evidence_projection_write_source_state_and_assignment_cloudflare_remaining_windows_effects',
  'task_create_claim_report_finish_changed_file_evidence_projection_write_source_state_assignment_and_role_resolution_cloudflare_remaining_windows_effects',
]).has(taskLifecycleAssignmentWriteSmoke.authority_partition), `unexpected assignment write smoke authority partition: ${taskLifecycleAssignmentWriteSmoke.authority_partition}`);

const taskLifecycleRoleResolutionWriteSmoke = await runJsonCommand('task-lifecycle-role-resolution-write-smoke:live', [
  'node',
  'packages/cloudflare-carrier/scripts/cloudflare-carrier-task-lifecycle-role-resolution-write-live-smoke.mjs',
  '--url',
  workerUrl,
  '--token-file',
  tokenFile,
  '--site',
  siteId,
  '--operation',
  operationId,
]);
assert.equal(taskLifecycleRoleResolutionWriteSmoke.status, 'ok');
assert.equal(taskLifecycleRoleResolutionWriteSmoke.worker_url, workerUrl);
assert.equal(taskLifecycleRoleResolutionWriteSmoke.site_id, siteId);
assert.equal(taskLifecycleRoleResolutionWriteSmoke.operation_id, operationId);
assert.equal(taskLifecycleRoleResolutionWriteSmoke.mutation_authority, 'cloudflare_task_lifecycle_d1');
assert.equal(taskLifecycleRoleResolutionWriteSmoke.cloudflare_write_admission, 'admitted');
assert.equal(taskLifecycleRoleResolutionWriteSmoke.write_effect, 'task_lifecycle_role_resolution_write');
assert.equal(taskLifecycleRoleResolutionWriteSmoke.role_resolution_authority_admission, 'admitted');
assert.equal(taskLifecycleRoleResolutionWriteSmoke.roster_read_admission, 'admitted');
assert.equal(taskLifecycleRoleResolutionWriteSmoke.roster_mutation_admission, 'not_admitted');
assert.equal(taskLifecycleRoleResolutionWriteSmoke.mailbox_mutation_admission, 'not_admitted');
assert.equal(taskLifecycleRoleResolutionWriteSmoke.filesystem_mutation_admission, 'not_admitted');
assert.equal(taskLifecycleRoleResolutionWriteSmoke.repository_publication_admission, 'not_admitted');
assert.ok(taskLifecycleRoleResolutionWriteSmoke.task_lifecycle_role_resolution_write_count >= 1);
assert.equal(taskLifecycleRoleResolutionWriteSmoke.authority_partition, 'task_create_claim_report_finish_changed_file_evidence_projection_write_source_state_assignment_and_role_resolution_cloudflare_remaining_windows_effects');

const residentDispatch = await postCarrier(workerUrl, bearerToken, {
  operation: 'resident_dispatch.primary_with_fallback.start',
  request_id: `operator_check_resident_dispatch_${Date.now()}`,
  params: {
    site_id: siteId,
    operation_id: operationId,
    carrier_session_id: `carrier_session_operator_check_dispatch_${Date.now()}`,
    dispatch_decision_id: `operator_check_resident_dispatch_${operationId}`,
    agent_id: 'narada.operator-check.dispatch',
    site_root: `cloudflare://${siteId}`,
    site_ref: siteRef,
    windows_fallback_ref: 'windows_local_site_resident_loop',
  },
});
assert.equal(residentDispatch.http_status, 200);
assert.equal(residentDispatch.body.ok, true);
assert.equal(residentDispatch.body.schema, 'narada.sonar.cloudflare_resident_dispatch_primary_with_windows_fallback.v1');
assert.equal(residentDispatch.body.status, 'cloudflare_primary_started');
assert.equal(residentDispatch.body.operation_id, operationId);
assert.equal(residentDispatch.body.dispatch_authority, 'cloudflare_primary_dispatcher');
assert.equal(residentDispatch.body.fallback_authority, 'windows_fallback_dispatcher');
assert.equal(residentDispatch.body.fallback_status, 'available');
assert.equal(residentDispatch.body.dispatch_action, 'cloudflare_session_start');
assert.equal(residentDispatch.body.session_start?.event?.event_kind, 'carrier_session_started');

const residentLoopShadow = await postCarrier(workerUrl, bearerToken, {
  operation: 'resident_loop.shadow_read.record',
  request_id: `operator_check_resident_loop_shadow_${Date.now()}`,
  params: {
    site_id: siteId,
    loop_run_id: `operator_check_resident_loop_shadow_${operationId}`,
    source_summary_path: '.ai/operator-attention/operator-check-resident-loop-shadow.json',
    loop_run: {
      operation_id: operationId,
      run_started_at: new Date().toISOString(),
      run_finished_at: new Date().toISOString(),
      status: 'operator_check_shadow_recorded',
      steps: [{ step_id: 'operator_check_resident_loop_shadow', status: 'ok' }],
      operator_attention: [{ attention_id: 'operator_check_resident_loop_shadow', severity: 'info' }],
    },
  },
});
assert.equal(residentLoopShadow.http_status, 200);
assert.equal(residentLoopShadow.body.ok, true);
assert.equal(residentLoopShadow.body.schema, 'narada.sonar.cloudflare_resident_loop_shadow_read.v1');
assert.equal(residentLoopShadow.body.status, 'recorded');
assert.equal(residentLoopShadow.body.shadow_mode, 'cloudflare_shadow_read');
assert.equal(residentLoopShadow.body.dispatch_authority, 'windows_primary_dispatcher');
assert.equal(residentLoopShadow.body.dispatch_action, 'none');
assert.equal(residentLoopShadow.body.loop_run?.operation_id, operationId);
assert.equal(residentLoopShadow.body.loop_run?.step_count, 1);
assert.equal(residentLoopShadow.body.loop_run?.operator_attention_count, 1);

const webhookDelayDirectiveDeliverySuffix = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
const webhookDelayDirectiveDelivery = await postCarrier(workerUrl, bearerToken, {
  operation: 'webhook_delay.directive.primary_with_fallback.deliver',
  request_id: `operator_check_webhook_delay_directive_delivery_${webhookDelayDirectiveDeliverySuffix}`,
  params: {
    site_id: siteId,
    site_ref: siteRef,
    site_root: siteRef,
    operation_id: operationId,
    carrier_session_id: `carrier_session_webhook_delay_directive_${webhookDelayDirectiveDeliverySuffix}`,
    delivery_id: `webhook_delay_directive_delivery_live_${webhookDelayDirectiveDeliverySuffix}`,
    directive_record_id: `webhook_delay_directive_live_${webhookDelayDirectiveDeliverySuffix}`,
    directive_id: `directive_webhook_delay_delivery_live_${webhookDelayDirectiveDeliverySuffix}`,
    input_event_id: `input_webhook_delay_directive_delivery_live_${webhookDelayDirectiveDeliverySuffix}`,
    source_summary_path: '.ai/webhook-delay/latest/webhook-arrival-delay-today-vs-yesterday-summary.json',
    critical_minutes: 15,
    summary: {
      schema: 'narada.sonar/webhook-delay-today-vs-yesterday/v1',
      generated_at: new Date().toISOString(),
      rows72: 1,
      today: {
        latest: {
          at: new Date().toISOString(),
          at_ct: 'operator-check',
          elapsed_minutes: 1405,
          delay_minutes: 16,
        },
      },
      yesterday_same_clock: {
        delay_minutes: 1,
        delta_minutes_today_minus_yesterday: 15,
      },
    },
  },
});
assert.equal(webhookDelayDirectiveDelivery.http_status, 200, JSON.stringify(webhookDelayDirectiveDelivery.body));
assert.equal(webhookDelayDirectiveDelivery.body.ok, true);
assert.equal(webhookDelayDirectiveDelivery.body.schema, 'narada.sonar.cloudflare_webhook_delay_directive_primary_with_windows_fallback.v1');
assert.equal(webhookDelayDirectiveDelivery.body.status, 'cloudflare_primary_delivered');
assert.equal(webhookDelayDirectiveDelivery.body.operation_id, operationId);
assert.equal(webhookDelayDirectiveDelivery.body.directive_authority, 'cloudflare_primary_directive_delivery');
assert.equal(webhookDelayDirectiveDelivery.body.dispatch_authority, 'cloudflare_primary_dispatcher');
assert.equal(webhookDelayDirectiveDelivery.body.fallback_authority, 'windows_fallback_dispatcher');
assert.equal(webhookDelayDirectiveDelivery.body.fallback_status, 'available');
assert.equal(webhookDelayDirectiveDelivery.body.delivery_action, 'cloudflare_carrier_input_deliver');
assert.equal(webhookDelayDirectiveDelivery.body.directive_intent?.carrier_input_operation, 'carrier.input.deliver');
assert.equal(webhookDelayDirectiveDelivery.body.directive_intent?.delivery_semantics, 'cloudflare_primary_delivery');
assert.equal(webhookDelayDirectiveDelivery.body.carrier_admission?.admission_action, 'admit');
assert.equal(webhookDelayDirectiveDelivery.body.carrier_admission?.is_directive, true);
assert.equal(webhookDelayDirectiveDelivery.body.carrier_admission?.directive_visibility, 'agent_visible');
assert.equal(webhookDelayDirectiveDelivery.body.delivery?.admitted, true);
assert.equal(webhookDelayDirectiveDelivery.body.delivery?.terminal_state, 'completed');

const operationReadAfterContinuity = await postCarrier(workerUrl, bearerToken, {
  operation: 'operation.read',
  request_id: `operator_check_operation_continuity_read_${Date.now()}`,
  params: {
    site_id: siteId,
    operation_id: operationId,
    carrier_event_limit: 20,
    session_limit: 10,
    webhook_delay_directive_delivery_limit: 10,
    task_lifecycle_task_limit: 100,
    task_lifecycle_write_admission_limit: 100,
    resident_loop_shadow_limit: 10,
    resident_dispatch_limit: 10,
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
const operationPersistencePosture = operationReadAfterContinuity.body.cloudflare_persistence_posture;
const operationRecoveryPosture = operationReadAfterContinuity.body.cloudflare_recovery_posture;
const webhookDelayDirectiveDeliveries = operationReadAfterContinuity.body.webhook_delay_directive_deliveries ?? [];
const taskLifecycleShadowReads = operationReadAfterContinuity.body.task_lifecycle_shadow_reads ?? [];
const taskLifecycleWriteAdmissions = operationReadAfterContinuity.body.task_lifecycle_write_admissions ?? [];
const taskLifecycleTasks = operationReadAfterContinuity.body.task_lifecycle_tasks ?? [];
const residentLoopShadowRuns = operationReadAfterContinuity.body.resident_loop_shadow_runs ?? [];
const residentDispatchDecisions = operationReadAfterContinuity.body.resident_dispatch_decisions ?? [];
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
assert.match(operationLifecycleStatus?.next_action, /^(monitor_operation|open_tasks|undelivered_directives|carrier_evidence_read_degraded)$/);
assert.equal(operationLifecycleStatus?.continuity_loop_state, 'loop_report_observed');
assert.ok((operationLifecycleStatus?.continuity_loop_report_count ?? 0) >= 1);
assert.equal(operationSurface?.lifecycle_status?.health, operationLifecycleStatus.health);
assert.equal(operationSurface?.lifecycle_status?.next_action, operationLifecycleStatus.next_action);
assert.equal(operationPersistencePosture?.schema, 'narada.cloudflare_persistence_posture.v1');
assert.equal(operationPersistencePosture?.site_id, siteId);
assert.equal(operationPersistencePosture?.operation_id, operationId);
assert.match(operationPersistencePosture?.state, /^(durable|degraded|incomplete)$/);
assert.equal(operationPersistencePosture?.durable_boundary_count, 4);
assert.ok(operationPersistencePosture?.active_boundary_count >= 1);
assert.ok(Array.isArray(operationPersistencePosture?.durable_boundaries));
assert.ok(Array.isArray(operationPersistencePosture?.missing_boundaries));
assert.ok(Array.isArray(operationPersistencePosture?.warnings));
assert.equal(operationPersistencePosture?.session_count, operationReadAfterContinuity.body.sessions.length);
assert.equal(operationPersistencePosture?.task_count, operationReadAfterContinuity.body.tasks.length);
assert.equal(operationPersistencePosture?.carrier_evidence_group_count, operationReadAfterContinuity.body.carrier_evidence.length);
assert.equal(operationPersistencePosture?.continuity_packet_count, operationContinuityPackets.length);
assert.match(operationPersistencePosture?.next_action, /^(monitor_persistence_posture|session_snapshot|site_registry|carrier_evidence_index|task_lifecycle_store|session_without_replayed_evidence|task_projection_without_task_store_binding|carrier_evidence_replay_degraded)$/);
assert.deepEqual(operationSurface?.persistence_posture, operationPersistencePosture);
assert.equal(operationRecoveryPosture?.schema, 'narada.cloudflare_recovery_posture.v1');
assert.equal(operationRecoveryPosture?.site_id, siteId);
assert.equal(operationRecoveryPosture?.operation_id, operationId);
assert.match(operationRecoveryPosture?.state, /^(reconstructable|ready_no_sessions|partially_reconstructable|not_reconstructable)$/);
assert.match(operationRecoveryPosture?.snapshot_reload, /^(available|unavailable)$/);
assert.match(operationRecoveryPosture?.evidence_replay, /^(loaded|partial|degraded|no_sessions|unknown)$/);
assert.ok(Array.isArray(operationRecoveryPosture?.evidence_sources));
assert.ok(Array.isArray(operationRecoveryPosture?.recovery_gaps));
assert.ok(Array.isArray(operationRecoveryPosture?.missing_evidence_session_ids));
assert.equal(operationRecoveryPosture?.session_count, operationReadAfterContinuity.body.sessions.length);
assert.equal(operationRecoveryPosture?.evidence_session_count, new Set(operationReadAfterContinuity.body.carrier_evidence.filter((group) => group.ok === true && (group.events || []).length > 0).map((group) => group.carrier_session_id)).size);
assert.match(operationRecoveryPosture?.next_action, /^(monitor_recovery_posture|session_snapshot_reload_unavailable|carrier_evidence_index_unavailable|no_replayed_evidence|session_evidence_missing|carrier_evidence_replay_degraded)$/);
assert.deepEqual(operationSurface?.recovery_posture, operationRecoveryPosture);
assert.ok(Array.isArray(taskLifecycleShadowReads));
assert.equal(operationSurface?.task_lifecycle_shadow_read_count, taskLifecycleShadowReads.length);
assert.ok(Array.isArray(taskLifecycleWriteAdmissions));
assert.ok(taskLifecycleWriteAdmissions.length >= 1);
assert.equal(operationSurface?.task_lifecycle_write_admission_count, taskLifecycleWriteAdmissions.length);
assert.ok(Array.isArray(taskLifecycleTasks));
assert.equal(operationSurface?.task_lifecycle_task_count, taskLifecycleTasks.length);
const projectionWriteTask = taskLifecycleTasks.find((task) => task.task_id === projectionWriteSmoke.task_id);
assert.ok(projectionWriteTask, `projection write task missing from operation.read: ${projectionWriteSmoke.task_id}`);
assert.equal(projectionWriteTask.status, 'finished');
assert.equal(projectionWriteTask.task_lifecycle_projection_write_count, 1);
assert.equal(projectionWriteTask.task_lifecycle_projection_write_admission, 'admitted');
assert.equal(projectionWriteTask.task_lifecycle_projection_records?.some((record) => record.projection_id === projectionWriteSmoke.projection_write_admission_id || record.source_evidence_ref === `source-evidence:${projectionWriteSmoke.task_id}:finished-row`), true);
const roleResolutionWriteTask = taskLifecycleTasks.find((task) => task.task_id === taskLifecycleRoleResolutionWriteSmoke.task_id);
assert.ok(roleResolutionWriteTask, `role-resolution write task missing from operation.read: ${taskLifecycleRoleResolutionWriteSmoke.task_id}`);
assert.equal(roleResolutionWriteTask.task_lifecycle_role_resolution_write_count, 1);
assert.equal(roleResolutionWriteTask.task_lifecycle_role_resolution_write_admission, 'admitted');
assert.equal(roleResolutionWriteTask.role_resolution_authority, 'cloudflare_task_lifecycle_d1');
assert.equal(roleResolutionWriteTask.roster_read_admission, 'admitted');
assert.equal(roleResolutionWriteTask.roster_mutation_admission, 'not_admitted');
assert.equal(roleResolutionWriteTask.resolved_assignee_principal_id, taskLifecycleRoleResolutionWriteSmoke.assignee_principal_id);
assert.equal(roleResolutionWriteTask.resolved_assignee_role, taskLifecycleRoleResolutionWriteSmoke.resolved_role);
assert.ok(new Set([
  'writes_not_admitted',
  'task_create_admitted_remaining_writes_not_admitted',
  'task_create_and_claim_admitted_remaining_writes_not_admitted',
  'task_create_claim_and_report_admitted_remaining_writes_not_admitted',
  'task_create_claim_report_and_changed_file_evidence_admitted_remaining_writes_not_admitted',
  'task_create_claim_report_and_finish_admitted_remaining_writes_not_admitted',
  'task_create_claim_report_finish_and_changed_file_evidence_admitted_remaining_writes_not_admitted',
  'task_create_claim_report_finish_changed_file_evidence_and_projection_write_admitted_remaining_writes_not_admitted',
  'task_create_claim_report_finish_changed_file_evidence_projection_write_and_source_state_admitted_remaining_external_effects_not_admitted',
  'task_create_claim_report_finish_changed_file_evidence_projection_write_source_state_and_assignment_admitted_remaining_external_effects_not_admitted',
  'task_create_claim_report_finish_changed_file_evidence_projection_write_source_state_assignment_and_role_resolution_admitted_remaining_external_effects_not_admitted',
]).has(operationSurface?.task_lifecycle_write_admission_posture), `unexpected task lifecycle write admission posture: ${operationSurface?.task_lifecycle_write_admission_posture}`);
assert.ok(new Set(['windows_task_lifecycle_sqlite', 'split_by_mutation_class']).has(operationSurface?.task_lifecycle_mutation_authority), `unexpected task lifecycle mutation authority: ${operationSurface?.task_lifecycle_mutation_authority}`);
assert.ok(new Set([
  'not_admitted',
  'task_create_admitted',
  'task_create_and_claim_admitted',
  'task_create_claim_and_report_admitted',
  'task_create_claim_report_and_changed_file_evidence_admitted',
  'task_create_claim_report_and_finish_admitted',
  'task_create_claim_report_finish_and_changed_file_evidence_admitted',
  'task_create_claim_report_finish_changed_file_evidence_and_projection_write_admitted',
  'task_create_claim_report_finish_changed_file_evidence_projection_write_and_source_state_admitted',
  'task_create_claim_report_finish_changed_file_evidence_projection_write_source_state_and_assignment_admitted',
  'task_create_claim_report_finish_changed_file_evidence_projection_write_source_state_assignment_and_role_resolution_admitted',
]).has(operationSurface?.task_lifecycle_cloudflare_write_admission), `unexpected task lifecycle Cloudflare write admission: ${operationSurface?.task_lifecycle_cloudflare_write_admission}`);
assert.ok(new Set([
  'windows_all_observed_mutations',
  'task_create_cloudflare_remaining_windows',
  'task_create_and_claim_cloudflare_remaining_windows',
  'task_create_claim_and_report_cloudflare_remaining_windows',
  'task_create_claim_report_and_changed_file_evidence_cloudflare_remaining_windows',
  'task_create_claim_report_and_finish_cloudflare_remaining_windows',
  'task_create_claim_report_finish_and_changed_file_evidence_cloudflare_remaining_windows',
  'task_create_claim_report_finish_changed_file_evidence_and_projection_write_cloudflare_remaining_windows',
  'task_create_claim_report_finish_changed_file_evidence_projection_write_and_source_state_cloudflare_remaining_windows_effects',
  'task_create_claim_report_finish_changed_file_evidence_projection_write_source_state_and_assignment_cloudflare_remaining_windows_effects',
  'task_create_claim_report_finish_changed_file_evidence_projection_write_source_state_assignment_and_role_resolution_cloudflare_remaining_windows_effects',
]).has(operationSurface?.task_lifecycle_authority_partition), `unexpected task lifecycle authority partition: ${operationSurface?.task_lifecycle_authority_partition}`);
if (taskLifecycleTasks.length > 0) {
  assert.equal(operationSurface?.task_lifecycle_mutation_authority, 'split_by_mutation_class');
  assert.notEqual(operationSurface?.task_lifecycle_cloudflare_write_admission, 'not_admitted');
} else {
  assert.equal(operationSurface?.task_lifecycle_mutation_authority, 'windows_task_lifecycle_sqlite');
  assert.equal(operationSurface?.task_lifecycle_cloudflare_write_admission, 'not_admitted');
}
const recordedTaskLifecycleWriteAdmission = taskLifecycleWriteAdmissions.find((admission) => admission.admission_id === taskLifecycleWriteAdmission.body.record?.admission_id);
assert.ok(recordedTaskLifecycleWriteAdmission);
assert.equal(recordedTaskLifecycleWriteAdmission.schema, 'narada.sonar.cloudflare_task_lifecycle_write_admission.v1');
assert.equal(recordedTaskLifecycleWriteAdmission.admission_action, 'refuse');
assert.equal(recordedTaskLifecycleWriteAdmission.admission_reason, 'windows_task_lifecycle_mutation_authority_retained');
assert.equal(recordedTaskLifecycleWriteAdmission.mutation_authority, 'windows_task_lifecycle_sqlite');
assert.equal(recordedTaskLifecycleWriteAdmission.cloudflare_write_admission, 'not_admitted');
assert.equal(recordedTaskLifecycleWriteAdmission.write_effect, 'none');
const recordedTaskLifecycleSourceStateWriteAdmission = taskLifecycleWriteAdmissions.find((admission) => admission.admission_id === taskLifecycleSourceStateWriteAdmission.body.record?.admission_id);
assert.ok(recordedTaskLifecycleSourceStateWriteAdmission);
assert.equal(recordedTaskLifecycleSourceStateWriteAdmission.admission_action, 'refuse');
assert.equal(recordedTaskLifecycleSourceStateWriteAdmission.admission_reason, 'windows_task_lifecycle_mutation_authority_retained');
assert.equal(recordedTaskLifecycleSourceStateWriteAdmission.mutation_class, 'task_source_state_write');
assert.equal(recordedTaskLifecycleSourceStateWriteAdmission.mutation_authority, 'windows_task_lifecycle_sqlite');
assert.equal(recordedTaskLifecycleSourceStateWriteAdmission.cloudflare_write_admission, 'not_admitted');
assert.equal(recordedTaskLifecycleSourceStateWriteAdmission.write_effect, 'none');
assert.ok(Array.isArray(residentDispatchDecisions));
assert.ok(residentDispatchDecisions.length >= 1);
assert.equal(operationSurface?.resident_dispatch_decision_count, residentDispatchDecisions.length);
const recordedResidentDispatch = residentDispatchDecisions.find((decision) => decision.dispatch_decision_id === residentDispatch.body.decision?.dispatch_decision_id);
assert.ok(recordedResidentDispatch);
assert.equal(recordedResidentDispatch.schema, 'narada.sonar.cloudflare_resident_dispatch_primary_with_windows_fallback.v1');
assert.equal(recordedResidentDispatch.decision_state, 'cloudflare_primary_started');
assert.equal(recordedResidentDispatch.dispatch_authority, 'cloudflare_primary_dispatcher');
assert.equal(recordedResidentDispatch.fallback_authority, 'windows_fallback_dispatcher');
assert.equal(recordedResidentDispatch.fallback_status, 'available');
assert.equal(recordedResidentDispatch.dispatch_action, 'cloudflare_session_start');
assert.equal(recordedResidentDispatch.session_start_ok, true);
assert.ok(Array.isArray(residentLoopShadowRuns));
assert.ok(residentLoopShadowRuns.length >= 1);
assert.equal(operationSurface?.resident_loop_shadow_run_count, residentLoopShadowRuns.length);
const recordedResidentLoopShadow = residentLoopShadowRuns.find((run) => run.loop_run_id === residentLoopShadow.body.record?.loop_run_id);
assert.ok(recordedResidentLoopShadow);
assert.equal(recordedResidentLoopShadow.schema, 'narada.sonar.cloudflare_resident_loop_shadow_read.v1');
assert.equal(recordedResidentLoopShadow.loop_status, 'operator_check_shadow_recorded');
assert.equal(recordedResidentLoopShadow.step_count, 1);
assert.equal(recordedResidentLoopShadow.operator_attention_count, 1);
assert.equal(recordedResidentLoopShadow.dispatch_authority, 'windows_primary_dispatcher');
assert.equal(recordedResidentLoopShadow.shadow_mode, 'cloudflare_shadow_read');
assert.equal(recordedResidentLoopShadow.dispatch_action, 'none');
assert.ok(Array.isArray(webhookDelayDirectiveDeliveries));
assert.ok(webhookDelayDirectiveDeliveries.length >= 1);
assert.equal(operationSurface?.webhook_delay_directive_delivery_count, webhookDelayDirectiveDeliveries.length);
const recordedWebhookDelayDirectiveDelivery = webhookDelayDirectiveDeliveries.find((delivery) => delivery.delivery_id === webhookDelayDirectiveDelivery.body.record?.delivery_id);
assert.ok(recordedWebhookDelayDirectiveDelivery);
assert.equal(recordedWebhookDelayDirectiveDelivery.schema, 'narada.sonar.cloudflare_webhook_delay_directive_primary_with_windows_fallback.v1');
assert.equal(recordedWebhookDelayDirectiveDelivery.delivery_state, 'cloudflare_primary_delivered');
assert.equal(recordedWebhookDelayDirectiveDelivery.directive_authority, 'cloudflare_primary_directive_delivery');
assert.equal(recordedWebhookDelayDirectiveDelivery.dispatch_authority, 'cloudflare_primary_dispatcher');
assert.equal(recordedWebhookDelayDirectiveDelivery.fallback_authority, 'windows_fallback_dispatcher');
assert.equal(recordedWebhookDelayDirectiveDelivery.fallback_status, 'available');
assert.equal(recordedWebhookDelayDirectiveDelivery.delivery_action, 'cloudflare_carrier_input_deliver');
assert.equal(recordedWebhookDelayDirectiveDelivery.delivery_ok, true);
assert.equal(operationReadAfterContinuity.body.sessions.some((session) => session.carrier_session_id === webhookDelayDirectiveDelivery.body.carrier_session_id), true);
assert.equal(operationReadAfterContinuity.body.carrier_evidence.some((entry) => entry.carrier_session_id === webhookDelayDirectiveDelivery.body.carrier_session_id && entry.ok === true && entry.events.some((event) => event.event_kind === 'directive_receipt_recorded')), true);
for (const read of taskLifecycleShadowReads) {
  assert.equal(read.schema, 'narada.sonar.cloudflare_task_lifecycle_shadow_read.v1');
  assert.equal(read.mutation_authority, 'windows_task_lifecycle_sqlite');
  assert.equal(read.cloudflare_write_admission, 'not_admitted');
  assert.equal(read.dispatch_authority, 'windows_primary_dispatcher');
  assert.equal(read.dispatch_action, 'none');
}

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
    site_posture_route: 'ok',
    console_multi_site_surface: 'ok',
    console_continuity_loop_guidance: 'ok',
    local_cloud_continuity_bridge: 'ok',
    continuity_loop_report_status: 'ok',
    membership_visibility: 'ok',
    operation_read: 'ok',
    canonical_operation_active: 'ok',
    operation_inhabited_by_live_work: 'ok',
    operation_posture_route: 'ok',
    operation_continuity_packets: 'ok',
    operation_continuity_status: 'ok',
    operation_lifecycle_status: 'ok',
    operation_persistence_posture: 'ok',
    operation_recovery_posture: 'ok',
    webhook_delay_directive_delivery_surface: 'ok',
    task_lifecycle_shadow_read_surface: 'ok',
    task_lifecycle_write_admission_surface: 'ok',
    task_lifecycle_source_state_write_boundary: 'ok',
    task_lifecycle_projection_write_cutover_surface: 'ok',
    task_lifecycle_role_resolution_write_cutover_surface: 'ok',
    resident_loop_shadow_surface: 'ok',
    resident_dispatch_surface: 'ok',
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
    route: siteList.body.site_posture_route,
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
    persistence_posture: operationSurface.persistence_posture,
    recovery_posture: operationSurface.recovery_posture,
    webhook_delay_directive_delivery_count: operationSurface.webhook_delay_directive_delivery_count,
    webhook_delay_directive_delivery_last_state: recordedWebhookDelayDirectiveDelivery.delivery_state,
    webhook_delay_directive_delivery_authority: recordedWebhookDelayDirectiveDelivery.directive_authority,
    webhook_delay_directive_delivery_fallback_authority: recordedWebhookDelayDirectiveDelivery.fallback_authority,
    webhook_delay_directive_delivery_fallback_status: recordedWebhookDelayDirectiveDelivery.fallback_status,
    task_lifecycle_shadow_read_count: operationSurface.task_lifecycle_shadow_read_count,
    task_lifecycle_task_count: operationSurface.task_lifecycle_task_count,
    task_lifecycle_task_claim_count: operationSurface.task_lifecycle_task_claim_count,
    task_lifecycle_task_report_count: operationSurface.task_lifecycle_task_report_count,
    task_lifecycle_task_finish_count: operationSurface.task_lifecycle_task_finish_count,
    task_lifecycle_changed_file_evidence_count: operationSurface.task_lifecycle_changed_file_evidence_count,
    task_lifecycle_projection_write_count: operationSurface.task_lifecycle_projection_write_count,
    task_lifecycle_projection_write_task_id: projectionWriteSmoke.task_id,
    task_lifecycle_projection_write_effect: projectionWriteSmoke.write_effect,
    task_lifecycle_projection_sqlite_mutation_admission: projectionWriteSmoke.sqlite_mutation_admission,
    task_lifecycle_projection_filesystem_mutation_admission: projectionWriteSmoke.filesystem_mutation_admission,
    task_lifecycle_projection_repository_publication_admission: projectionWriteSmoke.repository_publication_admission,
    task_lifecycle_write_admission_count: operationSurface.task_lifecycle_write_admission_count,
    task_lifecycle_source_state_write_admission: recordedTaskLifecycleSourceStateWriteAdmission.cloudflare_write_admission,
    task_lifecycle_source_state_write_authority: recordedTaskLifecycleSourceStateWriteAdmission.mutation_authority,
    task_lifecycle_assignment_write_count: operationSurface.task_lifecycle_assignment_write_count,
    task_lifecycle_assignment_write_admission: taskLifecycleAssignmentWriteSmoke.cloudflare_write_admission,
    task_lifecycle_assignment_write_authority: operationSurface.task_lifecycle_assignment_authority,
    task_lifecycle_role_resolution_write_count: operationSurface.task_lifecycle_role_resolution_write_count,
    task_lifecycle_role_resolution_write_admission: taskLifecycleRoleResolutionWriteSmoke.cloudflare_write_admission,
    task_lifecycle_role_resolution_write_authority: operationSurface.task_lifecycle_role_resolution_authority,
    task_lifecycle_role_resolution_write_task_id: taskLifecycleRoleResolutionWriteSmoke.task_id,
    task_lifecycle_role_resolution_write_effect: taskLifecycleRoleResolutionWriteSmoke.write_effect,
    task_lifecycle_role_resolution_assignee_principal_id: taskLifecycleRoleResolutionWriteSmoke.assignee_principal_id,
    task_lifecycle_role_resolution_resolved_role: taskLifecycleRoleResolutionWriteSmoke.resolved_role,
    task_lifecycle_roster_read_admission: operationSurface.task_lifecycle_roster_read_admission,
    task_lifecycle_roster_mutation_admission: operationSurface.task_lifecycle_roster_mutation_admission,
    task_lifecycle_role_resolution_authority_admission: operationSurface.task_lifecycle_role_resolution_authority_admission,
    task_lifecycle_write_admission_posture: operationSurface.task_lifecycle_write_admission_posture,
    task_lifecycle_mutation_authority: operationSurface.task_lifecycle_mutation_authority,
    task_lifecycle_cloudflare_write_admission: operationSurface.task_lifecycle_cloudflare_write_admission,
    task_lifecycle_authority_partition: operationSurface.task_lifecycle_authority_partition,
    task_lifecycle_task_create_authority: operationSurface.task_lifecycle_task_create_authority,
    task_lifecycle_task_claim_authority: operationSurface.task_lifecycle_task_claim_authority,
    task_lifecycle_task_report_authority: operationSurface.task_lifecycle_task_report_authority,
    task_lifecycle_task_finish_authority: operationSurface.task_lifecycle_task_finish_authority,
    task_lifecycle_changed_file_evidence_authority: operationSurface.task_lifecycle_changed_file_evidence_authority,
    task_lifecycle_projection_write_authority: operationSurface.task_lifecycle_projection_write_authority,
    resident_loop_shadow_run_count: operationSurface.resident_loop_shadow_run_count,
    resident_loop_shadow_last_status: recordedResidentLoopShadow.loop_status,
    resident_loop_shadow_dispatch_authority: recordedResidentLoopShadow.dispatch_authority,
    resident_loop_shadow_dispatch_action: recordedResidentLoopShadow.dispatch_action,
    resident_dispatch_decision_count: operationSurface.resident_dispatch_decision_count,
    resident_dispatch_last_state: recordedResidentDispatch.decision_state,
    resident_dispatch_authority: recordedResidentDispatch.dispatch_authority,
    resident_dispatch_fallback_authority: recordedResidentDispatch.fallback_authority,
    resident_dispatch_fallback_status: recordedResidentDispatch.fallback_status,
    carrier_evidence_read_status: operationRead.body.carrier_evidence_read_status,
    smoke_session_bound: operationRead.body.sessions.some((session) => session.carrier_session_id === smoke.carrier_session_id),
  },
  command_states: liveCommandStates,
  operation_posture: {
    overview: operationPostureOverview,
    route: operationPostureRoute,
  },
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

function expectedSiteProductOverview(statuses = []) {
  const actionableStatus = statuses.find((status) => {
    const nextAction = status?.next_action || 'monitor_site';
    return nextAction !== 'monitor_site';
  }) ?? null;
  return {
    health_counts: statuses.reduce((counts, status) => {
      if (status?.health === 'ready') counts.ready += 1;
      else if (status?.health === 'attention') counts.attention += 1;
      else if (status?.health === 'incomplete') counts.incomplete += 1;
      else counts.other += 1;
      return counts;
    }, { ready: 0, attention: 0, incomplete: 0, other: 0 }),
    action_counts: countBy(statuses, (status) => status?.next_action || 'monitor_site'),
    missing_counts: countNestedValues(statuses, 'missing'),
    attention_counts: countNestedValues(statuses, 'attention'),
    next_site_id: actionableStatus?.site_id || null,
    next_health: actionableStatus?.health || 'ready',
    next_action: actionableStatus?.next_action || 'monitor_sites',
    next_reason: actionableStatus
      ? (actionableStatus.missing || [])[0] || (actionableStatus.attention || [])[0] || actionableStatus.next_action || 'inspect_site'
      : 'all_sites_monitoring',
  };
}

function sitePostureRouteInvariant(overview = {}, focusedSiteId = '') {
  const nextSiteId = overview.next_site_id || '';
  const nextAction = overview.next_action || 'monitor_sites';
  const changesFocus = nextSiteId && nextSiteId !== focusedSiteId;
  const needsAttention = Boolean(
    overview.site_count > 0
    && nextAction
    && nextAction !== 'monitor_sites'
    && changesFocus,
  );
  return {
    schema: 'narada.cloudflare_site_posture_route.v1',
    domain: 'site_posture',
    command_state: needsAttention ? 'site_posture_attention' : 'site_posture_ready',
    status: needsAttention ? 'needs_attention' : 'ready',
    command_action: needsAttention ? 'focus_next_site' : 'monitor_sites',
    next_action: needsAttention ? 'focus_next_site' : 'monitor_sites',
    target: nextSiteId || 'none',
    reason: overview.next_reason || 'all_sites_ready',
  };
}

function expectedOperationPostureOverview(operations = [], product = {}, context = {}) {
  const items = operationWorkQueueItemsForCheck(operations, product, context);
  const healthCounts = { ready: 0, needs_attention: 0 };
  const actionCounts = {};
  const reasonCounts = {};
  const commandStateCounts = {};
  for (const item of items) {
    healthCounts[item.status] = (healthCounts[item.status] || 0) + 1;
    const action = item.command?.next_action || 'inspect_operation';
    const reason = operationPostureReasonForCheck(item);
    const commandState = item.command?.command_state || 'not_classified';
    actionCounts[action] = (actionCounts[action] || 0) + 1;
    reasonCounts[reason] = (reasonCounts[reason] || 0) + 1;
    commandStateCounts[commandState] = (commandStateCounts[commandState] || 0) + 1;
  }
  const activeOperationId = context.activeOperationId || '';
  const next = items.find((item) => item.status === 'needs_attention')
    || items.find((item) => item.operation.operation_id === activeOperationId)
    || items[0]
    || null;
  return {
    schema: 'narada.cloudflare_operation_posture_overview.v1',
    operation_count: items.length,
    health_counts: healthCounts,
    action_counts: actionCounts,
    reason_counts: reasonCounts,
    command_state_counts: commandStateCounts,
    active_operation_id: activeOperationId || null,
    next_operation_id: next?.operation?.operation_id || null,
    next_status: next?.status || 'ready',
    next_action: next?.command?.next_action || 'monitor_operations',
    next_reason: next ? operationPostureReasonForCheck(next) : 'all_operations_monitoring',
  };
}

function operationPostureRouteInvariant(overview = {}, activeOperationId = '') {
  const nextOperationId = overview.next_operation_id || '';
  const changesFocus = nextOperationId && nextOperationId !== activeOperationId;
  const needsAttention = Boolean(overview.operation_count > 0 && overview.next_status !== 'ready' && changesFocus);
  return {
    schema: 'narada.cloudflare_operation_posture_route.v1',
    domain: 'operation_posture',
    command_state: needsAttention ? 'operation_posture_attention' : 'operation_posture_ready',
    command_action: needsAttention ? 'focus_next_operation' : 'monitor_operations',
    next_action: needsAttention ? 'focus_next_operation' : 'monitor_operations',
    target: nextOperationId || 'none',
    status: needsAttention ? 'needs_attention' : 'ready',
    reason: overview.next_reason || 'all_operations_monitoring',
  };
}

function operationWorkQueueItemsForCheck(operations = [], product = {}, context = {}) {
  const activeOperationId = context.activeOperationId || '';
  return operations.map((operation) => {
    const path = operationPathForCheck(operation, product, context);
    const scopeLoaded = operationScopeLoadedForCheck(operation, product, context);
    const evidenceLoaded = operationEventsForCheck(operation, product, context).length > 0;
    const command = classifyCloudflareOperationCommandState({
      operation_id: operation.operation_id || '',
      is_active: operation.operation_id === activeOperationId,
      scope_loaded: scopeLoaded,
      session_count: path.session_count,
      evidence_loaded: evidenceLoaded,
      operation_path_next_action: path.next_action || 'read_operation_scope',
    });
    const ready = ['inspect_operation_evidence', 'evidence_ready'].includes(command.next_action) || command.command_state === 'evidence_ready';
    return { operation, command, path, status: ready ? 'ready' : 'needs_attention' };
  }).sort((left, right) => {
    if (left.status !== right.status) return left.status === 'needs_attention' ? -1 : 1;
    if (left.operation.operation_id === activeOperationId) return -1;
    if (right.operation.operation_id === activeOperationId) return 1;
    return String(right.operation.updated_at || '').localeCompare(String(left.operation.updated_at || ''));
  });
}

function operationPathForCheck(operation = {}, product = {}, context = {}) {
  const operationId = operation.operation_id || context.activeOperationId || '';
  const sessions = (product.sessions || []).filter((session) => !session.operation_id || session.operation_id === operationId);
  const tasks = operationTasksForCheck(operation, product, context);
  const events = operationEventsForCheck(operation, product, context);
  const attention = operationAttentionForCheck(product).filter((item) => !item.operation_id || item.operation_id === operationId);
  const openTasks = tasks.filter((task) => taskLifecycleStatusForCheck(task) === 'open');
  const openAttention = attention.filter((item) => item.status !== 'resolved');
  const nextAction = !operationId ? 'select_or_create_operation'
    : sessions.length === 0 ? 'start_or_select_session'
    : openAttention.length > 0 ? 'inspect_attention'
    : openTasks.length > 0 ? 'inspect_open_task'
    : events.length > 0 ? 'inspect_operation_evidence' : 'read_operation_evidence';
  return {
    operation_id: operationId,
    session_count: sessions.length,
    task_count: tasks.length,
    open_task_count: openTasks.length,
    attention_count: attention.length,
    open_attention_count: openAttention.length,
    evidence_event_count: events.length,
    next_action: nextAction,
  };
}

function operationScopeLoadedForCheck(operation = {}, product = {}, context = {}) {
  const operationId = operation.operation_id || context.activeOperationId || '';
  return Boolean(operationId && product.operation?.operation_id === operationId);
}

function operationEventsForCheck(operation = {}, product = {}, context = {}) {
  const operationId = operation.operation_id || context.activeOperationId || '';
  if (!operationId) return [];
  const seen = new Set();
  return (product.carrier_evidence || []).flatMap((entry) => entry.events || []).filter((event) => {
    const eventOperationId = event.payload?.operation_id || event.payload?.target?.id || product.operation?.operation_id || '';
    if (eventOperationId !== operationId) return false;
    const key = [event.carrier_session_id, event.sequence, event.event_kind, JSON.stringify(event.payload || {})].join(':');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function operationTasksForCheck(operation = {}, product = {}, context = {}) {
  const operationId = operation.operation_id || context.activeOperationId || '';
  if (!operationId) return [];
  const siteId = product.site?.site_id || product.operation?.site_id || context.siteId || '';
  return (product.tasks || []).filter((task) => task.operation_id === operationId || task.site_id === siteId);
}

function operationAttentionForCheck(product = {}) {
  const tasks = product.tasks || [];
  const seen = new Set();
  return (product.carrier_evidence || []).flatMap((entry) => entry.events || [])
    .filter((event) => event.event_kind === 'directive_emitted' && event.payload?.directive_kind === 'operation_attention')
    .map((event) => {
      const payload = event.payload || {};
      const key = payload.directive_id || payload.input_event_id || [event.carrier_session_id, event.sequence].filter(Boolean).join(':');
      if (seen.has(key)) return null;
      seen.add(key);
      const resolvedByTask = tasks.find((task) => {
        const note = String(task.note || '');
        const status = String(task.status || '').toLowerCase();
        const resolutionStatus = status === 'done' || status === 'resolved' || status === 'closed';
        const inputEventId = String(payload.input_event_id || '');
        return resolutionStatus && (note.includes(key) || (inputEventId && note.includes(inputEventId)));
      }) || null;
      return {
        key,
        operation_id: payload.operation_id || payload.target?.id || product.operation?.operation_id || null,
        status: resolvedByTask ? 'resolved' : 'open',
      };
    })
    .filter(Boolean);
}

function operationPostureReasonForCheck(item = {}) {
  const action = item.command?.next_action || 'inspect_operation';
  if (action === 'read_operation_scope') return 'operation_scope';
  if (action === 'start_or_select_session') return 'session';
  if (action === 'inspect_attention') return 'operation_attention';
  if (action === 'inspect_open_task') return 'open_tasks';
  if (action === 'read_operation_evidence') return 'carrier_evidence';
  if (action === 'inspect_operation_evidence') return 'evidence_review';
  return action;
}

function taskLifecycleStatusForCheck(task = {}) {
  const status = String(task.status || '').toLowerCase();
  if (status === 'open' || status === 'todo' || status === 'pending') return 'open';
  if (status === 'done' || status === 'resolved' || status === 'closed') return 'closed';
  return status || 'unknown';
}

function countBy(items = [], keyForItem) {
  return items.reduce((counts, item) => {
    const key = keyForItem(item);
    counts[key] = (counts[key] || 0) + 1;
    return counts;
  }, {});
}

function countNestedValues(items = [], key) {
  return items.reduce((counts, item) => {
    const values = Array.isArray(item?.[key]) ? item[key] : [];
    for (const value of values) counts[value] = (counts[value] || 0) + 1;
    return counts;
  }, {});
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
