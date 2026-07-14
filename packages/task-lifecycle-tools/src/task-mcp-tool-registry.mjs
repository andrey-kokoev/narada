export const TASK_LIFECYCLE_TOOL_ALIASES = {
  task_lifecycle_closeout: 'task_lifecycle_disposition_closeout',
  task_lifecycle_closeout_from_payload: 'task_lifecycle_disposition_closeout',
  task_lifecycle_disposition_closeout_from_payload: 'task_lifecycle_disposition_closeout',
  task_lifecycle_record_observation: 'task_lifecycle_submit_observation',
  task_lifecycle_submit_report: 'task_lifecycle_finish',
  task_lifecycle_d_af077406ea2f: 'task_lifecycle_disposition_closeout',
  task_lifecycle_s_f5e0b1532dcf: 'task_lifecycle_submit_observation',
  task_mcp_doctor: 'task_lifecycle_doctor',
  task_mcp_restart: 'task_lifecycle_restart',
  task_mcp_list: 'task_lifecycle_list',
  task_mcp_show: 'task_lifecycle_show',
  task_mcp_roster: 'task_lifecycle_roster',
  task_mcp_roster_admit: 'task_lifecycle_roster_admit',
  task_mcp_claim: 'task_lifecycle_claim',
  task_mcp_continue: 'task_lifecycle_continue',
  task_mcp_unclaim: 'task_lifecycle_unclaim',
  task_mcp_next: 'task_lifecycle_next',
  task_mcp_workboard_snapshot: 'task_lifecycle_workboard_snapshot',
  task_mcp_obligations: 'task_lifecycle_obligations',
  task_mcp_inspect: 'task_lifecycle_inspect',
  task_mcp_evidence_preflight: 'task_lifecycle_evidence_preflight',
  task_mcp_admit_evidence: 'task_lifecycle_admit_evidence',
  task_mcp_prove_criteria: 'task_lifecycle_prove_criteria',
  task_mcp_audit: 'task_lifecycle_audit',
  task_mcp_finish: 'task_lifecycle_finish',
  task_lifecycle_finish_from_payload: 'task_lifecycle_finish',
  task_lifecycle_submit_report_from_payload: 'task_lifecycle_finish',
  task_mcp_finish_from_payload: 'task_lifecycle_finish',
  task_mcp_close: 'task_lifecycle_close',
  task_mcp_tombstone: 'task_lifecycle_tombstone',
  task_mcp_drop: 'task_lifecycle_tombstone',
  task_mcp_search: 'task_lifecycle_search',
  task_mcp_defer: 'task_lifecycle_defer',
  task_mcp_un_defer: 'task_lifecycle_un_defer',
  task_mcp_undefer: 'task_lifecycle_un_defer',
  task_mcp_reopen: 'task_lifecycle_reopen',
  task_mcp_review: 'task_lifecycle_review',
  task_lifecycle_review_from_payload: 'task_lifecycle_review',
  task_mcp_review_from_payload: 'task_lifecycle_review',
  task_mcp_submit_observation: 'task_lifecycle_submit_observation',
  task_mcp_bridge_poll: 'task_lifecycle_bridge_poll',
  task_mcp_inbox_target: 'task_lifecycle_inbox_target',
  task_mcp_create: 'task_lifecycle_create',
  task_mcp_create_batch: 'task_lifecycle_create_task_batch',
  task_mcp_set_routing: 'task_lifecycle_set_routing',
  task_mcp_chapter_upsert: 'task_lifecycle_chapter_upsert',
  task_mcp_chapter_add_task: 'task_lifecycle_chapter_add_task',
  task_mcp_chapter_show: 'task_lifecycle_chapter_show',
  task_mcp_chapter_list: 'task_lifecycle_chapter_list',
  task_mcp_chapter_import_markdown: 'task_lifecycle_chapter_import_markdown',
  task_mcp_route_task_set: 'task_lifecycle_route_task_set',
  task_mcp_test_tool: 'task_lifecycle_test_mcp_tool',
  task_mcp_run_tests: 'task_lifecycle_run_tests',
  task_mcp_replay_test_evidence: 'task_lifecycle_replay_test_evidence',
};

import { listCommandTools, listPayloadTools } from '../../site-common-tools/compat/mcp-payload-file.legacy-site.mjs';

