import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildDefaultObjectLifecyclePolicyCatalog,
  createDefaultAdmissionPolicy,
  evaluateAdmissionPolicy,
  evaluateObjectLifecycleTransition,
  type AdmissionEvaluationContext,
  type ObjectLifecyclePolicy,
  type ObjectLifecycleTransitionRequest,
} from './admission-lifecycle-policy.js';

const policy = createDefaultAdmissionPolicy();

function admissionContext(overrides: Partial<AdmissionEvaluationContext> = {}): AdmissionEvaluationContext {
  return {
    policy,
    ingress_kind: 'operator_message',
    payload_kind: 'operator_text',
    source_ref: 'input:1',
    target_authority_ref: 'authority:local',
    actor_ref: 'operator:andrey',
    authorized: true,
    source_stale: false,
    review_required: false,
    turn_state: 'idle',
    capacity: 'available',
    attempt: 0,
    now: '2026-07-28T00:00:00.000Z',
    ...overrides,
  };
}

test('AdmissionPolicy represents every canonical ingress outcome', () => {
  assert.equal(evaluateAdmissionPolicy(admissionContext()).outcome, 'accepted');
  assert.equal(evaluateAdmissionPolicy(admissionContext({ capacity: 'queueable' })).outcome, 'queued');
  assert.equal(evaluateAdmissionPolicy(admissionContext({ turn_state: 'active' })).outcome, 'delayed');
  assert.equal(evaluateAdmissionPolicy(admissionContext({ review_required: true })).outcome, 'review_required');
  assert.equal(evaluateAdmissionPolicy(admissionContext({ authorized: false })).outcome, 'rejected');
});

test('AdmissionPolicy records retry, backpressure, and audit evidence', () => {
  const decision = evaluateAdmissionPolicy(admissionContext({ capacity: 'queueable', attempt: 2, evidence_refs: ['event:7'] }));
  assert.equal(decision.retry.attempt, 2);
  assert.equal(decision.backpressure.mode, 'queue');
  assert.equal(decision.audit.required, true);
  assert.ok(decision.audit.evidence_refs.includes('event:7'));
  assert.ok(decision.audit.evidence_refs.includes('policy:policy:nars-admission-default@1'));
});

test('Site governance can restrict a decision but cannot relax a core refusal', () => {
  const reviewed = evaluateAdmissionPolicy(
    admissionContext(),
    () => ({ outcome: 'review_required', reason_code: 'site_review', site_policy_ref: 'site:andrey' }),
  );
  assert.equal(reviewed.outcome, 'review_required');
  assert.equal(reviewed.site_governance.hook_applied, true);
  assert.equal(reviewed.site_governance.authority_preserved, true);

  const refused = evaluateAdmissionPolicy(
    admissionContext({ authorized: false }),
    () => ({ outcome: 'accepted', reason_code: 'site_accept', site_policy_ref: 'site:andrey' }),
  );
  assert.equal(refused.outcome, 'rejected');
  assert.equal(refused.reason_code, 'site_hook_relaxation_refused');
});

const catalog = buildDefaultObjectLifecyclePolicyCatalog();

function lifecycleRequest(
  objectPolicy: ObjectLifecyclePolicy,
  overrides: Partial<ObjectLifecycleTransitionRequest> = {},
): ObjectLifecycleTransitionRequest {
  return {
    policy: objectPolicy,
    object_id: `${objectPolicy.object_family}:1`,
    actor_ref: objectPolicy.governance.mutation_authority_ref,
    authority_ref: objectPolicy.governance.mutation_authority_ref,
    current_state: objectPolicy.state_model.initial_states[0] ?? 'opened',
    next_state: objectPolicy.state_model.initial_states[0] ?? 'opened',
    expected_revision: 1,
    observed_revision: 1,
    stale: false,
    operation: 'transition',
    replay_evidence: 'not_attempted',
    now: '2026-07-28T00:00:00.000Z',
    ...overrides,
  };
}

test('ObjectLifecyclePolicy catalog maps eight object families without flattening local states', () => {
  const families = Object.keys(catalog);
  assert.equal(families.length, 8);
  for (const objectPolicy of Object.values(catalog)) {
    assert.ok(objectPolicy.state_model.states.length >= 4);
    assert.ok(objectPolicy.governance.object_specific_hook_ref.startsWith('hook:'));
    assert.equal(objectPolicy.retention.cleanup_requires_archive, true);
    assert.equal(objectPolicy.stale.mutation, 'refuse_until_reconciled');
    assert.equal(objectPolicy.audit.required, true);
  }
  assert.ok(catalog.task.state_model.states.includes('in_review'));
  assert.ok(catalog.session.state_model.states.includes('ready'));
  assert.ok(catalog.artifact.state_model.states.includes('expired'));
  assert.ok(catalog.attachment.state_model.states.includes('replaying'));
});

