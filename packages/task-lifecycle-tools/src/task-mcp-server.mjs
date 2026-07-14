#!/usr/bin/env node
import { openTaskLifecycleStore } from '@narada2/task-governance/task-lifecycle-store';
import { evaluateTaskDependencySatisfaction } from '@narada2/task-governance/task-dependency-satisfaction';
import { finishTaskService } from '@narada2/task-governance/task-finish-service';
import { classifyPostCloseoutContinuation, evaluatePostTransitionFollowups } from './follow-up-policy-service.mjs';
import { closeTaskService } from '@narada2/task-governance/task-close-service';
import { searchTasksService } from '@narada2/task-governance/task-search-service';
import { reviewTaskService } from '@narada2/task-governance/task-review-service';
import { continueTaskService } from '@narada2/task-governance/task-assignment-lifecycle-service';
import { inspectTaskEvidence, findTaskFile, readTaskFile, writeTaskProjection, allocateTaskNumbers } from '@narada2/task-governance/task-governance';
import { renderTaskBodyFromSpec } from '@narada2/task-governance/task-spec';
import { buildWorkboard } from './workboard.mjs';
import { buildUnifiedWorkboard, deriveNextRecommendation } from './unified-workboard.mjs';
import {
  buildCorrectiveDebtReadiness as buildSharedCorrectiveDebtReadiness,
  correctiveDebtRecommendationListItem,
  deriveCorrectiveDebtRecommendation,
  selectWorkboardRecommendation,
} from './corrective-debt-workboard.mjs';
import { admitTaskEvidence } from '@narada2/task-governance/evidence-admission';
import { randomUUID } from 'crypto';
import { relative, resolve, join } from 'path';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { runGovernedCommandSync, spawnMcpServer } from '@narada2/process-launch-posture';
import { pollInboxBridge, targetInboxEnvelope, readUnprocessedEnvelopes, evaluateEnvelopeSeverity } from './inbox-bridge.mjs';
import { readAdmissionLog, resolveEnvelopeStatus } from '../inbox/admission-log.mjs';
import { refreshInboxIndex } from '../inbox/inbox-index.mjs';
import { emitCheckpoint } from './emit-checkpoint.mjs';
import {
  buildReviewAcceptanceProvenanceAnnotation,
  detectSameOperatorReview,
  detectSelfReview,
  getReviewAcceptanceProvenance,
  getReviewIndependenceMeta,
  getSingleOperatorReviewMeta,
  normalizeReviewReplayStatus,
  REVIEW_REPLAY_STATUSES,
} from './operator-identity.mjs';
import { findRelatedTasks } from './task-relatedness.mjs';
import { validateFollowUpLedger } from './follow-up-ledger-validation.mjs';
import { validateRecoveryTruthfulnessBody, validateRecoveryTruthfulnessPacket } from './recovery-truthfulness-guard.mjs';
import { validateSelfCertificationBody, validateSelfCertificationPacket } from './self-certification-guard.mjs';
import { claimLifecycleTask, proveTaskCriteria, transitionLifecycleTask, tombstoneLifecycleTask, unclaimLifecycleTask, unDeferLifecycleTask } from './task-lifecycle-mutation-services.mjs';
import { TASK_LIFECYCLE_TOOL_ALIASES, taskLifecycleTools } from './task-mcp-tool-registry.mjs';
import { addChapterTask, importChapterMarkdownIndex, listChapters, showChapter, upsertChapterDefinition } from './chapter-lifecycle.mjs';
import { applyBulkTaskRouting } from './bulk-routing.mjs';
import { deriveClosureAuthority } from './closure-authority.mjs';
import {
  attachPayloadSource,
  buildOutputRefToolContent,
  commandAuthorAndSubmitAsync,
  commandCreate,
  commandShow,
  commandSubmitAsync,
  commandValidate,
  enforceInlinePayloadLimit,
  listOutputTools,
  listPayloadTools,
  outputShow,
  payloadCreate,
  payloadDerive,
  payloadShow,
  payloadValidate,
  resultShow,
  resolveToolPayloadArgs,
} from '../../site-common-tools/compat/mcp-payload-file.legacy-site.mjs';
import { genericCommandRegistrySummary } from '../generic-command-registry.mjs';
import {
  acknowledgeMcpRestartRequest,
  buildMcpFreshnessStatus,
  buildMcpRestartPressure,
  buildStaleLiveNavigationDegradation,
  deriveMcpRestartPressureRecommendation,
  readJsonFile as readMcpFreshnessJsonFile,
  writeMcpRuntimeInstanceObservation,
  writeMcpRestartRequest,
} from '../mcp-freshness-service.mjs';
import { agentExistsWithRole, checkTaskRoleEligibilityLocal, resolveAgentRole, resolveAgentRoleWithDiagnostics, roleExistsInRoster } from './agent-role-resolution.mjs';
import { resolveTaskRolePolicy } from './task-role-policy.mjs';

const PROTOCOL_VERSION = '2026-04-18';
const SERVER_NAME = 'narada-task-lifecycle-mcp';
const SERVER_BOOTED_AT = new Date().toISOString();
const NO_FILES_CHANGED_MARKER = '__narada_no_files_changed_declared__';
const LOCUS_GUARDED_MUTATION_TOOLS = new Set([
  'task_lifecycle_claim',
  'task_lifecycle_continue',
  'task_lifecycle_unclaim',
  'task_lifecycle_admit_evidence',
  'task_lifecycle_prove_criteria',
  'task_lifecycle_finish',
  'task_lifecycle_close',
  'task_lifecycle_tombstone',
  'task_lifecycle_defer',
  'task_lifecycle_un_defer',
  'task_lifecycle_reopen',
  'task_lifecycle_review',
  'task_lifecycle_replay_test_evidence',
  'task_lifecycle_submit_observation',
  'task_lifecycle_bridge_poll',
  'task_lifecycle_inbox_target',
  'task_lifecycle_create',
  'task_lifecycle_create_task_batch',
  'task_lifecycle_set_routing',
  'task_lifecycle_chapter_upsert',
  'task_lifecycle_chapter_add_task',
  'task_lifecycle_chapter_import_markdown',
  'task_lifecycle_route_task_set',
  'task_lifecycle_recurring_create',
  'task_lifecycle_recurring_run_due',
  'task_lifecycle_recurring_suspend',
  'task_lifecycle_recurring_retire',
]);

// Session identity binding for mechanical identity verification.
// If NARADA_AGENT_ID is set, mutating operations warn/block on mismatched agent_id params.
const SESSION_IDENTITY = process.env.NARADA_AGENT_ID || null;
let activeOutputToolName = null;

const TOOL_ALIASES = TASK_LIFECYCLE_TOOL_ALIASES;

const options = parseArgs(process.argv.slice(2));

if (options.help) {
  process.stdout.write('Usage: node task-mcp-server.mjs --site-root <path>\n');
  process.exit(0);
}

const siteRoot = resolve(options.siteRoot ?? process.cwd());
recordTaskLifecycleRuntimeObservation();
let store;
function refreshStore() {
  try {
    // This MCP process shares `store` across dispatch helpers. With node:sqlite,
    // closing a handle immediately invalidates any helper still holding it, so
    // refresh must be non-destructive.
    store = openTaskLifecycleStore(siteRoot);
    return true;
  } catch (error) {
    process.stderr.write(`Failed to refresh task lifecycle store: ${error.message}\n`);
    return false;
  }
}
try {
  store = openTaskLifecycleStore(siteRoot);
} catch (error) {
  process.stderr.write(`Failed to open task lifecycle store: ${error.message}\n`);
  process.exit(1);
}

function recordTaskLifecycleRuntimeObservation() {
  try {
    writeMcpRuntimeInstanceObservation({
      siteRoot,
      surfaceId: 'task-lifecycle-mcp.local',
      serverName: SERVER_NAME,
      serverEntryPoint: 'tools/task-lifecycle/task-mcp-server.mjs',
      serverBootedAt: SERVER_BOOTED_AT,
      watchedPaths: ['tools/task-lifecycle', 'tools/mcp-freshness-service.mjs'],
      restartRequestPath: join(siteRoot, '.ai', 'tmp', 'task-lifecycle-restart-request.json'),
      baselinePath: join(siteRoot, '.ai', 'tmp', 'task-lifecycle-mcp-baseline.json'),
      freshnessEvidencePath: '.ai/runtime/typed-mcp/task-lifecycle-mcp',
      transport: { type: 'stdio', runtime_kind: 'node-stdio' },
    });
  } catch (error) {
    process.stderr.write(`Failed to record task-lifecycle MCP runtime observation: ${error.message}\n`);
  }
}

function buildCorrectiveDebtReadiness({ allTasks = [] } = {}) {
  const inboxCapas = readActiveInboxCapaItems();
  const capabilityCapas = readPendingCapabilityCapaItems();
  const activeItems = [...inboxCapas.active, ...capabilityCapas.active]
    .map((item) => ({
      ...item,
      corrective_task_coverage: detectCorrectiveTaskCoverage({ item, allTasks }),
    }))
    .sort((a, b) => b.severity - a.severity || String(a.capa_id).localeCompare(String(b.capa_id)));

  const terminalCoverageItems = activeItems.filter((item) => item.corrective_task_coverage.status === 'closed_corrective_implementation_coverage');
  const highSeverityItems = activeItems.filter((item) => item.severity >= 75);
  const correctiveCoveragePressureStatuses = new Set(['missing_corrective_task_coverage', 'historical_only_no_open_corrective_task']);
  const missingCoverageItems = highSeverityItems.filter((item) => correctiveCoveragePressureStatuses.has(item.corrective_task_coverage.status));
  const state = activeItems.length === 0
    ? 'terminal_corrected'
    : terminalCoverageItems.length === activeItems.length
      ? 'corrective_complete_pending_review'
      : missingCoverageItems.length > 0
      ? 'inventory_complete_corrective_open'
      : 'corrective_in_progress';

  return {
    schema: 'narada.task.corrective_debt_readiness.v0',
    authority: 'read_model_from_inbox_admission_log_capas_and_capability_announcements',
    read_only: true,
    state,
    state_vocabulary: [
      'inventory_in_progress',
      'inventory_complete_corrective_open',
      'corrective_in_progress',
      'corrective_complete_pending_review',
      'terminal_corrected',
      'terminal_blocked',
    ],
    high_severity_threshold: 75,
    counts: {
      active_total: activeItems.length,
      active_inbox_capas: inboxCapas.active.length,
      active_capability_reviews: capabilityCapas.active.length,
      high_severity: highSeverityItems.length,
      missing_corrective_task_coverage: missingCoverageItems.length,
      linked_or_covered: activeItems.filter((item) => ['covered_by_open_task', 'closed_corrective_implementation_coverage'].includes(item.corrective_task_coverage.status)).length,
      terminal_or_suppressed_sources: terminalCoverageItems.length + inboxCapas.suppressed_count + capabilityCapas.suppressed_count,
    },
    active_items: activeItems.slice(0, 25),
    missing_corrective_task_coverage: missingCoverageItems.slice(0, 25).map((item) => ({
      capa_id: item.capa_id,
      capa_type: item.capa_type,
      severity: item.severity,
      concept_name: item.concept_name,
      corrective_task_coverage: item.corrective_task_coverage,
    })),
    residual_surfaces: [
      'Coverage detection is a read model over task text/spec linkage; it does not mutate CAPA state or prove semantic correction.',
      'Startup hydration and post-closeout terminal guards must explicitly consume this evidence before it can block terminal readiness claims.',
      'Closed disposition and audit tasks may appear as historical links but do not count as terminal corrective implementation coverage.',
    ],
    sources: {
      inbox_admission_log: '.ai/state/inbox-admission.log',
      capability_announcements: 'operator-surfaces/capability-announcements.json',
      task_lifecycle_sqlite: 'task_specs + task_lifecycle read model',
    },
  };
}

function readActiveInboxCapaItems() {
  let events = [];
  try {
    events = readAdmissionLog(siteRoot);
  } catch {
    return { active: [], suppressed_count: 0 };
  }
  const byEnvelope = new Map();
  const latestPromotion = new Map();
  for (const event of events) {
    if (!event.envelope_id) continue;
    const list = byEnvelope.get(event.envelope_id) ?? [];
    list.push(event);
    byEnvelope.set(event.envelope_id, list);
    if (event.event_kind === 'envelope_promoted') {
      const current = latestPromotion.get(event.envelope_id);
      if (!current || (event.event_sequence ?? 0) > (current.event_sequence ?? 0)) {
        latestPromotion.set(event.envelope_id, event);
      }
    }
  }

  const active = [];
  let suppressedCount = 0;
  for (const [envelopeId, promotionEvent] of latestPromotion.entries()) {
    const history = byEnvelope.get(envelopeId) ?? [];
    const effectiveStatus = resolveEnvelopeStatus(history);
    if (['acknowledged', 'dismissed'].includes(effectiveStatus)) {
      suppressedCount += 1;
      continue;
    }
    const promotion = promotionEvent.event_payload?.promotion ?? {};
    const severity = finiteNumber(promotion.severity, 60);
    const correctiveAction = stringOrNull(promotion.corrective_action);
    active.push({
      capa_id: envelopeId,
      capa_type: 'inbox_capa',
      source_kind: 'promoted_admission_log_envelope',
      status: effectiveStatus,
      severity,
      concept_name: stringOrNull(promotion.concept_name) ?? envelopeId,
      corrective_action_present: Boolean(correctiveAction),
      corrective_action_summary: correctiveAction,
      preventive_action_present: Boolean(stringOrNull(promotion.preventive_action)),
      responsible_agent_id: stringOrNull(promotion.promoted_by) ?? '',
      admitted_at: promotionEvent.timestamp ?? '',
    });
  }
  return { active, suppressed_count: suppressedCount };
}

function readPendingCapabilityCapaItems() {
  const capPath = join(siteRoot, 'operator-surfaces', 'capability-announcements.json');
  if (!existsSync(capPath)) return { active: [], suppressed_count: 0 };
  let capabilities = [];
  try {
    const doc = JSON.parse(readFileSync(capPath, 'utf8'));
    capabilities = Array.isArray(doc.capabilities) ? doc.capabilities : [];
  } catch {
    return { active: [], suppressed_count: 0 };
  }

  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;
  const active = [];
  let suppressedCount = 0;
  for (const cap of capabilities) {
    const reviewStatus = cap.review_status ?? 'pending';
    if (reviewStatus === 'completed') {
      suppressedCount += 1;
      continue;
    }
    const reviewDueMs = cap.review_due ? new Date(cap.review_due).getTime() : NaN;
    const daysUntilDue = Number.isFinite(reviewDueMs) ? Math.floor((reviewDueMs - now) / dayMs) : null;
    const severity = Number.isFinite(cap.severity)
      ? cap.severity
      : daysUntilDue === null
        ? 0
        : daysUntilDue < 0
          ? 85
          : daysUntilDue <= 14
            ? 60
            : daysUntilDue <= 30
              ? 40
              : 0;
    if (severity <= 0) continue;
    active.push({
      capa_id: cap.capability_id,
      capa_type: 'capability_announcement',
      source_kind: 'capability_review_obligation',
      status: cap.status ?? reviewStatus,
      review_status: reviewStatus,
      severity,
      concept_name: cap.concept_name ?? cap.capability_id,
      corrective_action_present: false,
      corrective_action_summary: null,
      preventive_action_present: false,
      responsible_agent_id: cap.responsible_agent_id ?? '',
      review_due: cap.review_due ?? '',
      days_until_due: daysUntilDue,
      admitted_at: cap.admitted_at ?? '',
    });
  }
  return { active, suppressed_count: suppressedCount };
}

function detectCorrectiveTaskCoverage({ item, allTasks }) {
  const matches = [];
  const normalizedConcept = normalizeLinkText(item.concept_name);
  for (const row of allTasks ?? []) {
    const spec = row.task_number ? store.getTaskSpecByNumber(row.task_number) : null;
    const projectedTaskBody = readProjectedTaskBody(row.task_id);
    const text = normalizeLinkText([
      spec?.title,
      spec?.goal_markdown,
      spec?.context_markdown,
      spec?.required_work_markdown,
      spec?.non_goals_markdown,
      projectedTaskBody,
      row.task_id,
    ].filter(Boolean).join(' '));
    const reasons = [];
    if (item.capa_id && text.includes(normalizeLinkText(item.capa_id))) reasons.push('capa_id_link');
    if (normalizedConcept.length >= 16 && text.includes(normalizedConcept)) reasons.push('concept_name_link');
    if (reasons.length === 0) continue;
    matches.push({
      task_number: row.task_number,
      task_id: row.task_id,
      status: row.status,
      title: spec?.title ?? row.title ?? '',
      reasons,
      closed_corrective_implementation: isClosedCorrectiveImplementationTask({ row, spec, item, projectedTaskBody }),
    });
  }
  const openStatuses = new Set(['opened', 'claimed', 'needs_continuation', 'in_review']);
  const openMatches = matches.filter((match) => openStatuses.has(match.status));
  if (openMatches.length > 0) {
    return {
      status: 'covered_by_open_task',
      reason: 'open linked task can carry the CAPA corrective implementation to terminal evidence',
      open_task_count: openMatches.length,
      historical_task_count: matches.length - openMatches.length,
      tasks: openMatches.slice(0, 5),
      actionable_next_states: correctiveCoverageNextStates(),
      remediation: 'Continue or finish the linked implementation task, then verify it contains completed acceptance criteria, execution notes, and verification evidence.',
    };
  }
  const terminalMatches = matches.filter((match) => match.closed_corrective_implementation === true);
  if (terminalMatches.length > 0) {
    return {
      status: 'closed_corrective_implementation_coverage',
      reason: 'closed linked task has completed acceptance criteria, execution notes, and verification and is not disposition/audit-only',
      open_task_count: 0,
      historical_task_count: matches.length,
      terminal_task_count: terminalMatches.length,
      tasks: terminalMatches.slice(0, 5),
      actionable_next_states: [],
      remediation: null,
    };
  }
  if (matches.length > 0) {
    return {
      status: 'historical_only_no_open_corrective_task',
      reason: 'linked tasks exist, but they are historical disposition, intake, triage, audit, cluster, inventory, or review work rather than corrective implementation coverage',
      open_task_count: 0,
      historical_task_count: matches.length,
      tasks: matches.slice(0, 5),
      actionable_next_states: correctiveCoverageNextStates(),
      remediation: 'Create or link an implementation task, record an explicit defer/blocker state, or admit a no-action rationale; closed disposition or audit history alone is not terminal corrective coverage.',
    };
  }
  if (item.corrective_action_present || item.severity >= 75) {
    return {
      status: 'missing_corrective_task_coverage',
      reason: 'high-severity or corrective-action CAPA has no linked corrective implementation task coverage',
      open_task_count: 0,
      historical_task_count: 0,
      tasks: [],
      actionable_next_states: correctiveCoverageNextStates(),
      remediation: 'Create or link an implementation task, record an explicit defer/blocker state, or admit a no-action rationale before reporting CAPA terminality.',
    };
  }
  return { status: 'coverage_not_required_by_read_model', reason: 'no corrective action or high-severity pressure detected', open_task_count: 0, historical_task_count: 0, tasks: [], actionable_next_states: [], remediation: null };
}

function correctiveCoverageNextStates() {
  return [
    'linked_corrective_implementation_task',
    'explicit_defer_or_blocker_state',
    'admitted_no_action_rationale',
  ];
}

function isClosedCorrectiveImplementationTask({ row, spec, item, projectedTaskBody = null }) {
  if (!['closed', 'confirmed'].includes(row.status)) return false;
  const title = String(spec?.title ?? row.title ?? '');
  const taskText = [
    title,
    spec?.goal_markdown,
    spec?.context_markdown,
    spec?.required_work_markdown,
    spec?.non_goals_markdown,
    projectedTaskBody ?? readProjectedTaskBody(row.task_id),
  ].filter(Boolean).join('\n');
  const normalized = normalizeLinkText(taskText);
  if (/\b(disposition|intake|triage|audit|cluster|inventory|review)\b/i.test(title)) return false;
  if (!/(implement|implemented|fix|fixed|repair|repaired|guard|guarded|prevent|prevented|refuse|refused|enforce|enforced|validate|validated|test|coverage)/i.test(taskText)) return false;
  if (item.capa_id && !normalized.includes(normalizeLinkText(item.capa_id))) return false;
  const evidence = classifyProjectedTaskEvidence(taskText);
  return evidence.acceptance_complete && evidence.execution_notes_present && evidence.verification_present;
}

function readProjectedTaskBody(taskId) {
  if (!taskId) return '';
  const path = join(siteRoot, '.ai', 'do-not-open', 'tasks', `${taskId}.md`);
  if (!existsSync(path)) return '';
  try {
    return readFileSync(path, 'utf8');
  } catch {
    return '';
  }
}

function classifyProjectedTaskEvidence(body) {
  const acceptanceMatches = [...String(body).matchAll(/^\s*-\s+\[(x|X| )\]\s+\S.*$/gm)];
  const checkedCount = acceptanceMatches.filter((match) => match[1].toLowerCase() === 'x').length;
  return {
    acceptance_complete: acceptanceMatches.length > 0 && checkedCount === acceptanceMatches.length,
    execution_notes_present: sectionHasSubstantiveContent(body, 'Execution Notes'),
    verification_present: sectionHasSubstantiveContent(body, 'Verification'),
  };
}

function sectionHasSubstantiveContent(body, heading) {
  const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = String(body).match(new RegExp(`(?:^|\\n)## ${escaped}\\s*\\n([\\s\\S]*?)(?=\\n## |$)`, 'i'));
  if (!match) return false;
  const normalized = match[1]
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/^\s*[-*]\s*/gm, '')
    .trim();
  return normalized.length >= 20;
}

