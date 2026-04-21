import { describe, it, expect, vi } from "vitest";
import Database from "better-sqlite3";
import { NaradaSiteCoordinator } from "../../src/coordinator.js";
import { createMockState } from "../fixtures/mock-sqlite.js";
import {
  createSyncStepHandler,
  createDeriveWorkStepHandler,
  createEvaluateStepHandler,
  createHandoffStepHandler,
  createLiveReconcileStepHandler,
} from "../../src/cycle-step.js";
import {
  GraphLiveObservationAdapter,
  type GraphObservationClient,
  type GraphMessage,
} from "../../src/reconciliation/live-observation-adapter.js";

function createCoordinator() {
  const db = new Database(":memory:");
  return { db, coordinator: new NaradaSiteCoordinator(createMockState(db)) };
}

function createEnv(coordinator: ReturnType<typeof createCoordinator>["coordinator"]) {
  return { cycleId: "c-1", siteId: "test", scopeId: "test", coordinator, env: {} as any };
}

const sampleDeltas = [
  {
    sourceId: "graph-mail",
    eventId: "evt-001",
    factType: "mail.message_created",
    payloadJson: JSON.stringify({ id: "msg-1", subject: "Hello" }),
    observedAt: "2024-01-01T00:00:00Z",
  },
];

function buildMockClient(
  overrides: Partial<GraphObservationClient> = {},
): GraphObservationClient {
  return {
    findMessageByInternetMessageId: vi.fn(async () => null),
    findMessageByOutboundHeader: vi.fn(async () => null),
    findMessageById: vi.fn(async () => null),
    ...overrides,
  };
}

