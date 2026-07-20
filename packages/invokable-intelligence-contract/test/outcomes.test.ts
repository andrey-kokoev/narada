import assert from "node:assert/strict";
import test from "node:test";

import {
  INVOCATION_EXECUTION_ATTEMPT_SCHEMA,
  INVOCATION_EXECUTION_TRANSITION_SCHEMA,
  INVOCATION_RESULT_ENVELOPE_SCHEMA,
  INVOCATION_TERMINAL_OUTCOME_SCHEMA,
  validateInvocationAttemptTransition,
  validateInvocationExecutionHistory,
  validateRetainedPayloadRef,
} from "../src/outcomes.js";
import type {
  InvocationExecutionAttempt,
  InvocationExecutionTransition,
  InvocationExecutionHistory,
  InvocationResultEnvelope,
  InvocationTerminalOutcome,
  RetainedPayloadRef,
} from "../src/outcomes.js";

const digest = `sha256:${"a".repeat(64)}`;
const noRetentionPayload: RetainedPayloadRef = {
  digest,
  media_type: "application/json",
  classification: "restricted",
  retention: { mode: "never-retain", policy_ref: "retention:no-payload", residency: "US" },
  access: { allowed_principals: [], capability_refs: [] },
  disposition: "never-retained",
  tombstone: { disposed_at: "2026-07-19T00:00:01Z", reason_code: "policy-never-retain", evidence_ref: "evidence:disposition" },
};
const attempt = (id: string, lineage: InvocationExecutionAttempt["lineage"]): InvocationExecutionAttempt => ({
  schema: INVOCATION_EXECUTION_ATTEMPT_SCHEMA,
  id,
  intent_id: "intent:one",
  plan_id: "plan:one",
  state: "created",
  created_at: "2026-07-19T00:00:00Z",
  lineage,
});
const result: InvocationResultEnvelope = {
  schema: INVOCATION_RESULT_ENVELOPE_SCHEMA,
  id: "result:one",
  attempt_id: "attempt:one",
  plan_id: "plan:one",
  produced_at: "2026-07-19T00:00:01Z",
  kind: "provider-response",
  payload: noRetentionPayload,
};
const success: InvocationTerminalOutcome = {
  schema: INVOCATION_TERMINAL_OUTCOME_SCHEMA,
  id: "outcome:one",
  attempt_id: "attempt:one",
  intent_id: "intent:one",
  plan_id: "plan:one",
  kind: "success",
  terminal_at: "2026-07-19T00:00:02Z",
  result_id: result.id,
  admission_acknowledged: true,
};
const transition = (
  id: string,
  sequence: number,
  previous_state: InvocationExecutionTransition["previous_state"],
  state: InvocationExecutionTransition["state"],
): InvocationExecutionTransition => ({
  schema: INVOCATION_EXECUTION_TRANSITION_SCHEMA,
  id,
  attempt_id: "attempt:one",
  sequence,
  previous_state,
  state,
  transitioned_at: `2026-07-19T00:00:0${sequence}Z`,
});

test("result payload, terminal outcome, evidence, and telemetry remain distinct schemas", () => {
  assert.notEqual(INVOCATION_RESULT_ENVELOPE_SCHEMA, INVOCATION_TERMINAL_OUTCOME_SCHEMA);
  assert.deepEqual(validateRetainedPayloadRef(noRetentionPayload), []);
  assert.equal(noRetentionPayload.storage_ref, undefined);
  assert.equal(noRetentionPayload.tombstone?.reason_code, "policy-never-retain");
});

test("success requires a distinct result and cannot occur directly from acknowledgment pending", () => {
  assert.deepEqual(validateInvocationAttemptTransition("provider-pending", "terminal", success), []);
  const noResult = { ...success, result_id: undefined };
  assert.ok(validateInvocationAttemptTransition("provider-pending", "terminal", noResult).some(({ code }) => code === "invalid-terminal-outcome"));
  assert.ok(validateInvocationAttemptTransition("admission-pending", "terminal", success).some(({ code }) => code === "invalid-terminal-outcome"));
});

test("acknowledgment timeout becomes explicit unknown admission, not failure or success", () => {
  const unknown: InvocationTerminalOutcome = {
    ...success,
    id: "outcome:unknown",
    kind: "admission-unknown",
    result_id: undefined,
    admission_acknowledged: false,
    error: { code: "nars_ack_timeout", retryable: false },
  };
  assert.deepEqual(validateInvocationAttemptTransition("admission-pending", "terminal", unknown), []);
});

test("typed pre-invocation refusal, cancellation, provider failure, and timeout have unambiguous source states", () => {
  const cases: Array<[Parameters<typeof validateInvocationAttemptTransition>[0], InvocationTerminalOutcome["kind"], Partial<InvocationTerminalOutcome>]> = [
    ["admission-pending", "pre-invocation-refusal", { refusal_id: "refusal:policy" }],
    ["admitted", "cancelled", {}],
    ["dispatching", "provider-failure", { error: { code: "provider-error", retryable: true } }],
    ["provider-pending", "timeout", { error: { code: "provider-timeout", retryable: true } }],
  ];
  for (const [state, kind, extra] of cases) {
    const outcome: InvocationTerminalOutcome = { ...success, id: `outcome:${kind}`, kind, result_id: undefined, ...extra };
    assert.deepEqual(validateInvocationAttemptTransition(state, "terminal", outcome), []);
  }
});

test("retry and replay append attempts/results and cannot overwrite prior identities", () => {
  const history: InvocationExecutionHistory = {
    attempts: [
      attempt("attempt:one", { relation: "initial" }),
      attempt("attempt:two", { relation: "retry-of", predecessor_attempt_id: "attempt:one" }),
      attempt("attempt:three", { relation: "replay-of", predecessor_attempt_id: "attempt:one" }),
    ],
    transitions: [
      transition("transition:dispatching", 1, "created", "dispatching"),
      transition("transition:provider-pending", 2, "dispatching", "provider-pending"),
      transition("transition:terminal", 3, "provider-pending", "terminal"),
    ],
    results: [result],
    outcomes: [success],
  };
  assert.deepEqual(validateInvocationExecutionHistory(history), []);
  const overwritten = structuredClone(history);
  overwritten.attempts.push(structuredClone(overwritten.attempts[0]));
  overwritten.results.push(structuredClone(overwritten.results[0]));
  assert.ok(validateInvocationExecutionHistory(overwritten).some(({ code }) => code === "duplicate-attempt"));
  assert.ok(validateInvocationExecutionHistory(overwritten).some(({ code }) => code === "duplicate-result"));
});

test("payload deletion preserves digest and audit tombstone while removing storage", () => {
  const deleted: RetainedPayloadRef = {
    ...noRetentionPayload,
    retention: { mode: "delete-after", policy_ref: "retention:24h", expires_at: "2026-07-20T00:00:00Z", residency: "EU" },
    disposition: "deleted",
    tombstone: { disposed_at: "2026-07-20T00:00:01Z", reason_code: "retention-expired", evidence_ref: "evidence:delete" },
  };
  assert.deepEqual(validateRetainedPayloadRef(deleted), []);
  assert.equal(deleted.digest, digest);
  assert.equal(deleted.storage_ref, undefined);
});
