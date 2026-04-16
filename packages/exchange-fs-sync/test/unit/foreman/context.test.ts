import { describe, it, expect } from "vitest";
import { MailboxContextStrategy, TimerContextStrategy } from "../../../src/foreman/context.js";
import type { Fact } from "../../../src/facts/types.js";

function makeMailFact(
  conversationId: string,
  eventKind: string,
  recordId = `rec-${conversationId}`,
): Omit<Fact, "created_at"> {
  const payload = {
    record_id: recordId,
    ordinal: new Date().toISOString(),
    event: {
      event_id: recordId,
      event_kind: eventKind,
      conversation_id: conversationId,
      thread_id: conversationId,
    },
  };
  return {
    fact_id: `fact_mail_${conversationId}_${eventKind}_${recordId}`,
    fact_type: eventKind === "deleted" ? "mail.message.removed" : "mail.message.discovered",
    provenance: {
      source_id: "exchange:test",
      source_record_id: recordId,
      source_version: null,
      source_cursor: "cursor-1",
      observed_at: new Date().toISOString(),
    },
    payload_json: JSON.stringify(payload),
  };
}

function makeTimerFact(scheduleId: string, tickAt = new Date().toISOString()): Omit<Fact, "created_at"> {
  const payload = {
    record_id: `tick_${scheduleId}`,
    ordinal: tickAt,
    event: {
      kind: "timer.tick",
      schedule_id: scheduleId,
      tick_at: tickAt,
    },
  };
  return {
    fact_id: `fact_timer_${scheduleId}_${tickAt}`,
    fact_type: "timer.tick" as const,
    provenance: {
      source_id: `timer:${scheduleId}`,
      source_record_id: `tick_${scheduleId}`,
      source_version: null,
      source_cursor: "cursor-timer",
      observed_at: tickAt,
    },
    payload_json: JSON.stringify(payload),
  };
}

describe("MailboxContextStrategy", () => {
  const strategy = new MailboxContextStrategy();

  it("groups facts by conversation_id and maps event kinds", () => {
    const facts = [
      { ...makeMailFact("conv-a", "created"), created_at: new Date().toISOString() },
      { ...makeMailFact("conv-a", "deleted", "rec-2"), created_at: new Date().toISOString() },
      { ...makeMailFact("conv-b", "created"), created_at: new Date().toISOString() },
    ] as Fact[];

    const contexts = strategy.formContexts(facts, "scope-1");
    expect(contexts).toHaveLength(2);

    const ctxA = contexts.find((c) => c.context_id === "conv-a")!;
    expect(ctxA.change_kinds.sort()).toEqual(["moved", "new_message"]);
    expect(ctxA.facts).toHaveLength(2);

    const ctxB = contexts.find((c) => c.context_id === "conv-b")!;
    expect(ctxB.change_kinds).toEqual(["new_message"]);
    expect(ctxB.facts).toHaveLength(1);
  });

  it("uses getLatestRevisionOrdinal to compute ordinals", () => {
    const fact = { ...makeMailFact("conv-ord", "created"), created_at: new Date().toISOString() } as Fact;
    const contexts = strategy.formContexts([fact], "scope-1", {
      getLatestRevisionOrdinal: (id) => (id === "conv-ord" ? 3 : null),
    });

    expect(contexts[0]!.previous_revision_ordinal).toBe(3);
    expect(contexts[0]!.current_revision_ordinal).toBe(4);
    expect(contexts[0]!.revision_id).toBe("conv-ord:rev:4");
  });

  it("ignores timer facts", () => {
    const facts = [
      { ...makeTimerFact("heartbeat"), created_at: new Date().toISOString() },
    ] as Fact[];

    const contexts = strategy.formContexts(facts, "scope-1");
    expect(contexts).toHaveLength(0);
  });
});

describe("TimerContextStrategy", () => {
  const strategy = new TimerContextStrategy();

  it("groups timer facts by schedule_id", () => {
    const facts = [
      { ...makeTimerFact("job-a", "2024-01-01T00:00:00Z"), created_at: new Date().toISOString() },
      { ...makeTimerFact("job-a", "2024-01-01T01:00:00Z"), created_at: new Date().toISOString() },
      { ...makeTimerFact("job-b", "2024-01-01T00:00:00Z"), created_at: new Date().toISOString() },
    ] as Fact[];

    const contexts = strategy.formContexts(facts, "scope-1");
    expect(contexts).toHaveLength(2);

    const ctxA = contexts.find((c) => c.context_id === "timer:job-a")!;
    expect(ctxA.change_kinds).toEqual(["new_message"]);
    expect(ctxA.facts).toHaveLength(2);

    const ctxB = contexts.find((c) => c.context_id === "timer:job-b")!;
    expect(ctxB.facts).toHaveLength(1);
  });

  it("uses getLatestRevisionOrdinal to compute ordinals", () => {
    const fact = { ...makeTimerFact("tick-ord"), created_at: new Date().toISOString() } as Fact;
    const contexts = strategy.formContexts([fact], "scope-1", {
      getLatestRevisionOrdinal: (id) => (id === "timer:tick-ord" ? 7 : null),
    });

    expect(contexts[0]!.previous_revision_ordinal).toBe(7);
    expect(contexts[0]!.current_revision_ordinal).toBe(8);
    expect(contexts[0]!.revision_id).toBe("timer:tick-ord:rev:8");
  });

  it("ignores non-timer facts", () => {
    const facts = [
      { ...makeMailFact("conv-x", "created"), created_at: new Date().toISOString() },
    ] as Fact[];

    const contexts = strategy.formContexts(facts, "scope-1");
    expect(contexts).toHaveLength(0);
  });
});
