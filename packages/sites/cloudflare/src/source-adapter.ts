/**
 * Live Source Adapter Contract
 *
 * Bounded source-read seam for the Cloudflare Site cycle.
 * Adapters produce deltas that feed into the fact admission boundary.
 *
 * Choice: HTTP polling adapter (smallest credible live-read path).
 * Webhook ingress was considered but requires DO schema changes and
 * fetch-handler modifications. HTTP polling needs no schema changes
 * and fits the existing cycle step pattern.
 */

import type { FixtureSourceDelta } from "./types.js";

/**
 * Error raised when a source adapter fails to read.
 */
export class SourceAdapterError extends Error {
  constructor(
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = "SourceAdapterError";
  }
}

/**
 * Source adapter interface — implementors read from a live source
 * and produce deltas for fact admission.
 */
export interface SourceAdapter {
  /** Canonical source identifier (used for cursor namespacing). */
  readonly sourceId: string;

  /**
   * Read a bounded batch of deltas from the source.
   *
   * @param cursor  Opaque resume position from the coordinator, or null for initial read.
   * @param limit   Maximum number of deltas to return.
   */
  readDeltas(cursor: string | null, limit: number): Promise<FixtureSourceDelta[]>;
}

/**
 * Generic HTTP polling source adapter.
 *
 * Expects the endpoint to return JSON shaped as:
 *   { items: Array<{ id, type, createdAt?, ... }> }
 *
 * A custom transform may map arbitrary item shapes to deltas.
 */
export interface HttpSourceAdapterOptions {
  endpoint: string;
  sourceId: string;
  headers?: Record<string, string>;
  transform?: (item: unknown) => FixtureSourceDelta;
}

export class HttpSourceAdapter implements SourceAdapter {
  readonly sourceId: string;
  private readonly endpoint: string;
  private readonly headers: Record<string, string>;
  private readonly transform: (item: unknown) => FixtureSourceDelta;

  constructor(options: HttpSourceAdapterOptions) {
    this.sourceId = options.sourceId;
    this.endpoint = options.endpoint;
    this.headers = options.headers ?? {};
    this.transform = options.transform ?? defaultHttpTransform;
  }

  async readDeltas(cursor: string | null, limit: number): Promise<FixtureSourceDelta[]> {
    const url = new URL(this.endpoint);
    if (cursor) url.searchParams.set("cursor", cursor);
    url.searchParams.set("limit", String(limit));

    let response: Response;
    try {
      response = await fetch(url.toString(), { headers: this.headers });
    } catch (err) {
      throw new SourceAdapterError(
        `Network error reading from ${this.sourceId}: ${err instanceof Error ? err.message : String(err)}`,
        err,
      );
    }

    if (!response.ok) {
      throw new SourceAdapterError(`HTTP ${response.status} from ${this.sourceId}`);
    }

    let data: unknown;
    try {
      data = await response.json();
    } catch (err) {
      throw new SourceAdapterError(`Invalid JSON from ${this.sourceId}`, err);
    }

    const items = (data as Record<string, unknown>).items;
    if (!Array.isArray(items)) {
      throw new SourceAdapterError(`Expected 'items' array from ${this.sourceId}`);
    }

    return items.slice(0, limit).map(this.transform);
  }
}

function defaultHttpTransform(item: unknown): FixtureSourceDelta {
  const i = item as Record<string, unknown>;
  const eventId = i.id ?? i.eventId;
  if (!eventId) {
    throw new SourceAdapterError(
      "Item missing 'id' or 'eventId' field required for fact identity",
    );
  }
  return {
    sourceId: String(i.sourceId ?? "http-source"),
    eventId: String(eventId),
    factType: String(i.type ?? i.factType ?? "unknown.event"),
    payloadJson: JSON.stringify(item),
    observedAt: String(i.createdAt ?? i.observedAt ?? new Date().toISOString()),
  };
}
