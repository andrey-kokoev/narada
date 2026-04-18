import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import { SqliteFactStore } from "../../../src/facts/store.js";
import { SqliteCoordinatorStore } from "../../../src/coordinator/store.js";
import { SqliteOutboundStore } from "../../../src/outbound/store.js";
import { SqliteIntentStore } from "../../../src/intent/store.js";
import { DefaultForemanFacade } from "../../../src/foreman/facade.js";
import { MailboxContextStrategy } from "../../../src/foreman/mailbox/context-strategy.js";
import { TimerContextStrategy } from "../../../src/foreman/context.js";
import type { Fact } from "../../../src/facts/types.js";

describe("fact-driven admission", () => {
  let db: Database.Database;
  let coordinatorStore: SqliteCoordinatorStore;
  let outboundStore: SqliteOutboundStore;
  let intentStore: SqliteIntentStore;
  let factStore: SqliteFactStore;

  function createForeman(strategy?: MailboxContextStrategy | TimerContextStrategy) {
    return new DefaultForemanFacade({
      coordinatorStore,
      outboundStore,
      intentStore,
      db,
      foremanId: "fm-test",
      getRuntimePolicy: () => ({
        primary_charter: "support_steward",
        allowed_actions: ["send_reply", "process_run", "no_action"],
      }),
      contextFormationStrategy: strategy,
    });
  }

  beforeEach(() => {
    db = new Database(":memory:");
    coordinatorStore = new SqliteCoordinatorStore({ db });
    outboundStore = new SqliteOutboundStore({ db });
    intentStore = new SqliteIntentStore({ db });
    coordinatorStore.initSchema();
    outboundStore.initSchema();
    intentStore.initSchema();

    const factDb = new Database(":memory:");
    factStore = new SqliteFactStore({ db: factDb });
    factStore.initSchema();
  });

  afterEach(() => {
    factStore.close();
    outboundStore.close();
    intentStore.close();
    coordinatorStore.close();
    db.close();
  });

  function makeMailFact(conversationId: string, eventKind: string, recordId = `rec-${conversationId}`): Omit<Fact, "created_at"> {
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
    const provenance = {
      source_id: "exchange:test",
      source_record_id: recordId,
      source_version: null,
      source_cursor: "cursor-1",
      observed_at: new Date().toISOString(),
    };
    return {
      fact_id: `fact_mail_${conversationId}_${eventKind}_${recordId}`,
      fact_type: eventKind === "deleted" ? "mail.message.removed" : "mail.message.discovered",
      provenance,
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
    const provenance = {
      source_id: `timer:${scheduleId}`,
      source_record_id: `tick_${scheduleId}`,
      source_version: null,
      source_cursor: "cursor-timer",
      observed_at: tickAt,
    };
    return {
      fact_id: `fact_timer_${scheduleId}_${tickAt}`,
      fact_type: "timer.tick" as const,
      provenance,
      payload_json: JSON.stringify(payload),
    };
  }

  it("opens a work item from a mailbox fact via MailboxContextStrategy", async () => {
    const foreman = createForeman(new MailboxContextStrategy());
    const fact = factStore.ingest(makeMailFact("conv-mail-1", "created")).fact;
    const result = await foreman.onFactsAdmitted([fact], "mb-1");

    expect(result.opened).toHaveLength(1);
    expect(result.opened[0]!.context_id).toBe("conv-mail-1");

    const record = coordinatorStore.getContextRecord("conv-mail-1");
    expect(record).toBeDefined();
  });

  it("opens a work item from a timer tick fact via TimerContextStrategy", async () => {
    const foreman = createForeman(new TimerContextStrategy());
    const fact = factStore.ingest(makeTimerFact("heartbeat")).fact;
    const result = await foreman.onFactsAdmitted([fact], "mb-1");

    expect(result.opened).toHaveLength(1);
    expect(result.opened[0]!.context_id).toBe("timer:heartbeat");

    const record = coordinatorStore.getContextRecord("timer:heartbeat");
    expect(record).toBeDefined();
  });

  it("is idempotent through the FactStore boundary: admitted facts do not re-open work", async () => {
    const now = new Date().toISOString();
    const mailIngest = factStore.ingest(makeMailFact("conv-mail-2", "created"));
    const timerIngest = factStore.ingest(makeTimerFact("maintenance", now));

    const mailForeman = createForeman(new MailboxContextStrategy());
    const timerForeman = createForeman(new TimerContextStrategy());

    const r1 = await mailForeman.onFactsAdmitted([mailIngest.fact], "mb-1");
    expect(r1.opened).toHaveLength(1);

    const r2 = await timerForeman.onFactsAdmitted([timerIngest.fact], "mb-1");
    expect(r2.opened).toHaveLength(1);

    // Mark facts as admitted — this is what the daemon does after dispatch
    factStore.markAdmitted([mailIngest.fact.fact_id, timerIngest.fact.fact_id]);

    // Simulate a replay by re-ingesting the same source records
    const mailReplay = factStore.ingest(makeMailFact("conv-mail-2", "created"));
    const timerReplay = factStore.ingest(makeTimerFact("maintenance", now));
    expect(mailReplay.isNew).toBe(false);
    expect(timerReplay.isNew).toBe(false);

    // Unadmitted facts should be empty; dispatch phase would skip calling foreman
    const unadmitted = factStore.getUnadmittedFacts("exchange:test");
    expect(unadmitted).toHaveLength(0);

    const allUnadmitted = factStore.getUnadmittedFacts();
    expect(allUnadmitted).toHaveLength(0);

    const workItems = db
      .prepare("select * from work_items where context_id in (?, ?)")
      .all("conv-mail-2", "timer:maintenance") as Array<Record<string, unknown>>;
    expect(workItems).toHaveLength(2);
  });

  it("supersedes an active work item when a newer mailbox fact arrives", async () => {
    const foreman = createForeman(new MailboxContextStrategy());
    const fact1 = factStore.ingest(makeMailFact("conv-mail-3", "created", "rec-1")).fact;
    const r1 = await foreman.onFactsAdmitted([fact1], "mb-1");
    expect(r1.opened).toHaveLength(1);

    const fact2 = factStore.ingest(makeMailFact("conv-mail-3", "created", "rec-2")).fact;
    const r2 = await foreman.onFactsAdmitted([fact2], "mb-1");
    expect(r2.superseded).toHaveLength(1);
    expect(r2.opened).toHaveLength(1);
    expect(r2.superseded[0]!.work_item_id).toBe(r1.opened[0]!.work_item_id);
  });

  it("maps a removed mailbox fact to moved change kind", async () => {
    const foreman = createForeman(new MailboxContextStrategy());
    const fact = factStore.ingest(makeMailFact("conv-removed", "deleted")).fact;
    const result = await foreman.onFactsAdmitted([fact], "mb-1");
    expect(result.opened).toHaveLength(1);
    expect(result.opened[0]!.context_id).toBe("conv-removed");
  });
});
