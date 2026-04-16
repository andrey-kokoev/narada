import { describe, expect, it, beforeEach } from 'vitest';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MultiSourceSyncRunner } from '../../../src/runner/multi-source-sync.js';
import { FileCursorStore } from '../../../src/persistence/cursor.js';
import { FileApplyLogStore } from '../../../src/persistence/apply-log.js';
import type { Source, SourceBatch, SourceRecord } from '../../../src/types/source.js';

function makeRecord(
  recordId: string,
  observedAt: string,
  payload: unknown,
  sourceId: string,
): SourceRecord {
  return {
    recordId,
    payload,
    provenance: { sourceId, observedAt },
  };
}

class ArraySource implements Source {
  readonly sourceId: string;
  private callLog: { checkpoint: string | null }[] = [];

  constructor(
    sourceId: string,
    private records: SourceRecord[],
    private nextCheckpoint?: string,
  ) {
    this.sourceId = sourceId;
  }

  getCalls() {
    return this.callLog;
  }

  async pull(checkpoint?: string | null): Promise<SourceBatch> {
    this.callLog.push({ checkpoint: checkpoint ?? null });
    return {
      records: this.records,
      priorCheckpoint: checkpoint ?? null,
      nextCheckpoint: this.nextCheckpoint,
      hasMore: false,
      fetchedAt: new Date().toISOString(),
    };
  }
}

