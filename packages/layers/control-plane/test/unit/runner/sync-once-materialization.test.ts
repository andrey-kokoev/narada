import { describe, expect, it } from 'vitest';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DefaultSyncRunner } from '../../../src/runner/sync-once.js';
import { FileApplyLogStore } from '../../../src/persistence/apply-log.js';
import { FileCursorStore } from '../../../src/persistence/cursor.js';
import type { Source, SourceBatch, SourceRecord } from '../../../src/types/source.js';

class ArraySource implements Source {
  readonly sourceId = 'mail-source';

  constructor(private readonly records: SourceRecord[]) {}

  async pull(checkpoint?: string | null): Promise<SourceBatch> {
    return {
      records: this.records,
      priorCheckpoint: checkpoint ?? null,
      nextCheckpoint: 'cursor-after',
      hasMore: false,
      fetchedAt: '2026-05-08T00:00:00.000Z',
    };
  }
}

function makeRecord(recordId: string): SourceRecord {
  return {
    recordId,
    payload: {
      event_kind: 'upsert',
      message_id: recordId,
      payload: {
        message_id: recordId,
        folder_refs: ['inbox'],
      },
    },
    provenance: {
      sourceId: 'mail-source',
      observedAt: '2026-05-08T00:00:00.000Z',
    },
  };
}

describe('DefaultSyncRunner materialization gate', () => {
  it('marks filtered records applied without projecting or ingesting facts', async () => {
    const rootDir = await mkdtemp(join(tmpdir(), 'narada-sync-materialization-'));
    const records = [makeRecord('allowed'), makeRecord('filtered')];
    const projected: string[] = [];
    const ingested: string[] = [];
    const applyLogStore = new FileApplyLogStore({ rootDir });

    const runner = new DefaultSyncRunner({
      rootDir,
      source: new ArraySource(records),
      cursorStore: new FileCursorStore({ rootDir, scopeId: 'test-scope' }),
      applyLogStore,
      shouldMaterializeRecord: (record) => record.recordId !== 'filtered',
      projector: {
        applyRecord: async (record) => {
          projected.push(record.recordId);
          return {
            event_id: record.recordId,
            message_id: record.recordId,
            applied: true,
            dirty_views: { by_thread: [], by_folder: [], unread_changed: false, flagged_changed: false },
          };
        },
      },
      factStore: {
        ingest: (fact) => {
          const payload = JSON.parse(fact.payload_json) as { record_id: string };
          ingested.push(payload.record_id);
        },
      },
    });

    const result = await runner.syncOnce();

    expect(result.status).toBe('success');
    expect(result.event_count).toBe(2);
    expect(result.applied_count).toBe(1);
    expect(result.skipped_count).toBe(1);
    expect(result.filtered_count).toBe(1);
    expect(projected).toEqual(['allowed']);
    expect(ingested).toEqual(['allowed']);
    expect(await applyLogStore.hasApplied('filtered')).toBe(true);
  });

  it('fails closed before source pull when the sync lock cannot be acquired', async () => {
    const rootDir = await mkdtemp(join(tmpdir(), 'narada-sync-lock-refusal-'));
    let pulls = 0;
    const source = new ArraySource([makeRecord('must-not-pull')]);
    const runner = new DefaultSyncRunner({
      rootDir,
      source: {
        sourceId: source.sourceId,
        pull: async (checkpoint) => {
          pulls += 1;
          return await source.pull(checkpoint);
        },
      },
      cursorStore: new FileCursorStore({ rootDir, scopeId: 'test-scope' }),
      applyLogStore: new FileApplyLogStore({ rootDir }),
      projector: {
        applyRecord: async () => {
          throw new Error('projector_must_not_run');
        },
      },
      acquireLock: async () => {
        throw new Error('fixture_lock_held');
      },
    });

    const result = await runner.syncOnce();

    expect(result.status).not.toBe('success');
    expect(pulls).toBe(0);
    expect(result.errors.some((error) => error.actionTaken === 'abort')).toBe(true);
  });

  it('does not project or advance the cursor when required fact persistence fails', async () => {
    const rootDir = await mkdtemp(join(tmpdir(), 'narada-sync-required-fact-'));
    const cursorStore = new FileCursorStore({ rootDir, scopeId: 'test-scope' });
    let projected = false;
    const runner = new DefaultSyncRunner({
      rootDir,
      source: new ArraySource([makeRecord('fact-fails')]),
      cursorStore,
      applyLogStore: new FileApplyLogStore({ rootDir }),
      projector: {
        applyRecord: async (record) => {
          projected = true;
          return {
            event_id: record.recordId,
            message_id: record.recordId,
            applied: true,
            dirty_views: { by_thread: [], by_folder: [], unread_changed: false, flagged_changed: false },
          };
        },
      },
      factStore: {
        ingest: () => {
          throw new Error('fixture_fact_store_unavailable');
        },
      },
      requireFactPersistence: true,
    });

    const result = await runner.syncOnce();

    expect(result.status).not.toBe('success');
    expect(projected).toBe(false);
    expect(await cursorStore.read()).toBeNull();
  });
});
