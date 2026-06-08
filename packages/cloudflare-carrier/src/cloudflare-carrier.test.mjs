import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  TOOL_EFFECT_ADMISSION_CASES_SCHEMA,
  validateSessionEvent,
} from '../../carrier-protocol/src/carrier-protocol.mjs';
import worker, {
  authenticateCarrierRequest,
  classifyCloudflareAuthorityCommandState,
  classifyCloudflareEvidenceCommandState,
  classifyCloudflareMembershipCommandState,
  classifyCloudflareOperationCommandState,
  classifyCloudflareSessionCommandState,
  classifyCloudflareSiteCommandState,
  classifyCloudflareTaskCommandState,
  classifyCloudflareTaskLifecycleWriteAdmission,
  classifyCloudflareToolEffectAdmission,
  CloudflareCarrierDurableObject,
  createCloudflareToolEffectAdapter,
} from './cloudflare-worker.mjs';
import {
  CloudflareCarrierRouter,
  CloudflareCarrierSession,
  classifyCloudflareCarrierControl,
  expectedObserverEventKindsForInput,
  isTerminalState,
} from './cloudflare-carrier.mjs';

const inputPipelineCases = JSON.parse(readFileSync(new URL('../../carrier-protocol/fixtures/carrier-input-pipeline-cases.json', import.meta.url), 'utf8'));
const directiveEmitterRegistryCases = JSON.parse(readFileSync(new URL('../../carrier-protocol/fixtures/carrier-directive-emitter-registry-cases.json', import.meta.url), 'utf8'));
const toolEffectAdmissionCases = JSON.parse(readFileSync(new URL('../../carrier-protocol/fixtures/tool-effect-admission-cases.json', import.meta.url), 'utf8'));

function clock() {
  return '2026-06-06T00:00:00.000Z';
}

function startRequest(extra = {}) {
  return {
    operation: 'session.start',
    request_id: 'request_start_1',
    principal: { principal_id: 'operator.fixture' },
    params: {
      carrier_session_id: 'carrier_session_cloudflare_fixture',
      agent_id: 'narada.fixture.agent',
      site_id: 'site_fixture',
      site_root: 'cloudflare://site_fixture',
      site_ref: 'site://fixture',
    },
    ...extra,
  };
}

function inputRequest(input, extra = {}) {
  return {
    operation: 'carrier.input.deliver',
    request_id: `request_${input.event_id}`,
    carrier_session_id: 'carrier_session_cloudflare_fixture',
    params: { input },
    ...extra,
  };
}

function commandRequest(command, args = [], extra = {}) {
  return {
    operation: 'carrier.command.execute',
    request_id: `request_command_${String(command).replace(/[^a-z0-9]+/gi, '_')}_${args.join('_')}`,
    carrier_session_id: 'carrier_session_cloudflare_fixture',
    principal: { principal_id: 'operator.fixture' },
    params: { command, args },
    ...extra,
  };
}

function startedSession() {
  const router = new CloudflareCarrierRouter({ now: clock });
  const start = router.handle(startRequest());
  assert.equal(start.ok, true);
  return { router, session: router.sessions.get('carrier_session_cloudflare_fixture') };
}

function eventKinds(response) {
  return (response.events ?? [response.event]).filter(Boolean).map((event) => event.event_kind);
}

function assertValidEvents(response) {
  for (const event of (response.events ?? [response.event]).filter(Boolean)) {
    assert.deepEqual(validateSessionEvent(event), [], event.event_kind);
  }
}

test('cloudflare operation command state classifies focus, scope, evidence, and triage actions', () => {
  const cases = [
    [{}, { command_state: 'scope_needed', command_action: 'read_operation_scope', next_action: 'select_or_create_operation' }],
    [{ operation_id: 'operation_1', is_active: false, scope_loaded: false }, { command_state: 'scope_needed', command_action: 'read_operation_scope', next_action: 'use_focused_operation' }],
    [{ operation_id: 'operation_1', is_active: true, scope_loaded: false }, { command_state: 'scope_needed', command_action: 'read_operation_scope', next_action: 'read_operation_scope' }],
    [{ operation_id: 'operation_1', is_active: true, scope_loaded: true, session_count: 0, operation_path_next_action: 'start_or_select_session' }, { command_state: 'session_needed', command_action: 'start_or_select_session', next_action: 'start_or_select_session' }],
    [{ operation_id: 'operation_1', is_active: true, scope_loaded: true, session_count: 1, evidence_loaded: false, operation_path_next_action: 'read_operation_evidence' }, { command_state: 'evidence_needed', command_action: 'read_operation_evidence', next_action: 'read_operation_evidence' }],
    [{ operation_id: 'operation_1', is_active: true, scope_loaded: true, session_count: 1, evidence_loaded: true, operation_path_next_action: 'inspect_operation_evidence' }, { command_state: 'evidence_ready', command_action: 'inspect_operation_evidence', next_action: 'inspect_operation_evidence' }],
    [{ operation_id: 'operation_1', is_active: true, scope_loaded: true, session_count: 1, evidence_loaded: true, operation_path_next_action: 'inspect_attention' }, { command_state: 'attention_required', command_action: 'inspect_attention', next_action: 'inspect_operation_evidence' }],
    [{ operation_id: 'operation_1', is_active: true, scope_loaded: true, session_count: 1, evidence_loaded: true, operation_path_next_action: 'inspect_open_task' }, { command_state: 'task_work_open', command_action: 'inspect_open_task', next_action: 'inspect_operation_evidence' }],
  ];
  for (const [input, expected] of cases) {
    assert.deepEqual(classifyCloudflareOperationCommandState(input), expected);
  }
});

test('cloudflare task lifecycle write admission keeps Windows mutation authority until cutover', () => {
  const shadow = classifyCloudflareTaskLifecycleWriteAdmission({ mutation_class: 'shadow_read_record' });
  assert.equal(shadow.action, 'admit');
  assert.equal(shadow.reason, 'shadow_read_projection_admitted');
  assert.equal(shadow.write_effect, 'none');
  assert.equal(shadow.cloudflare_write_admission, 'not_admitted');

  for (const mutationClass of ['task_create', 'task_claim', 'task_report', 'task_finish', 'changed_file_evidence', 'task_projection_write', 'task_source_state_write', 'task_sqlite_write']) {
    const decision = classifyCloudflareTaskLifecycleWriteAdmission({ mutation_class: mutationClass });
    assert.equal(decision.action, 'refuse');
    assert.equal(decision.reason, 'windows_task_lifecycle_mutation_authority_retained');
    assert.equal(decision.mutation_authority, 'windows_task_lifecycle_sqlite');
    assert.equal(decision.write_effect, 'none');
    assert.match(decision.required_evidence.join(' '), /cutover_point_recorded/);
  }

  const admittedCreate = classifyCloudflareTaskLifecycleWriteAdmission({
    mutation_class: 'task_create',
    cloudflare_task_create_cutover: true,
    cutover_point_ref: 'cutover:task-create:v1',
    governed_write_contract_ref: 'contract:task-create:v1',
    confirmation_evidence_ref: 'evidence:operator-check',
  });
  assert.equal(admittedCreate.action, 'admit');
  assert.equal(admittedCreate.reason, 'cloudflare_task_create_cutover_admitted');
  assert.equal(admittedCreate.authority_locus, 'cloudflare_carrier_site');
  assert.equal(admittedCreate.mutation_authority, 'cloudflare_task_lifecycle_d1');
  assert.equal(admittedCreate.cloudflare_write_admission, 'admitted');
  assert.equal(admittedCreate.write_effect, 'task_lifecycle_create');

  const admittedClaim = classifyCloudflareTaskLifecycleWriteAdmission({
    mutation_class: 'task_claim',
    task_id: 'cloudflare-task-lifecycle-1',
    claimant_agent_id: 'agent-cloudflare',
    cloudflare_task_claim_cutover: true,
    assignment_authority_ref: 'assignment-authority:task-claim:v1',
    cutover_point_ref: 'cutover:task-claim:v1',
    governed_write_contract_ref: 'contract:task-claim:v1',
    confirmation_evidence_ref: 'evidence:operator-check:task-claim',
  });
  assert.equal(admittedClaim.action, 'admit');
  assert.equal(admittedClaim.reason, 'cloudflare_task_claim_cutover_admitted');
  assert.equal(admittedClaim.authority_locus, 'cloudflare_carrier_site');
  assert.equal(admittedClaim.mutation_authority, 'cloudflare_task_lifecycle_d1');
  assert.equal(admittedClaim.cloudflare_write_admission, 'admitted');
  assert.equal(admittedClaim.write_effect, 'task_lifecycle_claim');
  assert.equal(admittedClaim.assignment_authority_ref, 'assignment-authority:task-claim:v1');
  assert.equal(admittedClaim.conflict_policy, 'opened_only_no_overwrite');
  assert.deepEqual(admittedClaim.retained_windows_authority, [
    'task_lifecycle_sqlite_mutation_store',
    'task_report_evidence_transition',
    'task_finish_verdict_transition',
    'changed_file_evidence_transition',
    'task_projection_write_transition',
  ]);

  const admittedReport = classifyCloudflareTaskLifecycleWriteAdmission({
    mutation_class: 'task_report',
    task_id: 'cloudflare-task-lifecycle-1',
    reporter_agent_id: 'agent-cloudflare',
    summary: 'completed work',
    cloudflare_task_report_cutover: true,
    report_authority_ref: 'report-authority:task-report:v1',
    report_schema_ref: 'schema:work-result-report:v1',
    changed_file_evidence_boundary_ref: 'boundary:changed-file-evidence:not-admitted',
    cutover_point_ref: 'cutover:task-report:v1',
    governed_write_contract_ref: 'contract:task-report:v1',
    confirmation_evidence_ref: 'evidence:operator-check:task-report',
  });
  assert.equal(admittedReport.action, 'admit');
  assert.equal(admittedReport.reason, 'cloudflare_task_report_cutover_admitted');
  assert.equal(admittedReport.authority_locus, 'cloudflare_carrier_site');
  assert.equal(admittedReport.mutation_authority, 'cloudflare_task_lifecycle_d1');
  assert.equal(admittedReport.cloudflare_write_admission, 'admitted');
  assert.equal(admittedReport.write_effect, 'task_lifecycle_report');
  assert.equal(admittedReport.report_authority_ref, 'report-authority:task-report:v1');
  assert.equal(admittedReport.changed_file_evidence_boundary_ref, 'boundary:changed-file-evidence:not-admitted');
  assert.equal(admittedReport.conflict_policy, 'claimed_only_report_no_overwrite');
  assert.deepEqual(admittedReport.retained_windows_authority, [
    'task_lifecycle_sqlite_mutation_store',
    'task_finish_verdict_transition',
    'changed_file_evidence_transition',
    'task_projection_write_transition',
  ]);

  const admittedFinish = classifyCloudflareTaskLifecycleWriteAdmission({
    mutation_class: 'task_finish',
    task_id: 'cloudflare-task-lifecycle-1',
    finalizer_agent_id: 'agent-cloudflare',
    finish_verdict: 'accepted',
    cloudflare_task_finish_cutover: true,
    finish_authority_ref: 'finish-authority:task-finish:v1',
    finish_schema_ref: 'schema:task-finish-acceptance:v1',
    cutover_point_ref: 'cutover:task-finish:v1',
    governed_write_contract_ref: 'contract:task-finish:v1',
    confirmation_evidence_ref: 'evidence:operator-check:task-finish',
  });
  assert.equal(admittedFinish.action, 'admit');
  assert.equal(admittedFinish.reason, 'cloudflare_task_finish_cutover_admitted');
  assert.equal(admittedFinish.authority_locus, 'cloudflare_carrier_site');
  assert.equal(admittedFinish.mutation_authority, 'cloudflare_task_lifecycle_d1');
  assert.equal(admittedFinish.cloudflare_write_admission, 'admitted');
  assert.equal(admittedFinish.write_effect, 'task_lifecycle_finish');
  assert.equal(admittedFinish.finish_authority_ref, 'finish-authority:task-finish:v1');
  assert.equal(admittedFinish.finish_schema_ref, 'schema:task-finish-acceptance:v1');
  assert.equal(admittedFinish.finish_verdict, 'accepted');
  assert.equal(admittedFinish.conflict_policy, 'closed_report_only_finish_no_overwrite');
  assert.deepEqual(admittedFinish.retained_windows_authority, [
    'task_lifecycle_sqlite_mutation_store',
    'changed_file_evidence_transition',
    'task_projection_write_transition',
  ]);

  const admittedChangedFileEvidence = classifyCloudflareTaskLifecycleWriteAdmission({
    mutation_class: 'changed_file_evidence',
    task_id: 'cloudflare-task-lifecycle-1',
    report_id: 'cloudflare-task-lifecycle-report-1',
    file_path: 'packages/cloudflare-carrier/src/cloudflare-worker.mjs',
    reporter_agent_id: 'agent-cloudflare',
    cloudflare_changed_file_evidence_cutover: true,
    file_evidence_authority_ref: 'file-evidence-authority:changed-file:v1',
    file_material_source_ref: 'material-source:git-diff-summary:v1',
    repository_authority_ref: 'repository-authority:narada:v1',
    cutover_point_ref: 'cutover:changed-file-evidence:v1',
    governed_write_contract_ref: 'contract:changed-file-evidence:v1',
    confirmation_evidence_ref: 'evidence:operator-check:changed-file-evidence',
  });
  assert.equal(admittedChangedFileEvidence.action, 'admit');
  assert.equal(admittedChangedFileEvidence.reason, 'cloudflare_changed_file_evidence_cutover_admitted');
  assert.equal(admittedChangedFileEvidence.write_effect, 'changed_file_evidence_record');
  assert.equal(admittedChangedFileEvidence.filesystem_mutation_admission, 'not_admitted');
  assert.equal(admittedChangedFileEvidence.repository_publication_admission, 'not_admitted');
  assert.equal(admittedChangedFileEvidence.projection_write_admission, 'not_admitted');
  assert.deepEqual(admittedChangedFileEvidence.retained_windows_authority, [
    'task_lifecycle_sqlite_mutation_store',
    'task_finish_verdict_transition',
    'task_projection_write_transition',
  ]);

  const admittedProjectionWrite = classifyCloudflareTaskLifecycleWriteAdmission({
    mutation_class: 'task_projection_write',
    task_id: 'cloudflare-task-lifecycle-1',
    cloudflare_task_projection_write_cutover: true,
    projection_target_ref: 'projection-target:cloudflare-task-lifecycle-read-model:v1',
    projection_schema_ref: 'schema:cloudflare-task-lifecycle-read-model:v1',
    projection_authority_ref: 'projection-authority:task-lifecycle:v1',
    source_evidence_ref: 'source-evidence:cloudflare-task-lifecycle-row:v1',
    cutover_point_ref: 'cutover:task-projection-write:v1',
    governed_write_contract_ref: 'contract:task-projection-write:v1',
    confirmation_evidence_ref: 'evidence:operator-check:task-projection-write',
  });
  assert.equal(admittedProjectionWrite.action, 'admit');
  assert.equal(admittedProjectionWrite.reason, 'cloudflare_task_projection_write_cutover_admitted');
  assert.equal(admittedProjectionWrite.write_effect, 'task_lifecycle_projection_write');
  assert.equal(admittedProjectionWrite.projection_write_admission, 'admitted');
  assert.equal(admittedProjectionWrite.sqlite_mutation_admission, 'not_admitted');
  assert.equal(admittedProjectionWrite.projection_filesystem_mutation_admission, 'not_admitted');
  assert.equal(admittedProjectionWrite.projection_repository_publication_admission, 'not_admitted');
  assert.deepEqual(admittedProjectionWrite.retained_windows_authority, [
    'task_lifecycle_sqlite_mutation_store',
  ]);

  const admittedSourceStateWrite = classifyCloudflareTaskLifecycleWriteAdmission({
    mutation_class: 'task_source_state_write',
    task_id: 'cloudflare-task-lifecycle-1',
    cloudflare_task_source_state_write_cutover: true,
    source_state_authority_ref: 'source-state-authority:task-lifecycle:v1',
    source_state_schema_ref: 'schema:task-lifecycle-source-state:v1',
    source_state_evidence_ref: 'source-state-evidence:cloudflare-task-lifecycle-row:v1',
    cutover_point_ref: 'cutover:task-source-state-write:v1',
    governed_write_contract_ref: 'contract:task-source-state-write:v1',
    confirmation_evidence_ref: 'evidence:operator-check:task-source-state-write',
  });
  assert.equal(admittedSourceStateWrite.action, 'admit');
  assert.equal(admittedSourceStateWrite.reason, 'cloudflare_task_source_state_write_cutover_admitted');
  assert.equal(admittedSourceStateWrite.write_effect, 'task_lifecycle_source_state_write');
  assert.equal(admittedSourceStateWrite.source_state_write_admission, 'admitted');
  assert.equal(admittedSourceStateWrite.source_state_write_schema, 'narada.sonar.cloudflare_task_lifecycle_source_state_write.v1');
  assert.equal(admittedSourceStateWrite.source_state_authority_ref, 'source-state-authority:task-lifecycle:v1');
  assert.equal(admittedSourceStateWrite.source_state_schema_ref, 'schema:task-lifecycle-source-state:v1');
  assert.equal(admittedSourceStateWrite.source_state_evidence_ref, 'source-state-evidence:cloudflare-task-lifecycle-row:v1');
  assert.equal(admittedSourceStateWrite.windows_sqlite_source_write_admission, 'not_admitted');
  assert.equal(admittedSourceStateWrite.source_state_filesystem_mutation_admission, 'not_admitted');
  assert.equal(admittedSourceStateWrite.source_state_repository_publication_admission, 'not_admitted');
  assert.deepEqual(admittedSourceStateWrite.retained_windows_authority, []);

  const unknown = classifyCloudflareTaskLifecycleWriteAdmission({ mutation_class: 'surprise_write' });
  assert.equal(unknown.action, 'refuse');
  assert.equal(unknown.reason, 'unknown_task_lifecycle_mutation_class');
});

test('cloudflare authority command state classifies authority loading, refusals, locus, and evidence', () => {
  const cases = [
    [{}, { command_state: 'authority_needed', command_action: 'read_site_authority', next_action: 'read_site_authority' }],
    [{ decision_count: 2, refusal_count: 1, unresolved_locus_count: 0, evidence_loaded: true }, { command_state: 'refusal_requires_review', command_action: 'inspect_refused_authority', next_action: 'inspect_refused_authority' }],
    [{ decision_count: 2, refusal_count: 0, unresolved_locus_count: 1, evidence_loaded: true }, { command_state: 'locus_unresolved', command_action: 'resolve_authority_locus', next_action: 'resolve_authority_locus' }],
    [{ decision_count: 2, refusal_count: 0, unresolved_locus_count: 0, evidence_loaded: false }, { command_state: 'evidence_needed', command_action: 'focus_authority_evidence', next_action: 'focus_authority_evidence' }],
    [{ decision_count: 2, refusal_count: 0, unresolved_locus_count: 0, evidence_loaded: true }, { command_state: 'admissions_monitoring', command_action: 'monitor_authority_admissions', next_action: 'monitor_authority_admissions' }],
  ];
  for (const [input, expected] of cases) {
    assert.deepEqual(classifyCloudflareAuthorityCommandState(input), expected);
  }
});

test('cloudflare session command state classifies focus and evidence readiness', () => {
  const cases = [
    [{}, { command_state: 'session_needed', command_action: 'select_or_start_session', next_action: 'select_or_start_session' }],
    [{ session_id: 'carrier_session_1', is_active: false, evidence_loaded: false }, { command_state: 'session_focus_needed', command_action: 'use_focused_session', next_action: 'use_focused_session' }],
    [{ session_id: 'carrier_session_1', is_active: true, evidence_loaded: false }, { command_state: 'evidence_needed', command_action: 'read_session_evidence', next_action: 'read_session_evidence' }],
    [{ session_id: 'carrier_session_1', is_active: true, evidence_loaded: true }, { command_state: 'evidence_ready', command_action: 'inspect_session_evidence', next_action: 'inspect_session_evidence' }],
  ];
  for (const [input, expected] of cases) {
    assert.deepEqual(classifyCloudflareSessionCommandState(input), expected);
  }
});

test('cloudflare task command state classifies lifecycle and evidence readiness', () => {
  const cases = [
    [{}, { lifecycle: 'unknown', command_state: 'task_needed', command_action: 'select_task', next_action: 'select_task' }],
    [{ task_id: 'cloudflare-task-1', status: 'open', evidence_count: 0 }, { lifecycle: 'open', command_state: 'task_work_open', command_action: 'mark_done_or_update', next_action: 'mark_done_or_update' }],
    [{ task_id: 'cloudflare-task-1', status: 'done', evidence_count: 0 }, { lifecycle: 'closed', command_state: 'evidence_needed', command_action: 'reopen_or_inspect_evidence', next_action: 'reopen_or_inspect_evidence' }],
    [{ task_id: 'cloudflare-task-1', status: 'done', evidence_count: 2 }, { lifecycle: 'closed', command_state: 'evidence_ready', command_action: 'reopen_or_inspect_evidence', next_action: 'reopen_or_inspect_evidence' }],
    [{ task_id: 'cloudflare-task-1', status: 'blocked', evidence_count: 1 }, { lifecycle: 'blocked', command_state: 'status_needs_normalization', command_action: 'normalize_status_or_update', next_action: 'normalize_status_or_update' }],
  ];
  for (const [input, expected] of cases) {
    assert.deepEqual(classifyCloudflareTaskCommandState(input), expected);
  }
});

test('cloudflare evidence command state classifies lane, target, and next action', () => {
  const cases = [
    [
      { event_kind: 'tool_result_received', carrier_session_id: 'carrier_session_1', payload: { status: 'failed', tool_name: 'cloudflare_carrier_task_update' } },
      { lane: 'failures', target_type: 'tool_effect', target_ref: 'cloudflare_carrier_task_update', command_state: 'failure_requires_review', command_action: 'inspect_failure_and_retry_or_escalate', next_action: 'inspect_failure_and_retry_or_escalate' },
    ],
    [
      { event_kind: 'tool_result_received', payload: { status: 'ok', result_summary: '{"task":{"task_id":"cloudflare-task-7"}}' } },
      { parsed_task_id: 'cloudflare-task-7' },
      { lane: 'tools', target_type: 'task', target_ref: 'cloudflare-task-7', command_state: 'tool_effect_review', command_action: 'inspect_tool_effect', next_action: 'inspect_tool_effect' },
    ],
    [
      { event_kind: 'site_authority_decision_recorded', payload: { site_authority_decision: { action: 'refuse', mutation_class: 'site_membership_update' } } },
      { lane: 'authority', target_type: 'authority', target_ref: 'site_membership_update', command_state: 'authority_locus_review', command_action: 'inspect_authority_locus', next_action: 'inspect_authority_locus' },
    ],
    [
      { event_kind: 'directive_emitted', payload: { directive_id: 'directive_1' } },
      { lane: 'directives', target_type: 'attention', target_ref: 'directive_1', command_state: 'directive_requires_resolution', command_action: 'resolve_or_acknowledge_directive', next_action: 'resolve_or_acknowledge_directive' },
    ],
    [
      { event_kind: 'provider_request_recorded', payload: { provider: 'cloudflare-workers-ai' } },
      { lane: 'provider', target_type: 'evidence', target_ref: 'provider_request_recorded', command_state: 'provider_turn_review', command_action: 'inspect_provider_turn', next_action: 'inspect_provider_turn' },
    ],
    [
      { event_kind: 'input_admitted_to_turn', carrier_session_id: 'carrier_session_1', payload: {} },
      { lane: 'input', target_type: 'session', target_ref: 'carrier_session_1', command_state: 'input_lifecycle_trace', command_action: 'trace_input_lifecycle', next_action: 'trace_input_lifecycle' },
    ],
  ];
  for (const entry of cases) {
    const [event, optionsOrExpected, maybeExpected] = entry;
    const options = maybeExpected ? optionsOrExpected : {};
    const expected = maybeExpected || optionsOrExpected;
    assert.deepEqual(classifyCloudflareEvidenceCommandState(event, options), expected);
  }
});

test('cloudflare site command state classifies site scope, membership, operation, and authority readiness', () => {
  const cases = [
    [{}, { command_state: 'site_needed', command_action: 'select_site', next_action: 'select_site' }],
    [{ site_id: 'site_1', scope_loaded: false }, { command_state: 'scope_needed', command_action: 'read_site_scope', next_action: 'read_site_scope' }],
    [{ site_id: 'site_1', scope_loaded: true, membership_count: 0 }, { command_state: 'membership_needed', command_action: 'load_or_create_membership', next_action: 'load_or_create_membership' }],
    [{ site_id: 'site_1', scope_loaded: true, membership_count: 1, operation_count: 0 }, { command_state: 'operation_needed', command_action: 'create_or_select_operation', next_action: 'create_or_select_operation' }],
    [{ site_id: 'site_1', scope_loaded: true, membership_count: 1, operation_count: 1, authority_count: 0 }, { command_state: 'authority_needed', command_action: 'read_site_authority', next_action: 'read_site_authority' }],
    [{ site_id: 'site_1', scope_loaded: true, membership_count: 1, operation_count: 1, authority_count: 2 }, { command_state: 'site_operations_ready', command_action: 'inspect_site_operations', next_action: 'inspect_site_operations' }],
  ];
  for (const [input, expected] of cases) {
    assert.deepEqual(classifyCloudflareSiteCommandState(input), expected);
  }
});

test('cloudflare membership command state classifies principal, site scope, membership, and authority readiness', () => {
  const cases = [
    [{}, { command_state: 'principal_needed', command_action: 'enter_principal', next_action: 'enter_principal' }],
    [{ principal: 'p1', site_loaded: false }, { command_state: 'site_scope_needed', command_action: 'read_membership_site', next_action: 'read_membership_site' }],
    [{ principal: 'p1', site_loaded: true, known: false }, { command_state: 'membership_write_needed', command_action: 'put_membership', next_action: 'put_membership' }],
    [{ principal: 'p1', site_loaded: true, known: true, status: 'inactive', authority_loaded: true }, { command_state: 'membership_inactive', command_action: 'inspect_inactive_membership', next_action: 'inspect_inactive_membership' }],
    [{ principal: 'p1', site_loaded: true, known: true, status: 'active', authority_loaded: false }, { command_state: 'authority_needed', command_action: 'focus_membership_authority', next_action: 'focus_membership_authority' }],
    [{ principal: 'p1', site_loaded: true, known: true, status: 'active', authority_loaded: true }, { command_state: 'membership_authority_monitoring', command_action: 'monitor_membership_authority', next_action: 'monitor_membership_authority' }],
  ];
  for (const [input, expected] of cases) {
    assert.deepEqual(classifyCloudflareMembershipCommandState(input), expected);
  }
});

test('session.start creates one durable session with identity and version evidence', () => {
  const router = new CloudflareCarrierRouter({ now: clock });
  const response = router.handle(startRequest());
  assert.equal(response.ok, true);
  assert.equal(response.carrier_session_id, 'carrier_session_cloudflare_fixture');
  assert.equal(response.event.sequence, 1);
  assert.equal(response.event.event_kind, 'carrier_session_started');
  assert.equal(response.event.agent_id, 'narada.fixture.agent');
  assert.equal(response.event.payload.protocol_version, 'narada.carrier.v1');
  assert.equal(response.event.payload.runtime_contract_version, 'narada.carrier.runtime.v1');
  assertValidEvents(response);

  const status = router.handle({ operation: 'session.status', carrier_session_id: 'carrier_session_cloudflare_fixture' });
  assert.equal(status.carrier_kind, 'cloudflare-carrier');
  assert.equal(status.carrier_host, 'cloudflare-durable-object');
  assert.equal(status.provider_adapter_posture, 'refused');
  assert.equal(status.tool_effect_posture, 'unconfigured');
  assert.equal(status.tool_effect_adapter_kind, null);
  assert.deepEqual(status.tool_effect_supported_tools, []);
  assert.deepEqual(status.tool_effect_capabilities, []);
  assert.equal(status.schema_fixture_compatibility, 'carrier-input-pipeline-cases.v1');
});

test('session.start and input delivery are idempotent by request id', () => {
  const { router } = startedSession();
  const firstStartEventCount = router.sessions.get('carrier_session_cloudflare_fixture').events.length;
  const repeatedStart = router.handle(startRequest());
  assert.equal(repeatedStart.ok, true);
  assert.equal(router.sessions.get('carrier_session_cloudflare_fixture').events.length, firstStartEventCount);

  const input = inputPipelineCases.cases[0].input;
  const first = router.handle(inputRequest(input));
  const afterFirst = router.sessions.get('carrier_session_cloudflare_fixture').events.length;
  const second = router.handle(inputRequest(input));
  assert.deepEqual(second, first);
  assert.equal(router.sessions.get('carrier_session_cloudflare_fixture').events.length, afterFirst);
});

test('observer fixture cases produce shared pipeline event kinds plus terminal completion', () => {
  for (const fixtureCase of inputPipelineCases.cases.filter((entry) => entry.expected.admission_event_kinds.some((kind) => kind.startsWith('observer_')))) {
    const { router } = startedSession();
    if (fixtureCase.state.observerMuted) router.handle(commandRequest('/observer mute', [], { request_id: `request_mute_${fixtureCase.name}` }));
    const response = router.handle(inputRequest(fixtureCase.input, { request_id: `request_${fixtureCase.name}` }));
    assert.equal(response.ok, true, fixtureCase.name);
    assertValidEvents(response);
    const expected = [
      ...expectedObserverEventKindsForInput(fixtureCase.input, fixtureCase.state),
      'input_completed',
    ];
    assert.deepEqual(eventKinds(response), expected, fixtureCase.name);
    assert.equal(isTerminalState(response.terminal_state), true, fixtureCase.name);
  }
});

test('record-only operation heartbeat directive records acceptance without provider turn', () => {
  const fixtureCase = inputPipelineCases.cases.find((entry) => entry.name === 'operation_heartbeat_system_directive_record_only');
  assert.ok(fixtureCase);
  const { router } = startedSession();
  const response = router.handle(inputRequest(fixtureCase.input, { request_id: 'request_operation_heartbeat' }));
  assert.equal(response.ok, true);
  assert.equal(response.terminal_state, 'completed_without_provider');
  assertValidEvents(response);
  assert.deepEqual(eventKinds(response), [
    'directive_receipt_recorded',
    'directive_carrier_accepted_recorded',
    'input_completed',
  ]);
  assert.equal(response.events.some((event) => event.event_kind === 'turn_started'), false);
  assert.equal(response.events.some((event) => event.event_kind === 'provider_request_recorded'), false);
  assert.equal(response.events[0].payload.directive_kind, 'operation_heartbeat');
});

test('operation heartbeat emitter records emission evidence and routes through input delivery', () => {
  const { router } = startedSession();
  const response = router.handle({
    operation: 'directive.heartbeat.emit',
    request_id: 'request_emit_operation_heartbeat_1',
    carrier_session_id: 'carrier_session_cloudflare_fixture',
    principal: { principal_id: 'operator.fixture' },
    params: {
      operation_id: 'operation_fixture_control',
      input_event_id: 'input_operation_heartbeat_emit_1',
      directive_id: 'dir_operation_heartbeat_emit_1',
    },
  });
  assert.equal(response.ok, true);
  assert.equal(response.terminal_state, 'completed_without_provider');
  assert.equal(response.input_event_id, 'input_operation_heartbeat_emit_1');
  assert.equal(response.directive_id, 'dir_operation_heartbeat_emit_1');
  assertValidEvents(response);
  assert.deepEqual(eventKinds(response), [
    'directive_emission_authorized',
    'directive_emission_rule_recorded',
    'directive_emitted',
    'directive_receipt_recorded',
    'directive_carrier_accepted_recorded',
    'input_completed',
  ]);
  assert.equal(response.events[2].payload.input_event_id, 'input_operation_heartbeat_emit_1');
  assert.equal(response.events[3].payload.input_event_id, 'input_operation_heartbeat_emit_1');
  assert.equal(response.events.some((event) => event.event_kind === 'turn_started'), false);
  assert.equal(response.events.some((event) => event.event_kind === 'provider_request_recorded'), false);

  const repeated = router.handle({
    operation: 'directive.heartbeat.emit',
    request_id: 'request_emit_operation_heartbeat_2',
    carrier_session_id: 'carrier_session_cloudflare_fixture',
    params: {
      operation_id: 'operation_fixture_control',
      input_event_id: 'input_operation_heartbeat_emit_2',
      directive_id: 'dir_operation_heartbeat_emit_2',
    },
  });
  assert.deepEqual(eventKinds(repeated), [
    'directive_emitted',
    'directive_receipt_recorded',
    'directive_carrier_accepted_recorded',
    'input_completed',
  ]);
});

test('registered directive emitter routes operation attention through input delivery', () => {
  const fixtureCase = directiveEmitterRegistryCases.cases.find((entry) => entry.name === 'operation_attention_runtime_trigger_operator_visible_operation_target');
  const { router } = startedSession();
  const response = router.handle({
    operation: 'directive.emit',
    request_id: 'request_emit_operation_attention_1',
    carrier_session_id: 'carrier_session_cloudflare_fixture',
    principal: { principal_id: 'operator.fixture' },
    params: {
      directive_kind: fixtureCase.directive_kind,
      operation_id: fixtureCase.operation_id,
      input_event_id: 'input_operation_attention_emit_1',
      directive_id: 'dir_operation_attention_emit_1',
      target: fixtureCase.target,
    },
  });
  assert.equal(response.ok, true);
  assert.equal(response.directive_kind, fixtureCase.directive_kind);
  assert.equal(response.terminal_state, 'completed_without_provider');
  assertValidEvents(response);
  assert.deepEqual(eventKinds(response), [
    'directive_emission_authorized',
    'directive_emission_rule_recorded',
    'directive_emitted',
    'directive_receipt_recorded',
    'directive_carrier_accepted_recorded',
    'input_completed',
  ]);
  assert.equal(response.rule.visibility, fixtureCase.expected.default_visibility);
  assert.equal(response.rule.trigger_kind, fixtureCase.expected.trigger_kind);
  assert.deepEqual(response.rule.target, fixtureCase.target);
  assert.equal(response.events[2].payload.directive_kind, fixtureCase.directive_kind);
  assert.equal(response.events[2].payload.trigger_kind, fixtureCase.expected.trigger_kind);
  assert.equal(response.events.some((event) => event.event_kind === 'turn_started'), false);
});

test('registered directive emitter reports suppression without delivery events', () => {
  const { router } = startedSession();
  const response = router.handle({
    operation: 'directive.emit',
    request_id: 'request_emit_operation_attention_disabled',
    carrier_session_id: 'carrier_session_cloudflare_fixture',
    params: {
      directive_kind: 'operation_attention',
      enabled: false,
      target: { kind: 'operation', id: 'operation_fixture_control' },
    },
  });
  assert.deepEqual(response, {
    ok: false,
    operation: 'directive.emit',
    code: 'directive_emission_disabled',
    directive_kind: 'operation_attention',
  });
});

test('goal command supports show set pause resume and clear', () => {
  const { router } = startedSession();
  let response = router.handle(commandRequest('/goal', ['stabilize', 'carrier']));
  assert.equal(response.ok, true);
  assert.equal(response.event.payload.details.goal.text, 'stabilize carrier');
  assert.equal(response.event.payload.details.goal.state, 'active');

  response = router.handle(commandRequest('/goal', ['pause']));
  assert.equal(response.event.payload.details.goal.state, 'paused');

  response = router.handle(commandRequest('/goal', ['resume']));
  assert.equal(response.event.payload.details.goal.state, 'active');

  response = router.handle(commandRequest('/goal', ['show']));
  assert.equal(response.event.payload.details.goal.text, 'stabilize carrier');

  response = router.handle(commandRequest('/goal', ['clear']));
  assert.equal(response.event.payload.details.goal.text, null);
  assert.equal(response.event.payload.details.goal.state, 'unset');
});

test('observer mute command suppresses interjections but record-only remains observation evidence', () => {
  const { router } = startedSession();
  router.handle(commandRequest('/observer mute'));
  assert.equal(router.handle({ operation: 'session.status', carrier_session_id: 'carrier_session_cloudflare_fixture' }).observer_interjections_muted, true);

  const mutedVisible = inputPipelineCases.cases.find((entry) => entry.name === 'muted_conversation_observer_suppressed');
  const visibleResponse = router.handle(inputRequest(mutedVisible.input, { request_id: 'request_muted_visible' }));
  assert.deepEqual(eventKinds(visibleResponse), [
    'input_queued_for_turn_boundary',
    'observer_observation_recorded',
    'observer_interjection_proposed',
    'observer_interjection_suppressed',
    'input_completed',
  ]);

  const recordOnlyInput = {
    ...mutedVisible.input,
    event_id: 'input_record_only_cloudflare_1',
    metadata: {
      observer: {
        role: 'observer',
        rule_id: 'record-only-check',
        visibility: 'record_only',
      },
    },
  };
  const recordOnlyResponse = router.handle(inputRequest(recordOnlyInput, { request_id: 'request_record_only' }));
  assert.deepEqual(eventKinds(recordOnlyResponse), [
    'input_queued_for_turn_boundary',
    'observer_observation_recorded',
    'input_completed',
  ]);
});

test('unsupported host command emits rejection evidence', () => {
  const { router } = startedSession();
  const response = router.handle(commandRequest('host.command', [], {
    request_id: 'request_host_unsupported',
    params: {
      command: 'host.command',
      target: 'native_shell',
      command_text: 'rm -rf /',
    },
  }));
  assert.equal(response.terminal_state, 'rejected');
  assert.deepEqual(eventKinds(response), ['carrier_host_command_requested', 'carrier_host_command_rejected']);
  assert.equal(response.events[1].payload.admission_reason, 'unsupported_cloudflare_host_command_target');
});

test('provider-unavailable posture records terminal failure evidence', () => {
  const { router } = startedSession();
  const input = inputPipelineCases.cases.find((entry) => entry.name === 'manual_operator_admitted').input;
  const response = router.handle(inputRequest(input, { request_id: 'request_provider_refused' }));
  assert.equal(response.terminal_state, 'failed');
  assert.deepEqual(eventKinds(response), [
    'input_admitted_to_turn',
    'turn_started',
    'provider_request_recorded',
    'turn_failed',
    'input_completed',
  ]);
  const providerEvent = response.events.find((event) => event.event_kind === 'provider_request_recorded');
  assert.equal(providerEvent.payload.provider_execution_enabled, false);
  assert.equal(providerEvent.payload.provider_request_status, 'refused');
  assertValidEvents(response);
});

