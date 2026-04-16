import { describe, it, expect, beforeEach } from "vitest";
import {
  FilesystemSource,
  InMemoryFilesystemEventQueue,
} from "../../../src/sources/filesystem-source.js";

describe("FilesystemSource", () => {
  let queue: InMemoryFilesystemEventQueue;
  let source: FilesystemSource;

  beforeEach(() => {
    queue = new InMemoryFilesystemEventQueue();
    source = new FilesystemSource({ sourceId: "test-fs", queue });
  });

  it("should return empty batch when queue is empty", async () => {
    const batch = await source.pull(null);
    expect(batch.records).toHaveLength(0);
    expect(batch.hasMore).toBe(false);
    expect(batch.priorCheckpoint).toBeNull();
  });

  it("should emit filesystem events as source records", async () => {
    queue.enqueue("watches", "/data/inbox/file1.txt", "created", 1024);
    queue.enqueue("watches", "/data/inbox/file2.txt", "modified", 2048);

    const batch = await source.pull(null);
    expect(batch.records).toHaveLength(2);
    expect(batch.hasMore).toBe(false);
    expect(batch.nextCheckpoint).toBe("2");

    const first = batch.records[0]!;
    expect(first.recordId).toBe("fs:watches:1");
    expect(first.ordinal).toBe("1");
    expect((first.payload as { kind: string }).kind).toBe("filesystem.change");
    expect((first.payload as { watch_id: string }).watch_id).toBe("watches");
    expect((first.payload as { path: string }).path).toBe("/data/inbox/file1.txt");
    expect((first.payload as { change_type: string }).change_type).toBe("created");
    expect((first.payload as { size: number }).size).toBe(1024);
    expect(first.provenance.sourceId).toBe("test-fs");

    const second = batch.records[1]!;
    expect(second.recordId).toBe("fs:watches:2");
    expect(second.ordinal).toBe("2");
    expect((second.payload as { change_type: string }).change_type).toBe("modified");
    expect((second.payload as { size: number }).size).toBe(2048);
  });

  it("should resume from checkpoint", async () => {
    queue.enqueue("watches", "/a.txt", "created");
    queue.enqueue("watches", "/b.txt", "modified");
    queue.enqueue("watches", "/c.txt", "deleted");

    const batch = await source.pull("1");
    expect(batch.records).toHaveLength(2);
    expect(batch.records[0]!.ordinal).toBe("2");
    expect(batch.records[1]!.ordinal).toBe("3");
    expect(batch.nextCheckpoint).toBe("3");
    expect(batch.priorCheckpoint).toBe("1");
  });

  it("should return empty batch when checkpoint is at latest", async () => {
    queue.enqueue("watches", "/a.txt", "created");
    const batch = await source.pull("1");
    expect(batch.records).toHaveLength(0);
    expect(batch.hasMore).toBe(false);
  });

  it("should set sourceId on the instance", () => {
    expect(source.sourceId).toBe("test-fs");
  });
});
