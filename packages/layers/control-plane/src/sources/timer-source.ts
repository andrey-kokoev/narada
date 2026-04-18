/**
 * TimerSource
 *
 * A domain-neutral Source implementation that emits deterministic timer ticks.
 *
 * Slot identity:
 * - A slot is defined by (schedule_id, slot_start_ms) where slot_start_ms is
 *   floor(now / intervalMs) * intervalMs.
 * - The recordId for a slot is `${schedule_id}:${slot_start_iso}`.
 * - Duplicate emission is prevented by the fact that the same slot always
 *   produces the same recordId, and the kernel apply-log + fact store are
 *   idempotent.
 * - On restart/replay, the checkpoint (last emitted slot_start_iso) is
 *   compared against the current slot; if it is >= current slot, no tick is
 *   emitted.
 */

import type { Source, SourceBatch, SourceRecord } from "../types/source.js";

export interface TimerSourceOptions {
  /** Source instance identifier */
  sourceId: string;
  /** Schedule identifier — part of the deterministic slot identity */
  scheduleId: string;
  /** Slot interval in milliseconds */
  intervalMs: number;
  /** Optional clock override for testing */
  getNow?: () => number;
}

export interface TimerTickPayload {
  kind: "timer.tick";
  slot_id: string;
  schedule_id: string;
  slot_start: string;
  slot_end: string;
}

export class TimerSource implements Source {
  readonly sourceId: string;

  constructor(private readonly opts: TimerSourceOptions) {
    this.sourceId = opts.sourceId;
  }

  async pull(checkpoint?: string | null): Promise<SourceBatch> {
    const now = this.opts.getNow ? this.opts.getNow() : Date.now();
    const intervalMs = this.opts.intervalMs;
    const currentSlotStart = Math.floor(now / intervalMs) * intervalMs;
    const currentSlotStartISO = new Date(currentSlotStart).toISOString();
    const fetchedAt = new Date(now).toISOString();

    const lastSlotStart = checkpoint ? new Date(checkpoint).getTime() : 0;

    if (lastSlotStart >= currentSlotStart) {
      return {
        records: [],
        priorCheckpoint: checkpoint ?? null,
        hasMore: false,
        fetchedAt,
      };
    }

    const slotStart = currentSlotStart;
    const slotStartISO = currentSlotStartISO;
    const slotEndISO = new Date(slotStart + intervalMs).toISOString();
    const recordId = `${this.opts.scheduleId}:${slotStartISO}`;

    const record: SourceRecord = {
      recordId,
      ordinal: slotStartISO,
      payload: {
        kind: "timer.tick",
        slot_id: recordId,
        schedule_id: this.opts.scheduleId,
        slot_start: slotStartISO,
        slot_end: slotEndISO,
      } as TimerTickPayload,
      provenance: {
        sourceId: this.opts.sourceId,
        observedAt: fetchedAt,
      },
    };

    return {
      records: [record],
      priorCheckpoint: checkpoint ?? null,
      nextCheckpoint: slotStartISO,
      hasMore: false,
      fetchedAt,
    };
  }
}