test('event reads return ordered events by sequence cursor', () => {
  const { router } = startedSession();
  router.handle(commandRequest('/goal', ['stabilize']));
  router.handle(commandRequest('/observer mute'));
  const read = router.handle({
    operation: 'session.events.read',
    carrier_session_id: 'carrier_session_cloudflare_fixture',
    params: { after_sequence: 1, limit: 2 },
  });
  assert.equal(read.ok, true);
  assert.deepEqual(read.events.map((event) => event.sequence), [2, 3]);
  assert.equal(read.next_cursor, 3);
});

test('status reconstructs compact state from durable session object', () => {
  const { router } = startedSession();
  router.handle(commandRequest('/goal', ['stabilize']));
  router.handle(commandRequest('/observer mute'));
  const session = router.sessions.get('carrier_session_cloudflare_fixture');
  const reconstructed = CloudflareCarrierSession.fromSnapshot(session.snapshot(), { now: clock });
  assert.equal(session.status().goal.text, 'stabilize');
  assert.equal(session.status().observer_interjections_muted, true);
  assert.equal(reconstructed.status().goal.text, 'stabilize');
  assert.equal(reconstructed.status().observer_interjections_muted, true);
  assert.deepEqual(reconstructed.readEvents({ after_sequence: 0 }).events, session.readEvents({ after_sequence: 0 }).events);
});

test('durable object facade stores and reloads session snapshot', async () => {
  const storage = fakeStorage();
  const firstObject = new CloudflareCarrierDurableObject({ storage });
  const start = await firstObject.handle(startRequest());
  assert.equal(start.ok, true);
  await firstObject.handle(commandRequest('/goal', ['stabilize']));

  const secondObject = new CloudflareCarrierDurableObject({ storage });
  const status = await secondObject.handle({
    operation: 'session.status',
    carrier_session_id: 'carrier_session_cloudflare_fixture',
  });
  assert.equal(status.goal.text, 'stabilize');
  assert.equal(status.next_event_sequence, 3);
});

test('durable object alarm emits operation heartbeat directive through input delivery', async () => {
  const storage = fakeStorage();
  const durableObject = new CloudflareCarrierDurableObject({ storage }, {
    NARADA_OPERATION_HEARTBEAT_DIRECTIVE_INTERVAL_MS: '60000',
  });
  const request = startRequest({ request_id: 'request_alarm_heartbeat_start' });
  request.params = { ...request.params, operation_id: 'operation_alarm_heartbeat' };
  const start = await durableObject.handle(request);
  assert.equal(start.ok, true);
  assert.equal(storage.alarms().length, 1);

  await durableObject.alarm();

  const read = await durableObject.handle({
    operation: 'session.events.read',
    carrier_session_id: 'carrier_session_cloudflare_fixture',
    params: { after_sequence: 0, limit: 50 },
  });
  const kinds = read.events.map((event) => event.event_kind);
  assert.deepEqual(kinds.slice(1), [
    'directive_emission_authorized',
    'directive_emission_rule_recorded',
    'directive_emitted',
    'directive_receipt_recorded',
    'directive_carrier_accepted_recorded',
    'input_completed',
  ]);
  assert.equal(kinds.includes('turn_started'), false);
  assert.equal(kinds.includes('provider_request_recorded'), false);
  assert.equal(read.events[3].payload.directive_kind, 'operation_heartbeat');
  assert.equal(read.events[3].payload.cadence, 'PT1M');
  assert.equal(read.events[4].payload.input_event_id, read.events[3].payload.input_event_id);
  assert.equal(storage.alarms().length, 2);
});

test('durable object facade serializes mutations while provider work is pending', async () => {
  const storage = fakeStorage();
  const providerEntered = deferred();
  const providerGate = deferred();
  const durableObject = new CloudflareCarrierDurableObject({ storage }, {
    AI: {
      async run() {
        providerEntered.resolve();
        await providerGate.promise;
        return { response: 'provider completed after held gate' };
      },
    },
  });
  await durableObject.handle(startRequest());
  const input = {
    ...inputPipelineCases.cases.find((entry) => entry.name === 'manual_operator_admitted').input,
    event_id: 'input_provider_gate_ordered_lane_1',
    content: 'Hold provider turn open while another mutation arrives.',
  };

  const inputPromise = durableObject.handle(inputRequest(input, { request_id: 'request_provider_gate_ordered_lane_1' }));
  await providerEntered.promise;
  let commandSettled = false;
  const commandPromise = durableObject.handle(commandRequest('/goal', ['after', 'provider'], { request_id: 'request_goal_after_provider_gate' }))
    .then((response) => {
      commandSettled = true;
      return response;
    });
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(commandSettled, false);

  providerGate.resolve();
  const [inputResponse, commandResponse] = await Promise.all([inputPromise, commandPromise]);
  assert.equal(inputResponse.terminal_state, 'completed');
  assert.equal(commandResponse.event.event_kind, 'carrier_command_executed');
  assert.equal(commandResponse.event.sequence > inputResponse.events.at(-1).sequence, true);

  const read = await durableObject.handle({
    operation: 'session.events.read',
    carrier_session_id: 'carrier_session_cloudflare_fixture',
    params: { after_sequence: 0, limit: 50 },
  });
  assert.deepEqual(read.events.map((event) => event.sequence), read.events.map((_, index) => index + 1));
  assert.equal(read.events.at(-1).event_kind, 'carrier_command_executed');
});

test('worker export routes requests by carrier session durable object binding', async () => {
  const namespace = fakeDurableObjectNamespace();
  const env = authEnv(namespace);
  const start = await worker.fetch(jsonRequest(startRequest(), { token: 'test-admin-token' }), env);
  assert.equal(start.status, 200);
  const startBody = await start.json();
  assert.equal(startBody.principal.email, 'admin@system');
  assert.equal(startBody.event.payload.principal.email, 'admin@system');

  const goal = await worker.fetch(jsonRequest(commandRequest('/goal', ['route', 'through', 'worker']), { token: 'test-admin-token' }), env);
  assert.equal(goal.status, 200);
  const goalBody = await goal.json();
  assert.equal(goalBody.principal.email, 'admin@system');
  assert.equal(goalBody.event.payload.principal.email, 'admin@system');

  const status = await worker.fetch(jsonRequest({
    operation: 'session.status',
    carrier_session_id: 'carrier_session_cloudflare_fixture',
  }, { token: 'test-admin-token' }), env);
  assert.equal(status.status, 200);
  const statusBody = await status.json();
  assert.equal(statusBody.goal.text, 'route through worker');
  assert.equal(statusBody.reader_principal.email, 'admin@system');
});

test('worker validates session.start site binding through configured Cloudflare site registry', async () => {
  const siteDb = fakeD1SiteRegistryDatabase({
    sites: [{
      site_id: 'site_fixture',
      site_ref: 'site://fixture',
      display_name: 'Fixture Site',
      status: 'active',
      created_at: clock(),
      updated_at: clock(),
      created_by_principal_id: 'admin',
    }],
    memberships: [{
      site_id: 'site_fixture',
      principal_id: 'admin',
      role: 'owner',
      status: 'active',
      created_at: clock(),
      updated_at: clock(),
    }],
  });
  const namespace = fakeDurableObjectNamespace();
  const env = authEnv(namespace, { CLOUDFLARE_SITE_REGISTRY_DB: siteDb });
  const start = await worker.fetch(jsonRequest(startRequest({ request_id: 'request_registry_bound_start' }), { token: 'test-admin-token' }), env);
  assert.equal(start.status, 200);
  const startBody = await start.json();
  assert.equal(startBody.event.payload.site_binding_evidence.schema, 'narada.cloudflare_site_registry.v1');
  assert.equal(startBody.event.payload.site_binding_evidence.action, 'admit');
  assert.equal(startBody.event.payload.site_binding_evidence.site_id, 'site_fixture');
  assert.equal(startBody.event.payload.site_authority_decision.action, 'admit');
  assert.equal(startBody.event.payload.site_authority_decision.mutation_class, 'hosted_carrier_session_events');
  assert.equal(startBody.event.payload.site_authority_decision.authority_locus_kind, 'cloudflare_carrier_session_event_store');
  assert.equal(siteDb.dump().carrierSessions[0].carrier_session_id, 'carrier_session_cloudflare_fixture');
});

test('worker rejects session.start when configured site registry denies binding', async () => {
  const siteDb = fakeD1SiteRegistryDatabase();
  const namespace = fakeDurableObjectNamespace();
  const env = authEnv(namespace, { CLOUDFLARE_SITE_REGISTRY_DB: siteDb });
  const start = await worker.fetch(jsonRequest(startRequest({ request_id: 'request_registry_denied_start' }), { token: 'test-admin-token' }), env);
  assert.equal(start.status, 403);
  const startBody = await start.json();
  assert.equal(startBody.code, 'carrier_site_binding_denied');
  assert.equal(startBody.site_registry_code, 'site_not_found');
  assert.equal(startBody.principal.email, 'admin@system');
  assert.equal(siteDb.dump().authorityEvents[0].event_kind, 'carrier_site_binding_rejected');
  assert.equal(siteDb.dump().authorityEvents[0].action, 'deny');
});

test('worker site.read composes site sessions tasks authority events and carrier evidence', async () => {
  const siteDb = fakeD1SiteRegistryDatabase({
    sites: [{
      site_id: 'site_fixture',
      site_ref: 'site://fixture',
      display_name: 'Fixture Site',
      status: 'active',
      created_at: clock(),
      updated_at: clock(),
      created_by_principal_id: 'admin',
    }],
    memberships: [{
      site_id: 'site_fixture',
      principal_id: 'admin',
      role: 'owner',
      status: 'active',
      created_at: clock(),
      updated_at: clock(),
    }],
  });
  const taskDb = fakeD1TaskDatabase();
  const durableEnv = { CLOUDFLARE_CARRIER_ENABLE_TASK_TOOLS: '1', CLOUDFLARE_CARRIER_TASK_DB: taskDb };
  const namespace = fakeDurableObjectNamespace(durableEnv);
  const env = authEnv(namespace, { CLOUDFLARE_SITE_REGISTRY_DB: siteDb, CLOUDFLARE_CARRIER_TASK_DB: taskDb });

  const operationCreate = await worker.fetch(jsonRequest({
    operation: 'operation.create',
    request_id: 'request_site_read_operation_create',
    params: {
      site_id: 'site_fixture',
      operation_id: 'operation_site_read',
      display_name: 'Site Read Operation',
      operation_kind: 'control',
      status: 'active',
    },
  }, { token: 'test-admin-token', path: '/api/carrier' }), env);
  assert.equal(operationCreate.status, 200);
  const start = await worker.fetch(jsonRequest(startRequest({
    request_id: 'request_site_read_start',
    params: {
      carrier_session_id: 'carrier_session_cloudflare_fixture',
      agent_id: 'narada.fixture.agent',
      site_id: 'site_fixture',
      site_root: 'cloudflare://site_fixture',
      site_ref: 'site://fixture',
      operation_id: 'operation_site_read',
    },
  }), { token: 'test-admin-token' }), env);
  assert.equal(start.status, 200);
  const taskCreate = await worker.fetch(jsonRequest(commandRequest('/task', ['create', 'site', 'read', 'task'], { request_id: 'request_site_read_task_create' }), { token: 'test-admin-token' }), env);
  assert.equal(taskCreate.status, 200);

  const read = await worker.fetch(jsonRequest({
    operation: 'site.read',
    request_id: 'request_site_read_overview',
    params: { site_id: 'site_fixture', carrier_event_limit: 10 },
  }, { token: 'test-admin-token', path: '/api/carrier' }), env);
  assert.equal(read.status, 200);
  const body = await read.json();
  assert.equal(body.site.site_id, 'site_fixture');
  assert.equal(body.membership.role, 'owner');
  assert.equal(body.sessions[0].carrier_session_id, 'carrier_session_cloudflare_fixture');
  assert.equal(body.tasks[0].title, 'site read task');
  assert.equal(body.authority_events.some((event) => event.event_kind === 'carrier_site_binding_admitted'), true);
  assert.equal(body.carrier_evidence[0].carrier_session_id, 'carrier_session_cloudflare_fixture');
  assert.equal(body.carrier_evidence[0].events.some((event) => event.event_kind === 'carrier_session_started'), true);
  assert.equal(body.carrier_evidence_read_status.schema, 'narada.cloudflare_carrier_evidence_read_status.v1');
  assert.equal(body.carrier_evidence_read_status.state, 'loaded');
  assert.equal(body.carrier_evidence_read_status.session_count, 1);
  assert.equal(body.carrier_evidence_read_status.readable_session_count, 1);
  assert.equal(body.carrier_evidence_read_status.failed_session_count, 0);
  assert.equal(body.carrier_evidence_read_status.missing_session_count, 0);
  assert.equal(body.carrier_evidence_read_status.event_count, body.carrier_evidence[0].events.length);
  assert.equal(body.cloudflare_persistence_posture.schema, 'narada.cloudflare_persistence_posture.v1');
  assert.equal(body.cloudflare_persistence_posture.state, 'durable');
  assert.equal(body.cloudflare_persistence_posture.site_id, 'site_fixture');
  assert.equal(body.cloudflare_persistence_posture.active_boundary_count, 4);
  assert.equal(body.cloudflare_persistence_posture.missing_boundaries.length, 0);
  assert.equal(body.cloudflare_persistence_posture.next_action, 'monitor_persistence_posture');
  assert.equal(body.cloudflare_persistence_posture.durable_boundaries.some((boundary) => boundary.key === 'session_snapshot'), true);
  assert.equal(body.cloudflare_persistence_posture.durable_boundaries.some((boundary) => boundary.key === 'carrier_evidence_index'), true);
  assert.equal(body.cloudflare_recovery_posture.schema, 'narada.cloudflare_recovery_posture.v1');
  assert.equal(body.cloudflare_recovery_posture.state, 'reconstructable');
  assert.equal(body.cloudflare_recovery_posture.snapshot_reload, 'available');
  assert.equal(body.cloudflare_recovery_posture.evidence_replay, 'loaded');
  assert.equal(body.cloudflare_recovery_posture.evidence_sources.includes('cloudflare-durable-object'), true);
  assert.equal(body.cloudflare_recovery_posture.recovery_gaps.length, 0);
  assert.equal(body.cloudflare_recovery_posture.next_action, 'monitor_recovery_posture');
  assert.equal(body.reader_principal.email, 'admin@system');
  assert.equal(body.site_authority.map.schema, 'narada.site_authority_map.v1');
  assert.equal(body.site_authority.map.site_id, 'site_fixture');
  const membershipDecision = body.site_authority.decisions.find((decision) => decision.mutation_class === 'hosted_site_membership');
  assert.equal(membershipDecision.action, 'admit');
  assert.equal(membershipDecision.authority_locus_kind, 'cloudflare_site_registry');
  const localFilesystemDecision = body.site_authority.decisions.find((decision) => decision.mutation_class === 'local_repository_filesystem_mutation');
  assert.equal(localFilesystemDecision.action, 'refuse');
  assert.equal(localFilesystemDecision.reason, 'site_authority_embodiment_not_authoritative');
  assert.deepEqual(classifyCloudflareSessionCommandState({
    session_id: body.sessions[0].carrier_session_id,
    is_active: true,
    evidence_loaded: body.carrier_evidence[0].events.length > 0,
  }), { command_state: 'evidence_ready', command_action: 'inspect_session_evidence', next_action: 'inspect_session_evidence' });
  assert.deepEqual(classifyCloudflareTaskCommandState({
    task_id: body.tasks[0].task_id,
    status: body.tasks[0].status,
    evidence_count: body.carrier_evidence[0].events.filter((event) => JSON.stringify(event.payload || {}).includes(body.tasks[0].task_id)).length,
  }), { lifecycle: 'open', command_state: 'task_work_open', command_action: 'mark_done_or_update', next_action: 'mark_done_or_update' });
  assert.deepEqual(classifyCloudflareAuthorityCommandState({
    decision_count: body.site_authority.decisions.length,
    refusal_count: body.site_authority.decisions.filter((decision) => ['refuse', 'deny'].includes(decision.action)).length,
    unresolved_locus_count: body.site_authority.decisions.filter((decision) => !decision.authority_locus || decision.authority_locus === 'unresolved').length,
    evidence_loaded: body.authority_events.length > 0,
  }), { command_state: 'refusal_requires_review', command_action: 'inspect_refused_authority', next_action: 'inspect_refused_authority' });
  assert.deepEqual(classifyCloudflareEvidenceCommandState(body.carrier_evidence[0].events.find((event) => event.event_kind === 'carrier_session_started')), {
    lane: 'authority',
    target_type: 'authority',
    target_ref: 'hosted_carrier_session_events',
    command_state: 'authority_locus_review',
    command_action: 'inspect_authority_locus',
    next_action: 'inspect_authority_locus',
  });
  assert.equal(body.site_continuity.binding.schema, 'narada.site_continuity_binding.v1');
  assert.equal(body.site_continuity.binding.site_id, 'site_fixture');
  const identityContinuity = body.site_continuity.decisions.find((decision) => decision.exchange_class === 'site_identity_binding');
  assert.equal(identityContinuity.action, 'admit');
  assert.equal(identityContinuity.relation_kind, 'same_site_embodiment');
  assert.equal(body.site_continuity.exchange_packet.schema, 'narada.site_continuity_exchange_packet.v1');
  assert.equal(body.site_continuity.exchange_packet.source_embodiment_kind, 'cloudflare_carrier');
  assert.equal(body.site_continuity.exchange_packet.target_embodiment_kind, 'local_windows');
  assert.equal(body.site_continuity.exchange_packet_admission.action, 'projection_only');
  const mutationExecutionContinuity = body.site_continuity.decisions.find((decision) => decision.exchange_class === 'cross_embodiment_mutation_execution');
  assert.equal(mutationExecutionContinuity.action, 'refuse');
  assert.equal(mutationExecutionContinuity.reason, 'site_continuity_cross_embodiment_mutation_execution_refused');
  assert.equal(body.site_product_status.schema, 'narada.cloudflare_site_product_status.v1');
  assert.equal(body.site_product_status.site_id, 'site_fixture');
  assert.equal(body.site_product_status.health, 'attention');
  assert.deepEqual(body.site_product_status.missing, ['continuity_packet']);
  assert.deepEqual(body.site_product_status.attention, ['open_tasks']);
  assert.equal(body.site_product_status.operation_count, 1);
  assert.equal(body.site_product_status.active_operation_count, 1);
  assert.equal(body.site_product_status.active_membership_count, 1);
  assert.equal(body.site_product_status.session_count, 1);
  assert.equal(body.site_product_status.open_task_count, 1);
  assert.equal(body.site_product_status.carrier_evidence_read_status.state, 'loaded');
  assert.equal(body.site_product_status.continuity_state, 'no_packet_observed');
  assert.equal(body.site_product_status.continuity_loop_state, 'no_loop_report_observed');
  assert.equal(body.site_product_status.continuity_loop_report_count, 0);
  assert.equal(body.site_product_status.next_action, 'continuity_packet');

  const packetPut = await worker.fetch(jsonRequest({
    operation: 'site.continuity.packet.put',
    request_id: 'request_site_read_continuity_packet_put',
    params: { site_id: 'site_fixture', packet: body.site_continuity.exchange_packet },
  }, { token: 'test-admin-token', path: '/api/carrier' }), env);
  assert.equal(packetPut.status, 200);
  const packetPutBody = await packetPut.json();
  assert.equal(packetPutBody.status, 'imported');
  assert.equal(packetPutBody.site_continuity_packet_admission.action, 'projection_only');

  const refusedPacketPut = await worker.fetch(jsonRequest({
    operation: 'site.continuity.packet.put',
    request_id: 'request_site_read_continuity_packet_refused',
    params: {
      site_id: 'site_fixture',
      packet: {
        ...body.site_continuity.exchange_packet,
        executable_mutation_requests: [{ mutation_class: 'local_repository_filesystem_mutation' }],
      },
    },
  }, { token: 'test-admin-token', path: '/api/carrier' }), env);
  assert.equal(refusedPacketPut.status, 403);
  const refusedPacketPutBody = await refusedPacketPut.json();
  assert.equal(refusedPacketPutBody.status, 'refused');
  assert.equal(refusedPacketPutBody.site_continuity_packet_admission.reason, 'site_continuity_exchange_packet_executable_mutation_refused');

  const readAfterPacketOnly = await worker.fetch(jsonRequest({
    operation: 'site.read',
    request_id: 'request_site_read_after_continuity_packet_only',
    params: { site_id: 'site_fixture', carrier_event_limit: 10 },
  }, { token: 'test-admin-token', path: '/api/carrier' }), env);
  assert.equal(readAfterPacketOnly.status, 200);
  const readAfterPacketOnlyBody = await readAfterPacketOnly.json();
  assert.equal(readAfterPacketOnlyBody.site_product_status.continuity_state, 'packet_observed');
  assert.equal(readAfterPacketOnlyBody.site_product_status.continuity_loop_state, 'no_loop_report_observed');
  assert.deepEqual(readAfterPacketOnlyBody.site_product_status.attention, ['continuity_loop_report', 'open_tasks']);
  assert.equal(readAfterPacketOnlyBody.site_product_status.next_action, 'continuity_loop_report');

  const loopReport = {
    schema: 'narada.site_continuity_productized_loop.v1',
    status: 'ok',
    site_id: 'site_fixture',
    generated_at: '2026-06-08T00:00:00.000Z',
    cloudflare_source: 'cloudflare.site.read',
    cloudflare_worker_url: 'https://carrier.example.test',
    cloudflare_credential_source: 'flag:--token-file',
    cloudflare_push: { status: 'imported' },
    windows_packet_count: 1,
    authority_boundary: {
      executable_cross_embodiment_mutation: 'refused_by_site_continuity_classifier',
      durable_mutation_authority: 'unchanged; routed_by_site_authority_map',
    },
  };
  const loopReportPut = await worker.fetch(jsonRequest({
    operation: 'site.continuity.loop.report.put',
    request_id: 'request_site_continuity_loop_report_put',
    params: { site_id: 'site_fixture', report: loopReport },
  }, { token: 'test-admin-token', path: '/api/carrier' }), env);
  assert.equal(loopReportPut.status, 200);
  const loopReportPutBody = await loopReportPut.json();
  assert.equal(loopReportPutBody.status, 'recorded');
  assert.match(loopReportPutBody.report_record.report_id, /^site-continuity-loop:site_fixture:/);
  assert.equal(loopReportPutBody.report_record.windows_packet_count, 1);

  const readAfterPacketPut = await worker.fetch(jsonRequest({
    operation: 'site.read',
    request_id: 'request_site_read_after_continuity_packet_put',
    params: { site_id: 'site_fixture', carrier_event_limit: 10 },
  }, { token: 'test-admin-token', path: '/api/carrier' }), env);
  assert.equal(readAfterPacketPut.status, 200);
  const readAfterPacketPutBody = await readAfterPacketPut.json();
  assert.equal(readAfterPacketPutBody.site_continuity_packets.length, 1);
  assert.equal(readAfterPacketPutBody.site_continuity_packets[0].admission_action, 'projection_only');
  assert.equal(readAfterPacketPutBody.site_continuity_status.schema, 'narada.cloudflare_site_continuity_status.v1');
  assert.equal(readAfterPacketPutBody.site_continuity_status.state, 'packet_observed');
  assert.equal(readAfterPacketPutBody.site_continuity_status.packet_count, 1);
  assert.equal(readAfterPacketPutBody.site_continuity_status.latest_packet_id, readAfterPacketPutBody.site_continuity_packets[0].packet_id);
  assert.equal(readAfterPacketPutBody.site_continuity_status.latest_admission_action, 'projection_only');
  assert.equal(readAfterPacketPutBody.site_continuity_status.direction_counts.cloudflare_to_local_windows, 1);
  assert.equal(readAfterPacketPutBody.site_continuity_status.direction_counts.local_windows_to_cloudflare, 0);
  assert.equal(readAfterPacketPutBody.site_continuity_status.authority_boundary.executable_cross_embodiment_mutation, 'refused_by_site_continuity_classifier');
  assert.equal(readAfterPacketPutBody.local_cloud_continuity_bridge.schema, 'narada.local_cloud_continuity_bridge.v1');
  assert.equal(readAfterPacketPutBody.local_cloud_continuity_bridge.local_windows_site_ref, 'local-windows-site');
  assert.equal(readAfterPacketPutBody.local_cloud_continuity_bridge.cloudflare_site_ref, 'cloudflare-site');
  assert.equal(readAfterPacketPutBody.local_cloud_continuity_bridge.cloudflare_to_local_windows_packets, 1);
  assert.equal(readAfterPacketPutBody.local_cloud_continuity_bridge.local_windows_to_cloudflare_packets, 0);
  assert.equal(readAfterPacketPutBody.local_cloud_continuity_bridge.executable_cross_embodiment_mutation, 'refused_by_site_continuity_classifier');
  assert.equal(readAfterPacketPutBody.local_cloud_continuity_bridge.durable_mutation_authority, 'unchanged; routed_by_site_authority_map');
  assert.equal(readAfterPacketPutBody.local_cloud_continuity_bridge.next_action, 'review_continuity_packet');
  assert.equal(readAfterPacketPutBody.site_continuity_loop_reports.length, 1);
  assert.equal(readAfterPacketPutBody.site_continuity_loop_status.schema, 'narada.cloudflare_site_continuity_loop_status.v1');
  assert.equal(readAfterPacketPutBody.site_continuity_loop_status.state, 'loop_report_observed');
  assert.equal(readAfterPacketPutBody.site_continuity_loop_status.report_count, 1);
  assert.equal(readAfterPacketPutBody.site_continuity_loop_status.latest_status, 'ok');
  assert.equal(readAfterPacketPutBody.site_continuity_loop_status.cloudflare_push_status, 'imported');
  assert.equal(readAfterPacketPutBody.site_continuity_loop_status.next_action, 'review_continuity_loop_report');
  assert.equal(readAfterPacketPutBody.site_product_status.schema, 'narada.cloudflare_site_product_status.v1');
  assert.deepEqual(readAfterPacketPutBody.site_product_status.missing, []);
  assert.deepEqual(readAfterPacketPutBody.site_product_status.attention, ['open_tasks']);
  assert.equal(readAfterPacketPutBody.site_product_status.health, 'attention');
  assert.equal(readAfterPacketPutBody.site_product_status.carrier_evidence_read_status.state, 'loaded');
  assert.equal(readAfterPacketPutBody.site_product_status.continuity_state, 'packet_observed');
  assert.equal(readAfterPacketPutBody.site_product_status.continuity_loop_state, 'loop_report_observed');
  assert.equal(readAfterPacketPutBody.site_product_status.continuity_packet_count, 1);
  assert.equal(readAfterPacketPutBody.site_product_status.continuity_loop_report_count, 1);
  assert.equal(readAfterPacketPutBody.site_product_status.next_action, 'open_tasks');
});

test('worker site.read surfaces degraded carrier evidence replay when session events are unavailable', async () => {
  const siteDb = fakeD1SiteRegistryDatabase({
    sites: [{
      site_id: 'site_fixture',
      site_ref: 'site://fixture',
      display_name: 'Fixture Site',
      status: 'active',
      created_at: clock(),
      updated_at: clock(),
      created_by_principal_id: 'admin',
    }],
    memberships: [{
      site_id: 'site_fixture',
      principal_id: 'admin',
      role: 'owner',
      status: 'active',
      created_at: clock(),
      updated_at: clock(),
    }],
    operations: [{
      operation_id: 'operation_site_read',
      site_id: 'site_fixture',
      display_name: 'Site Read Operation',
      operation_kind: 'control',
      status: 'active',
      created_by_principal_id: 'admin',
      created_at: clock(),
      updated_at: clock(),
    }],
    carrierSessions: [{
      carrier_session_id: 'carrier_session_missing_events',
      site_id: 'site_fixture',
      operation_id: 'operation_site_read',
      agent_id: 'narada.fixture.agent',
      bound_by_principal_id: 'admin',
      binding_status: 'active',
      created_at: clock(),
      updated_at: clock(),
    }],
  });
  const env = authEnv(null, { CLOUDFLARE_SITE_REGISTRY_DB: siteDb });

  const read = await worker.fetch(jsonRequest({
    operation: 'site.read',
    request_id: 'request_site_read_degraded_carrier_evidence',
    params: { site_id: 'site_fixture', carrier_event_limit: 10 },
  }, { token: 'test-admin-token', path: '/api/carrier' }), env);
  assert.equal(read.status, 200);
  const body = await read.json();
  assert.deepEqual(body.carrier_evidence, []);
  assert.equal(body.carrier_evidence_read_status.schema, 'narada.cloudflare_carrier_evidence_read_status.v1');
  assert.equal(body.carrier_evidence_read_status.state, 'degraded');
  assert.equal(body.carrier_evidence_read_status.session_count, 1);
  assert.equal(body.carrier_evidence_read_status.attempted_session_count, 0);
  assert.equal(body.carrier_evidence_read_status.readable_session_count, 0);
  assert.equal(body.carrier_evidence_read_status.failed_session_count, 0);
  assert.equal(body.carrier_evidence_read_status.missing_session_count, 1);
  assert.deepEqual(body.carrier_evidence_read_status.missing_session_ids, ['carrier_session_missing_events']);
  assert.equal(body.site_product_status.carrier_evidence_read_status.state, 'degraded');
  assert.deepEqual(body.site_product_status.missing, ['carrier_evidence', 'continuity_packet']);
  assert.deepEqual(body.site_product_status.attention, ['carrier_evidence_read_degraded']);
  assert.equal(body.site_product_status.next_action, 'carrier_evidence');
});

test('worker site.read can replay carrier evidence from D1 index without durable object binding', async () => {
  const siteDb = fakeD1SiteRegistryDatabase({
    sites: [{
      site_id: 'site_fixture',
      site_ref: 'site://fixture',
      display_name: 'Fixture Site',
      status: 'active',
      created_at: clock(),
      updated_at: clock(),
      created_by_principal_id: 'admin',
    }],
    memberships: [{
      site_id: 'site_fixture',
      principal_id: 'admin',
      role: 'owner',
      status: 'active',
      created_at: clock(),
      updated_at: clock(),
    }],
    operations: [{
      operation_id: 'operation_indexed_events',
      site_id: 'site_fixture',
      display_name: 'Indexed Evidence Operation',
      operation_kind: 'control',
      status: 'active',
      created_by_principal_id: 'admin',
      created_at: clock(),
      updated_at: clock(),
    }],
  });
  const namespace = fakeDurableObjectNamespace({ CLOUDFLARE_SITE_REGISTRY_DB: siteDb });
  const envWithDurableObject = authEnv(namespace, { CLOUDFLARE_SITE_REGISTRY_DB: siteDb });
  const start = await worker.fetch(jsonRequest(startRequest({
    request_id: 'request_indexed_evidence_start',
    params: {
      carrier_session_id: 'carrier_session_indexed_events',
      agent_id: 'narada.fixture.agent',
      site_id: 'site_fixture',
      site_root: 'cloudflare://site_fixture',
      site_ref: 'site://fixture',
      operation_id: 'operation_indexed_events',
    },
  }), { token: 'test-admin-token' }), envWithDurableObject);
  assert.equal(start.status, 200);
  const command = await worker.fetch(jsonRequest(commandRequest('/goal', ['indexed', 'evidence'], {
    request_id: 'request_indexed_evidence_goal',
    carrier_session_id: 'carrier_session_indexed_events',
  }), { token: 'test-admin-token' }), envWithDurableObject);
  assert.equal(command.status, 200);
  assert.equal(siteDb.dump().carrierSessionEvents.length, 2);

  const envWithoutDurableObject = authEnv(null, { CLOUDFLARE_SITE_REGISTRY_DB: siteDb });
  const read = await worker.fetch(jsonRequest({
    operation: 'site.read',
    request_id: 'request_site_read_indexed_carrier_evidence',
    params: { site_id: 'site_fixture', carrier_event_limit: 10 },
  }, { token: 'test-admin-token', path: '/api/carrier' }), envWithoutDurableObject);
  assert.equal(read.status, 200);
  const body = await read.json();
  assert.equal(body.carrier_evidence.length, 1);
  assert.equal(body.carrier_evidence[0].carrier_session_id, 'carrier_session_indexed_events');
  assert.equal(body.carrier_evidence[0].source, 'cloudflare-site-registry-d1-index');
  assert.deepEqual(body.carrier_evidence[0].events.map((event) => event.event_kind), [
    'carrier_session_started',
    'carrier_command_executed',
  ]);
  assert.equal(body.carrier_evidence_read_status.state, 'loaded');
  assert.equal(body.carrier_evidence_read_status.readable_session_count, 1);
  assert.equal(body.carrier_evidence_read_status.missing_session_count, 0);
  assert.equal(body.site_product_status.carrier_evidence_read_status.state, 'loaded');
  assert.equal(body.site_product_status.carrier_evidence_event_count, 2);
  assert.equal(body.site_product_status.missing.includes('carrier_evidence'), false);
});

