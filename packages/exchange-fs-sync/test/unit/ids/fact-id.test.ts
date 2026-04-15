import { describe, it, expect } from "vitest";
import { buildFactId } from "../../../src/ids/fact-id.js";

describe("buildFactId", () => {
  it("is deterministic for identical inputs", () => {
    const input = {
      fact_type: "mail.message.discovered" as const,
      provenance: {
        source_id: "src-1",
        source_record_id: "rec-1",
        source_version: "v1",
        source_cursor: "cursor-1",
        observed_at: "2024-01-01T00:00:00Z",
      },
      payload: { subject: "Hello" },
    };

    const id1 = buildFactId(input);
    const id2 = buildFactId(input);

    expect(id1).toBe(id2);
    expect(id1).toMatch(/^fact_[a-f0-9]{32}$/);
  });

  it("changes when payload changes", () => {
    const base = {
      fact_type: "mail.message.discovered" as const,
      provenance: {
        source_id: "src-1",
        source_record_id: "rec-1",
        observed_at: "2024-01-01T00:00:00Z",
      },
    };

    const id1 = buildFactId({ ...base, payload: { a: 1 } });
    const id2 = buildFactId({ ...base, payload: { a: 2 } });

    expect(id1).not.toBe(id2);
  });

  it("changes when source_record_id changes", () => {
    const base = {
      fact_type: "mail.message.discovered" as const,
      provenance: {
        source_id: "src-1",
        source_record_id: "rec-1",
        observed_at: "2024-01-01T00:00:00Z",
      },
      payload: {},
    };

    const id1 = buildFactId(base);
    const id2 = buildFactId({
      ...base,
      provenance: { ...base.provenance, source_record_id: "rec-2" },
    });

    expect(id1).not.toBe(id2);
  });

  it("is stable across source_cursor and observed_at changes", () => {
    const base = {
      fact_type: "mail.message.discovered" as const,
      provenance: {
        source_id: "src-1",
        source_record_id: "rec-1",
        source_version: "v1",
        source_cursor: "cursor-1",
        observed_at: "2024-01-01T00:00:00Z",
      },
      payload: { subject: "Hello" },
    };

    const id1 = buildFactId(base);
    const id2 = buildFactId({
      ...base,
      provenance: {
        ...base.provenance,
        source_cursor: "cursor-2",
        observed_at: "2024-02-02T00:00:00Z",
      },
    });

    expect(id1).toBe(id2);
  });

  it("is source-neutral — different source_id yields different fact_id", () => {
    const base = {
      fact_type: "mail.message.discovered" as const,
      provenance: {
        source_id: "src-a",
        source_record_id: "rec-1",
        observed_at: "2024-01-01T00:00:00Z",
      },
      payload: { subject: "Hello" },
    };

    const id1 = buildFactId(base);
    const id2 = buildFactId({
      ...base,
      provenance: { ...base.provenance, source_id: "src-b" },
    });

    expect(id1).not.toBe(id2);
  });
});
