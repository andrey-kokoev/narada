import type { PiRowViewModel, ProjectionClass } from '../types.js';
import { durableEventIdentity, durableEventSequence } from '../nars-client/event-stream.js';

export class TranscriptModel {
  private readonly rowsByKey = new Map<string, PiRowViewModel>();
  private readonly firstSeen = new Map<string, number>();
  private readonly seenEventIds = new Set<string>();
  private arrival = 0;
  private cursor: number | null = null;

  ingest(row: PiRowViewModel): boolean {
    const identity = durableEventIdentity(row.event);
    const sequence = durableEventSequence(row.event);
    if (identity && this.seenEventIds.has(identity)) return false;
    if (sequence !== null && this.cursor !== null && sequence < this.cursor && !this.rowsByKey.has(row.renderKey)) return false;
    if (identity) this.seenEventIds.add(identity);
    if (sequence !== null) this.cursor = this.cursor === null ? sequence : Math.max(this.cursor, sequence);
    if (!this.firstSeen.has(row.renderKey)) this.firstSeen.set(row.renderKey, this.arrival++);
    this.rowsByKey.set(row.renderKey, row);
    return true;
  }

  ingestMany(rows: readonly PiRowViewModel[]): number {
    return rows.reduce((count, row) => count + (this.ingest(row) ? 1 : 0), 0);
  }

  clear(): void {
    this.rowsByKey.clear();
    this.firstSeen.clear();
    this.seenEventIds.clear();
    this.cursor = null;
  }

  get lastSequence(): number | null {
    return this.cursor;
  }

  rows(view: ProjectionClass = 'conversation'): PiRowViewModel[] {
    return [...this.rowsByKey.values()]
      .filter((row) => view === 'raw' || row.projectionClass === view)
      .sort((left, right) => (left.sequence ?? Number.MAX_SAFE_INTEGER) - (right.sequence ?? Number.MAX_SAFE_INTEGER)
        || (this.firstSeen.get(left.renderKey) ?? 0) - (this.firstSeen.get(right.renderKey) ?? 0));
  }

  allRows(): PiRowViewModel[] {
    return this.rows('raw');
  }
}