export function taskLifecycleTools() {
  return [
    tool('task_lifecycle_doctor', 'Inspect Task Lifecycle MCP readiness without mutating.', objectSchema({})),
    tool('task_lifecycle_restart', 'Request, inspect, or acknowledge an external restart of the task-lifecycle stdio MCP server. Does not self-restart the current process.', objectSchema({
      mode: stringSchema('request, status, acknowledge, or clear. Default request.'),
      reason: stringSchema('Optional reason for the restart request or acknowledgement.'),
    })),
    tool('task_lifecycle_list', 'List tasks with optional status and agent filters.', objectSchema({
      status: stringSchema('Filter by status: draft, opened, claimed, in_review, closed, confirmed, etc.'),
      agent_id: stringSchema('Agent id used by query_mode. Defaults to active-assignment filtering when query_mode is omitted.'),
      query_mode: stringSchema('Agent relationship mode: all, claimed_by, preferred_for, target_role, review_obligations, or all_agent_related.'),
      limit: numberSchema('Maximum results; defaults to 50.'),
    })),
    tool('task_lifecycle_show', 'Show full task details: lifecycle, spec, assignment, and observations.', objectSchema({ task_number: numberSchema('Task number to inspect.') }, ['task_number'])),
    tool('task_lifecycle_diagnose_task_ref', 'Diagnose task_id/task_number collisions, missing projections, and unsafe directive references before report or closeout.', objectSchema({
      task_id: stringSchema('Optional lifecycle task_id to diagnose.'),
      task_number: numberSchema('Optional task number to compare against task_id.'),
    })),
    tool('task_lifecycle_roster', 'List the agent roster.', objectSchema({})),
    tool('task_lifecycle_roster_admit', 'Append an admitted roster identity event and project it into the agent_roster read model.', objectSchema({
      agent_id: stringSchema('Canonical agent identity to admit into task lifecycle roster authority.'),
      role: stringSchema('Canonical role for the agent.'),
      actor_agent_id: stringSchema('Verified session agent recording the roster admission.'),
      capabilities: arraySchema(stringSchema('Capability name.'), 'Capabilities to project for this roster identity.'),
      operator_identity: stringSchema('Optional operator identity associated with the agent.'),
      authority_basis: authorityBasisSchema('Required authority basis for roster admission.'),
      reason: stringSchema('Optional admission reason.'),
      dry_run: { type: 'boolean', description: 'Plan only; do not append event or project roster.' },
    }, ['agent_id', 'role', 'actor_agent_id', 'authority_basis'])),
    tool('task_lifecycle_claim', 'Claim an unassigned task for an agent. If the claiming agent differs from preferred_agent_id, include authority_basis { kind, summary }.', objectSchema({
      task_number: numberSchema('Task number to claim.'),
      agent_id: stringSchema('Agent id claiming the task.'),
      authority_basis: authorityBasisSchema('Required when the task has a different preferred_agent_id.'),
    }, ['task_number', 'agent_id'])),
    tool('task_lifecycle_dependency_disposition_record', 'Record explicit disposition for a blocking dependency outcome. Use after dependency satisfaction reports disposition_required=true; required_outcome_id is inferred from the latest outcome when omitted.', objectSchema({
      dependency_id: stringSchema('Dependency id whose blocking outcome is being dispositioned.'),
      agent_id: stringSchema('Agent id recording the disposition.'),
      kind: stringSchema('Disposition kind: remediation_task, covered_by_existing_task, routed_obligation, operator_decision_required, operator_deferred, or out_of_scope_or_rejected.'),
      summary: stringSchema('Concise disposition summary and authority rationale.'),
      required_outcome_id: stringSchema('Optional specific task_outcomes.outcome_id. Defaults to latest outcome on the required task.'),
      status: stringSchema('Disposition status. Defaults to open, or deferred for operator_deferred/out_of_scope_or_rejected.'),
      target_task_id: stringSchema('Optional task_id for remediation_task or covered_by_existing_task disposition.'),
      routed_obligation_id: stringSchema('Optional directed obligation id for routed_obligation disposition.'),
      authority_basis: authorityBasisSchema('Required authority basis for operator_deferred and out_of_scope_or_rejected dispositions; optional otherwise.'),
    }, ['dependency_id', 'agent_id', 'kind', 'summary'])),
    tool('task_lifecycle_continue', 'Continue a task that is in needs_continuation or evidence_repair state.', objectSchema({
      task_number: numberSchema('Task number to continue.'),
      agent_id: stringSchema('Agent id continuing the task.'),
      reason: stringSchema('Continuation reason: evidence_repair, review_fix, handoff, blocked_agent, operator_override.'),
      authority_basis: authorityBasisSchema('Optional operator override authority for execution-window gates.'),
    }, ['task_number', 'agent_id', 'reason'])),
    tool('task_lifecycle_unclaim', 'Release an active task assignment.', objectSchema({
      task_number: numberSchema('Task number to unclaim.'),
      agent_id: stringSchema('Optional agent_id guard; must match current claimant.'),
      reason: stringSchema('Release reason.'),
    }, ['task_number'])),
    tool('task_lifecycle_next', 'Get the next recommended action for an agent: active work, review obligations, or claimable tasks.', objectSchema({
      agent_id: stringSchema('Agent id to query workboard for.'),
      limit: numberSchema('Maximum results per category; defaults to 8.'),
      last_workboard_check_at: stringSchema("ISO timestamp of the agent's last workboard check. Enables state_freshness computation."),
    }, ['agent_id'])),
    tool('task_lifecycle_workboard_snapshot', 'Return a read-only, trace-ready workboard evidence packet for IS movement. Does not claim, route, rank, or reconcile tasks.', objectSchema({
      agent_id: stringSchema('Agent id to query workboard evidence for.'),
      limit: numberSchema('Maximum sample items per category; defaults to 8.'),
      last_workboard_check_at: stringSchema("ISO timestamp of the agent's last workboard check. Enables freshness evidence."),
      previous_snapshot: { type: 'object', description: 'Optional prior snapshot payload for drift comparison.', additionalProperties: true },
    }, ['agent_id'])),
    tool('task_lifecycle_obligations', 'List directed obligations for an agent (review requests, etc.).', objectSchema({
      agent_id: stringSchema('Agent id to query obligations for.'),
      status: stringSchema('Filter by status: open, completed, rejected. Defaults to open.'),
    }, ['agent_id'])),
    tool('task_lifecycle_inspect', 'Deep-inspect a task: lifecycle state, evidence summary, assignment, obligations, and reports.', objectSchema({ task_number: numberSchema('Task number to inspect.') }, ['task_number'])),
    tool('task_lifecycle_evidence_preflight', 'Report finish/admission requirements and exact remediation before closeout. Does not mutate task state.', objectSchema({ task_number: numberSchema('Task number to check before finish.') }, ['task_number'])),
    tool('task_lifecycle_self_certification_preflight', 'Validate self-certification guard metadata for task/CAPA/evidence/chapter/final-summary surfaces without mutating authority state.', objectSchema({
      self_certification: { type: 'object', description: 'Self-certification guard packet. Fields include target_category, subject_principal, actor_principal, requires_independent_review, reviewer_eligibility_ref, independent_review_ref, operator_acceptance_ref, misleading_completion_answer, allowed_pending_state, closure_state.', additionalProperties: true },
      surface: stringSchema('Surface being checked, e.g. task_lifecycle_finish, task_lifecycle_review, task_lifecycle_close, evidence_admission, capa_closeout, operator_final_summary.'),
      summary: stringSchema('Optional summary/final text to include in target and terminal-claim detection.'),
      body: stringSchema('Optional body/chapter/packet text to include in target and terminal-claim detection.'),
      actor_principal: stringSchema('Optional actor/closer/reviewer principal if not already in the packet.'),
      terminal_correction_claim: { type: 'boolean', description: 'Set true when the surface would assert terminal correction/closure.' },
    }, ['self_certification'])),
    tool('task_lifecycle_admit_evidence', 'Admit evidence for a task through the admission gate (report, verification, criteria).', objectSchema({
      task_number: numberSchema('Task number to admit evidence for.'),
      agent_id: stringSchema('Agent id performing the admission.'),
      self_certification: { type: 'object', description: 'Optional self-certification guard packet for closure-sensitive architect-failure/deception/trust evidence.', additionalProperties: true },
    }, ['task_number', 'agent_id'])),
    tool('task_lifecycle_prove_criteria', 'Auto-check all acceptance criteria in the task body and run evidence admission.', objectSchema({
      task_number: numberSchema('Task number to prove criteria for.'),
      agent_id: stringSchema('Agent id performing the proof.'),
    }, ['task_number', 'agent_id'])),
    tool('task_lifecycle_closeout', 'Readable alias for task_lifecycle_disposition_closeout. Mutates task notes, inbox disposition evidence, criteria, and finish state only when requested by arguments.', dispositionCloseoutSchema()),
    tool('task_lifecycle_disposition_closeout', 'Prepare or complete a lightweight inbox-disposition close-out: resolve envelope status, write execution/verification notes, optionally prove criteria and finish, and return task-owned changed files.', objectSchema({
      task_number: numberSchema('Task number to close out.'),
      agent_id: stringSchema('Agent id performing the close-out.'),
      envelope_id: stringSchema('Optional envelope id. If omitted, the task body is scanned for env_<id>.'),
      disposition: stringSchema('Optional disposition label, e.g. already_promoted, acknowledged, dismissed, no_code.'),
      summary: stringSchema('Optional close-out summary.'),
      dry_run: { type: 'boolean', description: 'Plan without writing task notes or finishing.' },
      prove_criteria: { type: 'boolean', description: 'Auto-check criteria after writing notes. Default false.' },
      finish: { type: 'boolean', description: 'Finish the task after writing/proving. Default false.' },
      changed_files: arraySchema(stringSchema('Repo-relative changed file path.'), 'Explicit changed-file evidence for the optional finish report.'),
      no_files_changed: { type: 'boolean', description: 'Explicitly declare that the optional finish legitimately changed no files.' },
    }, ['task_number', 'agent_id'])),
    tool('task_lifecycle_closeout_from_payload', 'Payload-ref-first helper for long closeout submissions. Create an immutable payload with task_number, agent_id, summary/disposition, and optional finish evidence, then call this helper with only payload_ref.', objectSchema({
      payload_ref: stringSchema('Required immutable transient payload ref carrying task_lifecycle_disposition_closeout arguments.'),
    }, ['payload_ref'])),
    tool('task_lifecycle_disposition_closeout_from_payload', 'Readable alias for task_lifecycle_closeout_from_payload.', objectSchema({
      payload_ref: stringSchema('Required immutable transient payload ref carrying task_lifecycle_disposition_closeout arguments.'),
    }, ['payload_ref'])),
    tool('task_lifecycle_audit', 'Timeline of recent task lifecycle events: claims, reports, reviews, admissions, closes.', objectSchema({
      since: stringSchema('ISO timestamp start. Defaults to 24 hours ago.'),
      until: stringSchema('ISO timestamp end. Defaults to now.'),
    })),
    tool('task_lifecycle_submit_report', 'Readable alias for task_lifecycle_finish. For claimed tasks, submit a finish report without verdict using summary plus changed_files or no_files_changed; verdict is only for review-state tasks.', finishSchema()),
    tool('task_lifecycle_finish', 'Finish a claimed task by submitting a report without verdict using summary plus changed_files or no_files_changed. Review verdicts are only valid for in_review tasks.', finishSchema()),
    tool('task_lifecycle_finish_from_payload', 'Payload-ref-first helper for long finish/report submissions. Create an immutable payload with task_number, agent_id, summary, changed_files/no_files_changed, and optional guard packets, then call this helper with only payload_ref.', objectSchema({
      payload_ref: stringSchema('Required immutable transient payload ref carrying task_lifecycle_finish arguments.'),
    }, ['payload_ref'])),
    tool('task_lifecycle_submit_report_from_payload', 'Readable alias for task_lifecycle_finish_from_payload.', objectSchema({
      payload_ref: stringSchema('Required immutable transient payload ref carrying task_lifecycle_finish arguments.'),
    }, ['payload_ref'])),
    tool('task_lifecycle_close', 'Close a task. Requires the task to be in a closable state.', objectSchema({
      task_number: numberSchema('Task number to close.'),
      agent_id: stringSchema('Agent id closing the task.'),
      mode: stringSchema('Closure mode: operator_direct, peer_reviewed, agent_finish, emergency. Defaults to agent_finish.'),
      no_continuation_needed: stringSchema('Rationale for closing without a continuation task (for design-only/spike tasks).'),
      self_certification: { type: 'object', description: 'Optional self-certification guard packet for architect-failure/deception/trust closeout.', additionalProperties: true },
    }, ['task_number', 'agent_id'])),
    tool('task_lifecycle_tombstone', 'Terminally drop/retire a task record without claiming completion. Requires operator-direct authority, records tombstone metadata, releases any active assignment, and closes with closure_mode=tombstone.', objectSchema({
      task_number: numberSchema('Task number to tombstone/drop.'),
      agent_id: stringSchema('Agent id recording the tombstone.'),
      reason: stringSchema('Required reason for terminal record retirement.'),
      disposition: stringSchema('Tombstone disposition: tombstoned, wrong_site, handoff_created, quarantined_pending_destination, advisory_retained, or duplicate_suppressed.'),
      metadata: { type: 'object', description: 'Optional tombstone metadata: source_task_ref, destination_site, handoff_ref, evidence_ref, authority_ref, residual_status.', additionalProperties: true },
      authority_basis: authorityBasisSchema('Required operator-direct authority basis for tombstoning.'),
    }, ['task_number', 'agent_id', 'reason', 'authority_basis'])),
    tool('task_lifecycle_search', 'Search tasks by title or content.', objectSchema({
      query: stringSchema('Search query string.'),
      status: stringSchema('Optional status filter.'),
      limit: numberSchema('Maximum results; defaults to 20.'),
    }, ['query'])),
    tool('task_lifecycle_related', 'Find tasks related to a given task by tag overlap. Returns semantically similar tasks based on shared terms extracted from title, goal, and context.', objectSchema({
      task_number: numberSchema('Task number to find related tasks for.'),
      limit: numberSchema('Maximum results; defaults to 8.'),
    }, ['task_number'])),
    tool('task_lifecycle_defer', 'Defer a task. Only valid from opened or in_review status.', objectSchema({
      task_number: numberSchema('Task number to defer.'),
      agent_id: stringSchema('Agent id deferring the task.'),
      reason: stringSchema('Optional reason for deferral.'),
    }, ['task_number', 'agent_id'])),
    tool('task_lifecycle_un_defer', 'Un-defer a deferred task. Restores unassigned tasks to opened and actively assigned tasks to claimed without changing the assignment.', objectSchema({
      task_number: numberSchema('Task number to un-defer.'),
      agent_id: stringSchema('Agent id performing the un-defer action.'),
      reason: stringSchema('Optional reason for un-deferral.'),
      authority_basis: authorityBasisSchema('Required when the active assignment belongs to a different agent.'),
    }, ['task_number', 'agent_id'])),
    tool('task_lifecycle_reopen', 'Reopen a closed or confirmed task.', objectSchema({
      task_number: numberSchema('Task number to reopen.'),
      agent_id: stringSchema('Agent id reopening the task.'),
      reason: stringSchema('Optional reason for reopening.'),
    }, ['task_number', 'agent_id'])),
    tool('task_lifecycle_review', 'Review a task in_review: accept, accept_with_notes, or reject. Response includes close_blocked when evidence admission blocks closure despite accepted review.', objectSchema({
      task_number: numberSchema('Task number to review.'),
      agent_id: stringSchema('Reviewer agent id.'),
      verdict: stringSchema('Verdict: accepted, accept_with_notes, rejected.'),
      findings: { type: 'array', description: 'Array of finding objects: {severity, description, location?}' },
      single_operator_review: { type: 'boolean', description: 'Set to true to allow and annotate a same-operator review (reviewer and finisher share operator_identity).' },
      self_certification: { type: 'object', description: 'Optional self-certification guard packet for architect-failure/deception/trust review.', additionalProperties: true },
    }, ['task_number', 'agent_id', 'verdict'])),
    tool('task_lifecycle_review_from_payload', 'Payload-ref-first helper for long review submissions. Create an immutable payload with task_number, agent_id, verdict, findings, and optional self_certification, then call this helper with only payload_ref.', objectSchema({
      payload_ref: stringSchema('Required immutable transient payload ref carrying task_lifecycle_review arguments.'),
    }, ['payload_ref'])),
    tool('task_lifecycle_record_observation', 'Readable alias for task_lifecycle_submit_observation. Writes a structured observation artifact; observation artifacts are context and do not satisfy verification gates by themselves.', submitObservationSchema()),
    tool('task_lifecycle_submit_observation', 'Submit an observation artifact attached to a task or as a general observation.', objectSchema({
      task_number: numberSchema('Optional task number to attach to.'),
      artifact_uri: { type: 'string' },
      content: { type: 'object', additionalProperties: true },
      source_operator: stringSchema('Source operator name.'),
      agent_id: stringSchema('Agent id.'),
    }, ['artifact_uri'])),
    tool('task_lifecycle_bridge_poll', 'Poll the inbox-to-task-lifecycle bridge: evaluate unprocessed envelopes and auto-materialize high-severity tasks.', objectSchema({
      dry_run: { type: 'boolean', description: 'If true, evaluate without creating tasks.' },
      threshold: numberSchema('Minimum severity to auto-materialize. Defaults to 50.'),
      limit: numberSchema('Maximum envelopes to evaluate. Defaults to 20.'),
    })),
    tool('task_lifecycle_inbox_target', 'Target one inbox envelope by envelope_id for bridge preview/materialization or explicit disposition without relying on broad bridge polling order.', objectSchema({
      envelope_id: stringSchema('Inbox envelope ID to inspect or disposition.'),
      dry_run: { type: 'boolean', description: 'If true, preview the targeted action without mutation.' },
      disposition: stringSchema('Disposition: materialize, acknowledge, already_routed, dismiss, defer, or preview. Defaults to materialize.'),
      principal: stringSchema('Principal recorded on disposition evidence.'),
      agent_id: stringSchema('Agent id used as fallback disposition principal.'),
      reason: stringSchema('Disposition reason; required for dismiss.'),
    }, ['envelope_id'])),
    tool('task_lifecycle_create', 'Create a new task from an immutable payload_ref carrying title, goal, context, required work, non-goals, acceptance criteria, and optional preferred/target roles.', objectSchema({
      payload_ref: stringSchema('Required immutable transient payload ref such as mcp_payload:<id>@v1. Payload must contain the task definition.'),
    }, ['payload_ref'])),
    tool('task_lifecycle_create_task_batch', 'Create multiple tasks plus an optional chapter index from one immutable payload_ref carrying chapter, shared, and tasks arrays.', objectSchema({
      payload_ref: stringSchema('Required immutable transient payload ref such as mcp_payload:<id>@v1. Payload must contain { chapter?, shared?, tasks, dry_run? }.'),
    }, ['payload_ref'])),
    ...listPayloadTools(),
    ...listCommandTools(),
    tool('task_lifecycle_recurring_create', 'Create a recurring task definition. Manual trigger remains the default; scheduled daily trigger metadata can be enabled for due-run automation.', objectSchema({
      title: stringSchema('Recurring task title.'),
      actor_agent_id: stringSchema('Architect/operator agent id creating the recurrence.'),
      authority_basis: authorityBasisSchema('Authority basis for creating the recurrence definition.'),
      goal: stringSchema('Task goal markdown used for generated instances.'),
      context: stringSchema('Task context markdown used for generated instances.'),
      required_work: stringSchema('Required work markdown used for generated instances.'),
      non_goals: stringSchema('Non-goals markdown used for generated instances.'),
      acceptance_criteria: { type: 'array', items: { type: 'string' }, description: 'Acceptance criteria template for generated task instances.' },
      evidence_requirements: { type: 'array', items: { type: 'string' }, description: 'Evidence expected from each generated run.' },
      target_role: stringSchema('Target role for generated task instances.'),
      preferred_role: stringSchema('Preferred role for generated task instances.'),
      trigger_description: stringSchema('Human-readable trigger condition.'),
      trigger_mode: stringSchema('Trigger mode: manual or schedule. Defaults to manual.'),
      schedule_kind: stringSchema('Schedule kind for trigger_mode=schedule. V1 supports daily.'),
      schedule_timezone: stringSchema('Schedule timezone metadata. V1 due calculation uses UTC; defaults to UTC.'),
      initial_status: stringSchema('Initial status: draft or active. Defaults to active.'),
    }, ['title', 'actor_agent_id', 'authority_basis'])),
    tool('task_lifecycle_recurring_run_due', 'Create due scheduled recurring task runs idempotently. V1 supports active daily UTC definitions and must be invoked by a sanctioned MCP/workloop surface.', objectSchema({
      actor_agent_id: stringSchema('Architect/operator agent id invoking due-run automation.'),
      authority_basis: authorityBasisSchema('Authority basis for the automated due-run sweep.'),
      current_time: stringSchema('Optional ISO timestamp used for due calculation. Defaults to now.'),
      limit: numberSchema('Maximum due runs to create. Defaults to 20.'),
    }, ['actor_agent_id', 'authority_basis'])),
    tool('task_lifecycle_recurring_show', 'Show a recurring task definition and recent generated runs.', objectSchema({
      recurrence_id: stringSchema('Recurring task definition id.'),
      include_runs: { type: 'boolean', description: 'Include generated runs. Defaults true.' },
    }, ['recurrence_id'])),
    tool('task_lifecycle_recurring_list', 'List recurring task definitions.', objectSchema({
      status: stringSchema('Optional status filter: draft, active, suspended, retired.'),
      limit: numberSchema('Maximum definitions to return. Defaults to 50.'),
    })),
    tool('task_lifecycle_recurring_suspend', 'Suspend an active or draft recurring task definition.', objectSchema({
      recurrence_id: stringSchema('Recurring task definition id.'),
      actor_agent_id: stringSchema('Architect/operator agent id suspending the recurrence.'),
      authority_basis: authorityBasisSchema('Authority basis for suspending the recurrence definition.'),
      reason: stringSchema('Suspension reason.'),
    }, ['recurrence_id', 'actor_agent_id', 'authority_basis', 'reason'])),
    tool('task_lifecycle_recurring_retire', 'Retire a recurring task definition.', objectSchema({
      recurrence_id: stringSchema('Recurring task definition id.'),
      actor_agent_id: stringSchema('Architect/operator agent id retiring the recurrence.'),
      authority_basis: authorityBasisSchema('Authority basis for retiring the recurrence definition.'),
      reason: stringSchema('Retirement reason.'),
    }, ['recurrence_id', 'actor_agent_id', 'authority_basis', 'reason'])),
    tool('task_lifecycle_recurring_trigger', 'Manually trigger a recurring task definition and create one normal opened task instance.', objectSchema({
      recurrence_id: stringSchema('Recurring task definition id.'),
      actor_agent_id: stringSchema('Architect/operator agent id triggering the recurrence.'),
      authority_basis: authorityBasisSchema('Authority basis for manually triggering the recurrence.'),
      run_reason: stringSchema('Reason for this run.'),
    }, ['recurrence_id', 'actor_agent_id', 'authority_basis', 'run_reason'])),
    tool('task_lifecycle_recurring_runs', 'List generated runs for a recurring task definition.', objectSchema({
      recurrence_id: stringSchema('Recurring task definition id.'),
      limit: numberSchema('Maximum runs to return. Defaults to 20.'),
    }, ['recurrence_id'])),
    tool('task_lifecycle_set_routing', 'Route an opened task to a target role, preferred agent, and/or relative priority without claiming it as that agent.', objectSchema({
      task_number: numberSchema('Task number to route. Must currently be opened.'),
      actor_agent_id: stringSchema('Architect/operator agent id performing the routing mutation.'),
      target_role: nullableStringSchema('Optional target role. Pass null to clear.'),
      preferred_agent_id: nullableStringSchema('Optional preferred agent id. Pass null to clear.'),
      relative_priority: numberSchema('Optional relative priority for workboard ranking.'),
      reason: stringSchema('Reason/authority basis for the routing change.'),
    }, ['task_number', 'actor_agent_id', 'reason'])),
    tool('task_lifecycle_chapter_upsert', 'Create or update a durable chapter definition without changing task lifecycle state.', objectSchema({
      chapter_id: stringSchema('Stable chapter identifier.'),
      title: stringSchema('Chapter title.'),
      actor_agent_id: stringSchema('Agent creating or updating the chapter definition.'),
      owner_agent_id: stringSchema('Optional chapter owner agent.'),
      status: stringSchema('Chapter definition status. Defaults to active.'),
      summary_markdown: stringSchema('Optional authored chapter summary.'),
      source_kind: stringSchema('Source kind for the definition. Defaults to mcp.'),
      source_ref: stringSchema('Optional source reference.'),
    }, ['chapter_id', 'title', 'actor_agent_id'])),
    tool('task_lifecycle_chapter_add_task', 'Add or update ordered chapter membership for one existing task without mutating the task.', objectSchema({
      chapter_id: stringSchema('Stable chapter identifier.'),
      task_number: numberSchema('Existing task number to add.'),
      actor_agent_id: stringSchema('Agent adding the membership.'),
      order_index: numberSchema('Optional chapter order index. Defaults to append.'),
      membership_kind: stringSchema('Membership kind. Defaults to primary.'),
      note_markdown: stringSchema('Optional membership note.'),
      source_kind: stringSchema('Source kind for the membership. Defaults to mcp.'),
      source_ref: stringSchema('Optional source reference.'),
    }, ['chapter_id', 'task_number', 'actor_agent_id'])),
    tool('task_lifecycle_chapter_show', 'Show one chapter with membership, owner, status projection, and task summaries.', objectSchema({
      chapter_id: stringSchema('Stable chapter identifier.'),
      include_sources: { type: 'boolean', description: 'Include source-record metadata. Defaults false.' },
    }, ['chapter_id'])),
    tool('task_lifecycle_chapter_list', 'List chapter definitions with computed status summaries.', objectSchema({
      limit: numberSchema('Maximum chapters to return. Defaults to 50, max 100.'),
    })),
    tool('task_lifecycle_chapter_import_markdown', 'Import/link an existing markdown chapter index as advisory source text and ordered task memberships.', objectSchema({
      chapter_id: stringSchema('Stable chapter identifier.'),
      title: stringSchema('Chapter title.'),
      path: stringSchema('Markdown index path to preserve and parse for task references.'),
      actor_agent_id: stringSchema('Agent importing the advisory source.'),
      owner_agent_id: stringSchema('Optional chapter owner agent.'),
      summary_markdown: stringSchema('Optional authored chapter summary.'),
    }, ['chapter_id', 'title', 'path', 'actor_agent_id'])),
    tool('task_lifecycle_route_task_set', 'Bulk-route a governed task set selected by chapter, explicit numbers, range, title prefix, and optional status filter.', objectSchema({
      actor_agent_id: stringSchema('Architect/operator agent id performing the routing mutation.'),
      reason: stringSchema('Reason/authority basis for the routing change.'),
      chapter_id: stringSchema('Optional chapter id selector.'),
      task_numbers: arraySchema(numberSchema('Task number.'), 'Optional explicit task numbers.'),
      range_start: numberSchema('Optional inclusive range start.'),
      range_end: numberSchema('Optional inclusive range end.'),
      title_prefix: stringSchema('Optional task title prefix selector.'),
      status_filter: stringSchema('Optional lifecycle status filter after selector expansion.'),
      target_role: nullableStringSchema('Optional target role. Pass null to clear.'),
      preferred_agent_id: nullableStringSchema('Optional preferred agent id. Pass null to clear.'),
      relative_priority: numberSchema('Optional relative priority for workboard ranking.'),
      dry_run: { type: 'boolean', description: 'Preview without mutation. Defaults false.' },
      allow_partial: { type: 'boolean', description: 'Apply routable tasks even when other selected tasks are blocked or missing. Defaults false.' },
    }, ['actor_agent_id', 'reason'])),
    tool('task_lifecycle_test_mcp_tool', 'Spawn a fresh MCP server process and invoke a single tool to verify code changes without restarting the live session server.', objectSchema({
      server_path: stringSchema('Path to the MCP server script relative to site root (e.g., "tools/task-lifecycle/task-mcp-server.mjs").'),
      tool_name: stringSchema('Tool name to invoke on the spawned server.'),
      arguments: { type: 'object', additionalProperties: true, description: 'Tool arguments object.' },
      timeout_seconds: numberSchema('Fresh server invocation timeout in seconds. Defaults to 10, max 300.'),
    }, ['server_path', 'tool_name'])),
    tool('task_lifecycle_replay_test_evidence', 'Author and submit a governed test replay command for architect review evidence using only approved Test MCP targets.', objectSchema({
      agent_id: stringSchema('Agent id requesting the replay.'),
      task_number: numberSchema('Optional task number under review. Required when evidence_ref is omitted.'),
      evidence_ref: stringSchema('Optional prior evidence ref being replayed. Required when task_number is omitted.'),
      selector: stringSchema('Approved selector: task-lifecycle, typed-mcp, operator-surface, or all. Mutually exclusive with test_id/path.'),
      test_id: stringSchema('Approved Test MCP registered test id. Mutually exclusive with selector/path.'),
      path: stringSchema('Approved repository-local test path. Mutually exclusive with selector/test_id.'),
      timeout_seconds: numberSchema('Per-test timeout in seconds. Defaults to 120, max 300.'),
      authority_basis: authorityBasisSchema('Optional authority basis for the replay command.'),
    }, ['agent_id'])),
    tool('task_lifecycle_run_tests', 'Run an approved test selector through Test MCP and record structured test evidence on a task.', objectSchema({
      selector: stringSchema('Test selector: task-lifecycle, typed-mcp, operator-surface, or all. Defaults to task-lifecycle.'),
      task_number: numberSchema('Task number to attach structured test evidence to.'),
      agent_id: stringSchema('Agent id running the tests.'),
      timeout_seconds: numberSchema('Per-test timeout in seconds. Defaults to 120, max 300.'),
    }, ['agent_id'])),
  ];
}

