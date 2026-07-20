import assert from "node:assert/strict";
import test from "node:test";

import {
  PLAN_DECISION_SNAPSHOT_SCHEMA,
  evaluatePlanUse,
  isWithinTemporalWindow,
  validatePlanDecisionSnapshot,
} from "../src/temporal.js";
import type { AuthoritativeDecisionClock, PlanDecisionSnapshot, PlanSnapshotDigests } from "../src/temporal.js";

const digest = (character: string) => `sha256:${character.repeat(64)}`;
const digests: PlanSnapshotDigests = {
  normalized_resolver_input: digest("1"),
  catalog: digest("2"),
  policy: digest("3"),
  assertions: digest("4"),
  topology: digest("5"),
  access: digest("6"),
  materialization: digest("7"),
};
const clock = (instant: string, time: string, weekday: AuthoritativeDecisionClock["local"]["weekday"]): AuthoritativeDecisionClock => ({
  source: "test-clock",
  authority_ref: "clock:test",
  instant,
  timezone: "America/Chicago",
  local: { date: instant.slice(0, 10), time, weekday },
});
const snapshot: PlanDecisionSnapshot = {
  schema: PLAN_DECISION_SNAPSHOT_SCHEMA,
  plan_id: "plan:one",
  intent_id: "intent:one",
  resolved_at: "2026-07-19T05:00:00Z",
  clock: clock("2026-07-19T05:00:00Z", "00:00:00", 0),
  resolver_version: "resolver:v1",
  digests,
  snapshot_digest: digest("a"),
  valid_until: "2026-07-20T05:00:00Z",
  revalidation_triggers: ["before-queued-attempt", "at-scheduled-window", "before-retry", "before-resume", "before-replay", "policy-change"],
  referenced_revisions: [{ kind: "policy", record_id: "policy:target", revision: "7", digest: digest("3"), immutable_ref: "content:policy:3" }],
  lineage: { relation: "initial" },
};

test("plan snapshots carry explicit clock, immutable digests, validity, and revalidation", () => {
  assert.deepEqual(validatePlanDecisionSnapshot(snapshot), []);
});

test("immediate plans reuse while queued, retry, and resume attempts revalidate deterministically", () => {
  for (const [mode, trigger] of [
    ["immediate", undefined],
    ["queued-batch", "before-queued-attempt"],
    ["retry", "before-retry"],
    ["resume", "before-resume"],
    ["replay", "before-replay"],
  ] as const) {
    const instant = "2026-07-19T06:00:00Z";
    const result = evaluatePlanUse(snapshot, {
      evaluated_at: instant,
      clock: clock(instant, "01:00:00", 0),
      mode,
      current_digests: digests,
      observed_triggers: trigger ? [trigger] : [],
      replan_available: true,
      ...(["retry", "resume", "replay"].includes(mode) ? { predecessor_attempt_id: "attempt:prior" } : {}),
    });
    assert.equal(result.decision, mode === "immediate" ? "reuse" : "revalidated");
    assert.equal(result.reasons.length, 0);
  }
});

test("expired or policy-changed plans refuse provider invocation until re-planned", () => {
  const changed = { ...digests, policy: digest("9") };
  const expiredAt = "2026-07-20T05:00:00Z";
  const result = evaluatePlanUse(snapshot, {
    evaluated_at: expiredAt,
    clock: clock(expiredAt, "00:00:00", 1),
    mode: "retry",
    current_digests: changed,
    observed_triggers: ["before-retry", "policy-change"],
    replan_available: false,
    predecessor_attempt_id: "attempt:prior",
  });
  assert.equal(result.decision, "refuse-stale-plan");
  assert.equal(result.requires_provider_refusal, true);
  assert.deepEqual(result.reasons, ["plan-expired", "policy-changed"]);
});

test("off-peak windows use the supplied timezone and normalized clock, including overnight windows", () => {
  const window = { timezone: "America/Chicago", weekdays: [0] as const, start_local: "22:00", end_local: "06:00" };
  assert.equal(isWithinTemporalWindow({ ...window, weekdays: [...window.weekdays] }, clock("2026-07-19T10:00:00Z", "05:00", 0)), true);
  assert.equal(isWithinTemporalWindow({ ...window, weekdays: [...window.weekdays] }, clock("2026-07-19T18:00:00Z", "13:00", 0)), false);
});

test("replacement plans preserve intent lineage without mutating historical snapshots", () => {
  const replacement: PlanDecisionSnapshot = {
    ...structuredClone(snapshot),
    plan_id: "plan:two",
    resolved_at: "2026-07-19T07:00:00Z",
    clock: clock("2026-07-19T07:00:00Z", "02:00:00", 0),
    snapshot_digest: digest("b"),
    lineage: { relation: "replan-of", predecessor_plan_id: snapshot.plan_id },
  };
  assert.deepEqual(validatePlanDecisionSnapshot(replacement), []);
  assert.equal(snapshot.lineage.relation, "initial");
  assert.equal(replacement.intent_id, snapshot.intent_id);
});
