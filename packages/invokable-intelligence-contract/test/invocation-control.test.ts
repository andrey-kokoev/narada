import assert from "node:assert/strict";
import test from "node:test";

import {
  INTELLIGENCE_INVOCATION_CONTROL_SCHEMA,
  IntelligenceInvocationControlError,
  normalizeIntelligenceInvocationControl,
} from "../src/invocation-control.js";

test("invocation control defaults one immediate attempt without inventing identities", () => {
  assert.deepEqual(normalizeIntelligenceInvocationControl({}), {
    schema: INTELLIGENCE_INVOCATION_CONTROL_SCHEMA,
    mode: "immediate",
    allow_replan: true,
  });
});

test("retry, resume, and replay preserve explicit intent lineage and delivery idempotency", () => {
  for (const mode of ["retry", "resume", "replay"] as const) {
    assert.deepEqual(normalizeIntelligenceInvocationControl({
      intent_id: "intent:operator-chat-1",
      operation_id: `operation:operator-chat-1:${mode}`,
      mode,
      allow_replan: false,
    }), {
      schema: INTELLIGENCE_INVOCATION_CONTROL_SCHEMA,
      intent_id: "intent:operator-chat-1",
      operation_id: `operation:operator-chat-1:${mode}`,
      mode,
      allow_replan: false,
    });
  }
});

test("lineage modes fail closed without both identities", () => {
  for (const value of [
    { mode: "retry" },
    { mode: "resume", intent_id: "intent:one" },
    { mode: "replay", operation_id: "operation:one" },
  ]) {
    assert.throws(
      () => normalizeIntelligenceInvocationControl(value),
      (error) => error instanceof IntelligenceInvocationControlError
        && error.code === "invalid-intelligence-invocation-control",
    );
  }
});

test("unknown fields, malformed identities, modes, and booleans are rejected", () => {
  for (const value of [
    { retry: true },
    { mode: "again" },
    { intent_id: "not-an-intent" },
    { operation_id: "operation:contains spaces" },
    { allow_replan: "yes" },
    { schema: "narada.invokable-intelligence.invocation-control.v2" },
  ]) {
    assert.throws(() => normalizeIntelligenceInvocationControl(value), IntelligenceInvocationControlError);
  }
});
