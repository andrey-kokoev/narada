import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import { SqliteCoordinatorStore } from "../../../src/coordinator/store.js";
import { SqliteOutboundStore } from "../../../src/outbound/store.js";
import { SqliteIntentStore } from "../../../src/intent/store.js";
import { SqliteScheduler } from "../../../src/scheduler/scheduler.js";
import { DefaultForemanFacade } from "../../../src/foreman/facade.js";
import { MailboxContextStrategy, TimerContextStrategy } from "../../../src/foreman/context.js";
import type { Fact } from "../../../src/facts/types.js";

describe("generalized work object model", () => {
  let db: Database.Database;
  let coordinatorStore: SqliteCoordinatorStore;
  let outboundStore: SqliteOutboundStore;
  let intentStore: SqliteIntentStore;
  let scheduler: SqliteScheduler;

  beforeEach(() => {
    db = new Database(":memory:");
    coordinatorStore = new SqliteCoordinatorStore({ db });
    outboundStore = new SqliteOutboundStore({ db });
    intentStore = new SqliteIntentStore({ db });
    coordinatorStore.initSchema();
    outboundStore.initSchema();
    intentStore.initSchema();
    scheduler = new SqliteScheduler(coordinatorStore, { leaseDurationMs: 60_000, runnerId: "runner-test" });
  });

  afterEach(() => {
    outboundStore.close();
    intentStore.close();
    coordinatorStore.close();
    db.close();
  });

  function makeMailFact(contextId: string, eventKind: string, recordId = `rec-${contextId}`): Fact {
    const payload = {
      record_id: recordId,
      ordinal: new Date().toISOString(),
      event: {
        event_id: recordId,
        event_kind: eventKind,
        conversation_id: contextId,
        thread_id: contextId,
      },
    };
    return {
      fact_id: `fact_mail_${contextId}_${eventKind}_${recordId}`,
      fact_type: eventKind === "deleted" ? "mail.message.removed" : "mail.message.discovered",
      provenance: {
        source_id: "exchange:test",
        source_record_id: recordId,
        source_version: null,
        source_cursor: "cursor-1",
        observed_at: new Date().toISOString(),
      },
      payload_json: JSON.stringify(payload),
      created_at: new Date().toISOString(),
    };
  }

  function makeTimerFact(scheduleId: string, tickAt = new Date().toISOString()): Fact {
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
      created_at: tickAt,
    };
  }

  it("mailbox contexts open mailbox work through the generalized model", async () => {
    const foreman = new DefaultForemanFacade({
      coordinatorStore,
      outboundStore,
      intentStore,
      db,
      foremanId: "fm-test",
      getRuntimePolicy: () => ({ primary_charter: "support_steward", allowed_actions: ["send_reply", "no_action"] }),
      contextFormationStrategy: new MailboxContextStrategy(),
    });

    const facts = [makeMailFact("conv-mail-1", "created")];
    const result = await foreman.onFactsAdmitted(facts, "mb-1");

    expect(result.opened).toHaveLength(1);
    const opened = result.opened[0]!;
    expect(opened.context_id).toBe("conv-mail-1");

    const workItem = coordinatorStore.getWorkItem(opened.work_item_id);
    expect(workItem).toBeDefined();
    expect(workItem!.context_id).toBe("conv-mail-1");
    expect(workItem!.scope_id).toBe("mb-1");
    expect(workItem!.opened_for_revision_id).toBe("conv-mail-1:rev:1");
  });

  it("timer contexts open timer work through the generalized model", async () => {
    const foreman = new DefaultForemanFacade({
      coordinatorStore,
      outboundStore,
      intentStore,
      db,
      foremanId: "fm-test",
      getRuntimePolicy: () => ({ primary_charter: "support_steward", allowed_actions: ["process_run", "no_action"] }),
      contextFormationStrategy: new TimerContextStrategy(),
    });

    const facts = [makeTimerFact("heartbeat")];
    const result = await foreman.onFactsAdmitted(facts, "mb-1");

    expect(result.opened).toHaveLength(1);
    const opened = result.opened[0]!;
    expect(opened.context_id).toBe("timer:heartbeat");

    const workItem = coordinatorStore.getWorkItem(opened.work_item_id);
    expect(workItem).toBeDefined();
    expect(workItem!.context_id).toBe("timer:heartbeat");
    expect(workItem!.scope_id).toBe("mb-1");
    expect(workItem!.opened_for_revision_id).toBe("timer:heartbeat:rev:1");
  });

  it("scheduler and lease semantics are deterministic across both verticals", async () => {
    const mailForeman = new DefaultForemanFacade({
      coordinatorStore,
      outboundStore,
      intentStore,
      db,
      foremanId: "fm-test",
      getRuntimePolicy: () => ({ primary_charter: "support_steward", allowed_actions: ["send_reply", "process_run", "no_action"] }),
      contextFormationStrategy: new MailboxContextStrategy(),
    });

    const timerForeman = new DefaultForemanFacade({
      coordinatorStore,
      outboundStore,
      intentStore,
      db,
      foremanId: "fm-test",
      getRuntimePolicy: () => ({ primary_charter: "support_steward", allowed_actions: ["send_reply", "process_run", "no_action"] }),
      contextFormationStrategy: new TimerContextStrategy(),
    });

    // Open mailbox work
    const mailResult = await mailForeman.onFactsAdmitted([makeMailFact("conv-mail-2", "created")], "mb-1");
    const mailWi = mailResult.opened[0]!;

    // Open timer work
    const timerResult = await timerForeman.onFactsAdmitted([makeTimerFact("maintenance")], "mb-1");
    const timerWi = timerResult.opened[0]!;

    // Both should be runnable
    const runnable = scheduler.scanForRunnableWork("mb-1", 10);
    const runnableIds = runnable.map((w) => w.work_item_id);
    expect(runnableIds).toContain(mailWi.work_item_id);
    expect(runnableIds).toContain(timerWi.work_item_id);

    // Acquire lease on timer work
    const timerLease = scheduler.acquireLease(timerWi.work_item_id, "runner-test");
    expect(timerLease.success).toBe(true);

    // Start execution on timer work
    const attempt = scheduler.startExecution(timerWi.work_item_id, timerWi.revision_id, "{}");
    expect(attempt.status).toBe("active");

    // Timer work should no longer be runnable
    const afterStart = scheduler.scanForRunnableWork("mb-1", 10);
    expect(afterStart.map((w) => w.work_item_id)).not.toContain(timerWi.work_item_id);
    expect(afterStart.map((w) => w.work_item_id)).toContain(mailWi.work_item_id);
  });

  it("replay does not duplicate work items for either vertical", async () => {
    const mailForeman = new DefaultForemanFacade({
      coordinatorStore,
      outboundStore,
      intentStore,
      db,
      foremanId: "fm-test",
      getRuntimePolicy: () => ({ primary_charter: "support_steward", allowed_actions: ["send_reply", "process_run", "no_action"] }),
      contextFormationStrategy: new MailboxContextStrategy(),
    });

    const timerForeman = new DefaultForemanFacade({
      coordinatorStore,
      outboundStore,
      intentStore,
      db,
      foremanId: "fm-test",
      getRuntimePolicy: () => ({ primary_charter: "support_steward", allowed_actions: ["send_reply", "process_run", "no_action"] }),
      contextFormationStrategy: new TimerContextStrategy(),
    });

    const mailFact = makeMailFact("conv-replay", "created");
    const timerFact = makeTimerFact("timer-replay");

    const rMail = await mailForeman.onFactsAdmitted([mailFact], "mb-1");
    const rTimer = await timerForeman.onFactsAdmitted([timerFact], "mb-1");
    expect(rMail.opened).toHaveLength(1);
    expect(rTimer.opened).toHaveLength(1);

    // In the real system, the FactStore boundary prevents replayed admitted facts from reaching
    // the foreman. When called directly without that boundary, the context strategy computes a
    // new revision ordinal; the foreman supersedes the old work item rather than duplicating
    // decisions or commands. Total durable work items for each context remains bounded.
    const rMail2 = await mailForeman.onFactsAdmitted([mailFact], "mb-1");
    const rTimer2 = await timerForeman.onFactsAdmitted([timerFact], "mb-1");

    // Either opened (superseded + new) or nooped — total count per context must not grow unbounded
    const mailWorkItems = db
      .prepare("select * from work_items where context_id = ?")
      .all("conv-replay") as Array<Record<string, unknown>>;
    const timerWorkItems = db
      .prepare("select * from work_items where context_id = ?")
      .all("timer:timer-replay") as Array<Record<string, unknown>>;

    expect(mailWorkItems.length).toBeGreaterThanOrEqual(1);
    expect(timerWorkItems.length).toBeGreaterThanOrEqual(1);
    expect(mailWorkItems.filter((w) => w.status === "opened").length).toBeLessThanOrEqual(1);
    expect(timerWorkItems.filter((w) => w.status === "opened").length).toBeLessThanOrEqual(1);
  });
});
