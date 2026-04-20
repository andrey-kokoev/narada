import { describe, expect, it } from "vitest";
import { mkdtemp, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { MailboxContextMaterializer } from "../../../src/charter/mailbox/materializer.js";
import { FileMessageStore } from "../../../src/persistence/messages.js";
import type { PolicyContext } from "../../../src/foreman/context.js";

describe("MailboxContextMaterializer", () => {
  it("includes knowledge_sources when knowledge/ directory exists", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "narada-mat-"));
    const knowledgeDir = join(rootDir, "knowledge");
    await mkdir(knowledgeDir, { recursive: true });
    await writeFile(join(knowledgeDir, "README.md"), "# Playbook\n\nLogin issues: ask for email.", "utf-8");
    await writeFile(join(knowledgeDir, "notes.md"), "Internal notes", "utf-8");

    const messageStore = new FileMessageStore({ rootDir });
    const materializer = new MailboxContextMaterializer(rootDir, messageStore);

    const context: PolicyContext = {
      context_id: "conv-001",
      scope_id: "scope-001",
      revision_id: "rev-001",
      previous_revision_ordinal: null,
      current_revision_ordinal: 0,
      change_kinds: [],
      facts: [],
      synced_at: new Date().toISOString(),
    };

    const result = (await materializer.materialize(context)) as {
      messages: unknown[];
      knowledge_sources: Array<{ name: string; content: string }>;
    };

    expect(result.knowledge_sources).toHaveLength(2);
    expect(result.knowledge_sources.map((k) => k.name).sort()).toEqual(["README.md", "notes.md"]);
    expect(result.knowledge_sources.find((k) => k.name === "README.md")?.content).toContain(
      "ask for email"
    );
  });

  it("returns empty knowledge_sources when knowledge/ directory is missing", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "narada-mat-"));
    const messageStore = new FileMessageStore({ rootDir });
    const materializer = new MailboxContextMaterializer(rootDir, messageStore);

    const context: PolicyContext = {
      context_id: "conv-002",
      scope_id: "scope-001",
      revision_id: "rev-001",
      previous_revision_ordinal: null,
      current_revision_ordinal: 0,
      change_kinds: [],
      facts: [],
      synced_at: new Date().toISOString(),
    };

    const result = (await materializer.materialize(context)) as {
      messages: unknown[];
      knowledge_sources: Array<{ name: string; content: string }>;
    };

    expect(result.knowledge_sources).toEqual([]);
  });
});
