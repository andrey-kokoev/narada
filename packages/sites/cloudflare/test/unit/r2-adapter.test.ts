import { describe, it, expect, beforeEach } from "vitest";
import { R2Adapter, buildArtifactPath } from "../../src/storage/r2-adapter.js";

function createMockR2Bucket(): R2Bucket {
  const store = new Map<string, { body: ArrayBuffer; metadata: Record<string, string> }>();
  return {
    put: async (key: string, value: ReadableStream | ArrayBuffer | string, options?: R2PutOptions) => {
      let body: ArrayBuffer;
      if (typeof value === "string") {
        body = new TextEncoder().encode(value);
      } else if (value instanceof ReadableStream) {
        const reader = value.getReader();
        const chunks: Uint8Array[] = [];
        while (true) {
          const { done, value: chunk } = await reader.read();
          if (done) break;
          chunks.push(chunk);
        }
        const totalLength = chunks.reduce((sum, c) => sum + c.length, 0);
        const merged = new Uint8Array(totalLength);
        let offset = 0;
        for (const c of chunks) {
          merged.set(c, offset);
          offset += c.length;
        }
        body = merged.buffer;
      } else {
        body = value;
      }
      store.set(key, { body, metadata: options?.customMetadata ?? {} });
      return {} as R2Object;
    },
    get: async (key: string) => {
      const item = store.get(key);
      if (!item) return null;
      return {
        body: new ReadableStream({
          start(controller) {
            controller.enqueue(new Uint8Array(item.body));
            controller.close();
          },
        }),
        customMetadata: item.metadata,
      } as R2ObjectBody;
    },
    delete: async (key: string) => { store.delete(key); },
    list: async (options?: R2ListOptions) => {
      const prefix = options?.prefix ?? "";
      const keys: string[] = [];
      for (const k of store.keys()) {
        if (k.startsWith(prefix)) keys.push(k);
      }
      return { objects: keys.map((name) => ({ key: name } as R2Object)), truncated: false } as R2Objects;
    },
  } as R2Bucket;
}

describe("R2Adapter", () => {
  let bucket: R2Bucket;
  let adapter: R2Adapter;

  beforeEach(() => {
    bucket = createMockR2Bucket();
    adapter = new R2Adapter(bucket, "site-1");
  });

  it("writes and reads a string object", async () => {
    await adapter.writeObject("test.txt", "hello world", { contentType: "text/plain" });
    const result = await adapter.readObject("test.txt");
    expect(result).not.toBeNull();
    const chunks: Uint8Array[] = [];
    const reader = result!.body.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
    }
    const text = new TextDecoder().decode(chunks[0]);
    expect(text).toBe("hello world");
    expect(result!.metadata.contentType).toBe("text/plain");
  });

  it("writes and reads via ReadableStream without buffering", async () => {
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode("chunk1-"));
        controller.enqueue(encoder.encode("chunk2-"));
        controller.enqueue(encoder.encode("chunk3"));
        controller.close();
      },
    });

    await adapter.writeObject("streamed.txt", stream);
    const result = await adapter.readObject("streamed.txt");
    expect(result).not.toBeNull();

    const chunks: Uint8Array[] = [];
    const reader = result!.body.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
    }
    const text = new TextDecoder().decode(chunks[0]);
    expect(text).toBe("chunk1-chunk2-chunk3");
  });

  it("deletes an object", async () => {
    await adapter.writeObject("delete-me.txt", "bye");
    await adapter.deleteObject("delete-me.txt");
    const result = await adapter.readObject("delete-me.txt");
    expect(result).toBeNull();
  });

  it("lists objects by prefix", async () => {
    await adapter.writeObject("a/1.txt", "one");
    await adapter.writeObject("a/2.txt", "two");
    await adapter.writeObject("b/3.txt", "three");
    const listA = await adapter.listObjects("a/");
    expect(listA.sort()).toEqual(["site-1/a/1.txt", "site-1/a/2.txt"]);
  });
});

describe("buildArtifactPath", () => {
  it("builds message paths", () => {
    expect(buildArtifactPath("help", "message", { message_id: "msg-1" }))
      .toBe("help/messages/msg-1/record.json");
  });

  it("builds snapshot paths", () => {
    expect(buildArtifactPath("help", "snapshot", { snapshot_id: "snap-1" }))
      .toBe("help/snapshots/snap-1.json");
  });

  it("builds evaluation paths", () => {
    expect(buildArtifactPath("help", "evaluation", { cycle_id: "c-1", evaluation_id: "eval-1" }))
      .toBe("help/traces/c-1/evaluation-eval-1.json");
  });

  it("builds decision paths", () => {
    expect(buildArtifactPath("help", "decision", { cycle_id: "c-1", decision_id: "dec-1" }))
      .toBe("help/traces/c-1/decision-dec-1.json");
  });

  it("builds backup paths", () => {
    expect(buildArtifactPath("help", "backup", { timestamp: "2024-01-01T00-00-00Z" }))
      .toBe("help/backups/2024-01-01T00-00-00Z.tar.gz");
  });

  it("throws for unknown artifact types", () => {
    expect(() => buildArtifactPath("help", "unknown" as never, {})).toThrow("Unknown artifact type");
  });
});
