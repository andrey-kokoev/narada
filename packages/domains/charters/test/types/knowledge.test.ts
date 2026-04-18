import { describe, it, expect } from "vitest";
import {
  isUrlKnowledgeSource,
  isLocalPathKnowledgeSource,
  isSqliteKnowledgeSource,
  validateKnowledgeSource,
  validateKnowledgeItem,
  type KnowledgeSource,
  type KnowledgeItem,
} from "../../src/types/knowledge.js";

describe("knowledge source type guards", () => {
  it("identifies url source", () => {
    const source: KnowledgeSource = {
      id: "docs",
      type: "url",
      enabled: true,
      urls: ["https://example.com/docs"],
    };
    expect(isUrlKnowledgeSource(source)).toBe(true);
    expect(isLocalPathKnowledgeSource(source)).toBe(false);
    expect(isSqliteKnowledgeSource(source)).toBe(false);
  });

  it("identifies local_path source", () => {
    const source: KnowledgeSource = {
      id: "playbook",
      type: "local_path",
      enabled: true,
      paths: ["/data/playbook.md"],
    };
    expect(isLocalPathKnowledgeSource(source)).toBe(true);
    expect(isUrlKnowledgeSource(source)).toBe(false);
  });

  it("identifies sqlite source", () => {
    const source: KnowledgeSource = {
      id: "db",
      type: "sqlite",
      enabled: true,
      database_path: "/data/knowledge.db",
    };
    expect(isSqliteKnowledgeSource(source)).toBe(true);
    expect(isUrlKnowledgeSource(source)).toBe(false);
  });
});

describe("validateKnowledgeSource", () => {
  it("accepts valid url source", () => {
    expect(
      validateKnowledgeSource({
        id: "docs",
        type: "url",
        enabled: true,
        urls: ["https://example.com"],
      }),
    ).toBe(true);
  });

  it("rejects url source with non-string urls", () => {
    expect(
      validateKnowledgeSource({
        id: "docs",
        type: "url",
        enabled: true,
        urls: [123],
      }),
    ).toBe(false);
  });

  it("accepts valid sqlite source", () => {
    expect(
      validateKnowledgeSource({
        id: "db",
        type: "sqlite",
        enabled: true,
        database_path: "/data/db.sqlite",
        query_templates: ["SELECT * FROM docs"],
        tables: ["docs"],
      }),
    ).toBe(true);
  });

  it("rejects sqlite source without database_path", () => {
    expect(
      validateKnowledgeSource({
        id: "db",
        type: "sqlite",
        enabled: true,
      }),
    ).toBe(false);
  });

  it("rejects unknown type", () => {
    expect(
      validateKnowledgeSource({
        id: "x",
        type: "unknown",
        enabled: true,
      }),
    ).toBe(false);
  });
});

describe("validateKnowledgeItem", () => {
  it("accepts valid knowledge item", () => {
    const item: KnowledgeItem = {
      knowledge_id: "k-1",
      source_id: "docs",
      mailbox_id: "help@example.com",
      charter_id: "support_steward",
      title: "Refund Policy",
      body: "Customers may request refunds within 30 days.",
      kind: "policy",
      authority_level: "high",
      provenance: {
        source_type: "url",
        locator: "https://example.com/refund",
      },
      tags: ["billing"],
      retrieved_at: new Date().toISOString(),
    };
    expect(validateKnowledgeItem(item)).toBe(true);
  });

  it("rejects item with invalid kind", () => {
    expect(
      validateKnowledgeItem({
        knowledge_id: "k-1",
        source_id: "docs",
        mailbox_id: "help@example.com",
        charter_id: "support_steward",
        title: "T",
        body: "B",
        kind: "invalid",
        authority_level: "medium",
        provenance: { source_type: "url", locator: "x" },
        tags: [],
        retrieved_at: "2024-01-01T00:00:00Z",
      }),
    ).toBe(false);
  });

  it("rejects item with missing provenance locator", () => {
    expect(
      validateKnowledgeItem({
        knowledge_id: "k-1",
        source_id: "docs",
        mailbox_id: "help@example.com",
        charter_id: "support_steward",
        title: "T",
        body: "B",
        kind: "reference",
        authority_level: "medium",
        provenance: { source_type: "url" },
        tags: [],
        retrieved_at: "2024-01-01T00:00:00Z",
      }),
    ).toBe(false);
  });
});