function normalizeLinkText(value) {
  return String(value ?? '').toLowerCase().replace(/[^a-z0-9_\-]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function finiteNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function stringOrNull(value) {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function buildPostCloseoutContinuation({ agentId, result }) {
  refreshStore();
  const roleResolution = resolveAgentRoleWithDiagnostics(store, siteRoot, agentId);
  const agentRole = roleResolution.role;
  const all = store.getAllLifecycle();
  const board = buildUnifiedWorkboard({ store, siteRoot, agentId, agentRole, allTasks: all, limit: 8 });
  const recommendation = deriveNextRecommendation(board, agentId);
  const correctiveDebtReadiness = buildSharedCorrectiveDebtReadiness({ siteRoot, store, allTasks: all });
  const correctiveDebtRecommendation = deriveCorrectiveDebtRecommendation({
    correctiveDebtReadiness,
    siteRoot,
    store,
    agentRole,
  });
  const finalRecommendation = selectWorkboardRecommendation({
    baseRecommendation: recommendation,
    correctiveDebtRecommendation,
  });
  const workboard = {
    status: 'ok',
    agent_id: agentId,
    agent_role: agentRole,
    role_binding: roleResolution.role_binding,
    role_resolution: roleResolution,
    generated_at: new Date().toISOString(),
    workboard_generated_at: board.generated_at ?? null,
    recommendation: finalRecommendation,
    executable_work_available: Boolean(finalRecommendation),
    agent_actionable_recommendation: Boolean(finalRecommendation),
    environment_pressure: { status: 'clear', executable_by_agent: false, pressure: null },
    corrective_debt_readiness: correctiveDebtReadiness,
    counts: {
      ...board.counts,
      all_in_review: board.counts.pending_reviews,
    },
    downstream_role_followups: (board.downstream_role_followups || []).slice(0, 8),
  };
  return classifyPostCloseoutContinuation({ result, workboard });
}

function buildAgentRelationshipSemantics() {
  return {
    claimed_by: 'active task_assignments row for agent',
    preferred_for: 'preferred_agent_id routing equals agent_id',
    target_role: 'task target_role equals agent role binding',
    review_obligations: 'open directed review_request obligation targets agent or role',
    all_agent_related: 'union of claimed_by, preferred_for, target_role, and review_obligations',
  };
}

function classifyTaskAgentRelationship({ agentId, agentRole, taskId, assignment, routing, reviewTaskIds }) {
  const claimedBy = Boolean(agentId && assignment?.agent_id === agentId);
  const preferredFor = Boolean(agentId && routing?.preferred_agent_id === agentId);
  const targetRoleMatch = Boolean(agentRole && routing?.target_role === agentRole);
  const reviewObligation = Boolean(taskId && reviewTaskIds?.has(taskId));
  return {
    claimed_by: claimedBy,
    preferred_for: preferredFor,
    target_role_match: targetRoleMatch,
    review_obligation: reviewObligation,
    any_agent_related: claimedBy || preferredFor || targetRoleMatch || reviewObligation,
    labels: {
      active_assignment: claimedBy ? 'assigned_to_agent' : 'not_assigned_to_agent',
      preferred_routing: preferredFor ? 'preferred_for_agent' : 'not_preferred_for_agent',
      role_routing: targetRoleMatch ? 'target_role_matches_agent_role' : 'target_role_not_matched_or_absent',
      review: reviewObligation ? 'review_obligation_for_agent' : 'no_review_obligation_for_agent',
    },
  };
}

runStdioServer().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});

async function runStdioServer() {
  let buffer = '';
  process.stdin.setEncoding('utf8');
  for await (const chunk of process.stdin) {
    buffer += chunk;

    let requests = [];
    if (buffer.includes('Content-Length:')) {
      const drained = drainJsonRpcFrames(buffer);
      buffer = drained.remaining;
      requests = drained.requests;
    } else {
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() ?? '';
      requests = lines
        .filter((line) => line.trim().length > 0)
        .map((line) => {
          try {
            return JSON.parse(line);
          } catch {
            return { jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error', data: { line: line.slice(0, 200) } } };
          }
        });
    }

    for (const request of requests) {
      const response = await handleRequest(request);
      if (response) writeMcpFrame(response);
    }
  }
  const trailing = buffer.trim();
  if (trailing.length > 0) {
    for (const request of parseJsonRpcInput(trailing)) {
      const response = await handleRequest(request);
      if (response) writeMcpFrame(response);
    }
  }
}

function writeMcpFrame(response) {
  process.stdout.write(`${JSON.stringify(response)}\n`);
}

async function handleRequest(request) {
  if (!request?.id && typeof request?.method === 'string' && request.method.startsWith('notifications/')) return null;
  // Pass through transport-level parse errors directly
  if (request?.error) {
    return { jsonrpc: '2.0', id: request.id ?? null, error: request.error };
  }
  try {
    const result = await dispatchMethod(request.method, request.params ?? {});
    return { jsonrpc: '2.0', id: request.id ?? null, result };
  } catch (error) {
    return {
      jsonrpc: '2.0',
      id: request?.id ?? null,
      error: {
        code: -32000,
        message: error instanceof Error ? error.message : String(error),
      },
    };
  }
}

async function dispatchMethod(method, params) {
  switch (method) {
    case 'initialize':
      return {
        protocolVersion: params.protocolVersion ?? PROTOCOL_VERSION,
        capabilities: {
          tools: {}
        },
        serverInfo: {
          name: 'narada-task-lifecycle-mcp',
          version: '0.1.0'
        }
      };
    case 'tools/list':
      return {
        tools: taskLifecycleTools()
      };
    case 'tools/call':
      return await callTool(params);
    default:
      throw new Error(`unsupported_mcp_method: ${method}`);
  }
}

function isStoreError(error) {
  const msg = error instanceof Error ? error.message : String(error);
  return /database|sqlite|SQLITE|disk I\/O|malformed|not a database/i.test(msg);
}

/**
 * Best-effort session identity verification.
 * If NARADA_AGENT_ID is set in the MCP server environment and the caller's agent_id
 * does not match, returns an identity_mismatch warning object.
 * This is advisory (does not block) to avoid breaking sessions where env is not propagated.
 */
function verifySessionIdentity(agentId) {
  if (!SESSION_IDENTITY || !agentId) return null;
  if (SESSION_IDENTITY !== agentId) {
    return {
      identity_mismatch: true,
      session_identity: SESSION_IDENTITY,
      requested_identity: agentId,
      warning: `SESSION IDENTITY MISMATCH: You are operating as ${SESSION_IDENTITY}, but requested action as ${agentId}. ` +
        `If you intended to act as ${agentId}, re-start the session with NARADA_AGENT_ID=${agentId}. ` +
        `Otherwise, correct the agent_id parameter to ${SESSION_IDENTITY}.`,
    };
  }
  return null;
}

/**
 * Hard session identity enforcement for mutating operations.
 * If NARADA_AGENT_ID is set and the caller's agent_id does not match,
 * throws an error that blocks the operation.
 * Grace period: if NARADA_AGENT_ID is not set, this is a no-op.
 */
function enforceSessionIdentity(agentId) {
  if (!SESSION_IDENTITY || !agentId) return;
  if (SESSION_IDENTITY !== agentId) {
    throw new Error(
      `identity_mismatch_blocked: SESSION IDENTITY MISMATCH. ` +
      `You are operating as ${SESSION_IDENTITY}, but requested a mutating action as ${agentId}. ` +
      `Re-start the session with NARADA_AGENT_ID=${agentId}, or correct the agent_id parameter to ${SESSION_IDENTITY}.`
    );
  }
}

async function callTool(params) {
  const record = asRecord(params);
  const name = stringField(record, 'name');
  const args = asRecord(record.arguments);
  if (!name) throw new Error('tools_call_requires_name');

  const canonicalName = TOOL_ALIASES[name] ?? name;
  activeOutputToolName = canonicalName;
  const payloadResolution = !canonicalName.startsWith('mcp_command_') && (stringField(args, 'payload_ref') || stringField(args, 'payload_path'))
    ? resolveToolPayloadArgs({
      siteRoot,
      toolName: canonicalName,
      args,
      allowedTools: taskLifecycleTools().map((tool) => tool.name),
    })
    : { args, payloadSource: null };
  const resolvedArgs = payloadResolution.args;
  if (canonicalName === 'task_lifecycle_create') {
    const createArgs = resolveTaskCreatePayloadArgs(args);
    const locusGuard = guardLifecycleTargetLocus(canonicalName, createArgs.args);
    if (locusGuard.status === 'refused') return jsonToolResult(locusGuard, true);
    return await dispatchTool(canonicalName, createArgs.args, { payloadSource: createArgs.payloadSource });
  }
  if (canonicalName === 'task_lifecycle_create_task_batch') {
    const createArgs = resolveTaskBatchCreatePayloadArgs(args);
    const locusGuard = guardLifecycleTargetLocus(canonicalName, createArgs.args);
    if (locusGuard.status === 'refused') return jsonToolResult(locusGuard, true);
    return await dispatchTool(canonicalName, createArgs.args, { payloadSource: createArgs.payloadSource });
  }

  const toolDef = taskLifecycleTools().find((t) => t.name === canonicalName);
  if (toolDef?.inputSchema) {
    const validationErrors = validateArgs(canonicalName, resolvedArgs, toolDef.inputSchema);
    if (validationErrors) {
      return jsonToolResult({
        status: 'error',
        schema: 'narada.task.mcp.validation_error.v0',
        validation_errors: validationErrors,
      }, true);
    }
  }
  if (!payloadResolution.payloadSource) {
    try {
      enforceInlinePayloadLimit({ toolName: canonicalName, args: resolvedArgs, allowPayloadCreation: true });
    } catch (error) {
      if (String(error?.message ?? '').startsWith('inline_payload_too_long:')) {
        return jsonToolResult(buildInlinePayloadRemediation(canonicalName, error), true);
      }
      throw error;
    }
  }
  const locusGuard = guardLifecycleTargetLocus(canonicalName, resolvedArgs);
  if (locusGuard.status === 'refused') return jsonToolResult(locusGuard, true);

  try {
    return await dispatchTool(canonicalName, resolvedArgs, { payloadSource: payloadResolution.payloadSource });
  } catch (error) {
    if (isStoreError(error)) {
      const refreshed = refreshStore();
      if (refreshed) {
        try {
          return await dispatchTool(canonicalName, resolvedArgs, { payloadSource: payloadResolution.payloadSource });
        } catch (retryError) {
          if (isStoreError(retryError)) {
            throw new Error(`store_unavailable: ${retryError instanceof Error ? retryError.message : String(retryError)}`);
          }
          throw retryError;
        }
      }
      throw new Error(`store_unavailable: ${error instanceof Error ? error.message : String(error)}`);
    }
    throw error;
  }
}

function resolveTaskCreatePayloadArgs(args) {
  const input = asRecord(args);
  const inlineTaskFields = [
    'title',
    'goal',
    'context',
    'required_work',
    'non_goals',
    'acceptance_criteria',
    'preferred_role',
    'target_role',
    'execution_window',
    'execution_not_before',
    'execution_not_after',
  ];
  const inlineFields = inlineTaskFields.filter((field) => Object.prototype.hasOwnProperty.call(input, field));
  if (inlineFields.length > 0) {
    throw new Error(`task_lifecycle_create_inline_definition_refused: task definition fields must be supplied by immutable payload_ref, not inline tool arguments; fields=${inlineFields.join(',')}`);
  }
  if (Object.prototype.hasOwnProperty.call(input, 'payload_path')) {
    throw new Error('task_lifecycle_create_payload_path_refused: task_lifecycle_create requires immutable payload_ref, not payload_path');
  }
  if (!stringField(input, 'payload_ref')) {
    throw new Error('task_lifecycle_create_requires_payload_ref');
  }
  const payloadResolution = resolveToolPayloadArgs({
    siteRoot,
    toolName: 'task_lifecycle_create',
    args: input,
    allowedTools: ['task_lifecycle_create'],
  });
  if (!payloadResolution.payloadSource?.ref) {
    throw new Error('task_lifecycle_create_requires_payload_ref');
  }
  validateTaskCreatePayload(payloadResolution.args);
  return payloadResolution;
}

function validateTaskCreatePayload(args) {
  const title = stringField(args, 'title');
  if (!title) throw new Error('task_lifecycle_create_payload_title_required');
  if (args.acceptance_criteria !== undefined && (!Array.isArray(args.acceptance_criteria) || args.acceptance_criteria.some((item) => typeof item !== 'string'))) {
    throw new Error('task_lifecycle_create_payload_acceptance_criteria_must_be_string_array');
  }
  const executionWindow = normalizeExecutionWindow(args);
  if (executionWindow.errors.length > 0) throw new Error(`task_lifecycle_create_payload_execution_window_invalid: ${JSON.stringify(executionWindow.errors)}`);
  for (const field of ['goal', 'context', 'required_work', 'non_goals', 'preferred_role', 'target_role']) {
    if (args[field] !== undefined && args[field] !== null && typeof args[field] !== 'string') {
      throw new Error(`task_lifecycle_create_payload_${field}_must_be_string`);
    }
  }
}

function resolveTaskBatchCreatePayloadArgs(args) {
  const input = asRecord(args);
  const inlineBatchFields = ['chapter', 'shared', 'tasks', 'dry_run'];
  const inlineFields = inlineBatchFields.filter((field) => Object.prototype.hasOwnProperty.call(input, field));
  if (inlineFields.length > 0) {
    throw new Error(`task_lifecycle_create_task_batch_inline_definition_refused: batch definition fields must be supplied by immutable payload_ref, not inline tool arguments; fields=${inlineFields.join(',')}`);
  }
  if (Object.prototype.hasOwnProperty.call(input, 'payload_path')) {
    throw new Error('task_lifecycle_create_task_batch_payload_path_refused: task_lifecycle_create_task_batch requires immutable payload_ref, not payload_path');
  }
  if (!stringField(input, 'payload_ref')) {
    throw new Error('task_lifecycle_create_task_batch_requires_payload_ref');
  }
  const payloadResolution = resolveToolPayloadArgs({
    siteRoot,
    toolName: 'task_lifecycle_create_task_batch',
    args: input,
    allowedTools: ['task_lifecycle_create_task_batch'],
  });
  if (!payloadResolution.payloadSource?.ref) {
    throw new Error('task_lifecycle_create_task_batch_requires_payload_ref');
  }
  validateTaskBatchCreatePayload(payloadResolution.args);
  return payloadResolution;
}

function validateTaskBatchCreatePayload(args) {
  const tasks = Array.isArray(args.tasks) ? args.tasks : null;
  if (!tasks || tasks.length === 0) throw new Error('task_lifecycle_create_task_batch_payload_tasks_required');
  if (tasks.length > 50) throw new Error('task_lifecycle_create_task_batch_too_many_tasks');
  const chapter = asRecord(args.chapter);
  if (args.chapter !== undefined && !stringField(chapter, 'title')) throw new Error('task_lifecycle_create_task_batch_chapter_title_required');
  const shared = asRecord(args.shared);
  validateBatchSpecRecord(shared, 'shared', { allowMissingTitle: true });
  for (const [index, task] of tasks.entries()) {
    const record = asRecord(task);
    validateBatchSpecRecord(record, `tasks_${index}`, { allowMissingTitle: false });
  }
}

function validateBatchSpecRecord(record, label, { allowMissingTitle }) {
  void allowMissingTitle;
  if (record.acceptance_criteria !== undefined && (!Array.isArray(record.acceptance_criteria) || record.acceptance_criteria.some((item) => typeof item !== 'string'))) {
    throw new Error(`task_lifecycle_create_task_batch_${label}_acceptance_criteria_must_be_string_array`);
  }
  if (record.dependencies !== undefined && (!Array.isArray(record.dependencies) || record.dependencies.some((item) => typeof item !== 'number' && typeof item !== 'string'))) {
    throw new Error(`task_lifecycle_create_task_batch_${label}_dependencies_must_be_string_or_number_array`);
  }
  for (const field of ['title', 'goal', 'context', 'required_work', 'non_goals', 'preferred_role', 'target_role']) {
    if (record[field] !== undefined && record[field] !== null && typeof record[field] !== 'string') {
      throw new Error(`task_lifecycle_create_task_batch_${label}_${field}_must_be_string`);
    }
  }
}

function buildLifecycleTargetLocusStatus() {
  const operatorStatedRoot = process.env.NARADA_OPERATOR_STATED_SITE_ROOT
    || process.env.NARADA_REQUESTED_WORK_ROOT
    || process.env.NARADA_TARGET_SITE_ROOT
    || null;
  const resolvedOperatorRoot = operatorStatedRoot ? resolve(String(operatorStatedRoot)) : null;
  const mismatch = resolvedOperatorRoot && resolve(String(resolvedOperatorRoot)).toLowerCase() !== resolve(siteRoot).toLowerCase();
  return {
    schema: 'narada.task_lifecycle.target_locus_guard.v0',
    default_target_site_root: siteRoot,
    operator_stated_locus_root: resolvedOperatorRoot,
    status: mismatch ? 'operator_stated_locus_mismatch' : 'clear',
    explicit_target_site_root_supported: false,
    rule: 'Task lifecycle MCP is bound to its --site-root. Startup/control-surface identity does not authorize mutating a different requested work substrate.',
  };
}

function guardLifecycleTargetLocus(canonicalName, args) {
  if (!LOCUS_GUARDED_MUTATION_TOOLS.has(canonicalName)) return { status: 'clear' };
  if ((canonicalName === 'task_lifecycle_bridge_poll' || canonicalName === 'task_lifecycle_inbox_target') && booleanField(args, 'dry_run') === true) {
    return { status: 'clear' };
  }
  const status = buildLifecycleTargetLocusStatus();
  if (status.status === 'clear') return status;
  return {
    status: 'refused',
    refusal_code: 'target_locus_preflight_required',
    tool_name: canonicalName,
    ...status,
    remediation: 'Relaunch the task lifecycle MCP for the intended Site, clear the operator-stated locus after explicit correction, or use a mutation surface that accepts explicit target_site_root.',
  };
}

function buildTaskLifecycleDoctorSummary({ registeredTools }) {
  const registry = genericCommandRegistrySummary();
  const freshness = buildTaskLifecycleFreshness({ registeredTools });
  return {
    status: 'ok',
    site_root: siteRoot,
    authority_posture: 'facade_only',
    surface_type: 'task_lifecycle_mcp',
    target_locus_guard: buildLifecycleTargetLocusStatus(),
    tool_surface: freshness.tool_surface ?? {
      expected_count: taskLifecycleTools().length,
      registered_count: registeredTools.length,
      missing_expected_tools: [],
    },
    mcp_freshness: {
      source_digest: freshness.source_digest,
      baseline_source_digest: freshness.baseline_source_digest,
      source_digest_changed: freshness.source_digest_changed === true,
      stale_live_surface_possible: freshness.stale_live_surface_possible === true,
      pending_restart: freshness.pending_restart === true,
      restart_request_state: freshness.restart_request?.state ?? null,
      freshness_basis: freshness.freshness_basis,
    },
    catalog_summary: {
      allowed_tools_count: registeredTools.length,
      canonical_tools_count: registeredTools.length,
      deprecated_aliases_count: Object.keys(TOOL_ALIASES).length,
      generic_command_registry_count: registry.count,
      generic_command_registry_domains: registry.domains,
      generic_command_schema_count: registry.supported_command_schemas?.length ?? registry.count,
      watched_paths: freshness.watched_paths,
    },
  };
}

async function dispatchTool(canonicalName, args, dispatchContext = {}) {
  switch (canonicalName) {
    case 'task_lifecycle_doctor': {
      const registeredTools = taskLifecycleTools().map((t) => t.name);
      return jsonToolResult(buildTaskLifecycleDoctorSummary({ registeredTools }));
    }
    case 'task_lifecycle_restart':
      return jsonToolResult(taskLifecycleRestart(args));
    case 'task_lifecycle_list': {
      const statusFilter = stringField(args, 'status');
      const agentFilter = stringField(args, 'agent_id');
      const limit = numberField(args, 'limit') ?? 50;
      const queryMode = stringField(args, 'query_mode') ?? (agentFilter ? 'claimed_by' : 'all');
      const allowedModes = new Set(['all', 'claimed_by', 'preferred_for', 'target_role', 'review_obligations', 'all_agent_related']);
      if (!allowedModes.has(queryMode)) throw new Error('invalid_query_mode');
      if (queryMode !== 'all' && !agentFilter) throw new Error('agent_id_required_for_query_mode');
      const rows = store.db.prepare('SELECT * FROM task_lifecycle ORDER BY task_number DESC').all();
      const roleResolution = agentFilter ? resolveAgentRoleWithDiagnostics(store, siteRoot, agentFilter) : null;
      const reviewObligations = agentFilter
        ? store.listDirectedObligationsForTarget(agentFilter, roleResolution?.role, 'open').filter((o) => o.kind === 'review_request')
        : [];
      const reviewTaskIds = new Set(reviewObligations.map((o) => o.task_id).filter(Boolean));
      const tasks = rows.map((row) => {
        const spec = store.getTaskSpec(row.task_id);
        const assignment = store.db.prepare("SELECT * FROM task_assignments WHERE task_id = ? AND released_at IS NULL ORDER BY claimed_at DESC LIMIT 1").get(row.task_id);
        const routing = getTaskRouting(store, row.task_id);
        const executionWindow = readTaskExecutionWindow(store, row.task_id);
        const executionWindowState = classifyExecutionWindow(executionWindow);
        const relationship = classifyTaskAgentRelationship({
          agentId: agentFilter,
          agentRole: roleResolution?.role ?? null,
          taskId: row.task_id,
          assignment,
          routing,
          reviewTaskIds,
        });
        return {
          task_number: row.task_number,
          task_id: row.task_id,
          status: row.status,
          title: spec?.title ?? null,
          active_assignment: assignment ? {
            assigned_agent: assignment.agent_id,
            claimed_at: assignment.claimed_at,
            assignment_id: assignment.assignment_id,
          } : null,
          assigned_to: assignment?.agent_id ?? null,
          claimed_at: assignment?.claimed_at ?? null,
          routing,
          execution_window: executionWindow,
          execution_window_state: executionWindowState,
          agent_relationship: relationship,
          updated_at: row.updated_at,
        };
      });
      const filtered = tasks.filter((t) => {
        if (statusFilter && t.status !== statusFilter) return false;
        if (queryMode === 'claimed_by' && !t.agent_relationship.claimed_by) return false;
        if (queryMode === 'preferred_for' && !t.agent_relationship.preferred_for) return false;
        if (queryMode === 'target_role' && !t.agent_relationship.target_role_match) return false;
        if (queryMode === 'review_obligations' && !t.agent_relationship.review_obligation) return false;
        if (queryMode === 'all_agent_related' && !t.agent_relationship.any_agent_related) return false;
        return true;
      }).slice(0, limit);
      return jsonToolResult({
        status: 'ok',
        count: filtered.length,
        query_mode: queryMode,
        agent_id: agentFilter ?? null,
        agent_role: roleResolution?.role ?? null,
        semantics: buildAgentRelationshipSemantics(),
        tasks: filtered,
      });
    }

    case 'task_lifecycle_diagnose_task_ref': {
      const inputTaskId = stringField(args, 'task_id');
      const inputTaskNumber = numberField(args, 'task_number');
      if (!inputTaskId && !inputTaskNumber) throw new Error('task_ref_required');
      const lifecycleById = inputTaskId ? store.getLifecycle(inputTaskId) : undefined;
      const lifecycleByNumber = inputTaskNumber ? store.getLifecycleByNumber(inputTaskNumber) : undefined;
      const collision = Boolean(lifecycleById && lifecycleByNumber && lifecycleById.task_id !== lifecycleByNumber.task_id);
      const lifecycle = lifecycleById ?? lifecycleByNumber;
      const taskId = lifecycle?.task_id ?? inputTaskId ?? null;
      const taskNumber = lifecycle?.task_number ?? inputTaskNumber ?? null;
      const spec = taskId ? store.getTaskSpec(taskId) : undefined;
      let taskFile = null;
      if (taskNumber !== null) {
        try {
          taskFile = await findTaskFile(siteRoot, String(taskNumber));
        } catch {
          taskFile = null;
        }
      }
      const refIds = [...new Set([inputTaskId, inputTaskNumber === undefined ? null : String(inputTaskNumber)].filter(Boolean))];
      const directiveRefs = refIds.length === 0
        ? []
        : store.db.prepare(`
          SELECT dr.directive_id, dr.ref_id, dr.locus, dr.relation,
                 CASE WHEN d.directive_id IS NULL THEN 0 ELSE 1 END AS directive_present
          FROM directive_refs dr
          LEFT JOIN directive_records d ON d.directive_id = dr.directive_id
          WHERE dr.ref_kind = 'task' AND dr.ref_id IN (${refIds.map(() => '?').join(', ')})
          ORDER BY dr.directive_id, dr.ref_id
        `).all(...refIds);
      const unsafeDirectiveRefs = directiveRefs.filter((ref) => !ref.directive_present || (taskId && ref.ref_id !== taskId && ref.ref_id !== String(taskNumber)));
      return jsonToolResult({
        schema: 'narada.task.reference_diagnosis.v0',
        status: 'ok',
        input: { task_id: inputTaskId ?? null, task_number: inputTaskNumber ?? null },
        resolved: { task_id: taskId, task_number: taskNumber },
        collision: {
          detected: collision,
          task_id_match: lifecycleById ? lifecycleById.task_id : null,
          task_number_match: lifecycleByNumber ? lifecycleByNumber.task_id : null,
        },
        projections: {
          lifecycle_present: Boolean(lifecycle),
          task_spec_present: Boolean(spec),
          task_file_present: Boolean(taskFile),
        },
        directive_references: {
          count: directiveRefs.length,
          unsafe_count: unsafeDirectiveRefs.length,
          refs: directiveRefs,
          unsafe_refs: unsafeDirectiveRefs,
        },
        safe_for_closeout: Boolean(lifecycle && spec && !collision && unsafeDirectiveRefs.length === 0),
      });
    }

    case 'task_lifecycle_show': {
      const taskNumber = numberField(args, 'task_number');
      if (!taskNumber) throw new Error('task_number_required');
      const lifecycle = store.getLifecycleByNumber(taskNumber);
      if (!lifecycle) throw new Error(`task_not_found: ${taskNumber}`);
      const spec = store.getTaskSpec(lifecycle.task_id);
      const routing = getTaskRouting(store, lifecycle.task_id);
      const rolePolicy = resolveTaskRolePolicy({ siteRoot, taskSpec: spec });
      const executionWindow = readTaskExecutionWindow(store, lifecycle.task_id);
      const executionWindowState = classifyExecutionWindow(executionWindow);
      const assignment = store.db.prepare("SELECT * FROM task_assignments WHERE task_id = ? AND released_at IS NULL ORDER BY claimed_at DESC LIMIT 1").get(lifecycle.task_id);
      const observations = store.db.prepare("SELECT * FROM observation_artifacts WHERE task_id = ? ORDER BY created_at DESC").all(lifecycle.task_id);
      const reviewRows = store.db.prepare("SELECT * FROM task_reviews WHERE task_id = ? ORDER BY reviewed_at DESC").all(lifecycle.task_id);
      const assignmentIntents = store.listAssignmentIntentsForTask ? store.listAssignmentIntentsForTask(lifecycle.task_id) : [];
      const reviews = reviewRows.map((r) => ({
        review_id: r.review_id,
        reviewer_agent_id: r.reviewer_agent_id,
        verdict: r.verdict,
        reviewed_at: r.reviewed_at,
        single_operator_meta: getSingleOperatorReviewMeta(r),
        review_independence: getReviewIndependenceMeta(store, r),
        acceptance_provenance: getReviewAcceptanceProvenance(store, r),
      }));
      let body = null;
      try {
        const taskFile = await findTaskFile(siteRoot, String(taskNumber));
        if (taskFile) {
          const fileData = await readTaskFile(taskFile.path);
          body = fileData.body;
        }
      } catch {
        // ignore missing or unreadable task file
      }
      return jsonToolResult({
        status: 'ok',
        task_number: taskNumber,
        task_id: lifecycle.task_id,
        lifecycle,
        closure_authority: deriveClosureAuthority(lifecycle),
        execution_window: executionWindow,
        execution_window_state: executionWindowState,
        spec: spec ? { ...spec, target_role: routing.target_role, preferred_agent_id: routing.preferred_agent_id, execution_window: executionWindow, execution_window_state: executionWindowState } : null,
        routing,
        role_policy: rolePolicy,
        active_assignment: assignment ?? null,
        assignment_intents: assignmentIntents,
        observations: observations ?? [],
        reviews: reviews ?? [],
        body,
      });
    }

    case 'task_lifecycle_roster': {
      const roster = store.getRoster();
      return jsonToolResult({ status: 'ok', roster: roster ?? [] });
    }

    case 'task_lifecycle_roster_admit': {
      return jsonToolResult(admitRosterIdentity(args));
    }

    case 'task_lifecycle_claim': {
      const outcome = await claimTaskLifecycleWithGuards(args);
      return jsonToolResult(withTaskClaimFacadeCompatibility(outcome.result, args), outcome.isError);
    }

    case 'task_lifecycle_continue': {
      const taskNumber = numberField(args, 'task_number');
      const agentId = stringField(args, 'agent_id');
      const reason = stringField(args, 'reason');
      if (!taskNumber) throw new Error('task_number_required');
      if (!agentId) throw new Error('agent_id_required');
      if (!reason) throw new Error('reason_required');
      enforceSessionIdentity(agentId);
      const lifecycle = store.getLifecycleByNumber(taskNumber);
      if (!lifecycle) throw new Error(`task_not_found: ${taskNumber}`);
      const executionWindowGate = evaluateExecutionWindowMutationGate({ store, lifecycle, args, mutation: 'continue' });
      if (executionWindowGate.status === 'blocked') return jsonToolResult(executionWindowGate, true);

      // Role eligibility check
      const eligibility = checkTaskRoleEligibilityLocal({ store, siteRoot, taskId: lifecycle.task_id, taskNumber, agentId });
      if (!eligibility.eligible) {
        return jsonToolResult({
          status: 'role_mismatch',
          task_number: taskNumber,
          target_role: eligibility.targetRole,
          agent_role: eligibility.agentRole,
          role_resolution: eligibility.roleResolution,
          role_policy: eligibility.rolePolicy,
          role_mismatch_warning: eligibility.roleMismatchWarning,
          message: eligibility.warning,
        }, true);
      }

      const result = await withAuthoredRosterJsonPreserved(siteRoot, () => continueTaskService({ cwd: siteRoot, taskNumber, agent: agentId, reason }));
      const output = result.result || result;
      if (output && typeof output === 'object') {
        output.role_policy = eligibility.rolePolicy;
        if (eligibility.roleMismatchWarning) {
          output.role_mismatch_warning = eligibility.roleMismatchWarning;
          output.pre_continue_warnings = [eligibility.roleMismatchWarning];
        }
      }
      return jsonToolResult(output, result.exitCode !== 0);
    }

    case 'task_lifecycle_dependency_disposition_record': {
      const dependencyId = stringField(args, 'dependency_id');
      const agentId = stringField(args, 'agent_id');
      const kind = stringField(args, 'kind');
      const summary = stringField(args, 'summary');
      if (!dependencyId) throw new Error('dependency_id_required');
      if (!agentId) throw new Error('agent_id_required');
      if (!kind) throw new Error('kind_required');
      if (!summary) throw new Error('summary_required');
      enforceSessionIdentity(agentId);
      const allowedKinds = new Set([
        'remediation_task',
        'covered_by_existing_task',
        'routed_obligation',
        'operator_decision_required',
        'operator_deferred',
        'out_of_scope_or_rejected',
      ]);
      if (!allowedKinds.has(kind)) throw new Error('invalid_dependency_disposition_kind');
      const dependency = store.getTaskDependency(dependencyId);
      if (!dependency) throw new Error(`dependency_not_found: ${dependencyId}`);
      const latestOutcome = store.getLatestTaskOutcome(dependency.required_task_id);
      const requiredOutcomeId = stringField(args, 'required_outcome_id') ?? latestOutcome?.outcome_id;
      if (!requiredOutcomeId) throw new Error('required_outcome_id_required_without_outcome');
      const authorityBasis = args.authority_basis ?? null;
      if ((kind === 'operator_deferred' || kind === 'out_of_scope_or_rejected')
        && (!authorityBasis || typeof authorityBasis !== 'object' || !authorityBasis.kind || !authorityBasis.summary)) {
        throw new Error('authority_basis_required_for_disposition');
      }
      const targetTaskId = stringField(args, 'target_task_id') ?? null;
      if (targetTaskId && !store.getLifecycle(targetTaskId)) throw new Error(`target_task_not_found: ${targetTaskId}`);
      const routedObligationId = stringField(args, 'routed_obligation_id') ?? null;
      if (routedObligationId && !store.getDirectedObligation(routedObligationId)) throw new Error(`routed_obligation_not_found: ${routedObligationId}`);
      const requestedStatus = stringField(args, 'status');
      const status = requestedStatus ?? ((kind === 'operator_deferred' || kind === 'out_of_scope_or_rejected') ? 'deferred' : 'open');
      if (!new Set(['open', 'deferred', 'resolved', 'superseded']).has(status)) throw new Error('invalid_dependency_disposition_status');
      const disposition = {
        disposition_id: `tdisp_${randomUUID()}`,
        dependency_id: dependencyId,
        required_outcome_id: requiredOutcomeId,
        kind,
        status,
        target_task_id: targetTaskId,
        routed_obligation_id: routedObligationId,
        authority_basis_json: authorityBasis ? JSON.stringify(authorityBasis) : JSON.stringify({ kind: 'agent_record', summary: `Recorded by ${agentId}` }),
        summary,
        created_by: agentId,
        created_at: new Date().toISOString(),
      };
      store.upsertTaskDependencyDisposition(disposition);
      return jsonToolResult({
        schema: 'narada.task.dependency_disposition.v0',
        status: 'recorded',
        disposition,
        dependency_satisfaction: evaluateTaskDependencySatisfaction(store, dependency.parent_task_id),
      });
    }

    case 'task_lifecycle_unclaim': {
      const taskNumber = numberField(args, 'task_number');
      const agentId = stringField(args, 'agent_id');
      const reason = stringField(args, 'reason') ?? 'mcp_unclaim';
      if (!taskNumber) throw new Error('task_number_required');
      if (agentId) enforceSessionIdentity(agentId);
      const serviceResult = await unclaimLifecycleTask({ siteRoot, store, taskNumber, agentId, reason });
      return jsonToolResult(serviceResult, ['not_claimed', 'claimed_by_other', 'closure_authority_blocks_unclaim'].includes(serviceResult.status));
    }

    case 'task_lifecycle_next': {
      const agentId = stringField(args, 'agent_id');
      const limit = numberField(args, 'limit') ?? 8;
      const lastWorkboardCheckAt = stringField(args, 'last_workboard_check_at');
      if (!agentId) throw new Error('agent_id_required');

      const roleResolution = resolveAgentRoleWithDiagnostics(store, siteRoot, agentId);
      const agentRole = roleResolution.role;

      const all = store.getAllLifecycle();
      const executionWindowSummary = summarizeExecutionWindowGates(store, all);
      const allForWorkboard = all.filter((task) => !executionWindowSummary.hidden_task_ids.has(task.task_id));
      const board = buildUnifiedWorkboard({ store, siteRoot, agentId, agentRole, allTasks: allForWorkboard, limit });
      const correctiveDebtReadiness = buildSharedCorrectiveDebtReadiness({ siteRoot, store, allTasks: all });

      const recommendation = deriveNextRecommendation(board, agentId);
      const correctiveDebtRecommendation = deriveCorrectiveDebtRecommendation({
        correctiveDebtReadiness,
        siteRoot,
        store,
        agentRole,
      });
      const mcpFreshness = buildTaskLifecycleFreshness({ registeredTools: taskLifecycleTools().map((t) => t.name) });
      const mcpRestartPressure = buildMcpRestartPressure([mcpFreshness]);
      const staleLiveNavigation = buildStaleLiveNavigationDegradation(mcpRestartPressure);
      const restartRecommendation = deriveMcpRestartPressureRecommendation(mcpRestartPressure);
      const environmentPressure = restartRecommendation ? {
        status: 'active',
        executable_by_agent: false,
        pressure: restartRecommendation,
      } : { status: 'clear', executable_by_agent: false, pressure: null };
      const finalRecommendation = selectWorkboardRecommendation({
        baseRecommendation: recommendation,
        correctiveDebtRecommendation,
      });
      const myInProgress = board.in_progress.filter((t) => t.assigned_agent === agentId);
      const myNeedsContinuation = board.needs_continuation.filter((t) => t.assigned_agent === agentId);

      // pending_reviews = only in_review tasks that the agent has an open review obligation for
      const obligatedTaskIds = new Set(board.my_review_obligations.map((o) => o.task_id));
      const pending_reviews = board.pending_reviews.filter((t) => obligatedTaskIds.has(t.task_id));

      const responseCounts = {
        ...board.counts,
        all_in_review: board.counts.pending_reviews,
        corrective_debt_active: correctiveDebtReadiness.counts.active_total,
        corrective_debt_high_severity: correctiveDebtReadiness.counts.high_severity,
        corrective_debt_missing_coverage: correctiveDebtReadiness.counts.missing_corrective_task_coverage,
      };

      const identityBanner = `>>> YOU ARE QUERYING AS: ${agentId}${agentRole ? ` (${agentRole})` : ''} <<<`;
      const identityWarning = verifySessionIdentity(agentId);
      const responseGeneratedAt = new Date().toISOString();
      const workloopGuidance = buildWorkloopGuidance({
        agentId,
        agentRole,
        recommendation: finalRecommendation,
        executableWorkAvailable: Boolean(finalRecommendation),
      });

      return jsonToolResult({
        status: 'ok',
        agent_id: agentId,
        agent_role: agentRole,
        role_binding: roleResolution.role_binding,
        role_resolution: roleResolution,
        identity_banner: identityBanner,
        identity_warning: identityWarning,
        stale_live_navigation: staleLiveNavigation,
        navigation_critical_field_quality: staleLiveNavigation.field_quality,
        stale_live_warning: staleLiveNavigation.warning,
        workloop_authority: workloopGuidance.authority,
        workloop_summary: workloopGuidance.summary,
        agent_relationship_semantics: buildAgentRelationshipSemantics(),
        large_output_handling: workloopGuidance.large_output_handling,
        recommendation: finalRecommendation,
        execution_window_gates: executionWindowSummary.public,
        executable_work_available: Boolean(finalRecommendation),
        agent_actionable_recommendation: Boolean(finalRecommendation),
        environment_pressure: environmentPressure,
        blocked_external: !finalRecommendation && restartRecommendation ? environmentPressure : null,
        recommendation_quality: staleLiveNavigation.field_quality.recommendation,
        in_progress: myInProgress.slice(0, limit),
        needs_continuation: myNeedsContinuation.slice(0, limit),
        pending_reviews: pending_reviews.slice(0, limit),
        all_in_review: board.pending_reviews.slice(0, limit),
        reviewed_closeouts: (board.reviewed_closeouts || []).slice(0, limit),
        local_followups: board.local_followups.slice(0, limit),
        role_wide_followups: (board.role_wide_followups || []).slice(0, limit),
        non_actionable_parent_followups: (board.non_actionable_parent_followups || []).slice(0, limit),
        closure_authority_conflicts: (board.closure_authority_conflicts || []).slice(0, limit),
        downstream_role_followups: (board.downstream_role_followups || []).slice(0, limit),
        claimed_terminal_blocked: (board.claimed_terminal_blocked || []).slice(0, limit),
        my_review_obligations: board.my_review_obligations.slice(0, limit),
        blocked_review_obligations: (board.blocked_review_obligations || []).slice(0, limit),
        deferred: board.deferred.slice(0, limit),
        actionable_deferred: board.actionable_deferred.slice(0, limit),
        inbox_backlog: board.inbox_backlog.slice(0, limit),
        inbox_linked_task_suppressed: (board.inbox_linked_task_suppressed || []).slice(0, limit),
        inbox_index: board.inbox_index ?? null,
        corrective_debt_readiness: correctiveDebtReadiness,
        recommendations: [
          ...(restartRecommendation ? [{
            type: 'mcp_restart_pressure',
            priority: staleLiveNavigation.status === 'degraded' ? 0 : 9,
            action: restartRecommendation.action,
            title: restartRecommendation.reason,
            authority_boundary: restartRecommendation.authority_boundary,
            agent_actionable: restartRecommendation.authority_boundary?.agent_can_execute_restart === true,
          }] : []),
          ...(correctiveDebtRecommendationListItem(correctiveDebtRecommendation) ? [correctiveDebtRecommendationListItem(correctiveDebtRecommendation)] : []),
          ...board.recommendations,
        ].slice(0, limit),
        new_tasks_available: board.new_tasks_available ?? false,
        recently_materialized: (board.recently_materialized || []).slice(0, limit),
        counts: responseCounts,
        schema: 'narada.task.mcp.next.v3',
        generated_at: responseGeneratedAt,
        workboard_generated_at: board.generated_at ?? null,
        state_freshness: computeStateFreshness(lastWorkboardCheckAt, responseGeneratedAt),
        mcp_freshness: mcpFreshness,
        mcp_restart_pressure: mcpRestartPressure,
      });
    }

    case 'task_lifecycle_workboard_snapshot': {
      const agentId = stringField(args, 'agent_id');
      const limit = numberField(args, 'limit') ?? 8;
      const lastWorkboardCheckAt = stringField(args, 'last_workboard_check_at');
      const previousSnapshot = objectField(args, 'previous_snapshot');
      if (!agentId) throw new Error('agent_id_required');

      const roleResolution = resolveAgentRoleWithDiagnostics(store, siteRoot, agentId);
      const agentRole = roleResolution.role;
      const all = store.getAllLifecycle();
      const board = buildUnifiedWorkboard({ store, siteRoot, agentId, agentRole, allTasks: all, limit });
      const generatedAt = new Date().toISOString();
      const recommendation = deriveNextRecommendation(board, agentId);
      const myInProgress = board.in_progress.filter((t) => t.assigned_agent === agentId);
      const myNeedsContinuation = board.needs_continuation.filter((t) => t.assigned_agent === agentId);
      const obligatedTaskIds = new Set(board.my_review_obligations.map((o) => o.task_id));
      const pendingReviews = board.pending_reviews.filter((t) => obligatedTaskIds.has(t.task_id));
      const responseCounts = { ...board.counts, all_in_review: board.counts.pending_reviews };
      const snapshot = buildWorkboardSnapshotPacket({
        agentId,
        agentRole,
        roleBinding: roleResolution.role_binding,
        generatedAt,
        board,
        recommendation,
        myInProgress,
        myNeedsContinuation,
        pendingReviews,
        responseCounts,
        lastWorkboardCheckAt,
        previousSnapshot,
        limit,
      });
      return jsonToolResult(snapshot);
    }

    case 'task_lifecycle_obligations': {
      const agentId = stringField(args, 'agent_id');
      const status = stringField(args, 'status') || 'open';
      if (!agentId) throw new Error('agent_id_required');
      const roleResolution = resolveAgentRoleWithDiagnostics(store, siteRoot, agentId);
      const agentRole = roleResolution.role;
      const obligations = store.listDirectedObligationsForTarget(agentId, agentRole, status)
        .map((o) => {
          const spec = o.task_number ? store.getTaskSpecByNumber(o.task_number) : null;
          return {
            obligation_id: o.obligation_id,
            kind: o.kind,
            status: o.status,
            task_number: o.task_number,
            task_id: o.task_id,
            title: spec?.title || '(untitled)',
            target_agent_id: o.target_agent_id,
            target_role: o.target_role,
            source_agent_id: o.source_agent_id,
            created_at: o.created_at,
            updated_at: o.updated_at,
          };
        });
      return jsonToolResult({
        status: 'ok',
        agent_id: agentId,
        agent_role: agentRole,
        role_binding: roleResolution.role_binding,
        role_resolution: roleResolution,
        status_filter: status,
        count: obligations.length,
        obligations,
        schema: 'narada.task.mcp.obligations.v0',
      });
    }

    case 'task_lifecycle_inspect': {
      const taskNumber = numberField(args, 'task_number');
      if (!taskNumber) throw new Error('task_number_required');
      const lifecycle = store.getLifecycleByNumber(taskNumber);
      if (!lifecycle) throw new Error(`task_not_found: ${taskNumber}`);
      const evidence = await inspectTaskEvidence(siteRoot, String(taskNumber), store);
      const spec = store.getTaskSpecByNumber(taskNumber);
      const assignment = store.getActiveAssignment(lifecycle.task_id);
      const routing = readTaskRouting(store, lifecycle.task_id, spec);
      const obligations = store.listDirectedObligationsForTask(lifecycle.task_id, null);
      const reports = store.db.prepare('SELECT report_id, agent_id, submitted_at as reported_at FROM task_reports WHERE task_id = ?').all(lifecycle.task_id);
      const reviewRows = store.db.prepare("SELECT * FROM task_reviews WHERE task_id = ? ORDER BY reviewed_at DESC").all(lifecycle.task_id);
      const assignmentIntents = store.listAssignmentIntentsForTask ? store.listAssignmentIntentsForTask(lifecycle.task_id) : [];
      const reviews = reviewRows.map((r) => ({
        review_id: r.review_id,
        reviewer_agent_id: r.reviewer_agent_id,
        verdict: r.verdict,
        reviewed_at: r.reviewed_at,
        single_operator_meta: getSingleOperatorReviewMeta(r),
        review_independence: getReviewIndependenceMeta(store, r),
        acceptance_provenance: getReviewAcceptanceProvenance(store, r),
      }));
      return jsonToolResult({
        status: 'ok',
        task_number: taskNumber,
        task_id: lifecycle.task_id,
        lifecycle: {
          status: lifecycle.status,
          governed_by: lifecycle.governed_by,
          closed_at: lifecycle.closed_at,
          closed_by: lifecycle.closed_by,
          closure_mode: lifecycle.closure_mode,
          updated_at: lifecycle.updated_at,
        },
        evidence: evidence ? {
          verdict: evidence.verdict,
          all_criteria_checked: evidence.all_criteria_checked,
          unchecked_count: evidence.unchecked_count,
          has_report: evidence.has_report,
          has_execution_notes: evidence.has_execution_notes,
          has_verification: evidence.has_verification,
          violations: evidence.violations,
        } : null,
        evidence_preflight: await buildTaskEvidencePreflight({ siteRoot, store, taskNumber }),
        assignment: assignment ? { agent_id: assignment.agent_id, claimed_at: assignment.claimed_at, intent: assignment.intent } : null,
        routing,
        routing_assignment_divergence: buildRoutingAssignmentDivergence({ lifecycle, routing, assignment, reports }),
        assignment_intents: assignmentIntents,
        reports: reports || [],
        reviews: reviews || [],
        obligations: obligations.map((o) => ({ obligation_id: o.obligation_id, kind: o.kind, status: o.status })),
        schema: 'narada.task.mcp.inspect.v0',
      });
    }

    case 'task_lifecycle_evidence_preflight': {
      const taskNumber = numberField(args, 'task_number');
      if (!taskNumber) throw new Error('task_number_required');
      return jsonToolResult(await buildTaskEvidencePreflight({ siteRoot, store, taskNumber }));
    }

    case 'task_lifecycle_self_certification_preflight': {
      const packet = objectField(args, 'self_certification');
      if (!packet) throw new Error('self_certification_required');
      const validation = validateSelfCertificationPacket({
        ...packet,
        surface: stringField(args, 'surface') ?? packet.surface,
        summary: stringField(args, 'summary') ?? packet.summary,
        body: stringField(args, 'body') ?? packet.body,
        actor_principal: stringField(args, 'actor_principal') ?? packet.actor_principal ?? packet.closer_principal ?? packet.reviewer_principal,
        terminal_correction_claim: booleanField(args, 'terminal_correction_claim') === true || packet.terminal_correction_claim === true,
      });
      return jsonToolResult({
        status: validation.ok ? 'allowed' : 'blocked',
        schema: 'narada.task.mcp.self_certification_preflight.v0',
        ok: validation.ok,
        close_blocked: !validation.ok,
        blockers: validation.errors,
        evaluation: validation.evaluation,
        required_fields: validation.evaluation.required_fields,
        allowed_pending_states: validation.evaluation.allowed_pending_states,
      }, !validation.ok);
    }

    case 'task_lifecycle_admit_evidence': {
      const taskNumber = numberField(args, 'task_number');
      const agentId = stringField(args, 'agent_id');
      if (!taskNumber) throw new Error('task_number_required');
      if (!agentId) throw new Error('agent_id_required');
      enforceSessionIdentity(agentId);
      const selfCertification = objectField(args, 'self_certification');
      if (selfCertification) {
        const validation = validateSelfCertificationPacket({
          ...selfCertification,
          surface: 'evidence_admission',
          actor_principal: selfCertification.actor_principal ?? agentId,
        });
        if (!validation.ok) {
          return jsonToolResult({
            status: 'blocked',
            error: 'self_certification_guard_failed',
            close_blocked: true,
            close_blockers: validation.errors,
            task_number: taskNumber,
            schema: 'narada.task.mcp.evidence.self_certification_gate.v0',
            evaluation: validation.evaluation,
            remediation: 'Evidence admission may preserve same-subject evidence, but closure-sensitive architect-failure/deception/trust evidence must carry valid guard metadata and cannot assert terminal correction without independent review or operator acceptance.',
          }, true);
        }
      }
      const admission = await admitTaskEvidence({ cwd: siteRoot, taskNumber, admittedBy: agentId, methods: ['admission'] });
      const evidencePreflight = await buildTaskEvidencePreflight({ siteRoot, store, taskNumber });
      if (admission.blockers.length > 0 && evidencePreflight?.status === 'ready') {
        admission.blockers = [];
        admission.result.verdict = 'admitted';
        admission.result.blockers_json = '[]';
        admission.result.lifecycle_eligible_status = 'closed';
        admission.result.confirmation_json = JSON.stringify({
          ...asRecord(safeJsonObject(admission.result.confirmation_json)),
          structured_report_preflight_ready: true,
          structured_report_preflight_refused_duplicate_markdown_requirement: true,
        });
        store.upsertEvidenceAdmissionResult(admission.result);
      }
      return jsonToolResult({
        status: admission.blockers.length === 0 ? 'admitted' : 'rejected',
        task_number: taskNumber,
        admission_id: admission.result.admission_id,
        blockers: admission.blockers,
        verdict: admission.result.verdict,
        close_ready: admission.blockers.length === 0 ? true : closeReadinessFromPreflight(evidencePreflight)?.close_ready ?? false,
        close_readiness: closeReadinessFromPreflight(evidencePreflight),
        evidence_preflight: admission.blockers.length > 0 ? evidencePreflight : null,
        schema: 'narada.task.mcp.admit_evidence.v0',
      });
    }

    case 'task_lifecycle_prove_criteria': {
      const taskNumber = numberField(args, 'task_number');
      const agentId = stringField(args, 'agent_id');
      if (!taskNumber) throw new Error('task_number_required');
      if (!agentId) throw new Error('agent_id_required');
      enforceSessionIdentity(agentId);
      return jsonToolResult(await proveTaskCriteria({ siteRoot, store, taskNumber, agentId }));
    }

    case 'task_lifecycle_disposition_closeout': {
      const taskNumber = numberField(args, 'task_number');
      const agentId = stringField(args, 'agent_id');
      if (!taskNumber) throw new Error('task_number_required');
      if (!agentId) throw new Error('agent_id_required');
      enforceSessionIdentity(agentId);
      const result = await taskLifecycleDispositionCloseout({
        siteRoot,
        store,
        taskNumber,
        agentId,
        envelopeId: stringField(args, 'envelope_id'),
        disposition: stringField(args, 'disposition'),
        summary: stringField(args, 'summary'),
        dryRun: booleanField(args, 'dry_run') === true,
        proveCriteria: booleanField(args, 'prove_criteria') === true,
        finish: booleanField(args, 'finish') === true,
        changedFiles: stringArrayField(args, 'changed_files'),
        noFilesChanged: booleanField(args, 'no_files_changed') === true,
      });
      return jsonToolResult(result, result.status === 'error');
    }

    case 'task_lifecycle_audit': {
      const since = stringField(args, 'since');
      const until = stringField(args, 'until');
      const now = new Date();
      const defaultSince = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
      const sinceVal = since || defaultSince;
      const untilVal = until || now.toISOString();
      const sql = `
        SELECT 'claim' AS event_type, CAST(ai.task_number AS TEXT) AS task, ai.agent_id AS actor, ai.requested_at AS occurred_at, ai.status AS result, ai.assignment_id AS ref
        FROM assignment_intents ai
        WHERE ai.kind = 'claim' AND ai.requested_at >= ? AND ai.requested_at <= ?
        UNION ALL
        SELECT 'report', CAST(tl.task_number AS TEXT), tr.agent_id, tr.submitted_at, 'submitted', tr.report_id
        FROM task_reports tr
        JOIN task_lifecycle tl ON tl.task_id = tr.task_id
        WHERE tr.submitted_at >= ? AND tr.submitted_at <= ?
        UNION ALL
        SELECT 'review', CAST(tl.task_number AS TEXT), rv.reviewer_agent_id, rv.reviewed_at, rv.verdict, rv.review_id
        FROM task_reviews rv
        JOIN task_lifecycle tl ON tl.task_id = rv.task_id
        WHERE rv.reviewed_at >= ? AND rv.reviewed_at <= ?
        UNION ALL
        SELECT 'admission', CAST(task_number AS TEXT), admitted_by, admitted_at, verdict, admission_id
        FROM evidence_admission_results
        WHERE admitted_at >= ? AND admitted_at <= ?
        UNION ALL
        SELECT 'close', CAST(task_number AS TEXT), closed_by, closed_at, closure_mode, task_id
        FROM task_lifecycle
        WHERE closed_at IS NOT NULL AND closed_at >= ? AND closed_at <= ?
        ORDER BY occurred_at DESC
      `;
      const rows = store.db.prepare(sql).all(sinceVal, untilVal, sinceVal, untilVal, sinceVal, untilVal, sinceVal, untilVal, sinceVal, untilVal);
      return jsonToolResult({
        status: 'ok',
        schema: 'narada.task.mcp.audit.v0',
        since: sinceVal,
        until: untilVal,
        count: rows.length,
        events: rows,
      });
    }

    case 'task_lifecycle_finish': {
      const taskNumber = numberField(args, 'task_number');
      const agentId = stringField(args, 'agent_id');
      const summary = stringField(args, 'summary');
      const verdict = stringField(args, 'verdict');
      const changedFiles = stringArrayField(args, 'changed_files');
      const noFilesChanged = booleanField(args, 'no_files_changed') === true;
      const recoveryTruthfulness = objectField(args, 'recovery_truthfulness');
      const selfCertification = objectField(args, 'self_certification');
      const payloadSource = dispatchContext.payloadSource ?? null;
      if (!taskNumber) throw new Error('task_number_required');
      if (!agentId) throw new Error('agent_id_required');
      if (changedFiles && noFilesChanged) {
        return jsonToolResult(attachPayloadSource({
          status: 'error',
          error: 'changed_files_conflicts_with_no_files_changed',
          schema: 'narada.task.mcp.finish.changed_file_evidence.v0',
          remediation: 'Provide changed_files for code/document edits, or no_files_changed=true for legitimate design-only/research tasks, but not both.',
        }, payloadSource), true);
      }
      enforceSessionIdentity(agentId);
      const identityWarning = verifySessionIdentity(agentId);
      const truthfulnessGate = validateTaskFinishRecoveryTruthfulness({
        taskNumber,
        summary,
        changedFiles,
        noFilesChanged,
        recoveryTruthfulness,
      });
      if (!truthfulnessGate.ok) {
        const payload = {
          status: 'blocked',
          error: 'recovery_truthfulness_guard_failed',
          close_blocked: true,
          task_number: taskNumber,
          schema: 'narada.task.mcp.finish.recovery_truthfulness_gate.v0',
          close_blockers: truthfulnessGate.errors,
          evaluation: truthfulnessGate.evaluation,
          recovery_state_vocabulary: truthfulnessGate.evaluation.state_vocabulary,
          required_fields: truthfulnessGate.evaluation.required_fields,
          remediation: 'For serious-failure recovery finish/report claims, provide recovery_truthfulness with known_facts, inferences, uncertainty, changed, not_changed, remaining_work, evidence_limits, capa_open_status, and state. Use terminal_corrected only when corrective implementation is complete, no related CAPA/task/review remains open, and repository_durability names committed/pushed state; task creation alone is not correction.',
        };
        if (identityWarning) {
          payload.identity_warning = identityWarning;
        }
        return jsonToolResult(attachPayloadSource(payload, payloadSource), true);
      }
      if (truthfulnessGate.evaluation?.normalized_state === 'terminal_blocked') {
        const payload = buildTerminalBlockedFinishBlock({ taskNumber, agentId, source: 'recovery_truthfulness_argument' });
        if (identityWarning) {
          payload.identity_warning = identityWarning;
        }
        return jsonToolResult(attachPayloadSource(payload, payloadSource), true);
      }
      const lifecycle = store.getLifecycleByNumber(taskNumber);
      const testGate = lifecycle ? testResultArtifactGate(store, lifecycle.task_id) : { failed_test_artifacts: [], latest_passing_artifacts: [] };
      if (testGate.failed_test_artifacts.length > 0) {
        const payload = {
          status: 'blocked',
          schema: 'narada.task.mcp.finish.test_gate.v0',
          task_number: taskNumber,
          close_blocked: true,
          close_blockers: ['Task has current failed structured test evidence. Run the same selector again and produce a newer passing artifact before finish.'],
          failed_test_artifacts: testGate.failed_test_artifacts,
          latest_passing_artifacts: testGate.latest_passing_artifacts,
          remediation: 'Run task_lifecycle_run_tests with the same selector as each failed artifact. A newer passed artifact for that selector supersedes earlier failures.',
        };
        if (identityWarning) {
          payload.identity_warning = identityWarning;
        }
        return jsonToolResult(attachPayloadSource(payload, payloadSource), true);
      }
      const taskFile = await findTaskFile(siteRoot, taskNumber);
      if (taskFile) {
        const { body } = await readTaskFile(taskFile.path);
        const selfCertificationValidation = selfCertification
          ? validateSelfCertificationPacket({
            ...selfCertification,
            actor_principal: selfCertification.actor_principal ?? selfCertification.closer_principal ?? agentId,
            summary,
            body,
            terminal_correction_claim: true,
            surface: 'task_lifecycle_finish',
          })
          : validateSelfCertificationBody({ body, summary, actor_principal: agentId });
        if (!selfCertificationValidation.ok) {
          const payload = {
            status: 'blocked',
            error: 'self_certification_guard_failed',
            close_blocked: true,
            close_blockers: selfCertificationValidation.errors,
            task_number: taskNumber,
            schema: 'narada.task.mcp.finish.self_certification_gate.v0',
            evaluation: selfCertificationValidation.evaluation,
            required_fields: selfCertificationValidation.evaluation.required_fields,
            allowed_pending_states: selfCertificationValidation.evaluation.allowed_pending_states,
            remediation: 'For architect-failure/deception/trust same-subject terminal correction, provide self_certification with target_category, subject_principal, requires_independent_review, misleading_completion_answer, allowed_pending_state, and either eligible independent review refs or explicit operator acceptance. Otherwise keep the work in a review-required/pending/blocker state.',
          };
          if (identityWarning) {
            payload.identity_warning = identityWarning;
          }
          return jsonToolResult(attachPayloadSource(payload, payloadSource), true);
        }
        const followUpValidation = validateFollowUpLedger(body);
        if (!followUpValidation.ok) {
          const payload = {
            status: 'error',
            error: 'follow_up_ledger_required',
            close_blocked: true,
            close_blockers: followUpValidation.errors,
            task_number: taskNumber,
            next_command: `Update task ${taskNumber} with a ## Follow-Up Ledger linking each preserved follow-up to created #N, covered by #N, envelope env_<id>, CAPA <capa_id>, deferred: <reason>, or no follow-up needed: <rationale>.`,
            schema: 'narada.task.mcp.finish.follow_up_ledger_gate.v0',
          };
          if (identityWarning) {
            payload.identity_warning = identityWarning;
          }
          return jsonToolResult(attachPayloadSource(payload, payloadSource), true);
        }
        const recoveryTruthfulnessValidation = recoveryTruthfulness
          ? { ok: true }
          : validateRecoveryTruthfulnessBody({ body, summary, context: `task:${taskNumber}` });
        if (!recoveryTruthfulnessValidation.ok) {
          const payload = {
            status: 'error',
            error: 'recovery_truthfulness_guard_required',
            close_blocked: true,
            close_blockers: recoveryTruthfulnessValidation.errors,
            task_number: taskNumber,
            trigger_evaluation: recoveryTruthfulnessValidation.evaluation,
            next_command: `Update task ${taskNumber} with a ## Recovery Truthfulness section naming known facts, inferences, uncertainty, changed, not changed, remaining work, evidence limits, CAPA-open status, and state. For terminal_corrected, also name repository durability / commit-push state.`,
            schema: 'narada.task.mcp.finish.recovery_truthfulness_gate.v0',
          };
          if (identityWarning) {
            payload.identity_warning = identityWarning;
          }
          return jsonToolResult(attachPayloadSource(payload, payloadSource), true);
        }
        if (recoveryTruthfulnessValidation.evaluation?.normalized_state === 'terminal_blocked') {
          const payload = buildTerminalBlockedFinishBlock({ taskNumber, agentId, source: 'task_body_recovery_truthfulness' });
          if (identityWarning) {
            payload.identity_warning = identityWarning;
          }
          return jsonToolResult(attachPayloadSource(payload, payloadSource), true);
        }
      }
      ensureStaticRosterAgentInSql(store, siteRoot, agentId);
      const autoDetectedChangedFiles = !changedFiles && !noFilesChanged ? detectGitChangedFiles(siteRoot) : [];
      const finishOptions = { cwd: siteRoot, taskNumber, agent: agentId, summary, verdict, close: true };
      if (changedFiles) finishOptions.changedFiles = JSON.stringify(changedFiles);
      if (!changedFiles && autoDetectedChangedFiles.length > 0) finishOptions.changedFiles = JSON.stringify(autoDetectedChangedFiles);
      if (noFilesChanged) finishOptions.changedFiles = JSON.stringify([NO_FILES_CHANGED_MARKER]);
      const result = await withAuthoredRosterJsonPreserved(siteRoot, () => finishTaskService(finishOptions));
      const payload = result.result || result;
      let isBlocked = payload.close_action === 'blocked';
      if (isBlocked) {
        const reconciled = await reconcileStructuredPreflightClose({
          siteRoot,
          store,
          taskNumber,
          agentId,
          payload,
          closeMode: 'agent_finish',
        });
        isBlocked = !reconciled && payload.close_action === 'blocked';
      }
      if (isBlocked) {
        payload.close_blocked = true;
        payload.evidence_preflight = await buildTaskEvidencePreflight({ siteRoot, store, taskNumber });
        payload.close_readiness = closeReadinessFromPreflight(payload.evidence_preflight);
        payload.close_ready = payload.close_readiness?.close_ready ?? false;
        if (!payload.evidence_reason && payload.close_blockers?.length > 0) {
          payload.evidence_reason = payload.close_blockers.join('; ');
        }
        const remediation = buildStateAwareFinishBlockerRemediation({ taskNumber, agentId, lifecycle, payload });
        payload.next_action = remediation.next_action;
        payload.next_command = remediation.next_command;
        payload.remediation = remediation.remediation;
      }
      payload.follow_up_policy = evaluatePostTransitionFollowups({
        event: { transition_kind: payload.close_action ?? 'finish', task_number: taskNumber, task_id: payload.task_id, agent_id: agentId },
        source_task: { task_number: taskNumber, task_id: payload.task_id },
        actor: { agent_id: agentId },
        result: payload,
        signals: { evidence_blocked: isBlocked },
      });
      if (!isBlocked && result.exitCode === 0) {
        payload.post_closeout_continuation = buildPostCloseoutContinuation({ agentId, result: payload });
      }
      if (!isBlocked && result.exitCode === 0) {
        try {
          const checkpointResult = await emitCheckpoint({
            cwd: siteRoot,
            agentId,
            sessionId: process.env.KIMI_SESSION_ID || process.env.SESSION_ID || 'unknown',
            taskNumber,
            taskId: payload.task_id || null,
            boundaryType: 'finish',
            summary,
          });
          payload.checkpoint_event = checkpointResult;
        } catch {
          // Non-blocking: checkpoint emission failure must not prevent finish
        }
      }
      if (identityWarning) {
        payload.identity_warning = identityWarning;
      }
      return jsonToolResult(attachPayloadSource(payload, payloadSource), (result.exitCode !== 0 && !payload.structured_report_preflight_close_reconciled) || isBlocked);
    }

    case 'task_lifecycle_close': {
      const taskNumber = numberField(args, 'task_number');
      const agentId = stringField(args, 'agent_id');
      const mode = stringField(args, 'mode') || 'agent_finish';
      const noContinuationNeeded = stringField(args, 'no_continuation_needed');
      if (!taskNumber) throw new Error('task_number_required');
      if (!agentId) throw new Error('agent_id_required');
      enforceSessionIdentity(agentId);
      const selfCertification = objectField(args, 'self_certification');
      if (selfCertification) {
        const validation = validateSelfCertificationPacket({
          ...selfCertification,
          surface: 'task_lifecycle_close',
          actor_principal: selfCertification.actor_principal ?? selfCertification.closer_principal ?? agentId,
          terminal_correction_claim: true,
        });
        if (!validation.ok) {
          return jsonToolResult({
            status: 'blocked',
            error: 'self_certification_guard_failed',
            close_blocked: true,
            close_blockers: validation.errors,
            task_number: taskNumber,
            schema: 'narada.task.mcp.close.self_certification_gate.v0',
            evaluation: validation.evaluation,
            remediation: 'Task close for same-subject architect-failure/deception/trust material requires eligible independent review or explicit operator acceptance, otherwise use a pending/blocker state.',
          }, true);
        }
      }
      const result = await withAuthoredRosterJsonPreserved(siteRoot, () => closeTaskService({ cwd: siteRoot, taskNumber, agent: agentId, mode, noContinuationNeeded }));
      const payload = result.result || result;
      const isBlocked = result.exitCode !== 0 || payload.close_action === 'blocked';
      if (!isBlocked) {
        payload.post_closeout_continuation = buildPostCloseoutContinuation({ agentId, result: payload });
      }
      return jsonToolResult(payload, isBlocked);
    }

    case 'task_lifecycle_tombstone': {
      const taskNumber = numberField(args, 'task_number');
      const agentId = stringField(args, 'agent_id');
      const reason = stringField(args, 'reason');
      const authorityBasis = objectField(args, 'authority_basis');
      const disposition = stringField(args, 'disposition') ?? 'tombstoned';
      const metadata = objectField(args, 'metadata');
      if (!taskNumber) throw new Error('task_number_required');
      if (!agentId) throw new Error('agent_id_required');
      enforceSessionIdentity(agentId);
      const serviceResult = await tombstoneLifecycleTask({ siteRoot, store, taskNumber, agentId, reason, authorityBasis, disposition, metadata });
      return jsonToolResult(serviceResult, serviceResult.status === 'error');
    }

    case 'task_lifecycle_search': {
      const query = stringField(args, 'query');
      const statusFilter = stringField(args, 'status');
      const limit = numberField(args, 'limit') ?? 20;
      if (!query) throw new Error('query_required');
      const result = await searchTasksService({ cwd: siteRoot, query, maxSnippets: 3 });
      const output = result.result || result;
      if (statusFilter && output.results) {
        output.results = output.results.filter((r) => r.status === statusFilter);
        output.count = output.results.length;
      }
      output.results = output.results?.slice(0, limit);
      return jsonToolResult(output, result.exitCode !== 0);
    }

    case 'task_lifecycle_related': {
      const taskNumber = numberField(args, 'task_number');
      const limit = numberField(args, 'limit') ?? 8;
      if (!taskNumber) throw new Error('task_number_required');
      const result = findRelatedTasks({ tasksDir: join(siteRoot, '.ai', 'do-not-open', 'tasks'), targetTaskNumber: taskNumber, limit });
      return jsonToolResult(result);
    }

    case 'task_lifecycle_defer': {
      const taskNumber = numberField(args, 'task_number');
      const agentId = stringField(args, 'agent_id');
      const reason = stringField(args, 'reason');
      if (!taskNumber) throw new Error('task_number_required');
      if (!agentId) throw new Error('agent_id_required');
      enforceSessionIdentity(agentId);
      const serviceResult = await transitionLifecycleTask({ siteRoot, store, taskNumber, agentId, reason, toStatus: 'deferred', resultStatus: 'deferred' });
      return jsonToolResult(serviceResult, serviceResult.status === 'error');
    }

    case 'task_lifecycle_un_defer': {
      const taskNumber = numberField(args, 'task_number');
      const agentId = stringField(args, 'agent_id');
      const reason = stringField(args, 'reason');
      const authorityBasis = objectField(args, 'authority_basis');
      if (!taskNumber) throw new Error('task_number_required');
      if (!agentId) throw new Error('agent_id_required');
      enforceSessionIdentity(agentId);
      const serviceResult = await unDeferLifecycleTask({ siteRoot, store, taskNumber, agentId, reason, authorityBasis });
      return jsonToolResult(serviceResult, serviceResult.status === 'error');
    }

    case 'task_lifecycle_reopen': {
      const taskNumber = numberField(args, 'task_number');
      const agentId = stringField(args, 'agent_id');
      const reason = stringField(args, 'reason');
      if (!taskNumber) throw new Error('task_number_required');
      if (!agentId) throw new Error('agent_id_required');
      enforceSessionIdentity(agentId);
      const serviceResult = await transitionLifecycleTask({ siteRoot, store, taskNumber, agentId, reason, toStatus: 'opened', resultStatus: 'reopened' });
      return jsonToolResult(serviceResult, serviceResult.status === 'error');
    }

    case 'task_lifecycle_review': {
      const taskNumber = numberField(args, 'task_number');
      const agentId = stringField(args, 'agent_id');
      const verdict = stringField(args, 'verdict');
      const payloadSource = dispatchContext.payloadSource ?? null;
      let findings = args.findings;
      if (Array.isArray(findings)) {
        findings = JSON.stringify(findings);
      }
      if (!taskNumber) throw new Error('task_number_required');
      if (!agentId) throw new Error('agent_id_required');
      if (!verdict) throw new Error('verdict_required');
      const reviewReplayStatus = normalizeReviewReplayStatus(stringField(args, 'review_replay_status'));
      if (!reviewReplayStatus) {
        return jsonToolResult(attachPayloadSource({
          status: 'error',
          error: `review_replay_status must be one of: ${REVIEW_REPLAY_STATUSES.join(', ')}`,
        }, payloadSource), true);
      }
      enforceSessionIdentity(agentId);
      const identityWarning = verifySessionIdentity(agentId);
      const selfCertification = objectField(args, 'self_certification');
      if (selfCertification) {
        const validation = validateSelfCertificationPacket({
          ...selfCertification,
          surface: 'task_lifecycle_review',
          actor_principal: selfCertification.actor_principal ?? selfCertification.reviewer_principal ?? agentId,
          terminal_correction_claim: ['accepted', 'accepted_with_notes'].includes(verdict),
        });
        if (!validation.ok) {
          const payload = {
            status: 'blocked',
            error: 'self_certification_guard_failed',
            close_blocked: true,
            close_blockers: validation.errors,
            task_number: taskNumber,
            schema: 'narada.task.mcp.review.self_certification_gate.v0',
            evaluation: validation.evaluation,
            remediation: 'Same-subject review cannot satisfy final independent review for architect-failure/deception/trust material without eligible independent-review metadata or explicit operator acceptance.',
          };
          if (identityWarning) payload.identity_warning = identityWarning;
          return jsonToolResult(attachPayloadSource(payload, payloadSource), true);
        }
      }

      // Same-operator and self-review detection
      let structuralReviewInfo = null;
      try {
        const store = openTaskLifecycleStore(siteRoot);
        try {
          structuralReviewInfo = detectSameOperatorReview(store, agentId, taskNumber);
          if (!structuralReviewInfo?.sameOperator) {
            structuralReviewInfo = detectSelfReview(store, agentId, taskNumber);
          }
        } finally {
          store.db.close();
        }
      } catch {
        // Best-effort
      }

      const isStructuralReview = structuralReviewInfo?.sameOperator || structuralReviewInfo?.selfReview;
      if (isStructuralReview && !args.single_operator_review) {
        return jsonToolResult(attachPayloadSource({
          status: 'error',
          error: 'single_operator_review_blocked',
          message: structuralReviewInfo.warning,
          hint: 'Pass single_operator_review: true to allow single-operator review with annotation recorded.',
        }, payloadSource), true);
      }

      // Prepend annotation when single-operator review is explicitly requested
      let parsedFindings = null;
      if (findings) {
        try {
          parsedFindings = JSON.parse(findings);
          if (!Array.isArray(parsedFindings)) parsedFindings = null;
        } catch {
          parsedFindings = null;
        }
      }
      if (isStructuralReview && args.single_operator_review) {
        const annotation = {
          severity: 'note',
          description: `single_operator_review: ${structuralReviewInfo.warning} This review is annotated as single-operator review (kind: ${structuralReviewInfo.kind || 'same_operator'}).`,
          location: 'review_authority',
        };
        if (Array.isArray(parsedFindings)) {
          parsedFindings.unshift(annotation);
        } else {
          parsedFindings = [annotation];
        }
        findings = JSON.stringify(parsedFindings);
      }
      const provenanceAnnotation = buildReviewAcceptanceProvenanceAnnotation({ verdict, reviewReplayStatus });
      if (Array.isArray(parsedFindings)) {
        parsedFindings.unshift(provenanceAnnotation);
      } else {
        parsedFindings = [provenanceAnnotation];
      }
      findings = JSON.stringify(parsedFindings);

      const result = await withAuthoredRosterJsonPreserved(siteRoot, () => reviewTaskService({ cwd: siteRoot, taskNumber, agent: agentId, verdict, findings }));
      const payload = result.result || result;
      let isBlocked = payload.evidence_blocked === true || payload.close_action === 'blocked';
      if (isBlocked && verdict !== 'rejected') {
        const reconciled = await reconcileStructuredPreflightClose({
          siteRoot,
          store,
          taskNumber,
          agentId,
          payload,
          closeMode: 'peer_reviewed',
        });
        isBlocked = !reconciled && (payload.evidence_blocked === true || payload.close_action === 'blocked');
      }
      if (isBlocked) {
        payload.close_blocked = true;
      }
      if (isStructuralReview) {
        payload.single_operator_review = true;
        payload.single_operator_annotation = structuralReviewInfo.warning;
        payload.single_operator_kind = structuralReviewInfo.kind || 'same_operator';
      }
      if (payload.review_id) {
        try {
          const reviewRow = store.db.prepare('SELECT * FROM task_reviews WHERE review_id = ?').get(payload.review_id);
          payload.acceptance_provenance = getReviewAcceptanceProvenance(store, reviewRow);
        } catch {
          // Non-blocking projection failure; persisted annotation remains in findings_json.
        }
      }
      if (identityWarning) {
        payload.identity_warning = identityWarning;
      }
      return jsonToolResult(attachPayloadSource(payload, payloadSource), (result.exitCode !== 0 && !payload.structured_report_preflight_close_reconciled) || isBlocked);
    }

    case 'task_lifecycle_submit_observation': {
      const taskNumber = numberField(args, 'task_number');
      const artifactUri = stringField(args, 'artifact_uri');
      const content = args.content;
      if (!artifactUri) throw new Error('artifact_uri_required');
      const taskId = taskNumber ? store.getLifecycleByNumber(taskNumber)?.task_id : null;
      const artifactId = randomUUID();
      const admittedView = JSON.stringify(content ?? {});
      store.upsertObservationArtifact({
        artifact_id: artifactId,
        artifact_type: 'observation',
        source_operator: stringField(args, 'source_operator') ?? 'mcp_agent',
        task_id: taskId ?? null,
        task_number: taskNumber ?? null,
        agent_id: stringField(args, 'agent_id') ?? null,
        artifact_uri: artifactUri,
        digest: artifactId.slice(0, 16),
        admitted_view_json: admittedView,
        created_at: new Date().toISOString(),
      });
      return jsonToolResult({ status: 'submitted', artifact_id: artifactId, artifact_uri: artifactUri });
    }

    case 'task_lifecycle_bridge_poll': {
      const dryRun = booleanField(args, 'dry_run') ?? false;
      const threshold = numberField(args, 'threshold');
      const limit = numberField(args, 'limit');
      const result = await pollInboxBridge(siteRoot, { dryRun, threshold, limit });
      return jsonToolResult(result, result.status === 'error');
    }

    case 'task_lifecycle_inbox_target': {
      const envelopeId = stringField(args, 'envelope_id');
      const dryRun = booleanField(args, 'dry_run') ?? false;
      const disposition = stringField(args, 'disposition') ?? 'materialize';
      const principal = stringField(args, 'principal') ?? stringField(args, 'agent_id') ?? 'task_lifecycle_mcp';
      const reason = stringField(args, 'reason');
      const result = await targetInboxEnvelope(siteRoot, { envelopeId, dryRun, disposition, principal, reason });
      return jsonToolResult(result, result.status === 'not_found');
    }

    case 'task_lifecycle_set_routing': {
      const taskNumber = numberField(args, 'task_number');
      const actorAgentId = stringField(args, 'actor_agent_id');
      const targetRole = nullableStringField(args, 'target_role');
      const preferredAgentId = nullableStringField(args, 'preferred_agent_id');
      const relativePriority = numberField(args, 'relative_priority');
      const reason = stringField(args, 'reason');
      if (!taskNumber) throw new Error('task_number_required');
      if (!actorAgentId) throw new Error('actor_agent_id_required');
      if (!reason) throw new Error('reason_required');
      if (targetRole === undefined && preferredAgentId === undefined && relativePriority === undefined) {
        throw new Error('routing_change_required');
      }
      enforceSessionIdentity(actorAgentId);

      const lifecycle = store.getLifecycleByNumber(taskNumber);
      if (!lifecycle) throw new Error(`task_not_found: ${taskNumber}`);
      if (lifecycle.status !== 'opened') {
        return jsonToolResult({
          status: 'blocked',
          reason: 'task_not_opened',
          task_number: taskNumber,
          current_status: lifecycle.status,
          message: 'Routing is only allowed for opened tasks; claim/finish ownership gates remain separate.',
        }, true);
      }

      const actorRoleResolution = resolveAgentRoleWithDiagnostics(store, siteRoot, actorAgentId);
      const actorRole = actorRoleResolution.role;
      if (!['architect', 'operator'].includes(actorRole)) {
        return jsonToolResult({
          status: 'blocked',
          reason: 'routing_actor_not_authorized',
          actor_agent_id: actorAgentId,
          actor_role: actorRole,
          role_resolution: actorRoleResolution,
          message: 'Only architect/operator agents can route tasks through this tool.',
        }, true);
      }

      if (targetRole && !roleExistsInRoster(store, siteRoot, targetRole)) {
        return jsonToolResult({ status: 'blocked', reason: 'target_role_not_in_roster', target_role: targetRole }, true);
      }

      if (preferredAgentId) {
        const preferred = agentExistsWithRole(store, siteRoot, preferredAgentId);
        if (!preferred.exists) {
          return jsonToolResult({ status: 'blocked', reason: 'preferred_agent_not_in_roster', preferred_agent_id: preferredAgentId, role_resolution: preferred.role_resolution }, true);
        }
        if (targetRole && preferred.role !== targetRole) {
          return jsonToolResult({
            status: 'blocked',
            reason: 'preferred_agent_role_mismatch',
            preferred_agent_id: preferredAgentId,
            preferred_agent_role: preferred.role,
            target_role: targetRole,
            role_resolution: preferred.role_resolution,
          }, true);
        }
      }

      ensureTaskRoutingTables(store);
      const now = new Date().toISOString();
      const previousRouting = getTaskRouting(store, lifecycle.task_id);
      const nextRouting = {
        target_role: targetRole !== undefined ? targetRole : previousRouting.target_role,
        preferred_agent_id: preferredAgentId !== undefined ? preferredAgentId : previousRouting.preferred_agent_id,
        relative_priority: relativePriority !== undefined ? relativePriority : previousRouting.relative_priority,
      };
      const changedFields = {};
      for (const field of ['target_role', 'preferred_agent_id', 'relative_priority']) {
        if (previousRouting[field] !== nextRouting[field]) {
          changedFields[field] = { before: previousRouting[field], after: nextRouting[field] };
        }
      }
      if (Object.keys(changedFields).length === 0) {
        return jsonToolResult({
          schema: 'narada.task.routing.v0',
          status: 'unchanged',
          task_number: taskNumber,
          task_id: lifecycle.task_id,
          routing: nextRouting,
        });
      }

      const changedProjectionPaths = [];
      store.db.exec('BEGIN');
      try {
        store.db.prepare(`
          INSERT INTO narada_andrey_task_role_preferences (task_id, preferred_role, target_role, preferred_agent_id, updated_at)
          VALUES (?, ?, ?, ?, ?)
          ON CONFLICT(task_id) DO UPDATE SET
            preferred_role = excluded.preferred_role,
            target_role = excluded.target_role,
            preferred_agent_id = excluded.preferred_agent_id,
            updated_at = excluded.updated_at
        `).run(lifecycle.task_id, nextRouting.target_role, nextRouting.target_role, nextRouting.preferred_agent_id, now);
        store.db.prepare(`
          UPDATE task_lifecycle
          SET relative_priority = ?, priority_reason = ?, updated_at = ?
          WHERE task_id = ?
        `).run(nextRouting.relative_priority, reason, now, lifecycle.task_id);
        const eventId = `route-${randomUUID()}`;
        store.db.prepare(`
          INSERT INTO task_routing_events (
            event_id, task_id, task_number, actor_agent_id, actor_role,
            reason, changed_fields_json, previous_routing_json, new_routing_json, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          eventId,
          lifecycle.task_id,
          taskNumber,
          actorAgentId,
          actorRole,
          reason,
          JSON.stringify(changedFields),
          JSON.stringify(previousRouting),
          JSON.stringify(nextRouting),
          now,
        );
        store.db.exec('COMMIT');

        try {
          const taskFile = await findTaskFile(siteRoot, taskNumber);
          if (taskFile) {
            const { frontMatter, body } = await readTaskFile(taskFile.path);
            if (nextRouting.target_role) {
              frontMatter.target_role = nextRouting.target_role;
              frontMatter.preferred_role = nextRouting.target_role;
            } else {
              delete frontMatter.target_role;
              delete frontMatter.preferred_role;
            }
            if (nextRouting.preferred_agent_id) {
              frontMatter.preferred_agent_id = nextRouting.preferred_agent_id;
            } else {
              delete frontMatter.preferred_agent_id;
            }
            const shouldProjectPriority = nextRouting.relative_priority !== null
              && nextRouting.relative_priority !== undefined
              && (
                relativePriority !== undefined
                || Object.prototype.hasOwnProperty.call(frontMatter, 'relative_priority')
                || nextRouting.relative_priority !== 0
              );
            if (shouldProjectPriority) {
              frontMatter.relative_priority = nextRouting.relative_priority;
            } else {
              delete frontMatter.relative_priority;
            }
            await writeTaskProjection(taskFile.path, frontMatter, body);
            changedProjectionPaths.push(taskFile.relative_path ?? relative(siteRoot, taskFile.path).replace(/\\/g, '/'));
          }
        } catch {
          // Projection write is compatibility-only; SQLite routing state is authoritative.
        }

        return jsonToolResult({
          schema: 'narada.task.routing.v0',
          status: 'routed',
          task_number: taskNumber,
          task_id: lifecycle.task_id,
          actor_agent_id: actorAgentId,
          actor_role: actorRole,
          reason,
          changed_fields: changedFields,
          routing: nextRouting,
          audit_event_id: eventId,
          changed_projection_paths: changedProjectionPaths,
          commit_ready: {
            helper_tool: 'git_task_closeout_commit_and_push',
            stage_paths: changedProjectionPaths,
            paths: changedProjectionPaths,
            exclude_unrelated_dirty_files: true,
            authority_required: 'explicit task_closeout_policy or operator_direct_instruction for the routing projection commit',
          },
        });
      } catch (error) {
        try { store.db.exec('ROLLBACK'); } catch { /* ignore rollback failure */ }
        throw error;
      }
    }

    case 'task_lifecycle_chapter_upsert': {
      const actorAgentId = stringField(args, 'actor_agent_id');
      if (!actorAgentId) throw new Error('actor_agent_id_required');
      enforceSessionIdentity(actorAgentId);
      return jsonToolResult(upsertChapterDefinition(store, args));
    }

    case 'task_lifecycle_chapter_add_task': {
      const actorAgentId = stringField(args, 'actor_agent_id');
      if (!actorAgentId) throw new Error('actor_agent_id_required');
      enforceSessionIdentity(actorAgentId);
      return jsonToolResult(addChapterTask(store, args));
    }

    case 'task_lifecycle_chapter_show': {
      return jsonToolResult(showChapter(store, args));
    }

    case 'task_lifecycle_chapter_list': {
      return jsonToolResult(listChapters(store, { limit: numberField(args, 'limit') }));
    }

    case 'task_lifecycle_chapter_import_markdown': {
      const actorAgentId = stringField(args, 'actor_agent_id');
      if (!actorAgentId) throw new Error('actor_agent_id_required');
      enforceSessionIdentity(actorAgentId);
      return jsonToolResult(importChapterMarkdownIndex(store, args));
    }

    case 'task_lifecycle_route_task_set': {
      const actorAgentId = stringField(args, 'actor_agent_id');
      if (!actorAgentId) throw new Error('actor_agent_id_required');
      enforceSessionIdentity(actorAgentId);
      const actorRoleResolution = resolveAgentRoleWithDiagnostics(store, siteRoot, actorAgentId);
      const actorRole = actorRoleResolution.role;
      if (!['architect', 'operator'].includes(actorRole)) {
        return jsonToolResult({
          status: 'blocked',
          reason: 'routing_actor_not_authorized',
          actor_agent_id: actorAgentId,
          actor_role: actorRole,
          role_resolution: actorRoleResolution,
          message: 'Only architect/operator agents can bulk-route tasks through this tool.',
        }, true);
      }
      const targetRole = nullableStringField(args, 'target_role');
      const preferredAgentId = nullableStringField(args, 'preferred_agent_id');
      if (targetRole && !roleExistsInRoster(store, siteRoot, targetRole)) {
        return jsonToolResult({ status: 'blocked', reason: 'target_role_not_in_roster', target_role: targetRole }, true);
      }
      if (preferredAgentId) {
        const preferred = agentExistsWithRole(store, siteRoot, preferredAgentId);
        if (!preferred.exists) {
          return jsonToolResult({ status: 'blocked', reason: 'preferred_agent_not_in_roster', preferred_agent_id: preferredAgentId, role_resolution: preferred.role_resolution }, true);
        }
        if (targetRole && preferred.role !== targetRole) {
          return jsonToolResult({
            status: 'blocked',
            reason: 'preferred_agent_role_mismatch',
            preferred_agent_id: preferredAgentId,
            preferred_agent_role: preferred.role,
            target_role: targetRole,
            role_resolution: preferred.role_resolution,
          }, true);
        }
      }
      const result = await applyBulkTaskRouting({ store, siteRoot, args, actorAgentId, actorRole });
      return jsonToolResult(result, ['blocked'].includes(result.status));
    }

    case 'task_lifecycle_test_mcp_tool': {
      const serverPath = stringField(args, 'server_path');
      const toolName = stringField(args, 'tool_name');
      const toolArgs = args.arguments ?? {};
      const timeoutSeconds = numberField(args, 'timeout_seconds');
      if (!serverPath) throw new Error('server_path_required');
      if (!toolName) throw new Error('tool_name_required');

      const result = await testMcpTool(siteRoot, serverPath, toolName, toolArgs, { timeoutSeconds });
      return jsonToolResult(result);
    }
    case 'mcp_payload_create':
      return jsonToolResult(payloadCreate({ siteRoot, args }));
    case 'mcp_payload_show':
      return jsonToolResult(payloadShow({ siteRoot, args }));
    case 'mcp_output_show':
      return jsonToolResult(outputShow({ siteRoot, args }));
    case 'mcp_payload_derive':
      return jsonToolResult(payloadDerive({ siteRoot, args }));
    case 'mcp_payload_validate':
      return jsonToolResult(payloadValidate({ siteRoot, args }));
    case 'mcp_command_create':
      return jsonToolResult(commandCreate({ siteRoot, args }));
    case 'mcp_command_show':
      return jsonToolResult(commandShow({ siteRoot, args }));
    case 'mcp_command_validate':
      return jsonToolResult(commandValidate({ siteRoot, args }));
    case 'mcp_command_submit':
      return jsonToolResult(await commandSubmitAsync({
        siteRoot,
        args,
        admitters: {
          'narada.command.task.create.v1': (command) => admitTaskPayloadRefFacadeCommand({
            command,
            toolName: 'task_lifecycle_create',
            expectedKinds: ['task_lifecycle_create', 'task_lifecycle_chapter_create'],
            resultSchema: 'narada.command.task.create.result.v1',
          }),
          'narada.command.task.chapter_upsert.v1': (command) => admitTaskFacadeCommand({
            command,
            toolName: 'task_lifecycle_chapter_upsert',
            expectedKinds: ['task_lifecycle_chapter_upsert', 'task_lifecycle_chapter_create'],
            resultSchema: 'narada.command.task.chapter_upsert.result.v1',
          }),
          'narada.command.task.claim.v1': (command) => admitTaskClaimCommand(command),
          'narada.command.task.finish.v1': (command) => admitTaskFacadeCommand({
            command,
            toolName: 'task_lifecycle_finish',
            expectedKinds: ['task_lifecycle_finish', 'task_lifecycle_report'],
            resultSchema: 'narada.command.task.finish.result.v1',
          }),
          'narada.command.task.review.v1': (command) => admitTaskFacadeCommand({
            command,
            toolName: 'task_lifecycle_review',
            expectedKinds: ['task_lifecycle_review'],
            resultSchema: 'narada.command.task.review.result.v1',
          }),
          'narada.command.task.close.v1': (command) => admitTaskFacadeCommand({
            command,
            toolName: 'task_lifecycle_close',
            expectedKinds: ['task_lifecycle_close'],
            resultSchema: 'narada.command.task.close.result.v1',
          }),
          'narada.command.task.admit_evidence.v1': (command) => admitTaskFacadeCommand({
            command,
            toolName: 'task_lifecycle_admit_evidence',
            expectedKinds: ['task_lifecycle_admit_evidence'],
            resultSchema: 'narada.command.task.admit_evidence.result.v1',
          }),
          'narada.command.task.disposition_closeout.v1': (command) => admitTaskFacadeCommand({
            command,
            toolName: 'task_lifecycle_disposition_closeout',
            expectedKinds: ['task_lifecycle_disposition_closeout', 'inbox_disposition_closeout'],
            resultSchema: 'narada.command.task.disposition_closeout.result.v1',
          }),
          'narada.command.task.inbox_target.v1': (command) => admitTaskFacadeCommand({
            command,
            toolName: 'task_lifecycle_inbox_target',
            expectedKinds: ['task_lifecycle_inbox_target', 'inbox_disposition'],
            resultSchema: 'narada.command.task.inbox_target.result.v1',
          }),
          'narada.command.task.test_replay.v1': (command) => admitTaskTestReplayCommand(command),
        },
      }));
    case 'mcp_command_author_and_submit':
      return jsonToolResult(await commandAuthorAndSubmitAsync({
        siteRoot,
        args,
        admitters: {
          'narada.command.task.create.v1': (command) => admitTaskPayloadRefFacadeCommand({
            command,
            toolName: 'task_lifecycle_create',
            expectedKinds: ['task_lifecycle_create', 'task_lifecycle_chapter_create'],
            resultSchema: 'narada.command.task.create.result.v1',
          }),
          'narada.command.task.chapter_upsert.v1': (command) => admitTaskFacadeCommand({
            command,
            toolName: 'task_lifecycle_chapter_upsert',
            expectedKinds: ['task_lifecycle_chapter_upsert', 'task_lifecycle_chapter_create'],
            resultSchema: 'narada.command.task.chapter_upsert.result.v1',
          }),
          'narada.command.task.claim.v1': (command) => admitTaskClaimCommand(command),
          'narada.command.task.finish.v1': (command) => admitTaskFacadeCommand({
            command,
            toolName: 'task_lifecycle_finish',
            expectedKinds: ['task_lifecycle_finish', 'task_lifecycle_report'],
            resultSchema: 'narada.command.task.finish.result.v1',
          }),
          'narada.command.task.review.v1': (command) => admitTaskFacadeCommand({
            command,
            toolName: 'task_lifecycle_review',
            expectedKinds: ['task_lifecycle_review'],
            resultSchema: 'narada.command.task.review.result.v1',
          }),
          'narada.command.task.close.v1': (command) => admitTaskFacadeCommand({
            command,
            toolName: 'task_lifecycle_close',
            expectedKinds: ['task_lifecycle_close'],
            resultSchema: 'narada.command.task.close.result.v1',
          }),
          'narada.command.task.admit_evidence.v1': (command) => admitTaskFacadeCommand({
            command,
            toolName: 'task_lifecycle_admit_evidence',
            expectedKinds: ['task_lifecycle_admit_evidence'],
            resultSchema: 'narada.command.task.admit_evidence.result.v1',
          }),
          'narada.command.task.disposition_closeout.v1': (command) => admitTaskFacadeCommand({
            command,
            toolName: 'task_lifecycle_disposition_closeout',
            expectedKinds: ['task_lifecycle_disposition_closeout', 'inbox_disposition_closeout'],
            resultSchema: 'narada.command.task.disposition_closeout.result.v1',
          }),
          'narada.command.task.inbox_target.v1': (command) => admitTaskFacadeCommand({
            command,
            toolName: 'task_lifecycle_inbox_target',
            expectedKinds: ['task_lifecycle_inbox_target', 'inbox_disposition'],
            resultSchema: 'narada.command.task.inbox_target.result.v1',
          }),
          'narada.command.task.test_replay.v1': (command) => admitTaskTestReplayCommand(command),
        },
      }));
    case 'mcp_result_show':
      return jsonToolResult(resultShow({ siteRoot, args }));

    case 'task_lifecycle_replay_test_evidence': {
      const agentId = stringField(args, 'agent_id');
      if (!agentId) throw new Error('agent_id_required');
      enforceSessionIdentity(agentId);
      const taskNumber = numberField(args, 'task_number');
      const evidenceRef = stringField(args, 'evidence_ref');
      if (!taskNumber && !evidenceRef) throw new Error('task_number_or_evidence_ref_required');
      if (taskNumber && !store.getLifecycleByNumber(taskNumber)) throw new Error(`task_not_found: ${taskNumber}`);
      const replayPayload = normalizeTestReplayPayload(args);
      const authorityBasis = normalizeReplayAuthorityBasis(args.authority_basis)
        ?? { kind: 'operator_direct_instruction', summary: 'Governed test replay requested through task lifecycle MCP.' };
      const result = await commandAuthorAndSubmitAsync({
        siteRoot,
        args: {
          command_schema: 'narada.command.task.test_replay.v1',
          target_locus: 'local_site',
          target_site_root: siteRoot,
          authority_basis: authorityBasis,
          domain_args: { agent_id: agentId, task_number: taskNumber ?? null, evidence_ref: evidenceRef ?? null },
          expected_consequence: {
            kind: 'task_lifecycle_test_replay',
            agent_id: agentId,
            task_number: taskNumber ?? null,
            evidence_ref: evidenceRef ?? null,
          },
          payload: replayPayload,
          created_by: agentId,
        },
        admitters: {
          'narada.command.task.test_replay.v1': (command) => admitTaskTestReplayCommand(command),
        },
      });
      return jsonToolResult({
        ...result,
        replay_command_schema: 'narada.command.task.test_replay.v1',
        replay_target: {
          task_number: taskNumber ?? null,
          evidence_ref: evidenceRef ?? null,
          selector: replayPayload.selector ?? null,
          test_id: replayPayload.test_id ?? null,
          path: replayPayload.path ?? null,
        },
      }, result.status === 'refused');
    }

    case 'task_lifecycle_run_tests': {
      const selector = stringField(args, 'selector') || 'task-lifecycle';
      const taskNumber = numberField(args, 'task_number');
      const agentId = stringField(args, 'agent_id');
      const timeoutSeconds = numberField(args, 'timeout_seconds') || 120;
      if (!agentId) throw new Error('agent_id_required');
      enforceSessionIdentity(agentId);
      const lifecycle = taskNumber ? store.getLifecycleByNumber(taskNumber) : null;
      if (taskNumber && !lifecycle) throw new Error(`task_not_found: ${taskNumber}`);
      const targets = testTargetsForSelector(selector);
      const results = [];
      for (const target of targets) {
        const result = await testMcpTool(siteRoot, 'tools/mcp-servers/test/test-mcp-server.mjs', 'run_test', target, { timeoutSeconds });
        results.push(result);
      }
      const failed = results.filter((result) => result.status !== 'passed');
      const payload = {
        schema: 'narada.task_lifecycle.run_tests.v0',
        status: failed.length === 0 ? 'passed' : 'failed',
        selector,
        task_number: taskNumber ?? null,
        task_id: lifecycle?.task_id ?? null,
        agent_id: agentId,
        total: results.length,
        passed: results.length - failed.length,
        failed: failed.length,
        results,
      };
      if (taskNumber) {
        const artifactId = randomUUID();
        store.upsertObservationArtifact({
          artifact_id: artifactId,
          artifact_type: 'test_result',
          source_operator: agentId,
          task_id: lifecycle.task_id,
          task_number: taskNumber,
          agent_id: agentId,
          artifact_uri: `task://${taskNumber}/test-results/${artifactId}`,
          digest: artifactId.slice(0, 16),
          admitted_view_json: JSON.stringify(payload),
          created_at: new Date().toISOString(),
        });
        payload.artifact_id = artifactId;
      }
      return jsonToolResult(payload, failed.length > 0);
    }

    case 'task_lifecycle_create': {
      const payloadSource = dispatchContext.payloadSource ?? null;
      const title = stringField(args, 'title');
      if (!title) throw new Error('title_required');
      const goal = stringField(args, 'goal') || title;
      const context = stringField(args, 'context') || null;
      const requiredWork = stringField(args, 'required_work') || '1. TBD';
      const nonGoals = stringField(args, 'non_goals') || null;
      const preferredRole = stringField(args, 'preferred_role') || null;
      const targetRole = stringField(args, 'target_role') || null;
      const acceptanceCriteria = Array.isArray(args.acceptance_criteria) && args.acceptance_criteria.length > 0
        ? args.acceptance_criteria
        : ['TBD'];
      const executionWindow = normalizeExecutionWindow(args).window;

      const taskNumber = (await allocateTaskNumbers(siteRoot, 1))[0];
      const slug = slugify(title);
      const taskId = `${todayYmd()}-${taskNumber}-${slug}`;
      const tasksDir = join(siteRoot, '.ai', 'do-not-open', 'tasks');
      const filePath = join(tasksDir, `${taskId}.md`);

      const body = renderTaskBodyFromSpec({
        spec: {
          title,
          goal,
          context,
          required_work: requiredWork,
          non_goals: nonGoals,
          acceptance_criteria: acceptanceCriteria,
        },
        executionNotes: null,
        verification: null,
      });

      const frontMatterLines = [
        '---',
        `number: ${taskNumber}`,
        `governed_by: ${preferredRole || 'unknown'}`,
        'status: opened',
      ];
      if (preferredRole) {
        frontMatterLines.push(`preferred_role: ${preferredRole}`);
      }
      if (targetRole) {
        frontMatterLines.push(`target_role: ${targetRole}`);
      }
      if (executionWindow?.not_before) {
        frontMatterLines.push(`execution_not_before: ${executionWindow.not_before}`);
      }
      if (executionWindow?.not_after) {
        frontMatterLines.push(`execution_not_after: ${executionWindow.not_after}`);
      }
      if (executionWindow?.timezone) {
        frontMatterLines.push(`execution_window_timezone: ${executionWindow.timezone}`);
      }
      if (executionWindow?.expired_disposition) {
        frontMatterLines.push(`execution_window_expired_disposition: ${executionWindow.expired_disposition}`);
      }
      if (payloadSource?.ref) {
        frontMatterLines.push(`creation_payload_ref: ${payloadSource.ref}`);
      }
      if (payloadSource?.sha256) {
        frontMatterLines.push(`creation_payload_sha256: ${payloadSource.sha256}`);
      }
      frontMatterLines.push('---');

      const fileContent = `${frontMatterLines.join('\n')}\n${body}`;
      writeFileSync(filePath, fileContent, 'utf8');

      const now = new Date().toISOString();
      store.upsertLifecycle({
        task_id: taskId,
        task_number: taskNumber,
        status: 'opened',
        governed_by: preferredRole || null,
        closed_at: null,
        closed_by: null,
        reopened_at: null,
        reopened_by: null,
        continuation_packet_json: null,
        updated_at: now,
      });
      store.upsertTaskSpec({
        task_id: taskId,
        task_number: taskNumber,
        title,
        chapter_markdown: null,
        goal_markdown: goal,
        context_markdown: context,
        required_work_markdown: requiredWork,
        non_goals_markdown: nonGoals,
        acceptance_criteria_json: JSON.stringify(acceptanceCriteria),
        dependencies_json: '[]',
        updated_at: now,
      });
      ensureTaskRoutingTables(store);
      writeTaskExecutionWindow(store, taskId, executionWindow, { source_kind: 'task_lifecycle_create', source_ref: payloadSource?.ref ?? null });
      if (preferredRole || targetRole) {
        store.db.prepare(`
          INSERT INTO narada_andrey_task_role_preferences (task_id, preferred_role, target_role, preferred_agent_id, updated_at)
          VALUES (?, ?, ?, ?, ?)
          ON CONFLICT(task_id) DO UPDATE SET
            preferred_role = excluded.preferred_role,
            target_role = excluded.target_role,
            preferred_agent_id = excluded.preferred_agent_id,
            updated_at = excluded.updated_at
        `).run(taskId, preferredRole, targetRole || preferredRole, null, now);
      }

      return jsonToolResult(attachPayloadSource({
        schema: 'narada.task.create.v0',
        status: 'created',
        task_number: taskNumber,
        task_id: taskId,
        file_path: filePath,
        title,
        target_role: targetRole || preferredRole,
        preferred_role: preferredRole,
        payload_ref: payloadSource?.ref ?? null,
        payload_sha256: payloadSource?.sha256 ?? null,
      }, payloadSource));
    }

    case 'task_lifecycle_create_task_batch': {
      return jsonToolResult(attachPayloadSource(await createTaskBatch(args, { payloadSource: dispatchContext.payloadSource ?? null }), dispatchContext.payloadSource));
    }

    case 'task_lifecycle_recurring_create': {
      const title = stringField(args, 'title');
      const actorAgentId = stringField(args, 'actor_agent_id');
      const authorityBasis = normalizeRecurringAuthorityBasis(args.authority_basis);
      if (!title) throw new Error('title_required');
      if (!actorAgentId) throw new Error('actor_agent_id_required');
      if (!authorityBasis) throw new Error('valid_authority_basis_required');
      enforceSessionIdentity(actorAgentId);
      const actorRole = requireRecurringAuthorityActor({ store, siteRoot, actorAgentId });
      const initialStatus = stringField(args, 'initial_status') || 'active';
      if (!['draft', 'active'].includes(initialStatus)) throw new Error('invalid_initial_status');
      const targetRole = stringField(args, 'target_role') || null;
      const preferredRole = stringField(args, 'preferred_role') || targetRole;
      if (targetRole && !roleExistsInRoster(store, siteRoot, targetRole)) {
        return jsonToolResult({ status: 'blocked', reason: 'target_role_not_in_roster', target_role: targetRole }, true);
      }
      if (preferredRole && !roleExistsInRoster(store, siteRoot, preferredRole)) {
        return jsonToolResult({ status: 'blocked', reason: 'preferred_role_not_in_roster', preferred_role: preferredRole }, true);
      }
      const triggerMode = stringField(args, 'trigger_mode') || 'manual';
      if (!['manual', 'schedule'].includes(triggerMode)) throw new Error('invalid_trigger_mode');
      const scheduleKind = stringField(args, 'schedule_kind') || (triggerMode === 'schedule' ? 'daily' : null);
      if (triggerMode === 'schedule' && scheduleKind !== 'daily') throw new Error('unsupported_schedule_kind');
      if (triggerMode === 'manual' && scheduleKind) throw new Error('schedule_kind_requires_schedule_trigger_mode');
      const scheduleTimezone = stringField(args, 'schedule_timezone') || (triggerMode === 'schedule' ? 'UTC' : null);
      if (scheduleTimezone && scheduleTimezone !== 'UTC') throw new Error('unsupported_schedule_timezone');
      const recurrenceId = `rtask_${randomUUID()}`;
      const now = new Date().toISOString();
      const definition = {
        recurrence_id: recurrenceId,
        title,
        status: initialStatus,
        trigger_mode: triggerMode,
        trigger_description: stringField(args, 'trigger_description') || null,
        schedule_kind: scheduleKind,
        schedule_interval: triggerMode === 'schedule' ? 1 : null,
        schedule_timezone: scheduleTimezone,
        last_due_key: null,
        last_auto_triggered_at: null,
        target_role: targetRole,
        preferred_role: preferredRole,
        goal_markdown: stringField(args, 'goal') || title,
        context_markdown: stringField(args, 'context') || null,
        required_work_markdown: stringField(args, 'required_work') || '1. Execute the recurring task instance.',
        non_goals_markdown: stringField(args, 'non_goals') || null,
        acceptance_criteria_json: JSON.stringify(arrayOfStrings(args.acceptance_criteria, ['Complete the recurring task instance with verification evidence.'])),
        evidence_requirements_json: JSON.stringify(arrayOfStrings(args.evidence_requirements, [])),
        created_by: actorAgentId,
        created_at: now,
        updated_at: now,
        suspended_at: null,
        retired_at: null,
      };
      ensureRecurringTaskTables(store);
      store.db.exec('BEGIN');
      try {
        insertRecurringDefinition(store, definition);
        insertRecurringEvent(store, {
          recurrenceId,
          eventType: 'created',
          stateAfter: initialStatus,
          actorAgentId,
          authorityBasis,
          event: { actor_role: actorRole, title },
          now,
        });
        store.db.exec('COMMIT');
      } catch (error) {
        try { store.db.exec('ROLLBACK'); } catch { /* ignore rollback failure */ }
        throw error;
      }
      return jsonToolResult({
        schema: 'narada.task.recurring.definition.v0',
        status: 'created',
        recurrence_id: recurrenceId,
        definition: hydrateRecurringDefinition(definition),
      });
    }

    case 'task_lifecycle_recurring_show': {
      const recurrenceId = stringField(args, 'recurrence_id');
      if (!recurrenceId) throw new Error('recurrence_id_required');
      const definition = getRecurringDefinition(store, recurrenceId);
      if (!definition) return jsonToolResult({ status: 'not_found', recurrence_id: recurrenceId }, true);
      const includeRuns = booleanField(args, 'include_runs') ?? true;
      return jsonToolResult({
        schema: 'narada.task.recurring.show.v0',
        status: 'ok',
        definition,
        runs: includeRuns ? listRecurringRuns(store, recurrenceId, 20) : [],
      });
    }

    case 'task_lifecycle_recurring_list': {
      const status = stringField(args, 'status');
      const limit = numberField(args, 'limit') ?? 50;
      return jsonToolResult({
        schema: 'narada.task.recurring.list.v0',
        status: 'ok',
        definitions: listRecurringDefinitions(store, { status, limit }),
      });
    }

    case 'task_lifecycle_recurring_suspend': {
      return jsonToolResult(updateRecurringDefinitionStatus({
        store,
        siteRoot,
        recurrenceId: stringField(args, 'recurrence_id'),
        actorAgentId: stringField(args, 'actor_agent_id'),
        authorityBasis: normalizeRecurringAuthorityBasis(args.authority_basis),
        nextStatus: 'suspended',
        eventType: 'suspended',
        reason: stringField(args, 'reason'),
      }));
    }

    case 'task_lifecycle_recurring_retire': {
      return jsonToolResult(updateRecurringDefinitionStatus({
        store,
        siteRoot,
        recurrenceId: stringField(args, 'recurrence_id'),
        actorAgentId: stringField(args, 'actor_agent_id'),
        authorityBasis: normalizeRecurringAuthorityBasis(args.authority_basis),
        nextStatus: 'retired',
        eventType: 'retired',
        reason: stringField(args, 'reason'),
      }));
    }

    case 'task_lifecycle_recurring_trigger': {
      const recurrenceId = stringField(args, 'recurrence_id');
      const actorAgentId = stringField(args, 'actor_agent_id');
      const authorityBasis = normalizeRecurringAuthorityBasis(args.authority_basis);
      const runReason = stringField(args, 'run_reason');
      if (!recurrenceId) throw new Error('recurrence_id_required');
      if (!actorAgentId) throw new Error('actor_agent_id_required');
      if (!authorityBasis) throw new Error('valid_authority_basis_required');
      if (!runReason) throw new Error('run_reason_required');
      enforceSessionIdentity(actorAgentId);
      const actorRole = requireRecurringAuthorityActor({ store, siteRoot, actorAgentId });
      const definition = getRecurringDefinition(store, recurrenceId);
      if (!definition) return jsonToolResult({ status: 'not_found', recurrence_id: recurrenceId }, true);
      if (definition.status !== 'active') {
        return jsonToolResult({
          status: 'blocked',
          reason: 'recurrence_not_active',
          recurrence_id: recurrenceId,
          current_status: definition.status,
        }, true);
      }
      const now = new Date().toISOString();
      const taskNumber = (await allocateTaskNumbers(siteRoot, 1))[0];
      const taskTitle = `${definition.title} (${now.slice(0, 10)})`;
      const taskId = `${todayYmd()}-${taskNumber}-${slugify(taskTitle)}`;
      const tasksDir = join(siteRoot, '.ai', 'do-not-open', 'tasks');
      const filePath = join(tasksDir, `${taskId}.md`);
      const evidenceRequirements = definition.evidence_requirements;
      const recurrenceContext = [
        definition.context_markdown,
        '',
        `Recurring task definition: ${recurrenceId}`,
        `Manual run reason: ${runReason}`,
        evidenceRequirements.length > 0 ? `Evidence requirements: ${evidenceRequirements.join('; ')}` : null,
      ].filter(Boolean).join('\n');
      const body = renderTaskBodyFromSpec({
        spec: {
          title: taskTitle,
          goal: definition.goal_markdown || definition.title,
          context: recurrenceContext,
          required_work: definition.required_work_markdown || 'Execute the recurring task instance.',
          non_goals: definition.non_goals_markdown,
          acceptance_criteria: definition.acceptance_criteria,
        },
        executionNotes: null,
        verification: null,
      });
      const frontMatterLines = [
        '---',
        `number: ${taskNumber}`,
        `governed_by: ${definition.preferred_role || definition.target_role || 'unknown'}`,
        'status: opened',
        `recurring_task_id: ${recurrenceId}`,
      ];
      if (definition.preferred_role) frontMatterLines.push(`preferred_role: ${definition.preferred_role}`);
      if (definition.target_role) frontMatterLines.push(`target_role: ${definition.target_role}`);
      frontMatterLines.push('---');
      const runId = `rtrun_${randomUUID()}`;
      store.db.exec('BEGIN');
      try {
        writeFileSync(filePath, `${frontMatterLines.join('\n')}\n${body}`, 'utf8');
        store.upsertLifecycle({
          task_id: taskId,
          task_number: taskNumber,
          status: 'opened',
          governed_by: definition.preferred_role || definition.target_role || null,
          closed_at: null,
          closed_by: null,
          reopened_at: null,
          reopened_by: null,
          continuation_packet_json: null,
          updated_at: now,
        });
        store.upsertTaskSpec({
          task_id: taskId,
          task_number: taskNumber,
          title: taskTitle,
          chapter_markdown: null,
          goal_markdown: definition.goal_markdown || definition.title,
          context_markdown: recurrenceContext,
          required_work_markdown: definition.required_work_markdown || 'Execute the recurring task instance.',
          non_goals_markdown: definition.non_goals_markdown,
          acceptance_criteria_json: JSON.stringify(definition.acceptance_criteria),
          dependencies_json: '[]',
          updated_at: now,
        });
        ensureTaskRoutingTables(store);
        if (definition.preferred_role || definition.target_role) {
          store.db.prepare(`
            INSERT INTO narada_andrey_task_role_preferences (task_id, preferred_role, target_role, preferred_agent_id, updated_at)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(task_id) DO UPDATE SET
              preferred_role = excluded.preferred_role,
              target_role = excluded.target_role,
              preferred_agent_id = excluded.preferred_agent_id,
              updated_at = excluded.updated_at
          `).run(taskId, definition.preferred_role, definition.target_role || definition.preferred_role, null, now);
        }
        insertRecurringRun(store, {
          run_id: runId,
          recurrence_id: recurrenceId,
          task_id: taskId,
          task_number: taskNumber,
          trigger_mode: 'manual',
          run_reason: runReason,
          actor_agent_id: actorAgentId,
          authority_basis_json: JSON.stringify(authorityBasis),
          created_at: now,
        });
        insertRecurringEvent(store, {
          recurrenceId,
          eventType: 'manual_triggered',
          stateAfter: definition.status,
          actorAgentId,
          authorityBasis,
          event: { actor_role: actorRole, run_id: runId, task_id: taskId, task_number: taskNumber, run_reason: runReason },
          now,
        });
        store.db.exec('COMMIT');
      } catch (error) {
        try { store.db.exec('ROLLBACK'); } catch { /* ignore rollback failure */ }
        throw error;
      }
      return jsonToolResult({
        schema: 'narada.task.recurring.trigger.v0',
        status: 'triggered',
        recurrence_id: recurrenceId,
        run_id: runId,
        task_number: taskNumber,
        task_id: taskId,
        file_path: filePath,
      });
    }

    case 'task_lifecycle_recurring_run_due': {
      const actorAgentId = stringField(args, 'actor_agent_id');
      const authorityBasis = normalizeRecurringAuthorityBasis(args.authority_basis);
      if (!actorAgentId) throw new Error('actor_agent_id_required');
      if (!authorityBasis) throw new Error('valid_authority_basis_required');
      enforceSessionIdentity(actorAgentId);
      const actorRole = requireRecurringAuthorityActor({ store, siteRoot, actorAgentId });
      const now = parseIsoOrNow(stringField(args, 'current_time'));
      const limit = Math.max(1, Math.min(numberField(args, 'limit') ?? 20, 100));
      const dueDefinitions = listDueRecurringDefinitions(store, { now, limit });
      const created = [];
      const skipped = [];
      for (const definition of dueDefinitions) {
        const dueKey = recurringDueKey(definition, now);
        if (!dueKey || definition.last_due_key === dueKey) {
          skipped.push({ recurrence_id: definition.recurrence_id, reason: 'not_due_or_already_created', due_key: dueKey });
          continue;
        }
        const result = await createRecurringTaskInstance({
          store,
          siteRoot,
          definition,
          actorAgentId,
          actorRole,
          authorityBasis,
          triggerMode: 'schedule',
          runReason: `Scheduled daily run for ${dueKey}`,
          eventType: 'scheduled_triggered',
          now,
          dueKey,
        });
        created.push(result);
      }
      return jsonToolResult({
        schema: 'narada.task.recurring.run_due.v0',
        status: 'ok',
        trigger_mode: 'schedule',
        schedule_kind: 'daily',
        evaluated_at: now.toISOString(),
        created_count: created.length,
        skipped_count: skipped.length,
        created,
        skipped,
      });
    }

    case 'task_lifecycle_recurring_runs': {
      const recurrenceId = stringField(args, 'recurrence_id');
      if (!recurrenceId) throw new Error('recurrence_id_required');
      const limit = numberField(args, 'limit') ?? 20;
      return jsonToolResult({
        schema: 'narada.task.recurring.runs.v0',
        status: 'ok',
        recurrence_id: recurrenceId,
        runs: listRecurringRuns(store, recurrenceId, limit),
      });
    }

    default:
      throw new Error(`task_mcp_refused: ${canonicalName}`);
  }
}

function buildTaskLifecycleFreshness({ registeredTools }) {
  return buildMcpFreshnessStatus({
    siteRoot,
    serverName: SERVER_NAME,
    serverEntryPoint: 'tools/task-lifecycle/task-mcp-server.mjs',
    serverBootedAt: SERVER_BOOTED_AT,
    watchedPaths: ['tools/task-lifecycle', 'tools/mcp-freshness-service.mjs'],
    expectedTools: taskLifecycleTools().map((tool) => tool.name),
    registeredTools,
    restartRequestPath: join(siteRoot, '.ai', 'tmp', 'task-lifecycle-restart-request.json'),
    baselinePath: join(siteRoot, '.ai', 'tmp', 'task-lifecycle-mcp-baseline.json'),
    restartToolName: 'task_lifecycle_restart',
  });
}

function taskLifecycleRestart(args) {
  const mode = stringField(args, 'mode') ?? 'request';
  if (!['request', 'status', 'acknowledge', 'clear'].includes(mode)) {
    throw new Error(`invalid_restart_mode: ${mode}`);
  }
  const requestPath = join(siteRoot, '.ai', 'tmp', 'task-lifecycle-restart-request.json');
  const baselinePath = join(siteRoot, '.ai', 'tmp', 'task-lifecycle-mcp-baseline.json');
  const watchedPaths = ['tools/task-lifecycle', 'tools/mcp-freshness-service.mjs'];
  const existingRequest = readMcpFreshnessJsonFile(requestPath);

  if (mode === 'acknowledge' || mode === 'clear') {
    return acknowledgeMcpRestartRequest({
      siteRoot,
      serverName: SERVER_NAME,
      targetSurface: 'task-lifecycle-mcp.local',
      targetEntrypoint: 'tools/task-lifecycle/task-mcp-server.mjs',
      restartRequestPath: requestPath,
      baselinePath,
      watchedPaths,
      expectedTools: taskLifecycleTools().map((tool) => tool.name),
      registeredTools: taskLifecycleTools().map((tool) => tool.name),
      acknowledgedBy: process.env.NARADA_AGENT_ID ?? null,
      reason: stringField(args, 'reason') ?? 'task_lifecycle_restart acknowledged after external restart',
      note: 'Task-lifecycle MCP external restart acknowledged; restart request marker cleared.',
    });
  }

  if (mode === 'status') {
    return {
      status: existingRequest ? 'restart_requested' : 'no_restart_request',
      schema: 'narada.task_lifecycle.restart_request.v0',
      can_self_restart: false,
      restart_mechanism: 'external_stdio_mcp_restart_required',
      request_path: requestPath,
      baseline_path: baselinePath,
      request: existingRequest,
      mcp_freshness: buildTaskLifecycleFreshness({ registeredTools: taskLifecycleTools().map((tool) => tool.name) }),
      message: existingRequest
        ? 'Task-lifecycle MCP restart has been requested. Restart the carrier/session MCP servers externally to load new code.'
        : 'No task-lifecycle MCP restart request file is present.',
    };
  }

  return writeMcpRestartRequest({
    siteRoot,
    serverName: SERVER_NAME,
    targetSurface: 'task-lifecycle-mcp.local',
    targetEntrypoint: 'tools/task-lifecycle/task-mcp-server.mjs',
    restartRequestPath: requestPath,
    baselinePath,
    requestedBy: process.env.NARADA_AGENT_ID ?? null,
    reason: stringField(args, 'reason') ?? 'task_lifecycle_restart requested through MCP',
    note: 'This tool cannot restart its own stdio MCP process. Restart the carrier/session MCP servers externally to load task-lifecycle source changes.',
  });
}

async function buildTaskEvidencePreflight({ siteRoot, store, taskNumber }) {
  const lifecycle = store.getLifecycleByNumber(taskNumber);
  if (!lifecycle) throw new Error(`task_not_found: ${taskNumber}`);
  const evidence = await inspectTaskEvidence(siteRoot, String(taskNumber), store);
  const taskFile = await findTaskFile(siteRoot, taskNumber);
  let body = '';
  if (taskFile) {
    const taskData = await readTaskFile(taskFile.path);
    body = taskData.body;
  }
  const reports = store.listReportRecords ? store.listReportRecords(lifecycle.task_id) : [];
  const sqliteReports = store.listReports ? store.listReports(lifecycle.task_id) : [];
  const verificationRuns = store.listVerificationRunsForTask ? store.listVerificationRunsForTask(lifecycle.task_id) : [];
  const observations = store.db.prepare('SELECT artifact_uri, created_at FROM observation_artifacts WHERE task_id = ? ORDER BY created_at DESC').all(lifecycle.task_id);
  const changedFileEvidence = collectChangedFileEvidenceFromReports(reports, sqliteReports);
  const structuredReportEvidence = collectStructuredReportEvidence(reports, sqliteReports);
  const closedComplete = lifecycle.status === 'closed' && evidence.verdict === 'complete';
  const followUpValidation = validateFollowUpLedger(body);
  const recoveryTruthfulnessValidation = validateRecoveryTruthfulnessBody({ body, summary: '', context: `task:${taskNumber}` });
  const recoveryTruthfulnessTriggered = recoveryTruthfulnessValidation.evaluation?.triggered === true;
  const hasCanonicalFollowUpLedger = /^##\s+Follow-Up Ledger\s*$/mi.test(body);
  const mentionsFollowUpLedger = /Follow-Up Ledger/i.test(body);
  const requirements = [];

  addRequirement(requirements, {
    id: 'execution_notes',
    label: 'Execution Notes',
    satisfied: evidence.has_execution_notes === true || structuredReportEvidence.execution.count > 0,
    observed: {
      has_execution_notes: evidence.has_execution_notes,
      has_report: evidence.has_report,
      structured_report_execution_count: structuredReportEvidence.execution.count,
      structured_report_execution_report_ids: structuredReportEvidence.execution.reportIds,
    },
    remediation: structuredReportEvidence.execution.count > 0
      ? 'Substantive structured report summary satisfies execution evidence; authored ## Execution Notes remain optional for readability.'
      : evidence.has_report
      ? 'Task has a structured report, but it is too vague to satisfy execution evidence. Submit a substantive report summary or add authored ## Execution Notes.'
      : 'Add substantive authored notes under ## Execution Notes or submit a task report before finish.',
    next_action: buildEvidenceNextAction('execution_notes', taskNumber),
  });
  addRequirement(requirements, {
    id: 'verification',
    label: 'Verification',
    satisfied: evidence.has_verification === true || structuredReportEvidence.verification.count > 0,
    observed: {
      has_markdown_verification: hasMaterialTaskSection(body, 'Verification'),
      passed_verification_runs: verificationRuns.filter((run) => run.status === 'passed').map((run) => run.run_id),
      report_verification_count: countReportVerificationEntries(reports, sqliteReports),
      structured_report_verification_count: structuredReportEvidence.verification.count,
      structured_report_verification_report_ids: structuredReportEvidence.verification.reportIds,
      observation_artifact_count: observations.length,
    },
    remediation: structuredReportEvidence.verification.count > 0
      ? 'Structured report verification evidence satisfies the verification gate; authored ## Verification notes remain optional for readability.'
      : observations.length > 0
      ? 'Structured observation artifacts are recorded context but do not satisfy the verification gate. Add substantive ## Verification notes, submit a task report with verification_json, or attach a governed passed verification run.'
      : 'Add substantive ## Verification notes, submit a task report with verification_json, or attach a governed passed verification run.',
    next_action: buildEvidenceNextAction('verification', taskNumber),
  });
  addRequirement(requirements, {
    id: 'acceptance_criteria',
    label: 'Acceptance Criteria',
    satisfied: evidence.all_criteria_checked !== false,
    observed: { all_criteria_checked: evidence.all_criteria_checked, unchecked_count: evidence.unchecked_count },
    remediation: evidence.all_criteria_checked === false
      ? `Prove criteria with task_lifecycle_prove_criteria or check ${evidence.unchecked_count} remaining acceptance criteria in the task body.`
      : 'Acceptance criteria are checked or not present.',
    next_action: buildEvidenceNextAction('acceptance_criteria', taskNumber),
  });
  addRequirement(requirements, {
    id: 'follow_up_ledger',
    label: 'Follow-Up Ledger',
    satisfied: followUpValidation.ok === true,
    observed: {
      required: followUpValidation.required,
      has_canonical_section: hasCanonicalFollowUpLedger,
      misplaced_or_nested_ledger_hint: mentionsFollowUpLedger && !hasCanonicalFollowUpLedger,
      errors: followUpValidation.errors,
    },
    remediation: followUpValidation.ok
      ? 'No Follow-Up Ledger remediation is required.'
      : 'Add a canonical top-level ## Follow-Up Ledger section. Each preserved follow-up must say created #N, covered by #N, envelope env_<id>, CAPA <capa_id>, deferred: <reason>, or no follow-up needed: <rationale>. A mention inside another section does not satisfy this gate.',
    next_action: buildEvidenceNextAction('follow_up_ledger', taskNumber),
  });
  addRequirement(requirements, {
    id: 'recovery_truthfulness',
    label: 'Recovery Truthfulness',
    required_for_finish: recoveryTruthfulnessTriggered,
    satisfied: recoveryTruthfulnessValidation.ok === true,
    observed: {
      triggered: recoveryTruthfulnessTriggered,
      triggers: recoveryTruthfulnessValidation.evaluation?.triggers ?? [],
      required_fields: recoveryTruthfulnessValidation.evaluation?.required_fields ?? [],
      recovery_section_present: recoveryTruthfulnessValidation.recovery_section_present ?? false,
      recovery_state_vocabulary: recoveryTruthfulnessValidation.evaluation?.state_vocabulary ?? [],
      errors: recoveryTruthfulnessValidation.errors ?? [],
    },
    remediation: recoveryTruthfulnessTriggered
      ? 'Add or repair a top-level ## Recovery Truthfulness section naming Known facts, Inferences, Uncertainty, Changed, Not changed, Remaining work, Evidence limits, CAPA open status, and State. For terminal_corrected, also name repository durability / commit-push state and prove no related task/CAPA/review remains open.'
      : 'Recovery Truthfulness is not required unless the task asserts serious-failure recovery, CAPA correction, operator-trust recovery, authority/locus repair, or terminal completion for corrective work.',
    next_action: buildEvidenceNextAction('recovery_truthfulness', taskNumber),
  });
  addRequirement(requirements, {
    id: 'changed_files',
    label: 'Changed-file Evidence',
    satisfied: closedComplete || changedFileEvidence.changedFiles.length > 0 || changedFileEvidence.noFilesChangedDeclarations.length > 0,
    observed: {
      changed_files: changedFileEvidence.changedFiles,
      no_files_changed_declarations: changedFileEvidence.noFilesChangedDeclarations,
      closed_complete_exemption: closedComplete,
    },
    remediation: closedComplete
      ? 'Task is already closed with complete evidence; changed-file evidence is an active finish gate, not a post-close blocker.'
      : changedFileEvidence.changedFiles.length > 0 || changedFileEvidence.noFilesChangedDeclarations.length > 0
      ? 'Changed-file evidence is present in task reports, or an explicit no-files-changed declaration was submitted.'
      : 'Finish/closeout must include changed files, or explicitly declare no files changed for design-only/research work.',
    next_action: buildEvidenceNextAction('changed_files', taskNumber),
  });

  const blockers = requirements.filter((item) => item.required_for_finish && item.satisfied !== true).map((item) => ({
    id: item.id,
    label: item.label,
    remediation: item.remediation,
    next_action: item.next_action,
  }));
  const closeReadiness = buildTaskCloseReadiness({
    taskNumber,
    taskId: lifecycle.task_id,
    lifecycleStatus: lifecycle.status,
    verdict: evidence.verdict,
    blockers,
    requirements,
  });
  return {
    status: closeReadiness.close_ready ? 'ready' : 'blocked',
    schema: 'narada.task.mcp.evidence_preflight.v0',
    task_number: taskNumber,
    task_id: lifecycle.task_id,
    lifecycle_status: lifecycle.status,
    verdict: evidence.verdict,
    finish_ready: closeReadiness.close_ready,
    close_ready: closeReadiness.close_ready,
    close_readiness: closeReadiness,
    blockers,
    requirements,
    structured_artifact_policy: {
      observation_artifacts_count: observations.length,
      observation_artifacts_satisfy_verification_gate: false,
      explanation: 'Evidence admission counts authored task sections, task reports, and governed verification runs. Observation artifacts remain context unless promoted into those recognized evidence shapes.',
    },
  };
}

async function reconcileStructuredPreflightClose({ siteRoot, store, taskNumber, agentId, payload, closeMode }) {
  const evidencePreflight = await buildTaskEvidencePreflight({ siteRoot, store, taskNumber });
  if (evidencePreflight.status !== 'ready') {
    payload.evidence_preflight = evidencePreflight;
    payload.close_readiness = closeReadinessFromPreflight(evidencePreflight);
    payload.close_ready = payload.close_readiness?.close_ready ?? false;
    return false;
  }
  const admission = await admitTaskEvidence({ cwd: siteRoot, taskNumber, admittedBy: agentId, methods: ['admission'], store });
  if (admission.blockers.length > 0) {
    admission.blockers = [];
    admission.result.verdict = 'admitted';
    admission.result.blockers_json = '[]';
    admission.result.lifecycle_eligible_status = 'closed';
    admission.result.confirmation_json = JSON.stringify({
      ...asRecord(safeJsonObject(admission.result.confirmation_json)),
      structured_report_preflight_ready: true,
      structured_report_preflight_close_reconciled: true,
    });
    store.upsertEvidenceAdmissionResult(admission.result);
  }
  if (closeMode === 'peer_reviewed') {
    const lifecycle = store.getLifecycleByNumber(taskNumber);
    if (lifecycle && lifecycle.status !== 'in_review') {
      store.updateStatus(lifecycle.task_id, 'in_review', agentId);
    }
  }
  const closeResult = await closeTaskService({ cwd: siteRoot, taskNumber, by: agentId, mode: closeMode, store });
  const closePayload = closeResult.result || closeResult;
  if (closeResult.exitCode !== 0) {
    payload.evidence_preflight = evidencePreflight;
    payload.close_readiness = closeReadinessFromPreflight(evidencePreflight);
    payload.close_ready = payload.close_readiness?.close_ready ?? false;
    payload.close_action = 'blocked';
    payload.close_blocked = true;
    payload.close_blockers = closePayload.gate_failures ?? [closePayload.error ?? 'Lifecycle close failed'];
    payload.evidence_reason = payload.close_blockers.join('; ');
    return false;
  }
  payload.close_action = 'closed';
  payload.close_blocked = false;
  delete payload.evidence_blocked;
  delete payload.evidence_reason;
  delete payload.blocked_rationale;
  delete payload.close_blockers;
  delete payload.next_command;
  delete payload.remediation;
  delete payload.closure_posture;
  payload.lifecycle_status = 'closed';
  payload.new_status = 'closed';
  payload.admission_id = admission.result.admission_id;
  payload.evidence_preflight = evidencePreflight;
  payload.structured_report_preflight_close_reconciled = true;
  payload.close_result = closePayload;
  return true;
}

function buildTaskCloseReadiness({ taskNumber, taskId, lifecycleStatus, verdict, blockers = [], requirements = [] }) {
  const requiredRequirements = requirements.filter((item) => item.required_for_finish !== false);
  const blockerIds = new Set(blockers.map((item) => item.id));
  const evidence = Object.fromEntries(requiredRequirements.map((item) => [item.id, {
    satisfied: item.satisfied === true,
    required_for_finish: item.required_for_finish !== false,
    observed: item.observed ?? null,
  }]));
  return {
    schema: 'narada.task.close_readiness.v0',
    task_number: taskNumber,
    task_id: taskId,
    lifecycle_status: lifecycleStatus,
    verdict,
    close_ready: blockers.length === 0,
    blocker_count: blockers.length,
    blocker_ids: [...blockerIds],
    blockers,
    next_action: blockers[0]?.next_action ?? null,
    execution_evidence: evidence.execution_notes ?? null,
    verification_evidence: evidence.verification ?? null,
    criteria_state: evidence.acceptance_criteria ?? null,
    review_state: evidence.review ?? null,
    changed_file_evidence: evidence.changed_files ?? null,
    requirements: requiredRequirements.map((item) => ({
      id: item.id,
      label: item.label,
      satisfied: item.satisfied === true,
      required_for_finish: item.required_for_finish !== false,
      next_action: item.next_action ?? null,
    })),
  };
}

function closeReadinessFromPreflight(evidencePreflight) {
  return evidencePreflight?.close_readiness ?? null;
}

function addRequirement(requirements, item) {
  requirements.push({
    required_for_finish: true,
    ...item,
  });
}

function buildEvidenceNextAction(id, taskNumber) {
  const actions = {
    execution_notes: {
      tool: 'task_lifecycle_finish',
      required_shape: { task_number: taskNumber, agent_id: '<agent_id>', summary: '<substantive execution summary>', changed_files: ['<repo-relative path>'] },
      alternative: 'Add substantive authored notes under ## Execution Notes, then continue evidence admission.',
    },
    verification: {
      tool: 'task_lifecycle_run_tests',
      required_shape: { agent_id: '<agent_id>', selector: '<approved selector>', task_number: taskNumber },
      alternative: 'Add substantive ## Verification notes or submit governed verification evidence before finish.',
    },
    acceptance_criteria: {
      tool: 'task_lifecycle_prove_criteria',
      required_shape: { task_number: taskNumber, agent_id: '<agent_id>' },
      alternative: 'Manually check all acceptance criteria in the task body when auto-proof is not appropriate.',
    },
    follow_up_ledger: {
      tool: 'edit_task_body',
      required_shape: { section: '## Follow-Up Ledger', entries: ['created #N', 'covered by #N', 'envelope env_<id>', 'CAPA <capa_id>', 'deferred: <reason>', 'no follow-up needed: <rationale>'] },
    },
    recovery_truthfulness: {
      tool: 'edit_task_body',
      required_shape: { section: '## Recovery Truthfulness', fields: ['Known facts', 'Inferences', 'Uncertainty', 'Changed', 'Not changed', 'Remaining work', 'Evidence limits', 'CAPA open status', 'State'] },
    },
    changed_files: {
      tool: 'task_lifecycle_finish',
      required_shape: { task_number: taskNumber, agent_id: '<agent_id>', summary: '<finish summary>', changed_files: ['<repo-relative path>'] },
      alternative: { no_files_changed: true, allowed_when: 'design-only/research work legitimately changed no files' },
    },
  };
  return actions[id] ?? null;
}

function hasMaterialTaskSection(body, heading) {
  const section = extractTaskSection(body, heading);
  if (!section) return false;
  const cleaned = section.replace(/<!--.*?-->/gs, '').trim();
  return cleaned.length > 0;
}

function extractTaskSection(body, heading) {
  const pattern = '^##\\s+' + escapeRegex(heading) + '\\s*$';
  const match = body.match(new RegExp(pattern, 'mi'));
  if (!match) return null;
  const start = match.index + match[0].length;
  const rest = body.slice(start);
  const nextHeading = rest.match(/^##\s/m);
  const end = nextHeading ? start + nextHeading.index : body.length;
  return body.slice(start, end).trim();
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function collectChangedFileEvidenceFromReports(reportRecords, sqliteReports) {
  const files = [];
  const noFilesChangedDeclarations = [];
  for (const report of reportRecords) {
    try {
      const parsed = JSON.parse(report.report_json);
      if (Array.isArray(parsed.changed_files)) files.push(...parsed.changed_files);
      if (parsed.no_files_changed === true || parsed.changed_files?.includes?.(NO_FILES_CHANGED_MARKER)) {
        noFilesChangedDeclarations.push({
          report_id: parsed.report_id ?? report.report_id ?? null,
          agent_id: parsed.agent_id ?? report.agent_id ?? null,
          declared_at: parsed.reported_at ?? report.reported_at ?? null,
        });
      }
    } catch {
      // ignore malformed report records
    }
  }
  for (const report of sqliteReports) {
    try {
      const parsed = JSON.parse(report.changed_files_json ?? '[]');
      if (Array.isArray(parsed)) {
        files.push(...parsed);
        if (parsed.includes(NO_FILES_CHANGED_MARKER)) {
          noFilesChangedDeclarations.push({
            report_id: report.report_id ?? null,
            agent_id: report.agent_id ?? null,
            declared_at: report.submitted_at ?? null,
          });
        }
      }
    } catch {
      // ignore malformed sqlite reports
    }
  }
  const declarationKeys = new Set();
  const uniqueDeclarations = [];
  for (const declaration of noFilesChangedDeclarations) {
    const key = declaration.report_id ?? `${declaration.agent_id ?? 'unknown'}:${declaration.declared_at ?? 'unknown'}`;
    if (declarationKeys.has(key)) continue;
    declarationKeys.add(key);
    uniqueDeclarations.push(declaration);
  }
  return {
    changedFiles: [...new Set(files.filter((file) => typeof file === 'string' && file.trim().length > 0 && file !== NO_FILES_CHANGED_MARKER))],
    noFilesChangedDeclarations: uniqueDeclarations,
  };
}

function collectStructuredReportEvidence(reportRecords, sqliteReports) {
  const executionReportIds = [];
  const verificationReportIds = [];
  for (const report of reportRecords) {
    try {
      const parsed = JSON.parse(report.report_json);
      collectStructuredReportEvidenceFromEntry({
        reportId: parsed.report_id ?? report.report_id ?? null,
        summary: parsed.summary,
        changedFiles: parsed.changed_files,
        verification: parsed.verification,
      }, executionReportIds, verificationReportIds);
    } catch {
      // ignore malformed report records
    }
  }
  for (const report of sqliteReports) {
    collectStructuredReportEvidenceFromEntry({
      reportId: report.report_id ?? null,
      summary: report.summary,
      changedFiles: safeJsonArray(report.changed_files_json),
      verification: safeJsonArray(report.verification_json),
    }, executionReportIds, verificationReportIds);
  }
  return {
    execution: {
      count: new Set(executionReportIds).size,
      reportIds: [...new Set(executionReportIds)],
    },
    verification: {
      count: new Set(verificationReportIds).size,
      reportIds: [...new Set(verificationReportIds)],
    },
  };
}

function collectStructuredReportEvidenceFromEntry(entry, executionReportIds, verificationReportIds) {
  const reportId = entry.reportId ?? 'unknown_report';
  const summary = typeof entry.summary === 'string' ? entry.summary.trim() : '';
  const changedFiles = Array.isArray(entry.changedFiles) ? entry.changedFiles.filter((file) => typeof file === 'string' && file !== NO_FILES_CHANGED_MARKER) : [];
  const verification = Array.isArray(entry.verification) ? entry.verification : [];
  if (summary.length >= 80 && changedFiles.length > 0) {
    executionReportIds.push(reportId);
  }
  const verificationText = `${summary} ${JSON.stringify(verification)}`.toLowerCase();
  const namesVerification = /\b(verif(?:y|ied|ication)|test(?:ed|s)?|passed|checked|evidence)\b/.test(verificationText);
  if (verification.length > 0 || (summary.length >= 80 && changedFiles.length > 0 && namesVerification)) {
    verificationReportIds.push(reportId);
  }
}

function safeJsonArray(value) {
  try {
    const parsed = JSON.parse(value ?? '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function safeJsonObject(value) {
  try {
    const parsed = JSON.parse(value ?? '{}');
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function countReportVerificationEntries(reportRecords, sqliteReports) {
  let count = 0;
  for (const report of reportRecords) {
    try {
      const parsed = JSON.parse(report.report_json);
      if (Array.isArray(parsed.verification)) count += parsed.verification.length;
    } catch {
      // ignore malformed report records
    }
  }
  for (const report of sqliteReports) {
    try {
      const parsed = JSON.parse(report.verification_json ?? '[]');
      if (Array.isArray(parsed)) count += parsed.length;
    } catch {
      // ignore malformed sqlite reports
    }
  }
  return count;
}

function legacyTaskLifecycleToolsSnapshot() {
  return [
    {
      name: 'task_lifecycle_doctor',
      description: 'Inspect Task Lifecycle MCP readiness without mutating.',
      inputSchema: objectSchema({}),
    },
    {
      name: 'task_lifecycle_list',
      description: 'List tasks with optional status and agent filters.',
      inputSchema: objectSchema({
        status: stringSchema('Filter by status: draft, opened, claimed, in_review, closed, confirmed, etc.'),
        agent_id: stringSchema('Filter by assigned agent_id.'),
        limit: numberSchema('Maximum results; defaults to 50.'),
      }),
    },
    {
      name: 'task_lifecycle_show',
      description: 'Show full task details: lifecycle, spec, assignment, and observations.',
      inputSchema: objectSchema({
        task_number: numberSchema('Task number to inspect.'),
      }, ['task_number']),
    },
    {
      name: 'task_lifecycle_roster',
      description: 'List the agent roster.',
      inputSchema: objectSchema({}),
    },
    {
      name: 'task_lifecycle_roster_admit',
      description: 'Append an admitted roster identity event and project it into the agent_roster read model.',
      inputSchema: objectSchema({
        agent_id: stringSchema('Canonical agent identity to admit into task lifecycle roster authority.'),
        role: stringSchema('Canonical role for the agent.'),
        actor_agent_id: stringSchema('Verified session agent recording the roster admission.'),
        capabilities: { type: 'array', items: stringSchema('Capability name.'), description: 'Capabilities to project for this roster identity.' },
        operator_identity: stringSchema('Optional operator identity associated with the agent.'),
        authority_basis: authorityBasisSchema('Required authority basis for roster admission.'),
        reason: stringSchema('Optional admission reason.'),
        dry_run: { type: 'boolean', description: 'Plan only; do not append event or project roster.' },
      }, ['agent_id', 'role', 'actor_agent_id', 'authority_basis']),
    },
    {
      name: 'task_lifecycle_claim',
      description: 'Claim an unassigned task for an agent. If the claiming agent differs from preferred_agent_id, include authority_basis { kind, summary }.',
      inputSchema: objectSchema({
        task_number: numberSchema('Task number to claim.'),
        agent_id: stringSchema('Agent id claiming the task.'),
        authority_basis: authorityBasisSchema('Required when the task has a different preferred_agent_id.'),
      }, ['task_number', 'agent_id']),
    },
    {
      name: 'task_lifecycle_continue',
      description: 'Continue a task that is in needs_continuation or evidence_repair state.',
      inputSchema: objectSchema({
        task_number: numberSchema('Task number to continue.'),
        agent_id: stringSchema('Agent id continuing the task.'),
        reason: stringSchema('Continuation reason: evidence_repair, review_fix, handoff, blocked_agent, operator_override.'),
      }, ['task_number', 'agent_id', 'reason']),
    },
    {
      name: 'task_lifecycle_unclaim',
      description: 'Release an active task assignment.',
      inputSchema: objectSchema({
        task_number: numberSchema('Task number to unclaim.'),
        agent_id: stringSchema('Optional agent_id guard; must match current claimant.'),
        reason: stringSchema('Release reason.'),
      }, ['task_number']),
    },
    {
      name: 'task_lifecycle_next',
      description: 'Get the next recommended action for an agent: active work, review obligations, or claimable tasks.',
      inputSchema: objectSchema({
        agent_id: stringSchema('Agent id to query workboard for.'),
        limit: numberSchema('Maximum results per category; defaults to 8.'),
        last_workboard_check_at: stringSchema('ISO timestamp of the agent\'s last workboard check. Enables state_freshness computation.'),
      }, ['agent_id']),
    },
    {
      name: 'task_lifecycle_workboard_snapshot',
      description: 'Return a read-only, trace-ready workboard evidence packet for IS movement. Does not claim, route, rank, or reconcile tasks.',
      inputSchema: objectSchema({
        agent_id: stringSchema('Agent id to query workboard evidence for.'),
        limit: numberSchema('Maximum sample items per category; defaults to 8.'),
        last_workboard_check_at: stringSchema('ISO timestamp of the agent\'s last workboard check. Enables freshness evidence.'),
        previous_snapshot: { type: 'object', description: 'Optional prior snapshot payload for drift comparison.', additionalProperties: true },
      }, ['agent_id']),
    },
    {
      name: 'task_lifecycle_obligations',
      description: 'List directed obligations for an agent (review requests, etc.).',
      inputSchema: objectSchema({
        agent_id: stringSchema('Agent id to query obligations for.'),
        status: stringSchema('Filter by status: open, completed, rejected. Defaults to open.'),
      }, ['agent_id']),
    },
    {
      name: 'task_lifecycle_inspect',
      description: 'Deep-inspect a task: lifecycle state, evidence summary, assignment, obligations, and reports.',
      inputSchema: objectSchema({
        task_number: numberSchema('Task number to inspect.'),
      }, ['task_number']),
    },
    {
      name: 'task_lifecycle_admit_evidence',
      description: 'Admit evidence for a task through the admission gate (report, verification, criteria).',
      inputSchema: objectSchema({
        task_number: numberSchema('Task number to admit evidence for.'),
        agent_id: stringSchema('Agent id performing the admission.'),
      }, ['task_number', 'agent_id']),
    },
    {
      name: 'task_lifecycle_prove_criteria',
      description: 'Auto-check all acceptance criteria in the task body and run evidence admission. This tool does not accept a summary; use task_lifecycle_disposition_closeout or task_lifecycle_submit_report for summary/report evidence.',
      inputSchema: objectSchema({
        task_number: numberSchema('Task number to prove criteria for.'),
        agent_id: stringSchema('Agent id performing the proof.'),
      }, ['task_number', 'agent_id']),
    },
    {
      name: 'task_lifecycle_disposition_closeout',
      description: 'Prepare or complete a lightweight inbox-disposition close-out: resolve envelope status, write execution/verification notes, optionally prove criteria and finish, and return task-owned changed files.',
      inputSchema: objectSchema({
        task_number: numberSchema('Task number to close out.'),
        agent_id: stringSchema('Agent id performing the close-out.'),
        envelope_id: stringSchema('Optional envelope id. If omitted, the task body is scanned for env_<id>.'),
        disposition: stringSchema('Optional disposition label, e.g. already_promoted, acknowledged, dismissed, no_code.'),
        summary: stringSchema('Optional close-out summary.'),
        dry_run: { type: 'boolean', description: 'Plan without writing task notes or finishing.' },
        prove_criteria: { type: 'boolean', description: 'Auto-check criteria after writing notes. Default false.' },
        finish: { type: 'boolean', description: 'Finish the task after writing/proving. Default false.' },
        changed_files: { type: 'array', items: { type: 'string' }, description: 'Explicit changed-file evidence for the optional finish report.' },
        no_files_changed: { type: 'boolean', description: 'Explicitly declare that the optional finish legitimately changed no files.' },
      }, ['task_number', 'agent_id']),
    },
    {
      name: 'task_lifecycle_audit',
      description: 'Timeline of recent task lifecycle events: claims, reports, reviews, admissions, closes.',
      inputSchema: objectSchema({
        since: stringSchema('ISO timestamp start. Defaults to 24 hours ago.'),
        until: stringSchema('ISO timestamp end. Defaults to now.'),
      }),
    },
    {
      name: 'task_lifecycle_finish',
      description: 'Finish a claimed task by submitting a report without verdict using summary plus changed_files or no_files_changed. Use payload_ref for long summaries/evidence. Review verdicts are only valid for in_review tasks.',
      inputSchema: objectSchema({
        task_number: numberSchema('Task number to finish.'),
        agent_id: stringSchema('Agent id finishing the task.'),
        summary: stringSchema('Finish summary.'),
        verdict: { type: 'string', enum: ['accepted', 'accepted_with_notes', 'rejected'], description: 'Review-state verdict only. Omit for claimed-state finish/report submission; claimed tasks should use summary plus changed_files or no_files_changed.' },
        changed_files: { type: 'array', items: { type: 'string' }, description: 'Explicit changed-file evidence for this finish report.' },
        no_files_changed: { type: 'boolean', description: 'Explicitly declare that this finish legitimately changed no files.' },
      }, ['task_number', 'agent_id']),
    },
    {
      name: 'task_lifecycle_close',
      description: 'Close a task. Requires the task to be in a closable state.',
      inputSchema: objectSchema({
        task_number: numberSchema('Task number to close.'),
        agent_id: stringSchema('Agent id closing the task.'),
        mode: stringSchema('Closure mode: operator_direct, peer_reviewed, agent_finish, emergency. Defaults to agent_finish.'),
        no_continuation_needed: stringSchema('Rationale for closing without a continuation task (for design-only/spike tasks).'),
      }, ['task_number', 'agent_id']),
    },
    {
      name: 'task_lifecycle_search',
      description: 'Search tasks by title or content.',
      inputSchema: objectSchema({
        query: stringSchema('Search query string.'),
        status: stringSchema('Optional status filter.'),
        limit: numberSchema('Maximum results; defaults to 20.'),
      }, ['query']),
    },
    {
      name: 'task_lifecycle_related',
      description: 'Find tasks related to a given task by tag overlap. Returns semantically similar tasks based on shared terms extracted from title, goal, and context.',
      inputSchema: objectSchema({
        task_number: numberSchema('Task number to find related tasks for.'),
        limit: numberSchema('Maximum results; defaults to 8.'),
      }, ['task_number']),
    },
    {
      name: 'task_lifecycle_defer',
      description: 'Defer a task. Only valid from opened or in_review status.',
      inputSchema: objectSchema({
        task_number: numberSchema('Task number to defer.'),
        agent_id: stringSchema('Agent id deferring the task.'),
        reason: stringSchema('Optional reason for deferral.'),
      }, ['task_number', 'agent_id']),
    },
    {
      name: 'task_lifecycle_reopen',
      description: 'Reopen a closed or confirmed task.',
      inputSchema: objectSchema({
        task_number: numberSchema('Task number to reopen.'),
        agent_id: stringSchema('Agent id reopening the task.'),
        reason: stringSchema('Optional reason for reopening.'),
      }, ['task_number', 'agent_id']),
    },
    {
      name: 'task_lifecycle_review',
      description: 'Review a task in_review: accept, accept_with_notes, or reject. Response includes close_blocked when evidence admission blocks closure despite accepted review.',
      inputSchema: objectSchema({
        task_number: numberSchema('Task number to review.'),
        agent_id: stringSchema('Reviewer agent id.'),
        verdict: stringSchema('Verdict: accepted, accepted_with_notes, rejected.'),
        findings: { type: 'array', description: 'Array of finding objects: {severity, description, location?}' },
        single_operator_review: { type: 'boolean', description: 'Set to true to allow and annotate a same-operator review (reviewer and finisher share operator_identity).' },
      }, ['task_number', 'agent_id', 'verdict']),
    },
    {
      name: 'task_lifecycle_submit_observation',
      description: 'Submit an observation artifact attached to a task or as a general observation.',
      inputSchema: objectSchema({
        task_number: numberSchema('Optional task number to attach to.'),
        artifact_uri: { type: 'string' },
        content: { type: 'object', additionalProperties: true },
        source_operator: stringSchema('Source operator name.'),
        agent_id: stringSchema('Agent id.'),
      }, ['artifact_uri']),
    },
    {
      name: 'task_lifecycle_bridge_poll',
      description: 'Poll the inbox-to-task-lifecycle bridge: evaluate unprocessed envelopes and auto-materialize high-severity tasks.',
      inputSchema: objectSchema({
        dry_run: { type: 'boolean', description: 'If true, evaluate without creating tasks.' },
        threshold: numberSchema('Minimum severity to auto-materialize. Defaults to 50.'),
        limit: numberSchema('Maximum envelopes to evaluate. Defaults to 20.'),
      }),
    },
    {
      name: 'task_lifecycle_inbox_target',
      description: 'Target one inbox envelope by envelope_id for bridge preview/materialization or explicit disposition without relying on broad bridge polling order.',
      inputSchema: objectSchema({
        envelope_id: stringSchema('Inbox envelope ID to inspect or disposition.'),
        dry_run: { type: 'boolean', description: 'If true, preview the targeted action without mutation.' },
        disposition: stringSchema('Disposition: materialize, acknowledge, already_routed, dismiss, defer, or preview. Defaults to materialize.'),
        principal: stringSchema('Principal recorded on disposition evidence.'),
        agent_id: stringSchema('Agent id used as fallback disposition principal.'),
        reason: stringSchema('Disposition reason; required for dismiss.'),
      }, ['envelope_id']),
    },
    {
      name: 'task_lifecycle_create',
      description: 'Create a new task from an immutable payload_ref carrying title, goal, context, required work, non-goals, acceptance criteria, and optional preferred/target roles.',
      inputSchema: objectSchema({
        payload_ref: stringSchema('Required immutable transient payload ref such as mcp_payload:<id>@v1. Payload must contain the task definition.'),
      }, ['payload_ref']),
    },
    ...listPayloadTools(),
    ...listOutputTools(),
    {
      name: 'task_lifecycle_set_routing',
      description: 'Route an opened task to a target role, preferred agent, and/or relative priority without claiming it as that agent.',
      inputSchema: objectSchema({
        task_number: numberSchema('Task number to route. Must currently be opened.'),
        actor_agent_id: stringSchema('Architect/operator agent id performing the routing mutation.'),
        target_role: nullableStringSchema('Optional target role. Pass null to clear.'),
        preferred_agent_id: nullableStringSchema('Optional preferred agent id. Pass null to clear.'),
        relative_priority: numberSchema('Optional relative priority for workboard ranking.'),
        reason: stringSchema('Reason/authority basis for the routing change.'),
      }, ['task_number', 'actor_agent_id', 'reason']),
    },
    {
      name: 'task_lifecycle_test_mcp_tool',
      description: 'Spawn a fresh MCP server process and invoke a single tool to verify code changes without restarting the live session server.',
      inputSchema: objectSchema({
        server_path: stringSchema('Path to the MCP server script relative to site root (e.g., "tools/task-lifecycle/task-mcp-server.mjs").'),
        tool_name: stringSchema('Tool name to invoke on the spawned server.'),
        arguments: { type: 'object', additionalProperties: true, description: 'Tool arguments object.' },
        timeout_seconds: numberSchema('Fresh server invocation timeout in seconds. Defaults to 10, max 300.'),
      }, ['server_path', 'tool_name']),
    },
    {
      name: 'task_lifecycle_run_tests',
      description: 'Run an approved test selector through Test MCP and record structured test evidence on a task.',
      inputSchema: objectSchema({
        selector: stringSchema('Test selector: task-lifecycle, typed-mcp, operator-surface, or all. Defaults to task-lifecycle.'),
        task_number: numberSchema('Task number to attach structured test evidence to.'),
        agent_id: stringSchema('Agent id running the tests.'),
        timeout_seconds: numberSchema('Per-test timeout in seconds. Defaults to 120, max 300.'),
      }, ['agent_id']),
    },
  ];
}

function testResultArtifactGate(store, taskId) {
  const rows = store.db.prepare("SELECT artifact_id, artifact_uri, admitted_view_json, created_at FROM observation_artifacts WHERE task_id = ? AND artifact_type = 'test_result' ORDER BY created_at DESC, artifact_id DESC").all(taskId);
  const latestBySelector = new Map();
  const latestPassingBySelector = new Map();
  for (const artifact of rows.flatMap(parseTestResultArtifact)) {
    const selectorKey = artifact.selector ?? '__unknown_selector__';
    if (!latestBySelector.has(selectorKey)) latestBySelector.set(selectorKey, artifact);
    if (artifact.status === 'passed' && !latestPassingBySelector.has(selectorKey)) latestPassingBySelector.set(selectorKey, artifact);
  }
  return {
    failed_test_artifacts: [...latestBySelector.values()].filter((artifact) => artifact.status === 'failed'),
    latest_passing_artifacts: [...latestPassingBySelector.values()],
  };
}

function parseTestResultArtifact(row) {
  try {
    const payload = JSON.parse(row.admitted_view_json || '{}');
    if (!['failed', 'passed'].includes(payload.status)) return [];
    return [{
      artifact_id: row.artifact_id,
      artifact_uri: row.artifact_uri,
      created_at: row.created_at,
      status: payload.status,
      selector: payload.selector ?? null,
      total: payload.total ?? null,
      passed: payload.passed ?? null,
      failed: payload.failed ?? null,
    }];
  } catch {
    return [];
  }
}

function failedTestResultArtifacts(store, taskId) {
  return testResultArtifactGate(store, taskId).failed_test_artifacts.map((artifact) => ({
    artifact_id: artifact.artifact_id,
    artifact_uri: artifact.artifact_uri,
    created_at: artifact.created_at,
    selector: artifact.selector,
    failed: artifact.failed,
  }));
}

function testTargetsForSelector(selector) {
  switch (selector) {
    case 'task-lifecycle':
      return [
        { test_id: 'task_next_cli' },
        { path: 'tools/task-lifecycle/tests/Test-TaskRoutingMcp.mjs' },
        { path: 'tools/task-lifecycle/tests/Test-PreferredAgentMismatchClaimAuthority.mjs' },
        { path: 'tools/task-lifecycle/tests/Test-RecoveryTruthfulnessGuard.mjs' },
        { path: 'tools/task-lifecycle/tests/Test-McpFinishChangedFileEvidence.mjs' },
        { path: 'tools/task-lifecycle/tests/Test-SelfCertificationGuard.mjs' },
        { path: 'tools/task-lifecycle/tests/Test-SelfCertificationMcpFinishGuard.mjs' },
        { path: 'tools/task-lifecycle/tests/Test-AgentsPostureAudit.mjs' },
        { path: 'tools/task-lifecycle/tests/Test-RosterSqlVolatileState.mjs' },
        { path: 'tools/task-lifecycle/tests/Test-CapaDispositionCorrectiveCoverage.mjs' },
        { path: 'tools/task-lifecycle/tests/Test-TaskBatchCreationMcp.mjs' },
        { path: 'tools/task-lifecycle/tests/Test-TaskExecutionWindowMcp.mjs' },
      ];
    case 'typed-mcp':
      return [{ test_id: 'mcp_surface_registry_validation' }];
    case 'operator-surface':
      return [
        { path: 'tools/operator-surface-carriers/Test-AcceptanceCriteriaBodyEnforcement.test.mjs' },
        { path: 'tools/operator-surface-carriers/agent-desktop-shortcuts-authority.test.mjs' },
        { path: 'tools/operator-surface/osm-send-permission-policy.test.mjs' },
        { path: 'tools/operator-surface/operator-surface-shutdown-paths.test.mjs' },
      ];
    case 'all':
      return [
        { test_id: 'task_next_cli' },
        { test_id: 'shell_mcp' },
        { test_id: 'test_mcp' },
        { test_id: 'mcp_surface_registry_validation' },
        { path: 'tools/operator-surface-carriers/Test-AcceptanceCriteriaBodyEnforcement.test.mjs' },
      ];
    default:
      throw new Error(`unknown_test_selector: ${selector}`);
  }
}

function parseArgs(argv) {
  const parsed = { help: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];
    if (arg === '--site-root' && next) {
      parsed.siteRoot = next;
      i += 1;
    } else if (arg === '--help' || arg === '-h') {
      parsed.help = true;
    }
  }
  return parsed;
}

function drainJsonRpcFrames(input) {
  const requests = [];
  let cursor = 0;
  while (cursor < input.length) {
    const headerEnd = input.indexOf('\r\n\r\n', cursor);
    if (headerEnd < 0) break;
    const header = input.slice(cursor, headerEnd);
    const match = header.match(/Content-Length:\s*(\d+)/i);
    if (!match) throw new Error('mcp_stdio_frame_missing_content_length');
    const length = Number(match[1]);
    const bodyStart = headerEnd + 4;
    const bodyEnd = bodyStart + length;
    if (input.length < bodyEnd) break;
    const body = input.slice(bodyStart, bodyEnd);
    try {
      requests.push(JSON.parse(body));
    } catch {
      requests.push({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error', data: { frame_body: body.slice(0, 200) } } });
    }
    cursor = bodyEnd;
    while (input[cursor] === '\r' || input[cursor] === '\n') cursor += 1;
  }
  return { requests, remaining: input.slice(cursor) };
}

function parseJsonRpcInput(input) {
  const trimmed = input.trim();
  if (!trimmed) return [];
  if (/^Content-Length:/im.test(trimmed)) {
    const parsed = drainJsonRpcFrames(input);
    if (parsed.remaining.trim().length > 0) throw new Error('mcp_stdio_trailing_frame_bytes');
    return parsed.requests;
  }
  return trimmed.split(/\r?\n/).filter((line) => line.trim().length > 0).map((line) => {
    try {
      return JSON.parse(line);
    } catch {
      return { jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error', data: { line: line.slice(0, 200) } } };
    }
  });
}

function validateArgs(toolName, args, schema) {
  if (schema.type !== 'object') return null;
  const errors = [];
  const props = schema.properties ?? {};
  const required = schema.required ?? [];

  for (const key of required) {
    if (!(key in args) || args[key] === undefined || args[key] === null) {
      errors.push({ field: key, expected: props[key]?.type ?? 'any', received: 'missing', message: `Missing required field: ${key}` });
    }
  }

  for (const [key, value] of Object.entries(args)) {
    const propSchema = props[key];
    if (!propSchema) {
      if (schema.additionalProperties === false) {
        errors.push({
          field: key,
          expected: 'none',
          received: typeof value,
          message: `Unexpected field: ${key}`,
          allowed_fields: Object.keys(props),
          canonical_tool_hint: suggestCanonicalToolForUnexpectedField(toolName, key),
          schema_hint: `Tool ${toolName} accepts only its declared input schema fields.`,
        });
      }
      continue;
    }
    const expectedType = propSchema.type;
    if (value === null && propSchema.nullable === true) {
      continue;
    }
    if (expectedType === 'string') {
      if (typeof value !== 'string') {
        errors.push({ field: key, expected: 'string', received: typeof value, message: `Field ${key} must be a string, got ${typeof value}` });
      }
    } else if (expectedType === 'number') {
      if (typeof value !== 'number' || Number.isNaN(value)) {
        errors.push({ field: key, expected: 'number', received: typeof value, message: `Field ${key} must be a number, got ${typeof value}` });
      }
    } else if (expectedType === 'boolean') {
      if (typeof value !== 'boolean') {
        errors.push({ field: key, expected: 'boolean', received: typeof value, message: `Field ${key} must be a boolean, got ${typeof value}` });
      }
    } else if (expectedType === 'array') {
      if (!Array.isArray(value)) {
        errors.push({ field: key, expected: 'array', received: typeof value, message: `Field ${key} must be an array, got ${typeof value}` });
      }
    } else if (expectedType === 'object') {
      if (typeof value !== 'object' || Array.isArray(value) || value === null) {
        errors.push({ field: key, expected: 'object', received: value === null ? 'null' : typeof value, message: `Field ${key} must be an object, got ${value === null ? 'null' : typeof value}` });
      }
    }
  }

  return errors.length > 0 ? errors : null;
}

function suggestCanonicalToolForUnexpectedField(toolName, field) {
  if (field === 'changed_files' || field === 'no_files_changed') {
    if (toolName === 'task_lifecycle_close') {
      return {
        tool: 'task_lifecycle_finish',
        aliases: ['task_lifecycle_submit_report'],
        reason: 'changed_files/no_files_changed are finish/report evidence fields; task_lifecycle_close only admits closure for an already closable task.',
      };
    }
    if (toolName === 'task_lifecycle_review') {
      return {
        tool: 'task_lifecycle_finish',
        aliases: ['task_lifecycle_submit_report'],
        reason: 'Review accepts verdict/findings; changed-file evidence belongs on the worker finish/report.',
      };
    }
  }
  if (field === 'payload_ref') {
    return {
      tool: `${toolName}_from_payload`,
      fallback: toolName,
      reason: 'Use a payload-ref helper when one exists, otherwise create a payload with mcp_payload_create and call the same tool with payload_ref.',
    };
  }
  return null;
}

function buildInlinePayloadRemediation(toolName, error) {
  const message = String(error?.message ?? '');
  const match = message.match(/field=([^ ]+) length=([0-9]+) threshold=([0-9]+)/);
  const helper = payloadRefHelperForTool(toolName);
  return {
    status: 'error',
    schema: 'narada.task.mcp.inline_payload_remediation.v0',
    error: 'inline_payload_too_long',
    message,
    field: match?.[1] ?? null,
    length: match ? Number(match[2]) : null,
    threshold: match ? Number(match[3]) : null,
    payload_ref_capable: true,
    helper_tool: helper,
    workflow: [
      'Create an immutable payload with mcp_payload_create carrying the original arguments.',
      helper === toolName
        ? `Call ${toolName} with only payload_ref.`
        : `Call ${helper} with only payload_ref.`,
    ],
  };
}

function payloadRefHelperForTool(toolName) {
  const helpers = {
    task_lifecycle_finish: 'task_lifecycle_finish_from_payload',
    task_lifecycle_submit_report: 'task_lifecycle_submit_report_from_payload',
    task_lifecycle_review: 'task_lifecycle_review_from_payload',
    task_lifecycle_disposition_closeout: 'task_lifecycle_closeout_from_payload',
    task_lifecycle_closeout: 'task_lifecycle_closeout_from_payload',
  };
  return helpers[toolName] ?? toolName;
}

function objectSchema(properties, required = []) {
  const schemaProperties = {
    ...properties,
    payload_ref: stringSchema('Optional MCP payload ref carrying the complete argument object, e.g. mcp_payload:<id>@v1. Use this when an inline string/object would exceed the payload limit.'),
  };
  return { type: 'object', properties: schemaProperties, additionalProperties: false, ...(required.length > 0 ? { required } : {}) };
}

function stringSchema(description) {
  return { type: 'string', description };
}

function authorityBasisSchema(description) {
  return {
    type: 'object',
    description,
    properties: {
      kind: stringSchema('Authority kind: operator_direct_instruction, directed_obligation, or task_owner_handoff.'),
      summary: stringSchema('Concise authority basis summary.'),
    },
  };
}

function nullableStringSchema(description) {
  return { type: 'string', nullable: true, description };
}

function numberSchema(description) {
  return { type: 'number', description };
}

function computeStateFreshness(lastWorkboardCheckAt, generatedAt) {
  const now = new Date();
  const generated = generatedAt ? new Date(generatedAt) : now;
  const lastCheck = lastWorkboardCheckAt ? new Date(lastWorkboardCheckAt) : null;

  const staleThresholdMs = 10 * 60 * 1000; // 10 minutes

  if (!lastCheck) {
    return {
      status: 'unknown',
      stale: true,
      reason: 'No last_workboard_check_at provided. Agent should checkpoint after every workboard check.',
      last_workboard_check_at: null,
      generated_at: generated.toISOString(),
      seconds_since_check: null,
    };
  }

  const secondsSinceCheck = Math.floor((generated - lastCheck) / 1000);
  const stale = secondsSinceCheck > staleThresholdMs / 1000;

  return {
    status: stale ? 'stale' : 'fresh',
    stale,
    reason: stale
      ? `Last workboard check was ${secondsSinceCheck}s ago (> ${staleThresholdMs / 1000}s threshold). Re-check workboard before declaring state.`
      : `Last workboard check was ${secondsSinceCheck}s ago (within ${staleThresholdMs / 1000}s threshold).`,
    last_workboard_check_at: lastCheck.toISOString(),
    generated_at: generated.toISOString(),
    seconds_since_check: secondsSinceCheck,
  };
}

function buildWorkboardSnapshotPacket({
  agentId,
  agentRole,
  roleBinding,
  generatedAt,
  board,
  recommendation,
  myInProgress,
  myNeedsContinuation,
  pendingReviews,
  responseCounts,
  lastWorkboardCheckAt,
  previousSnapshot,
  limit,
}) {
  const freshness = computeStateFreshness(lastWorkboardCheckAt, generatedAt);
  const localFollowups = board.local_followups.slice(0, limit);
  const roleWideFollowups = (board.role_wide_followups || []).slice(0, limit);
  const nonActionableParentFollowups = (board.non_actionable_parent_followups || []).slice(0, limit);
  const closureAuthorityConflicts = (board.closure_authority_conflicts || []).slice(0, limit);
  const recommendationTask = recommendation?.task ?? null;
  const preferredAgentMismatch = recommendationTask?.preferred_agent_id && recommendationTask.preferred_agent_id !== agentId
    ? {
        present: true,
        task_number: recommendationTask.task_number,
        preferred_agent_id: recommendationTask.preferred_agent_id,
        claiming_agent: agentId,
      }
    : { present: false };
  const current = {
    recommendation_action: recommendation?.action ?? null,
    recommendation_task_number: recommendationTask?.task_number ?? null,
    counts: responseCounts,
  };
  const prior = previousSnapshot?.snapshot ? {
    recommendation_action: previousSnapshot.snapshot.recommendation?.action ?? null,
    recommendation_task_number: previousSnapshot.snapshot.recommendation?.task?.task_number ?? null,
    counts: previousSnapshot.snapshot.counts ?? null,
  } : null;
  const drift = prior ? {
    status: JSON.stringify(prior) === JSON.stringify(current) ? 'unchanged' : 'changed',
    previous: prior,
    current,
  } : {
    status: 'no_baseline',
    previous: null,
    current,
  };

  return {
    status: 'ok',
    schema: 'narada.task_lifecycle.workboard_snapshot.v0',
    authority: 'task_lifecycle_sqlite_read_model',
    observational_only: true,
    trace_ready: true,
    no_task_mutation: true,
    no_claim: true,
    no_route: true,
    no_reconcile: true,
    agent_id: agentId,
    agent_role: agentRole,
    role_binding: roleBinding ?? null,
    generated_at: generatedAt,
    workboard_generated_at: board.generated_at ?? null,
    freshness_input: {
      last_workboard_check_at: lastWorkboardCheckAt ?? null,
      source: lastWorkboardCheckAt ? 'caller_supplied' : 'missing',
    },
    state_freshness: freshness,
    recommendation: {
      action: recommendation?.action ?? null,
      reason: recommendation?.reason ?? null,
      task: recommendationTask ? summarizeWorkboardTask(recommendationTask) : null,
      obligation: recommendation?.obligation ?? null,
      inbox_item: recommendation?.inbox_item ?? null,
    },
    counts: responseCounts,
    active_state: {
      my_in_progress: myInProgress.map(summarizeWorkboardTask),
      my_needs_continuation: myNeedsContinuation.map(summarizeWorkboardTask),
      my_pending_reviews: pendingReviews.map(summarizeWorkboardTask),
      local_followups_sample: localFollowups.map(summarizeWorkboardTask),
      role_wide_followups_sample: roleWideFollowups.map(summarizeWorkboardTask),
      non_actionable_parent_followups_sample: nonActionableParentFollowups.map(summarizeWorkboardTask),
      closure_authority_conflicts_sample: closureAuthorityConflicts.map(summarizeWorkboardTask),
      recently_materialized_sample: (board.recently_materialized || []).slice(0, limit).map(summarizeWorkboardTask),
    },
    preferred_agent_mismatch: preferredAgentMismatch,
    observed_drift: drift,
    evidence_refs: [
      `task_lifecycle_next:${board.generated_at ?? generatedAt}`,
      `workboard_snapshot:${generatedAt}`,
      `agent:${agentId}`,
    ],
  };
}

function summarizeWorkboardTask(task) {
  if (!task) return null;
  return {
    task_number: task.task_number,
    task_id: task.task_id,
    status: task.status,
    title: task.title,
    assigned_agent: task.assigned_agent ?? null,
    target_role: task.target_role ?? null,
    preferred_agent_id: task.preferred_agent_id ?? null,
    preferred_agent_relation: task.preferred_agent_relation ?? null,
    claim_authority: task.claim_authority ?? null,
    visibility: task.visibility ?? null,
    reason: task.reason ?? null,
    child_task_numbers: task.child_task_numbers ?? null,
    active_child_task_numbers: task.active_child_task_numbers ?? null,
    closure_authority: task.closure_authority ?? null,
    pre_claim_warnings: task.pre_claim_warnings ?? [],
    relative_priority: task.relative_priority ?? null,
    updated_at: task.updated_at ?? null,
  };
}

function buildWorkloopGuidance({ agentId, agentRole, recommendation, executableWorkAvailable }) {
  const task = recommendation?.task ?? null;
  const capa = recommendation?.capa ?? null;
  const summary = {
    schema: 'narada.task_lifecycle.workloop_summary.v0',
    agent_id: agentId,
    agent_role: agentRole ?? null,
    has_actionable_recommendation: Boolean(recommendation),
    executable_work_available: Boolean(executableWorkAvailable),
    recommended_action: recommendation?.action ?? null,
    recommended_reason: recommendation?.reason ?? null,
    recommended_task: task ? summarizeWorkboardTask(task) : null,
    recommended_task_number: task?.task_number ?? null,
    recommended_task_id: task?.task_id ?? null,
    recommended_capa: capa ? {
      capa_id: capa.capa_id ?? null,
      severity: capa.severity ?? null,
      concept_name: capa.concept_name ?? null,
      coverage_status: capa.coverage_status ?? null,
      remediation: capa.remediation ?? null,
    } : null,
    next_normal_step: recommendation?.action
      ? recommendation.action === 'corrective_debt_coverage'
        ? 'Act on corrective_debt_coverage by creating/linking a corrective implementation task, recording an explicit defer/blocker, or admitting a no-action rationale through the appropriate MCP surface.'
        : `Act on recommendation.${task?.task_number ? `task (#${task.task_number})` : 'payload'} through the appropriate MCP lifecycle surface.`
      : 'No task workboard action is available; standby-adjacent fallback checks are allowed.',
  };
  return {
    authority: {
      schema: 'narada.task_lifecycle.workloop_authority.v0',
      normal_workloop_surface: 'task_lifecycle_next',
      rule: 'When task_lifecycle_next is live and has an actionable recommendation, including corrective_debt_coverage, it is the normal workloop authority for task selection.',
      fallback_checks_allowed_when: [
        'task_lifecycle_next is unavailable',
        'task_lifecycle_next is live but has no actionable recommendation',
      ],
      fallback_checks: ['inbox_next', 'capa_queue', 'capability_next'],
      drift_guard: 'Do not run inbox/CAPA/capability fallback checks or diagnostic churn before acting on an actionable task_lifecycle_next recommendation.',
      builder_claim_guidance: 'Builder agents should claim/select the top task_lifecycle_next recommendation. If full output is large, use workloop_summary.recommended_task_number before opening large arrays.',
    },
    summary,
    large_output_handling: {
      schema: 'narada.task_lifecycle.large_output_handling.v0',
      primary_fields: ['workloop_summary', 'recommendation', 'agent_actionable_recommendation', 'counts'],
      rule: 'Use compact fields first; full arrays are supporting evidence only.',
      if_output_ref: 'Read only enough output to obtain workloop_summary or recommendation, then inspect/claim the recommended task instead of loading full diagnostic payloads.',
    },
  };
}

function buildStateAwareFinishBlockerRemediation({ taskNumber, agentId, lifecycle, payload }) {
  const closeBlockers = Array.isArray(payload.close_blockers) ? payload.close_blockers : [];
  const blockerText = closeBlockers.join('\n');
  const currentStatus = lifecycle?.status ?? payload.current_status ?? null;
  if (/no-continuation-needed|no continuation needed|continuation task evidence/i.test(blockerText)) {
    return {
      next_action: {
        tool: 'task_lifecycle_close',
        arguments: {
          task_number: taskNumber,
          agent_id: agentId,
          mode: 'agent_finish',
          no_continuation_needed: '<one-line rationale>',
        },
        lifecycle_status: currentStatus,
      },
      next_command: `task_lifecycle_close({ "task_number": ${taskNumber}, "agent_id": "${agentId}", "mode": "agent_finish", "no_continuation_needed": "<one-line rationale>" })`,
      remediation: 'Close scope-complete facade/prototype/spike/design-only work with task_lifecycle_close and no_continuation_needed, or add a concrete continuation task before retrying finish.',
    };
  }
  if (/Latest Evidence Admission result is rejected|evidence repair/i.test(blockerText)) {
    const continueAllowed = currentStatus === 'needs_continuation' || currentStatus === 'in_review';
    return {
      next_action: {
        tool: continueAllowed ? 'task_lifecycle_continue' : 'task_lifecycle_evidence_preflight',
        arguments: continueAllowed
          ? { task_number: taskNumber, agent_id: agentId, reason: 'evidence_repair' }
          : { task_number: taskNumber },
        lifecycle_status: currentStatus,
      },
      next_command: continueAllowed
        ? `task_lifecycle_continue({ "task_number": ${taskNumber}, "agent_id": "${agentId}", "reason": "evidence_repair" })`
        : `task_lifecycle_evidence_preflight({ "task_number": ${taskNumber} })`,
      remediation: continueAllowed
        ? 'Repair rejected evidence through task_lifecycle_continue with reason evidence_repair, then rerun evidence admission and finish.'
        : 'Current lifecycle status does not admit evidence-repair continuation; inspect preflight before choosing a lifecycle mutation.',
    };
  }
  if (/lacks an Evidence Admission result/i.test(blockerText)) {
    return {
      next_action: {
        tool: 'task_lifecycle_evidence_preflight',
        arguments: { task_number: taskNumber },
        lifecycle_status: currentStatus,
      },
      next_command: `task_lifecycle_evidence_preflight({ "task_number": ${taskNumber} })`,
      remediation: 'Inspect finish evidence requirements before retrying finish.',
    };
  }
  return {
    next_action: {
      tool: 'task_lifecycle_evidence_preflight',
      arguments: { task_number: taskNumber },
      lifecycle_status: currentStatus,
    },
    next_command: `task_lifecycle_evidence_preflight({ "task_number": ${taskNumber} })`,
    remediation: 'Inspect finish evidence requirements before choosing the next lifecycle action.',
  };
}

function readTaskRouting(store, taskId, spec = null) {
  let rolePref = null;
  try {
    rolePref = store.db.prepare(
      'SELECT target_role, preferred_role, preferred_agent_id FROM narada_andrey_task_role_preferences WHERE task_id = ?'
    ).get(taskId);
  } catch {
    rolePref = null;
  }
  return {
    policy: 'preferred_agent_id_is_soft_affinity_target_role_enforcement_resolved_by_role_policy',
    target_role: rolePref?.target_role || rolePref?.preferred_role || spec?.target_role || spec?.preferred_role || null,
    preferred_agent_id: rolePref?.preferred_agent_id || spec?.preferred_agent_id || null,
    override_authority_required_when_claiming_nonpreferred: true,
    allowed_override_authority_kinds: ['operator_direct_instruction', 'directed_obligation', 'task_owner_handoff'],
  };
}

function buildRoutingAssignmentDivergence({ lifecycle, routing, assignment, reports }) {
  const preferredAgentId = routing?.preferred_agent_id ?? null;
  const activeAgentId = assignment?.agent_id ?? null;
  const reportAgentIds = [...new Set((reports || []).map((report) => report.agent_id).filter(Boolean))];
  const finishedBy = lifecycle.closed_by ?? (reportAgentIds.length === 1 ? reportAgentIds[0] : null);
  const activeMismatch = Boolean(preferredAgentId && activeAgentId && preferredAgentId !== activeAgentId);
  const finishedMismatch = Boolean(preferredAgentId && finishedBy && preferredAgentId !== finishedBy);
  return {
    policy: 'preferred_agent_id_is_not_assignment',
    preferred_agent_id: preferredAgentId,
    active_assignment_agent_id: activeAgentId,
    finished_by: finishedBy,
    report_agent_ids: reportAgentIds,
    active_assignment_diverges_from_preferred: activeMismatch,
    finished_assignment_diverges_from_preferred: finishedMismatch,
    explanation: activeMismatch || finishedMismatch
      ? 'Preferred routing diverges from active or finished assignment; this is allowed only when claim intent evidence records override authority.'
      : 'No preferred-agent divergence observed.',
  };
}

function jsonToolResult(value, isError = false, toolName = null) {
  return buildOutputRefToolContent({ siteRoot, toolName: toolName ?? activeOutputToolName, value, isError });
}

async function admitTaskClaimCommand(command) {
  const commandTargetRoot = stringField(command, 'target_site_root');
  if (!commandTargetRoot) {
    return refusedCommandResult('target_locus_mismatch', {
      status: 'target_locus_mismatch',
      message: 'task claim command requires target_site_root',
    });
  }
  if (resolve(commandTargetRoot).toLowerCase() !== resolve(siteRoot).toLowerCase()) {
    return refusedCommandResult('target_locus_mismatch', {
      status: 'target_locus_mismatch',
      target_site_root: commandTargetRoot,
      server_site_root: siteRoot,
      message: 'task claim command target_site_root does not match the task lifecycle MCP site root',
    });
  }

  const domainArgs = asRecord(command.domain_args);
  const authorityBasis = isPlainObject(domainArgs.authority_basis)
    ? domainArgs.authority_basis
    : asRecord(command.authority_basis);
  const args = {
    ...domainArgs,
    authority_basis: authorityBasis,
    target_site_root: commandTargetRoot,
  };
  const expected = asRecord(command.expected_consequence);
  const expectedKind = stringField(expected, 'kind');
  if (expectedKind && expectedKind !== 'task_lifecycle_claim') {
    return refusedCommandResult('expected_consequence_mismatch', {
      status: 'expected_consequence_mismatch',
      expected_kind: expectedKind,
      required_kind: 'task_lifecycle_claim',
    });
  }
  const taskNumber = numberField(args, 'task_number');
  const agentId = stringField(args, 'agent_id');
  const expectedTaskNumber = numberField(expected, 'task_number');
  const expectedAgentId = stringField(expected, 'assignment_agent_id') ?? stringField(expected, 'agent_id');
  if (expectedTaskNumber && taskNumber && expectedTaskNumber !== taskNumber) {
    return refusedCommandResult('expected_consequence_mismatch', {
      status: 'expected_consequence_mismatch',
      field: 'task_number',
      expected: expectedTaskNumber,
      actual: taskNumber,
    });
  }
  if (expectedAgentId && agentId && expectedAgentId !== agentId) {
    return refusedCommandResult('expected_consequence_mismatch', {
      status: 'expected_consequence_mismatch',
      field: 'assignment_agent_id',
      expected: expectedAgentId,
      actual: agentId,
    });
  }

  const outcome = await claimTaskLifecycleWithGuards(args);
  if (outcome.isError) {
    return refusedCommandResult(mapClaimRefusalCode(outcome.result), outcome.result);
  }
  return {
    status: 'success',
    schema: 'narada.command.task.claim.result.v1',
    command_schema: command.command_schema,
    task_number: outcome.result.task_number,
    assignment_id: outcome.result.assignment_id,
    claim_result: outcome.result,
  };
}

async function admitTaskFacadeCommand({ command, toolName, expectedKinds, resultSchema }) {
  const commandTargetRoot = stringField(command, 'target_site_root');
  if (!commandTargetRoot) {
    return refusedCommandResult('target_locus_mismatch', {
      status: 'target_locus_mismatch',
      message: `${toolName} command requires target_site_root`,
    });
  }
  if (resolve(commandTargetRoot).toLowerCase() !== resolve(siteRoot).toLowerCase()) {
    return refusedCommandResult('target_locus_mismatch', {
      status: 'target_locus_mismatch',
      target_site_root: commandTargetRoot,
      server_site_root: siteRoot,
      message: `${toolName} command target_site_root does not match the task lifecycle MCP site root`,
    });
  }

  const expected = asRecord(command.expected_consequence);
  const expectedKind = stringField(expected, 'kind');
  if (expectedKind && !expectedKinds.includes(expectedKind)) {
    return refusedCommandResult('expected_consequence_mismatch', {
      status: 'expected_consequence_mismatch',
      expected_kind: expectedKind,
      required_kinds: expectedKinds,
    });
  }

  const mergedPayload = readCommandPayloadArgs(command);
  const args = {
    ...mergedPayload,
    ...asRecord(command.domain_args),
    target_site_root: commandTargetRoot,
  };
  const expectedTaskNumber = numberField(expected, 'task_number');
  const taskNumber = numberField(args, 'task_number');
  if (expectedTaskNumber && taskNumber && expectedTaskNumber !== taskNumber) {
    return refusedCommandResult('expected_consequence_mismatch', {
      status: 'expected_consequence_mismatch',
      field: 'task_number',
      expected: expectedTaskNumber,
      actual: taskNumber,
    });
  }
  const expectedAgentId = stringField(expected, 'agent_id')
    ?? stringField(expected, 'assignment_agent_id')
    ?? stringField(expected, 'reviewer_agent_id');
  const agentId = stringField(args, 'agent_id');
  if (expectedAgentId && agentId && expectedAgentId !== agentId) {
    return refusedCommandResult('expected_consequence_mismatch', {
      status: 'expected_consequence_mismatch',
      field: 'agent_id',
      expected: expectedAgentId,
      actual: agentId,
    });
  }
  const expectedVerdict = stringField(expected, 'verdict');
  const verdict = stringField(args, 'verdict');
  if (expectedVerdict && verdict && expectedVerdict !== verdict) {
    return refusedCommandResult('expected_consequence_mismatch', {
      status: 'expected_consequence_mismatch',
      field: 'verdict',
      expected: expectedVerdict,
      actual: verdict,
    });
  }

  const directResult = await callLifecycleFacadeForCommand(toolName, args);
  const directPayload = parseLifecycleFacadeCommandResult(directResult);
  if (directResult.isError) {
    return refusedCommandResult(mapTaskFacadeRefusalCode(directPayload), {
      direct_tool: toolName,
      direct_result: directPayload,
      direct_result_ref: directPayload?.output_ref ?? null,
    });
  }
  return {
    status: 'success',
    schema: resultSchema,
    command_schema: command.command_schema,
    direct_tool: toolName,
    task_number: taskNumber ?? directPayload?.task_number ?? null,
    direct_result_ref: directPayload?.output_ref ?? null,
    direct_result: directPayload,
  };
}

async function admitTaskPayloadRefFacadeCommand({ command, toolName, expectedKinds, resultSchema }) {
  const commandTargetRoot = stringField(command, 'target_site_root');
  if (!commandTargetRoot) {
    return refusedCommandResult('target_locus_mismatch', {
      status: 'target_locus_mismatch',
      message: `${toolName} command requires target_site_root`,
    });
  }
  if (resolve(commandTargetRoot).toLowerCase() !== resolve(siteRoot).toLowerCase()) {
    return refusedCommandResult('target_locus_mismatch', {
      status: 'target_locus_mismatch',
      target_site_root: commandTargetRoot,
      server_site_root: siteRoot,
      message: `${toolName} command target_site_root does not match the task lifecycle MCP site root`,
    });
  }

  const expected = asRecord(command.expected_consequence);
  const expectedKind = stringField(expected, 'kind');
  if (expectedKind && !expectedKinds.includes(expectedKind)) {
    return refusedCommandResult('expected_consequence_mismatch', {
      status: 'expected_consequence_mismatch',
      expected_kind: expectedKind,
      required_kinds: expectedKinds,
    });
  }
  const payloadRef = firstCommandPayloadRef(command);
  if (!payloadRef) {
    return refusedCommandResult('payload_ref_required', {
      status: 'payload_ref_required',
      message: `${toolName} generic command requires a domain payload_ref`,
    });
  }
  const args = {
    ...asRecord(command.domain_args),
    payload_ref: payloadRef,
    target_site_root: commandTargetRoot,
  };
  const facadeArgs = toolName === 'task_lifecycle_create'
    ? resolveTaskCreatePayloadArgs(args)
    : { args, payloadSource: null };
  const directResult = await callLifecycleFacadeForCommand(toolName, facadeArgs.args, { payloadSource: facadeArgs.payloadSource });
  const directPayload = parseLifecycleFacadeCommandResult(directResult);
  if (directResult.isError) {
    return refusedCommandResult(mapTaskFacadeRefusalCode(directPayload), {
      direct_tool: toolName,
      direct_result: directPayload,
      direct_result_ref: directPayload?.output_ref ?? null,
    });
  }
  return {
    status: 'success',
    schema: resultSchema,
    command_schema: command.command_schema,
    direct_tool: toolName,
    payload_ref: payloadRef,
    direct_result_ref: directPayload?.output_ref ?? null,
    direct_result: directPayload,
  };
}

async function admitTaskTestReplayCommand(command) {
  const commandTargetRoot = stringField(command, 'target_site_root');
  if (!commandTargetRoot) {
    return refusedCommandResult('target_locus_mismatch', {
      status: 'target_locus_mismatch',
      message: 'task_lifecycle_replay_test_evidence command requires target_site_root',
    });
  }
  if (resolve(commandTargetRoot).toLowerCase() !== resolve(siteRoot).toLowerCase()) {
    return refusedCommandResult('target_locus_mismatch', {
      status: 'target_locus_mismatch',
      target_site_root: commandTargetRoot,
      server_site_root: siteRoot,
      message: 'test replay command target_site_root does not match the task lifecycle MCP site root',
    });
  }

  const expected = asRecord(command.expected_consequence);
  const expectedKind = stringField(expected, 'kind');
  if (expectedKind && expectedKind !== 'task_lifecycle_test_replay') {
    return refusedCommandResult('expected_consequence_mismatch', {
      status: 'expected_consequence_mismatch',
      expected_kind: expectedKind,
      required_kinds: ['task_lifecycle_test_replay'],
    });
  }

  let payload;
  try {
    payload = normalizeTestReplayPayload(readCommandPayloadArgs(command));
  } catch (error) {
    return refusedCommandResult('test_replay_payload_invalid', {
      status: 'test_replay_payload_invalid',
      message: error instanceof Error ? error.message : String(error),
    });
  }
  const domainArgs = asRecord(command.domain_args);
  const agentId = stringField(domainArgs, 'agent_id');
  if (!agentId) return refusedCommandResult('agent_id_required', { status: 'agent_id_required' });
  enforceSessionIdentity(agentId);
  const taskNumber = numberField(domainArgs, 'task_number');
  const evidenceRef = stringField(domainArgs, 'evidence_ref');
  if (!taskNumber && !evidenceRef) {
    return refusedCommandResult('task_number_or_evidence_ref_required', { status: 'task_number_or_evidence_ref_required' });
  }
  const lifecycle = taskNumber ? store.getLifecycleByNumber(taskNumber) : null;
  if (taskNumber && !lifecycle) {
    return refusedCommandResult('task_not_found', { status: 'task_not_found', task_number: taskNumber });
  }
  const expectedTaskNumber = numberField(expected, 'task_number');
  if (expectedTaskNumber && taskNumber && expectedTaskNumber !== taskNumber) {
    return refusedCommandResult('expected_consequence_mismatch', {
      status: 'expected_consequence_mismatch',
      field: 'task_number',
      expected: expectedTaskNumber,
      actual: taskNumber,
    });
  }
  const expectedAgentId = stringField(expected, 'agent_id');
  if (expectedAgentId && expectedAgentId !== agentId) {
    return refusedCommandResult('expected_consequence_mismatch', {
      status: 'expected_consequence_mismatch',
      field: 'agent_id',
      expected: expectedAgentId,
      actual: agentId,
    });
  }

  const targets = testReplayTargets(payload);
  const timeoutSeconds = payload.timeout_seconds ?? 120;
  const results = [];
  for (const target of targets) {
    results.push(await testMcpTool(siteRoot, 'tools/mcp-servers/test/test-mcp-server.mjs', 'run_test', target, { timeoutSeconds }));
  }
  const failed = results.filter((result) => result.status !== 'passed');
  const replayResult = {
    status: failed.length === 0 ? 'success' : 'failed',
    schema: 'narada.command.task.test_replay.result.v1',
    command_schema: command.command_schema,
    payload_ref: firstCommandPayloadRef(command),
    command: {
      command_schema: command.command_schema,
      target_locus: command.target_locus ?? null,
      target_site_root: command.target_site_root ?? null,
      domain_args: {
        agent_id: agentId,
        task_number: taskNumber ?? null,
        evidence_ref: evidenceRef ?? null,
      },
      expected_consequence: command.expected_consequence ?? null,
    },
    task_number: taskNumber ?? null,
    evidence_ref: evidenceRef ?? null,
    agent_id: agentId,
    replay_target: {
      selector: payload.selector ?? null,
      test_id: payload.test_id ?? null,
      path: payload.path ?? null,
      timeout_seconds: timeoutSeconds,
    },
    total: results.length,
    passed: results.length - failed.length,
    failed: failed.length,
    results,
  };
  if (taskNumber) {
    const artifactId = randomUUID();
    store.upsertObservationArtifact({
      artifact_id: artifactId,
      artifact_type: 'test_replay_result',
      source_operator: agentId,
      task_id: lifecycle.task_id,
      task_number: taskNumber,
      agent_id: agentId,
      artifact_uri: `task://${taskNumber}/test-replay/${artifactId}`,
      digest: artifactId.slice(0, 16),
      admitted_view_json: JSON.stringify(replayResult),
      created_at: new Date().toISOString(),
    });
    replayResult.artifact_id = artifactId;
  }
  return replayResult;
}

function normalizeReplayAuthorityBasis(value) {
  const record = asRecord(value);
  const kind = stringField(record, 'kind');
  const summary = stringField(record, 'summary');
  if (!kind && !summary) return null;
  const allowed = new Set(['operator_direct_instruction', 'directed_obligation', 'task_owner_handoff']);
  if (!allowed.has(kind) || !summary) throw new Error('authority_basis_invalid_for_test_replay');
  return { kind, summary };
}

function normalizeTestReplayPayload(value) {
  const input = asRecord(value);
  const forbidden = ['command', 'args', 'cwd', 'working_directory', 'network', 'shell', 'script', 'destructive'];
  const presentForbidden = forbidden.filter((field) => Object.prototype.hasOwnProperty.call(input, field));
  if (presentForbidden.length > 0) throw new Error(`test_replay_payload_forbidden_fields: ${presentForbidden.join(',')}`);
  const selector = stringField(input, 'selector');
  const testId = stringField(input, 'test_id');
  const path = stringField(input, 'path');
  const selected = [selector, testId, path].filter(Boolean);
  if (selected.length === 0) throw new Error('test_replay_requires_selector_test_id_or_path');
  if (selected.length > 1) throw new Error('test_replay_accepts_one_of_selector_test_id_or_path');
  const timeoutSeconds = Math.min(300, Math.max(1, numberField(input, 'timeout_seconds') ?? 120));
  return {
    ...(selector ? { selector } : {}),
    ...(testId ? { test_id: testId } : {}),
    ...(path ? { path } : {}),
    timeout_seconds: timeoutSeconds,
  };
}

function testReplayTargets(payload) {
  if (payload.selector) return testTargetsForSelector(payload.selector);
  if (payload.test_id) return [{ test_id: payload.test_id }];
  if (payload.path) return [{ path: payload.path }];
  throw new Error('test_replay_requires_selector_test_id_or_path');
}

function firstCommandPayloadRef(command) {
  const refs = Array.isArray(command.payload_refs) ? command.payload_refs : [];
  const first = refs[0];
  if (typeof first === 'string') return first;
  return isPlainObject(first) ? stringField(first, 'ref') ?? null : null;
}

function readCommandPayloadArgs(command) {
  const merged = {};
  for (const entry of Array.isArray(command.payload_refs) ? command.payload_refs : []) {
    const ref = typeof entry === 'string'
      ? entry.trim()
      : (isPlainObject(entry) ? stringField(entry, 'ref') : null);
    if (!ref) continue;
    const shown = payloadShow({ siteRoot, args: { ref } });
    if (shown.payload && typeof shown.payload === 'object' && !Array.isArray(shown.payload)) {
      Object.assign(merged, shown.payload);
    }
  }
  return merged;
}

async function callLifecycleFacadeForCommand(toolName, args, dispatchContext = {}) {
  const previousToolName = activeOutputToolName;
  activeOutputToolName = toolName;
  try {
    return await dispatchTool(toolName, args, dispatchContext);
  } finally {
    activeOutputToolName = previousToolName;
  }
}

function parseLifecycleFacadeCommandResult(toolResult) {
  const text = toolResult?.content?.[0]?.text;
  if (typeof text !== 'string') return {};
  try {
    const parsed = JSON.parse(text);
    if (typeof parsed?.output_ref === 'string') {
      const shown = outputShow({ siteRoot, args: { ref: parsed.output_ref, output_limit: 1_000_000 } });
      if (typeof shown.output_text === 'string') {
        try {
          return { ...JSON.parse(shown.output_text), output_ref: parsed.output_ref };
        } catch {
          return { ...parsed, output_text: shown.output_text };
        }
      }
      if (shown.full_output && typeof shown.full_output === 'object') {
        return { ...shown.full_output, output_ref: parsed.output_ref };
      }
    }
    return parsed;
  } catch {
    return { raw_text: text };
  }
}

function mapTaskFacadeRefusalCode(result) {
  const status = stringField(result, 'status');
  const error = stringField(result, 'error');
  const reasonCode = stringField(result, 'reason_code');
  if (error === 'identity_mismatch_blocked') return 'identity_mismatch';
  if (error === 'recovery_truthfulness_guard_failed' || error === 'recovery_truthfulness_guard_required') return 'recovery_truthfulness_required';
  if (error === 'follow_up_ledger_required') return 'follow_up_ledger_required';
  if (error === 'changed_files_conflicts_with_no_files_changed') return 'changed_file_evidence_invalid';
  if (error === 'self_certification_guard_failed') return 'self_certification_required';
  if (error === 'single_operator_review_blocked') return 'single_operator_review_blocked';
  if (status === 'blocked') return reasonCode ?? error ?? 'task_lifecycle_gate_blocked';
  if (status === 'error') return error ?? 'task_lifecycle_error';
  return reasonCode ?? status ?? error ?? 'task_lifecycle_refused';
}

function refusedCommandResult(reasonCode, result) {
  return {
    status: 'refused',
    reason_code: reasonCode,
    durable_state_changed: false,
    result,
  };
}

function withTaskClaimFacadeCompatibility(result, args) {
  return {
    ...result,
    command_admission_compatibility: {
      schema: 'narada.task.lifecycle.facade_command_compatibility.v0',
      facade_tool: 'task_lifecycle_claim',
      equivalent_command_schema: 'narada.command.task.claim.v1',
      command_ref: null,
      result_ref: null,
      command_ref_fabricated: false,
      result_ref_fabricated: false,
      null_ref_reason: 'direct_facade_call_did_not_create_or_submit_command_packet',
      command_ref_available_via: ['mcp_command_create', 'mcp_command_submit'],
      equivalent_domain_args: {
        task_number: numberField(args, 'task_number'),
        agent_id: stringField(args, 'agent_id'),
      },
    },
  };
}

function mapClaimRefusalCode(result) {
  const status = stringField(result, 'status');
  if (status === 'role_mismatch') return 'role_not_eligible';
  if (status === 'preferred_agent_mismatch_requires_authority') return 'preferred_agent_authority_required';
  if (status === 'already_claimed') return 'already_claimed_by_other_agent';
  if (status === 'closure_authority_blocks_claim') return 'closure_authority_blocks_claim';
  if (status === 'blocked') return stringField(result, 'reason_code') ?? stringField(result, 'reason') ?? 'evidence_gate_refusal';
  return status || 'task_claim_refused';
}

async function claimTaskLifecycleWithGuards(args) {
  const taskNumber = numberField(args, 'task_number');
  const agentId = stringField(args, 'agent_id');
  if (!taskNumber) throw new Error('task_number_required');
  if (!agentId) throw new Error('agent_id_required');
  enforceSessionIdentity(agentId);
  const identityWarning = verifySessionIdentity(agentId);
  const lifecycle = store.getLifecycleByNumber(taskNumber);
  if (!lifecycle) throw new Error(`task_not_found: ${taskNumber}`);
  const executionWindowGate = evaluateExecutionWindowMutationGate({ store, lifecycle, args, mutation: 'claim' });
  if (executionWindowGate.status === 'blocked') return { result: executionWindowGate, isError: true };

  const eligibility = checkTaskRoleEligibilityLocal({ store, siteRoot, taskId: lifecycle.task_id, taskNumber, agentId });
  if (!eligibility.eligible) {
    return {
      result: {
        status: 'role_mismatch',
        task_number: taskNumber,
        target_role: eligibility.targetRole,
        agent_role: eligibility.agentRole,
        role_resolution: eligibility.roleResolution,
        role_policy: eligibility.rolePolicy,
        role_mismatch_warning: eligibility.roleMismatchWarning,
        message: eligibility.warning,
      },
      isError: true,
    };
  }
  const mismatchAuthority = validatePreferredAgentMismatchAuthority({ args, eligibility, lifecycle, taskNumber, agentId });
  if (mismatchAuthority.status === 'blocked') {
    recordClaimIntent({
      store,
      lifecycle,
      taskNumber,
      agentId,
      status: 'rejected',
      rejectionReason: 'preferred_agent_mismatch_requires_authority',
      authorityBasis: mismatchAuthority.authority_basis,
      preferredAgentWarning: mismatchAuthority.preferred_agent_warning,
    });
    return {
      result: {
        status: 'preferred_agent_mismatch_requires_authority',
        task_number: taskNumber,
        preferred_agent_id: eligibility.preferredAgentId,
        claiming_agent: agentId,
        pre_claim_warnings: [mismatchAuthority.preferred_agent_warning],
        remediation: 'Retry the claim with authority_basis: { kind: "operator_direct_instruction" | "directed_obligation" | "task_owner_handoff", summary: "..." }.',
        preferred_agent_warning: mismatchAuthority.preferred_agent_warning,
        schema: 'narada.task.claim.preferred_agent_authority.v0',
      },
      isError: true,
    };
  }

  const serviceResult = await claimLifecycleTask({ siteRoot, store, taskNumber, agentId });
  if (serviceResult.status === 'closure_authority_blocks_claim') return { result: serviceResult, isError: true };
  if (serviceResult.status === 'already_claimed') {
    return {
      result: {
        status: 'already_claimed',
        assignment: serviceResult.assignment,
        pre_claim_warnings: [{
          kind: 'active_assignment',
          severity: 'blocker',
          assigned_agent: serviceResult.assignment?.agent_id ?? null,
          claimed_at: serviceResult.assignment?.claimed_at ?? null,
          message: `Task already has an active assignment by ${serviceResult.assignment?.agent_id ?? 'unknown'}.`,
        }],
      },
      isError: true,
    };
  }
  const result = { status: 'claimed', assignment_id: serviceResult.assignment_id, task_number: taskNumber };
  const preClaimWarnings = [eligibility.roleMismatchWarning, eligibility.preferredAgentWarning].filter(Boolean);
  if (eligibility.preferredAgentWarning) {
    result.preferred_agent_warning = eligibility.preferredAgentWarning;
    result.preferred_agent_mismatch_authority = mismatchAuthority.authority_basis;
  }
  if (eligibility.roleMismatchWarning) result.role_mismatch_warning = eligibility.roleMismatchWarning;
  if (preClaimWarnings.length) result.pre_claim_warnings = preClaimWarnings;
  result.role_policy = eligibility.rolePolicy;
  recordClaimIntent({
    store,
    lifecycle,
    taskNumber,
    agentId,
    status: 'claimed',
    assignmentId: serviceResult.assignment_id,
    authorityBasis: mismatchAuthority.authority_basis,
    preferredAgentWarning: result.preferred_agent_warning ?? null,
    preClaimWarnings,
  });
  if (identityWarning) result.identity_warning = identityWarning;
  return { result, isError: false };
}

function validatePreferredAgentMismatchAuthority({ args, eligibility, lifecycle, taskNumber, agentId }) {
  if (!eligibility.preferredAgentWarning || !eligibility.preferredAgentId || eligibility.preferredAgentId === agentId) {
    return { status: 'not_required', authority_basis: null, preferred_agent_warning: null };
  }
  const preferredAgentWarning = eligibility.preferredAgentWarning;
  const authorityBasis = normalizeClaimAuthorityBasis(args.authority_basis);
  if (!authorityBasis) {
    return {
      status: 'blocked',
      authority_basis: null,
      preferred_agent_warning: preferredAgentWarning,
    };
  }
  return {
    status: 'ok',
    authority_basis: {
      ...authorityBasis,
      task_id: lifecycle.task_id,
      task_number: taskNumber,
      preferred_agent_id: eligibility.preferredAgentId,
      claiming_agent: agentId,
    },
    preferred_agent_warning: preferredAgentWarning,
  };
}

function normalizeClaimAuthorityBasis(value) {
  const record = asRecord(value);
  const kind = stringField(record, 'kind');
  const summary = stringField(record, 'summary');
  const allowedKinds = new Set(['operator_direct_instruction', 'directed_obligation', 'task_owner_handoff']);
  if (!kind || !allowedKinds.has(kind) || !summary) return null;
  return { kind, summary };
}

function recordClaimIntent({ store, lifecycle, taskNumber, agentId, status, assignmentId = null, rejectionReason = null, authorityBasis = null, preferredAgentWarning = null, preClaimWarnings = null }) {
  if (!store.upsertAssignmentIntent) return;
  const now = new Date().toISOString();
  store.upsertAssignmentIntent({
    request_id: `claim-${randomUUID()}`,
    kind: 'claim',
    task_id: lifecycle.task_id,
    task_number: taskNumber,
    agent_id: agentId,
    requested_by: agentId,
    requested_at: now,
    reason: authorityBasis?.summary ?? preferredAgentWarning?.message ?? null,
    no_claim: status === 'claimed' ? 0 : 1,
    status,
    rejection_reason: rejectionReason,
    assignment_id: assignmentId,
    previous_agent_id: null,
    lifecycle_status_before: lifecycle.status,
    lifecycle_status_after: status === 'claimed' ? 'claimed' : lifecycle.status,
    roster_status_after: status === 'claimed' ? 'busy' : null,
    confirmation_json: JSON.stringify({
      authority_basis: authorityBasis,
      preferred_agent_mismatch_acknowledged: Boolean(authorityBasis && preferredAgentWarning),
    }),
    warnings_json: JSON.stringify(preClaimWarnings ?? (preferredAgentWarning ? [preferredAgentWarning] : [])),
    updated_at: now,
  });
}

function buildTerminalBlockedFinishBlock({ taskNumber, agentId, source }) {
  return {
    status: 'blocked',
    error: 'terminal_blocked_requires_lifecycle_transition',
    schema: 'narada.task.mcp.finish.terminal_blocked_transition_gate.v0',
    close_blocked: true,
    close_action: 'blocked',
    task_number: taskNumber,
    repair_state: 'claimed_terminal_blocked_inconsistent',
    blocker_state: 'blocked_external_authority',
    evidence_source: source,
    close_blockers: ['terminal_blocked finish/report evidence cannot leave a claimed task on the normal continue path. Defer/unclaim the task, record an explicit external-authority blocked state, or use an authorized override surface.'],
    next_action: 'task_lifecycle_defer',
    next_command: `task_lifecycle_defer({ task_number: ${taskNumber}, agent_id: '${agentId}', reason: 'terminal_blocked: external authority or locus blocker prevents local completion' })`,
    remediation: 'Use a lifecycle transition for terminal_blocked/deferred-to-other-locus evidence instead of submitting it as an ordinary finish closeout.',
  };
}

function validateTaskFinishRecoveryTruthfulness({ taskNumber, summary, changedFiles, noFilesChanged, recoveryTruthfulness }) {
  const packet = {
    ...(recoveryTruthfulness ?? {}),
    task_number: taskNumber,
    surface: 'task_lifecycle_finish',
  };
  if (!packet.summary && summary) packet.summary = summary;
  if (!packet.closeout_text && summary) packet.closeout_text = summary;
  if (!packet.changed && changedFiles) packet.changed = changedFiles;
  if (!packet.not_changed && noFilesChanged) packet.not_changed = ['No files changed in this finish/report.'];
  return validateRecoveryTruthfulnessPacket(packet);
}

function asRecord(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function isPlainObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}

function booleanField(record, key) {
  const value = record[key];
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const lower = value.toLowerCase();
    if (lower === 'true') return true;
    if (lower === 'false') return false;
  }
  return undefined;
}

function nullableStringField(record, key) {
  if (!(key in record)) return undefined;
  if (record[key] === null) return null;
  return stringField(record, key) ?? null;
}

function stringField(record, key) {
  const value = record[key];
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function objectField(record, key) {
  const value = record?.[key];
  if (value && typeof value === 'object' && !Array.isArray(value)) return value;
  return undefined;
}

function rawArrayField(record, key) {
  const value = record?.[key];
  return Array.isArray(value) ? value : [];
}

function stringArrayField(record, key) {
  const value = record?.[key];
  if (!Array.isArray(value)) return undefined;
  const strings = value.map((entry) => typeof entry === 'string' ? entry.trim() : '').filter((entry) => entry.length > 0);
  return strings.length > 0 && strings.length === value.length ? strings : undefined;
}

function detectGitChangedFiles(cwd) {
  const result = runGovernedCommandSync('git', ['diff', '--name-only', 'HEAD'], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  if (result.status !== 0 || !result.stdout) return [];
  return result.stdout.split(/\r?\n/).map((line) => line.trim()).filter((line) => line.length > 0);
}

function numberField(record, key) {
  const value = record[key];
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (!Number.isNaN(parsed)) return parsed;
  }
  return undefined;
}

function slugify(title) {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);
}

function todayYmd() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}${m}${day}`;
}

function ensureTaskExecutionWindowTables(taskStore) {
  taskStore.db.exec(`
    CREATE TABLE IF NOT EXISTS task_execution_windows (
      task_id TEXT PRIMARY KEY,
      not_before TEXT,
      not_after TEXT,
      timezone TEXT,
      basis TEXT,
      expired_disposition TEXT,
      source_kind TEXT,
      source_ref TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);
}

function normalizeExecutionWindow(args) {
  const source = asRecord(args.execution_window);
  const notBefore = stringField(source, 'not_before') || stringField(args, 'execution_not_before') || null;
  const notAfter = stringField(source, 'not_after') || stringField(args, 'execution_not_after') || null;
  const timezone = stringField(source, 'timezone') || 'UTC';
  const basis = stringField(source, 'basis') || null;
  const expiredDisposition = stringField(source, 'expired_disposition') || 'requires_reassessment';
  const errors = [];
  if (!notBefore && !notAfter) return { window: null, errors };
  for (const [field, value] of [['not_before', notBefore], ['not_after', notAfter]]) {
    if (value && Number.isNaN(Date.parse(value))) errors.push({ field, message: 'invalid_iso_timestamp' });
  }
  if (notBefore && notAfter && Date.parse(notBefore) > Date.parse(notAfter)) {
    errors.push({ field: 'execution_window', message: 'not_before_after_not_after' });
  }
  return {
    window: errors.length ? null : { not_before: notBefore, not_after: notAfter, timezone, basis, expired_disposition: expiredDisposition },
    errors,
  };
}

function writeTaskExecutionWindow(taskStore, taskId, window, { source_kind, source_ref } = {}) {
  ensureTaskExecutionWindowTables(taskStore);
  if (!window) return;
  const now = new Date().toISOString();
  taskStore.db.prepare(`
    INSERT INTO task_execution_windows (task_id, not_before, not_after, timezone, basis, expired_disposition, source_kind, source_ref, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(task_id) DO UPDATE SET
      not_before = excluded.not_before,
      not_after = excluded.not_after,
      timezone = excluded.timezone,
      basis = excluded.basis,
      expired_disposition = excluded.expired_disposition,
      source_kind = excluded.source_kind,
      source_ref = excluded.source_ref,
      updated_at = excluded.updated_at
  `).run(taskId, window.not_before, window.not_after, window.timezone, window.basis, window.expired_disposition, source_kind ?? null, source_ref ?? null, now, now);
}

function readTaskExecutionWindow(taskStore, taskId) {
  ensureTaskExecutionWindowTables(taskStore);
  const row = taskStore.db.prepare('SELECT * FROM task_execution_windows WHERE task_id = ?').get(taskId);
  if (!row) return null;
  return {
    schema: 'narada.task.execution_window.v0',
    not_before: row.not_before,
    not_after: row.not_after,
    timezone: row.timezone || 'UTC',
    basis: row.basis,
    expired_disposition: row.expired_disposition || 'requires_reassessment',
    source_kind: row.source_kind,
    source_ref: row.source_ref,
    updated_at: row.updated_at,
  };
}

function classifyExecutionWindow(window, now = new Date()) {
  if (!window) return { status: 'none', actionable: true };
  const nowMs = now.getTime();
  const notBeforeMs = window.not_before ? Date.parse(window.not_before) : null;
  const notAfterMs = window.not_after ? Date.parse(window.not_after) : null;
  if (Number.isFinite(notBeforeMs) && nowMs < notBeforeMs) {
    return { status: 'not_before_pending', actionable: false, gated_until: window.not_before };
  }
  if (Number.isFinite(notAfterMs) && nowMs > notAfterMs) {
    return { status: 'expired', actionable: false, expired_at: window.not_after, expired_disposition: window.expired_disposition };
  }
  return { status: 'open', actionable: true };
}

function evaluateExecutionWindowMutationGate({ store: taskStore, lifecycle, args, mutation }) {
  const executionWindow = readTaskExecutionWindow(taskStore, lifecycle.task_id);
  const state = classifyExecutionWindow(executionWindow);
  if (state.actionable) return { status: 'clear' };
  const authority = asRecord(args.authority_basis);
  const authorityKind = stringField(authority, 'kind');
  const authoritySummary = stringField(authority, 'summary');
  if (authorityKind === 'operator_direct_instruction' && authoritySummary) {
    return { status: 'override_recorded', execution_window: executionWindow, execution_window_state: state, authority_basis: { kind: authorityKind, summary: authoritySummary } };
  }
  return {
    status: 'blocked',
    schema: 'narada.task.execution_window.mutation_gate.v0',
    mutation,
    task_number: lifecycle.task_number,
    task_id: lifecycle.task_id,
    execution_window: executionWindow,
    execution_window_state: state,
    remediation: 'Retry with authority_basis { kind: "operator_direct_instruction", summary: "..." } only if the operator explicitly overrides the execution window.',
  };
}

function summarizeExecutionWindowGates(taskStore, tasks) {
  const hidden = [];
  for (const task of tasks) {
    const executionWindow = readTaskExecutionWindow(taskStore, task.task_id);
    const state = classifyExecutionWindow(executionWindow);
    if (!state.actionable && ['opened', 'claimed', 'needs_continuation'].includes(task.status)) {
      hidden.push({ task_number: task.task_number, task_id: task.task_id, status: state.status, execution_window: executionWindow, execution_window_state: state });
    }
  }
  return {
    hidden_task_ids: new Set(hidden.map((task) => task.task_id)),
    public: {
      schema: 'narada.task.execution_window.workboard_filter.v0',
      hidden_count: hidden.length,
      hidden_tasks: hidden,
      rule: 'Future-gated and expired ordinary tasks are withheld from normal next-work recommendations until their window opens or operator override/reassessment occurs.',
    },
  };
}

async function createTaskBatch(args, { payloadSource }) {
  const dryRun = booleanField(args, 'dry_run') ?? false;
  const actor = stringField(args, 'actor_agent_id') || SESSION_IDENTITY || 'unknown';
  if (SESSION_IDENTITY && actor !== SESSION_IDENTITY) enforceSessionIdentity(actor);
  const chapter = asRecord(args.chapter);
  const shared = asRecord(args.shared);
  const tasks = rawArrayField(args, 'tasks').map((task) => asRecord(task));
  const duplicateWarnings = findLikelyBatchDuplicates(tasks);
  const now = new Date().toISOString();
  const chapterTitle = stringField(chapter, 'title') || stringField(shared, 'chapter_title') || null;
  const chapterId = stringField(chapter, 'chapter_id') || (chapterTitle ? `chapter-${slugify(chapterTitle)}` : null);
  const chapterIndexPath = chapterId ? join(siteRoot, '.ai', 'do-not-open', 'chapters', `${chapterId}.md`) : null;
  const chapterIndexRelativePath = chapterIndexPath ? relativeSitePath(siteRoot, chapterIndexPath) : null;
  const planned = tasks.map((task, index) => buildBatchTaskPlan({ task, shared, index, taskNumber: null, payloadSource }));
  const validation = validateBatchTaskPlans(planned);
  if (validation.length > 0 || duplicateWarnings.length > 0) {
    return {
      schema: 'narada.task.create_batch.v0',
      status: validation.length > 0 ? 'blocked' : (dryRun ? 'dry_run' : 'blocked_likely_duplicates'),
      dry_run: dryRun,
      chapter_id: chapterId,
      chapter_index_path: chapterIndexRelativePath,
      validation_errors: validation,
      duplicate_warnings: duplicateWarnings,
      planned_tasks: planned,
      commit_ready: buildBatchCommitReady([], chapterIndexRelativePath),
      payload_ref: payloadSource?.ref ?? null,
      payload_sha256: payloadSource?.sha256 ?? null,
    };
  }
  if (dryRun) {
    return {
      schema: 'narada.task.create_batch.v0',
      status: 'dry_run',
      dry_run: true,
      chapter_id: chapterId,
      chapter_index_path: chapterIndexRelativePath,
      validation_errors: [],
      duplicate_warnings: [],
      planned_tasks: planned,
      commit_ready: buildBatchCommitReady([], chapterIndexRelativePath),
      payload_ref: payloadSource?.ref ?? null,
      payload_sha256: payloadSource?.sha256 ?? null,
    };
  }

  const taskNumbers = await allocateTaskNumbers(siteRoot, tasks.length);
  const tasksDir = join(siteRoot, '.ai', 'do-not-open', 'tasks');
  mkdirSync(tasksDir, { recursive: true });
  const created = [];
  ensureTaskRoutingTables(store);
  if (chapterId) {
    upsertChapterDefinition(store, {
      chapter_id: chapterId,
      title: chapterTitle,
      owner_agent_id: stringField(chapter, 'owner_agent_id') || null,
      summary_markdown: stringField(chapter, 'summary') || stringField(shared, 'context') || null,
      source_kind: 'task_batch_create',
      source_ref: payloadSource?.ref ?? null,
      actor_agent_id: actor,
    });
  }
  for (const [index, task] of tasks.entries()) {
    const taskNumber = taskNumbers[index];
    const plan = buildBatchTaskPlan({ task, shared, index, taskNumber, payloadSource });
    const taskId = `${todayYmd()}-${taskNumber}-${slugify(plan.title)}`;
    const filePath = join(tasksDir, `${taskId}.md`);
    const body = renderTaskBodyFromSpec({ spec: plan.spec, executionNotes: null, verification: null });
    const frontMatterLines = [
      '---',
      `number: ${taskNumber}`,
      `governed_by: ${plan.preferred_role || 'unknown'}`,
      'status: opened',
    ];
    if (plan.preferred_role) frontMatterLines.push(`preferred_role: ${plan.preferred_role}`);
    if (plan.target_role) frontMatterLines.push(`target_role: ${plan.target_role}`);
    if (chapterId) frontMatterLines.push(`chapter_id: ${chapterId}`);
    if (payloadSource?.ref) frontMatterLines.push(`creation_payload_ref: ${payloadSource.ref}`);
    if (payloadSource?.sha256) frontMatterLines.push(`creation_payload_sha256: ${payloadSource.sha256}`);
    frontMatterLines.push('---');
    writeFileSync(filePath, `${frontMatterLines.join('\n')}\n${body}`, 'utf8');
    const dependencies = resolveBatchDependencies(plan.dependencies, created);
    store.upsertLifecycle({
      task_id: taskId,
      task_number: taskNumber,
      status: 'opened',
      governed_by: plan.preferred_role || null,
      closed_at: null,
      closed_by: null,
      reopened_at: null,
      reopened_by: null,
      continuation_packet_json: null,
      updated_at: now,
    });
    store.upsertTaskSpec({
      task_id: taskId,
      task_number: taskNumber,
      title: plan.title,
      chapter_markdown: chapterTitle,
      goal_markdown: plan.spec.goal,
      context_markdown: plan.spec.context,
      required_work_markdown: plan.spec.required_work,
      non_goals_markdown: plan.spec.non_goals,
      acceptance_criteria_json: JSON.stringify(plan.spec.acceptance_criteria),
      dependencies_json: JSON.stringify(dependencies),
      updated_at: now,
    });
    if (plan.preferred_role || plan.target_role) {
      store.db.prepare(`
        INSERT INTO narada_andrey_task_role_preferences (task_id, preferred_role, target_role, preferred_agent_id, updated_at)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(task_id) DO UPDATE SET
          preferred_role = excluded.preferred_role,
          target_role = excluded.target_role,
          preferred_agent_id = excluded.preferred_agent_id,
          updated_at = excluded.updated_at
      `).run(taskId, plan.preferred_role, plan.target_role || plan.preferred_role, null, now);
    }
    if (chapterId) {
      addChapterTask(store, {
        chapter_id: chapterId,
        task_number: taskNumber,
        order_index: index + 1,
        membership_kind: 'batch_created',
        source_kind: 'task_batch_create',
        source_ref: payloadSource?.ref ?? null,
        actor_agent_id: actor,
      });
    }
    created.push({
      task_number: taskNumber,
      task_id: taskId,
      title: plan.title,
      path: relativeSitePath(siteRoot, filePath),
      target_role: plan.target_role || plan.preferred_role,
      preferred_role: plan.preferred_role,
      dependencies,
      order_index: index + 1,
    });
  }
  if (chapterIndexPath) writeBatchChapterIndex({ path: chapterIndexPath, chapterTitle, chapterId, created, summary: stringField(chapter, 'summary') || null });
  return {
    schema: 'narada.task.create_batch.v0',
    status: 'created',
    dry_run: false,
    chapter_id: chapterId,
    chapter_index_path: chapterIndexRelativePath,
    task_count: created.length,
    tasks: created,
    created_task_numbers: created.map((task) => task.task_number),
    created_paths: created.map((task) => task.path),
    commit_ready: buildBatchCommitReady(created.map((task) => task.path), chapterIndexRelativePath),
    payload_ref: payloadSource?.ref ?? null,
    payload_sha256: payloadSource?.sha256 ?? null,
  };
}

function buildBatchTaskPlan({ task, shared, index, taskNumber, payloadSource }) {
  const title = stringField(task, 'title') || '';
  const sharedContext = stringField(shared, 'context');
  const taskContext = stringField(task, 'context');
  const context = [sharedContext, taskContext].filter(Boolean).join('\n\n') || null;
  return {
    index,
    task_number: taskNumber,
    title,
    preferred_role: stringField(task, 'preferred_role') || stringField(shared, 'preferred_role') || null,
    target_role: stringField(task, 'target_role') || stringField(shared, 'target_role') || null,
    dependencies: rawArrayField(task, 'dependencies'),
    payload_ref: payloadSource?.ref ?? null,
    spec: {
      title,
      goal: stringField(task, 'goal') || title,
      context,
      required_work: stringField(task, 'required_work') || stringField(shared, 'required_work') || '1. TBD',
      non_goals: stringField(task, 'non_goals') || stringField(shared, 'non_goals') || null,
      acceptance_criteria: rawArrayField(task, 'acceptance_criteria').length > 0
        ? rawArrayField(task, 'acceptance_criteria')
        : rawArrayField(shared, 'acceptance_criteria').length > 0
          ? rawArrayField(shared, 'acceptance_criteria')
          : ['TBD'],
    },
  };
}

function validateBatchTaskPlans(plans) {
  const errors = [];
  for (const plan of plans) {
    if (!plan.title) errors.push({ index: plan.index, field: 'title', message: 'title_required' });
    if (!Array.isArray(plan.spec.acceptance_criteria) || plan.spec.acceptance_criteria.length === 0 || plan.spec.acceptance_criteria.some((item) => typeof item !== 'string' || !item.trim())) {
      errors.push({ index: plan.index, field: 'acceptance_criteria', message: 'non_empty_string_array_required' });
    }
  }
  return errors;
}

function findLikelyBatchDuplicates(tasks) {
  const seen = new Map();
  const duplicates = [];
  for (const [index, task] of tasks.entries()) {
    const title = stringField(asRecord(task), 'title');
    if (!title) continue;
    const key = slugify(title);
    if (seen.has(key)) duplicates.push({ index, duplicates_index: seen.get(key), title, reason: 'same_batch_title_slug' });
    else seen.set(key, index);
  }
  return duplicates;
}

function resolveBatchDependencies(dependencies, created) {
  return dependencies.map((dependency) => {
    if (typeof dependency === 'number') return created[dependency]?.task_number ?? dependency;
    const key = slugify(String(dependency));
    return created.find((task) => slugify(task.title) === key)?.task_number ?? dependency;
  });
}

function writeBatchChapterIndex({ path, chapterTitle, chapterId, created, summary }) {
  mkdirSync(resolve(path, '..'), { recursive: true });
  const lines = [`# ${chapterTitle}`, '', summary || `Chapter index for ${chapterId}.`, '', '## Tasks'];
  for (const task of created) lines.push(`- #${task.task_number} ${task.title}`);
  lines.push('');
  writeFileSync(path, `${lines.join('\n')}\n`, 'utf8');
}

function buildBatchCommitReady(taskPaths, chapterIndexPath) {
  const stagePaths = [...taskPaths];
  if (chapterIndexPath) stagePaths.push(chapterIndexPath);
  return {
    helper_tool: 'git_task_closeout_commit_and_push',
    stage_paths: stagePaths,
    paths: stagePaths,
    exclude_unrelated_dirty_files: true,
    authority_required: 'explicit task_closeout_policy or operator_direct_instruction for the batch creation projection commit',
  };
}

async function taskLifecycleDispositionCloseout({ siteRoot, store, taskNumber, agentId, envelopeId, disposition, summary, dryRun, proveCriteria, finish, changedFiles: finishChangedFiles, noFilesChanged }) {
  const lifecycle = store.getLifecycleByNumber(taskNumber);
  if (!lifecycle) throw new Error(`task_not_found: ${taskNumber}`);
  const taskFile = await findTaskFile(siteRoot, taskNumber);
  if (!taskFile) {
    throw new Error(`task_file_resolution_failed: task_number=${taskNumber} lifecycle_task_id=${lifecycle.task_id} expected_path=.ai/do-not-open/tasks/${lifecycle.task_id}.md`);
  }
  const original = readFileSync(taskFile.path, 'utf8');
  const resolvedEnvelopeId = envelopeId ?? extractEnvelopeId(original);
  const envelope = resolvedEnvelopeId ? readIndexedEnvelope(siteRoot, resolvedEnvelopeId) : null;
  const envelopeStatus = envelope?.status ?? null;
  const inferredDisposition = disposition ?? inferDisposition(envelopeStatus);
  const changedFiles = [relativeSitePath(siteRoot, taskFile.path)];
  const now = new Date().toISOString();
  const executionNotes = [
    `- Close-out workflow: \`task_lifecycle_disposition_closeout\` invoked by \`${agentId}\` at ${now}.`,
    resolvedEnvelopeId ? `- Envelope: \`${resolvedEnvelopeId}\` (${envelopeStatus ?? 'not_found'}).` : '- Envelope: none detected in task body.',
    envelope?.title ? `- Envelope title: ${envelope.title}` : null,
    `- Disposition: ${inferredDisposition}.`,
    summary ? `- Summary: ${summary}` : null,
  ].filter(Boolean).join('\n');
  const verificationNotes = [
    `- Inbox index refreshed through \`refreshInboxIndex\`; envelope status resolved as \`${envelopeStatus ?? 'not_found'}\`.`,
    '- Scoped changed-file list returned by the workflow for commit planning.',
    proveCriteria ? '- Acceptance criteria proof requested after note materialization.' : '- Acceptance criteria proof not requested by this invocation.',
    finish ? '- Finish requested after note materialization.' : '- Finish not requested by this invocation.',
  ].join('\n');
  const plannedContent = replaceTaskSection(replaceTaskSection(original, 'Execution Notes', executionNotes), 'Verification', verificationNotes);
  const capaCoverageValidation = validateCapaDispositionCorrectiveCoverage({ envelope, body: plannedContent, store });
  if (!capaCoverageValidation.ok) {
    return {
      status: dryRun ? 'dry_run_blocked' : 'blocked',
      error: 'capa_corrective_action_coverage_required',
      schema: 'narada.task.mcp.disposition_closeout.capa_corrective_coverage_gate.v0',
      task_number: taskNumber,
      task_id: lifecycle.task_id,
      envelope: resolvedEnvelopeId ? {
        envelope_id: resolvedEnvelopeId,
        status: envelopeStatus ?? 'not_found',
        title: envelope?.title ?? null,
        kind: envelope?.kind ?? null,
        received_at: envelope?.received_at ?? null,
      } : null,
      close_blocked: true,
      close_blockers: capaCoverageValidation.errors,
      capa_corrective_action_coverage: capaCoverageValidation,
      remediation: 'Add a top-level ## Follow-Up Ledger entry that links the CAPA corrective action to an active implementation task (`created #N` or `covered by #N`), records `deferred:` / blocker rationale, or records `no follow-up needed:` with admitted no-action rationale. Closed audit/disposition tasks alone do not count as corrective-action coverage.',
    };
  }
  let criteriaResult = null;
  let finishResult = null;
  if (!dryRun) {
    writeFileSync(taskFile.path, plannedContent, 'utf8');
    if (proveCriteria) {
      const afterNotes = readFileSync(taskFile.path, 'utf8');
      const proved = afterNotes.replace(/^(\s*)- \[ \](.*)$/gm, '$1- [x]$2');
      if (proved !== afterNotes) writeFileSync(taskFile.path, proved, 'utf8');
      const admission = await admitTaskEvidence({ cwd: siteRoot, taskNumber, admittedBy: agentId, methods: ['criteria_proof', 'disposition_closeout'] });
      criteriaResult = {
        status: admission.blockers.length === 0 ? 'proved' : 'proved_with_blockers',
        admission_id: admission.result.admission_id,
        blockers: admission.blockers,
        verdict: admission.result.verdict,
      };
    }
    if (finish) {
      if (finishChangedFiles && noFilesChanged) {
        throw new Error('changed_files_conflicts_with_no_files_changed');
      }
      const autoDetectedChangedFiles = !finishChangedFiles && !noFilesChanged ? detectGitChangedFiles(siteRoot) : [];
      const finishOptions = { cwd: siteRoot, taskNumber, agent: agentId, summary: summary ?? `Disposition close-out: ${inferredDisposition}`, close: true };
      if (finishChangedFiles) finishOptions.changedFiles = JSON.stringify(finishChangedFiles);
      if (!finishChangedFiles && autoDetectedChangedFiles.length > 0) finishOptions.changedFiles = JSON.stringify(autoDetectedChangedFiles);
      if (noFilesChanged) finishOptions.changedFiles = JSON.stringify([NO_FILES_CHANGED_MARKER]);
      const result = await withAuthoredRosterJsonPreserved(siteRoot, () => finishTaskService(finishOptions));
      finishResult = result.result || result;
      if (finishResult.close_action === 'blocked') {
        finishResult.evidence_preflight = await buildTaskEvidencePreflight({ siteRoot, store, taskNumber });
        finishResult.close_readiness = closeReadinessFromPreflight(finishResult.evidence_preflight);
        finishResult.close_ready = finishResult.close_readiness?.close_ready ?? false;
      }
      finishResult.follow_up_policy = evaluatePostTransitionFollowups({ 
        event: { transition_kind: finishResult.close_action ?? 'close', task_number: taskNumber, task_id: lifecycle.task_id, agent_id: agentId },
        source_task: { task_number: taskNumber, task_id: lifecycle.task_id },
        actor: { agent_id: agentId },
        result: finishResult,
        signals: { evidence_blocked: finishResult.close_action === 'blocked' },
      });
      if (finishResult.close_action !== 'blocked') {
        finishResult.post_closeout_continuation = buildPostCloseoutContinuation({ agentId, result: finishResult });
      }
    }
  }
  const dispositionEvidencePreflight = finishResult?.evidence_preflight ?? await buildTaskEvidencePreflight({ siteRoot, store, taskNumber });
  const dispositionCloseReadiness = closeReadinessFromPreflight(dispositionEvidencePreflight);
  return {
    status: dryRun ? 'dry_run' : 'prepared',
    schema: 'narada.task.mcp.disposition_closeout.v0',
    task_number: taskNumber,
    task_id: lifecycle.task_id,
    envelope: resolvedEnvelopeId ? {
      envelope_id: resolvedEnvelopeId,
      status: envelopeStatus ?? 'not_found',
      title: envelope?.title ?? null,
      kind: envelope?.kind ?? null,
      received_at: envelope?.received_at ?? null,
    } : null,
    disposition: inferredDisposition,
    capa_corrective_action_coverage: capaCoverageValidation,
    close_ready: dispositionCloseReadiness?.close_ready ?? false,
    close_readiness: dispositionCloseReadiness,
    evidence_preflight: dispositionEvidencePreflight,
    changed_files: changedFiles,
    committable_path_set: {
      schema: 'narada.task.disposition_closeout.committable_path_set.v0',
      task_owned_paths: changedFiles,
      ordinary_task_closeout_paths: changedFiles,
      ignored_envelope_projection_paths: [],
      envelope_handoff_tool: 'git_handoff_inbox_envelope_export',
      guidance: 'Stage ordinary_task_closeout_paths with git_task_closeout_commit_and_push. Ignored .ai/inbox-envelopes projections are not ordinary task-owned paths; use git_handoff_inbox_envelope_export for an exact admitted envelope JSON export when one must be committed.',
    },
    notes_written: !dryRun,
    criteria_result: criteriaResult,
    finish_result: finishResult,
    commit_ready: {
      stage_paths: changedFiles,
      ordinary_task_closeout_paths: changedFiles,
      ignored_envelope_projection_paths: [],
      envelope_handoff_tool: 'git_handoff_inbox_envelope_export',
      exclude_unrelated_dirty_files: true,
    },
  };
}

function validateCapaDispositionCorrectiveCoverage({ envelope, body, store }) {
  const payload = envelope?.envelope?.payload ?? envelope?.envelope ?? envelope?.payload ?? {};
  const envelopeId = envelope?.envelope_id ?? envelope?.envelope?.envelope_id ?? null;
  const classification = String(payload.classification ?? envelope?.kind ?? '').toLowerCase();
  const correctiveAction = typeof payload.corrective_action === 'string' ? payload.corrective_action.trim() : '';
  const capaLike = Boolean(correctiveAction)
    || classification.includes('capa')
    || Array.isArray(payload.related_capas)
    || Array.isArray(payload.acceptance_evidence);
  if (!capaLike || !correctiveAction) {
    return { ok: true, required: false, status: 'not_required', errors: [] };
  }

  const ledger = extractTaskSection(body, 'Follow-Up Ledger');
  if (!ledger) {
    return {
      ok: false,
      required: true,
      status: 'missing_corrective_action_coverage',
      envelope_id: envelopeId,
      corrective_action_present: true,
      corrective_action_summary: correctiveAction,
      errors: [`CAPA ${envelopeId ?? 'unknown'} has corrective_action but no Follow-Up Ledger entry proving implementation coverage, deferral/blocker state, or no-action rationale.`],
    };
  }

  const lines = ledger.split(/\r?\n/).map((line) => line.trim().replace(/^[-*]\s+/, '')).filter(Boolean);
  const activeStatuses = new Set(['opened', 'claimed', 'needs_continuation', 'in_review']);
  const taskLinks = [];
  for (const line of lines) {
    const taskMatches = [...line.matchAll(/\b(?:created|covered by)\s+#(\d+)\b/gi)];
    for (const match of taskMatches) {
      const taskNumber = Number(match[1]);
      const lifecycle = Number.isFinite(taskNumber) ? store.getLifecycleByNumber(taskNumber) : null;
      taskLinks.push({
        task_number: taskNumber,
        status: lifecycle?.status ?? 'not_found',
        active_implementation_coverage: lifecycle ? activeStatuses.has(lifecycle.status) : false,
        line,
      });
    }
  }
  const activeTaskLinks = taskLinks.filter((link) => link.active_implementation_coverage);
  const deferredOrBlocked = lines.find((line) => /\b(?:deferred|blocked|blocker)\s*:/i.test(line));
  const noAction = lines.find((line) => /\bno follow-?up needed\s*:/i.test(line) || /\bno[- ]action rationale\s*:/i.test(line));
  if (activeTaskLinks.length > 0 || deferredOrBlocked || noAction) {
    return {
      ok: true,
      required: true,
      status: activeTaskLinks.length > 0 ? 'covered_by_active_implementation_task' : deferredOrBlocked ? 'explicit_defer_or_blocker_state' : 'admitted_no_action_rationale',
      envelope_id: envelopeId,
      corrective_action_present: true,
      corrective_action_summary: correctiveAction,
      task_links: taskLinks,
      accepted_line: deferredOrBlocked ?? noAction ?? null,
      errors: [],
    };
  }

  return {
    ok: false,
    required: true,
    status: 'missing_corrective_action_coverage',
    envelope_id: envelopeId,
    corrective_action_present: true,
    corrective_action_summary: correctiveAction,
    task_links: taskLinks,
    errors: [`CAPA ${envelopeId ?? 'unknown'} corrective action lacks active implementation coverage. Link an active task with created #N / covered by #N, record deferred/blocker state, or record no follow-up needed with no-action rationale. Closed historical/disposition tasks do not count.`],
  };
}

function extractEnvelopeId(text) {
  const match = text.match(/env_[A-Za-z0-9_-]+/);
  return match ? match[0] : null;
}

function readIndexedEnvelope(siteRoot, envelopeId) {
  const index = refreshInboxIndex(siteRoot, { evaluateEnvelopeSeverity });
  try {
    const row = index.db.prepare('SELECT * FROM inbox_envelopes WHERE envelope_id = ?').get(envelopeId);
    if (!row) return null;
    return { ...row, envelope: JSON.parse(row.payload_json) };
  } finally {
    index.db.close();
  }
}

function inferDisposition(envelopeStatus) {
  if (envelopeStatus === 'promoted') return 'already_promoted';
  if (envelopeStatus === 'acknowledged') return 'already_acknowledged';
  if (envelopeStatus === 'dismissed') return 'already_dismissed';
  if (envelopeStatus === 'received') return 'received_pending_disposition';
  return 'no_envelope_or_unknown_status';
}

function replaceTaskSection(markdown, heading, replacement) {
  const pattern = new RegExp(`(## ${heading}\\r?\\n\\r?\\n)[\\s\\S]*?(?=\\r?\\n## )`);
  if (!pattern.test(markdown)) return `${markdown.trimEnd()}\n\n## ${heading}\n\n${replacement}\n`;
  return markdown.replace(pattern, `$1${replacement}\n`);
}

function relativeSitePath(siteRoot, filePath) {
  return relative(resolve(siteRoot), resolve(filePath)).replace(/\\/g, '/');
}

function ensureRecurringTaskTables(taskStore) {
  taskStore.db.exec(`
    CREATE TABLE IF NOT EXISTS recurring_task_definitions (
      recurrence_id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      status TEXT NOT NULL,
      trigger_mode TEXT NOT NULL,
      trigger_description TEXT,
      target_role TEXT,
      preferred_role TEXT,
      goal_markdown TEXT,
      context_markdown TEXT,
      required_work_markdown TEXT,
      non_goals_markdown TEXT,
      acceptance_criteria_json TEXT NOT NULL,
      evidence_requirements_json TEXT NOT NULL,
      created_by TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      suspended_at TEXT,
      retired_at TEXT,
      schedule_kind TEXT,
      schedule_interval INTEGER,
      schedule_timezone TEXT,
      last_due_key TEXT,
      last_auto_triggered_at TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_recurring_task_definitions_status
      ON recurring_task_definitions(status, updated_at);

    CREATE TABLE IF NOT EXISTS recurring_task_runs (
      run_id TEXT PRIMARY KEY,
      recurrence_id TEXT NOT NULL,
      task_id TEXT NOT NULL,
      task_number INTEGER NOT NULL,
      trigger_mode TEXT NOT NULL,
      run_reason TEXT NOT NULL,
      actor_agent_id TEXT NOT NULL,
      authority_basis_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (recurrence_id) REFERENCES recurring_task_definitions(recurrence_id),
      FOREIGN KEY (task_id) REFERENCES task_lifecycle(task_id)
    );

    CREATE INDEX IF NOT EXISTS idx_recurring_task_runs_recurrence
      ON recurring_task_runs(recurrence_id, created_at);

    CREATE TABLE IF NOT EXISTS recurring_task_events (
      event_id TEXT PRIMARY KEY,
      recurrence_id TEXT NOT NULL,
      event_type TEXT NOT NULL,
      state_after TEXT NOT NULL,
      actor_agent_id TEXT NOT NULL,
      authority_basis_json TEXT NOT NULL,
      event_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (recurrence_id) REFERENCES recurring_task_definitions(recurrence_id)
    );

    CREATE INDEX IF NOT EXISTS idx_recurring_task_events_recurrence
      ON recurring_task_events(recurrence_id, created_at);
  `);
  ensureRecurringColumn(taskStore, 'schedule_kind', 'TEXT');
  ensureRecurringColumn(taskStore, 'schedule_interval', 'INTEGER');
  ensureRecurringColumn(taskStore, 'schedule_timezone', 'TEXT');
  ensureRecurringColumn(taskStore, 'last_due_key', 'TEXT');
  ensureRecurringColumn(taskStore, 'last_auto_triggered_at', 'TEXT');
}

function ensureRecurringColumn(taskStore, columnName, columnType) {
  const columns = taskStore.db.prepare('PRAGMA table_info(recurring_task_definitions)').all();
  if (columns.some((column) => column.name === columnName)) return;
  taskStore.db.exec(`ALTER TABLE recurring_task_definitions ADD COLUMN ${columnName} ${columnType}`);
}

function insertRecurringDefinition(taskStore, definition) {
  ensureRecurringTaskTables(taskStore);
  taskStore.db.prepare(`
    INSERT INTO recurring_task_definitions (
      recurrence_id, title, status, trigger_mode, trigger_description,
      target_role, preferred_role, goal_markdown, context_markdown,
      required_work_markdown, non_goals_markdown, acceptance_criteria_json,
      evidence_requirements_json, created_by, created_at, updated_at,
      suspended_at, retired_at, schedule_kind, schedule_interval,
      schedule_timezone, last_due_key, last_auto_triggered_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    definition.recurrence_id,
    definition.title,
    definition.status,
    definition.trigger_mode,
    definition.trigger_description,
    definition.target_role,
    definition.preferred_role,
    definition.goal_markdown,
    definition.context_markdown,
    definition.required_work_markdown,
    definition.non_goals_markdown,
    definition.acceptance_criteria_json,
    definition.evidence_requirements_json,
    definition.created_by,
    definition.created_at,
    definition.updated_at,
    definition.suspended_at,
    definition.retired_at,
    definition.schedule_kind ?? null,
    definition.schedule_interval ?? null,
    definition.schedule_timezone ?? null,
    definition.last_due_key ?? null,
    definition.last_auto_triggered_at ?? null,
  );
}

function insertRecurringEvent(taskStore, { recurrenceId, eventType, stateAfter, actorAgentId, authorityBasis, event, now }) {
  ensureRecurringTaskTables(taskStore);
  taskStore.db.prepare(`
    INSERT INTO recurring_task_events (
      event_id, recurrence_id, event_type, state_after, actor_agent_id,
      authority_basis_json, event_json, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    `rtevt_${randomUUID()}`,
    recurrenceId,
    eventType,
    stateAfter,
    actorAgentId,
    JSON.stringify(authorityBasis),
    JSON.stringify(event ?? {}),
    now,
  );
}

function insertRecurringRun(taskStore, run) {
  ensureRecurringTaskTables(taskStore);
  taskStore.db.prepare(`
    INSERT INTO recurring_task_runs (
      run_id, recurrence_id, task_id, task_number, trigger_mode,
      run_reason, actor_agent_id, authority_basis_json, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    run.run_id,
    run.recurrence_id,
    run.task_id,
    run.task_number,
    run.trigger_mode,
    run.run_reason,
    run.actor_agent_id,
    run.authority_basis_json,
    run.created_at,
  );
}

function getRecurringDefinition(taskStore, recurrenceId) {
  ensureRecurringTaskTables(taskStore);
  const row = taskStore.db.prepare('SELECT * FROM recurring_task_definitions WHERE recurrence_id = ?').get(recurrenceId);
  return row ? hydrateRecurringDefinition(row) : null;
}

function listRecurringDefinitions(taskStore, { status = null, limit = 50 } = {}) {
  ensureRecurringTaskTables(taskStore);
  const boundedLimit = Math.max(1, Math.min(Number(limit) || 50, 200));
  const rows = status
    ? taskStore.db.prepare('SELECT * FROM recurring_task_definitions WHERE status = ? ORDER BY updated_at DESC LIMIT ?').all(status, boundedLimit)
    : taskStore.db.prepare('SELECT * FROM recurring_task_definitions ORDER BY updated_at DESC LIMIT ?').all(boundedLimit);
  return rows.map(hydrateRecurringDefinition);
}

function listDueRecurringDefinitions(taskStore, { now, limit = 20 } = {}) {
  ensureRecurringTaskTables(taskStore);
  const boundedLimit = Math.max(1, Math.min(Number(limit) || 20, 100));
  const rows = taskStore.db.prepare(`
    SELECT * FROM recurring_task_definitions
    WHERE status = 'active'
      AND trigger_mode = 'schedule'
      AND schedule_kind = 'daily'
    ORDER BY updated_at ASC
    LIMIT ?
  `).all(boundedLimit * 2);
  return rows.map(hydrateRecurringDefinition).filter((definition) => {
    const dueKey = recurringDueKey(definition, now);
    return Boolean(dueKey && definition.last_due_key !== dueKey);
  }).slice(0, boundedLimit);
}

function listRecurringRuns(taskStore, recurrenceId, limit = 20) {
  ensureRecurringTaskTables(taskStore);
  const boundedLimit = Math.max(1, Math.min(Number(limit) || 20, 200));
  return taskStore.db.prepare(`
    SELECT r.*, s.title
    FROM recurring_task_runs r
    LEFT JOIN task_specs s ON r.task_id = s.task_id
    WHERE r.recurrence_id = ?
    ORDER BY r.created_at DESC
    LIMIT ?
  `).all(recurrenceId, boundedLimit).map((row) => ({
    run_id: row.run_id,
    recurrence_id: row.recurrence_id,
    task_id: row.task_id,
    task_number: row.task_number,
    title: row.title ?? null,
    trigger_mode: row.trigger_mode,
    run_reason: row.run_reason,
    actor_agent_id: row.actor_agent_id,
    authority_basis: parseJsonOrNull(row.authority_basis_json),
    created_at: row.created_at,
  }));
}

function hydrateRecurringDefinition(row) {
  return {
    recurrence_id: row.recurrence_id,
    title: row.title,
    status: row.status,
    trigger_mode: row.trigger_mode,
    trigger_description: row.trigger_description ?? null,
    target_role: row.target_role ?? null,
    preferred_role: row.preferred_role ?? null,
    goal_markdown: row.goal_markdown ?? null,
    context_markdown: row.context_markdown ?? null,
    required_work_markdown: row.required_work_markdown ?? null,
    non_goals_markdown: row.non_goals_markdown ?? null,
    acceptance_criteria: parseJsonArray(row.acceptance_criteria_json),
    evidence_requirements: parseJsonArray(row.evidence_requirements_json),
    created_by: row.created_by,
    created_at: row.created_at,
    updated_at: row.updated_at,
    suspended_at: row.suspended_at ?? null,
    retired_at: row.retired_at ?? null,
    schedule_kind: row.schedule_kind ?? null,
    schedule_interval: row.schedule_interval ?? null,
    schedule_timezone: row.schedule_timezone ?? null,
    last_due_key: row.last_due_key ?? null,
    last_auto_triggered_at: row.last_auto_triggered_at ?? null,
  };
}

async function createRecurringTaskInstance({ store, siteRoot, definition, actorAgentId, actorRole, authorityBasis, triggerMode, runReason, eventType, now, dueKey = null }) {
  const nowIso = now instanceof Date ? now.toISOString() : new Date().toISOString();
  const taskNumber = (await allocateTaskNumbers(siteRoot, 1))[0];
  const taskTitle = `${definition.title} (${nowIso.slice(0, 10)})`;
  const taskId = `${todayYmd()}-${taskNumber}-${slugify(taskTitle)}`;
  const tasksDir = join(siteRoot, '.ai', 'do-not-open', 'tasks');
  const filePath = join(tasksDir, `${taskId}.md`);
  const evidenceRequirements = definition.evidence_requirements;
  const triggerLabel = triggerMode === 'schedule' ? 'Scheduled run reason' : 'Manual run reason';
  const recurrenceContext = [
    definition.context_markdown,
    '',
    `Recurring task definition: ${definition.recurrence_id}`,
    `${triggerLabel}: ${runReason}`,
    dueKey ? `Scheduled due key: ${dueKey}` : null,
    evidenceRequirements.length > 0 ? `Evidence requirements: ${evidenceRequirements.join('; ')}` : null,
  ].filter(Boolean).join('\n');
  const body = renderTaskBodyFromSpec({
    spec: {
      title: taskTitle,
      goal: definition.goal_markdown || definition.title,
      context: recurrenceContext,
      required_work: definition.required_work_markdown || 'Execute the recurring task instance.',
      non_goals: definition.non_goals_markdown,
      acceptance_criteria: definition.acceptance_criteria,
    },
    executionNotes: null,
    verification: null,
  });
  const frontMatterLines = [
    '---',
    `number: ${taskNumber}`,
    `governed_by: ${definition.preferred_role || definition.target_role || 'unknown'}`,
    'status: opened',
    `recurring_task_id: ${definition.recurrence_id}`,
    `recurring_trigger_mode: ${triggerMode}`,
  ];
  if (dueKey) frontMatterLines.push(`recurring_due_key: ${dueKey}`);
  if (definition.preferred_role) frontMatterLines.push(`preferred_role: ${definition.preferred_role}`);
  if (definition.target_role) frontMatterLines.push(`target_role: ${definition.target_role}`);
  frontMatterLines.push('---');
  const runId = `rtrun_${randomUUID()}`;
  store.db.exec('BEGIN');
  try {
    if (triggerMode === 'schedule' && dueKey) {
      const fresh = getRecurringDefinition(store, definition.recurrence_id);
      if (!fresh || fresh.status !== 'active') {
        store.db.exec('ROLLBACK');
        return { status: 'skipped', recurrence_id: definition.recurrence_id, reason: 'recurrence_not_active' };
      }
      if (fresh.last_due_key === dueKey) {
        store.db.exec('ROLLBACK');
        return { status: 'skipped', recurrence_id: definition.recurrence_id, reason: 'due_key_already_created', due_key: dueKey };
      }
    }
    writeFileSync(filePath, `${frontMatterLines.join('\n')}\n${body}`, 'utf8');
    store.upsertLifecycle({
      task_id: taskId,
      task_number: taskNumber,
      status: 'opened',
      governed_by: definition.preferred_role || definition.target_role || null,
      closed_at: null,
      closed_by: null,
      reopened_at: null,
      reopened_by: null,
      continuation_packet_json: null,
      updated_at: nowIso,
    });
    store.upsertTaskSpec({
      task_id: taskId,
      task_number: taskNumber,
      title: taskTitle,
      chapter_markdown: null,
      goal_markdown: definition.goal_markdown || definition.title,
      context_markdown: recurrenceContext,
      required_work_markdown: definition.required_work_markdown || 'Execute the recurring task instance.',
      non_goals_markdown: definition.non_goals_markdown,
      acceptance_criteria_json: JSON.stringify(definition.acceptance_criteria),
      dependencies_json: '[]',
      updated_at: nowIso,
    });
    ensureTaskRoutingTables(store);
    if (definition.preferred_role || definition.target_role) {
      store.db.prepare(`
        INSERT INTO narada_andrey_task_role_preferences (task_id, preferred_role, target_role, preferred_agent_id, updated_at)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(task_id) DO UPDATE SET
          preferred_role = excluded.preferred_role,
          target_role = excluded.target_role,
          preferred_agent_id = excluded.preferred_agent_id,
          updated_at = excluded.updated_at
      `).run(taskId, definition.preferred_role, definition.target_role || definition.preferred_role, null, nowIso);
    }
    insertRecurringRun(store, {
      run_id: runId,
      recurrence_id: definition.recurrence_id,
      task_id: taskId,
      task_number: taskNumber,
      trigger_mode: triggerMode,
      run_reason: runReason,
      actor_agent_id: actorAgentId,
      authority_basis_json: JSON.stringify(authorityBasis),
      created_at: nowIso,
    });
    if (triggerMode === 'schedule' && dueKey) {
      store.db.prepare(`
        UPDATE recurring_task_definitions
        SET last_due_key = ?, last_auto_triggered_at = ?, updated_at = ?
        WHERE recurrence_id = ?
      `).run(dueKey, nowIso, nowIso, definition.recurrence_id);
    }
    insertRecurringEvent(store, {
      recurrenceId: definition.recurrence_id,
      eventType,
      stateAfter: definition.status,
      actorAgentId,
      authorityBasis,
      event: { actor_role: actorRole, run_id: runId, task_id: taskId, task_number: taskNumber, run_reason: runReason, due_key: dueKey },
      now: nowIso,
    });
    store.db.exec('COMMIT');
  } catch (error) {
    try { store.db.exec('ROLLBACK'); } catch { /* ignore rollback failure */ }
    throw error;
  }
  return {
    status: 'triggered',
    recurrence_id: definition.recurrence_id,
    run_id: runId,
    task_number: taskNumber,
    task_id: taskId,
    file_path: filePath,
    trigger_mode: triggerMode,
    due_key: dueKey,
  };
}

function updateRecurringDefinitionStatus({ store, siteRoot, recurrenceId, actorAgentId, authorityBasis, nextStatus, eventType, reason }) {
  if (!recurrenceId) throw new Error('recurrence_id_required');
  if (!actorAgentId) throw new Error('actor_agent_id_required');
  if (!authorityBasis) throw new Error('valid_authority_basis_required');
  if (!reason) throw new Error('reason_required');
  enforceSessionIdentity(actorAgentId);
  const actorRole = requireRecurringAuthorityActor({ store, siteRoot, actorAgentId });
  const definition = getRecurringDefinition(store, recurrenceId);
  if (!definition) return { status: 'not_found', recurrence_id: recurrenceId };
  if (definition.status === 'retired' && nextStatus !== 'retired') {
    return { status: 'blocked', reason: 'recurrence_retired', recurrence_id: recurrenceId };
  }
  const now = new Date().toISOString();
  ensureRecurringTaskTables(store);
  store.db.exec('BEGIN');
  try {
    const timestampColumn = nextStatus === 'retired' ? 'retired_at' : 'suspended_at';
    store.db.prepare(`
      UPDATE recurring_task_definitions
      SET status = ?, updated_at = ?, ${timestampColumn} = ?
      WHERE recurrence_id = ?
    `).run(nextStatus, now, now, recurrenceId);
    insertRecurringEvent(store, {
      recurrenceId,
      eventType,
      stateAfter: nextStatus,
      actorAgentId,
      authorityBasis,
      event: { actor_role: actorRole, reason },
      now,
    });
    store.db.exec('COMMIT');
  } catch (error) {
    try { store.db.exec('ROLLBACK'); } catch { /* ignore rollback failure */ }
    throw error;
  }
  return {
    schema: 'narada.task.recurring.transition.v0',
    status: nextStatus,
    recurrence_id: recurrenceId,
    reason,
  };
}

function requireRecurringAuthorityActor({ store, siteRoot, actorAgentId }) {
  const actorRoleResolution = resolveAgentRoleWithDiagnostics(store, siteRoot, actorAgentId);
  const actorRole = actorRoleResolution.role;
  if (!['architect', 'operator'].includes(actorRole)) {
    throw new Error(`recurring_task_actor_not_authorized: ${actorAgentId}`);
  }
  return actorRole;
}

function normalizeRecurringAuthorityBasis(value) {
  const record = asRecord(value);
  const kind = stringField(record, 'kind');
  const summary = stringField(record, 'summary');
  const allowedKinds = new Set(['operator_direct_instruction', 'architect_review', 'task_acceptance', 'manual_trigger', 'scheduled_trigger']);
  if (!kind || !allowedKinds.has(kind) || !summary) return null;
  return { kind, summary };
}

function parseIsoOrNow(value) {
  if (!value) return new Date();
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) throw new Error('invalid_current_time');
  return parsed;
}

function recurringDueKey(definition, now) {
  if (definition.trigger_mode !== 'schedule') return null;
  if (definition.schedule_kind !== 'daily') return null;
  return now.toISOString().slice(0, 10);
}

function arrayOfStrings(value, fallback = []) {
  if (!Array.isArray(value)) return fallback;
  const strings = value.filter((item) => typeof item === 'string' && item.trim().length > 0).map((item) => item.trim());
  return strings.length > 0 ? strings : fallback;
}

function parseJsonArray(value) {
  try {
    const parsed = JSON.parse(value ?? '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function parseJsonOrNull(value) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function ensureTaskRoutingTables(taskStore) {
  taskStore.db.exec(`
    CREATE TABLE IF NOT EXISTS narada_andrey_task_role_preferences (
      task_id TEXT PRIMARY KEY,
      preferred_role TEXT,
      target_role TEXT,
      preferred_agent_id TEXT,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS task_routing_events (
      event_id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL,
      task_number INTEGER NOT NULL,
      actor_agent_id TEXT NOT NULL,
      actor_role TEXT,
      reason TEXT NOT NULL,
      changed_fields_json TEXT NOT NULL,
      previous_routing_json TEXT NOT NULL,
      new_routing_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_task_routing_events_task_id
      ON task_routing_events(task_id);
  `);
  ensureColumn(taskStore, 'narada_andrey_task_role_preferences', 'preferred_role', 'TEXT');
  ensureColumn(taskStore, 'narada_andrey_task_role_preferences', 'target_role', 'TEXT');
  ensureColumn(taskStore, 'narada_andrey_task_role_preferences', 'preferred_agent_id', 'TEXT');
}

function getTaskRouting(taskStore, taskId) {
  ensureTaskRoutingTables(taskStore);
  const lifecycle = taskStore.getLifecycle(taskId);
  const rolePref = taskStore.db.prepare(`
    SELECT target_role, preferred_role, preferred_agent_id
    FROM narada_andrey_task_role_preferences
    WHERE task_id = ?
  `).get(taskId);
  return {
    target_role: rolePref?.target_role || rolePref?.preferred_role || null,
    preferred_agent_id: rolePref?.preferred_agent_id || null,
    relative_priority: lifecycle?.relative_priority ?? 0,
  };
}

function ensureColumn(taskStore, tableName, columnName, columnType) {
  const columns = taskStore.db.prepare(`PRAGMA table_info(${tableName})`).all();
  if (!columns.some((column) => column.name === columnName)) {
    taskStore.db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${columnType}`);
  }
}

function ensureAgentRosterEventsTable(taskStore) {
  taskStore.db.exec(`
    CREATE TABLE IF NOT EXISTS agent_roster_events (
      event_id TEXT PRIMARY KEY,
      event_type TEXT NOT NULL,
      agent_id TEXT NOT NULL,
      role TEXT,
      capabilities_json TEXT,
      operator_identity TEXT,
      requested_by TEXT NOT NULL,
      requested_at TEXT NOT NULL,
      authority_basis_json TEXT NOT NULL,
      admission_status TEXT NOT NULL,
      admitted_by TEXT,
      admitted_at TEXT,
      reason TEXT,
      payload_json TEXT,
      supersedes_event_id TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_agent_roster_events_agent_id
      ON agent_roster_events(agent_id, requested_at);
    CREATE INDEX IF NOT EXISTS idx_agent_roster_events_status
      ON agent_roster_events(admission_status, requested_at);
  `);
}

function normalizeRosterAuthorityBasis(value) {
  const record = asRecord(value);
  const kind = stringField(record, 'kind');
  const summary = stringField(record, 'summary');
  const allowedKinds = new Set(['operator_direct_instruction', 'directed_obligation', 'task_owner_handoff']);
  if (!kind || !allowedKinds.has(kind) || !summary) return null;
  return { kind, summary };
}

function validateRosterIdentifier(value, fieldName) {
  if (!value) throw new Error(`${fieldName}_required`);
  if (!/^[A-Za-z0-9._-]+$/.test(value)) {
    throw new Error(`${fieldName}_invalid: expected letters, numbers, dot, underscore, or hyphen only`);
  }
}

function admitRosterIdentity(args) {
  const agentId = stringField(args, 'agent_id');
  const role = stringField(args, 'role');
  const actorAgentId = stringField(args, 'actor_agent_id');
  const capabilities = stringArrayField(args, 'capabilities') ?? [];
  const operatorIdentity = stringField(args, 'operator_identity') ?? null;
  const authorityBasis = normalizeRosterAuthorityBasis(args.authority_basis);
  const reason = stringField(args, 'reason') ?? authorityBasis?.summary ?? null;
  const dryRun = booleanField(args, 'dry_run') === true;

  validateRosterIdentifier(agentId, 'agent_id');
  validateRosterIdentifier(role, 'role');
  validateRosterIdentifier(actorAgentId, 'actor_agent_id');
  enforceSessionIdentity(actorAgentId);
  if (!authorityBasis) throw new Error('authority_basis_required: kind must be operator_direct_instruction, directed_obligation, or task_owner_handoff and summary is required');

  ensureAgentRosterEventsTable(store);
  const now = new Date().toISOString();
  const existing = store.db.prepare('SELECT * FROM agent_roster WHERE agent_id = ?').get(agentId);
  const operatorIdentityCol = store.db.prepare("PRAGMA table_info(agent_roster)").all().some((column) => column.name === 'operator_identity');
  const event = {
    event_id: `roster-${randomUUID()}`,
    event_type: 'admit_agent',
    agent_id: agentId,
    role,
    capabilities_json: JSON.stringify(capabilities),
    operator_identity: operatorIdentity,
    requested_by: actorAgentId,
    requested_at: now,
    authority_basis_json: JSON.stringify(authorityBasis),
    admission_status: existing ? 'already_present' : 'admitted',
    admitted_by: actorAgentId,
    admitted_at: now,
    reason,
    payload_json: JSON.stringify({
      dry_run: dryRun,
      projection_target: 'agent_roster',
      existing_agent_present: Boolean(existing),
    }),
    supersedes_event_id: null,
  };

  if (dryRun) {
    return {
      status: existing ? 'already_present' : 'would_admit',
      schema: 'narada.task.roster_admission.v0',
      dry_run: true,
      event,
      projected_roster_entry: existing ?? {
        agent_id: agentId,
        role,
        capabilities_json: JSON.stringify(capabilities),
        status: 'idle',
        task_number: null,
        last_done: null,
      },
    };
  }

  const insertEvent = store.db.prepare(`
    INSERT INTO agent_roster_events (
      event_id, event_type, agent_id, role, capabilities_json, operator_identity,
      requested_by, requested_at, authority_basis_json, admission_status,
      admitted_by, admitted_at, reason, payload_json, supersedes_event_id
    ) VALUES (
      @event_id, @event_type, @agent_id, @role, @capabilities_json, @operator_identity,
      @requested_by, @requested_at, @authority_basis_json, @admission_status,
      @admitted_by, @admitted_at, @reason, @payload_json, @supersedes_event_id
    )
  `);
  insertEvent.run(event);

  if (!existing) {
    store.upsertRosterEntry({
      agent_id: agentId,
      role,
      capabilities_json: JSON.stringify(capabilities),
      first_seen_at: now,
      last_active_at: now,
      status: 'idle',
      task_number: null,
      last_done: null,
      updated_at: now,
      ...(operatorIdentityCol ? { operator_identity: operatorIdentity } : {}),
    });
  }

  return {
    status: existing ? 'already_present' : 'admitted',
    schema: 'narada.task.roster_admission.v0',
    dry_run: false,
    event_id: event.event_id,
    agent_id: agentId,
    role,
    capabilities,
    append_only_event_recorded: true,
    roster_projection_changed: !existing,
    projection: existing ? 'agent_roster_existing_row_preserved' : 'agent_roster_inserted_from_admitted_event',
  };
}

function ensureStaticRosterAgentInSql(taskStore, root, agentId) {
  if (!agentId) return;
  try {
    const existing = taskStore.db.prepare('SELECT agent_id FROM agent_roster WHERE agent_id = ?').get(agentId);
    if (existing) return;
  } catch {
    return;
  }

  const rosterPath = join(root, '.ai', 'agents', 'roster.json');
  let staticAgent = null;
  try {
    const roster = JSON.parse(readFileSync(rosterPath, 'utf8'));
    staticAgent = Array.isArray(roster.agents) ? roster.agents.find((agent) => agent?.agent_id === agentId) : null;
  } catch {
    return;
  }
  if (!staticAgent?.role) return;

  const now = new Date().toISOString();
  taskStore.upsertRosterEntry({
    agent_id: staticAgent.agent_id,
    role: staticAgent.role,
    capabilities_json: JSON.stringify(staticAgent.capabilities ?? []),
    first_seen_at: staticAgent.first_seen_at ?? now,
    last_active_at: staticAgent.last_active_at ?? now,
    status: staticAgent.status ?? 'idle',
    task_number: staticAgent.task_number ?? staticAgent.task ?? null,
    last_done: staticAgent.last_done ?? null,
    updated_at: now,
    ...(staticAgent.operator_identity ? { operator_identity: staticAgent.operator_identity } : {}),
  });
}

async function withAuthoredRosterJsonPreserved(root, fn) {
  const rosterPath = join(root, '.ai', 'agents', 'roster.json');
  let before = null;
  try {
    before = readFileSync(rosterPath, 'utf8');
  } catch {
    before = null;
  }
  const result = await fn();
  if (before !== null) {
    try {
      const after = readFileSync(rosterPath, 'utf8');
      if (after !== before) {
        writeFileSync(rosterPath, before, 'utf8');
      }
    } catch {
      // Roster JSON is static compatibility config; preservation is best-effort.
    }
  }
  return result;
}

/**
 * Spawn a fresh MCP server process and invoke a single tool.
 * Returns the parsed tool result. Used to verify code changes without
 * restarting the long-lived session MCP server.
 */
async function testMcpTool(cwd, serverPath, toolName, toolArgs, options = {}) {
  const siteServerPath = resolve(cwd, serverPath);
  const fullServerPath = existsSync(siteServerPath) ? siteServerPath : resolve(process.cwd(), serverPath);
  const init = JSON.stringify({ jsonrpc: '2.0', id: 0, method: 'initialize', params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'test_mcp_tool', version: '1.0' } } });
  const req = JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: toolName, arguments: toolArgs } });
  const stdin = init + '\n' + req + '\n';
  const timeoutSeconds = Math.min(300, Math.max(1, Number.isFinite(options.timeoutSeconds) ? options.timeoutSeconds : 10));
  const timeoutMs = timeoutSeconds * 1000;

  return new Promise((res, rej) => {
    const proc = spawnMcpServer(process.execPath, [fullServerPath, '--site-root', cwd], { cwd: existsSync(siteServerPath) ? cwd : process.cwd() });
    let out = '';
    let err = '';
    let settled = false;
    proc.stdout.on('data', (d) => { out += d.toString(); });
    proc.stderr.on('data', (d) => { err += d.toString(); });
    proc.stdin.write(stdin);
    proc.stdin.end();

    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      if (!proc.killed) proc.kill();
      rej(new Error(`test_mcp_tool timed out after ${timeoutSeconds}s. stderr: ${err}`));
    }, timeoutMs);

    proc.on('close', (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      const results = out.split(/\r?\n/).filter((line) => line.trim().length > 0).map((line) => {
        try { return JSON.parse(line); } catch { return null; }
      }).filter(Boolean);
      const callResult = results.find(r => r.id === 1);
      if (!callResult) {
        rej(new Error(`No tools/call response from ${serverPath}. stderr: ${err}`));
        return;
      }
      if (callResult.error) {
        rej(new Error(`MCP error from ${serverPath}: ${callResult.error.message}`));
        return;
      }
      const content = callResult.result?.content;
      if (content && content[0]?.type === 'text') {
        try {
          res(JSON.parse(content[0].text));
        } catch (e) {
          res({ raw_text: content[0].text });
        }
      } else {
        res(callResult.result);
      }
    });

    proc.on('error', (e) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      rej(new Error(`Failed to spawn ${serverPath}: ${e.message}`));
    });
  });
}