test('worker serves minimal authenticated web console shell', async () => {
  const namespace = fakeDurableObjectNamespace();
  const env = authEnv(namespace);
  const response = await worker.fetch(new Request('https://carrier.test/'), env);
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type'), /text\/html/);
  const html = await response.text();
  const consoleScript = html.match(/<script type="module">([\s\S]*)<\/script>/)?.[1] || '';
  assert.ok(consoleScript, 'console module script is rendered');
  assert.doesNotThrow(() => new Function(consoleScript));
  assert.match(html, /Narada Cloudflare Carrier/);
  assert.match(html, /naradaCloudflareCarrierClient/);
  assert.match(html, /\/api\/carrier/);
  assert.match(html, /Sign in with Microsoft/);
  assert.match(html, /\/auth\/microsoft\/login/);
  assert.match(html, /\/auth\/session/);
  assert.match(html, /Service token/);
  assert.match(html, /Operation ID/);
  assert.match(html, /Operation Sessions/);
  assert.match(html, /Active Session/);
  assert.match(html, /readOperation/);
  assert.match(html, /readSite/);
  assert.match(html, /autoRefreshOperation/);
  assert.match(html, /Auto Refresh/);
  assert.match(html, /Control Room/);
  assert.match(html, /Control Room Action/);
  assert.match(html, /controlRoomActionSummary/);
  assert.match(html, /controlRoomActionContext/);
  assert.match(html, /renderControlRoomActionSummary/);
  assert.match(html, /applyControlRoomNextAction/);
  assert.match(html, /controlRoomNextAction/);
  assert.match(html, /focus_operation_path_attention/);
  assert.match(html, /focus_operation_path_task/);
  assert.match(html, /focus_session_path_evidence/);
  assert.match(html, /focus_session_path_task/);
  assert.match(html, /focus_task_path_evidence/);
  assert.match(html, /focus_authority_path_evidence/);
  assert.match(html, /focus_lifecycle_start_session/);
  assert.match(html, /focus_lifecycle_read_evidence/);
  assert.match(html, /focus_lifecycle_continuity/);
  assert.match(html, /focus_lifecycle_continuity_loop_report/);
  assert.match(html, /focus_lifecycle_open_task/);
  assert.match(html, /focus_lifecycle_directive_delivery/);
  assert.match(html, /operation_lifecycle_missing_continuity_packet/);
  assert.match(html, /operation_lifecycle_missing_continuity_loop_report/);
  assert.match(html, /select_site_or_operation/);
  assert.match(html, /membership_authority_bridge_needs_attention/);
  assert.match(html, /workbench_ready_for_monitoring/);
  assert.match(html, /Operation Flight Deck/);
  assert.match(html, /Continuity Workflow/);
  assert.match(html, /Operator Route/);
  assert.match(html, /operatorRoute/);
  assert.match(html, /operatorRouteStages/);
  assert.match(html, /sitePostureRouteStage/);
  assert.match(html, /site_posture/);
  assert.match(html, /focus_next_site/);
  assert.match(html, /operationPostureRouteStage/);
  assert.match(html, /operation_posture/);
  assert.match(html, /focus_next_operation/);
  assert.match(html, /renderOperatorRoute/);
  assert.match(html, /applyOperatorRouteNextAction/);
  assert.match(html, /operatorRouteNextAction/);
  assert.match(html, /Focus Route Next Action/);
  assert.match(html, /Workbench Readiness Gate/);
  assert.match(html, /Operation Control Board/);
  assert.match(html, /operationControlBoard/);
  assert.match(html, /operationControlTarget/);
  assert.match(html, /operationControlTargetNextAction/);
  assert.match(html, /operationControlTargetEvidenceAction/);
  assert.match(html, /operationControlTargetReadinessAction/);
  assert.match(html, /operationControlBoardContext/);
  assert.match(html, /renderOperationControlBoard/);
  assert.match(html, /next_site_action/);
  assert.match(html, /next_site_reason/);
  assert.match(html, /next_operation_action/);
  assert.match(html, /next_operation_reason/);
  assert.match(html, /Control Command/);
  assert.match(html, /Focused Control Target/);
  assert.match(html, /Apply Target Action/);
  assert.match(html, /Focus Target Evidence/);
  assert.match(html, /Focus Target Readiness/);
  assert.match(html, /control_domain/);
  assert.match(html, /control_action/);
  assert.match(html, /control_target/);
  assert.match(html, /operation_focus/);
  assert.match(html, /session_focus/);
  assert.match(html, /task_focus/);
  assert.match(html, /authority_focus/);
  assert.match(html, /evidence_focus/);
  assert.match(html, /Control Posture/);
  assert.match(html, /Active Work Path/);
  assert.match(html, /Session Evidence Posture/);
  assert.match(html, /Evidence Replay/);
  assert.match(html, /evidenceReplayStatus/);
  assert.match(html, /evidenceReplayStatus\(/);
  assert.match(html, /evidenceReplaySources/);
  assert.match(html, /evidenceReplaySessionSummary/);
  assert.match(html, /renderEvidenceReplayMetric/);
  assert.match(html, /Evidence Replay State/);
  assert.match(html, /Evidence Replay Source/);
  assert.match(html, /Evidence Replay Sessions/);
  assert.match(html, /operation\.status\.put/);
  assert.match(html, /putOperationStatus/);
  assert.match(html, /putFocusedOperationStatus/);
  assert.match(html, /operationLifecycleActionRow/);
  assert.match(html, /operationLifecyclePause/);
  assert.match(html, /operationLifecycleResume/);
  assert.match(html, /operationLifecycleArchive/);
  assert.match(html, /operation_status_history/);
  assert.match(html, /operationStatusHistory/);
  assert.match(html, /operationStatusTransitionSummary/);
  assert.match(html, /operationLatestStatusTransitionLabel/);
  assert.match(html, /Status Transitions/);
  assert.match(html, /Latest Status Transition/);
  assert.match(html, /operation_activity_timeline/);
  assert.match(html, /operationActivityTimeline/);
  assert.match(html, /operationActivityTimelineSummary/);
  assert.match(html, /operationLatestActivityLabel/);
  assert.match(html, /selectOperationActivity/);
  assert.match(html, /renderOperationActivityTimeline/);
  assert.match(html, /Operation Activity Timeline/);
  assert.match(html, /Activity Items/);
  assert.match(html, /Latest Activity/);
  assert.match(html, /operationActivityFocus/);
  assert.match(html, /operationActivityFocusDetail/);
  assert.match(html, /operationActivityFocusContext/);
  assert.match(html, /renderOperationActivityFocusDetail/);
  assert.match(html, /applyFocusedOperationActivity/);
  assert.match(html, /operationActivityApplyFocus/);
  assert.match(html, /Activity Focus/);
  assert.match(html, /Apply Activity Focus/);
  assert.match(html, /apply_activity_focus/);
  assert.match(html, /Persistence Posture/);
  assert.match(html, /persistencePostureDetail/);
  assert.match(html, /persistencePostureContext/);
  assert.match(html, /renderPersistencePosture/);
  assert.match(html, /cloudflare_persistence_posture/);
  assert.match(html, /monitor_persistence_posture/);
  assert.match(html, /Persistence State/);
  assert.match(html, /Persistence Next Action/);
  assert.match(html, /Recovery Posture/);
  assert.match(html, /recoveryPostureDetail/);
  assert.match(html, /recoveryPostureContext/);
  assert.match(html, /renderRecoveryPosture/);
  assert.match(html, /cloudflare_recovery_posture/);
  assert.match(html, /monitor_recovery_posture/);
  assert.match(html, /Recovery State/);
  assert.match(html, /Recovery Next Action/);
  assert.match(html, /recoveryWorkflow/);
  assert.match(html, /recoveryWorkflowItems/);
  assert.match(html, /renderRecoveryWorkflow/);
  assert.match(html, /applyRecoveryNextAction/);
  assert.match(html, /recoveryNextAction/);
  assert.match(html, /Apply Recovery Next Action/);
  assert.match(html, /snapshot_reload_available/);
  assert.match(html, /evidence_replay_loaded/);
  assert.match(html, /reconstructability_confirmed/);
  assert.match(html, /focus_kind/);
  assert.match(html, /focus_ref/);
  assert.match(html, /provider_events/);
  assert.match(html, /session_next_action/);
  assert.match(html, /Authority Posture/);
  assert.match(html, /Task Lifecycle Posture/);
  assert.match(html, /focused_status/);
  assert.match(html, /next_task/);
  assert.match(html, /controlled_action/);
  assert.match(html, /authority_evidence/);
  assert.match(html, /Readiness Gaps/);
  assert.match(html, /Control Board Actions/);
  assert.match(html, /operationControlBoardNextAction/);
  assert.match(html, /operationControlBoardReadinessAction/);
  assert.match(html, /operationControlBoardEvidenceAction/);
  assert.match(html, /Apply Board Next Action/);
  assert.match(html, /Focus Board Readiness Gap/);
  assert.match(html, /Focus Board Evidence/);
  assert.match(html, /workbenchReadinessGate/);
  assert.match(html, /workbenchReadinessGateItems/);
  assert.match(html, /renderWorkbenchReadinessGate/);
  assert.match(html, /applyWorkbenchReadinessNextAction/);
  assert.match(html, /workbenchReadinessNextAction/);
  assert.match(html, /Focus Readiness Gap/);
  assert.match(html, /operator_identity_ready/);
  assert.match(html, /membership_authority_ready/);
  assert.match(html, /next_control_action_ready/);
  assert.match(html, /continuityWorkflow/);
  assert.match(html, /continuityWorkflowSteps/);
  assert.match(html, /applyContinuityWorkflowNextStep/);
  assert.match(html, /continuityWorkflowNextAction/);
  assert.match(html, /Focus Next Workflow Step/);
  assert.match(html, /operation_scope_loaded/);
  assert.match(html, /session_evidence_loaded/);
  assert.match(html, /authority_state_loaded/);
  assert.match(html, /evidence_focus_set/);
  assert.match(html, /operationFlightDeck/);
  assert.match(html, /operationFlightDeckContext/);
  assert.match(html, /renderOperationFlightDeck/);
  assert.match(html, /Next Action/);
  assert.match(html, /operationFlightDeckTargets/);
  assert.match(html, /applyFlightDeckNextAction/);
  assert.match(html, /flightDeckNextAction/);
  assert.match(html, /flightDeckFocusSession/);
  assert.match(html, /flightDeckFocusAttention/);
  assert.match(html, /flightDeckFocusTask/);
  assert.match(html, /flightDeckFocusAuthority/);
  assert.match(html, /flightDeckFocusEvidence/);
  assert.match(html, /Focus Next Action/);
  assert.match(html, /Runtime Posture/);
  assert.match(html, /runtimePostureDetail/);
  assert.match(html, /runtimePostureContext/);
  assert.match(html, /renderRuntimePosture/);
  assert.match(html, /Operator Identity/);
  assert.match(html, /controlOperator/);
  assert.match(html, /operatorIdentity/);
  assert.match(html, /operatorPrincipalLabel/);
  assert.match(html, /operatorPrincipalContext/);
  assert.match(html, /renderOperatorIdentity/);
  assert.match(html, /Controlled Actions/);
  assert.match(html, /Operation Focus/);
  assert.match(html, /Operation Navigator/);
  assert.match(html, /Operation Posture/);
  assert.match(html, /operationPostureOverview/);
  assert.match(html, /renderOperationPostureOverview/);
  assert.match(html, /operationPostureNextAction/);
  assert.match(html, /Focus Next Operation/);
  assert.match(html, /nextOperationFromPosture/);
  assert.match(html, /focusNextOperationFromPosture/);
  assert.match(html, /operationPostureReason/);
  assert.match(html, /narada\.cloudflare_operation_posture_overview\.v1/);
  assert.match(html, /Reason Counts/);
  assert.match(html, /Command State Counts/);
  assert.match(html, /Operation Work Queue/);
  assert.match(html, /operationWorkQueue/);
  assert.match(html, /operationWorkQueueItems/);
  assert.match(html, /renderOperationWorkQueue/);
  assert.match(html, /operationWorkQueueButtonId/);
  assert.match(html, /Operation Action/);
  assert.match(html, /operationActionSummary/);
  assert.match(html, /operationActionContext/);
  assert.match(html, /classifyCloudflareOperationCommandState/);
  assert.match(html, /applyOperationCommandAction/);
  assert.match(html, /renderOperationActionSummary/);
  assert.match(html, /Command State/);
  assert.match(html, /Command Action/);
  assert.match(html, /operationCommandNextAction/);
  assert.match(html, /operationCommandSessionAction/);
  assert.match(html, /operationCommandTaskAction/);
  assert.match(html, /operationCommandAuthorityAction/);
  assert.match(html, /operationCommandEvidenceAction/);
  assert.match(html, /Run Operation Command/);
  assert.match(html, /focusedOperation/);
  assert.match(html, /operationScopeLoaded/);
  assert.match(html, /operationEvidenceLoaded/);
  assert.match(html, /useFocusedOperation/);
  assert.match(html, /focusOperationSession/);
  assert.match(html, /operationActionUseOperation/);
  assert.match(html, /operationActionReadOperation/);
  assert.match(html, /operationActionFocusSession/);
  assert.match(html, /use_focused_operation/);
  assert.match(html, /read_operation_scope/);
  assert.match(html, /Create Operation ID/);
  assert.match(html, /newOperationId/);
  assert.match(html, /Create Operation Display Name/);
  assert.match(html, /newOperationDisplayName/);
  assert.match(html, /Create Operation Kind/);
  assert.match(html, /newOperationKind/);
  assert.match(html, /createOperation/);
  assert.match(html, /createOperationFromWorkbench/);
  assert.match(html, /Operation Focus Detail/);
  assert.match(html, /operationFocusDetail/);
  assert.match(html, /operationFocusContext/);
  assert.match(html, /renderOperationFocusDetail/);
  assert.match(html, /Operation Path/);
  assert.match(html, /operationPath/);
  assert.match(html, /operationPathContext/);
  assert.match(html, /renderOperationPath/);
  assert.match(html, /operationEvents/);
  assert.match(html, /operationTasks/);
  assert.match(html, /focusOperationPathSession/);
  assert.match(html, /focusOperationPathTask/);
  assert.match(html, /focusOperationPathAttention/);
  assert.match(html, /focusOperationPathAuthority/);
  assert.match(html, /focusOperationPathEvidence/);
  assert.match(html, /operationNavigator/);
  assert.match(html, /renderOperationNavigator/);
  assert.match(html, /selectOperation/);
  assert.match(html, /setCurrentOperation/);
  assert.match(html, /operation-item/);
  assert.match(html, /\.operation-item\.selected/);
  assert.match(html, /Selected Session/);
  assert.match(html, /Session Focus/);
  assert.match(html, /Session Navigator/);
  assert.match(html, /Session Work Queue/);
  assert.match(html, /sessionWorkQueue/);
  assert.match(html, /sessionWorkQueueItems/);
  assert.match(html, /renderSessionWorkQueue/);
  assert.match(html, /sessionWorkQueueButtonId/);
  assert.match(html, /Session Action/);
  assert.match(html, /sessionActionSummary/);
  assert.match(html, /sessionActionContext/);
  assert.match(html, /classifyCloudflareSessionCommandState/);
  assert.match(html, /renderSessionActionSummary/);
  assert.match(html, /Command State/);
  assert.match(html, /Command Action/);
  assert.match(html, /focusedSession/);
  assert.match(html, /sessionEvidenceLoaded/);
  assert.match(html, /useFocusedSession/);
  assert.match(html, /focusFocusedSessionEvidence/);
  assert.match(html, /sessionActionUseSession/);
  assert.match(html, /sessionActionReadEvidence/);
  assert.match(html, /sessionActionFocusEvidence/);
  assert.equal([...html.matchAll(/id="sessionActionFocusEvidence"/g)].length, 1);
  assert.match(html, /use_focused_session/);
  assert.match(html, /Session Focus Detail/);
  assert.match(html, /sessionFocusDetail/);
  assert.match(html, /sessionFocusContext/);
  assert.match(html, /renderSessionFocusDetail/);
  assert.match(html, /Session Evidence Path/);
  assert.match(html, /sessionEvidencePath/);
  assert.match(html, /sessionEvidencePathContext/);
  assert.match(html, /renderSessionEvidencePath/);
  assert.match(html, /Session Evidence Control/);
  assert.match(html, /sessionEvidenceControl/);
  assert.match(html, /sessionEvidenceControlContext/);
  assert.match(html, /renderSessionEvidenceControl/);
  assert.match(html, /applySessionEvidenceAction/);
  assert.match(html, /sessionEvidenceApplyAction/);
  assert.match(html, /sessionEvidenceFocusAction/);
  assert.match(html, /sessionEvidenceTaskAction/);
  assert.match(html, /Apply Session Evidence Action/);
  assert.match(html, /Focus Session Task/);
  assert.match(html, /review_session_failures/);
  assert.match(html, /review_session_open_task/);
  assert.match(html, /review_session_delivery/);
  assert.match(html, /monitor_session_evidence/);
  assert.match(html, /sessionEvidenceEvents/);
  assert.match(html, /sessionTasks/);
  assert.match(html, /directiveDeliveryForSession/);
  assert.match(html, /focusSessionPathEvidence/);
  assert.match(html, /focusSessionPathTask/);
  assert.match(html, /focusSessionPathDelivery/);
  assert.match(html, /focusSessionPathChain/);
  assert.match(html, /sessionNavigator/);
  assert.match(html, /renderSessionNavigator/);
  assert.match(html, /selectOperationSession/);
  assert.match(html, /session-item/);
  assert.match(html, /Authority Locus/);
  assert.match(html, /Authority Focus/);
  assert.match(html, /Site Membership/);
  assert.match(html, /Membership Navigator/);
  assert.match(html, /Membership Focus Detail/);
  assert.match(html, /membershipNavigator/);
  assert.match(html, /membershipFocusDetail/);
  assert.match(html, /membershipFocusContext/);
  assert.match(html, /renderMembershipNavigator/);
  assert.match(html, /renderMembershipFocusDetail/);
  assert.match(html, /selectMembership/);
  assert.match(html, /\.membership-item\.selected/);
  assert.match(html, /Site Continuity/);
  assert.match(html, /Continuity Focus Detail/);
  assert.match(html, /continuityNavigator/);
  assert.match(html, /continuityFocusDetail/);
  assert.match(html, /continuityItems/);
  assert.match(html, /continuityFocusContext/);
  assert.match(html, /renderContinuityNavigator/);
  assert.match(html, /renderContinuityFocusDetail/);
  assert.match(html, /selectContinuity/);
  assert.match(html, /\.continuity-item\.selected/);
  assert.match(html, /Authority State/);
  assert.match(html, /controlAuthorityFocus/);
  assert.match(html, /authorityState/);
  assert.match(html, /authorityFocusDetail/);
  assert.match(html, /Authority Path/);
  assert.match(html, /authorityPath/);
  assert.match(html, /authorityPathContext/);
  assert.match(html, /renderAuthorityPath/);
  assert.match(html, /authorityEvidenceEvents/);
  assert.match(html, /focusAuthorityPathDecision/);
  assert.match(html, /refreshAuthorityPath/);
  assert.match(html, /authorityPathFocusDecision/);
  assert.match(html, /authorityPathFocusEvidence/);
  assert.match(html, /authorityPathRefresh/);
  assert.match(html, /authorityDecisionKey/);
  assert.match(html, /selectAuthorityDecision/);
  assert.match(html, /Authority Action/);
  assert.match(html, /authorityActionSummary/);
  assert.match(html, /authorityActionContext/);
  assert.match(html, /classifyCloudflareAuthorityCommandState/);
  assert.match(html, /renderAuthorityActionSummary/);
  assert.match(html, /Command State/);
  assert.match(html, /Command Action/);
  assert.match(html, /authorityActorMembership/);
  assert.match(html, /applyAuthorityNextAction/);
  assert.match(html, /focusAuthorityEvidence/);
  assert.match(html, /authorityNextAction/);
  assert.match(html, /authorityReadSiteAction/);
  assert.match(html, /authorityActionEvidenceAction/);
  assert.match(html, /inspect_refused_authority/);
  assert.match(html, /monitor_authority_admissions/);
  assert.match(html, /focus_authority_evidence/);
  assert.match(html, /authorityDecisionContext/);
  assert.match(html, /renderAuthorityFocusDetail/);
  assert.match(html, /authorityFocusEvidenceAction/);
  assert.match(html, /resolve_authority_locus/);
  assert.match(html, /inspect_authority_locus/);
  assert.match(html, /\.authority-decision\.selected/);
  assert.match(html, /Task Focus/);
  assert.match(html, /Task Focus Detail/);
  assert.match(html, /taskFocusDetail/);
  assert.match(html, /taskFocusContext/);
  assert.match(html, /classifyCloudflareTaskCommandState/);
  assert.match(html, /taskLifecyclePathContext/);
  assert.match(html, /focusTaskLifecyclePath/);
  assert.match(html, /renderTaskFocusDetail/);
  assert.match(html, /Command State/);
  assert.match(html, /Command Action/);
  assert.match(html, /taskFocusEvidenceAction/);
  assert.match(html, /taskFocusPathAction/);
  assert.match(html, /taskFocusOpenAction/);
  assert.match(html, /taskFocusDoneAction/);
  assert.match(html, /Next Lifecycle Action/);
  assert.match(html, /Task Path/);
  assert.match(html, /normalize_status_or_update/);
  assert.match(html, /reopen_or_inspect_evidence/);
  assert.match(html, /Operation Attention/);
  assert.match(html, /Attention/);
  assert.match(html, /Attention Focus Detail/);
  assert.match(html, /attentionFocusDetail/);
  assert.match(html, /attentionFocusContext/);
  assert.match(html, /renderAttentionFocusDetail/);
  assert.match(html, /attentionFocusEvidenceAction/);
  assert.match(html, /attentionFocusTaskAction/);
  assert.match(html, /attentionFocusResolveAction/);
  assert.match(html, /createTaskFromFocusedAttention/);
  assert.match(html, /resolveFocusedAttention/);
  assert.match(html, /create_or_select_resolution_task/);
  assert.match(html, /inspect_resolving_task/);
  assert.match(html, /\.attention-item\.selected/);
  assert.match(html, /Raise Attention/);
  assert.match(html, /Task From Attention/);
  assert.match(html, /Resolve Attention/);
  assert.match(html, /Evidence Window/);
  assert.match(html, /Evidence Focus/);
  assert.match(html, /Evidence Action/);
  assert.match(html, /evidenceActionSummary/);
  assert.match(html, /evidence-summary/);
  assert.match(html, /evidence-field/);
  assert.match(html, /evidenceMeaning/);
  assert.match(html, /evidenceActionContext/);
  assert.match(html, /evidenceTargetContext/);
  assert.match(html, /classifyCloudflareEvidenceCommandState/);
  assert.match(html, /evidenceActionSummaryContext/);
  assert.match(html, /evidenceNextAction/);
  assert.match(html, /Command State/);
  assert.match(html, /Command Action/);
  assert.match(html, /tryParseTaskId/);
  assert.match(html, /focusEvidenceLaneForCurrent/);
  assert.match(html, /selectEvidenceSession/);
  assert.match(html, /focusEvidenceTarget/);
  assert.match(html, /focusEvidencePath/);
  assert.match(html, /renderEvidenceActionSummary/);
  assert.match(html, /evidenceActionLaneAction/);
  assert.match(html, /evidenceActionSessionAction/);
  assert.match(html, /evidenceActionTargetAction/);
  assert.match(html, /evidenceActionPathAction/);
  assert.match(html, /Focus Evidence Target/);
  assert.match(html, /Focus Evidence Path/);
  assert.match(html, /inspect_failure_and_retry_or_escalate/);
  assert.match(html, /resolve_or_acknowledge_directive/);
  assert.match(html, /trace_input_lifecycle/);
  assert.match(html, /evidenceTrailContext/);
  assert.match(html, /evidenceFocusIndex/);
  assert.match(html, /focusAdjacentEvidence/);
  assert.match(html, /Trail Position/);
  assert.match(html, /evidenceFocusPreviousAction/);
  assert.match(html, /evidenceFocusNextAction/);
  assert.match(html, /Previous Evidence/);
  assert.match(html, /Next Evidence/);
  assert.match(html, /Evidence Lanes|evidenceLanes/);
  assert.match(html, /evidenceReviewQueue/);
  assert.match(html, /evidenceReviewQueueItems/);
  assert.match(html, /renderEvidenceReviewQueue/);
  assert.match(html, /evidenceReviewPriority/);
  assert.match(html, /evidenceReviewQueueButtonId/);
  assert.match(html, /classifyEvidenceLane/);
  assert.match(html, /renderEvidenceLanes/);
  assert.match(html, /Input Lifecycle/);
  assert.match(html, /Provider Turns/);
  assert.match(html, /Tools \/ Effects/);
  assert.match(html, /compactEvidenceValue/);
  assert.match(html, /controlEvidenceFocus/);
  assert.match(html, /Evidence Filter/);
  assert.match(html, /Session Filter/);
  assert.match(html, /eventKindFilter/);
  assert.match(html, /eventSessionFilter/);
  assert.match(html, /updateControlRoom/);
  assert.match(html, /Workbench Readiness/);
  assert.match(html, /controlWorkbenchReadiness/);
  assert.match(html, /operationWorkbenchReadiness/);
  assert.match(html, /shadow-read/);
  assert.match(html, /extractOperationAttention/);
  assert.match(html, /renderAttentionQueue/);
  assert.match(html, /selectedAttention/);
  assert.match(html, /resolved_attention/);
  assert.match(html, /controlAttention/);
  assert.match(html, /directive\.emit/);
  assert.match(html, /operation_attention/);
  assert.match(html, /visibleEvents/);
  assert.match(html, /focusEvidence/);
  assert.match(html, /focusEvidenceFor/);
  assert.match(html, /setEvidenceLane/);
  assert.match(html, /selectAttentionItem/);
  assert.match(html, /renderEvidenceFocus/);
  assert.match(html, /eventTitle/);
  assert.match(html, /event selected/);
  assert.match(html, /refreshEventKindFilter/);
  assert.match(html, /operation_narada_cloudflare_control/);
  assert.match(html, /Optional when signed in/);
  assert.match(html, /Use Session/);
  assert.match(html, /Read Session Evidence/);
  assert.match(html, /readSessionEvidence/);
  assert.match(html, /readSelectedSessionEvidence/);
  assert.match(html, /sessionFocusReadEvidenceAction/);
  assert.match(html, /sessionFocusEvidenceAction/);
  assert.match(html, /read_session_evidence/);
  assert.match(html, /inspect_session_evidence/);
  assert.match(html, /Active Session Detail/);
  assert.match(html, /activeSessionDetail/);
  assert.match(html, /renderActiveSessionDetail/);
  assert.match(html, /Focus Task Evidence/);
  assert.match(html, /Task Lifecycle Summary/);
  assert.match(html, /taskLifecycleSummary/);
  assert.match(html, /Task Lifecycle Control/);
  assert.match(html, /taskLifecycleControl/);
  assert.match(html, /taskLifecycleControlContext/);
  assert.match(html, /renderTaskLifecycleControl/);
  assert.match(html, /applyTaskLifecycleAction/);
  assert.match(html, /taskLifecycleApplyAction/);
  assert.match(html, /taskLifecycleEvidenceAction/);
  assert.match(html, /taskLifecycleSessionAction/);
  assert.match(html, /Apply Lifecycle Action/);
  assert.match(html, /Focus Lifecycle Evidence/);
  assert.match(html, /Focus Lifecycle Session/);
  assert.match(html, /Lifecycle Action/);
  assert.match(html, /mark_task_done/);
  assert.match(html, /inspect_task_evidence/);
  assert.match(html, /normalize_task_open/);
  assert.match(html, /Task Work Queue/);
  assert.match(html, /taskWorkQueue/);
  assert.match(html, /taskWorkQueueItems/);
  assert.match(html, /renderTaskWorkQueue/);
  assert.match(html, /taskWorkQueueButtonId/);
  assert.match(html, /Task Command Preview/);
  assert.match(html, /taskCommandPreview/);
  assert.match(html, /taskCommandPreviewContext/);
  assert.match(html, /renderTaskCommandPreview/);
  assert.match(html, /createTaskFromWorkbench/);
  assert.match(html, /create_task_for_operation/);
  assert.match(html, /update_task_lifecycle_state/);
  assert.match(html, /create_then_select_task/);
  assert.match(html, /create_task_from_attention/);
  assert.match(html, /taskLifecycleStatus/);
  assert.match(html, /renderTaskLifecycleSummary/);
  assert.match(html, /Task Evidence Path/);
  assert.match(html, /taskEvidencePath/);
  assert.match(html, /taskEvidencePathContext/);
  assert.match(html, /renderTaskEvidencePath/);
  assert.match(html, /directiveIntentForTask/);
  assert.match(html, /directiveDeliveryForTask/);
  assert.match(html, /taskEvidenceEvents/);
  assert.match(html, /focusTaskPathSession/);
  assert.match(html, /focusTaskPathEvidence/);
  assert.match(html, /focusTaskPathDirective/);
  assert.match(html, /focusTaskPathDelivery/);
  assert.match(html, /focusTaskPathChain/);
  assert.match(html, /mark_done_or_update/);
  assert.match(html, /focusActionButton/);
  assert.match(html, /focusActionRow/);
  assert.match(html, /Mark Open/);
  assert.match(html, /Mark Done/);
  assert.match(html, /taskEvidencePredicate/);
  assert.match(html, /selectedTaskFromWorkbench/);
  assert.match(html, /selectTask/);
  assert.match(html, /updateFocusedTask/);
  assert.match(html, /\.task\.selected/);
  assert.match(html, /Provider/);
  assert.match(html, /Effects/);
  assert.match(html, /Operation Surface/);
  assert.match(html, /Read Operation/);
  assert.match(html, /Auto Refresh/);
  assert.match(html, /Product Scope/);
  assert.match(html, /controlProductScope/);
  assert.match(html, /productScopeDetail/);
  assert.match(html, /productScopeSummary/);
  assert.match(html, /productScopeContext/);
  assert.match(html, /renderProductScopeDetail/);
  assert.match(html, /readOperationScope/);
  assert.match(html, /readSiteScope/);
  assert.match(html, /refreshSiteProduct/);
  assert.match(html, /read_operation_or_site_scope/);
  assert.match(html, /read_site_scope_for_membership_and_operations/);
  assert.match(html, /read_operation_scope_for_active_operation/);
  assert.match(html, /Site Product/);
  assert.match(html, /Sites Overview/);
  assert.match(html, /Next Reason/);
  assert.match(html, /Action Counts/);
  assert.match(html, /Missing Counts/);
  assert.match(html, /Attention Counts/);
  assert.match(html, /readSites/);
  assert.match(html, /sitesOverview/);
  assert.match(html, /sitesStatusList/);
  assert.match(html, /sitesOverviewNextAction/);
  assert.match(html, /renderSitesProduct/);
  assert.match(html, /refreshSitesProduct/);
  assert.match(html, /focusNextSiteFromOverview/);
  assert.match(html, /siteProductStatusSummary/);
  assert.match(html, /countMapSummary/);
  assert.match(html, /Site Action/);
  assert.match(html, /classifyCloudflareSiteCommandState/);
  assert.match(html, /siteActionSummary/);
  assert.match(html, /siteActionContext/);
  assert.match(html, /renderSiteActionSummary/);
  assert.match(html, /focusedSite/);
  assert.match(html, /siteScopeLoaded/);
  assert.match(html, /focusSiteOperation/);
  assert.match(html, /focusSiteMembership/);
  assert.match(html, /siteActionReadSite/);
  assert.match(html, /siteActionFocusOperation/);
  assert.match(html, /siteActionFocusMembership/);
  assert.match(html, /read_site_scope/);
  assert.match(html, /load_or_create_membership/);
  assert.match(html, /Command State/);
  assert.match(html, /Command Action/);
  assert.match(html, /inspect_site_operations/);
  assert.match(html, /Site Focus Detail/);
  assert.match(html, /siteFocusDetail/);
  assert.match(html, /siteFocusContext/);
  assert.match(html, /renderSiteFocusDetail/);
  assert.match(html, /Site Membership/);
  assert.match(html, /Membership Action/);
  assert.match(html, /classifyCloudflareMembershipCommandState/);
  assert.match(html, /membershipActionSummary/);
  assert.match(html, /membershipActionContext/);
  assert.match(html, /renderMembershipActionSummary/);
  assert.match(html, /focusedMembership/);
  assert.match(html, /membershipAuthorityLoaded/);
  assert.match(html, /putFocusedMembership/);
  assert.match(html, /focusMembershipAuthority/);
  assert.match(html, /membershipActionPut/);
  assert.match(html, /membershipActionReadSite/);
  assert.match(html, /membershipActionFocusAuthority/);
  assert.match(html, /read_membership_site/);
  assert.match(html, /put_membership/);
  assert.match(html, /monitor_membership_authority/);
  assert.match(html, /Last Authority/);
  assert.match(html, /authoritySummary/);
  assert.match(html, /renderLastAuthority/);
  assert.match(html, /renderAuthorityState/);
  assert.match(html, /Authority Decision Queue/);
  assert.match(html, /Authority Decision Control/);
  assert.match(html, /authorityDecisionControl/);
  assert.match(html, /authorityDecisionControlContext/);
  assert.match(html, /renderAuthorityDecisionControl/);
  assert.match(html, /applyAuthorityDecisionReview/);
  assert.match(html, /authorityDecisionApplyAction/);
  assert.match(html, /authorityDecisionEvidenceAction/);
  assert.match(html, /authorityDecisionRefreshAction/);
  assert.match(html, /Apply Decision Review/);
  assert.match(html, /Focus Decision Evidence/);
  assert.match(html, /Refresh Decision Authority/);
  assert.match(html, /Review State/);
  assert.match(html, /Review Action/);
  assert.match(html, /review_refused_authority/);
  assert.match(html, /review_unresolved_locus/);
  assert.match(html, /load_decision_evidence/);
  assert.match(html, /authorityDecisionQueue/);
  assert.match(html, /authorityDecisionQueueItems/);
  assert.match(html, /renderAuthorityDecisionQueue/);
  assert.match(html, /authorityDecisionEvidenceEvents/);
  assert.match(html, /authorityDecisionQueueButtonId/);
  assert.match(html, /authorityPostureSummary/);
  assert.match(html, /renderAuthorityPostureSummary/);
  assert.match(html, /inspect_refusals/);
  assert.match(html, /monitor_admissions/);
  assert.match(html, /authority-decision/);
  assert.match(html, /actor_role/);
  assert.match(html, /Product Overview|productOverview/);
  assert.match(html, /Operation/);
  assert.match(html, /Product Surface/);
  assert.match(html, /Memberships/);
  assert.match(html, /Sessions/);
  assert.match(html, /Tasks/);
  assert.match(html, /Evidence/);
  assert.match(html, /Authority Events/);
  assert.match(html, /Authority Decisions/);
  assert.match(html, /Authority Routing/);
  assert.match(html, /authorityRouteSummary/);
  assert.match(html, /site_authority/);
  assert.match(html, /Site Continuity/);
  assert.match(html, /Continuity Packets/);
  assert.match(html, /Continuity Loop Reports/);
  assert.match(html, /continuity_packet_count/);
  assert.match(html, /continuity_loop_reports/);
  assert.match(html, /loop_report/);
  assert.match(html, /continuitySummary/);
  assert.match(html, /site_continuity/);
  assert.match(html, /Continuity Loop/);
  assert.match(html, /continuity_loop_recorded/);
  assert.match(html, /Local-Cloud Continuity/);
  assert.match(html, /localCloudContinuityBridge/);
  assert.match(html, /localCloudContinuityBridgeContext/);
  assert.match(html, /renderLocalCloudContinuityBridge/);
  assert.match(html, /local_cloud_binding_declared/);
  assert.match(html, /authority_map_projection_reviewed/);
  assert.match(html, /read_model_projection_reviewed/);
  assert.match(html, /mutation_evidence_reference_reviewed/);
  assert.match(html, /cross_embodiment_execution_guarded/);
  assert.match(html, /durable_mutation_authority/);
  assert.match(html, /routed_by_site_authority_map/);
  assert.match(html, /Continuity Loop Evidence/);
  assert.match(html, /continuityLoopEvidence/);
  assert.match(html, /continuityLoopEvidenceContext/);
  assert.match(html, /renderContinuityLoopEvidence/);
  assert.match(html, /focusContinuityLoopReport/);
  assert.match(html, /continuity_loop_report_recorded/);
  assert.match(html, /site_continuity_loop_report/);
  assert.match(html, /review_continuity_loop_report/);
  assert.match(html, /run_site_continuity_loop/);
  assert.match(html, /site:continuity:loop/);
  assert.match(html, /sync-cloudflare/);
  assert.match(html, /Read Site Continuity/);
  assert.match(html, /Webhook Delay Shadow Read/);
  assert.match(html, /webhookDelayShadowNavigator/);
  assert.match(html, /webhookDelayShadowFocusDetail/);
  assert.match(html, /renderWebhookDelayShadowNavigator/);
  assert.match(html, /webhookDelayShadowFocusContext/);
  assert.match(html, /cloudflare_shadow_read/);
  assert.match(html, /windows_primary_dispatcher/);
  assert.match(html, /Dispatch Action/);
  assert.match(html, /Resident Loop Shadow Read/);
  assert.match(html, /residentLoopShadowNavigator/);
  assert.match(html, /residentLoopShadowFocusDetail/);
  assert.match(html, /renderResidentLoopShadowNavigator/);
  assert.match(html, /residentLoopShadowFocusContext/);
  assert.match(html, /selectResidentLoopShadow/);
  assert.match(html, /resident_loop_shadow_reads/);
  assert.match(html, /resident_loop_shadow_run_count/);
  assert.match(html, /Operator Attention/);
  assert.match(html, /Resident Dispatch/);
  assert.match(html, /Webhook Delay Directive Intent/);
  assert.match(html, /Task From Directive Intent/);
  assert.match(html, /taskFromDirectiveIntent/);
  assert.match(html, /createTaskFromFocusedDirectiveIntent/);
  assert.match(html, /directiveIntentTaskTitle/);
  assert.match(html, /directiveIntentTaskPredicate/);
  assert.match(html, /taskForDirectiveIntent/);
  assert.match(html, /create_task_from_directive_intent/);
  assert.match(html, /directive_intent_has_no_task/);
  assert.match(html, /Directive Task/);
  assert.match(html, /webhookDelayDirectiveNavigator/);
  assert.match(html, /webhookDelayDirectiveFocusDetail/);
  assert.match(html, /renderWebhookDelayDirectiveNavigator/);
  assert.match(html, /webhookDelayDirectiveFocusContext/);
  assert.match(html, /selectWebhookDelayDirective/);
  assert.match(html, /focusWebhookDelayDirective/);
  assert.match(html, /Webhook Delay Directive Delivery/);
  assert.match(html, /webhookDelayDirectiveDeliveryNavigator/);
  assert.match(html, /webhookDelayDirectiveDeliveryFocusDetail/);
  assert.match(html, /renderWebhookDelayDirectiveDeliveryNavigator/);
  assert.match(html, /webhookDelayDirectiveDeliveryFocusContext/);
  assert.match(html, /selectWebhookDelayDirectiveDelivery/);
  assert.match(html, /focusWebhookDelayDirectiveDelivery/);
  assert.match(html, /focus_webhook_delay_directive_delivery/);
  assert.match(html, /directive_delivery_needs_operator_focus/);
  assert.match(html, /Directive Delivery Session/);
  assert.match(html, /Webhook Delay Evidence Chain/);
  assert.match(html, /webhookDelayEvidenceChain/);
  assert.match(html, /webhookDelayEvidenceChainContext/);
  assert.match(html, /renderWebhookDelayEvidenceChain/);
  assert.match(html, /focusWebhookDelayChainObservation/);
  assert.match(html, /focusWebhookDelayChainIntent/);
  assert.match(html, /focusWebhookDelayChainDelivery/);
  assert.match(html, /focusWebhookDelayChainSession/);
  assert.match(html, /focusWebhookDelayChainTask/);
  assert.match(html, /flightDeckFocusEvidenceChain/);
  assert.match(html, /focusWebhookDelayShadow/);
  assert.match(html, /focus_webhook_delay_directive_intent/);
  assert.match(html, /focus_webhook_delay_shadow_read/);
  assert.match(html, /directive_intent_record_needs_operator_focus/);
  assert.match(html, /directive_intent_not_recorded_from_shadow_read/);
  assert.match(html, /flightDeckFocusDirectiveIntent/);
  assert.match(html, /webhook_delay_directive_records/);
  assert.match(html, /webhook_delay_directive_record_count/);
  assert.match(html, /webhook-delay-directive-intent/);
  assert.match(html, /cloudflare_directive_dual_recorded/);
  assert.match(html, /focus_webhook_delay_directive_intent/);
  assert.match(html, /directive_intent_record_needs_operator_focus/);
  assert.match(html, /directive_intent_not_recorded_from_shadow_read/);
  assert.match(html, /flightDeckFocusDirectiveIntent/);
  assert.match(html, /Start Resident Dispatch/);
  assert.match(html, /startResidentDispatch/);
  assert.match(html, /startResidentDispatchFromWorkbench/);
  assert.match(html, /start_resident_dispatch/);
  assert.match(html, /cloudflare_primary_dispatch_not_recorded/);
  assert.match(html, /resident_dispatch\.primary_with_fallback\.start/);
  assert.match(html, /residentDispatchNavigator/);
  assert.match(html, /residentDispatchFocusDetail/);
  assert.match(html, /renderResidentDispatchNavigator/);
  assert.match(html, /residentDispatchFocusContext/);
  assert.match(html, /selectResidentDispatch/);
  assert.match(html, /focusResidentDispatch/);
  assert.match(html, /resident_dispatch_decisions/);
  assert.match(html, /resident_dispatch_decision_count/);
  assert.match(html, /Fallback Authority/);
  assert.match(html, /Fallback Status/);
  assert.match(html, /cloudflare_primary_dispatcher/);
  assert.match(html, /windows_fallback_dispatcher/);
  assert.match(html, /operation_product_surface/);
  assert.match(html, /Carrier Evidence/);
  assert.match(html, /Task State/);
  assert.match(html, /Task ID/);
  assert.match(html, /Update Task/);
  assert.match(html, /updateTask/);
  assert.match(html, /setCurrentSession/);
  assert.match(html, /loadWorkbenchState/);
  assert.match(html, /saveWorkbenchState/);
  assert.match(html, /narada\.cloudflare\.operationWorkbench\.v1/);
  assert.match(html, /console_action_failed/);
  assert.match(html, /console_operation_autoload_failed/);
  assert.match(html, /appendConsoleEvidence/);
  assert.match(html, /renderOperationSessions/);
  assert.match(html, /refreshOperation/);
  assert.match(html, /setAutoRefresh/);
  assert.match(html, /credentials: 'same-origin'/);
  assert.match(html, /operation_id/);
  assert.match(html, /operation\.read/);
  assert.match(html, /operation\.create/);
  assert.match(html, /site\.read/);
  assert.match(html, /site\.membership\.put/);
  assert.match(html, /putMembership/);
  assert.match(html, /readOperation/);
  assert.match(html, /readSite/);
  assert.match(html, /renderOperationProduct/);
  assert.match(html, /createTask/);
});

test('worker records webhook delay observations as Cloudflare shadow-read evidence without dispatching', async () => {
  const siteDb = fakeD1SiteRegistryDatabase({
    sites: [{
      site_id: 'site_fixture',
      site_ref: 'site://fixture',
      display_name: 'Fixture Site',
      status: 'active',
      created_at: clock(),
      updated_at: clock(),
      created_by_principal_id: 'admin',
    }],
    memberships: [{
      site_id: 'site_fixture',
      principal_id: 'admin',
      role: 'owner',
      status: 'active',
      created_at: clock(),
      updated_at: clock(),
    }],
    operations: [{
      operation_id: 'operation_webhook_delay',
      site_id: 'site_fixture',
      display_name: 'Webhook Delay Operation',
      operation_kind: 'operating_layer_update',
      status: 'active',
      created_by_principal_id: 'admin',
      created_at: clock(),
      updated_at: clock(),
    }],
  });
  const env = authEnv(fakeDurableObjectNamespace(), {
    CLOUDFLARE_SITE_REGISTRY_DB: siteDb,
  });
  const summary = {
    schema: 'narada.sonar/webhook-delay-today-vs-yesterday/v1',
    generated_at: '2026-06-08T03:29:51.398Z',
    rows72: 4313,
    today: {
      latest: {
        at: '2026-06-08T03:27:50.000Z',
        at_ct: '2026-06-07 22:27:50',
        elapsed_minutes: 1349,
        delay_minutes: 2.0015182166666667,
      },
    },
    yesterday_same_clock: {
      delay_minutes: 0.6176430166666667,
      delta_minutes_today_minus_yesterday: 1.3838752,
    },
  };

  const recorded = await worker.fetch(jsonRequest({
    operation: 'webhook_delay.shadow_read.record',
    request_id: 'request_webhook_delay_shadow_read_record_ok',
    params: {
      site_id: 'site_fixture',
      observation_id: 'webhook_delay_shadow_fixture_ok',
      source_summary_path: '.ai/webhook-delay/latest/webhook-arrival-delay-today-vs-yesterday-summary.json',
      critical_minutes: 15,
      summary,
    },
  }, { token: 'test-admin-token', path: '/api/carrier' }), env);
  assert.equal(recorded.status, 200);
  const recordedBody = await recorded.json();
  assert.equal(recordedBody.status, 'recorded');
  assert.equal(recordedBody.shadow_mode, 'cloudflare_shadow_read');
  assert.equal(recordedBody.dispatch_authority, 'windows_primary_dispatcher');
  assert.equal(recordedBody.dispatch_action, 'none');
  assert.equal(recordedBody.classification.state, 'ok');
  assert.equal(recordedBody.classification.latest_delay_minutes, 2.0015182166666667);
  assert.equal(recordedBody.record.recorded_by_principal_id, 'admin');

  const critical = await worker.fetch(jsonRequest({
    operation: 'webhook_delay.shadow_read.record',
    request_id: 'request_webhook_delay_shadow_read_record_critical',
    params: {
      site_id: 'site_fixture',
      observation_id: 'webhook_delay_shadow_fixture_critical',
      critical_minutes: 15,
      summary: {
        ...summary,
        generated_at: '2026-06-08T03:30:51.398Z',
        today: { latest: { ...summary.today.latest, delay_minutes: 16 } },
      },
    },
  }, { token: 'test-admin-token', path: '/api/carrier' }), env);
  assert.equal(critical.status, 200);
  const criticalBody = await critical.json();
  assert.equal(criticalBody.classification.state, 'critical');
  assert.equal(criticalBody.classification.reason, 'webhook_delay_critical_threshold_crossed');
  assert.equal(criticalBody.classification.dispatch_action, 'none');

  const listed = await worker.fetch(jsonRequest({
    operation: 'webhook_delay.shadow_read.list',
    request_id: 'request_webhook_delay_shadow_read_list',
    params: { site_id: 'site_fixture', limit: 10 },
  }, { token: 'test-admin-token', path: '/api/carrier' }), env);
  assert.equal(listed.status, 200);
  const listedBody = await listed.json();
  assert.equal(listedBody.dispatch_authority, 'windows_primary_dispatcher');
  assert.equal(listedBody.dispatch_action, 'none');
  assert.deepEqual(listedBody.observations.map((entry) => entry.classification_state), ['critical', 'ok']);

  const siteRead = await worker.fetch(jsonRequest({
    operation: 'site.read',
    request_id: 'request_webhook_delay_shadow_read_site_read',
    params: { site_id: 'site_fixture', webhook_delay_shadow_limit: 10 },
  }, { token: 'test-admin-token', path: '/api/carrier' }), env);
  assert.equal(siteRead.status, 200);
  const siteReadBody = await siteRead.json();
  assert.deepEqual(siteReadBody.webhook_delay_shadow_observations.map((entry) => entry.classification_state), ['critical', 'ok']);

  const operationRead = await worker.fetch(jsonRequest({
    operation: 'operation.read',
    request_id: 'request_webhook_delay_shadow_read_operation_read',
    params: { site_id: 'site_fixture', operation_id: 'operation_webhook_delay', webhook_delay_shadow_limit: 10 },
  }, { token: 'test-admin-token', path: '/api/carrier' }), env);
  assert.equal(operationRead.status, 200);
  const operationReadBody = await operationRead.json();
  assert.equal(operationReadBody.operation_product_surface.webhook_delay_shadow_observation_count, 2);
  assert.equal(operationReadBody.operation_lifecycle_status.schema, 'narada.cloudflare_operation_lifecycle_status.v1');
  assert.equal(operationReadBody.operation_lifecycle_status.phase, 'active_uninhabited');
  assert.equal(operationReadBody.operation_lifecycle_status.health, 'incomplete');
  assert.deepEqual(operationReadBody.operation_lifecycle_status.missing, ['session', 'carrier_evidence', 'continuity_packet']);
  assert.equal(operationReadBody.operation_lifecycle_status.continuity_loop_state, 'no_loop_report_observed');
  assert.equal(operationReadBody.operation_product_surface.lifecycle_status.health, 'incomplete');
  assert.equal(operationReadBody.operation_posture_overview.schema, 'narada.cloudflare_operation_posture_overview.v1');
  assert.equal(operationReadBody.operation_posture_overview.operation_count, 1);
  assert.equal(operationReadBody.operation_posture_overview.active_operation_id, 'operation_webhook_delay');
  assert.equal(operationReadBody.operation_posture_overview.next_operation_id, 'operation_webhook_delay');
  assert.equal(operationReadBody.operation_posture_overview.next_status, 'needs_attention');
  assert.equal(operationReadBody.operation_posture_overview.next_action, 'start_or_select_session');
  assert.equal(operationReadBody.operation_posture_overview.next_reason, 'session');
  assert.deepEqual(operationReadBody.operation_product_surface.operation_posture_overview, operationReadBody.operation_posture_overview);
  assert.deepEqual(operationReadBody.operation_posture_route, {
    schema: 'narada.cloudflare_operation_posture_route.v1',
    domain: 'operation_posture',
    command_state: 'operation_posture_ready',
    command_action: 'monitor_operations',
    next_action: 'monitor_operations',
    target: 'operation_webhook_delay',
    status: 'ready',
    reason: 'session',
  });
  assert.deepEqual(operationReadBody.operation_product_surface.operation_posture_route, operationReadBody.operation_posture_route);
  assert.equal(operationReadBody.operation_product_surface.continuity_status.schema, 'narada.cloudflare_site_continuity_status.v1');
  assert.equal(operationReadBody.operation_product_surface.continuity_status.state, 'no_packet_observed');
  assert.equal(operationReadBody.operation_product_surface.continuity_status.packet_count, 0);
  assert.equal(operationReadBody.operation_product_surface.local_cloud_continuity_bridge.schema, 'narada.local_cloud_continuity_bridge.v1');
  assert.equal(operationReadBody.operation_product_surface.local_cloud_continuity_bridge.next_action, 'observe_continuity_packet');
  assert.equal(operationReadBody.operation_product_surface.dispatch_authority, 'windows_primary_dispatcher');
  assert.deepEqual(classifyCloudflareOperationCommandState({
    operation_id: operationReadBody.operation.operation_id,
    is_active: true,
    scope_loaded: true,
    session_count: operationReadBody.sessions.length,
    evidence_loaded: (operationReadBody.carrier_evidence || []).some((entry) => (entry.events || []).length > 0),
    operation_path_next_action: operationReadBody.sessions.length === 0 ? 'start_or_select_session' : 'read_operation_evidence',
  }), { command_state: 'session_needed', command_action: 'start_or_select_session', next_action: 'start_or_select_session' });
});

test('worker records webhook delay observation as Cloudflare primary with Windows fallback', async () => {
  const siteDb = fakeD1SiteRegistryDatabase({
    sites: [{
      site_id: 'site_fixture',
      site_ref: 'site://fixture',
      display_name: 'Fixture Site',
      status: 'active',
      created_at: clock(),
      updated_at: clock(),
      created_by_principal_id: 'admin',
    }],
    memberships: [{
      site_id: 'site_fixture',
      principal_id: 'admin',
      role: 'owner',
      status: 'active',
      created_at: clock(),
      updated_at: clock(),
    }],
    operations: [{
      operation_id: 'operation_webhook_delay',
      site_id: 'site_fixture',
      display_name: 'Webhook Delay Operation',
      operation_kind: 'operating_layer_update',
      status: 'active',
      created_by_principal_id: 'admin',
      created_at: clock(),
      updated_at: clock(),
    }],
  });
  const env = authEnv(fakeDurableObjectNamespace(), {
    CLOUDFLARE_SITE_REGISTRY_DB: siteDb,
  });
  const summary = {
    schema: 'narada.sonar/webhook-delay-today-vs-yesterday/v1',
    generated_at: '2026-06-08T06:05:00.000Z',
    rows72: 4313,
    today: {
      latest: {
        at: '2026-06-08T06:03:00.000Z',
        at_ct: '2026-06-08 01:03:00',
        elapsed_minutes: 1503,
        delay_minutes: 16,
      },
    },
    yesterday_same_clock: {
      delay_minutes: 1,
      delta_minutes_today_minus_yesterday: 15,
    },
  };

  const recorded = await worker.fetch(jsonRequest({
    operation: 'webhook_delay.observation.primary_with_fallback.record',
    request_id: 'request_webhook_delay_observation_primary_record',
    params: {
      site_id: 'site_fixture',
      observation_id: 'webhook_delay_observation_primary_fixture_1',
      source_summary_path: '.ai/webhook-delay/latest/webhook-arrival-delay-today-vs-yesterday-summary.json',
      critical_minutes: 15,
      summary,
    },
  }, { token: 'test-admin-token', path: '/api/carrier' }), env);
  assert.equal(recorded.status, 200);
  const recordedBody = await recorded.json();
  assert.equal(recordedBody.status, 'cloudflare_primary_recorded');
  assert.equal(recordedBody.observation_authority, 'cloudflare_primary_observation_read');
  assert.equal(recordedBody.fallback_authority, 'windows_observation_read_fallback');
  assert.equal(recordedBody.fallback_status, 'available');
  assert.equal(recordedBody.dispatch_authority, 'cloudflare_primary_dispatcher');
  assert.equal(recordedBody.dispatch_action, 'none');
  assert.equal(recordedBody.classification.state, 'critical');
  assert.equal(recordedBody.classification.read_mode, 'cloudflare_primary_with_windows_fallback');
  assert.equal(recordedBody.record.source_locus, 'cloudflare_carrier_site');
  assert.equal(recordedBody.record.source_material_locus, 'windows_local_site_summary');
  assert.deepEqual(recordedBody.record.retained_windows_authority, [
    'windows_observation_refresh_fallback',
    'mailbox_send',
    'local_filesystem_mutation',
    'task_lifecycle_write',
  ]);

  const listed = await worker.fetch(jsonRequest({
    operation: 'webhook_delay.observation.primary_with_fallback.list',
    request_id: 'request_webhook_delay_observation_primary_list',
    params: { site_id: 'site_fixture', limit: 10 },
  }, { token: 'test-admin-token', path: '/api/carrier' }), env);
  assert.equal(listed.status, 200);
  const listedBody = await listed.json();
  assert.equal(listedBody.observation_authority, 'cloudflare_primary_observation_read');
  assert.equal(listedBody.fallback_authority, 'windows_observation_read_fallback');
  assert.deepEqual(listedBody.observations.map((entry) => entry.observation_id), ['webhook_delay_observation_primary_fixture_1']);
  assert.equal(listedBody.observations[0].classification_state, 'critical');

  const operationRead = await worker.fetch(jsonRequest({
    operation: 'operation.read',
    request_id: 'request_webhook_delay_observation_primary_operation_read',
    params: { site_id: 'site_fixture', operation_id: 'operation_webhook_delay', webhook_delay_observation_primary_limit: 10 },
  }, { token: 'test-admin-token', path: '/api/carrier' }), env);
  assert.equal(operationRead.status, 200);
  const operationReadBody = await operationRead.json();
  assert.equal(operationReadBody.webhook_delay_observation_primary_reads[0].observation_id, 'webhook_delay_observation_primary_fixture_1');
  assert.equal(operationReadBody.operation_product_surface.webhook_delay_observation_primary_read_count, 1);

  const siteRead = await worker.fetch(jsonRequest({
    operation: 'site.read',
    request_id: 'request_webhook_delay_observation_primary_site_read',
    params: { site_id: 'site_fixture', webhook_delay_observation_primary_limit: 10 },
  }, { token: 'test-admin-token', path: '/api/carrier' }), env);
  assert.equal(siteRead.status, 200);
  const siteReadBody = await siteRead.json();
  assert.equal(siteReadBody.webhook_delay_observation_primary_reads[0].observation_id, 'webhook_delay_observation_primary_fixture_1');
});

test('worker reads webhook delay observation from Cloudflare remote source adapter', async () => {
  const siteDb = fakeD1SiteRegistryDatabase({
    sites: [{
      site_id: 'site_fixture',
      site_ref: 'site://fixture',
      display_name: 'Fixture Site',
      status: 'active',
      created_at: clock(),
      updated_at: clock(),
      created_by_principal_id: 'admin',
    }],
    memberships: [{
      site_id: 'site_fixture',
      principal_id: 'admin',
      role: 'owner',
      status: 'active',
      created_at: clock(),
      updated_at: clock(),
    }],
    operations: [{
      operation_id: 'operation_webhook_delay',
      site_id: 'site_fixture',
      display_name: 'Webhook Delay Operation',
      operation_kind: 'operating_layer_update',
      status: 'active',
      created_by_principal_id: 'admin',
      created_at: clock(),
      updated_at: clock(),
    }],
  });

  const env = authEnv(fakeDurableObjectNamespace(), {
    CLOUDFLARE_SITE_REGISTRY_DB: siteDb,
    CLOUDFLARE_WEBHOOK_DELAY_SCHEDULED_READ_ENABLED: '1',
    CLOUDFLARE_WEBHOOK_DELAY_SCHEDULED_SITE_ID: 'site_fixture',
    CLOUDFLARE_WEBHOOK_DELAY_SCHEDULED_SOURCE_ADAPTER_ID: 'fixture_webhook_delay_source',
    CLOUDFLARE_WEBHOOK_DELAY_CRITICAL_MINUTES: '15',
  });

  const putSamples = await worker.fetch(jsonRequest({
    operation: 'webhook_delay.remote_source.samples.put',
    request_id: 'request_webhook_delay_remote_source_samples_put',
    params: {
      site_id: 'site_fixture',
      source_adapter_id: 'fixture_webhook_delay_source',
      samples: [{
        sample_id: 'webhook_delay_source_sample_today',
        sample_role: 'today_latest',
        observed_at: '2026-06-08T06:20:00.000Z',
        observed_at_ct: 'Jun 08, 1:20 AM CDT',
        elapsed_minutes: 80,
        delay_minutes: 18,
      }, {
        sample_id: 'webhook_delay_source_sample_yesterday',
        sample_role: 'yesterday_same_clock',
        observed_at: '2026-06-07T06:20:00.000Z',
        observed_at_ct: 'Jun 07, 1:20 AM CDT',
        elapsed_minutes: 80,
        delay_minutes: 2,
      }],
    },
  }, { token: 'test-admin-token', path: '/api/carrier' }), env);
  assert.equal(putSamples.status, 200);
  const putSamplesBody = await putSamples.json();
  assert.equal(putSamplesBody.status, 'samples_recorded');
  assert.equal(putSamplesBody.source_authority, 'cloudflare_webhook_delay_remote_source_adapter');
  assert.equal(putSamplesBody.sample_count, 2);

  const read = await worker.fetch(jsonRequest({
    operation: 'webhook_delay.remote_source.primary_with_fallback.read',
    request_id: 'request_webhook_delay_remote_source_read',
    params: {
      site_id: 'site_fixture',
      source_adapter_id: 'fixture_webhook_delay_source',
      observation_id: 'webhook_delay_remote_source_observation_fixture_1',
      critical_minutes: 15,
    },
  }, { token: 'test-admin-token', path: '/api/carrier' }), env);
  assert.equal(read.status, 200);
  const readBody = await read.json();
  assert.equal(readBody.status, 'cloudflare_primary_recorded');
  assert.equal(readBody.source_authority, 'cloudflare_webhook_delay_remote_source_adapter');
  assert.equal(readBody.source_material_locus, 'cloudflare_remote_source_adapter');
  assert.equal(readBody.source_sample_count, 2);
  assert.equal(readBody.observation.source_schema, 'narada.sonar/webhook-delay-remote-source-adapter/v1');
  assert.equal(readBody.observation.latest.delay_minutes, 18);
  assert.equal(readBody.observation.yesterday_same_clock.delay_minutes, 2);
  assert.equal(readBody.classification.state, 'critical');
  assert.equal(readBody.record.source_material_locus, 'cloudflare_remote_source_adapter');
  assert.equal(readBody.record.fallback_authority, 'windows_observation_read_fallback');

  const listedSamples = await worker.fetch(jsonRequest({
    operation: 'webhook_delay.remote_source.samples.list',
    request_id: 'request_webhook_delay_remote_source_samples_list',
    params: { site_id: 'site_fixture', source_adapter_id: 'fixture_webhook_delay_source', limit: 10 },
  }, { token: 'test-admin-token', path: '/api/carrier' }), env);
  assert.equal(listedSamples.status, 200);
  const listedSamplesBody = await listedSamples.json();
  assert.deepEqual(listedSamplesBody.samples.map((sample) => sample.sample_id), [
    'webhook_delay_source_sample_today',
    'webhook_delay_source_sample_yesterday',
  ]);

  const operationRead = await worker.fetch(jsonRequest({
    operation: 'operation.read',
    request_id: 'request_webhook_delay_remote_source_operation_read',
    params: { site_id: 'site_fixture', operation_id: 'operation_webhook_delay', webhook_delay_observation_primary_limit: 10 },
  }, { token: 'test-admin-token', path: '/api/carrier' }), env);
  assert.equal(operationRead.status, 200);
  const operationReadBody = await operationRead.json();
  assert.equal(operationReadBody.webhook_delay_observation_primary_reads[0].observation_id, 'webhook_delay_remote_source_observation_fixture_1');
  assert.equal(operationReadBody.webhook_delay_observation_primary_reads[0].record.source_material_locus, 'cloudflare_remote_source_adapter');

  const scheduledRun = await worker.fetch(jsonRequest({
    operation: 'webhook_delay.remote_source.scheduled_read.run',
    request_id: 'request_webhook_delay_scheduled_source_read_run',
    params: {
      site_id: 'site_fixture',
      source_adapter_id: 'fixture_webhook_delay_source',
      scheduled_run_id: 'webhook_delay_scheduled_source_read_fixture_1',
      observation_id: 'webhook_delay_scheduled_source_observation_fixture_1',
      scheduled_time: '2026-06-08T06:30:00.000Z',
      trigger_kind: 'operator_requested',
      critical_minutes: 15,
    },
  }, { token: 'test-admin-token', path: '/api/carrier' }), env);
  assert.equal(scheduledRun.status, 200);
  const scheduledRunBody = await scheduledRun.json();
  assert.equal(scheduledRunBody.status, 'cloudflare_scheduled_read_recorded');
  assert.equal(scheduledRunBody.trigger_authority, 'cloudflare_cron_trigger');
  assert.equal(scheduledRunBody.source_authority, 'cloudflare_webhook_delay_remote_source_adapter');
  assert.equal(scheduledRunBody.source_material_locus, 'cloudflare_remote_source_adapter');
  assert.equal(scheduledRunBody.source_sample_count, 2);
  assert.equal(scheduledRunBody.classification_state, 'critical');
  assert.equal(scheduledRunBody.fallback_authority, 'windows_observation_read_fallback');
  assert.equal(scheduledRunBody.fallback_status, 'available');

  const scheduledPromises = [];
  await worker.scheduled({ cron: '* * * * *', scheduledTime: Date.parse('2026-06-08T06:31:00.000Z') }, env, {
    waitUntil(promise) { scheduledPromises.push(promise); },
  });
  await Promise.all(scheduledPromises);

  const scheduledList = await worker.fetch(jsonRequest({
    operation: 'webhook_delay.remote_source.scheduled_read.list',
    request_id: 'request_webhook_delay_scheduled_source_read_list',
    params: { site_id: 'site_fixture', limit: 10 },
  }, { token: 'test-admin-token', path: '/api/carrier' }), env);
  assert.equal(scheduledList.status, 200);
  const scheduledListBody = await scheduledList.json();
  assert.equal(scheduledListBody.trigger_authority, 'cloudflare_cron_trigger');
  assert.equal(scheduledListBody.runs.length, 2);
  assert.equal(scheduledListBody.runs[0].source_adapter_id, 'fixture_webhook_delay_source');
  assert.equal(scheduledListBody.runs[0].source_material_locus, 'cloudflare_remote_source_adapter');
  assert.equal(scheduledListBody.runs[0].classification_state, 'critical');

  const scheduledOperationRead = await worker.fetch(jsonRequest({
    operation: 'operation.read',
    request_id: 'request_webhook_delay_scheduled_source_operation_read',
    params: { site_id: 'site_fixture', operation_id: 'operation_webhook_delay', webhook_delay_scheduled_source_read_limit: 10 },
  }, { token: 'test-admin-token', path: '/api/carrier' }), env);
  assert.equal(scheduledOperationRead.status, 200);
  const scheduledOperationReadBody = await scheduledOperationRead.json();
  assert.equal(scheduledOperationReadBody.webhook_delay_scheduled_source_reads.length, 2);
  assert.equal(scheduledOperationReadBody.operation_product_surface.webhook_delay_scheduled_source_read_count, 2);
});

test('worker reads webhook delay observation from direct remote metric source', async () => {
  const siteDb = fakeD1SiteRegistryDatabase({
    sites: [{
      site_id: 'site_fixture',
      site_ref: 'site://fixture',
      display_name: 'Fixture Site',
      status: 'active',
      created_at: clock(),
      updated_at: clock(),
      created_by_principal_id: 'admin',
    }],
    memberships: [{
      site_id: 'site_fixture',
      principal_id: 'admin',
      role: 'owner',
      status: 'active',
      created_at: clock(),
      updated_at: clock(),
    }],
    operations: [{
      operation_id: 'operation_webhook_delay',
      site_id: 'site_fixture',
      display_name: 'Webhook Delay Operation',
      operation_kind: 'operating_layer_update',
      status: 'active',
      created_by_principal_id: 'admin',
      created_at: clock(),
      updated_at: clock(),
    }],
  });
  const env = authEnv(fakeDurableObjectNamespace(), {
    CLOUDFLARE_SITE_REGISTRY_DB: siteDb,
    CLOUDFLARE_WEBHOOK_DELAY_DIRECT_SOURCE_ALLOW_OPERATOR_URL: '1',
    CLOUDFLARE_WEBHOOK_DELAY_DIRECT_SOURCE_ADAPTER_ID: 'fixture_direct_metric_source',
  });
  const originalFetch = globalThis.fetch;
  const fetches = [];
  globalThis.fetch = async (url, init = {}) => {
    fetches.push({ url: String(url), authorization: init.headers?.authorization ?? null });
    assert.equal(String(url), 'https://metrics.example.test/webhook-delay.json');
    return new Response(JSON.stringify({
      schema: 'narada.sonar.webhook_delay_remote_metric_rows.v1',
      generated_at: '2026-06-08T07:20:00.000Z',
      rows: [{
        id: 1,
        created_at: '2026-06-08T07:10:00.000Z',
        delay_minutes: 3,
        last_event_datetime_that_arrived: '2026-06-08T07:07:00.000Z',
      }, {
        id: 2,
        created_at: '2026-06-08T07:20:00.000Z',
        delay_minutes: 19,
        last_event_datetime_that_arrived: '2026-06-08T07:01:00.000Z',
      }],
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  try {
    const read = await worker.fetch(jsonRequest({
      operation: 'webhook_delay.remote_metric.direct_source.read',
      request_id: 'request_webhook_delay_direct_metric_source_read',
      params: {
        site_id: 'site_fixture',
        source_url: 'https://metrics.example.test/webhook-delay.json',
        observation_id: 'webhook_delay_direct_metric_observation_fixture_1',
        critical_minutes: 15,
      },
    }, { token: 'test-admin-token', path: '/api/carrier' }), env);
    assert.equal(read.status, 200);
    const readBody = await read.json();
    assert.equal(fetches.length, 1);
    assert.equal(readBody.status, 'direct_remote_metric_source_recorded');
    assert.equal(readBody.schema, 'narada.sonar.cloudflare_webhook_delay_direct_remote_metric_source.v1');
    assert.equal(readBody.source_authority, 'cloudflare_webhook_delay_direct_remote_metric_source_adapter');
    assert.equal(readBody.source_material_locus, 'direct_remote_metric_source');
    assert.equal(readBody.direct_source_url_host, 'metrics.example.test');
    assert.equal(readBody.direct_source_sample_count, 2);
    assert.equal(readBody.source_sample_count, 2);
    assert.equal(readBody.observation.latest.delay_minutes, 19);
    assert.equal(readBody.classification.state, 'critical');
    assert.equal(readBody.record.source_material_locus, 'direct_remote_metric_source');
    assert.equal(readBody.fallback_authority, 'windows_observation_read_fallback');

    const listedSamples = await worker.fetch(jsonRequest({
      operation: 'webhook_delay.remote_source.samples.list',
      request_id: 'request_webhook_delay_direct_metric_samples_list',
      params: { site_id: 'site_fixture', source_adapter_id: 'fixture_direct_metric_source', limit: 10 },
    }, { token: 'test-admin-token', path: '/api/carrier' }), env);
    assert.equal(listedSamples.status, 200);
    const listedSamplesBody = await listedSamples.json();
    assert.equal(listedSamplesBody.samples.length, 2);
    assert.equal(listedSamplesBody.samples[0].sample.source_record.direct_source_url_host, 'metrics.example.test');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('worker records webhook delay directive intent as dual-recorded carrier input without delivery', async () => {
  const siteDb = fakeD1SiteRegistryDatabase({
    sites: [{
      site_id: 'site_fixture',
      site_ref: 'site://fixture',
      display_name: 'Fixture Site',
      status: 'active',
      created_at: clock(),
      updated_at: clock(),
      created_by_principal_id: 'admin',
    }],
    memberships: [{
      site_id: 'site_fixture',
      principal_id: 'admin',
      role: 'owner',
      status: 'active',
      created_at: clock(),
      updated_at: clock(),
    }],
    operations: [{
      operation_id: 'operation_webhook_delay',
      site_id: 'site_fixture',
      display_name: 'Webhook Delay Operation',
      operation_kind: 'operating_layer_update',
      status: 'active',
      created_by_principal_id: 'admin',
      created_at: clock(),
      updated_at: clock(),
    }],
  });
  const env = authEnv(fakeDurableObjectNamespace(), { CLOUDFLARE_SITE_REGISTRY_DB: siteDb });
  const summary = {
    schema: 'narada.sonar/webhook-delay-today-vs-yesterday/v1',
    generated_at: '2026-06-08T04:40:00.000Z',
    rows72: 4313,
    today: {
      latest: {
        at: '2026-06-08T04:38:00.000Z',
        at_ct: '2026-06-07 23:38:00',
        elapsed_minutes: 1400,
        delay_minutes: 16,
      },
    },
    yesterday_same_clock: {
      delay_minutes: 1,
      delta_minutes_today_minus_yesterday: 15,
    },
  };

  const recorded = await worker.fetch(jsonRequest({
    operation: 'webhook_delay.directive.dual_record.record',
    request_id: 'request_webhook_delay_directive_dual_record',
    params: {
      site_id: 'site_fixture',
      operation_id: 'operation_webhook_delay',
      directive_record_id: 'webhook_delay_directive_fixture_1',
      directive_id: 'directive_webhook_delay_fixture_1',
      input_event_id: 'input_webhook_delay_directive_fixture_1',
      critical_minutes: 15,
      summary,
    },
  }, { token: 'test-admin-token', path: '/api/carrier' }), env);
  assert.equal(recorded.status, 200);
  const recordedBody = await recorded.json();
  assert.equal(recordedBody.status, 'recorded');
  assert.equal(recordedBody.classification.state, 'critical');
  assert.equal(recordedBody.threshold_policy.critical_minutes, 15);
  assert.equal(recordedBody.directive_action, 'record_directive_emission_intent');
  assert.equal(recordedBody.directive_authority, 'cloudflare_directive_dual_recorded');
  assert.equal(recordedBody.fallback_authority, 'windows_fallback_dispatcher');
  assert.equal(recordedBody.directive_intent.carrier_input_operation, 'carrier.input.record');
  assert.equal(recordedBody.directive_intent.delivery_semantics, 'record_only');
  assert.equal(recordedBody.directive_intent.input_event.source_kind, 'system');
  assert.equal(recordedBody.directive_intent.input_event.metadata.directive.visibility, 'record_only');
  assert.equal(recordedBody.carrier_admission.admission_action, 'admit');
  assert.equal(recordedBody.carrier_admission.is_directive, true);
  assert.equal(recordedBody.carrier_admission.directive_visibility, 'record_only');
  assert.equal(recordedBody.carrier_admission.dispatch_to_provider, false);
  assert.equal(recordedBody.carrier_admission.complete_without_provider, true);
  assert.equal(recordedBody.carrier_admission.admission_events.some((event) => event.event_kind === 'directive_receipt_recorded'), true);
  assert.equal(recordedBody.carrier_admission.admission_events.some((event) => event.event_kind === 'input_admitted_to_turn'), false);
  assert.deepEqual(recordedBody.record.retained_windows_authority, [
    'mailbox_send',
    'local_filesystem_mutation',
    'task_lifecycle_write',
    'windows_fallback_dispatch',
  ]);
  assert.equal(siteDb.dump().carrierSessions.length, 0);

  const listed = await worker.fetch(jsonRequest({
    operation: 'webhook_delay.directive.dual_record.list',
    request_id: 'request_webhook_delay_directive_dual_record_list',
    params: { site_id: 'site_fixture', limit: 10 },
  }, { token: 'test-admin-token', path: '/api/carrier' }), env);
  assert.equal(listed.status, 200);
  const listedBody = await listed.json();
  assert.equal(listedBody.directive_action, 'record_directive_emission_intent');
  assert.deepEqual(listedBody.directive_records.map((entry) => entry.directive_record_id), ['webhook_delay_directive_fixture_1']);
  assert.equal(listedBody.directive_records[0].carrier_admission.dispatch_to_provider, false);

  const operationRead = await worker.fetch(jsonRequest({
    operation: 'operation.read',
    request_id: 'request_webhook_delay_directive_dual_record_operation_read',
    params: { site_id: 'site_fixture', operation_id: 'operation_webhook_delay', webhook_delay_directive_limit: 10 },
  }, { token: 'test-admin-token', path: '/api/carrier' }), env);
  assert.equal(operationRead.status, 200);
  const operationReadBody = await operationRead.json();
  assert.equal(operationReadBody.webhook_delay_directive_records[0].directive_record_id, 'webhook_delay_directive_fixture_1');
  assert.equal(operationReadBody.operation_product_surface.webhook_delay_directive_record_count, 1);
});

test('worker delivers webhook delay directive as Cloudflare primary with Windows fallback recorded', async () => {
  const siteDb = fakeD1SiteRegistryDatabase({
    sites: [{
      site_id: 'site_fixture',
      site_ref: 'site://fixture',
      display_name: 'Fixture Site',
      status: 'active',
      created_at: clock(),
      updated_at: clock(),
      created_by_principal_id: 'admin',
    }],
    memberships: [{
      site_id: 'site_fixture',
      principal_id: 'admin',
      role: 'owner',
      status: 'active',
      created_at: clock(),
      updated_at: clock(),
    }],
    operations: [{
      operation_id: 'operation_webhook_delay',
      site_id: 'site_fixture',
      display_name: 'Webhook Delay Operation',
      operation_kind: 'operating_layer_update',
      status: 'active',
      created_by_principal_id: 'admin',
      created_at: clock(),
      updated_at: clock(),
    }],
  });
  const durableEnv = {
    AI: {
      async run() {
        return { response: 'Operation: Update on webhook delays acknowledged.' };
      },
    },
  };
  const env = authEnv(fakeDurableObjectNamespace(durableEnv), { CLOUDFLARE_SITE_REGISTRY_DB: siteDb });
  const summary = {
    schema: 'narada.sonar/webhook-delay-today-vs-yesterday/v1',
    generated_at: '2026-06-08T04:45:00.000Z',
    rows72: 4313,
    today: {
      latest: {
        at: '2026-06-08T04:43:00.000Z',
        at_ct: '2026-06-07 23:43:00',
        elapsed_minutes: 1405,
        delay_minutes: 16,
      },
    },
    yesterday_same_clock: {
      delay_minutes: 1,
      delta_minutes_today_minus_yesterday: 15,
    },
  };

  const delivered = await worker.fetch(jsonRequest({
    operation: 'webhook_delay.directive.primary_with_fallback.deliver',
    request_id: 'request_webhook_delay_directive_delivery',
    params: {
      site_id: 'site_fixture',
      site_ref: 'site://fixture',
      operation_id: 'operation_webhook_delay',
      carrier_session_id: 'carrier_session_webhook_delay_directive_fixture',
      delivery_id: 'webhook_delay_directive_delivery_fixture_1',
      directive_record_id: 'webhook_delay_directive_fixture_1',
      directive_id: 'directive_webhook_delay_delivery_fixture_1',
      input_event_id: 'input_webhook_delay_directive_delivery_fixture_1',
      critical_minutes: 15,
      summary,
    },
  }, { token: 'test-admin-token', path: '/api/carrier' }), env);
  assert.equal(delivered.status, 200);
  const deliveredBody = await delivered.json();
  assert.equal(deliveredBody.status, 'cloudflare_primary_delivered');
  assert.equal(deliveredBody.directive_authority, 'cloudflare_primary_directive_delivery');
  assert.equal(deliveredBody.dispatch_authority, 'cloudflare_primary_dispatcher');
  assert.equal(deliveredBody.fallback_authority, 'windows_fallback_dispatcher');
  assert.equal(deliveredBody.fallback_status, 'available');
  assert.equal(deliveredBody.delivery_action, 'cloudflare_carrier_input_deliver');
  assert.equal(deliveredBody.carrier_session_id, 'carrier_session_webhook_delay_directive_fixture');
  assert.equal(deliveredBody.directive_intent.carrier_input_operation, 'carrier.input.deliver');
  assert.equal(deliveredBody.directive_intent.delivery_semantics, 'cloudflare_primary_delivery');
  assert.equal(deliveredBody.directive_intent.input_event.source_kind, 'system');
  assert.equal(deliveredBody.directive_intent.input_event.metadata.directive.visibility, 'agent_visible');
  assert.equal(deliveredBody.carrier_admission.admission_action, 'admit');
  assert.equal(deliveredBody.carrier_admission.is_directive, true);
  assert.equal(deliveredBody.carrier_admission.directive_visibility, 'agent_visible');
  assert.equal(deliveredBody.carrier_admission.dispatch_to_provider, true);
  assert.equal(deliveredBody.carrier_admission.directive_render_to_agent, true);
  assert.equal(deliveredBody.carrier_admission.creates_turn, true);
  assert.equal(deliveredBody.delivery.admitted, true);
  assert.equal(deliveredBody.delivery.terminal_state, 'completed');
  assert.equal(deliveredBody.delivery.events.some((event) => event.event_kind === 'carrier_session_started'), false);
  assert.equal(deliveredBody.delivery.events.some((event) => event.event_kind === 'directive_receipt_recorded'), true);
  assert.equal(deliveredBody.delivery.events.some((event) => event.event_kind === 'input_admitted_to_turn'), true);
  assert.equal(deliveredBody.delivery.events.some((event) => event.event_kind === 'provider_request_recorded'), true);
  assert.equal(deliveredBody.record.session_start_ok, true);
  assert.equal(deliveredBody.record.delivery_ok, true);
  assert.deepEqual(deliveredBody.record.retained_windows_authority, [
    'mailbox_send',
    'local_filesystem_mutation',
    'task_lifecycle_write',
    'windows_fallback_dispatch',
  ]);
  assert.equal(siteDb.dump().carrierSessions.some((session) => session.carrier_session_id === 'carrier_session_webhook_delay_directive_fixture'), true);

  const listed = await worker.fetch(jsonRequest({
    operation: 'webhook_delay.directive.primary_with_fallback.list',
    request_id: 'request_webhook_delay_directive_delivery_list',
    params: { site_id: 'site_fixture', limit: 10 },
  }, { token: 'test-admin-token', path: '/api/carrier' }), env);
  assert.equal(listed.status, 200);
  const listedBody = await listed.json();
  assert.equal(listedBody.directive_authority, 'cloudflare_primary_directive_delivery');
  assert.deepEqual(listedBody.directive_deliveries.map((entry) => entry.delivery_id), ['webhook_delay_directive_delivery_fixture_1']);
  assert.equal(listedBody.directive_deliveries[0].delivery_state, 'cloudflare_primary_delivered');
  assert.equal(listedBody.directive_deliveries[0].delivery_ok, true);

  const operationRead = await worker.fetch(jsonRequest({
    operation: 'operation.read',
    request_id: 'request_webhook_delay_directive_delivery_operation_read',
    params: { site_id: 'site_fixture', operation_id: 'operation_webhook_delay', webhook_delay_directive_delivery_limit: 10, carrier_event_limit: 20 },
  }, { token: 'test-admin-token', path: '/api/carrier' }), env);
  assert.equal(operationRead.status, 200);
  const operationReadBody = await operationRead.json();
  assert.equal(operationReadBody.webhook_delay_directive_deliveries[0].delivery_id, 'webhook_delay_directive_delivery_fixture_1');
  assert.equal(operationReadBody.operation_product_surface.webhook_delay_directive_delivery_count, 1);
  assert.equal(operationReadBody.sessions.some((session) => session.carrier_session_id === 'carrier_session_webhook_delay_directive_fixture'), true);
  assert.equal(operationReadBody.carrier_evidence.some((entry) => entry.carrier_session_id === 'carrier_session_webhook_delay_directive_fixture' && entry.events.some((event) => event.event_kind === 'directive_receipt_recorded')), true);
});

test('worker records resident loop runs as Cloudflare shadow-read evidence without dispatching', async () => {
  const siteDb = fakeD1SiteRegistryDatabase({
    sites: [{
      site_id: 'site_fixture',
      site_ref: 'site://fixture',
      display_name: 'Fixture Site',
      status: 'active',
      created_at: clock(),
      updated_at: clock(),
      created_by_principal_id: 'admin',
    }],
    memberships: [{
      site_id: 'site_fixture',
      principal_id: 'admin',
      role: 'owner',
      status: 'active',
      created_at: clock(),
      updated_at: clock(),
    }],
    operations: [{
      operation_id: 'operation_resident_loop',
      site_id: 'site_fixture',
      display_name: 'Resident Loop Operation',
      operation_kind: 'operating_layer_update',
      status: 'active',
      created_by_principal_id: 'admin',
      created_at: clock(),
      updated_at: clock(),
    }],
  });
  const env = authEnv(fakeDurableObjectNamespace(), { CLOUDFLARE_SITE_REGISTRY_DB: siteDb });
  const loopRun = {
    operation_id: 'operation_resident_loop',
    run_started_at: '2026-06-08T04:10:00.000Z',
    run_finished_at: '2026-06-08T04:10:05.000Z',
    status: 'attention_recorded',
    steps: [{ step_id: 'refresh_webhook_delay', status: 'ok' }],
    operator_attention: [{ attention_id: 'pending_directive_stale', severity: 'warning' }],
  };

  const recorded = await worker.fetch(jsonRequest({
    operation: 'resident_loop.shadow_read.record',
    request_id: 'request_resident_loop_shadow_read_record',
    params: {
      site_id: 'site_fixture',
      loop_run_id: 'resident_loop_shadow_fixture_1',
      source_summary_path: '.ai/operator-attention/operator_attention_operating-layer_pending_directive_stale_pending_directive_stale.json',
      loop_run: loopRun,
    },
  }, { token: 'test-admin-token', path: '/api/carrier' }), env);
  assert.equal(recorded.status, 200);
  const recordedBody = await recorded.json();
  assert.equal(recordedBody.status, 'recorded');
  assert.equal(recordedBody.shadow_mode, 'cloudflare_shadow_read');
  assert.equal(recordedBody.dispatch_authority, 'windows_primary_dispatcher');
  assert.equal(recordedBody.dispatch_action, 'none');
  assert.equal(recordedBody.loop_run.step_count, 1);
  assert.equal(recordedBody.loop_run.operator_attention_count, 1);
  assert.equal(recordedBody.record.recorded_by_principal_id, 'admin');

  const listed = await worker.fetch(jsonRequest({
    operation: 'resident_loop.shadow_read.list',
    request_id: 'request_resident_loop_shadow_read_list',
    params: { site_id: 'site_fixture', limit: 10 },
  }, { token: 'test-admin-token', path: '/api/carrier' }), env);
  assert.equal(listed.status, 200);
  const listedBody = await listed.json();
  assert.equal(listedBody.dispatch_authority, 'windows_primary_dispatcher');
  assert.equal(listedBody.dispatch_action, 'none');
  assert.deepEqual(listedBody.loop_runs.map((entry) => entry.loop_status), ['attention_recorded']);

  const siteRead = await worker.fetch(jsonRequest({
    operation: 'site.read',
    request_id: 'request_resident_loop_shadow_read_site_read',
    params: { site_id: 'site_fixture', resident_loop_shadow_limit: 10 },
  }, { token: 'test-admin-token', path: '/api/carrier' }), env);
  assert.equal(siteRead.status, 200);
  const siteReadBody = await siteRead.json();
  assert.equal(siteReadBody.resident_loop_shadow_runs[0].loop_run_id, 'resident_loop_shadow_fixture_1');

  const operationRead = await worker.fetch(jsonRequest({
    operation: 'operation.read',
    request_id: 'request_resident_loop_shadow_read_operation_read',
    params: { site_id: 'site_fixture', operation_id: 'operation_resident_loop', resident_loop_shadow_limit: 10 },
  }, { token: 'test-admin-token', path: '/api/carrier' }), env);
  assert.equal(operationRead.status, 200);
  const operationReadBody = await operationRead.json();
  assert.equal(operationReadBody.operation_product_surface.resident_loop_shadow_run_count, 1);
  assert.equal(operationReadBody.operation_product_surface.dispatch_authority, 'windows_primary_dispatcher');
});

test('worker records task lifecycle shadow reads from Windows without admitting Cloudflare writes', async () => {
  const siteDb = fakeD1SiteRegistryDatabase({
    sites: [{
      site_id: 'site_fixture',
      site_ref: 'site://fixture',
      display_name: 'Fixture Site',
      status: 'active',
      created_at: clock(),
      updated_at: clock(),
      created_by_principal_id: 'admin',
    }],
    memberships: [{
      site_id: 'site_fixture',
      principal_id: 'admin',
      role: 'owner',
      status: 'active',
      created_at: clock(),
      updated_at: clock(),
    }],
    operations: [{
      operation_id: 'operation_task_lifecycle',
      site_id: 'site_fixture',
      display_name: 'Task Lifecycle Operation',
      operation_kind: 'operating_layer_update',
      status: 'active',
      created_by_principal_id: 'admin',
      created_at: clock(),
      updated_at: clock(),
    }],
  });
  const env = authEnv(fakeDurableObjectNamespace(), {
    CLOUDFLARE_SITE_REGISTRY_DB: siteDb,
    CLOUDFLARE_TASK_LIFECYCLE_SHADOW_READ_ALLOW_OPERATOR_URL: '1',
  });
  const payload = {
    schema: 'narada.sonar.task_lifecycle_shadow_read.v1',
    status: 'ok',
    generated_at: '2026-06-08T17:18:04.097Z',
    authority_locus: 'windows_local_site',
    shadow_target_locus: 'cloudflare_carrier_site',
    mutation_authority: 'windows_task_lifecycle_sqlite',
    shadow_read_posture: 'read_only_projection',
    cloudflare_write_admission: 'not_admitted',
    source_db_path: 'D:/code/narada.sonar/.ai/task-lifecycle.db',
    limit: 5,
    task_count: 2,
    status_counts: { claimed: 1, closed: 1 },
    tasks: [
      { task_id: 'task-2', task_number: 2, status: 'closed', governed_by: 'architect', updated_at: '2026-06-08T11:00:00.000Z', closed_at: '2026-06-08T11:30:00.000Z', active_assignment_count: 0, report_count: 1 },
      { task_id: 'task-1', task_number: 1, status: 'claimed', governed_by: 'architect', updated_at: '2026-06-08T10:00:00.000Z', closed_at: null, active_assignment_count: 1, report_count: 0 },
    ],
  };

  const recorded = await worker.fetch(jsonRequest({
    operation: 'task_lifecycle.shadow_read.record',
    request_id: 'request_task_lifecycle_shadow_read_record',
    params: {
      site_id: 'site_fixture',
      read_id: 'task_lifecycle_shadow_fixture_1',
      source_payload: payload,
    },
  }, { token: 'test-admin-token', path: '/api/carrier' }), env);
  assert.equal(recorded.status, 200);
  const recordedBody = await recorded.json();
  assert.equal(recordedBody.status, 'recorded');
  assert.equal(recordedBody.shadow_mode, 'cloudflare_shadow_read');
  assert.equal(recordedBody.mutation_authority, 'windows_task_lifecycle_sqlite');
  assert.equal(recordedBody.cloudflare_write_admission, 'not_admitted');
  assert.equal(recordedBody.dispatch_authority, 'windows_primary_dispatcher');
  assert.equal(recordedBody.dispatch_action, 'none');
  assert.equal(recordedBody.read.task_count, 2);
  assert.equal(recordedBody.record.recorded_by_principal_id, 'admin');

  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async (url, init = {}) => {
      assert.match(String(url), /limit=2/);
      assert.equal(init.headers.authorization, 'Bearer source-token');
      return new Response(JSON.stringify({ ...payload, generated_at: '2026-06-08T17:19:04.097Z', task_count: 1, tasks: payload.tasks.slice(0, 1) }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    };
    const sourceRead = await worker.fetch(jsonRequest({
      operation: 'task_lifecycle.shadow_read.source.read',
      request_id: 'request_task_lifecycle_shadow_source_read',
      params: {
        site_id: 'site_fixture',
        read_id: 'task_lifecycle_shadow_fixture_source_1',
        source_url: 'https://windows-source.test/task-lifecycle/shadow-read',
        source_token: 'source-token',
        limit: 2,
      },
    }, { token: 'test-admin-token', path: '/api/carrier' }), env);
    assert.equal(sourceRead.status, 200);
    const sourceReadBody = await sourceRead.json();
    assert.equal(sourceReadBody.status, 'source_read_recorded');
    assert.equal(sourceReadBody.record.source_url_host, 'windows-source.test');
    assert.equal(sourceReadBody.record.cloudflare_write_admission, 'not_admitted');
  } finally {
    globalThis.fetch = originalFetch;
  }

  const listed = await worker.fetch(jsonRequest({
    operation: 'task_lifecycle.shadow_read.list',
    request_id: 'request_task_lifecycle_shadow_read_list',
    params: { site_id: 'site_fixture', limit: 10 },
  }, { token: 'test-admin-token', path: '/api/carrier' }), env);
  assert.equal(listed.status, 200);
  const listedBody = await listed.json();
  assert.equal(listedBody.mutation_authority, 'windows_task_lifecycle_sqlite');
  assert.equal(listedBody.cloudflare_write_admission, 'not_admitted');
  assert.equal(listedBody.dispatch_authority, 'windows_primary_dispatcher');
  assert.deepEqual(listedBody.reads.map((entry) => entry.cloudflare_write_admission), ['not_admitted', 'not_admitted']);

  const siteRead = await worker.fetch(jsonRequest({
    operation: 'site.read',
    request_id: 'request_task_lifecycle_shadow_read_site_read',
    params: { site_id: 'site_fixture', task_lifecycle_shadow_limit: 10 },
  }, { token: 'test-admin-token', path: '/api/carrier' }), env);
  assert.equal(siteRead.status, 200);
  const siteReadBody = await siteRead.json();
  assert.equal(siteReadBody.task_lifecycle_shadow_reads.length, 2);

  const operationRead = await worker.fetch(jsonRequest({
    operation: 'operation.read',
    request_id: 'request_task_lifecycle_shadow_read_operation_read',
    params: { site_id: 'site_fixture', operation_id: 'operation_task_lifecycle', task_lifecycle_shadow_limit: 10 },
  }, { token: 'test-admin-token', path: '/api/carrier' }), env);
  assert.equal(operationRead.status, 200);
  const operationReadBody = await operationRead.json();
  assert.equal(operationReadBody.task_lifecycle_shadow_reads.length, 2);
  assert.equal(operationReadBody.operation_product_surface.task_lifecycle_shadow_read_count, 2);
  assert.equal(operationReadBody.operation_product_surface.task_lifecycle_mutation_authority, 'windows_task_lifecycle_sqlite');
  assert.equal(operationReadBody.operation_product_surface.task_lifecycle_cloudflare_write_admission, 'not_admitted');

  const refusedWrite = await worker.fetch(jsonRequest({
    operation: 'task_lifecycle.write_admission.classify',
    request_id: 'request_task_lifecycle_write_admission_refuse',
    params: { site_id: 'site_fixture', admission_id: 'task_lifecycle_write_admission_refuse_1', mutation_class: 'task_finish' },
  }, { token: 'test-admin-token', path: '/api/carrier' }), env);
  assert.equal(refusedWrite.status, 200);
  const refusedWriteBody = await refusedWrite.json();
  assert.equal(refusedWriteBody.status, 'admission_recorded');
  assert.equal(refusedWriteBody.decision.action, 'refuse');
  assert.equal(refusedWriteBody.decision.reason, 'windows_task_lifecycle_mutation_authority_retained');
  assert.equal(refusedWriteBody.write_effect, 'none');
  assert.equal(refusedWriteBody.cloudflare_write_admission, 'not_admitted');

  const admittedProjection = await worker.fetch(jsonRequest({
    operation: 'task_lifecycle.write_admission.classify',
    request_id: 'request_task_lifecycle_write_admission_projection',
    params: { site_id: 'site_fixture', admission_id: 'task_lifecycle_write_admission_projection_1', mutation_class: 'shadow_read_record' },
  }, { token: 'test-admin-token', path: '/api/carrier' }), env);
  assert.equal(admittedProjection.status, 200);
  const admittedProjectionBody = await admittedProjection.json();
  assert.equal(admittedProjectionBody.decision.action, 'admit');
  assert.equal(admittedProjectionBody.decision.reason, 'shadow_read_projection_admitted');
  assert.equal(admittedProjectionBody.write_effect, 'none');

  const admissionList = await worker.fetch(jsonRequest({
    operation: 'task_lifecycle.write_admission.list',
    request_id: 'request_task_lifecycle_write_admission_list',
    params: { site_id: 'site_fixture', limit: 10 },
  }, { token: 'test-admin-token', path: '/api/carrier' }), env);
  assert.equal(admissionList.status, 200);
  const admissionListBody = await admissionList.json();
  assert.equal(admissionListBody.mutation_authority, 'windows_task_lifecycle_sqlite');
  assert.equal(admissionListBody.cloudflare_write_admission, 'not_admitted');
  assert.equal(admissionListBody.authority_partition, 'windows_all_observed_mutations');
  assert.equal(admissionListBody.write_effect, 'none');
  assert.deepEqual(admissionListBody.decisions.map((entry) => entry.admission_action).sort(), ['admit', 'refuse']);

  const operationReadWithAdmissions = await worker.fetch(jsonRequest({
    operation: 'operation.read',
    request_id: 'request_task_lifecycle_write_admission_operation_read',
    params: { site_id: 'site_fixture', operation_id: 'operation_task_lifecycle', task_lifecycle_write_admission_limit: 10 },
  }, { token: 'test-admin-token', path: '/api/carrier' }), env);
  assert.equal(operationReadWithAdmissions.status, 200);
  const operationReadWithAdmissionsBody = await operationReadWithAdmissions.json();
  assert.equal(operationReadWithAdmissionsBody.task_lifecycle_write_admissions.length, 2);
  assert.equal(operationReadWithAdmissionsBody.operation_product_surface.task_lifecycle_write_admission_count, 2);
  assert.equal(operationReadWithAdmissionsBody.operation_product_surface.task_lifecycle_write_admission_posture, 'writes_not_admitted');

  const refusedCreate = await worker.fetch(jsonRequest({
    operation: 'task_lifecycle.task_create.admit',
    request_id: 'request_task_lifecycle_task_create_refused',
    params: { site_id: 'site_fixture', admission_id: 'task_lifecycle_create_refused_1', title: 'refused task lifecycle create' },
  }, { token: 'test-admin-token', path: '/api/carrier' }), env);
  assert.equal(refusedCreate.status, 403);
  const refusedCreateBody = await refusedCreate.json();
  assert.equal(refusedCreateBody.code, 'task_lifecycle_create_not_admitted');
  assert.equal(refusedCreateBody.decision.action, 'refuse');
  assert.equal(refusedCreateBody.decision.reason, 'windows_task_lifecycle_mutation_authority_retained');

  const admittedCreate = await worker.fetch(jsonRequest({
    operation: 'task_lifecycle.task_create.admit',
    request_id: 'request_task_lifecycle_task_create_admitted',
    params: {
      site_id: 'site_fixture',
      admission_id: 'task_lifecycle_create_admitted_1',
      title: 'cloudflare governed task lifecycle create',
      description: 'first task lifecycle create mutation admitted on Cloudflare',
      cloudflare_task_create_cutover: true,
      cutover_point_ref: 'cutover:task-lifecycle-create:v1',
      governed_write_contract_ref: 'contract:task-lifecycle-create:v1',
      confirmation_evidence_ref: 'evidence:operator-check:task-create',
    },
  }, { token: 'test-admin-token', path: '/api/carrier' }), env);
  assert.equal(admittedCreate.status, 200);
  const admittedCreateBody = await admittedCreate.json();
  assert.equal(admittedCreateBody.status, 'created');
  assert.equal(admittedCreateBody.decision.action, 'admit');
  assert.equal(admittedCreateBody.decision.reason, 'cloudflare_task_create_cutover_admitted');
  assert.deepEqual(admittedCreateBody.decision.retained_windows_authority, [
    'task_lifecycle_sqlite_mutation_store',
    'task_claim_assignment_transition',
    'task_report_evidence_transition',
    'task_finish_verdict_transition',
    'changed_file_evidence_transition',
    'task_projection_write_transition',
  ]);
  assert.equal(admittedCreateBody.mutation_authority, 'cloudflare_task_lifecycle_d1');
  assert.equal(admittedCreateBody.cloudflare_write_admission, 'admitted');
  assert.equal(admittedCreateBody.write_effect, 'task_lifecycle_create');
  assert.equal(admittedCreateBody.task.status, 'opened');
  assert.equal(admittedCreateBody.task.cutover_point_ref, 'cutover:task-lifecycle-create:v1');

  const taskLifecycleList = await worker.fetch(jsonRequest({
    operation: 'task_lifecycle.task.list',
    request_id: 'request_task_lifecycle_task_list',
    params: { site_id: 'site_fixture', limit: 10 },
  }, { token: 'test-admin-token', path: '/api/carrier' }), env);
  assert.equal(taskLifecycleList.status, 200);
  const taskLifecycleListBody = await taskLifecycleList.json();
  assert.equal(taskLifecycleListBody.tasks.length, 1);
  assert.equal(taskLifecycleListBody.mutation_class, 'task_create');
  assert.equal(taskLifecycleListBody.mutation_authority, 'cloudflare_task_lifecycle_d1');
  assert.equal(taskLifecycleListBody.tasks[0].mutation_authority, 'cloudflare_task_lifecycle_d1');

  const refusedClaim = await worker.fetch(jsonRequest({
    operation: 'task_lifecycle.task_claim.admit',
    request_id: 'request_task_lifecycle_task_claim_refused',
    params: { site_id: 'site_fixture', admission_id: 'task_lifecycle_claim_refused_1', task_id: admittedCreateBody.task.task_id, claimant_agent_id: 'agent-cloudflare' },
  }, { token: 'test-admin-token', path: '/api/carrier' }), env);
  assert.equal(refusedClaim.status, 403);
  const refusedClaimBody = await refusedClaim.json();
  assert.equal(refusedClaimBody.code, 'task_lifecycle_claim_not_admitted');
  assert.equal(refusedClaimBody.decision.action, 'refuse');
  assert.equal(refusedClaimBody.decision.reason, 'windows_task_lifecycle_mutation_authority_retained');

  const admittedClaim = await worker.fetch(jsonRequest({
    operation: 'task_lifecycle.task_claim.admit',
    request_id: 'request_task_lifecycle_task_claim_admitted',
    params: {
      site_id: 'site_fixture',
      admission_id: 'task_lifecycle_claim_admitted_1',
      task_id: admittedCreateBody.task.task_id,
      claimant_agent_id: 'agent-cloudflare',
      cloudflare_task_claim_cutover: true,
      assignment_authority_ref: 'assignment-authority:task-lifecycle-claim:v1',
      cutover_point_ref: 'cutover:task-lifecycle-claim:v1',
      governed_write_contract_ref: 'contract:task-lifecycle-claim:v1',
      confirmation_evidence_ref: 'evidence:operator-check:task-claim',
    },
  }, { token: 'test-admin-token', path: '/api/carrier' }), env);
  assert.equal(admittedClaim.status, 200);
  const admittedClaimBody = await admittedClaim.json();
  assert.equal(admittedClaimBody.status, 'claimed');
  assert.equal(admittedClaimBody.previous_status, 'opened');
  assert.equal(admittedClaimBody.decision.action, 'admit');
  assert.equal(admittedClaimBody.decision.reason, 'cloudflare_task_claim_cutover_admitted');
  assert.equal(admittedClaimBody.decision.conflict_policy, 'opened_only_no_overwrite');
  assert.equal(admittedClaimBody.mutation_authority, 'cloudflare_task_lifecycle_d1');
  assert.equal(admittedClaimBody.cloudflare_write_admission, 'admitted');
  assert.equal(admittedClaimBody.write_effect, 'task_lifecycle_claim');
  assert.equal(admittedClaimBody.task.status, 'claimed');
  assert.equal(admittedClaimBody.task.claimed_by_agent_id, 'agent-cloudflare');
  assert.equal(admittedClaimBody.task.assignment_authority_ref, 'assignment-authority:task-lifecycle-claim:v1');

  const duplicateClaim = await worker.fetch(jsonRequest({
    operation: 'task_lifecycle.task_claim.admit',
    request_id: 'request_task_lifecycle_task_claim_duplicate',
    params: {
      site_id: 'site_fixture',
      admission_id: 'task_lifecycle_claim_duplicate_1',
      task_id: admittedCreateBody.task.task_id,
      claimant_agent_id: 'agent-other',
      cloudflare_task_claim_cutover: true,
      assignment_authority_ref: 'assignment-authority:task-lifecycle-claim:v1',
      cutover_point_ref: 'cutover:task-lifecycle-claim:v1',
      governed_write_contract_ref: 'contract:task-lifecycle-claim:v1',
      confirmation_evidence_ref: 'evidence:operator-check:task-claim',
    },
  }, { token: 'test-admin-token', path: '/api/carrier' }), env);
  assert.equal(duplicateClaim.status, 409);
  const duplicateClaimBody = await duplicateClaim.json();
  assert.equal(duplicateClaimBody.code, 'task_lifecycle_claim_conflict');
  assert.equal(duplicateClaimBody.previous_status, 'claimed');
  assert.equal(duplicateClaimBody.conflict_policy, 'opened_only_no_overwrite');

  const refusedReport = await worker.fetch(jsonRequest({
    operation: 'task_lifecycle.task_report.admit',
    request_id: 'request_task_lifecycle_task_report_refused',
    params: { site_id: 'site_fixture', admission_id: 'task_lifecycle_report_refused_1', task_id: admittedCreateBody.task.task_id, reporter_agent_id: 'agent-cloudflare', summary: 'reported work' },
  }, { token: 'test-admin-token', path: '/api/carrier' }), env);
  assert.equal(refusedReport.status, 403);
  const refusedReportBody = await refusedReport.json();
  assert.equal(refusedReportBody.code, 'task_lifecycle_report_not_admitted');
  assert.equal(refusedReportBody.decision.action, 'refuse');
  assert.equal(refusedReportBody.decision.reason, 'windows_task_lifecycle_mutation_authority_retained');

  const mismatchedReport = await worker.fetch(jsonRequest({
    operation: 'task_lifecycle.task_report.admit',
    request_id: 'request_task_lifecycle_task_report_mismatch',
    params: {
      site_id: 'site_fixture',
      admission_id: 'task_lifecycle_report_mismatch_1',
      task_id: admittedCreateBody.task.task_id,
      reporter_agent_id: 'agent-other',
      summary: 'reported work from wrong agent',
      cloudflare_task_report_cutover: true,
      report_authority_ref: 'report-authority:task-lifecycle-report:v1',
      report_schema_ref: 'schema:work-result-report:v1',
      changed_file_evidence_boundary_ref: 'boundary:changed-file-evidence:not-admitted',
      cutover_point_ref: 'cutover:task-lifecycle-report:v1',
      governed_write_contract_ref: 'contract:task-lifecycle-report:v1',
      confirmation_evidence_ref: 'evidence:operator-check:task-report',
    },
  }, { token: 'test-admin-token', path: '/api/carrier' }), env);
  assert.equal(mismatchedReport.status, 400);
  const mismatchedReportBody = await mismatchedReport.json();
  assert.equal(mismatchedReportBody.code, 'task_lifecycle_report_reporter_mismatch');
  assert.equal(mismatchedReportBody.claimed_by_agent_id, 'agent-cloudflare');
  assert.equal(mismatchedReportBody.reporter_agent_id, 'agent-other');

  const admittedReport = await worker.fetch(jsonRequest({
    operation: 'task_lifecycle.task_report.admit',
    request_id: 'request_task_lifecycle_task_report_admitted',
    params: {
      site_id: 'site_fixture',
      admission_id: 'task_lifecycle_report_admitted_1',
      task_id: admittedCreateBody.task.task_id,
      reporter_agent_id: 'agent-cloudflare',
      summary: 'reported cloudflare task lifecycle work',
      changed_files: ['packages/cloudflare-carrier/src/cloudflare-worker.mjs'],
      verification: [{ command: 'node --test', result: 'passed' }],
      cloudflare_task_report_cutover: true,
      report_authority_ref: 'report-authority:task-lifecycle-report:v1',
      report_schema_ref: 'schema:work-result-report:v1',
      changed_file_evidence_boundary_ref: 'boundary:changed-file-evidence:not-admitted',
      cutover_point_ref: 'cutover:task-lifecycle-report:v1',
      governed_write_contract_ref: 'contract:task-lifecycle-report:v1',
      confirmation_evidence_ref: 'evidence:operator-check:task-report',
    },
  }, { token: 'test-admin-token', path: '/api/carrier' }), env);
  assert.equal(admittedReport.status, 200);
  const admittedReportBody = await admittedReport.json();
  assert.equal(admittedReportBody.status, 'reported');
  assert.equal(admittedReportBody.previous_status, 'claimed');
  assert.equal(admittedReportBody.new_status, 'closed');
  assert.equal(admittedReportBody.decision.reason, 'cloudflare_task_report_cutover_admitted');
  assert.equal(admittedReportBody.mutation_authority, 'cloudflare_task_lifecycle_d1');
  assert.equal(admittedReportBody.cloudflare_write_admission, 'admitted');
  assert.equal(admittedReportBody.write_effect, 'task_lifecycle_report');
  assert.equal(admittedReportBody.task.status, 'closed');
  assert.equal(admittedReportBody.task.report_status, 'submitted');
  assert.equal(admittedReportBody.task.report.changed_file_evidence_admission, 'not_admitted');
  assert.equal(admittedReportBody.task.report.changed_file_evidence_boundary_ref, 'boundary:changed-file-evidence:not-admitted');

  const refusedChangedFileEvidence = await worker.fetch(jsonRequest({
    operation: 'task_lifecycle.changed_file_evidence.admit',
    request_id: 'request_task_lifecycle_changed_file_evidence_refused',
    params: {
      site_id: 'site_fixture',
      admission_id: 'changed_file_evidence_refused_1',
      task_id: admittedCreateBody.task.task_id,
      report_id: admittedReportBody.report.report_id,
      file_path: 'packages/cloudflare-carrier/src/cloudflare-worker.mjs',
      reporter_agent_id: 'agent-cloudflare',
    },
  }, { token: 'test-admin-token', path: '/api/carrier' }), env);
  assert.equal(refusedChangedFileEvidence.status, 403);
  const refusedChangedFileEvidenceBody = await refusedChangedFileEvidence.json();
  assert.equal(refusedChangedFileEvidenceBody.code, 'changed_file_evidence_not_admitted');
  assert.equal(refusedChangedFileEvidenceBody.decision.reason, 'windows_task_lifecycle_mutation_authority_retained');

  const mismatchedChangedFileEvidence = await worker.fetch(jsonRequest({
    operation: 'task_lifecycle.changed_file_evidence.admit',
    request_id: 'request_task_lifecycle_changed_file_evidence_mismatch',
    params: {
      site_id: 'site_fixture',
      admission_id: 'changed_file_evidence_mismatch_1',
      task_id: admittedCreateBody.task.task_id,
      report_id: 'wrong-report-id',
      file_path: 'packages/cloudflare-carrier/src/cloudflare-worker.mjs',
      reporter_agent_id: 'agent-cloudflare',
      cloudflare_changed_file_evidence_cutover: true,
      file_evidence_authority_ref: 'file-evidence-authority:changed-file:v1',
      file_material_source_ref: 'material-source:git-diff-summary:v1',
      repository_authority_ref: 'repository-authority:narada:v1',
      cutover_point_ref: 'cutover:changed-file-evidence:v1',
      governed_write_contract_ref: 'contract:changed-file-evidence:v1',
      confirmation_evidence_ref: 'evidence:operator-check:changed-file-evidence',
    },
  }, { token: 'test-admin-token', path: '/api/carrier' }), env);
  assert.equal(mismatchedChangedFileEvidence.status, 409);
  const mismatchedChangedFileEvidenceBody = await mismatchedChangedFileEvidence.json();
  assert.equal(mismatchedChangedFileEvidenceBody.code, 'changed_file_evidence_conflict');
  assert.equal(mismatchedChangedFileEvidenceBody.existing_report_id, admittedReportBody.report.report_id);

  const admittedChangedFileEvidence = await worker.fetch(jsonRequest({
    operation: 'task_lifecycle.changed_file_evidence.admit',
    request_id: 'request_task_lifecycle_changed_file_evidence_admitted',
    params: {
      site_id: 'site_fixture',
      admission_id: 'changed_file_evidence_admitted_1',
      task_id: admittedCreateBody.task.task_id,
      report_id: admittedReportBody.report.report_id,
      file_path: 'packages/cloudflare-carrier/src/cloudflare-worker.mjs',
      reporter_agent_id: 'agent-cloudflare',
      cloudflare_changed_file_evidence_cutover: true,
      file_evidence_authority_ref: 'file-evidence-authority:changed-file:v1',
      file_material_source_ref: 'material-source:git-diff-summary:v1',
      repository_authority_ref: 'repository-authority:narada:v1',
      cutover_point_ref: 'cutover:changed-file-evidence:v1',
      governed_write_contract_ref: 'contract:changed-file-evidence:v1',
      confirmation_evidence_ref: 'evidence:operator-check:changed-file-evidence',
    },
  }, { token: 'test-admin-token', path: '/api/carrier' }), env);
  assert.equal(admittedChangedFileEvidence.status, 200);
  const admittedChangedFileEvidenceBody = await admittedChangedFileEvidence.json();
  assert.equal(admittedChangedFileEvidenceBody.status, 'changed_file_evidence_recorded');
  assert.equal(admittedChangedFileEvidenceBody.write_effect, 'changed_file_evidence_record');
  assert.equal(admittedChangedFileEvidenceBody.evidence.filesystem_mutation_admission, 'not_admitted');
  assert.equal(admittedChangedFileEvidenceBody.evidence.repository_publication_admission, 'not_admitted');
  assert.equal(admittedChangedFileEvidenceBody.evidence.projection_write_admission, 'not_admitted');
  assert.equal(admittedChangedFileEvidenceBody.task.changed_file_evidence_admission, 'admitted');
  assert.equal(admittedChangedFileEvidenceBody.task.changed_file_evidence_count, 1);

  const refusedFinish = await worker.fetch(jsonRequest({
    operation: 'task_lifecycle.task_finish.admit',
    request_id: 'request_task_lifecycle_task_finish_refused',
    params: { site_id: 'site_fixture', admission_id: 'task_lifecycle_finish_refused_1', task_id: admittedCreateBody.task.task_id, finalizer_agent_id: 'agent-cloudflare', finish_verdict: 'accepted' },
  }, { token: 'test-admin-token', path: '/api/carrier' }), env);
  assert.equal(refusedFinish.status, 403);
  const refusedFinishBody = await refusedFinish.json();
  assert.equal(refusedFinishBody.code, 'task_lifecycle_finish_not_admitted');
  assert.equal(refusedFinishBody.decision.action, 'refuse');
  assert.equal(refusedFinishBody.decision.reason, 'windows_task_lifecycle_mutation_authority_retained');

  const admittedFinish = await worker.fetch(jsonRequest({
    operation: 'task_lifecycle.task_finish.admit',
    request_id: 'request_task_lifecycle_task_finish_admitted',
    params: {
      site_id: 'site_fixture',
      admission_id: 'task_lifecycle_finish_admitted_1',
      task_id: admittedCreateBody.task.task_id,
      finalizer_agent_id: 'agent-cloudflare',
      finish_verdict: 'accepted',
      cloudflare_task_finish_cutover: true,
      finish_authority_ref: 'finish-authority:task-lifecycle-finish:v1',
      finish_schema_ref: 'schema:task-finish-acceptance:v1',
      cutover_point_ref: 'cutover:task-lifecycle-finish:v1',
      governed_write_contract_ref: 'contract:task-lifecycle-finish:v1',
      confirmation_evidence_ref: 'evidence:operator-check:task-finish',
    },
  }, { token: 'test-admin-token', path: '/api/carrier' }), env);
  assert.equal(admittedFinish.status, 200);
  const admittedFinishBody = await admittedFinish.json();
  assert.equal(admittedFinishBody.status, 'finished');
  assert.equal(admittedFinishBody.previous_status, 'closed');
  assert.equal(admittedFinishBody.new_status, 'finished');
  assert.equal(admittedFinishBody.decision.reason, 'cloudflare_task_finish_cutover_admitted');
  assert.equal(admittedFinishBody.mutation_authority, 'cloudflare_task_lifecycle_d1');
  assert.equal(admittedFinishBody.cloudflare_write_admission, 'admitted');
  assert.equal(admittedFinishBody.write_effect, 'task_lifecycle_finish');
  assert.equal(admittedFinishBody.task.status, 'finished');
  assert.equal(admittedFinishBody.task.finish_verdict, 'accepted');
  assert.equal(admittedFinishBody.task.finished_by_agent_id, 'agent-cloudflare');
  assert.equal(admittedFinishBody.task.changed_file_evidence_count, 1);
  assert.equal(admittedFinishBody.task.finish.finish_authority_ref, 'finish-authority:task-lifecycle-finish:v1');

  const refusedProjectionWrite = await worker.fetch(jsonRequest({
    operation: 'task_lifecycle.projection_write.admit',
    request_id: 'request_task_lifecycle_projection_write_refused',
    params: {
      site_id: 'site_fixture',
      admission_id: 'task_lifecycle_projection_write_refused_1',
      task_id: admittedCreateBody.task.task_id,
      projection_target_ref: 'projection-target:cloudflare-task-lifecycle-read-model:v1',
      projection_schema_ref: 'schema:cloudflare-task-lifecycle-read-model:v1',
      projection_authority_ref: 'projection-authority:task-lifecycle:v1',
      source_evidence_ref: 'source-evidence:cloudflare-task-lifecycle-row:v1',
    },
  }, { token: 'test-admin-token', path: '/api/carrier' }), env);
  assert.equal(refusedProjectionWrite.status, 403);
  const refusedProjectionWriteBody = await refusedProjectionWrite.json();
  assert.equal(refusedProjectionWriteBody.code, 'task_lifecycle_projection_write_not_admitted');
  assert.equal(refusedProjectionWriteBody.decision.reason, 'windows_task_lifecycle_mutation_authority_retained');

  const admittedProjectionWrite = await worker.fetch(jsonRequest({
    operation: 'task_lifecycle.projection_write.admit',
    request_id: 'request_task_lifecycle_projection_write_admitted',
    params: {
      site_id: 'site_fixture',
      admission_id: 'task_lifecycle_projection_write_admitted_1',
      task_id: admittedCreateBody.task.task_id,
      cloudflare_task_projection_write_cutover: true,
      projection_target_ref: 'projection-target:cloudflare-task-lifecycle-read-model:v1',
      projection_schema_ref: 'schema:cloudflare-task-lifecycle-read-model:v1',
      projection_authority_ref: 'projection-authority:task-lifecycle:v1',
      source_evidence_ref: 'source-evidence:cloudflare-task-lifecycle-row:v1',
      cutover_point_ref: 'cutover:task-lifecycle-projection-write:v1',
      governed_write_contract_ref: 'contract:task-lifecycle-projection-write:v1',
      confirmation_evidence_ref: 'evidence:operator-check:task-projection-write',
    },
  }, { token: 'test-admin-token', path: '/api/carrier' }), env);
  assert.equal(admittedProjectionWrite.status, 200);
  const admittedProjectionWriteBody = await admittedProjectionWrite.json();
  assert.equal(admittedProjectionWriteBody.status, 'task_lifecycle_projection_written');
  assert.equal(admittedProjectionWriteBody.write_effect, 'task_lifecycle_projection_write');
  assert.equal(admittedProjectionWriteBody.projection.sqlite_mutation_admission, 'not_admitted');
  assert.equal(admittedProjectionWriteBody.projection.filesystem_mutation_admission, 'not_admitted');
  assert.equal(admittedProjectionWriteBody.projection.repository_publication_admission, 'not_admitted');
  assert.equal(admittedProjectionWriteBody.task.task_lifecycle_projection_write_admission, 'admitted');
  assert.equal(admittedProjectionWriteBody.task.task_lifecycle_projection_write_count, 1);

  const refusedSourceStateWrite = await worker.fetch(jsonRequest({
    operation: 'task_lifecycle.source_state_write.admit',
    request_id: 'request_task_lifecycle_source_state_write_refused',
    params: {
      site_id: 'site_fixture',
      admission_id: 'task_lifecycle_source_state_write_refused_1',
      task_id: admittedCreateBody.task.task_id,
      source_state_authority_ref: 'source-state-authority:cloudflare-task-lifecycle-d1:v1',
      source_state_schema_ref: 'schema:cloudflare-task-lifecycle-source-state:v1',
      source_state_evidence_ref: 'source-state-evidence:cloudflare-task-lifecycle-row:v1',
    },
  }, { token: 'test-admin-token', path: '/api/carrier' }), env);
  assert.equal(refusedSourceStateWrite.status, 403);
  const refusedSourceStateWriteBody = await refusedSourceStateWrite.json();
  assert.equal(refusedSourceStateWriteBody.code, 'task_lifecycle_source_state_write_not_admitted');
  assert.equal(refusedSourceStateWriteBody.decision.reason, 'windows_task_lifecycle_mutation_authority_retained');

  const admittedSourceStateWrite = await worker.fetch(jsonRequest({
    operation: 'task_lifecycle.source_state_write.admit',
    request_id: 'request_task_lifecycle_source_state_write_admitted',
    params: {
      site_id: 'site_fixture',
      admission_id: 'task_lifecycle_source_state_write_admitted_1',
      task_id: admittedCreateBody.task.task_id,
      cloudflare_task_source_state_write_cutover: true,
      source_state_authority_ref: 'source-state-authority:cloudflare-task-lifecycle-d1:v1',
      source_state_schema_ref: 'schema:cloudflare-task-lifecycle-source-state:v1',
      source_state_evidence_ref: 'source-state-evidence:cloudflare-task-lifecycle-row:v1',
      cutover_point_ref: 'cutover:task-lifecycle-source-state-write:v1',
      governed_write_contract_ref: 'contract:task-lifecycle-source-state-write:v1',
      confirmation_evidence_ref: 'evidence:operator-check:task-source-state-write',
    },
  }, { token: 'test-admin-token', path: '/api/carrier' }), env);
  assert.equal(admittedSourceStateWrite.status, 200);
  const admittedSourceStateWriteBody = await admittedSourceStateWrite.json();
  assert.equal(admittedSourceStateWriteBody.status, 'task_lifecycle_source_state_written');
  assert.equal(admittedSourceStateWriteBody.write_effect, 'task_lifecycle_source_state_write');
  assert.equal(admittedSourceStateWriteBody.source_state_write.canonical_source_state_authority, 'cloudflare_task_lifecycle_d1');
  assert.equal(admittedSourceStateWriteBody.source_state_write.windows_sqlite_source_write_admission, 'not_admitted');
  assert.equal(admittedSourceStateWriteBody.source_state_write.filesystem_mutation_admission, 'not_admitted');
  assert.equal(admittedSourceStateWriteBody.source_state_write.repository_publication_admission, 'not_admitted');
  assert.equal(admittedSourceStateWriteBody.source_state_write.mailbox_mutation_admission, 'not_admitted');
  assert.equal(admittedSourceStateWriteBody.task.task_lifecycle_source_state_write_admission, 'admitted');
  assert.equal(admittedSourceStateWriteBody.task.task_lifecycle_source_state_write_count, 1);
  assert.equal(admittedSourceStateWriteBody.task.canonical_source_state_authority, 'cloudflare_task_lifecycle_d1');

  const operationReadWithTasks = await worker.fetch(jsonRequest({
    operation: 'operation.read',
    request_id: 'request_task_lifecycle_task_operation_read',
    params: { site_id: 'site_fixture', operation_id: 'operation_task_lifecycle', task_lifecycle_task_limit: 10, task_lifecycle_write_admission_limit: 10 },
  }, { token: 'test-admin-token', path: '/api/carrier' }), env);
  assert.equal(operationReadWithTasks.status, 200);
  const operationReadWithTasksBody = await operationReadWithTasks.json();
  assert.equal(operationReadWithTasksBody.task_lifecycle_tasks.length, 1);
  assert.equal(operationReadWithTasksBody.task_lifecycle_tasks[0].status, 'finished');
  assert.equal(operationReadWithTasksBody.task_lifecycle_tasks[0].claimed_by_agent_id, 'agent-cloudflare');
  assert.equal(operationReadWithTasksBody.task_lifecycle_tasks[0].reported_by_agent_id, 'agent-cloudflare');
  assert.equal(operationReadWithTasksBody.task_lifecycle_tasks[0].finished_by_agent_id, 'agent-cloudflare');
  assert.equal(operationReadWithTasksBody.task_lifecycle_tasks[0].finish_verdict, 'accepted');
  assert.equal(operationReadWithTasksBody.task_lifecycle_tasks[0].changed_file_evidence_admission, 'admitted');
  assert.equal(operationReadWithTasksBody.task_lifecycle_tasks[0].changed_file_evidence_count, 1);
  assert.equal(operationReadWithTasksBody.task_lifecycle_tasks[0].task_lifecycle_projection_write_admission, 'admitted');
  assert.equal(operationReadWithTasksBody.task_lifecycle_tasks[0].task_lifecycle_projection_write_count, 1);
  assert.equal(operationReadWithTasksBody.task_lifecycle_tasks[0].task_lifecycle_source_state_write_admission, 'admitted');
  assert.equal(operationReadWithTasksBody.task_lifecycle_tasks[0].task_lifecycle_source_state_write_count, 1);
  assert.equal(operationReadWithTasksBody.task_lifecycle_tasks[0].canonical_source_state_authority, 'cloudflare_task_lifecycle_d1');
  assert.equal(operationReadWithTasksBody.task_lifecycle_write_admissions.length, 10);
  assert.equal(operationReadWithTasksBody.operation_product_surface.task_lifecycle_task_count, 1);
  assert.equal(operationReadWithTasksBody.operation_product_surface.task_lifecycle_task_claim_count, 1);
  assert.equal(operationReadWithTasksBody.operation_product_surface.task_lifecycle_task_report_count, 1);
  assert.equal(operationReadWithTasksBody.operation_product_surface.task_lifecycle_task_finish_count, 1);
  assert.equal(operationReadWithTasksBody.operation_product_surface.task_lifecycle_changed_file_evidence_count, 1);
  assert.equal(operationReadWithTasksBody.operation_product_surface.task_lifecycle_projection_write_count, 1);
  assert.equal(operationReadWithTasksBody.operation_product_surface.task_lifecycle_source_state_write_count, 1);
  assert.equal(operationReadWithTasksBody.operation_product_surface.task_lifecycle_default_mutation_authority, 'cloudflare_task_lifecycle_d1');
  assert.equal(operationReadWithTasksBody.operation_product_surface.task_lifecycle_default_cloudflare_write_admission, 'source_state_admitted_external_effects_not_admitted');
  assert.equal(operationReadWithTasksBody.operation_product_surface.task_lifecycle_task_create_authority, 'cloudflare_task_lifecycle_d1');
  assert.equal(operationReadWithTasksBody.operation_product_surface.task_lifecycle_task_claim_authority, 'cloudflare_task_lifecycle_d1');
  assert.equal(operationReadWithTasksBody.operation_product_surface.task_lifecycle_task_report_authority, 'cloudflare_task_lifecycle_d1');
  assert.equal(operationReadWithTasksBody.operation_product_surface.task_lifecycle_task_finish_authority, 'cloudflare_task_lifecycle_d1');
  assert.equal(operationReadWithTasksBody.operation_product_surface.task_lifecycle_changed_file_evidence_authority, 'cloudflare_task_lifecycle_d1');
  assert.equal(operationReadWithTasksBody.operation_product_surface.task_lifecycle_projection_write_authority, 'cloudflare_task_lifecycle_d1');
  assert.equal(operationReadWithTasksBody.operation_product_surface.task_lifecycle_source_state_authority, 'cloudflare_task_lifecycle_d1');
  assert.equal(operationReadWithTasksBody.operation_product_surface.task_lifecycle_windows_sqlite_source_write_admission, 'not_admitted');
  assert.equal(operationReadWithTasksBody.operation_product_surface.task_lifecycle_authority_partition, 'task_create_claim_report_finish_changed_file_evidence_projection_write_and_source_state_cloudflare_remaining_windows_effects');
  assert.equal(operationReadWithTasksBody.operation_product_surface.task_lifecycle_write_admission_posture, 'task_create_claim_report_finish_changed_file_evidence_projection_write_and_source_state_admitted_remaining_external_effects_not_admitted');
  assert.equal(operationReadWithTasksBody.operation_product_surface.task_lifecycle_mutation_authority, 'split_by_mutation_class');
  assert.equal(operationReadWithTasksBody.operation_product_surface.task_lifecycle_cloudflare_write_admission, 'task_create_claim_report_finish_changed_file_evidence_projection_write_and_source_state_admitted');
});

test('worker starts controlled resident dispatch as Cloudflare primary with Windows fallback recorded', async () => {
  const siteDb = fakeD1SiteRegistryDatabase({
    sites: [{
      site_id: 'site_fixture',
      site_ref: 'site://fixture',
      display_name: 'Fixture Site',
      status: 'active',
      created_at: clock(),
      updated_at: clock(),
      created_by_principal_id: 'admin',
    }],
    memberships: [{
      site_id: 'site_fixture',
      principal_id: 'admin',
      role: 'owner',
      status: 'active',
      created_at: clock(),
      updated_at: clock(),
    }],
    operations: [{
      operation_id: 'operation_dispatch',
      site_id: 'site_fixture',
      display_name: 'Dispatch Operation',
      operation_kind: 'control',
      status: 'active',
      created_by_principal_id: 'admin',
      created_at: clock(),
      updated_at: clock(),
    }],
  });
  const env = authEnv(fakeDurableObjectNamespace(), { CLOUDFLARE_SITE_REGISTRY_DB: siteDb });

  const dispatched = await worker.fetch(jsonRequest({
    operation: 'resident_dispatch.primary_with_fallback.start',
    request_id: 'request_resident_dispatch_primary_start',
    params: {
      site_id: 'site_fixture',
      operation_id: 'operation_dispatch',
      carrier_session_id: 'carrier_session_dispatch_fixture',
      dispatch_decision_id: 'resident_dispatch_fixture_1',
      agent_id: 'narada.dispatch.fixture',
      site_root: 'cloudflare://site_fixture',
      site_ref: 'site://fixture',
      windows_fallback_ref: 'windows_local_site_resident_loop',
    },
  }, { token: 'test-admin-token', path: '/api/carrier' }), env);
  assert.equal(dispatched.status, 200);
  const dispatchedBody = await dispatched.json();
  assert.equal(dispatchedBody.status, 'cloudflare_primary_started');
  assert.equal(dispatchedBody.dispatch_authority, 'cloudflare_primary_dispatcher');
  assert.equal(dispatchedBody.fallback_authority, 'windows_fallback_dispatcher');
  assert.equal(dispatchedBody.fallback_status, 'available');
  assert.equal(dispatchedBody.dispatch_action, 'cloudflare_session_start');
  assert.equal(dispatchedBody.carrier_session_id, 'carrier_session_dispatch_fixture');
  assert.equal(dispatchedBody.session_start.event.event_kind, 'carrier_session_started');
  assert.equal(siteDb.dump().carrierSessions.some((session) => session.carrier_session_id === 'carrier_session_dispatch_fixture'), true);

  const listed = await worker.fetch(jsonRequest({
    operation: 'resident_dispatch.primary_with_fallback.list',
    request_id: 'request_resident_dispatch_primary_list',
    params: { site_id: 'site_fixture', limit: 10 },
  }, { token: 'test-admin-token', path: '/api/carrier' }), env);
  assert.equal(listed.status, 200);
  const listedBody = await listed.json();
  assert.equal(listedBody.dispatch_authority, 'cloudflare_primary_dispatcher');
  assert.equal(listedBody.fallback_authority, 'windows_fallback_dispatcher');
  assert.deepEqual(listedBody.dispatch_decisions.map((entry) => entry.decision_state), ['cloudflare_primary_started']);

  const operationRead = await worker.fetch(jsonRequest({
    operation: 'operation.read',
    request_id: 'request_resident_dispatch_operation_read',
    params: { site_id: 'site_fixture', operation_id: 'operation_dispatch', resident_dispatch_limit: 10 },
  }, { token: 'test-admin-token', path: '/api/carrier' }), env);
  assert.equal(operationRead.status, 200);
  const operationReadBody = await operationRead.json();
  assert.equal(operationReadBody.resident_dispatch_decisions[0].dispatch_decision_id, 'resident_dispatch_fixture_1');
  assert.equal(operationReadBody.operation_product_surface.resident_dispatch_decision_count, 1);
});

test('worker site.membership.put admits owner and exposes membership through site.read', async () => {
  const siteDb = fakeD1SiteRegistryDatabase({
    sites: [{
      site_id: 'site_fixture',
      site_ref: 'site://fixture',
      display_name: 'Fixture Site',
      status: 'active',
      created_at: clock(),
      updated_at: clock(),
      created_by_principal_id: 'admin',
    }],
    memberships: [{
      site_id: 'site_fixture',
      principal_id: 'admin',
      role: 'owner',
      status: 'active',
      created_at: clock(),
      updated_at: clock(),
    }],
  });
  const taskDb = fakeD1TaskDatabase();
  const durableEnv = { CLOUDFLARE_CARRIER_ENABLE_TASK_TOOLS: '1', CLOUDFLARE_CARRIER_TASK_DB: taskDb };
  const env = authEnv(fakeDurableObjectNamespace(durableEnv), { CLOUDFLARE_SITE_REGISTRY_DB: siteDb, CLOUDFLARE_CARRIER_TASK_DB: taskDb, CLOUDFLARE_CARRIER_ENABLE_TASK_TOOLS: '1' });
  const put = await worker.fetch(jsonRequest({
    operation: 'site.membership.put',
    request_id: 'request_site_membership_put',
    params: {
      site_id: 'site_fixture',
      member_principal_id: 'microsoft:tenant:operator',
      role: 'viewer',
    },
  }, { token: 'test-admin-token', path: '/api/carrier' }), env);
  assert.equal(put.status, 200);
  const putBody = await put.json();
  assert.equal(putBody.membership.principal_id, 'microsoft:tenant:operator');
  assert.equal(putBody.membership.role, 'viewer');
  assert.equal(putBody.principal.email, 'admin@system');
  assert.equal(putBody.site_authority_decision.action, 'admit');
  assert.equal(putBody.site_authority_decision.authority_locus_kind, 'cloudflare_site_registry');

  const read = await worker.fetch(jsonRequest({
    operation: 'site.read',
    request_id: 'request_site_membership_read',
    params: { site_id: 'site_fixture' },
  }, { token: 'test-admin-token', path: '/api/carrier' }), env);
  const readBody = await read.json();
  assert.equal(readBody.memberships.some((membership) => (
    membership.principal_id === 'microsoft:tenant:operator'
    && membership.role === 'viewer'
    && membership.status === 'active'
  )), true);
  assert.equal(readBody.authority_events.some((event) => event.event_kind === 'site_membership_updated'), true);
});

test('worker site.list exposes product statuses across visible sites', async () => {
  const siteDb = fakeD1SiteRegistryDatabase({
    sites: [{
      site_id: 'site_alpha',
      site_ref: 'site://alpha',
      display_name: 'Alpha Site',
      status: 'active',
      created_at: clock(),
      updated_at: clock(),
      created_by_principal_id: 'admin',
    }, {
      site_id: 'site_beta',
      site_ref: 'site://beta',
      display_name: 'Beta Site',
      status: 'active',
      created_at: clock(),
      updated_at: clock(),
      created_by_principal_id: 'admin',
    }],
    memberships: [{
      site_id: 'site_alpha',
      principal_id: 'admin',
      role: 'owner',
      status: 'active',
      created_at: clock(),
      updated_at: clock(),
    }, {
      site_id: 'site_beta',
      principal_id: 'admin',
      role: 'owner',
      status: 'active',
      created_at: clock(),
      updated_at: clock(),
    }],
  });
  const taskDb = fakeD1TaskDatabase();
  const env = authEnv(fakeDurableObjectNamespace({ CLOUDFLARE_CARRIER_TASK_DB: taskDb }), {
    CLOUDFLARE_SITE_REGISTRY_DB: siteDb,
    CLOUDFLARE_CARRIER_TASK_DB: taskDb,
  });

  const operationCreate = await worker.fetch(jsonRequest({
    operation: 'operation.create',
    request_id: 'request_site_list_operation_create',
    params: {
      site_id: 'site_alpha',
      operation_id: 'operation_alpha',
      display_name: 'Alpha Operation',
      operation_kind: 'control',
      status: 'active',
    },
  }, { token: 'test-admin-token', path: '/api/carrier' }), env);
  assert.equal(operationCreate.status, 200);
  const start = await worker.fetch(jsonRequest(startRequest({
    request_id: 'request_site_list_start',
    params: {
      carrier_session_id: 'carrier_session_alpha',
      agent_id: 'narada.fixture.agent',
      site_id: 'site_alpha',
      site_root: 'cloudflare://site_alpha',
      site_ref: 'site://alpha',
      operation_id: 'operation_alpha',
    },
  }), { token: 'test-admin-token' }), env);
  assert.equal(start.status, 200);

  const listed = await worker.fetch(jsonRequest({
    operation: 'site.list',
    request_id: 'request_site_list_product_statuses',
    params: { limit: 10 },
  }, { token: 'test-admin-token', path: '/api/carrier' }), env);
  assert.equal(listed.status, 200);
  const listedBody = await listed.json();
  assert.deepEqual(listedBody.sites.map((site) => site.site_id), ['site_alpha', 'site_beta']);
  assert.equal(listedBody.site_product_statuses.length, 2);
  assert.equal(listedBody.site_product_statuses[0].schema, 'narada.cloudflare_site_product_status.v1');
  assert.equal(listedBody.site_product_statuses[0].site_id, 'site_alpha');
  assert.equal(listedBody.site_product_statuses[0].health, 'attention');
  assert.deepEqual(listedBody.site_product_statuses[0].missing, ['continuity_packet']);
  assert.equal(listedBody.site_product_statuses[0].operation_count, 1);
  assert.equal(listedBody.site_product_statuses[0].session_count, 1);
  assert.equal(listedBody.site_product_statuses[0].next_action, 'continuity_packet');
  assert.equal(listedBody.site_product_statuses[1].site_id, 'site_beta');
  assert.equal(listedBody.site_product_statuses[1].health, 'incomplete');
  assert.deepEqual(listedBody.site_product_statuses[1].missing, ['operation', 'session', 'carrier_evidence', 'continuity_packet']);
  assert.equal(listedBody.site_product_statuses[1].next_action, 'operation');
  assert.equal(listedBody.site_product_overview.schema, 'narada.cloudflare_site_product_overview.v1');
  assert.equal(listedBody.site_product_overview.site_count, 2);
  assert.deepEqual(listedBody.site_product_overview.health_counts, { ready: 0, attention: 1, incomplete: 1, other: 0 });
  assert.deepEqual(listedBody.site_product_overview.action_counts, { continuity_packet: 1, operation: 1 });
  assert.deepEqual(listedBody.site_product_overview.missing_counts, { continuity_packet: 2, operation: 1, session: 1, carrier_evidence: 1 });
  assert.deepEqual(listedBody.site_product_overview.attention_counts, {});
  assert.equal(listedBody.site_product_overview.next_site_id, 'site_alpha');
  assert.equal(listedBody.site_product_overview.next_health, 'attention');
  assert.equal(listedBody.site_product_overview.next_action, 'continuity_packet');
  assert.equal(listedBody.site_product_overview.next_reason, 'continuity_packet');
  assert.deepEqual(listedBody.site_posture_route, {
    schema: 'narada.cloudflare_site_posture_route.v1',
    domain: 'site_posture',
    command_state: 'site_posture_ready',
    command_action: 'monitor_sites',
    next_action: 'monitor_sites',
    target: 'site_alpha',
    status: 'ready',
    reason: 'continuity_packet',
  });
});

test('worker operation.create read and list route through site registry authority', async () => {
  const siteDb = fakeD1SiteRegistryDatabase({
    sites: [{
      site_id: 'site_fixture',
      site_ref: 'site://fixture',
      display_name: 'Fixture Site',
      status: 'active',
      created_at: clock(),
      updated_at: clock(),
      created_by_principal_id: 'admin',
    }],
    memberships: [{
      site_id: 'site_fixture',
      principal_id: 'admin',
      role: 'owner',
      status: 'active',
      created_at: clock(),
      updated_at: clock(),
    }],
  });
  const taskDb = fakeD1TaskDatabase();
  const durableEnv = { CLOUDFLARE_CARRIER_ENABLE_TASK_TOOLS: '1', CLOUDFLARE_CARRIER_TASK_DB: taskDb };
  const env = authEnv(fakeDurableObjectNamespace(durableEnv), {
    CLOUDFLARE_SITE_REGISTRY_DB: siteDb,
    CLOUDFLARE_CARRIER_ENABLE_TASK_TOOLS: '1',
    CLOUDFLARE_CARRIER_TASK_DB: taskDb,
  });

  const created = await worker.fetch(jsonRequest({
    operation: 'operation.create',
    request_id: 'request_operation_create',
    params: {
      site_id: 'site_fixture',
      operation_id: 'operation_control',
      display_name: 'Control Operation',
      operation_kind: 'control',
      status: 'active',
    },
  }, { token: 'test-admin-token', path: '/api/carrier' }), env);
  assert.equal(created.status, 200);
  const createdBody = await created.json();
  assert.equal(createdBody.operation.operation_id, 'operation_control');
  assert.equal(createdBody.operation.status, 'active');
  assert.equal(createdBody.principal.email, 'admin@system');

  const start = await worker.fetch(jsonRequest(startRequest({
    request_id: 'request_operation_session_start',
    params: {
      carrier_session_id: 'carrier_session_operation_fixture',
      agent_id: 'narada.fixture.agent',
      site_id: 'site_fixture',
      site_root: 'cloudflare://site_fixture',
      site_ref: 'site://fixture',
      operation_id: 'operation_control',
    },
  }), { token: 'test-admin-token' }), env);
  assert.equal(start.status, 200);
  assert.equal(siteDb.dump().carrierSessions.some((session) => session.operation_id === 'operation_control'), true, JSON.stringify(siteDb.dump().carrierSessions));
  const directOperationSessions = await siteDb.prepare('SELECT * FROM cloudflare_site_carrier_sessions WHERE operation_id = ? ORDER BY created_at DESC LIMIT ?').bind('operation_control', 10).all();
  assert.equal(directOperationSessions.results.length, 1, JSON.stringify(directOperationSessions.results));

  const taskCreate = await worker.fetch(jsonRequest(commandRequest('/task', ['create', 'operation', 'task'], {
    request_id: 'request_operation_task_create',
    carrier_session_id: 'carrier_session_operation_fixture',
  }), { token: 'test-admin-token' }), env);
  const taskCreateBody = await taskCreate.json();
  assert.equal(taskCreate.status, 200, JSON.stringify(taskCreateBody));
  const taskCreateResult = taskCreateBody.events?.find((event) => event.event_kind === 'tool_result_received');
  assert.equal(taskCreateResult?.payload?.status, 'ok', JSON.stringify(taskCreateBody));
  const taskCreateSummary = JSON.parse(taskCreateResult.payload.result_summary);
  assert.ok(taskCreateSummary.task?.task_id, JSON.stringify(taskCreateSummary));
  const directSiteTasks = await taskDb.prepare('SELECT * FROM narada_tasks WHERE site_id = ? ORDER BY task_number ASC').bind('site_fixture').all();
  assert.equal(directSiteTasks.results.some((task) => task.carrier_session_id === 'carrier_session_operation_fixture'), true, JSON.stringify(directSiteTasks.results));

  const read = await worker.fetch(jsonRequest({
    operation: 'operation.read',
    request_id: 'request_operation_read',
    params: { site_id: 'site_fixture', operation_id: 'operation_control' },
  }, { token: 'test-admin-token', path: '/api/carrier' }), env);
  assert.equal(read.status, 200);
  const readBody = await read.json();
  assert.equal(readBody.operation.display_name, 'Control Operation');
  assert.equal(readBody.sessions.some((session) => session.carrier_session_id === 'carrier_session_operation_fixture'), true, JSON.stringify(readBody.sessions));
  assert.equal(readBody.tasks.some((task) => task.carrier_session_id === 'carrier_session_operation_fixture'), true, JSON.stringify(readBody.tasks));
  assert.equal(readBody.carrier_evidence.some((entry) => entry.carrier_session_id === 'carrier_session_operation_fixture'), true, JSON.stringify(readBody.carrier_evidence));
  assert.equal(readBody.operation_product_surface.operation_id, 'operation_control');
  assert.equal(readBody.operation_product_surface.session_count, 1);
  assert.equal(readBody.operation_product_surface.task_count, 1);
  assert.equal(readBody.operation_lifecycle_status.schema, 'narada.cloudflare_operation_lifecycle_status.v1');
  assert.equal(readBody.operation_lifecycle_status.phase, 'inhabited');
  assert.equal(readBody.operation_lifecycle_status.session_count, 1);
  assert.equal(readBody.operation_lifecycle_status.task_count, 1);
  assert.equal(readBody.operation_lifecycle_status.open_task_count, 1);
  assert.equal(readBody.operation_lifecycle_status.continuity_state, 'no_packet_observed');
  assert.equal(readBody.operation_lifecycle_status.continuity_loop_state, 'no_loop_report_observed');
  assert.equal(readBody.operation_lifecycle_status.continuity_loop_report_count, 0);
  assert.equal(readBody.operation_lifecycle_status.next_action, 'continuity_packet');
  assert.equal(readBody.operation_product_surface.lifecycle_status.health, readBody.operation_lifecycle_status.health);
  assert.equal(readBody.cloudflare_persistence_posture.schema, 'narada.cloudflare_persistence_posture.v1');
  assert.equal(readBody.cloudflare_persistence_posture.operation_id, 'operation_control');
  assert.equal(readBody.cloudflare_persistence_posture.state, 'durable');
  assert.equal(readBody.cloudflare_persistence_posture.session_count, 1);
  assert.equal(readBody.cloudflare_persistence_posture.task_count, 1);
  assert.equal(readBody.operation_product_surface.persistence_posture.state, 'durable');
  assert.equal(readBody.operation_product_surface.persistence_posture.next_action, 'monitor_persistence_posture');
  assert.equal(readBody.cloudflare_recovery_posture.schema, 'narada.cloudflare_recovery_posture.v1');
  assert.equal(readBody.cloudflare_recovery_posture.operation_id, 'operation_control');
  assert.equal(readBody.cloudflare_recovery_posture.state, 'reconstructable');
  assert.equal(readBody.cloudflare_recovery_posture.snapshot_reload, 'available');
  assert.equal(readBody.cloudflare_recovery_posture.evidence_replay, 'loaded');
  assert.equal(readBody.operation_product_surface.recovery_posture.state, 'reconstructable');
  assert.equal(readBody.operation_product_surface.recovery_posture.next_action, 'monitor_recovery_posture');
  assert.equal(readBody.reader_principal.email, 'admin@system');

  const paused = await worker.fetch(jsonRequest({
    operation: 'operation.status.put',
    request_id: 'request_operation_status_pause',
    params: { site_id: 'site_fixture', operation_id: 'operation_control', status: 'inactive' },
  }, { token: 'test-admin-token', path: '/api/carrier' }), env);
  assert.equal(paused.status, 200);
  const pausedBody = await paused.json();
  assert.equal(pausedBody.schema, 'narada.cloudflare_operation_status_update.v1');
  assert.equal(pausedBody.action, 'status_updated');
  assert.equal(pausedBody.previous_status, 'active');
  assert.equal(pausedBody.operation.status, 'inactive');

  const pausedRead = await worker.fetch(jsonRequest({
    operation: 'operation.read',
    request_id: 'request_operation_status_pause_read',
    params: { site_id: 'site_fixture', operation_id: 'operation_control' },
  }, { token: 'test-admin-token', path: '/api/carrier' }), env);
  assert.equal(pausedRead.status, 200);
  const pausedReadBody = await pausedRead.json();
  assert.equal(pausedReadBody.operation.status, 'inactive');
  assert.equal(pausedReadBody.operation_lifecycle_status.phase, 'inactive');
  assert.equal(pausedReadBody.operation_status_history.schema, 'narada.cloudflare_operation_status_history.v1');
  assert.equal(pausedReadBody.operation_status_history.current_status, 'inactive');
  assert.equal(pausedReadBody.operation_status_history.transition_count, 1);
  assert.equal(pausedReadBody.operation_status_history.latest_transition.from_status, 'active');
  assert.equal(pausedReadBody.operation_status_history.latest_transition.to_status, 'inactive');
  assert.equal(pausedReadBody.operation_product_surface.status_history.transition_count, 1);
  assert.equal(pausedReadBody.operation_activity_timeline.schema, 'narada.cloudflare_operation_activity_timeline.v1');
  assert.equal(pausedReadBody.operation_activity_timeline.operation_id, 'operation_control');
  assert.ok(pausedReadBody.operation_activity_timeline.activity_count >= 5, JSON.stringify(pausedReadBody.operation_activity_timeline));
  assert.equal(pausedReadBody.operation_activity_timeline.items.some((item) => item.activity_kind === 'operation_status_transition' && item.summary === 'active -> inactive'), true, JSON.stringify(pausedReadBody.operation_activity_timeline.items));
  assert.equal(pausedReadBody.operation_activity_timeline.items.some((item) => item.activity_kind === 'operation_session_binding'), true, JSON.stringify(pausedReadBody.operation_activity_timeline.items));
  assert.equal(pausedReadBody.operation_activity_timeline.items.some((item) => item.activity_kind === 'operation_task'), true, JSON.stringify(pausedReadBody.operation_activity_timeline.items));
  assert.equal(pausedReadBody.operation_activity_timeline.items.some((item) => item.activity_kind === 'carrier_evidence_event'), true, JSON.stringify(pausedReadBody.operation_activity_timeline.items));
  assert.equal(pausedReadBody.operation_activity_timeline.items.some((item) => item.focus_kind === 'operation_task' && item.focus_ref === taskCreateSummary.task.task_id), true, JSON.stringify(pausedReadBody.operation_activity_timeline.items));
  assert.equal(pausedReadBody.operation_activity_timeline.items.some((item) => item.focus_kind === 'operation_session' && item.focus_ref === 'carrier_session_operation_fixture'), true, JSON.stringify(pausedReadBody.operation_activity_timeline.items));
  assert.equal(pausedReadBody.operation_activity_timeline.items.some((item) => item.focus_kind === 'operation_authority_event' && item.focus_ref), true, JSON.stringify(pausedReadBody.operation_activity_timeline.items));
  assert.equal(pausedReadBody.operation_activity_timeline.items.some((item) => item.focus_kind === 'carrier_evidence_event' && item.focus_ref.startsWith('carrier_session_operation_fixture:')), true, JSON.stringify(pausedReadBody.operation_activity_timeline.items));
  assert.equal(pausedReadBody.operation_product_surface.activity_timeline.activity_count, pausedReadBody.operation_activity_timeline.activity_count);
  assert.equal(pausedReadBody.authority_events.some((event) => event.event_kind === 'site_operation_status_updated'), true);

  const resumed = await worker.fetch(jsonRequest({
    operation: 'operation.status.put',
    request_id: 'request_operation_status_resume',
    params: { site_id: 'site_fixture', operation_id: 'operation_control', status: 'active' },
  }, { token: 'test-admin-token', path: '/api/carrier' }), env);
  assert.equal(resumed.status, 200);
  const resumedBody = await resumed.json();
  assert.equal(resumedBody.previous_status, 'inactive');
  assert.equal(resumedBody.operation.status, 'active');

  const resumedRead = await worker.fetch(jsonRequest({
    operation: 'operation.read',
    request_id: 'request_operation_status_resume_read',
    params: { site_id: 'site_fixture', operation_id: 'operation_control' },
  }, { token: 'test-admin-token', path: '/api/carrier' }), env);
  assert.equal(resumedRead.status, 200);
  const resumedReadBody = await resumedRead.json();
  assert.equal(resumedReadBody.operation_status_history.current_status, 'active');
  assert.equal(resumedReadBody.operation_status_history.transition_count, 2);
  assert.deepEqual(resumedReadBody.operation_status_history.transitions.map((transition) => transition.to_status), ['inactive', 'active']);
  assert.equal(resumedReadBody.operation_status_history.latest_transition.from_status, 'inactive');
  assert.equal(resumedReadBody.operation_status_history.latest_transition.to_status, 'active');
  assert.equal(resumedReadBody.operation_activity_timeline.items.some((item) => item.activity_kind === 'operation_status_transition' && item.summary === 'inactive -> active'), true, JSON.stringify(resumedReadBody.operation_activity_timeline.items));

  const listed = await worker.fetch(jsonRequest({
    operation: 'operation.list',
    request_id: 'request_operation_list',
    params: { site_id: 'site_fixture' },
  }, { token: 'test-admin-token', path: '/api/carrier' }), env);
  assert.equal(listed.status, 200);
  const listedBody = await listed.json();
  assert.deepEqual(listedBody.operations.map((operation) => operation.operation_id), ['operation_control']);

  const siteRead = await worker.fetch(jsonRequest({
    operation: 'site.read',
    request_id: 'request_operation_site_read',
    params: { site_id: 'site_fixture' },
  }, { token: 'test-admin-token', path: '/api/carrier' }), env);
  assert.equal(siteRead.status, 200);
  const siteReadBody = await siteRead.json();
  assert.equal(siteReadBody.operations.some((operation) => operation.operation_id === 'operation_control'), true);
});

test('worker starts Microsoft login with PKCE and signed pending cookie', async () => {
  const env = authEnv(fakeDurableObjectNamespace(), microsoftAuthEnv());
  const response = await worker.fetch(new Request('https://carrier.test/auth/microsoft/login'), env);
  assert.equal(response.status, 302);
  const location = new URL(response.headers.get('location'));
  assert.equal(location.origin, 'https://login.microsoftonline.com');
  assert.equal(location.pathname, '/tenant-fixture/oauth2/v2.0/authorize');
  assert.equal(location.searchParams.get('client_id'), 'microsoft-client-fixture');
  assert.equal(location.searchParams.get('response_type'), 'code');
  assert.equal(location.searchParams.get('redirect_uri'), 'https://carrier.test/auth/microsoft/callback');
  assert.equal(location.searchParams.get('code_challenge_method'), 'S256');
  assert.match(response.headers.get('set-cookie'), /narada_microsoft_oidc_pending=/);
});

test('worker Microsoft callback creates operator session and cookie principal can read site', async () => {
  const siteDb = fakeD1SiteRegistryDatabase({
    sites: [{
      site_id: 'site_fixture',
      site_ref: 'site://fixture',
      display_name: 'Fixture Site',
      status: 'active',
      created_at: clock(),
      updated_at: clock(),
      created_by_principal_id: 'admin',
    }],
    memberships: [{
      site_id: 'site_fixture',
      principal_id: 'microsoft:tenant-fixture:object-fixture',
      role: 'owner',
      status: 'active',
      created_at: clock(),
      updated_at: clock(),
    }],
  });
  const env = authEnv(fakeDurableObjectNamespace(), { ...microsoftAuthEnv(), CLOUDFLARE_SITE_REGISTRY_DB: siteDb });
  const login = await worker.fetch(new Request('https://carrier.test/auth/microsoft/login'), env);
  const pendingCookie = login.headers.get('set-cookie').split(';')[0];
  const state = new URL(login.headers.get('location')).searchParams.get('state');
  const callback = await worker.fetch(new Request(`https://carrier.test/auth/microsoft/callback?code=code-fixture&state=${state}`, {
    headers: { cookie: pendingCookie },
  }), env);
  assert.equal(callback.status, 302);
  assert.equal(callback.headers.get('location'), '/console');
  const operatorCookie = callback.headers.get('set-cookie').split(';')[0];
  assert.match(operatorCookie, /narada_operator_session=/);

  const session = await worker.fetch(new Request('https://carrier.test/auth/session', { headers: { cookie: operatorCookie } }), env);
  assert.equal(session.status, 200);
  const sessionBody = await session.json();
  assert.equal(sessionBody.principal.auth_type, 'microsoft_oidc');
  assert.equal(sessionBody.principal.principal_id, 'microsoft:tenant-fixture:object-fixture');

  const read = await worker.fetch(jsonRequest({
    operation: 'site.read',
    request_id: 'request_microsoft_site_read',
    params: { site_id: 'site_fixture' },
  }, { path: '/api/carrier', cookie: operatorCookie }), env);
  assert.equal(read.status, 200);
  const readBody = await read.json();
  assert.equal(readBody.reader_principal.auth_type, 'microsoft_oidc');
  assert.equal(readBody.reader_principal.principal_id, 'microsoft:tenant-fixture:object-fixture');
  assert.equal(readBody.membership.role, 'owner');
});

test('worker captures Microsoft operator session cookie for loopback helper only', async () => {
  const siteDb = fakeD1SiteRegistryDatabase();
  const env = authEnv(fakeDurableObjectNamespace(), { ...microsoftAuthEnv(), CLOUDFLARE_SITE_REGISTRY_DB: siteDb });
  const returnTo = 'http://127.0.0.1:38441/capture';
  const captureUrl = `https://carrier.test/auth/operator/session-capture?return_to=${encodeURIComponent(returnTo)}`;

  const unauthenticatedCapture = await worker.fetch(new Request(captureUrl), env);
  assert.equal(unauthenticatedCapture.status, 302);
  const loginLocation = new URL(unauthenticatedCapture.headers.get('location'));
  assert.equal(loginLocation.pathname, '/auth/microsoft/login');
  assert.equal(loginLocation.searchParams.get('return_to'), `/auth/operator/session-capture?return_to=${encodeURIComponent(returnTo)}`);

  const login = await worker.fetch(new Request(loginLocation.toString()), env);
  const pendingCookie = login.headers.get('set-cookie').split(';')[0];
  const authorize = new URL(login.headers.get('location'));
  const state = authorize.searchParams.get('state');
  const callback = await worker.fetch(new Request(`https://carrier.test/auth/microsoft/callback?code=code-fixture&state=${state}`, {
    headers: { cookie: pendingCookie },
  }), env);
  assert.equal(callback.status, 302);
  assert.equal(callback.headers.get('location'), `/auth/operator/session-capture?return_to=${encodeURIComponent(returnTo)}`);
  const operatorCookie = callback.headers.get('set-cookie').split(';')[0];

  const authenticatedCapture = await worker.fetch(new Request(captureUrl, { headers: { cookie: operatorCookie } }), env);
  assert.equal(authenticatedCapture.status, 302);
  const localRedirect = new URL(authenticatedCapture.headers.get('location'));
  assert.equal(localRedirect.origin, 'http://127.0.0.1:38441');
  assert.equal(localRedirect.pathname, '/capture');
  assert.match(localRedirect.searchParams.get('cookie'), /^[^.]+\.[^.]+$/);
  assert.equal(localRedirect.searchParams.get('principal_id'), 'microsoft:tenant-fixture:object-fixture');

  const invalidCapture = await worker.fetch(new Request('https://carrier.test/auth/operator/session-capture?return_to=https%3A%2F%2Fevil.example%2Fcapture', {
    headers: { cookie: operatorCookie },
  }), env);
  assert.equal(invalidCapture.status, 400);
  assert.equal((await invalidCapture.json()).code, 'operator_capture_return_to_must_be_loopback_http');
});

test('worker Microsoft cookie principal is denied without site membership', async () => {
  const siteDb = fakeD1SiteRegistryDatabase({
    sites: [{
      site_id: 'site_fixture',
      site_ref: 'site://fixture',
      display_name: 'Fixture Site',
      status: 'active',
      created_at: clock(),
      updated_at: clock(),
      created_by_principal_id: 'admin',
    }],
  });
  const env = authEnv(fakeDurableObjectNamespace(), { ...microsoftAuthEnv(), CLOUDFLARE_SITE_REGISTRY_DB: siteDb });
  const login = await worker.fetch(new Request('https://carrier.test/auth/microsoft/login'), env);
  const pendingCookie = login.headers.get('set-cookie').split(';')[0];
  const state = new URL(login.headers.get('location')).searchParams.get('state');
  const callback = await worker.fetch(new Request(`https://carrier.test/auth/microsoft/callback?code=code-fixture&state=${state}`, {
    headers: { cookie: pendingCookie },
  }), env);
  const operatorCookie = callback.headers.get('set-cookie').split(';')[0];
  const read = await worker.fetch(jsonRequest({
    operation: 'site.read',
    request_id: 'request_microsoft_site_denied',
    params: { site_id: 'site_fixture' },
  }, { path: '/api/carrier', cookie: operatorCookie }), env);
  assert.equal(read.status, 403);
  assert.equal((await read.json()).code, 'site_authority_denied');
});

test('worker browser API alias starts resumes sends input and reads evidence events', async () => {
  const durableEnv = {
    AI: fakeAiBinding('Console provider response.'),
    CLOUDFLARE_CARRIER_ENABLE_RUNTIME_TOOL_READS: '1',
  };
  const namespace = fakeDurableObjectNamespace(durableEnv);
  const env = authEnv(namespace, durableEnv);
  const start = await worker.fetch(jsonRequest(startRequest({ request_id: 'request_console_start' }), {
    token: 'test-admin-token',
    path: '/api/carrier',
  }), env);
  assert.equal(start.status, 200);
  const startBody = await start.json();
  assert.equal(startBody.event.event_kind, 'carrier_session_started');

  const resumed = await worker.fetch(jsonRequest(startRequest({ request_id: 'request_console_start' }), {
    token: 'test-admin-token',
    path: '/api/carrier',
  }), env);
  assert.equal(resumed.status, 200);
  const resumedBody = await resumed.json();
  assert.equal(resumedBody.carrier_session_id, 'carrier_session_cloudflare_fixture');

  const input = {
    ...inputPipelineCases.cases.find((entry) => entry.name === 'manual_operator_admitted').input,
    event_id: 'input_console_api_1',
    content: 'Render this through the Cloudflare console API.',
  };
  const delivered = await worker.fetch(jsonRequest(inputRequest(input, { request_id: 'request_console_input' }), {
    token: 'test-admin-token',
    path: '/api/carrier',
  }), env);
  assert.equal(delivered.status, 200);
  const deliveredBody = await delivered.json();
  assert.deepEqual(eventKinds(deliveredBody), [
    'input_admitted_to_turn',
    'turn_started',
    'provider_request_recorded',
    'provider_text_delta_recorded',
    'turn_completed',
    'input_completed',
  ]);

  const read = await worker.fetch(jsonRequest({
    operation: 'session.events.read',
    carrier_session_id: 'carrier_session_cloudflare_fixture',
    params: { after_sequence: 0 },
  }, {
    token: 'test-admin-token',
    path: '/api/carrier',
  }), env);
  assert.equal(read.status, 200);
  const readBody = await read.json();
  assert.equal(readBody.reader_principal.email, 'admin@system');
  assert.equal(readBody.events[0].event_kind, 'carrier_session_started');
  assert.ok(readBody.events.some((event) => event.event_kind === 'provider_request_recorded'));
  const providerEvent = readBody.events.find((event) => event.event_kind === 'provider_request_recorded');
  assert.equal(providerEvent.payload.provider_adapter_kind, 'cloudflare-workers-ai');
  assert.equal(providerEvent.payload.provider_request_status, 'dispatched');

  const status = await worker.fetch(jsonRequest({
    operation: 'session.status',
    carrier_session_id: 'carrier_session_cloudflare_fixture',
  }, {
    token: 'test-admin-token',
    path: '/api/carrier',
  }), env);
  const statusBody = await status.json();
  assert.equal(statusBody.provider_adapter_posture, 'cloudflare-workers-ai');
  assert.equal(statusBody.tool_effect_posture, 'configured');
  assert.deepEqual(statusBody.tool_effect_supported_tools, ['cloudflare_carrier_runtime_metadata_read']);
});

test('configured Cloudflare task tools admit command-triggered task create update and persisted readback', async () => {
  const durableEnv = { CLOUDFLARE_CARRIER_ENABLE_TASK_TOOLS: '1', CLOUDFLARE_CARRIER_TASK_DB: fakeD1TaskDatabase() };
  const namespace = fakeDurableObjectNamespace(durableEnv);
  const env = authEnv(namespace, durableEnv);
  await worker.fetch(jsonRequest(startRequest({ request_id: 'request_start_task_command' }), { token: 'test-admin-token' }), env);

  const created = await worker.fetch(jsonRequest(commandRequest('/task', ['create', 'ship', 'Cloudflare', 'task', 'adapter'], {
    request_id: 'request_task_create_command',
  }), { token: 'test-admin-token' }), env);
  assert.equal(created.status, 200);
  const createdBody = await created.json();
  assert.deepEqual(eventKinds(createdBody), ['tool_call_requested', 'tool_result_received']);
  const createResult = createdBody.events.find((event) => event.event_kind === 'tool_result_received');
  assert.equal(createResult.payload.status, 'ok', createResult.payload.result_summary);
  assert.equal(createResult.payload.admission_action, 'admit');
  assert.equal(createResult.payload.admission_reason, 'write_tool_effect_admitted');
  assert.equal(createResult.payload.capability_ref, 'cloudflare-carrier:capability/task-create:v1');
  assert.equal(createResult.payload.effect_scope, 'cloudflare-narada-task:write:create');
  assert.equal(createResult.payload.authority_ref, 'principal:admin');
  assert.equal(createResult.payload.result_ref, null);
  const createSummary = JSON.parse(createResult.payload.result_summary);
  assert.equal(createSummary.task.title, 'ship Cloudflare task adapter');
  assert.equal(createSummary.task.status, 'open');
  assert.equal(createSummary.site_authority_decision.action, 'admit');
  assert.equal(createSummary.site_authority_decision.mutation_class, 'task_artifact_mutation');

  const updated = await worker.fetch(jsonRequest(commandRequest('/task', ['update', 'cloudflare-task-1', 'done', 'verified'], {
    request_id: 'request_task_update_command',
  }), { token: 'test-admin-token' }), env);
  assert.equal(updated.status, 200);
  const updatedBody = await updated.json();
  const updateResult = updatedBody.events.find((event) => event.event_kind === 'tool_result_received');
  assert.equal(updateResult.payload.status, 'ok');
  assert.equal(updateResult.payload.capability_ref, 'cloudflare-carrier:capability/task-update:v1');
  assert.equal(updateResult.payload.effect_scope, 'cloudflare-narada-task:write:update');
  const updateSummary = JSON.parse(updateResult.payload.result_summary);
  assert.equal(updateSummary.task.status, 'done');
  assert.equal(updateSummary.task.note, 'verified');
  assert.equal(updateSummary.site_authority_decision.action, 'admit');

  const status = await worker.fetch(jsonRequest({
    operation: 'session.status',
    carrier_session_id: 'carrier_session_cloudflare_fixture',
  }, { token: 'test-admin-token' }), env);
  const statusBody = await status.json();
  assert.equal(statusBody.tool_effect_posture, 'configured');
  assert.deepEqual(statusBody.tool_effect_supported_tools, [
    'cloudflare_carrier_task_create',
    'cloudflare_carrier_task_update',
    'cloudflare_carrier_task_list',
  ]);
  assert.equal(statusBody.tasks.length, 1);
  assert.equal(statusBody.tasks[0].task_id, 'cloudflare-task-1');
  assert.equal(statusBody.tasks[0].status, 'done');

  const persisted = await worker.fetch(jsonRequest({
    operation: 'session.events.read',
    carrier_session_id: 'carrier_session_cloudflare_fixture',
    params: { after_sequence: 0 },
  }, { token: 'test-admin-token' }), env);
  const persistedBody = await persisted.json();
  assert.deepEqual(persistedBody.events.map((event) => event.event_kind), [
    'carrier_session_started',
    'tool_call_requested',
    'tool_result_received',
    'tool_call_requested',
    'tool_result_received',
  ]);
  assertValidEvents(persistedBody);
});

test('provider tool call can create a Cloudflare Narada task through admitted task effect', async () => {
  const durableEnv = {
    AI: fakeAiBinding([
      {
        response: 'Creating a task.',
        tool_calls: [{
          tool_name: 'cloudflare_carrier_task_create',
          arguments_summary: JSON.stringify({ title: 'provider created task' }),
          arguments_ref: null,
        }],
      },
      { response: 'Task created.' },
    ]),
    CLOUDFLARE_CARRIER_ENABLE_TASK_TOOLS: '1',
    CLOUDFLARE_CARRIER_TASK_DB: fakeD1TaskDatabase(),
  };
  const namespace = fakeDurableObjectNamespace(durableEnv);
  const env = authEnv(namespace, durableEnv);
  await worker.fetch(jsonRequest(startRequest({ request_id: 'request_start_provider_task' }), { token: 'test-admin-token' }), env);
  const input = {
    ...inputPipelineCases.cases.find((entry) => entry.name === 'manual_operator_admitted').input,
    event_id: 'input_provider_task_worker_1',
    content: 'Create a Narada task for provider tool coverage.',
  };

  const response = await worker.fetch(jsonRequest(inputRequest(input, { request_id: 'request_provider_task' }), { token: 'test-admin-token' }), env);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.deepEqual(eventKinds(body), [
    'input_admitted_to_turn',
    'turn_started',
    'provider_request_recorded',
    'provider_text_delta_recorded',
    'provider_tool_call_requested',
    'tool_call_requested',
    'tool_result_received',
    'provider_request_recorded',
    'provider_text_delta_recorded',
    'turn_completed',
    'input_completed',
  ]);
  const toolResult = body.events.find((event) => event.event_kind === 'tool_result_received');
  assert.equal(toolResult.payload.status, 'ok', toolResult.payload.result_summary);
  assert.equal(toolResult.payload.admission_action, 'admit');
  assert.equal(toolResult.payload.capability_ref, 'cloudflare-carrier:capability/task-create:v1');
  assert.equal(toolResult.payload.effect_scope, 'cloudflare-narada-task:write:create');
  const resultSummary = JSON.parse(toolResult.payload.result_summary);
  assert.equal(resultSummary.task.title, 'provider created task');
  assert.equal(resultSummary.site_authority_decision.action, 'admit');
  assert.equal(resultSummary.site_authority_decision.authority_locus_kind, 'declared_task_artifact_authority');

  const status = await worker.fetch(jsonRequest({
    operation: 'session.status',
    carrier_session_id: 'carrier_session_cloudflare_fixture',
  }, { token: 'test-admin-token' }), env);
  const statusBody = await status.json();
  assert.equal(statusBody.tasks.length, 1);
  assert.equal(statusBody.tasks[0].title, 'provider created task');
  assertValidEvents(body);
});

test('worker provider adapter completes turns through Cloudflare AI binding', async () => {
  const durableEnv = { AI: fakeAiBinding('Cloudflare AI response from test.') };
  const namespace = fakeDurableObjectNamespace(durableEnv);
  const env = authEnv(namespace, durableEnv);
  await worker.fetch(jsonRequest(startRequest({ request_id: 'request_start_ai' }), { token: 'test-admin-token' }), env);
  const input = {
    ...inputPipelineCases.cases.find((entry) => entry.name === 'manual_operator_admitted').input,
    event_id: 'input_ai_worker_1',
    content: 'Run a Cloudflare AI provider turn.',
  };

  const response = await worker.fetch(jsonRequest(inputRequest(input, { request_id: 'request_ai_provider' }), { token: 'test-admin-token' }), env);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.terminal_state, 'completed');
  assert.deepEqual(eventKinds(body), [
    'input_admitted_to_turn',
    'turn_started',
    'provider_request_recorded',
    'provider_text_delta_recorded',
    'turn_completed',
    'input_completed',
  ]);
  const providerRequest = body.events.find((event) => event.event_kind === 'provider_request_recorded');
  assert.equal(providerRequest.payload.provider_execution_enabled, true);
  assert.equal(providerRequest.payload.provider_adapter_kind, 'cloudflare-workers-ai');
  assert.equal(providerRequest.payload.provider_request_status, 'dispatched');
  assert.equal(durableEnv.AI.calls.length, 1);
  assert.equal(durableEnv.AI.calls[0].model, '@cf/meta/llama-3.1-8b-instruct');
  assert.deepEqual(durableEnv.AI.calls[0].request.tools, []);
  const output = body.events.find((event) => event.event_kind === 'provider_text_delta_recorded');
  assert.equal(output.payload.text_delta, 'Cloudflare AI response from test.');
  assertValidEvents(body);
});

test('provider tool calls are denied when the Cloudflare effect adapter is not configured', async () => {
  const durableEnv = { AI: fakeAiBinding([
    {
      response: 'Need a tool result.',
      tool_calls: [{
        tool_name: 'cloudflare_carrier_runtime_metadata_read',
        arguments_summary: '{}',
        arguments_ref: null,
      }],
    },
    { response: 'The carrier denied that tool effect.' },
  ]) };
  const namespace = fakeDurableObjectNamespace(durableEnv);
  const env = authEnv(namespace, durableEnv);
  await worker.fetch(jsonRequest(startRequest({ request_id: 'request_start_tool_denied' }), { token: 'test-admin-token' }), env);
  const status = await worker.fetch(jsonRequest({
    operation: 'session.status',
    carrier_session_id: 'carrier_session_cloudflare_fixture',
  }, { token: 'test-admin-token' }), env);
  const statusBody = await status.json();
  assert.equal(statusBody.tool_effect_posture, 'unconfigured');
  assert.deepEqual(statusBody.tool_effect_supported_tools, []);
  assert.deepEqual(statusBody.tool_effect_capabilities, []);
  const input = {
    ...inputPipelineCases.cases.find((entry) => entry.name === 'manual_operator_admitted').input,
    event_id: 'input_tool_denied_worker_1',
    content: 'Try a Cloudflare carrier tool call.',
  };

  const response = await worker.fetch(jsonRequest(inputRequest(input, { request_id: 'request_tool_denied' }), { token: 'test-admin-token' }), env);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.terminal_state, 'completed');
  assert.deepEqual(eventKinds(body), [
    'input_admitted_to_turn',
    'turn_started',
    'provider_request_recorded',
    'provider_text_delta_recorded',
    'provider_tool_call_requested',
    'tool_call_requested',
    'tool_result_received',
    'provider_request_recorded',
    'provider_text_delta_recorded',
    'turn_completed',
    'input_completed',
  ]);
  const toolResult = body.events.find((event) => event.event_kind === 'tool_result_received');
  assert.equal(toolResult.payload.status, 'denied');
  assert.equal(toolResult.payload.admission_action, 'deny');
  assert.equal(toolResult.payload.admission_reason, 'tool_effect_adapter_unconfigured');
  assert.equal(toolResult.payload.capability_ref, undefined);
  assert.equal(toolResult.payload.effect_scope, undefined);
  assert.equal(toolResult.payload.result_summary, 'tool_effect_adapter_unconfigured');
  assert.equal(durableEnv.AI.calls.length, 2);
  assert.deepEqual(durableEnv.AI.calls[0].request.tools, []);
  assert.equal(durableEnv.AI.calls[1].request.tools, undefined);
  assert.match(durableEnv.AI.calls[1].request.messages.at(-1).content, /tool_effect_adapter_unconfigured/);
  const textDeltas = body.events.filter((event) => event.event_kind === 'provider_text_delta_recorded');
  assert.equal(textDeltas.at(-1).payload.text_delta, 'The carrier denied that tool effect.');
  assertValidEvents(body);
});

test('configured Cloudflare tool adapter admits only runtime metadata read effects', async () => {
  const durableEnv = {
    AI: fakeAiBinding([
      {
        response: 'Reading runtime metadata.',
        tool_calls: [{
          tool_name: 'cloudflare_carrier_runtime_metadata_read',
          arguments_summary: '{}',
          arguments_ref: null,
        }],
      },
      { response: 'Runtime metadata read completed.' },
    ]),
    CLOUDFLARE_CARRIER_ENABLE_RUNTIME_TOOL_READS: '1',
  };
  const namespace = fakeDurableObjectNamespace(durableEnv);
  const env = authEnv(namespace, durableEnv);
  await worker.fetch(jsonRequest(startRequest({ request_id: 'request_start_tool_ok' }), { token: 'test-admin-token' }), env);
  const status = await worker.fetch(jsonRequest({
    operation: 'session.status',
    carrier_session_id: 'carrier_session_cloudflare_fixture',
  }, { token: 'test-admin-token' }), env);
  const statusBody = await status.json();
  assert.equal(statusBody.tool_effect_posture, 'configured');
  assert.equal(statusBody.tool_effect_adapter_kind, 'cloudflare-tool-effect-boundary');
  assert.deepEqual(statusBody.tool_effect_supported_tools, ['cloudflare_carrier_runtime_metadata_read']);
  assert.deepEqual(statusBody.tool_effect_capabilities, [{
    capability_ref: 'cloudflare-carrier:capability/runtime-metadata-read:v1',
    effect_scope: 'cloudflare-carrier/runtime-metadata:read-only',
    tool_name: 'cloudflare_carrier_runtime_metadata_read',
    access: 'read_only',
    substrate: 'cloudflare-worker-runtime',
  }]);
  const input = {
    ...inputPipelineCases.cases.find((entry) => entry.name === 'manual_operator_admitted').input,
    event_id: 'input_tool_ok_worker_1',
    content: 'Read Cloudflare carrier runtime metadata.',
  };

  const response = await worker.fetch(jsonRequest(inputRequest(input, { request_id: 'request_tool_ok' }), { token: 'test-admin-token' }), env);
  assert.equal(response.status, 200);
  const body = await response.json();
  const toolCall = body.events.find((event) => event.event_kind === 'provider_tool_call_requested');
  assert.equal(toolCall.payload.tool_name, 'cloudflare_carrier_runtime_metadata_read');
  const toolResult = body.events.find((event) => event.event_kind === 'tool_result_received');
  assert.equal(toolResult.payload.status, 'ok');
  assert.equal(toolResult.payload.admission_action, 'admit');
  assert.equal(toolResult.payload.admission_reason, 'read_only_tool_effect_admitted');
  assert.equal(toolResult.payload.capability_ref, 'cloudflare-carrier:capability/runtime-metadata-read:v1');
  assert.equal(toolResult.payload.effect_scope, 'cloudflare-carrier/runtime-metadata:read-only');
  assert.equal(toolResult.payload.authority_ref, 'principal:admin');
  assert.match(toolResult.payload.result_summary, /cloudflare-workers/);
  assert.equal(durableEnv.AI.calls.length, 2);
  assert.equal(durableEnv.AI.calls[0].request.tools[0].name, 'cloudflare_carrier_runtime_metadata_read');
  assert.equal(durableEnv.AI.calls[1].request.tools, undefined);
  assert.match(durableEnv.AI.calls[1].request.messages.at(-1).content, /read_only_tool_effect_admitted/);
  assert.match(durableEnv.AI.calls[1].request.messages.at(-1).content, /cloudflare-carrier:capability\/runtime-metadata-read:v1/);
  assert.match(durableEnv.AI.calls[1].request.messages.at(-1).content, /principal:admin/);
  const textDeltas = body.events.filter((event) => event.event_kind === 'provider_text_delta_recorded');
  assert.equal(textDeltas.at(-1).payload.text_delta, 'Runtime metadata read completed.');
  assertValidEvents(body);
});

test('configured Cloudflare KV tool adapter admits read-only key gets', async () => {
  const durableEnv = {
    AI: fakeAiBinding([
      {
        response: 'Reading KV.',
        tool_calls: [{
          tool_name: 'cloudflare_carrier_kv_get',
          arguments_summary: JSON.stringify({ key: 'alpha' }),
          arguments_ref: null,
        }],
      },
      { response: 'KV read completed.' },
    ]),
    CLOUDFLARE_CARRIER_ENABLE_KV_TOOL_READS: '1',
    CLOUDFLARE_CARRIER_KV: fakeKvBinding({ alpha: 'value-alpha' }),
  };
  const namespace = fakeDurableObjectNamespace(durableEnv);
  const env = authEnv(namespace, durableEnv);
  await worker.fetch(jsonRequest(startRequest({ request_id: 'request_start_tool_kv' }), { token: 'test-admin-token' }), env);
  const status = await worker.fetch(jsonRequest({
    operation: 'session.status',
    carrier_session_id: 'carrier_session_cloudflare_fixture',
  }, { token: 'test-admin-token' }), env);
  const statusBody = await status.json();
  assert.equal(statusBody.tool_effect_posture, 'configured');
  assert.deepEqual(statusBody.tool_effect_supported_tools, ['cloudflare_carrier_kv_get']);
  assert.deepEqual(statusBody.tool_effect_capabilities, [{
    capability_ref: 'cloudflare-carrier:capability/kv-get:v1',
    effect_scope: 'cloudflare-kv:read-only:get',
    tool_name: 'cloudflare_carrier_kv_get',
    access: 'read_only',
    substrate: 'cloudflare-kv',
  }]);
  const input = {
    ...inputPipelineCases.cases.find((entry) => entry.name === 'manual_operator_admitted').input,
    event_id: 'input_tool_kv_worker_1',
    content: 'Read alpha from configured KV.',
  };

  const response = await worker.fetch(jsonRequest(inputRequest(input, { request_id: 'request_tool_kv' }), { token: 'test-admin-token' }), env);
  assert.equal(response.status, 200);
  const body = await response.json();
  const toolResult = body.events.find((event) => event.event_kind === 'tool_result_received');
  assert.equal(toolResult.payload.status, 'ok');
  assert.equal(toolResult.payload.admission_action, 'admit');
  assert.equal(toolResult.payload.admission_reason, 'read_only_tool_effect_admitted');
  assert.equal(toolResult.payload.capability_ref, 'cloudflare-carrier:capability/kv-get:v1');
  assert.equal(toolResult.payload.effect_scope, 'cloudflare-kv:read-only:get');
  assert.equal(toolResult.payload.authority_ref, 'principal:admin');
  assert.match(toolResult.payload.result_summary, /value-alpha/);
  assert.equal(durableEnv.AI.calls.length, 2);
  assert.deepEqual(durableEnv.AI.calls[0].request.tools.map((tool) => tool.name), ['cloudflare_carrier_kv_get']);
  assert.equal(durableEnv.AI.calls[1].request.tools, undefined);
  assert.match(durableEnv.AI.calls[1].request.messages.at(-1).content, /cloudflare-carrier:capability\/kv-get:v1/);
  assert.match(durableEnv.AI.calls[1].request.messages.at(-1).content, /principal:admin/);
  const textDeltas = body.events.filter((event) => event.event_kind === 'provider_text_delta_recorded');
  assert.equal(textDeltas.at(-1).payload.text_delta, 'KV read completed.');
  assertValidEvents(body);
});

test('configured Cloudflare KV write tool requires write flag and principal authority', async () => {
  const kv = fakeKvBinding({});
  const durableEnv = {
    AI: fakeAiBinding([
      {
        response: 'Writing KV.',
        tool_calls: [{
          tool_name: 'cloudflare_carrier_kv_put',
          arguments_summary: JSON.stringify({ key: 'beta', value: 'value-beta' }),
          arguments_ref: null,
        }],
      },
      { response: 'KV write completed.' },
    ]),
    CLOUDFLARE_CARRIER_ENABLE_KV_TOOL_WRITES: '1',
    CLOUDFLARE_CARRIER_KV: kv,
  };
  const namespace = fakeDurableObjectNamespace(durableEnv);
  const env = authEnv(namespace, durableEnv);
  await worker.fetch(jsonRequest(startRequest({ request_id: 'request_start_tool_kv_put' }), { token: 'test-admin-token' }), env);
  const status = await worker.fetch(jsonRequest({
    operation: 'session.status',
    carrier_session_id: 'carrier_session_cloudflare_fixture',
  }, { token: 'test-admin-token' }), env);
  const statusBody = await status.json();
  assert.deepEqual(statusBody.tool_effect_supported_tools, ['cloudflare_carrier_kv_put']);
  assert.deepEqual(statusBody.tool_effect_capabilities, [{
    capability_ref: 'cloudflare-carrier:capability/kv-put:v1',
    effect_scope: 'cloudflare-kv:write:put',
    tool_name: 'cloudflare_carrier_kv_put',
    access: 'write',
    substrate: 'cloudflare-kv',
  }]);
  const input = {
    ...inputPipelineCases.cases.find((entry) => entry.name === 'manual_operator_admitted').input,
    event_id: 'input_tool_kv_put_worker_1',
    content: 'Write beta into configured KV.',
  };

  const response = await worker.fetch(jsonRequest(inputRequest(input, { request_id: 'request_tool_kv_put' }), { token: 'test-admin-token' }), env);
  assert.equal(response.status, 200);
  const body = await response.json();
  const toolResult = body.events.find((event) => event.event_kind === 'tool_result_received');
  assert.equal(toolResult.payload.status, 'ok');
  assert.equal(toolResult.payload.admission_action, 'admit');
  assert.equal(toolResult.payload.admission_reason, 'write_tool_effect_admitted');
  assert.equal(toolResult.payload.capability_ref, 'cloudflare-carrier:capability/kv-put:v1');
  assert.equal(toolResult.payload.effect_scope, 'cloudflare-kv:write:put');
  assert.equal(toolResult.payload.authority_ref, 'principal:admin');
  assert.deepEqual(kv.dump(), { beta: 'value-beta' });
  assert.deepEqual(durableEnv.AI.calls[0].request.tools.map((tool) => tool.name), ['cloudflare_carrier_kv_put']);
  assert.match(durableEnv.AI.calls[1].request.messages.at(-1).content, /write_tool_effect_admitted/);
  assert.match(durableEnv.AI.calls[1].request.messages.at(-1).content, /cloudflare-carrier:capability\/kv-put:v1/);
  assertValidEvents(body);
});

test('configured Cloudflare KV write tool records admitted execution failure separately from denial', async () => {
  const kv = fakeKvBinding({});
  const durableEnv = {
    AI: fakeAiBinding([
      {
        response: 'Writing KV without a key.',
        tool_calls: [{
          tool_name: 'cloudflare_carrier_kv_put',
          arguments_summary: JSON.stringify({ value: 'value-without-key' }),
          arguments_ref: null,
        }],
      },
      { response: 'KV write failed after admission.' },
    ]),
    CLOUDFLARE_CARRIER_ENABLE_KV_TOOL_WRITES: '1',
    CLOUDFLARE_CARRIER_KV: kv,
  };
  const namespace = fakeDurableObjectNamespace(durableEnv);
  const env = authEnv(namespace, durableEnv);
  await worker.fetch(jsonRequest(startRequest({ request_id: 'request_start_tool_kv_put_failed' }), { token: 'test-admin-token' }), env);
  const input = {
    ...inputPipelineCases.cases.find((entry) => entry.name === 'manual_operator_admitted').input,
    event_id: 'input_tool_kv_put_failed_worker_1',
    content: 'Try to write KV without a key.',
  };

  const response = await worker.fetch(jsonRequest(inputRequest(input, { request_id: 'request_tool_kv_put_failed' }), { token: 'test-admin-token' }), env);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.terminal_state, 'completed');
  const toolResult = body.events.find((event) => event.event_kind === 'tool_result_received');
  assert.equal(toolResult.payload.status, 'failed');
  assert.equal(toolResult.payload.admission_action, 'admit');
  assert.equal(toolResult.payload.admission_reason, 'write_tool_effect_admitted');
  assert.equal(toolResult.payload.capability_ref, 'cloudflare-carrier:capability/kv-put:v1');
  assert.equal(toolResult.payload.effect_scope, 'cloudflare-kv:write:put');
  assert.equal(toolResult.payload.authority_ref, 'principal:admin');
  assert.equal(toolResult.payload.result_summary, 'cloudflare_kv_put_requires_key');
  assert.deepEqual(kv.dump(), {});
  assert.match(durableEnv.AI.calls[1].request.messages.at(-1).content, /\"status\":\"failed\"/);
  assert.match(durableEnv.AI.calls[1].request.messages.at(-1).content, /cloudflare_kv_put_requires_key/);
  assertValidEvents(body);
});

test('provider follow-up tool calls are processed in bounded batches', async () => {
  const kv = fakeKvBinding({ first: 'one', second: 'two' });
  const durableEnv = {
    AI: fakeAiBinding([
      {
        response: 'Reading first key.',
        tool_calls: [{
          tool_name: 'cloudflare_carrier_kv_get',
          arguments_summary: JSON.stringify({ key: 'first' }),
          arguments_ref: null,
        }],
      },
      {
        response: 'Reading second key.',
        tool_calls: [{
          tool_name: 'cloudflare_carrier_kv_get',
          arguments_summary: JSON.stringify({ key: 'second' }),
          arguments_ref: null,
        }],
      },
      { response: 'Both KV reads completed.' },
    ]),
    CLOUDFLARE_CARRIER_ENABLE_KV_TOOL_READS: '1',
    CLOUDFLARE_CARRIER_KV: kv,
  };
  const namespace = fakeDurableObjectNamespace(durableEnv);
  const env = authEnv(namespace, durableEnv);
  await worker.fetch(jsonRequest(startRequest({ request_id: 'request_start_tool_kv_loop' }), { token: 'test-admin-token' }), env);
  const input = {
    ...inputPipelineCases.cases.find((entry) => entry.name === 'manual_operator_admitted').input,
    event_id: 'input_tool_kv_loop_worker_1',
    content: 'Read two keys from configured KV.',
  };

  const response = await worker.fetch(jsonRequest(inputRequest(input, { request_id: 'request_tool_kv_loop' }), { token: 'test-admin-token' }), env);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.terminal_state, 'completed');
  const toolResults = body.events.filter((event) => event.event_kind === 'tool_result_received');
  assert.equal(toolResults.length, 2);
  assert.match(toolResults[0].payload.result_summary, /one/);
  assert.match(toolResults[1].payload.result_summary, /two/);
  assert.equal(durableEnv.AI.calls.length, 3);
  assert.equal(durableEnv.AI.calls[1].request.tools, undefined);
  assert.equal(durableEnv.AI.calls[2].request.tools, undefined);
  const providerToolCalls = body.events.filter((event) => event.event_kind === 'provider_tool_call_requested');
  assert.deepEqual(providerToolCalls.map((event) => event.payload.sequence), [2, 3]);
  const textDeltas = body.events.filter((event) => event.event_kind === 'provider_text_delta_recorded');
  assert.deepEqual(textDeltas.map((event) => event.payload.text_delta), [
    'Reading first key.',
    'Reading second key.',
    'Both KV reads completed.',
  ]);
  assertValidEvents(body);
});

test('malformed tool effect result fails turn before invalid evidence append', async () => {
  const session = new CloudflareCarrierSession({
    carrier_session_id: 'carrier_session_malformed_tool_effect',
    agent_id: 'narada.fixture.agent',
    site_id: 'site_fixture',
    site_root: 'cloudflare://site_fixture',
    providerAdapter: {
      posture: 'fixture',
      adapter_kind: 'fixture-provider',
      provider: 'fixture',
      model: 'fixture',
      async run() {
        return {
          text: 'Requesting malformed tool result.',
          tool_calls: [{
            tool_name: 'fixture_malformed_tool',
            arguments_summary: '{}',
            arguments_ref: null,
          }],
        };
      },
    },
    toolEffectAdapter: {
      posture: 'configured',
      adapter_kind: 'fixture-malformed-tool-effect-boundary',
      supported_tools: ['fixture_malformed_tool'],
      capabilities: [],
      async execute() {
        return {
          status: 'ok',
          admission_action: 'admit',
          result_summary: 'malformed missing admission reason',
          result_ref: null,
        };
      },
    },
  });
  const input = {
    ...inputPipelineCases.cases.find((entry) => entry.name === 'manual_operator_admitted').input,
    event_id: 'input_malformed_tool_effect_1',
    content: 'Try a malformed tool result.',
  };

  const response = await session.handle({
    operation: 'carrier.input.deliver',
    request_id: 'request_malformed_tool_effect',
    principal: { principal_id: 'operator.fixture', controlled_actions: ['*'] },
    params: { input },
  });
  assert.equal(response.terminal_state, 'failed');
  assert.equal(response.events.some((event) => event.event_kind === 'tool_result_received'), false);
  const failed = response.events.find((event) => event.event_kind === 'turn_failed');
  assert.match(failed.payload.error_summary, /cloudflare_carrier_invalid_session_event/);
  assert.match(failed.payload.error_summary, /payload\.missing_admission_reason/);
  assert.deepEqual(
    response.events.map((event) => event.sequence),
    response.events.map((_, index) => index + 1),
  );
  assertValidEvents(response);
});

test('plain tool effect adapter result remains valid without admission evidence', async () => {
  const session = new CloudflareCarrierSession({
    carrier_session_id: 'carrier_session_plain_tool_effect',
    agent_id: 'narada.fixture.agent',
    site_id: 'site_fixture',
    site_root: 'cloudflare://site_fixture',
    providerAdapter: {
      posture: 'fixture',
      adapter_kind: 'fixture-provider',
      provider: 'fixture',
      model: 'fixture',
      async run({ tool_results = [] }) {
        if (tool_results.length > 0) return { text: 'Observed plain tool effect.' };
        return {
          text: 'Requesting plain tool.',
          tool_calls: [{
            tool_name: 'fixture_plain_tool',
            arguments_summary: '{}',
            arguments_ref: null,
          }],
        };
      },
    },
    toolEffectAdapter: {
      posture: 'configured',
      adapter_kind: 'fixture-plain-tool-effect-boundary',
      supported_tools: ['fixture_plain_tool'],
      capabilities: [],
      async execute() {
        return {
          status: 'ok',
          result_summary: 'plain tool completed',
          result_ref: null,
        };
      },
    },
  });
  const input = {
    ...inputPipelineCases.cases.find((entry) => entry.name === 'manual_operator_admitted').input,
    event_id: 'input_plain_tool_effect_1',
    content: 'Try a plain tool result.',
  };

  const response = await session.handle({
    operation: 'carrier.input.deliver',
    request_id: 'request_plain_tool_effect',
    principal: { principal_id: 'operator.fixture', controlled_actions: ['*'] },
    params: { input },
  });
  assert.equal(response.terminal_state, 'completed');
  const toolResult = response.events.find((event) => event.event_kind === 'tool_result_received');
  assert.equal(toolResult.payload.status, 'ok');
  assert.equal(toolResult.payload.admission_action, undefined);
  assert.equal(toolResult.payload.admission_reason, undefined);
  assert.equal(toolResult.payload.result_summary, 'plain tool completed');
  assertValidEvents(response);
});

test('throwing tool effect adapter records failed tool result and provider follow-up', async () => {
  const session = new CloudflareCarrierSession({
    carrier_session_id: 'carrier_session_tool_effect_throw',
    agent_id: 'narada.fixture.agent',
    site_id: 'site_fixture',
    site_root: 'cloudflare://site_fixture',
    providerAdapter: {
      posture: 'fixture',
      adapter_kind: 'fixture-provider',
      provider: 'fixture',
      model: 'fixture',
      calls: [],
      async run({ tool_results = [] }) {
        this.calls.push({ tool_results });
        if (tool_results.length > 0) return { text: 'Observed failed tool effect.' };
        return {
          text: 'Requesting throwing tool.',
          tool_calls: [{
            tool_name: 'fixture_throwing_tool',
            arguments_summary: '{}',
            arguments_ref: null,
          }],
        };
      },
    },
    toolEffectAdapter: {
      posture: 'configured',
      adapter_kind: 'fixture-throwing-tool-effect-boundary',
      supported_tools: ['fixture_throwing_tool'],
      capabilities: [{
        capability_ref: 'fixture:capability/throwing-tool:v1',
        effect_scope: 'fixture:throwing-tool',
        tool_name: 'fixture_throwing_tool',
        access: 'write',
        substrate: 'fixture',
      }],
      async execute() {
        throw new Error('fixture_tool_effect_threw');
      },
    },
  });
  const input = {
    ...inputPipelineCases.cases.find((entry) => entry.name === 'manual_operator_admitted').input,
    event_id: 'input_tool_effect_throw_1',
    content: 'Try a tool whose adapter throws.',
  };

  const response = await session.handle({
    operation: 'carrier.input.deliver',
    request_id: 'request_tool_effect_throw',
    principal: { principal_id: 'operator.fixture', controlled_actions: ['*'] },
    params: { input },
  });
  assert.equal(response.terminal_state, 'completed');
  const toolResult = response.events.find((event) => event.event_kind === 'tool_result_received');
  assert.equal(toolResult.payload.status, 'failed');
  assert.equal(toolResult.payload.admission_action, undefined);
  assert.equal(toolResult.payload.admission_reason, undefined);
  assert.equal(toolResult.payload.result_summary, 'fixture_tool_effect_threw');
  const textDeltas = response.events.filter((event) => event.event_kind === 'provider_text_delta_recorded');
  assert.equal(textDeltas.at(-1).payload.text_delta, 'Observed failed tool effect.');
  assert.equal(session.providerAdapter.calls.length, 2);
  assert.equal(session.providerAdapter.calls[1].tool_results[0].status, 'failed');
  assertValidEvents(response);
});

test('configured Cloudflare tool adapter denies admitted effects without principal authority', async () => {
  const session = new CloudflareCarrierSession({
    carrier_session_id: 'carrier_session_tool_authority_denied',
    agent_id: 'narada.fixture.agent',
    site_id: 'site_fixture',
    site_root: 'cloudflare://site_fixture',
    providerAdapter: {
      posture: 'fixture',
      adapter_kind: 'fixture-provider',
      provider: 'fixture',
      model: 'fixture',
      async run({ tool_results = [] }) {
        if (tool_results.length > 0) return { text: 'Denied by authority.' };
        return {
          text: 'Requesting metadata.',
          tool_calls: [{
            tool_name: 'cloudflare_carrier_runtime_metadata_read',
            arguments_summary: '{}',
            arguments_ref: null,
          }],
        };
      },
    },
    toolEffectAdapter: createCloudflareToolEffectAdapter({ CLOUDFLARE_CARRIER_ENABLE_RUNTIME_TOOL_READS: '1' }),
  });
  const input = {
    ...inputPipelineCases.cases.find((entry) => entry.name === 'manual_operator_admitted').input,
    event_id: 'input_tool_authority_denied_1',
    content: 'Try runtime metadata without authority.',
  };

  const response = await session.handle({
    operation: 'carrier.input.deliver',
    request_id: 'request_tool_authority_denied',
    principal: { principal_id: 'limited-user', controlled_actions: [] },
    params: { input },
  });
  const toolResult = response.events.find((event) => event.event_kind === 'tool_result_received');
  assert.equal(toolResult.payload.status, 'denied');
  assert.equal(toolResult.payload.admission_action, 'deny');
  assert.equal(toolResult.payload.admission_reason, 'tool_effect_authority_denied');
  assert.equal(toolResult.payload.authority_ref, undefined);
  assert.equal(toolResult.payload.capability_ref, undefined);
  assert.equal(toolResult.payload.effect_scope, undefined);
  assert.equal(toolResult.payload.result_summary, 'tool_effect_authority_denied');
  assertValidEvents(response);
});

test('worker export rejects unauthenticated and invalid bearer requests', async () => {
  const namespace = fakeDurableObjectNamespace();
  const env = authEnv(namespace);

  let response = await worker.fetch(jsonRequest(startRequest()), env);
  assert.equal(response.status, 401);
  assert.equal((await response.json()).code, 'unauthorized');

  response = await worker.fetch(jsonRequest(startRequest(), { token: 'wrong-token' }), env);
  assert.equal(response.status, 401);
  assert.equal((await response.json()).code, 'unauthorized');

  response = await worker.fetch(jsonRequest(startRequest(), { token: 'test-admin-token' }), { CLOUDFLARE_CARRIER_SESSIONS: namespace });
  assert.equal(response.status, 500);
  assert.equal((await response.json()).code, 'auth_not_configured');
});

test('carrier auth classifier matches revolution bearer token principal shapes', () => {
  const admin = authenticateCarrierRequest(jsonRequest({}, { token: 'test-admin-token' }), { ADMIN_BEARER_TOKEN: 'test-admin-token' });
  assert.equal(admin.ok, true);
  assert.equal(admin.principal.auth_type, 'user');
  assert.equal(admin.principal.email, 'admin@system');
  assert.deepEqual(admin.principal.roles, [1]);
  assert.deepEqual(admin.principal.controlled_actions, ['*']);

  const service = authenticateCarrierRequest(jsonRequest({}, { token: 'test-service-token' }), { SERVICE_TOKEN: 'test-service-token' });
  assert.equal(service.ok, true);
  assert.equal(service.principal.auth_type, 'service');
  assert.equal(service.principal.principal_id, 'service');
});

test('tool effect classifier is deny-by-default and admits only configured Cloudflare capabilities', () => {
  assert.equal(toolEffectAdmissionCases.schema, TOOL_EFFECT_ADMISSION_CASES_SCHEMA);
  for (const fixtureCase of toolEffectAdmissionCases.cases) {
    assert.deepEqual(classifyCloudflareToolEffectAdmission(fixtureCase.tool_call, fixtureCase.state), fixtureCase.expected, fixtureCase.name);
  }
});

test('evidence rejects obvious secret values', () => {
  const { router } = startedSession();
  assert.throws(() => router.handle(commandRequest('host.command', [], {
    request_id: 'request_secret_leak',
    params: {
      command: 'host.command',
      target: 'diagnostic_read',
      command_text: 'print secret_value',
    },
  })), /evidence_contains_secret_value/);
});

test('control classifier marks cloudflare supported and mutating operations', () => {
  assert.equal(classifyCloudflareCarrierControl({ operation: 'directive.emit' }).cloudflare_supported, true);
  assert.equal(classifyCloudflareCarrierControl({ operation: 'directive.emit' }).mutates_session, true);
  assert.equal(classifyCloudflareCarrierControl({ operation: 'carrier.input.deliver' }).cloudflare_supported, true);
  assert.equal(classifyCloudflareCarrierControl({ operation: 'carrier.input.deliver' }).mutates_session, true);
  assert.equal(classifyCloudflareCarrierControl({ operation: 'session.events.read' }).mutates_session, false);
  assert.equal(classifyCloudflareCarrierControl({ operation: 'unknown' }).cloudflare_supported, false);
});

function fakeStorage() {
  const values = new Map();
  const alarms = [];
  return {
    async get(key) {
      const value = values.get(key);
      return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
    },
    async put(key, value) {
      values.set(key, JSON.parse(JSON.stringify(value)));
    },
    async setAlarm(timestamp) {
      alarms.push(timestamp);
    },
    alarms() {
      return [...alarms];
    },
  };
}

function fakeDurableObjectNamespace(durableEnv = {}) {
  const objects = new Map();
  return {
    idFromName(name) {
      return name;
    },
    get(id) {
      if (!objects.has(id)) {
        const storage = fakeStorage();
        const durableObject = new CloudflareCarrierDurableObject({ storage }, durableEnv);
        objects.set(id, {
          async fetch(request) {
            return durableObject.fetch(request);
          },
        });
      }
      return objects.get(id);
    },
  };
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });
  return { promise, resolve, reject };
}

function authEnv(namespace, extra = {}) {
  return {
    CLOUDFLARE_CARRIER_SESSIONS: namespace,
    ADMIN_BEARER_TOKEN: 'test-admin-token',
    SERVICE_TOKEN: 'test-service-token',
    NARADA_OPERATOR_SESSION_SECRET: 'test-operator-session-secret',
    ...extra,
  };
}

function microsoftAuthEnv(extraClaims = {}) {
  return {
    MICROSOFT_OIDC_TENANT_ID: 'tenant-fixture',
    MICROSOFT_OIDC_CLIENT_ID: 'microsoft-client-fixture',
    MICROSOFT_OIDC_CLIENT_SECRET: 'microsoft-secret-fixture',
    MICROSOFT_OIDC_FAKE_ID_TOKEN_PAYLOAD: {
      iss: 'https://login.microsoftonline.com/tenant-fixture/v2.0',
      aud: 'microsoft-client-fixture',
      tid: 'tenant-fixture',
      oid: 'object-fixture',
      sub: 'subject-fixture',
      nonce: null,
      exp: Math.floor(Date.now() / 1000) + 3600,
      preferred_username: 'operator@example.com',
      name: 'Operator Fixture',
      ...extraClaims,
    },
  };
}

function fakeAiBinding(response) {
  const responses = Array.isArray(response) ? [...response] : [response];
  const calls = [];
  return {
    calls,
    async run(model, request) {
      calls.push({ model, request });
      const next = responses.length > 1 ? responses.shift() : responses[0];
      return typeof next === 'object' && next !== null ? next : { response: next };
    },
  };
}

function fakeKvBinding(values = {}) {
  const state = { ...values };
  return {
    async get(key) {
      return Object.prototype.hasOwnProperty.call(state, key) ? state[key] : null;
    },
    async put(key, value) {
      state[key] = value;
    },
    dump() {
      return { ...state };
    },
  };
}

function fakeD1TaskDatabase() {
  const rows = [];
  return {
    rows,
    prepare(sql) {
      return fakeD1Statement(rows, String(sql));
    },
  };
}

function fakeD1SiteRegistryDatabase(initial = {}) {
  const state = {
    sites: clone(initial.sites ?? []),
    memberships: clone(initial.memberships ?? []),
    settings: clone(initial.settings ?? []),
    operations: clone(initial.operations ?? []),
    carrierSessions: clone(initial.carrierSessions ?? []),
    authorityEvents: clone(initial.authorityEvents ?? []),
    operatorSessions: clone(initial.operatorSessions ?? []),
    continuityPackets: clone(initial.continuityPackets ?? []),
    continuityLoopReports: clone(initial.continuityLoopReports ?? []),
    webhookDelayRemoteSourceSamples: clone(initial.webhookDelayRemoteSourceSamples ?? []),
    webhookDelayScheduledSourceReads: clone(initial.webhookDelayScheduledSourceReads ?? []),
    webhookDelayShadowObservations: clone(initial.webhookDelayShadowObservations ?? []),
    webhookDelayObservationPrimaryReads: clone(initial.webhookDelayObservationPrimaryReads ?? []),
    webhookDelayDirectiveRecords: clone(initial.webhookDelayDirectiveRecords ?? []),
    webhookDelayDirectiveDeliveries: clone(initial.webhookDelayDirectiveDeliveries ?? []),
    residentLoopShadowRuns: clone(initial.residentLoopShadowRuns ?? []),
    taskLifecycleShadowReads: clone(initial.taskLifecycleShadowReads ?? []),
    taskLifecycleWriteAdmissions: clone(initial.taskLifecycleWriteAdmissions ?? []),
    taskLifecycleTasks: clone(initial.taskLifecycleTasks ?? []),
    residentDispatchDecisions: clone(initial.residentDispatchDecisions ?? []),
    carrierSessionEvents: clone(initial.carrierSessionEvents ?? []),
  };
  return {
    prepare(sql) {
      return fakeD1SiteRegistryStatement(state, String(sql));
    },
    dump() {
      return clone(state);
    },
  };
}

function fakeD1SiteRegistryStatement(state, sql) {
  const normalized = sql.replace(/\s+/g, ' ').trim().toLowerCase();
  let bindings = [];
  return {
    bind(...values) {
      bindings = values;
      return this;
    },
    async run() {
      if (normalized.startsWith('insert into cloudflare_site_memberships')) {
        const [site_id, principal_id, role, status, created_at, updated_at] = bindings;
        const existing = state.memberships.find((entry) => entry.site_id === site_id && entry.principal_id === principal_id);
        if (existing) Object.assign(existing, { role, status, updated_at });
        else state.memberships.push({ site_id, principal_id, role, status, created_at, updated_at });
      } else if (normalized.startsWith('insert into cloudflare_site_operations')) {
        const [operation_id, site_id, display_name, operation_kind, status, created_by_principal_id, created_at, updated_at] = bindings;
        const existing = state.operations.find((entry) => entry.operation_id === operation_id);
        if (existing) Object.assign(existing, { display_name, operation_kind, status, updated_at });
        else state.operations.push({ operation_id, site_id, display_name, operation_kind, status, created_by_principal_id, created_at, updated_at });
      } else if (normalized.startsWith('update cloudflare_site_operations')) {
        const [status, updated_at, operation_id] = bindings;
        const existing = state.operations.find((entry) => entry.operation_id === operation_id);
        if (existing) Object.assign(existing, { status, updated_at });
      } else if (normalized.startsWith('update cloudflare_site_carrier_sessions set operation_id')) {
        const [operation_id, updated_at, carrier_session_id] = bindings;
        const existing = state.carrierSessions.find((entry) => entry.carrier_session_id === carrier_session_id);
        if (existing) Object.assign(existing, { operation_id, updated_at });
      } else if (normalized.startsWith('insert into cloudflare_site_carrier_sessions')) {
        const hasOperationId = bindings.length === 8;
        const [carrier_session_id, site_id, maybe_operation_id, maybe_agent_id, maybe_bound_by_principal_id, maybe_binding_status, maybe_created_at, maybe_updated_at] = bindings;
        const operation_id = hasOperationId ? maybe_operation_id : null;
        const agent_id = hasOperationId ? maybe_agent_id : maybe_operation_id;
        const bound_by_principal_id = hasOperationId ? maybe_bound_by_principal_id : maybe_agent_id;
        const binding_status = hasOperationId ? maybe_binding_status : maybe_bound_by_principal_id;
        const created_at = hasOperationId ? maybe_created_at : maybe_binding_status;
        const updated_at = hasOperationId ? maybe_updated_at : maybe_created_at;
        if (!state.carrierSessions.some((entry) => entry.carrier_session_id === carrier_session_id)) {
          state.carrierSessions.push({ carrier_session_id, site_id, operation_id, agent_id, bound_by_principal_id, binding_status, created_at, updated_at });
        }
      } else if (normalized.startsWith('insert into cloudflare_site_authority_events')) {
        const [event_id, event_kind, site_id, carrier_session_id, principal_id, action, reason, evidence_json, recorded_at] = bindings;
        state.authorityEvents.push({ event_id, event_kind, site_id, carrier_session_id, principal_id, action, reason, evidence_json, recorded_at });
      } else if (normalized.startsWith('insert into cloudflare_operator_sessions')) {
        const [operator_session_id, principal_id, auth_type, issuer, tenant_id, subject, object_id, email, display_name, created_at, expires_at, revoked_at] = bindings;
        state.operatorSessions.push({ operator_session_id, principal_id, auth_type, issuer, tenant_id, subject, object_id, email, display_name, created_at, expires_at, revoked_at });
      } else if (normalized.startsWith('insert into cloudflare_site_continuity_packets')) {
        const [packet_id, site_id, relation_id, source_embodiment_kind, target_embodiment_kind, admission_action, admission_reason, packet_json, imported_by_principal_id, imported_at] = bindings;
        state.continuityPackets.push({ packet_id, site_id, relation_id, source_embodiment_kind, target_embodiment_kind, admission_action, admission_reason, packet_json, imported_by_principal_id, imported_at });
      } else if (normalized.startsWith('insert into cloudflare_site_continuity_loop_reports')) {
        const [report_id, site_id, status, generated_at, cloudflare_source, cloudflare_push_status, windows_packet_count, cloudflare_credential_source, report_json, recorded_by_principal_id, recorded_at] = bindings;
        const existing = state.continuityLoopReports.find((entry) => entry.report_id === report_id);
        const row = { report_id, site_id, status, generated_at, cloudflare_source, cloudflare_push_status, windows_packet_count, cloudflare_credential_source, report_json, recorded_by_principal_id, recorded_at };
        if (existing) Object.assign(existing, row);
        else state.continuityLoopReports.push(row);
      } else if (normalized.startsWith('insert into cloudflare_webhook_delay_shadow_observations')) {
        const [observation_id, site_id, source_locus, target_locus, generated_at, latest_delay_minutes, critical_minutes, classification_state, dispatch_authority, shadow_mode, dispatch_action, observation_json, classification_json, recorded_by_principal_id, recorded_at] = bindings;
        const existing = state.webhookDelayShadowObservations.find((entry) => entry.observation_id === observation_id);
        const row = { observation_id, site_id, source_locus, target_locus, generated_at, latest_delay_minutes, critical_minutes, classification_state, dispatch_authority, shadow_mode, dispatch_action, observation_json, classification_json, recorded_by_principal_id, recorded_at };
        if (existing) Object.assign(existing, row);
        else state.webhookDelayShadowObservations.push(row);
      } else if (normalized.startsWith('insert into cloudflare_webhook_delay_remote_source_samples')) {
        const [sample_id, site_id, source_adapter_id, sample_role, observed_at, observed_at_ct, elapsed_minutes, delay_minutes, sample_json, recorded_by_principal_id, recorded_at] = bindings;
        const existing = state.webhookDelayRemoteSourceSamples.find((entry) => entry.sample_id === sample_id);
        const row = { sample_id, site_id, source_adapter_id, sample_role, observed_at, observed_at_ct, elapsed_minutes, delay_minutes, sample_json, recorded_by_principal_id, recorded_at };
        if (existing) Object.assign(existing, row);
        else state.webhookDelayRemoteSourceSamples.push(row);
      } else if (normalized.startsWith('insert into cloudflare_webhook_delay_scheduled_source_reads')) {
        const [scheduled_run_id, site_id, source_adapter_id, observation_id, trigger_authority, trigger_kind, cron, scheduled_at, run_status, failure_code, source_material_locus, source_authority, source_sample_count, classification_state, latest_delay_minutes, critical_minutes, fallback_authority, fallback_status, record_json, recorded_by_principal_id, recorded_at] = bindings;
        const existing = state.webhookDelayScheduledSourceReads.find((entry) => entry.scheduled_run_id === scheduled_run_id);
        const row = { scheduled_run_id, site_id, source_adapter_id, observation_id, trigger_authority, trigger_kind, cron, scheduled_at, run_status, failure_code, source_material_locus, source_authority, source_sample_count, classification_state, latest_delay_minutes, critical_minutes, fallback_authority, fallback_status, record_json, recorded_by_principal_id, recorded_at };
        if (existing) Object.assign(existing, row);
        else state.webhookDelayScheduledSourceReads.push(row);
      } else if (normalized.startsWith('insert into cloudflare_webhook_delay_observation_primary_reads')) {
        const [observation_id, site_id, source_locus, source_material_locus, target_locus, generated_at, latest_delay_minutes, critical_minutes, classification_state, observation_authority, fallback_authority, fallback_status, dispatch_authority, dispatch_action, observation_json, classification_json, record_json, recorded_by_principal_id, recorded_at] = bindings;
        const existing = state.webhookDelayObservationPrimaryReads.find((entry) => entry.observation_id === observation_id);
        const row = { observation_id, site_id, source_locus, source_material_locus, target_locus, generated_at, latest_delay_minutes, critical_minutes, classification_state, observation_authority, fallback_authority, fallback_status, dispatch_authority, dispatch_action, observation_json, classification_json, record_json, recorded_by_principal_id, recorded_at };
        if (existing) Object.assign(existing, row);
        else state.webhookDelayObservationPrimaryReads.push(row);
      } else if (normalized.startsWith('insert into cloudflare_webhook_delay_directive_dual_records')) {
        const [directive_record_id, site_id, operation_id, classification_state, latest_delay_minutes, critical_minutes, directive_action, directive_authority, fallback_authority, fallback_status, threshold_policy_json, observation_json, classification_json, directive_intent_json, carrier_admission_json, recorded_by_principal_id, recorded_at] = bindings;
        const existing = state.webhookDelayDirectiveRecords.find((entry) => entry.directive_record_id === directive_record_id);
        const row = { directive_record_id, site_id, operation_id, classification_state, latest_delay_minutes, critical_minutes, directive_action, directive_authority, fallback_authority, fallback_status, threshold_policy_json, observation_json, classification_json, directive_intent_json, carrier_admission_json, recorded_by_principal_id, recorded_at };
        if (existing) Object.assign(existing, row);
        else state.webhookDelayDirectiveRecords.push(row);
      } else if (normalized.startsWith('insert into cloudflare_webhook_delay_directive_deliveries')) {
        const [delivery_id, directive_record_id, site_id, operation_id, carrier_session_id, delivery_state, classification_state, latest_delay_minutes, critical_minutes, directive_authority, dispatch_authority, fallback_authority, fallback_status, delivery_action, session_start_status, session_start_ok, delivery_status, delivery_ok, threshold_policy_json, observation_json, classification_json, directive_intent_json, carrier_admission_json, session_start_json, delivery_json, record_json, recorded_by_principal_id, recorded_at] = bindings;
        const existing = state.webhookDelayDirectiveDeliveries.find((entry) => entry.delivery_id === delivery_id);
        const row = { delivery_id, directive_record_id, site_id, operation_id, carrier_session_id, delivery_state, classification_state, latest_delay_minutes, critical_minutes, directive_authority, dispatch_authority, fallback_authority, fallback_status, delivery_action, session_start_status, session_start_ok, delivery_status, delivery_ok, threshold_policy_json, observation_json, classification_json, directive_intent_json, carrier_admission_json, session_start_json, delivery_json, record_json, recorded_by_principal_id, recorded_at };
        if (existing) Object.assign(existing, row);
        else state.webhookDelayDirectiveDeliveries.push(row);
      } else if (normalized.startsWith('insert into cloudflare_resident_loop_shadow_runs')) {
        const [loop_run_id, site_id, operation_id, source_locus, target_locus, run_started_at, run_finished_at, loop_status, step_count, operator_attention_count, dispatch_authority, shadow_mode, dispatch_action, loop_run_json, recorded_by_principal_id, recorded_at] = bindings;
        const existing = state.residentLoopShadowRuns.find((entry) => entry.loop_run_id === loop_run_id);
        const row = { loop_run_id, site_id, operation_id, source_locus, target_locus, run_started_at, run_finished_at, loop_status, step_count, operator_attention_count, dispatch_authority, shadow_mode, dispatch_action, loop_run_json, recorded_by_principal_id, recorded_at };
        if (existing) Object.assign(existing, row);
        else state.residentLoopShadowRuns.push(row);
      } else if (normalized.startsWith('insert into cloudflare_task_lifecycle_shadow_reads')) {
        const [read_id, site_id, source_locus, target_locus, source_url_host, source_db_path, source_schema, generated_at, task_count, status_counts_json, tasks_json, mutation_authority, shadow_read_posture, cloudflare_write_admission, dispatch_authority, shadow_mode, dispatch_action, record_json, recorded_by_principal_id, recorded_at] = bindings;
        const existing = state.taskLifecycleShadowReads.find((entry) => entry.read_id === read_id);
        const row = { read_id, site_id, source_locus, target_locus, source_url_host, source_db_path, source_schema, generated_at, task_count, status_counts_json, tasks_json, mutation_authority, shadow_read_posture, cloudflare_write_admission, dispatch_authority, shadow_mode, dispatch_action, record_json, recorded_by_principal_id, recorded_at };
        if (existing) Object.assign(existing, row);
        else state.taskLifecycleShadowReads.push(row);
      } else if (normalized.startsWith('insert into cloudflare_task_lifecycle_write_admissions')) {
        const [admission_id, site_id, mutation_class, admission_action, admission_reason, authority_locus, target_authority_locus, mutation_authority, cloudflare_write_admission, write_effect, decision_json, recorded_by_principal_id, recorded_at] = bindings;
        const existing = state.taskLifecycleWriteAdmissions.find((entry) => entry.admission_id === admission_id);
        const row = { admission_id, site_id, mutation_class, admission_action, admission_reason, authority_locus, target_authority_locus, mutation_authority, cloudflare_write_admission, write_effect, decision_json, recorded_by_principal_id, recorded_at };
        if (existing) Object.assign(existing, row);
        else state.taskLifecycleWriteAdmissions.push(row);
      } else if (normalized.startsWith('insert into cloudflare_task_lifecycle_tasks')) {
        const [site_id, task_id, task_number, title, description, status, source, authority_locus, mutation_authority, cloudflare_write_admission, cutover_point_ref, governed_write_contract_ref, confirmation_evidence_ref, task_json, created_by_principal_id, created_at, updated_at] = bindings;
        const existing = state.taskLifecycleTasks.find((entry) => entry.site_id === site_id && entry.task_id === task_id);
        const row = { site_id, task_id, task_number, title, description, status, source, authority_locus, mutation_authority, cloudflare_write_admission, cutover_point_ref, governed_write_contract_ref, confirmation_evidence_ref, task_json, created_by_principal_id, created_at, updated_at };
        if (existing) Object.assign(existing, row);
        else state.taskLifecycleTasks.push(row);
      } else if (normalized.startsWith('update cloudflare_task_lifecycle_tasks')) {
        const [status, task_json, updated_at, site_id, task_id] = bindings;
        const existing = state.taskLifecycleTasks.find((entry) => entry.site_id === site_id && entry.task_id === task_id);
        if (existing) Object.assign(existing, { status, task_json, updated_at });
      } else if (normalized.startsWith('insert into cloudflare_resident_dispatch_decisions')) {
        const [dispatch_decision_id, site_id, operation_id, carrier_session_id, decision_state, dispatch_authority, fallback_authority, fallback_status, dispatch_action, dispatch_scope, session_start_status, session_start_ok, decision_json, recorded_by_principal_id, recorded_at] = bindings;
        const existing = state.residentDispatchDecisions.find((entry) => entry.dispatch_decision_id === dispatch_decision_id);
        const row = { dispatch_decision_id, site_id, operation_id, carrier_session_id, decision_state, dispatch_authority, fallback_authority, fallback_status, dispatch_action, dispatch_scope, session_start_status, session_start_ok, decision_json, recorded_by_principal_id, recorded_at };
        if (existing) Object.assign(existing, row);
        else state.residentDispatchDecisions.push(row);
      } else if (normalized.startsWith('insert into cloudflare_carrier_session_events')) {
        const [carrier_session_id, sequence, event_id, site_id, operation_id, agent_id, event_kind, occurred_at, event_json, indexed_at] = bindings;
        const existing = state.carrierSessionEvents.find((entry) => entry.carrier_session_id === carrier_session_id && Number(entry.sequence) === Number(sequence));
        const row = { carrier_session_id, sequence: Number(sequence), event_id, site_id, operation_id, agent_id, event_kind, occurred_at, event_json, indexed_at };
        if (existing) Object.assign(existing, row);
        else state.carrierSessionEvents.push(row);
      }
      return { success: true };
    },
    async first() {
      if (normalized.includes('from cloudflare_sites where site_id = ?')) {
        const [siteId] = bindings;
        return clone(state.sites.find((site) => site.site_id === siteId));
      }
      if (normalized.includes('from cloudflare_site_memberships where site_id = ? and principal_id = ?')) {
        const [siteId, principalId] = bindings;
        return clone(state.memberships.find((membership) => membership.site_id === siteId && membership.principal_id === principalId));
      }
      if (normalized.includes('from cloudflare_site_carrier_sessions where carrier_session_id = ?')) {
        const [carrierSessionId] = bindings;
        return clone(state.carrierSessions.find((entry) => entry.carrier_session_id === carrierSessionId));
      }
      if (normalized.includes('from cloudflare_site_operations where operation_id = ?')) {
        const [operationId] = bindings;
        return clone(state.operations.find((entry) => entry.operation_id === operationId));
      }
      if (normalized.includes('from cloudflare_operator_sessions')) {
        const [operatorSessionId, now] = bindings;
        return clone(state.operatorSessions.find((entry) => (
          entry.operator_session_id === operatorSessionId
          && entry.revoked_at == null
          && entry.expires_at > now
        )));
      }
      if (normalized.includes('max(task_number)') && normalized.includes('from cloudflare_task_lifecycle_tasks')) {
        const [siteId] = bindings;
        const maxTaskNumber = state.taskLifecycleTasks
          .filter((entry) => entry.site_id === siteId)
          .reduce((max, entry) => Math.max(max, Number(entry.task_number)), 0);
        return { next_task_number: maxTaskNumber + 1 };
      }
      if (normalized.includes('from cloudflare_task_lifecycle_tasks') && normalized.includes('task_id = ?')) {
        const [siteId, taskId] = bindings;
        return clone(state.taskLifecycleTasks.find((entry) => entry.site_id === siteId && entry.task_id === taskId));
      }
      return null;
    },
    async all() {
      if (normalized.includes('from cloudflare_sites s join cloudflare_site_memberships m')) {
        const [principalId] = bindings;
        const visibleSiteIds = new Set(state.memberships
          .filter((membership) => membership.principal_id === principalId && membership.status === 'active')
          .map((membership) => membership.site_id));
        return {
          results: state.sites
            .filter((site) => visibleSiteIds.has(site.site_id) && site.status === 'active')
            .sort((left, right) => left.created_at.localeCompare(right.created_at))
            .map((site) => clone(site)),
        };
      }
      if (normalized.includes('from cloudflare_site_carrier_sessions')) {
        if (normalized.includes('where operation_id = ?')) {
          const [operationId, limit] = bindings;
          return {
            results: state.carrierSessions
              .filter((entry) => entry.operation_id === operationId)
              .sort((left, right) => right.created_at.localeCompare(left.created_at))
              .slice(0, Number(limit))
              .map((entry) => clone(entry)),
          };
        }
        const [siteId, limit] = bindings;
        return {
          results: state.carrierSessions
            .filter((entry) => entry.site_id === siteId)
            .sort((left, right) => right.created_at.localeCompare(left.created_at))
            .slice(0, Number(limit))
            .map((entry) => clone(entry)),
        };
      }
      if (normalized.includes('from cloudflare_site_continuity_loop_reports')) {
        const [siteId, limit] = bindings;
        return {
          results: state.continuityLoopReports
            .filter((entry) => entry.site_id === siteId)
            .sort((left, right) => right.recorded_at.localeCompare(left.recorded_at))
            .slice(0, Number(limit))
            .map((entry) => clone(entry)),
        };
      }
      if (normalized.includes('from cloudflare_carrier_session_events')) {
        const [carrierSessionId, limit] = bindings;
        return {
          results: state.carrierSessionEvents
            .filter((entry) => entry.carrier_session_id === carrierSessionId)
            .sort((left, right) => Number(left.sequence) - Number(right.sequence))
            .slice(0, Number(limit))
            .map((entry) => clone(entry)),
        };
      }
      if (normalized.includes('from cloudflare_site_authority_events')) {
        const [siteId, limit] = bindings;
        return {
          results: state.authorityEvents
            .filter((entry) => entry.site_id === siteId)
            .sort((left, right) => right.recorded_at.localeCompare(left.recorded_at))
            .slice(0, Number(limit))
            .map((entry) => clone(entry)),
        };
      }
      if (normalized.includes('from cloudflare_site_settings')) {
        const [siteId] = bindings;
        return { results: state.settings.filter((entry) => entry.site_id === siteId).map((entry) => clone(entry)) };
      }
      if (normalized.includes('from cloudflare_site_operations')) {
        const [siteId, limit] = bindings;
        return {
          results: state.operations
            .filter((entry) => entry.site_id === siteId)
            .sort((left, right) => left.created_at.localeCompare(right.created_at))
            .slice(0, Number(limit))
            .map((entry) => clone(entry)),
        };
      }
      if (normalized.includes('from cloudflare_site_continuity_packets')) {
        const [siteId, limit] = bindings;
        return {
          results: state.continuityPackets
            .filter((entry) => entry.site_id === siteId)
            .sort((left, right) => right.imported_at.localeCompare(left.imported_at))
            .slice(0, Number(limit))
            .map((entry) => clone(entry)),
        };
      }
      if (normalized.includes('from cloudflare_webhook_delay_shadow_observations')) {
        const [siteId, limit] = bindings;
        return {
          results: state.webhookDelayShadowObservations
            .filter((entry) => entry.site_id === siteId)
            .sort((left, right) => right.recorded_at.localeCompare(left.recorded_at) || right.generated_at.localeCompare(left.generated_at))
            .slice(0, Number(limit))
            .map((entry) => clone(entry)),
        };
      }
      if (normalized.includes('from cloudflare_webhook_delay_remote_source_samples')) {
        const [siteId, sourceAdapterId, limit] = bindings;
        return {
          results: state.webhookDelayRemoteSourceSamples
            .filter((entry) => entry.site_id === siteId && entry.source_adapter_id === sourceAdapterId)
            .sort((left, right) => right.observed_at.localeCompare(left.observed_at) || right.recorded_at.localeCompare(left.recorded_at))
            .slice(0, Number(limit))
            .map((entry) => clone(entry)),
        };
      }
      if (normalized.includes('from cloudflare_webhook_delay_scheduled_source_reads')) {
        const [siteId, limit] = bindings;
        return {
          results: state.webhookDelayScheduledSourceReads
            .filter((entry) => entry.site_id === siteId)
            .sort((left, right) => right.recorded_at.localeCompare(left.recorded_at) || right.scheduled_at.localeCompare(left.scheduled_at))
            .slice(0, Number(limit))
            .map((entry) => clone(entry)),
        };
      }
      if (normalized.includes('from cloudflare_webhook_delay_observation_primary_reads')) {
        const [siteId, limit] = bindings;
        return {
          results: state.webhookDelayObservationPrimaryReads
            .filter((entry) => entry.site_id === siteId)
            .sort((left, right) => right.recorded_at.localeCompare(left.recorded_at) || right.generated_at.localeCompare(left.generated_at))
            .slice(0, Number(limit))
            .map((entry) => clone(entry)),
        };
      }
      if (normalized.includes('from cloudflare_webhook_delay_directive_dual_records')) {
        const [siteId, limit] = bindings;
        return {
          results: state.webhookDelayDirectiveRecords
            .filter((entry) => entry.site_id === siteId)
            .sort((left, right) => right.recorded_at.localeCompare(left.recorded_at))
            .slice(0, Number(limit))
            .map((entry) => clone(entry)),
        };
      }
      if (normalized.includes('from cloudflare_webhook_delay_directive_deliveries')) {
        const [siteId, limit] = bindings;
        return {
          results: state.webhookDelayDirectiveDeliveries
            .filter((entry) => entry.site_id === siteId)
            .sort((left, right) => right.recorded_at.localeCompare(left.recorded_at))
            .slice(0, Number(limit))
            .map((entry) => clone(entry)),
        };
      }
      if (normalized.includes('from cloudflare_resident_loop_shadow_runs')) {
        const [siteId, limit] = bindings;
        return {
          results: state.residentLoopShadowRuns
            .filter((entry) => entry.site_id === siteId)
            .sort((left, right) => right.recorded_at.localeCompare(left.recorded_at))
            .slice(0, Number(limit))
            .map((entry) => clone(entry)),
        };
      }
      if (normalized.includes('from cloudflare_task_lifecycle_shadow_reads')) {
        const [siteId, limit] = bindings;
        return {
          results: state.taskLifecycleShadowReads
            .filter((entry) => entry.site_id === siteId)
            .sort((left, right) => right.recorded_at.localeCompare(left.recorded_at) || right.generated_at.localeCompare(left.generated_at))
            .slice(0, Number(limit))
            .map((entry) => clone(entry)),
        };
      }
      if (normalized.includes('from cloudflare_task_lifecycle_write_admissions')) {
        const [siteId, limit] = bindings;
        return {
          results: state.taskLifecycleWriteAdmissions
            .filter((entry) => entry.site_id === siteId)
            .sort((left, right) => right.recorded_at.localeCompare(left.recorded_at))
            .slice(0, Number(limit))
            .map((entry) => clone(entry)),
        };
      }
      if (normalized.includes('from cloudflare_task_lifecycle_tasks')) {
        const [siteId, limit] = bindings;
        return {
          results: state.taskLifecycleTasks
            .filter((entry) => entry.site_id === siteId)
            .sort((left, right) => Number(left.task_number) - Number(right.task_number))
            .slice(0, Number(limit))
            .map((entry) => clone(entry)),
        };
      }
      if (normalized.includes('from cloudflare_resident_dispatch_decisions')) {
        const [siteId, limit] = bindings;
        return {
          results: state.residentDispatchDecisions
            .filter((entry) => entry.site_id === siteId)
            .sort((left, right) => right.recorded_at.localeCompare(left.recorded_at))
            .slice(0, Number(limit))
            .map((entry) => clone(entry)),
        };
      }
      if (normalized.includes('from cloudflare_site_memberships')) {
        const [siteId, limit] = bindings;
        return {
          results: state.memberships
            .filter((entry) => entry.site_id === siteId)
            .sort((left, right) => left.created_at.localeCompare(right.created_at))
            .slice(0, Number(limit))
            .map((entry) => clone(entry)),
        };
      }
      return { results: [] };
    },
  };
}

function fakeD1Statement(rows, sql) {
  const normalized = sql.replace(/\s+/g, ' ').trim().toLowerCase();
  let bindings = [];
  return {
    bind(...values) {
      bindings = values;
      return this;
    },
    async run() {
      if (normalized.startsWith('insert into narada_tasks')) {
        const [site_id, task_id, task_number, title, description, status, source, note, created_at, updated_at, carrier_session_id, agent_id, site_root] = bindings;
        rows.push({ site_id, task_id, task_number, title, description, status, source, note, created_at, updated_at, carrier_session_id, agent_id, site_root });
      } else if (normalized.startsWith('update narada_tasks set')) {
        const [status, note, updated_at, siteId, taskId] = bindings;
        const row = rows.find((entry) => entry.site_id === siteId && entry.task_id === taskId);
        if (row) Object.assign(row, { status, note, updated_at });
      }
      return { success: true };
    },
    async first() {
      if (normalized.startsWith('select coalesce(max(task_number)')) {
        const [siteId] = bindings;
        const max = rows.filter((entry) => entry.site_id === siteId).reduce((value, entry) => Math.max(value, Number(entry.task_number)), 0);
        return { next_task_number: max + 1 };
      }
      if (normalized.includes('where site_id = ? and task_id = ?')) {
        const [siteId, taskId] = bindings;
        const row = rows.find((entry) => entry.site_id === siteId && entry.task_id === taskId);
        return row ? clone(row) : null;
      }
      if (normalized.includes('where site_id = ? and task_number = ?')) {
        const [siteId, taskNumber] = bindings;
        const row = rows.find((entry) => entry.site_id === siteId && Number(entry.task_number) === Number(taskNumber));
        return row ? clone(row) : null;
      }
      return null;
    },
    async all() {
      if (normalized.includes('where site_id = ? order by task_number')) {
        const [siteId] = bindings;
        return {
          results: rows
            .filter((entry) => entry.site_id === siteId)
            .sort((left, right) => Number(left.task_number) - Number(right.task_number))
            .map((entry) => clone(entry)),
        };
      }
      return { results: [] };
    },
  };
}

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function jsonRequest(body, { token = null, cookie = null, path = '/control' } = {}) {
  const headers = { 'content-type': 'application/json' };
  if (token) headers.authorization = `Bearer ${token}`;
  if (cookie) headers.cookie = cookie;
  return new Request(`https://carrier.test${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
}
