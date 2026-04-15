import { describe, it, expect } from "vitest";
import { TimerSource } from "../../../src/sources/timer-source.js";

describe("TimerSource", () => {
  const fixedNow = new Date("2024-01-15T12:05:30.000Z").getTime();
  const intervalMs = 60_000; // 1 minute slots

  function makeSource(overrides?: Partial<ConstructorParameters<typeof TimerSource>[0]>): TimerSource {
    return new TimerSource({
      sourceId: "timer:test",
      scheduleId: "maintenance",
      intervalMs,
      getNow: () => fixedNow,
      ...overrides,
    });
  }

  it("emits a tick for the current slot when no checkpoint exists", async () => {
    const source = makeSource();
    const batch = await source.pull(null);

    expect(batch.records).toHaveLength(1);
    const record = batch.records[0]!;

    // Slot start should be 12:05:00.000Z
    expect(record.recordId).toBe("maintenance:2024-01-15T12:05:00.000Z");
    expect(record.ordinal).toBe("2024-01-15T12:05:00.000Z");
    expect((record.payload as { kind: string }).kind).toBe("timer.tick");
    expect(batch.nextCheckpoint).toBe("2024-01-15T12:05:00.000Z");
    expect(batch.hasMore).toBe(false);
  });

  it("emits a tick when checkpoint is from an earlier slot", async () => {
    const source = makeSource();
    const batch = await source.pull("2024-01-15T12:04:00.000Z");

    expect(batch.records).toHaveLength(1);
    expect(batch.records[0]!.recordId).toBe("maintenance:2024-01-15T12:05:00.000Z");
    expect(batch.nextCheckpoint).toBe("2024-01-15T12:05:00.000Z");
  });

  it("returns empty batch when checkpoint matches current slot", async () => {
    const source = makeSource();
    const batch = await source.pull("2024-01-15T12:05:00.000Z");

    expect(batch.records).toHaveLength(0);
    expect(batch.nextCheckpoint).toBeUndefined();
    expect(batch.hasMore).toBe(false);
  });

  it("returns empty batch when checkpoint is ahead of current slot", async () => {
    const source = makeSource();
    const batch = await source.pull("2024-01-15T12:06:00.000Z");

    expect(batch.records).toHaveLength(0);
  });

  it("produces deterministic recordId for the same slot", async () => {
    const source = makeSource();
    const batch1 = await source.pull(null);
    const batch2 = await source.pull(null);

    expect(batch1.records[0]!.recordId).toBe(batch2.records[0]!.recordId);
  });

  it("includes slot boundaries in payload", async () => {
    const source = makeSource();
    const batch = await source.pull(null);

    const payload = batch.records[0]!.payload as {
      kind: string;
      slot_id: string;
      schedule_id: string;
      slot_start: string;
      slot_end: string;
    };

    expect(payload.kind).toBe("timer.tick");
    expect(payload.schedule_id).toBe("maintenance");
    expect(payload.slot_start).toBe("2024-01-15T12:05:00.000Z");
    expect(payload.slot_end).toBe("2024-01-15T12:06:00.000Z");
    expect(payload.slot_id).toBe("maintenance:2024-01-15T12:05:00.000Z");
  });

  it("survives replay: same checkpoint produces empty batch on retry", async () => {
    const source = makeSource();
    const first = await source.pull("2024-01-15T12:04:00.000Z");
    expect(first.records).toHaveLength(1);

    const replay = await source.pull(first.nextCheckpoint!);
    expect(replay.records).toHaveLength(0);
  });

  it("uses provided sourceId", async () => {
    const source = makeSource({ sourceId: "timer:nightly" });
    const batch = await source.pull(null);

    expect(batch.records[0]!.provenance.sourceId).toBe("timer:nightly");
    expect(source.sourceId).toBe("timer:nightly");
  });
});
