import { describe, it, expect, beforeEach } from "vitest";
import {
  WebhookSource,
  InMemoryWebhookEventQueue,
} from "../../../src/sources/webhook-source.js";

describe("WebhookSource", () => {
  let queue: InMemoryWebhookEventQueue;
  let source: WebhookSource;

  beforeEach(() => {
    queue = new InMemoryWebhookEventQueue();
    source = new WebhookSource({ sourceId: "test-webhook", queue });
  });

  it("should return empty batch when queue is empty", async () => {
    const batch = await source.pull(null);
    expect(batch.records).toHaveLength(0);
    expect(batch.hasMore).toBe(false);
    expect(batch.priorCheckpoint).toBeNull();
  });

  it("should emit webhook events as source records", async () => {
    queue.enqueue("alerts", { severity: "high", message: "cpu spike" });
    queue.enqueue("alerts", { severity: "low", message: "disk usage" });

    const batch = await source.pull(null);
    expect(batch.records).toHaveLength(2);
    expect(batch.hasMore).toBe(false);
    expect(batch.nextCheckpoint).toBe("2");

    const first = batch.records[0]!;
    expect(first.recordId).toBe("webhook:alerts:1");
    expect(first.ordinal).toBe("1");
    expect((first.payload as { kind: string }).kind).toBe("webhook.received");
    expect((first.payload as { endpoint_id: string }).endpoint_id).toBe("alerts");
    expect((first.payload as { body: unknown }).body).toEqual({
      severity: "high",
      message: "cpu spike",
    });
    expect(first.provenance.sourceId).toBe("test-webhook");

    const second = batch.records[1]!;
    expect(second.recordId).toBe("webhook:alerts:2");
    expect(second.ordinal).toBe("2");
  });

  it("should resume from checkpoint", async () => {
    queue.enqueue("alerts", { a: 1 });
    queue.enqueue("alerts", { a: 2 });
    queue.enqueue("alerts", { a: 3 });

    const batch = await source.pull("1");
    expect(batch.records).toHaveLength(2);
    expect(batch.records[0]!.ordinal).toBe("2");
    expect(batch.records[1]!.ordinal).toBe("3");
    expect(batch.nextCheckpoint).toBe("3");
    expect(batch.priorCheckpoint).toBe("1");
  });

  it("should return empty batch when checkpoint is at latest", async () => {
    queue.enqueue("alerts", { a: 1 });
    const batch = await source.pull("1");
    expect(batch.records).toHaveLength(0);
    expect(batch.hasMore).toBe(false);
  });

  it("should set sourceId on the instance", () => {
    expect(source.sourceId).toBe("test-webhook");
  });
});