function tool(name, description, inputSchema) {
  return { name, description, inputSchema };
}

function objectSchema(properties, required = []) {
  return { type: 'object', properties, additionalProperties: false, ...(required.length > 0 ? { required } : {}) };
}

function stringSchema(description) {
  return { type: 'string', description };
}

function enumStringSchema(values, description) {
  return { type: 'string', enum: values, description };
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

function dispositionCloseoutSchema() {
  return objectSchema({
    task_number: numberSchema('Task number to close out.'),
    agent_id: stringSchema('Agent id performing the close-out.'),
    envelope_id: stringSchema('Optional envelope id. If omitted, the task body is scanned for env_<id>.'),
    disposition: stringSchema('Optional disposition label, e.g. already_promoted, acknowledged, dismissed, no_code.'),
    summary: stringSchema('Optional close-out summary.'),
    dry_run: { type: 'boolean', description: 'Plan without writing task notes or finishing.' },
    prove_criteria: { type: 'boolean', description: 'Auto-check criteria after writing notes. Default false.' },
    finish: { type: 'boolean', description: 'Finish the task after writing/proving. Default false.' },
    changed_files: arraySchema(stringSchema('Repo-relative changed file path.'), 'Explicit changed-file evidence for the optional finish report.'),
    no_files_changed: { type: 'boolean', description: 'Explicitly declare that the optional finish legitimately changed no files.' },
  }, ['task_number', 'agent_id']);
}

function finishSchema() {
  return objectSchema({
    task_number: numberSchema('Task number to finish.'),
    agent_id: stringSchema('Agent id finishing the task.'),
    summary: stringSchema('Finish summary.'),
    verdict: enumStringSchema(['accepted', 'accepted_with_notes', 'rejected'], 'Review-state verdict only. Omit for claimed-state finish/report submission; claimed tasks should use summary plus changed_files or no_files_changed.'),
    changed_files: arraySchema(stringSchema('Repo-relative changed file path.'), 'Explicit changed-file evidence for this finish report.'),
    no_files_changed: { type: 'boolean', description: 'Explicitly declare that this finish legitimately changed no files.' },
    recovery_truthfulness: { type: 'object', description: 'Required for serious-failure recovery finish/report claims. Fields: known_facts, inferences, uncertainty, changed, not_changed, remaining_work, evidence_limits, capa_open_status, state. terminal_corrected additionally requires repository_durability / commit-push state plus no open residual work.', additionalProperties: true },
    self_certification: { type: 'object', description: 'Required for architect-failure/deception/trust same-subject terminal correction claims. Fields: target_category, subject_principal, requires_independent_review, misleading_completion_answer, allowed_pending_state, plus independent_review_ref/reviewer_eligibility_ref or operator_acceptance_ref for terminal same-subject correction.', additionalProperties: true },
  }, ['task_number', 'agent_id']);
}

function arraySchema(items, description) {
  return { type: 'array', items, description };
}

function submitObservationSchema() {
  return objectSchema({
    task_number: numberSchema('Optional task number to attach to.'),
    artifact_uri: { type: 'string' },
    content: { type: 'object', additionalProperties: true },
    source_operator: stringSchema('Source operator name.'),
    agent_id: stringSchema('Agent id.'),
  }, ['artifact_uri']);
}

function nullableStringSchema(description) {
  return { type: 'string', nullable: true, description };
}

function numberSchema(description) {
  return { type: 'number', description };
}