describe("GraphLiveObservationAdapter", () => {
  it("confirms send_reply when message found by internet_message_id", async () => {
    const client = buildMockClient({
      findMessageByInternetMessageId: vi.fn(async () => ({ id: "graph-msg-1" })),
    });
    const adapter = new GraphLiveObservationAdapter(client);

    const observations = await adapter.fetchObservations([
      {
        outboundId: "ob-1",
        contextId: "ctx-1",
        scopeId: "test",
        actionType: "send_reply",
        internetMessageId: "<imid-1@example.com>",
      },
    ]);

    expect(observations).toHaveLength(1);
    expect(observations[0]!).toMatchObject({
      outboundId: "ob-1",
      observedStatus: "confirmed",
      evidence: expect.stringContaining("graph-msg-1"),
    });
    expect(client.findMessageByInternetMessageId).toHaveBeenCalledWith(
      "test",
      "<imid-1@example.com>",
    );
  });

  it("confirms send_reply by outbound header when internet_message_id missing", async () => {
    const client = buildMockClient({
      findMessageByOutboundHeader: vi.fn(async () => ({ id: "graph-msg-2" })),
    });
    const adapter = new GraphLiveObservationAdapter(client);

    const observations = await adapter.fetchObservations([
      {
        outboundId: "ob-2",
        contextId: "ctx-2",
        scopeId: "test",
        actionType: "send_reply",
        internetMessageId: null,
      },
    ]);

    expect(observations).toHaveLength(1);
    expect(observations[0]!).toMatchObject({
      outboundId: "ob-2",
      observedStatus: "confirmed",
      evidence: expect.stringContaining("outbound_id header"),
    });
  });

  it("returns no observation when message is not found", async () => {
    const client = buildMockClient();
    const adapter = new GraphLiveObservationAdapter(client);

    const observations = await adapter.fetchObservations([
      {
        outboundId: "ob-3",
        contextId: "ctx-3",
        scopeId: "test",
        actionType: "send_reply",
        internetMessageId: "<imid-3@example.com>",
      },
    ]);

    expect(observations).toHaveLength(0);
  });

  it("does not fabricate confirmation when client throws", async () => {
    const client = buildMockClient({
      findMessageByInternetMessageId: vi.fn(async () => {
        throw new Error("Graph API timeout");
      }),
    });
    const adapter = new GraphLiveObservationAdapter(client);

    const observations = await adapter.fetchObservations([
      {
        outboundId: "ob-4",
        contextId: "ctx-4",
        scopeId: "test",
        actionType: "send_reply",
        internetMessageId: "<imid-4@example.com>",
      },
    ]);

    expect(observations).toHaveLength(0);
  });

  it("continues processing remaining outbounds when one lookup fails", async () => {
    const client = buildMockClient({
      findMessageByInternetMessageId: vi.fn(async (_scopeId, imid) => {
        if (imid === "<imid-a@example.com>") throw new Error("timeout");
        return { id: "graph-msg-b" };
      }),
    });
    const adapter = new GraphLiveObservationAdapter(client);

    const observations = await adapter.fetchObservations([
      {
        outboundId: "ob-a",
        contextId: "ctx-a",
        scopeId: "test",
        actionType: "send_reply",
        internetMessageId: "<imid-a@example.com>",
      },
      {
        outboundId: "ob-b",
        contextId: "ctx-b",
        scopeId: "test",
        actionType: "send_reply",
        internetMessageId: "<imid-b@example.com>",
      },
    ]);

    expect(observations).toHaveLength(1);
    expect(observations[0]!.outboundId).toBe("ob-b");
  });

  it("confirms mark_read when message is_read=true", async () => {
    const client = buildMockClient({
      findMessageById: vi.fn(async () => ({ id: "msg-1", isRead: true })),
    });
    const adapter = new GraphLiveObservationAdapter(client);

    const observations = await adapter.fetchObservations([
      {
        outboundId: "ob-5",
        contextId: "ctx-5",
        scopeId: "test",
        actionType: "mark_read",
        payloadJson: JSON.stringify({ target_message_id: "msg-1" }),
      },
    ]);

    expect(observations).toHaveLength(1);
    expect(observations[0]!).toMatchObject({
      observedStatus: "confirmed",
      evidence: "Message is_read=true",
    });
  });

  it("fails mark_read when message is_read=false", async () => {
    const client = buildMockClient({
      findMessageById: vi.fn(async () => ({ id: "msg-1", isRead: false })),
    });
    const adapter = new GraphLiveObservationAdapter(client);

    const observations = await adapter.fetchObservations([
      {
        outboundId: "ob-6",
        contextId: "ctx-6",
        scopeId: "test",
        actionType: "mark_read",
        payloadJson: JSON.stringify({ target_message_id: "msg-1" }),
      },
    ]);

    expect(observations).toHaveLength(1);
    expect(observations[0]!).toMatchObject({
      observedStatus: "failed",
      evidence: "Message is_read=false",
    });
  });

  it("confirms move_message when message is in destination folder", async () => {
    const client = buildMockClient({
      findMessageById: vi.fn(async () => ({ id: "msg-1", folderRefs: ["folder-inbox", "folder-archive"] })),
    });
    const adapter = new GraphLiveObservationAdapter(client);

    const observations = await adapter.fetchObservations([
      {
        outboundId: "ob-7",
        contextId: "ctx-7",
        scopeId: "test",
        actionType: "move_message",
        payloadJson: JSON.stringify({ target_message_id: "msg-1", destination_folder_id: "folder-archive" }),
      },
    ]);

    expect(observations).toHaveLength(1);
    expect(observations[0]!).toMatchObject({
      observedStatus: "confirmed",
      evidence: expect.stringContaining("folder-archive"),
    });
  });

  it("confirms set_categories when all expected categories present", async () => {
    const client = buildMockClient({
      findMessageById: vi.fn(async () => ({ id: "msg-1", categoryRefs: ["cat-a", "cat-b"] })),
    });
    const adapter = new GraphLiveObservationAdapter(client);

    const observations = await adapter.fetchObservations([
      {
        outboundId: "ob-8",
        contextId: "ctx-8",
        scopeId: "test",
        actionType: "set_categories",
        payloadJson: JSON.stringify({ target_message_id: "msg-1", categories: ["cat-a"] }),
      },
    ]);

    expect(observations).toHaveLength(1);
    expect(observations[0]!).toMatchObject({
      observedStatus: "confirmed",
    });
  });

  it("treats propose_action like send_reply", async () => {
    const client = buildMockClient({
      findMessageByOutboundHeader: vi.fn(async () => ({ id: "graph-msg-p" })),
    });
    const adapter = new GraphLiveObservationAdapter(client);

    const observations = await adapter.fetchObservations([
      {
        outboundId: "ob-p",
        contextId: "ctx-p",
        scopeId: "test",
        actionType: "propose_action",
      },
    ]);

    expect(observations).toHaveLength(1);
    expect(observations[0]!.observedStatus).toBe("confirmed");
  });

  it("returns empty when payload_json is missing for non-send action", async () => {
    const client = buildMockClient();
    const adapter = new GraphLiveObservationAdapter(client);

    const observations = await adapter.fetchObservations([
      {
        outboundId: "ob-9",
        contextId: "ctx-9",
        scopeId: "test",
        actionType: "mark_read",
        payloadJson: null,
      },
    ]);

    expect(observations).toHaveLength(0);
  });
});

