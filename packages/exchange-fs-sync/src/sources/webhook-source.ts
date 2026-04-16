/**
 * WebhookSource
 *
 * A domain-neutral Source implementation that emits webhook-received facts.
 *
 * Events are buffered in a durable queue; the Source pulls unprocessed events
 * using a monotonic sequence checkpoint. This makes the vertical a real peer
 * of mailbox and timer sources.
 */

import { existsSync, readFileSync, appendFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { Source, SourceBatch, SourceRecord } from "../types/source.js";

export interface WebhookQueueRecord {
  seq: number;
  recordId: string;
  endpointId: string;
  body: unknown;
  receivedAt: string;
}

export interface WebhookEventQueue {
  enqueue(endpointId: string, body: unknown): string;
  readSince(checkpoint: string | null): WebhookQueueRecord[];
}

export interface WebhookSourceOptions {
  /** Source instance identifier */
  sourceId: string;
  /** Event queue backing the source */
  queue: WebhookEventQueue;
}

export interface WebhookReceivedPayload {
  kind: "webhook.received";
  endpoint_id: string;
  body: unknown;
}

export class WebhookSource implements Source {
  readonly sourceId: string;

  constructor(private readonly opts: WebhookSourceOptions) {
    this.sourceId = opts.sourceId;
  }

  async pull(checkpoint?: string | null): Promise<SourceBatch> {
    const fetchedAt = new Date().toISOString();
    const records = this.opts.queue.readSince(checkpoint ?? null);

    if (records.length === 0) {
      return {
        records: [],
        priorCheckpoint: checkpoint ?? null,
        hasMore: false,
        fetchedAt,
      };
    }

    const sourceRecords: SourceRecord[] = records.map((event) => ({
      recordId: event.recordId,
      ordinal: String(event.seq),
      payload: {
        kind: "webhook.received",
        endpoint_id: event.endpointId,
        body: event.body,
      } as WebhookReceivedPayload,
      provenance: {
        sourceId: this.opts.sourceId,
        observedAt: event.receivedAt,
      },
    }));

    const nextCheckpoint = String(records[records.length - 1]!.seq);

    return {
      records: sourceRecords,
      priorCheckpoint: checkpoint ?? null,
      nextCheckpoint,
      hasMore: false,
      fetchedAt,
    };
  }
}

/**
 * In-memory webhook event queue for testing.
 */
export class InMemoryWebhookEventQueue implements WebhookEventQueue {
  private seq = 0;
  private events: WebhookQueueRecord[] = [];

  enqueue(endpointId: string, body: unknown): string {
    this.seq++;
    const recordId = `webhook:${endpointId}:${this.seq}`;
    const receivedAt = new Date().toISOString();
    const record: WebhookQueueRecord = {
      seq: this.seq,
      recordId,
      endpointId,
      body,
      receivedAt,
    };
    this.events.push(record);
    return recordId;
  }

  readSince(checkpoint: string | null): WebhookQueueRecord[] {
    const since = parseInt(checkpoint ?? "0", 10);
    return this.events.filter((e) => e.seq > since);
  }
}

/**
 * File-backed webhook event queue for durability.
 * Uses an append-only JSONL file.
 */
export class FileWebhookEventQueue implements WebhookEventQueue {
  private readonly path: string;
  private seq = 0;

  constructor(queuePath: string) {
    this.path = queuePath;
    this.ensureDir();
    this.seq = this.readMaxSeq();
  }

  enqueue(endpointId: string, body: unknown): string {
    this.seq++;
    const recordId = `webhook:${endpointId}:${this.seq}`;
    const receivedAt = new Date().toISOString();
    const line =
      JSON.stringify({
        seq: this.seq,
        recordId,
        endpoint_id: endpointId,
        body,
        received_at: receivedAt,
      }) + "\n";
    appendFileSync(this.path, line, "utf8");
    return recordId;
  }

  readSince(checkpoint: string | null): WebhookQueueRecord[] {
    const since = parseInt(checkpoint ?? "0", 10);
    if (!existsSync(this.path)) {
      return [];
    }
    const raw = readFileSync(this.path, "utf8");
    const lines = raw.split("\n").filter((l) => l.trim());
    const records: WebhookQueueRecord[] = [];
    for (const line of lines) {
      try {
        const parsed = JSON.parse(line) as {
          seq: number;
          recordId: string;
          endpoint_id: string;
          body: unknown;
          received_at: string;
        };
        if (parsed.seq > since) {
          records.push({
            seq: parsed.seq,
            recordId: parsed.recordId,
            endpointId: parsed.endpoint_id,
            body: parsed.body,
            receivedAt: parsed.received_at,
          });
        }
      } catch {
        // skip corrupted line
      }
    }
    return records;
  }

  private ensureDir(): void {
    const dir = dirname(this.path);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
  }

  private readMaxSeq(): number {
    if (!existsSync(this.path)) {
      return 0;
    }
    const raw = readFileSync(this.path, "utf8");
    const lines = raw.split("\n").filter((l) => l.trim());
    let max = 0;
    for (const line of lines) {
      try {
        const parsed = JSON.parse(line) as { seq?: number };
        if (typeof parsed.seq === "number" && parsed.seq > max) {
          max = parsed.seq;
        }
      } catch {
        // skip
      }
    }
    return max;
  }
}
