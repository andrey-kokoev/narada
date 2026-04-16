import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import { SqliteFactStore } from "../../../src/facts/store.js";
import { SqliteIntentStore } from "../../../src/intent/store.js";
import { SqliteProcessExecutionStore } from "../../../src/executors/store.js";
import { TimerSource } from "../../../src/sources/timer-source.js";
import { ExchangeSource } from "../../../src/adapter/graph/exchange-source.js";
import { sourceRecordToFact } from "../../../src/facts/record-to-fact.js";
import type { Source } from "../../../src/types/source.js";
import {
  createHarness,
  insertConversation,
  insertWorkItem,
  insertExecutionAttempt,
  makeEvaluation,
  makeInvocationEnvelope,
  type Harness,
} from "./harness.js";

describe("vertical parity — mailbox and timer/process share the same kernel", () => {
  let h: Harness;
  let factStore: SqliteFactStore;
  let executionStore: SqliteProcessExecutionStore;

  beforeEach(() => {
    h = createHarness();
    factStore = new SqliteFactStore({ db: h.db });
    executionStore = new SqliteProcessExecutionStore({ db: h.db });
    factStore.initSchema();
    executionStore.initSchema();
  });

  afterEach(() => {
    executionStore.close();
    factStore.close();
    h.outboundStore.close();
    h.intentStore.close();
    h.coordinatorStore.close();
    h.db.close();
  });

  it("both ExchangeSource and TimerSource implement the same Source interface", () => {
    const exchangeSource: Source = new ExchangeSource({
      sourceId: "exchange:test",
      adapter: {
        async fetch_since() {
          return {
            events: [],
            prior_cursor: null,
            next_cursor: null,
            has_more: false,
            fetched_at: new Date().toISOString(),
          };
        },
      },
    });

    const timerSource: Source = new TimerSource({
      sourceId: "timer:test",
      scheduleId: "heartbeat",
      intervalMs: 60_000,
    });

    // Both satisfy the Source contract
    expect(typeof exchangeSource.sourceId).toBe("string");
    expect(typeof exchangeSource.pull).toBe("function");
    expect(typeof timerSource.sourceId).toBe("string");
    expect(typeof timerSource.pull).toBe("function");
  });

  it("both mailbox and timer facts ingest into the same FactStore", async () => {
    const exchangeSource = new ExchangeSource({
      sourceId: "exchange:mb-1",
      adapter: {
        async fetch_since() {
          return {
            events: [],
            prior_cursor: null,
            next_cursor: "cursor-1",
            has_more: false,
            fetched_at: new Date().toISOString(),
          };
        },
      },
    });

    const timerSource = new TimerSource({
      sourceId: "timer:heartbeat",
      scheduleId: "tick",
      intervalMs: 60_000,
      getNow: () => new Date("2024-01-15T12:00:00.000Z").getTime(),
    });

    const exchangeBatch = await exchangeSource.pull(null);
    const timerBatch = await timerSource.pull(null);

    // Mailbox-style fact (simulated checkpoint fact)
    const mailboxFact = sourceRecordToFact(
      {
        recordId: "rec-1",
        payload: { checkpoint: exchangeBatch.nextCheckpoint },
        provenance: {
          sourceId: exchangeSource.sourceId,
          observedAt: new Date().toISOString(),
        },
      },
      exchangeBatch.nextCheckpoint ?? null,
    );
    mailboxFact.fact_type = "mail.message.discovered";

    // Timer fact
    const timerFact = sourceRecordToFact(timerBatch.records[0]!, timerBatch.nextCheckpoint ?? null);

    const ingestMailbox = factStore.ingest(mailboxFact);
    const ingestTimer = factStore.ingest(timerFact);

    expect(ingestMailbox.isNew).toBe(true);
    expect(ingestTimer.isNew).toBe(true);

    const total = h.db.prepare("select count(*) as c from facts").get() as { c: number };
    expect(total.c).toBe(2);
  });

  it("both mail and process intents are first-class in the same IntentStore", () => {
    const mailIntent = h.intentStore.admit({
      intent_id: "int-mail-1",
      intent_type: "mail.send_reply",
      executor_family: "mail",
      payload_json: "{}",
      idempotency_key: "key-mail-1",
      status: "admitted",
      context_id: "ctx-mail",
      target_id: null,
      terminal_reason: null,
    });

    const processIntent = h.intentStore.admit({
      intent_id: "int-process-1",
      intent_type: "process.run",
      executor_family: "process",
      payload_json: JSON.stringify({ command: "echo", args: ["hello"] }),
      idempotency_key: "key-process-1",
      status: "admitted",
      context_id: "ctx-process",
      target_id: null,
      terminal_reason: null,
    });

    expect(mailIntent.intent.intent_type).toBe("mail.send_reply");
    expect(processIntent.intent.intent_type).toBe("process.run");

    const pending = h.intentStore.getPendingIntents();
    expect(pending).toHaveLength(2);
  });

  it("both verticals travel through the same foreman → scheduler → execution path", async () => {
    const { DefaultForemanFacade } = await import("../../../src/foreman/facade.js");
    const foreman = new DefaultForemanFacade({
      coordinatorStore: h.coordinatorStore,
      outboundStore: h.outboundStore,
      intentStore: h.intentStore,
      db: h.db,
      foremanId: "fm-test",
      getRuntimePolicy: () => ({
        primary_charter: "support_steward",
        allowed_actions: ["send_reply", "process_run", "no_action"],
      }),
    });

    insertConversation(h, "conv-mail");
    insertConversation(h, "conv-process");

    // Mail vertical work item
    const wiMail = insertWorkItem(h, { context_id: "conv-mail", status: "executing" });
    const exMail = `ex_${wiMail.work_item_id}`;
    const envelopeMail = makeInvocationEnvelope(wiMail.work_item_id, exMail, ["send_reply"]);
    insertExecutionAttempt(h, wiMail.work_item_id, exMail, envelopeMail, "active");

    // Process vertical work item
    const wiProc = insertWorkItem(h, { context_id: "conv-process", status: "executing" });
    const exProc = `ex_${wiProc.work_item_id}`;
    const envelopeProc = makeInvocationEnvelope(wiProc.work_item_id, exProc, ["process_run"]);
    insertExecutionAttempt(h, wiProc.work_item_id, exProc, envelopeProc, "active");

    // Resolve mail intent
    const mailEval = makeEvaluation(wiMail.work_item_id, exMail, {
      context_id: "conv-mail",
      proposed_actions: [
        {
          action_type: "send_reply",
          authority: "recommended",
          payload_json: JSON.stringify({ to: ["a@example.com"], subject: "Hello", body_text: "Hi" }),
          rationale: "Reply to message",
        },
      ],
    });

    const mailResult = await foreman.resolveWorkItem({
      work_item_id: wiMail.work_item_id,
      execution_id: exMail,
      evaluation: mailEval,
    });
    expect(mailResult.success).toBe(true);
    expect(mailResult.resolution_outcome).toBe("action_created");

    // Resolve process intent
    const processEval = makeEvaluation(wiProc.work_item_id, exProc, {
      context_id: "conv-process",
      proposed_actions: [
        {
          action_type: "process_run",
          authority: "recommended",
          payload_json: JSON.stringify({ command: "/bin/echo", args: ["process"] }),
          rationale: "Run process",
        },
      ],
    });

    const processResult = await foreman.resolveWorkItem({
      work_item_id: wiProc.work_item_id,
      execution_id: exProc,
      evaluation: processEval,
    });
    expect(processResult.success).toBe(true);
    expect(processResult.resolution_outcome).toBe("action_created");

    // Both intents exist in the same intent store
    const allIntents = h.intentStore.db.prepare("select * from intents").all() as Array<{ intent_type: string }>;
    expect(allIntents.some((i) => i.intent_type === "mail.send_reply")).toBe(true);
    expect(allIntents.some((i) => i.intent_type === "process.run")).toBe(true);
  });
});