describe("createLiveReconcileStepHandler", () => {
  function transitionToSubmitted(
    coordinator: ReturnType<typeof createCoordinator>["coordinator"],
    outboundId: string,
    internetMessageId?: string,
  ) {
    coordinator.updateOutboundCommandStatus(outboundId, "submitted");
    coordinator.insertExecutionAttempt({
      executionAttemptId: `att-${outboundId}`,
      outboundId,
      actionType: "send_reply",
      attemptedAt: "2024-01-01T00:00:00Z",
      status: "submitted",
      errorCode: null,
      errorMessage: null,
      responseJson: internetMessageId ? JSON.stringify({ internetMessageId }) : null,
      externalRef: null,
      workerId: "w-1",
      leaseExpiresAt: null,
    });
  }

  it("matching live observation confirms submitted command", async () => {
    const { coordinator } = createCoordinator();
    const env = createEnv(coordinator);

    // Run pipeline through handoff
    await createSyncStepHandler(sampleDeltas)(env, () => true);
    await createDeriveWorkStepHandler()(env, () => true);
    await createEvaluateStepHandler()(env, () => true);
    await createHandoffStepHandler()(env, () => true);

    expect(coordinator.getOutboundCommandCount()).toBe(1);

    const outboundId = coordinator.getPendingOutboundCommands()[0]!.outboundId;
    transitionToSubmitted(coordinator, outboundId);

    const client = buildMockClient({
      findMessageByOutboundHeader: vi.fn(async () => ({ id: "graph-msg-1" })),
    });
    const adapter = new GraphLiveObservationAdapter(client);
    const handler = createLiveReconcileStepHandler(adapter);

    const result = await handler(env, () => true);

    expect(result.status).toBe("completed");
    expect(result.recordsWritten).toBe(1);
    expect(result.residuals).toContain("confirmed_1_outbound_commands");

    expect(coordinator.getSubmittedOutboundCommands().length).toBe(0);
  });

  it("missing observation leaves submitted command unconfirmed", async () => {
    const { coordinator } = createCoordinator();
    const env = createEnv(coordinator);

    await createSyncStepHandler(sampleDeltas)(env, () => true);
    await createDeriveWorkStepHandler()(env, () => true);
    await createEvaluateStepHandler()(env, () => true);
    await createHandoffStepHandler()(env, () => true);

    const outboundId = coordinator.getPendingOutboundCommands()[0]!.outboundId;
    transitionToSubmitted(coordinator, outboundId);

    const client = buildMockClient(); // all lookups return null
    const adapter = new GraphLiveObservationAdapter(client);
    const handler = createLiveReconcileStepHandler(adapter);

    const result = await handler(env, () => true);

    expect(result.status).toBe("completed");
    expect(result.recordsWritten).toBe(0);
    expect(result.residuals).toContain("left_1_unconfirmed");

    expect(coordinator.getSubmittedOutboundCommands().length).toBe(1);
  });

  it("adapter failure does not fabricate confirmation", async () => {
    const { coordinator } = createCoordinator();
    const env = createEnv(coordinator);

    await createSyncStepHandler(sampleDeltas)(env, () => true);
    await createDeriveWorkStepHandler()(env, () => true);
    await createEvaluateStepHandler()(env, () => true);
    await createHandoffStepHandler()(env, () => true);

    const outboundId = coordinator.getPendingOutboundCommands()[0]!.outboundId;
    transitionToSubmitted(coordinator, outboundId);

    const client = buildMockClient({
      findMessageByOutboundHeader: vi.fn(async () => {
        throw new Error("Graph API down");
      }),
    });
    const adapter = new GraphLiveObservationAdapter(client);
    const handler = createLiveReconcileStepHandler(adapter);

    const result = await handler(env, () => true);

    expect(result.status).toBe("completed");
    expect(result.recordsWritten).toBe(0);
    expect(result.residuals).toContain("left_1_unconfirmed");

    expect(coordinator.getSubmittedOutboundCommands().length).toBe(1);
  });

  it("partial confirmation when only some observations match", async () => {
    const { coordinator } = createCoordinator();
    const env = createEnv(coordinator);

    // Admit two facts from different sources
    const deltas = [
      {
        sourceId: "graph-mail",
        eventId: "evt-001",
        factType: "mail.message_created",
        payloadJson: JSON.stringify({ id: "msg-1", subject: "Hello" }),
        observedAt: "2024-01-01T00:00:00Z",
      },
      {
        sourceId: "timer",
        eventId: "evt-002",
        factType: "timer.fired",
        payloadJson: JSON.stringify({ cron: "0 9 * * *" }),
        observedAt: "2024-01-01T00:01:00Z",
      },
    ];

    await createSyncStepHandler(deltas)(env, () => true);
    await createDeriveWorkStepHandler()(env, () => true);
    await createEvaluateStepHandler()(env, () => true);
    await createHandoffStepHandler()(env, () => true);

    const pending = coordinator.getPendingOutboundCommands();
    expect(pending.length).toBe(2);

    transitionToSubmitted(coordinator, pending[0]!.outboundId);
    transitionToSubmitted(coordinator, pending[1]!.outboundId);

    // Only confirm the first one
    const client = buildMockClient({
      findMessageByOutboundHeader: vi.fn(async (_scopeId, outboundId) => {
        if (outboundId === pending[0]!.outboundId) return { id: "graph-msg-1" };
        return null;
      }),
    });
    const adapter = new GraphLiveObservationAdapter(client);
    const handler = createLiveReconcileStepHandler(adapter);

    const result = await handler(env, () => true);

    expect(result.recordsWritten).toBe(1);
    expect(result.residuals).toContain("confirmed_1_outbound_commands");
    expect(result.residuals).toContain("left_1_unconfirmed");

    expect(coordinator.getSubmittedOutboundCommands().length).toBe(1);
  });

  it("self-confirmation is impossible without external observation", async () => {
    const { coordinator } = createCoordinator();
    const env = createEnv(coordinator);

    await createSyncStepHandler(sampleDeltas)(env, () => true);
    await createDeriveWorkStepHandler()(env, () => true);
    await createEvaluateStepHandler()(env, () => true);
    await createHandoffStepHandler()(env, () => true);

    const outboundId = coordinator.getPendingOutboundCommands()[0]!.outboundId;
    transitionToSubmitted(coordinator, outboundId);

    // The live handler delegates to the adapter. If the adapter returns
    // no observations, nothing gets confirmed. The handler cannot
    // generate observations from its own state.
    const client = buildMockClient();
    const adapter = new GraphLiveObservationAdapter(client);
    const handler = createLiveReconcileStepHandler(adapter);

    const result = await handler(env, () => true);

    expect(result.recordsWritten).toBe(0);
    expect(coordinator.getSubmittedOutboundCommands().length).toBe(1);
  });
});
