import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { readAdmissionLog, resolveEnvelopeStatus } from '@narada2/task-governance/runtime/inbox/admission-log';
import { resolveAgentRoleWithDiagnostics } from './agent-role-resolution.mjs';

const CORRECTIVE_COVERAGE_PRESSURE_STATUSES = new Set([
  'missing_corrective_task_coverage',
  'historical_only_no_open_corrective_task',
]);

export function buildCorrectiveDebtReadiness({ siteRoot, store, allTasks = [] } = {}) {
  const inboxCapas = readActiveInboxCapaItems(siteRoot);
  const capabilityCapas = readPendingCapabilityCapaItems(siteRoot);
  const activeItems = [...inboxCapas.active, ...capabilityCapas.active]
    .map((item) => ({
      ...item,
      corrective_task_coverage: detectCorrectiveTaskCoverage({ siteRoot, store, item, allTasks }),
    }))
    .sort((a, b) => b.severity - a.severity || String(a.capa_id).localeCompare(String(b.capa_id)));

  const terminalCoverageItems = activeItems.filter((item) => item.corrective_task_coverage.status === 'closed_corrective_implementation_coverage');
  const highSeverityItems = activeItems.filter((item) => item.severity >= 75);
  const missingCoverageItems = highSeverityItems.filter((item) => CORRECTIVE_COVERAGE_PRESSURE_STATUSES.has(item.corrective_task_coverage.status));
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
      corrective_action_summary: item.corrective_action_summary ?? null,
      responsible_agent_id: item.responsible_agent_id ?? '',
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

export function deriveCorrectiveDebtRecommendation({ correctiveDebtReadiness, siteRoot, store, agentRole }) {
  if (agentRole !== 'architect') return null;
  const items = (correctiveDebtReadiness?.active_items ?? [])
    .filter((item) => item.severity >= 75)
    .filter((item) => CORRECTIVE_COVERAGE_PRESSURE_STATUSES.has(item.corrective_task_coverage?.status))
    .filter((item) => capaBelongsToRole({ item, siteRoot, store, role: agentRole }));
  if (items.length === 0) return null;
  const item = items[0];
  return {
    action: 'corrective_debt_coverage',
    reason: 'Uncovered architect-role CAPA corrective debt requires task coverage before the workboard can be treated as empty.',
    capa: {
      capa_id: item.capa_id,
      capa_type: item.capa_type,
      severity: item.severity,
      concept_name: item.concept_name,
      corrective_action_summary: item.corrective_action_summary ?? null,
      responsible_agent_id: item.responsible_agent_id ?? '',
      coverage_status: item.corrective_task_coverage?.status ?? null,
      remediation: item.corrective_task_coverage?.remediation ?? null,
      linked_tasks: item.corrective_task_coverage?.tasks ?? [],
      actionable_next_states: item.corrective_task_coverage?.actionable_next_states ?? [],
    },
    next_action: 'Create or link a corrective implementation task, record an explicit defer/blocker state, or admit a no-action rationale.',
    agent_actionable: true,
  };
}

export function selectWorkboardRecommendation({ baseRecommendation, correctiveDebtRecommendation }) {
  if (baseRecommendation?.action === 'continue') return baseRecommendation;
  return correctiveDebtRecommendation ?? baseRecommendation ?? null;
}

export function correctiveDebtRecommendationListItem(recommendation) {
  if (recommendation?.action !== 'corrective_debt_coverage') return null;
  const capa = recommendation.capa ?? {};
  return {
    type: 'corrective_debt_coverage',
    priority: 2,
    action: 'corrective_debt_coverage',
    title: capa.concept_name ?? capa.capa_id ?? 'Uncovered CAPA corrective debt',
    capa_id: capa.capa_id ?? null,
    capa_type: capa.capa_type ?? null,
    severity: capa.severity ?? null,
    coverage_status: capa.coverage_status ?? null,
    remediation: capa.remediation ?? null,
    next_action: recommendation.next_action ?? null,
    agent_actionable: true,
  };
}

function capaBelongsToRole({ item, siteRoot, store, role }) {
  const responsibleAgentId = item.responsible_agent_id || '';
  if (responsibleAgentId) {
    const resolved = resolveAgentRoleWithDiagnostics(store, siteRoot, responsibleAgentId);
    return resolved.role === role;
  }
  const linkedTasks = item.corrective_task_coverage?.tasks ?? [];
  return linkedTasks.some((task) => {
    const lifecycle = task.task_number ? store.getLifecycleByNumber(task.task_number) : null;
    const routing = lifecycle?.task_id ? readTaskRouting(store, lifecycle.task_id) : null;
    return routing?.target_role === role || routing?.preferred_role === role || lifecycle?.governed_by === role;
  });
}

function readActiveInboxCapaItems(siteRoot) {
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

function readPendingCapabilityCapaItems(siteRoot) {
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

function detectCorrectiveTaskCoverage({ siteRoot, store, item, allTasks }) {
  const matches = [];
  const normalizedConcept = normalizeLinkText(item.concept_name);
  for (const row of allTasks ?? []) {
    const spec = row.task_number ? store.getTaskSpecByNumber(row.task_number) : null;
    const projectedTaskBody = readProjectedTaskBody(siteRoot, row.task_id);
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
      closed_corrective_implementation: isClosedCorrectiveImplementationTask({ siteRoot, row, spec, item, projectedTaskBody }),
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

function isClosedCorrectiveImplementationTask({ siteRoot, row, spec, item, projectedTaskBody = null }) {
  if (!['closed', 'confirmed'].includes(row.status)) return false;
  const title = String(spec?.title ?? row.title ?? '');
  const taskText = [
    title,
    spec?.goal_markdown,
    spec?.context_markdown,
    spec?.required_work_markdown,
    spec?.non_goals_markdown,
    projectedTaskBody ?? readProjectedTaskBody(siteRoot, row.task_id),
  ].filter(Boolean).join('\n');
  const normalized = normalizeLinkText(taskText);
  if (/\b(disposition|intake|triage|audit|cluster|inventory|review)\b/i.test(title)) return false;
  if (!/(implement|implemented|fix|fixed|repair|repaired|guard|guarded|prevent|prevented|refuse|refused|enforce|enforced|validate|validated|test|coverage)/i.test(taskText)) return false;
  if (item.capa_id && !normalized.includes(normalizeLinkText(item.capa_id))) return false;
  const evidence = classifyProjectedTaskEvidence(taskText);
  return evidence.acceptance_complete && evidence.execution_notes_present && evidence.verification_present;
}

function readProjectedTaskBody(siteRoot, taskId) {
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

function readTaskRouting(store, taskId) {
  try {
    const row = store.db.prepare(`
      SELECT target_role, preferred_role, preferred_agent_id
      FROM narada_andrey_task_role_preferences
      WHERE task_id = ?
    `).get(taskId);
    return row ?? null;
  } catch {
    return null;
  }
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