test('ObjectLifecyclePolicy allows an authorized task transition and emits evidence', () => {
  const task = catalog.task;
  const decision = evaluateObjectLifecycleTransition(lifecycleRequest(task, {
    object_id: 'task:2377',
    current_state: 'claimed',
    next_state: 'in_review',
    evidence_refs: ['task-event:claim'],
  }));
  assert.equal(decision.allowed, true);
  assert.equal(decision.code, 'allowed');
  assert.equal(decision.shared_phase, 'active');
  assert.ok(decision.audit.evidence_refs.includes('task-event:claim'));
});

test('ObjectLifecyclePolicy refuses unauthorized and stale transitions', () => {
  const task = catalog.task;
  const unauthorized = evaluateObjectLifecycleTransition(lifecycleRequest(task, {
    current_state: 'opened',
    next_state: 'claimed',
    actor_ref: 'agent:other',
  }));
  assert.equal(unauthorized.allowed, false);
  assert.equal(unauthorized.code, 'unauthorized_actor');

  const staleRevision = evaluateObjectLifecycleTransition(lifecycleRequest(task, {
    current_state: 'opened',
    next_state: 'claimed',
    expected_revision: 1,
    observed_revision: 2,
  }));
  assert.equal(staleRevision.code, 'stale_revision');

  const staleObject = evaluateObjectLifecycleTransition(lifecycleRequest(task, {
    current_state: 'deferred',
    next_state: 'opened',
    stale: true,
  }));
  assert.equal(staleObject.code, 'stale_object');
});

test('ObjectLifecyclePolicy requires explicit operations for revoke, archive, cleanup, and replay', () => {
  const artifact = catalog.artifact;
  const implicitRevoke = evaluateObjectLifecycleTransition(lifecycleRequest(artifact, {
    current_state: 'active',
    next_state: 'revoked',
    operation: 'transition',
  }));
  assert.equal(implicitRevoke.code, 'revoke_requires_operation');

  const explicitRevoke = evaluateObjectLifecycleTransition(lifecycleRequest(artifact, {
    current_state: 'active',
    next_state: 'revoked',
    operation: 'revoke',
  }));
  assert.equal(explicitRevoke.allowed, true);

  const implicitCleanup = evaluateObjectLifecycleTransition(lifecycleRequest(artifact, {
    current_state: 'active',
    next_state: 'active',
    operation: 'cleanup',
  }));
  assert.equal(implicitCleanup.code, 'cleanup_requires_archive');

  const replayPending = evaluateObjectLifecycleTransition(lifecycleRequest(artifact, {
    current_state: 'active',
    next_state: 'active',
    operation: 'replay',
    replay_evidence: 'pending',
  }));
  assert.equal(replayPending.code, 'replay_evidence_required');
});

test('ObjectLifecyclePolicy supports explicit task reopen without flattening task semantics', () => {
  const task = catalog.task;
  const reopen = evaluateObjectLifecycleTransition(lifecycleRequest(task, {
    current_state: 'confirmed',
    next_state: 'opened',
    operation: 'reopen',
  }));
  assert.equal(reopen.allowed, true);
  assert.equal(reopen.code, 'reopened');

  const implicit = evaluateObjectLifecycleTransition(lifecycleRequest(task, {
    current_state: 'confirmed',
    next_state: 'opened',
    operation: 'transition',
  }));
  assert.equal(implicit.code, 'terminal_state');
});

test('ObjectLifecyclePolicy permits verified reconciliation and archived cleanup', () => {
  const projection = catalog.projection;
  const reconciled = evaluateObjectLifecycleTransition(lifecycleRequest(projection, {
    current_state: 'stale',
    next_state: 'active',
    stale: true,
    operation: 'reconcile',
    replay_evidence: 'verified',
  }));
  assert.equal(reconciled.allowed, true);
  assert.equal(reconciled.code, 'reconciled');

  const cleanup = evaluateObjectLifecycleTransition(lifecycleRequest(projection, {
    current_state: 'archived',
    next_state: 'archived',
    operation: 'cleanup',
  }));
  assert.equal(cleanup.allowed, true);
  assert.equal(cleanup.code, 'cleanup_allowed');
});
