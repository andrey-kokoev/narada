import { mkdtemp, rm, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { InboxDropSource } from "../../../src/sources/inbox-drop-source.js";

describe("InboxDropSource", () => {
  let rootDir: string;

  beforeEach(async () => {
    rootDir = await mkdtemp(join(tmpdir(), "narada-inbox-drop-source-"));
  });

  afterEach(async () => {
    await rm(rootDir, { recursive: true, force: true });
  });

  it("returns no records when the inbox-drop directory is absent", async () => {
    const source = new InboxDropSource({ sourceId: "site:test", rootDir });

    const batch = await source.pull(null);

    expect(batch.records).toEqual([]);
    expect(batch.hasMore).toBe(false);
  });

  it("emits inert filesystem observations for direct inbox-drop children", async () => {
    await mkdir(join(rootDir, ".ai", "inbox-drop"), { recursive: true });
    await writeFile(join(rootDir, ".ai", "inbox-drop", "20260428-001-observation.md"), "hello\n");
    const source = new InboxDropSource({ sourceId: "site:test", rootDir });

    const batch = await source.pull(null);

    expect(batch.records).toHaveLength(1);
    expect(batch.records[0]!.recordId).toMatch(/^inbox-drop:inbox_drop:/);
    expect(batch.records[0]!.payload).toMatchObject({
      kind: "filesystem.change",
      watch_id: "inbox_drop",
      path: join(".ai", "inbox-drop", "20260428-001-observation.md"),
      change_type: "modified",
      size: 6,
    });
  });
});