describe('MultiSourceSyncRunner', () => {
  beforeEach(() => {
    // Isolation per test via tmp dirs created inside each test
  });

  async function setupRunner(sources: Source[], rootDir: string) {
    const cursorStore = new FileCursorStore({ rootDir, mailboxId: 'test-scope' });
    const applyLogStore = new FileApplyLogStore({ rootDir });

    const projector = {
      applyRecord: async (record: SourceRecord) => ({
        applied: true,
        dirty_views: {
          by_thread: [],
          by_folder: [],
          unread_changed: false,
          flagged_changed: false,
        },
      }),
    };

    const runner = new MultiSourceSyncRunner({
      rootDir,
      sources,
      cursorStore,
      applyLogStore,
      projector,
    });

    return { runner, cursorStore, applyLogStore };
  }

  it('syncs from a single source identically to DefaultSyncRunner', async () => {
    const rootDir = await mkdtemp(join(tmpdir(), 'exchange-fs-multi-sync-'));
    const records = [
      makeRecord('r1', '2024-01-01T00:00:00Z', { kind: 'test' }, 'src1'),
    ];
    const source = new ArraySource('src1', records, 'cursor-a');
    const { runner, cursorStore } = await setupRunner([source], rootDir);

    const result = await runner.syncOnce();

    expect(result.status).toBe('success');
    expect(result.event_count).toBe(1);
    expect(result.applied_count).toBe(1);
    expect(result.skipped_count).toBe(0);

    const rawCursor = await cursorStore.read();
    expect(rawCursor).toBe('cursor-a');
    expect(source.getCalls()).toEqual([{ checkpoint: null }]);
  });

  it('merges records from multiple sources sorted by observedAt', async () => {
    const rootDir = await mkdtemp(join(tmpdir(), 'exchange-fs-multi-sync-'));
    const sourceA = new ArraySource('srcA', [
      makeRecord('a2', '2024-01-01T00:00:03Z', { id: 'a2' }, 'srcA'),
      makeRecord('a1', '2024-01-01T00:00:01Z', { id: 'a1' }, 'srcA'),
    ], 'cA');

    const sourceB = new ArraySource('srcB', [
      makeRecord('b1', '2024-01-01T00:00:02Z', { id: 'b1' }, 'srcB'),
    ], 'cB');

    const appliedOrder: string[] = [];
    const cursorStore = new FileCursorStore({ rootDir, mailboxId: 'test-scope' });
    const applyLogStore = new FileApplyLogStore({ rootDir });

    const runner = new MultiSourceSyncRunner({
      rootDir,
      sources: [sourceA, sourceB],
      cursorStore,
      applyLogStore,
      projector: {
        applyRecord: async (record) => {
          appliedOrder.push(record.recordId);
          return {
            applied: true,
            dirty_views: { by_thread: [], by_folder: [], unread_changed: false, flagged_changed: false },
          };
        },
      },
    });

    const result = await runner.syncOnce();
    expect(result.status).toBe('success');
    expect(appliedOrder).toEqual(['a1', 'b1', 'a2']);
  });

  it('tie-breaks records with same observedAt by recordId', async () => {
    const rootDir = await mkdtemp(join(tmpdir(), 'exchange-fs-multi-sync-'));
    const sourceA = new ArraySource('srcA', [
      makeRecord('z-last', '2024-01-01T00:00:00Z', {}, 'srcA'),
      makeRecord('a-first', '2024-01-01T00:00:00Z', {}, 'srcA'),
    ], 'cA');

    const appliedOrder: string[] = [];
    const cursorStore = new FileCursorStore({ rootDir, mailboxId: 'test-scope' });
    const applyLogStore = new FileApplyLogStore({ rootDir });

    const runner = new MultiSourceSyncRunner({
      rootDir,
      sources: [sourceA],
      cursorStore,
      applyLogStore,
      projector: {
        applyRecord: async (record) => {
          appliedOrder.push(record.recordId);
          return {
            applied: true,
            dirty_views: { by_thread: [], by_folder: [], unread_changed: false, flagged_changed: false },
          };
        },
      },
    });

    await runner.syncOnce();
    expect(appliedOrder).toEqual(['a-first', 'z-last']);
  });

  it('passes per-source checkpoints on resume', async () => {
    const rootDir = await mkdtemp(join(tmpdir(), 'exchange-fs-multi-sync-'));
    const sourceA = new ArraySource('srcA', [makeRecord('a1', '2024-01-01T00:00:00Z', {}, 'srcA')], 'cA2');
    const sourceB = new ArraySource('srcB', [makeRecord('b1', '2024-01-01T00:00:00Z', {}, 'srcB')], 'cB2');

    const cursorStore = new FileCursorStore({ rootDir, mailboxId: 'test-scope' });
    // Seed a composite cursor
    await cursorStore.commit(JSON.stringify({ srcA: 'cA1', srcB: 'cB1' }));

    const applyLogStore = new FileApplyLogStore({ rootDir });
    const runner = new MultiSourceSyncRunner({
      rootDir,
      sources: [sourceA, sourceB],
      cursorStore,
      applyLogStore,
      projector: {
        applyRecord: async () => ({
          applied: true,
          dirty_views: { by_thread: [], by_folder: [], unread_changed: false, flagged_changed: false },
        }),
      },
    });

    await runner.syncOnce();

    expect(sourceA.getCalls()).toEqual([{ checkpoint: 'cA1' }]);
    expect(sourceB.getCalls()).toEqual([{ checkpoint: 'cB1' }]);

    const rawCursor = await cursorStore.read();
    expect(JSON.parse(rawCursor!)).toEqual({ srcA: 'cA2', srcB: 'cB2' });
  });

  it('deduplicates records across sources using apply-log', async () => {
    const rootDir = await mkdtemp(join(tmpdir(), 'exchange-fs-multi-sync-'));
    const sharedRecord = makeRecord('shared-1', '2024-01-01T00:00:00Z', { data: 1 }, 'srcA');
    const sourceA = new ArraySource('srcA', [sharedRecord], 'cA');
    const sourceB = new ArraySource('srcB', [{ ...sharedRecord, provenance: { sourceId: 'srcB', observedAt: '2024-01-01T00:00:00Z' } }], 'cB');

    const { runner, applyLogStore } = await setupRunner([sourceA, sourceB], rootDir);

    const result = await runner.syncOnce();
    expect(result.status).toBe('success');
    expect(result.applied_count).toBe(1);
    expect(result.skipped_count).toBe(1);

    const wasApplied = await applyLogStore.hasApplied('shared-1');
    expect(wasApplied).toBe(true);
  });

  it('commits composite cursor when multiple sources present', async () => {
    const rootDir = await mkdtemp(join(tmpdir(), 'exchange-fs-multi-sync-'));
    const sourceA = new ArraySource('srcA', [], 'cA');
    const sourceB = new ArraySource('srcB', [], 'cB');

    const { runner, cursorStore } = await setupRunner([sourceA, sourceB], rootDir);

    const result = await runner.syncOnce();
    expect(result.status).toBe('success');
    expect(result.prior_cursor).toBeUndefined();
    // Note: next_cursor should be the composite checkpoint even with 0 events
    expect(result.next_cursor).toBe(JSON.stringify({ srcA: 'cA', srcB: 'cB' }));

    const rawCursor = await cursorStore.read();
    expect(JSON.parse(rawCursor!)).toEqual({ srcA: 'cA', srcB: 'cB' });
  });

  it('reports prior cursor correctly when resuming composite', async () => {
    const rootDir = await mkdtemp(join(tmpdir(), 'exchange-fs-multi-sync-'));
    const cursorStore = new FileCursorStore({ rootDir, mailboxId: 'test-scope' });
    await cursorStore.commit(JSON.stringify({ srcA: 'oldA', srcB: 'oldB' }));

    const sourceA = new ArraySource('srcA', [], 'newA');
    const sourceB = new ArraySource('srcB', [], 'newB');

    const applyLogStore = new FileApplyLogStore({ rootDir });
    const runner = new MultiSourceSyncRunner({
      rootDir,
      sources: [sourceA, sourceB],
      cursorStore,
      applyLogStore,
      projector: {
        applyRecord: async () => ({
          applied: true,
          dirty_views: { by_thread: [], by_folder: [], unread_changed: false, flagged_changed: false },
        }),
      },
    });

    const result = await runner.syncOnce();
    expect(result.prior_cursor).toBe(JSON.stringify({ srcA: 'oldA', srcB: 'oldB' }));
    expect(result.next_cursor).toBe(JSON.stringify({ srcA: 'newA', srcB: 'newB' }));
  });

  it('handles source errors by aborting and reporting fetch error', async () => {
    const rootDir = await mkdtemp(join(tmpdir(), 'exchange-fs-multi-sync-'));
    const goodSource = new ArraySource('good', [makeRecord('g1', '2024-01-01T00:00:00Z', {}, 'good')], 'cG');
    const badSource: Source = {
      sourceId: 'bad',
      async pull() {
        throw new Error('network failure');
      },
    };

    const { runner } = await setupRunner([goodSource, badSource], rootDir);
    const result = await runner.syncOnce();

    expect(result.status).toBe('retryable_failure');
    expect(result.errors.length).toBeGreaterThanOrEqual(1);
    expect(result.errors.some((e) => e.phase === 'fetch')).toBe(true);
  });

  it('does not commit cursor when processing throws and continueOnError is false', async () => {
    const rootDir = await mkdtemp(join(tmpdir(), 'exchange-fs-multi-sync-'));
    const cursorStore = new FileCursorStore({ rootDir, mailboxId: 'test-scope' });
    const source = new ArraySource('src1', [makeRecord('r1', '2024-01-01T00:00:00Z', {}, 'src1')], 'c1');
    const applyLogStore = new FileApplyLogStore({ rootDir });

    const runner = new MultiSourceSyncRunner({
      rootDir,
      sources: [source],
      cursorStore,
      applyLogStore,
      projector: {
        applyRecord: async () => {
          throw new Error('apply boom');
        },
      },
    });

    const result = await runner.syncOnce();
    expect(result.status).toBe('retryable_failure');

    const rawCursor = await cursorStore.read();
    expect(rawCursor).toBeNull();
  });

  it('ingests facts when factStore is provided', async () => {
    const rootDir = await mkdtemp(join(tmpdir(), 'exchange-fs-multi-sync-'));
    const source = new ArraySource('src1', [makeRecord('r1', '2024-01-01T00:00:00Z', { kind: 'test' }, 'src1')], 'c1');

    const ingested: { recordId: string; checkpoint: string | null }[] = [];
    const factStore = {
      ingest: (fact: { payload_json?: string; provenance?: { source_cursor?: string | null } }) => {
        const payload = fact.payload_json ? (JSON.parse(fact.payload_json) as { record_id?: string }) : {};
        ingested.push({
          recordId: payload.record_id ?? '',
          checkpoint: fact.provenance?.source_cursor ?? null,
        });
      },
    };

    const cursorStore = new FileCursorStore({ rootDir, mailboxId: 'test-scope' });
    const applyLogStore = new FileApplyLogStore({ rootDir });
    const runner = new MultiSourceSyncRunner({
      rootDir,
      sources: [source],
      cursorStore,
      applyLogStore,
      projector: {
        applyRecord: async () => ({
          applied: true,
          dirty_views: { by_thread: [], by_folder: [], unread_changed: false, flagged_changed: false },
        }),
      },
      factStore: factStore as unknown as Parameters<typeof MultiSourceSyncRunner>[0]['factStore'],
    });

    await runner.syncOnce();
    expect(ingested.length).toBe(1);
    expect(ingested[0]!.recordId).toBe('r1');
    expect(ingested[0]!.checkpoint).toBe('c1');
  });

  it('rebuilds views when rebuildViewsAfterSync is true', async () => {
    const rootDir = await mkdtemp(join(tmpdir(), 'exchange-fs-multi-sync-'));
    const source = new ArraySource('src1', [], 'c1');

    let rebuilt = false;
    const cursorStore = new FileCursorStore({ rootDir, mailboxId: 'test-scope' });
    const applyLogStore = new FileApplyLogStore({ rootDir });
    const runner = new MultiSourceSyncRunner({
      rootDir,
      sources: [source],
      cursorStore,
      applyLogStore,
      projector: {
        applyRecord: async () => ({
          applied: true,
          dirty_views: { by_thread: [], by_folder: [], unread_changed: false, flagged_changed: false },
        }),
      },
      rebuildViewsAfterSync: true,
      rebuildViews: async () => {
        rebuilt = true;
      },
    });

    const result = await runner.syncOnce();
    expect(result.status).toBe('success');
    expect(rebuilt).toBe(true);
  });
});
