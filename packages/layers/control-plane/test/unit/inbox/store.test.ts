import { vi } from 'vitest';

vi.unmock('node:fs');

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SqliteInboxStore } from '../../../src/inbox/store.js';

describe('SqliteInboxStore', () => {
  let tempDir: string;
  let store: SqliteInboxStore | undefined;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'narada-inbox-store-'));
    store = new SqliteInboxStore(join(tempDir, '.ai', 'inbox.db'));
  });

  afterEach(() => {
    store?.close();
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('inserts, lists, reads, and promotes envelopes without source or payload drift', () => {
    const payload = { hostname: 'desktop-sunroom-2', computer_name: 'DESKTOP-SUNROOM' };
    const inserted = store!.insert({
      envelope_id: 'env_1',
      received_at: '2026-04-26T22:30:00.000Z',
      source: { kind: 'diagnostic', ref: 'site-doctor:desktop-sunroom-2' },
      kind: 'observation',
      authority: { level: 'system_observed' },
      payload,
    });

    expect(inserted.status).toBe('received');
    expect(store!.list({ limit: 10 })).toHaveLength(1);
    expect(store!.get('env_1')?.payload).toEqual(payload);

    const promoted = store!.promote('env_1', {
      target_kind: 'task',
      target_ref: 'task:pc-site-identity-policy',
      promoted_at: '2026-04-26T22:31:00.000Z',
      promoted_by: 'operator',
    });

    expect(promoted.status).toBe('promoted');
    expect(promoted.source).toEqual(inserted.source);
    expect(promoted.payload).toEqual(payload);
    expect(store!.list({ status: 'promoted', limit: 10 })).toHaveLength(1);
  });

  it('archives envelopes without marking them promoted', () => {
    store!.insert({
      envelope_id: 'env_archive',
      received_at: '2026-04-26T22:32:00.000Z',
      source: { kind: 'cli', ref: 'manual' },
      kind: 'observation',
      authority: { level: 'user_statement' },
      payload: { note: 'No follow-up needed' },
    });

    const archived = store!.archive('env_archive', {
      target_kind: 'archive',
      target_ref: 'archive:env_archive',
      promoted_at: '2026-04-26T22:33:00.000Z',
      promoted_by: 'operator',
      enactment_status: 'recorded',
    });

    expect(archived.status).toBe('archived');
    expect(archived.promotion?.target_kind).toBe('archive');
    expect(store!.list({ status: 'archived', limit: 10 })).toHaveLength(1);
    expect(store!.list({ status: 'received', limit: 10 })).toHaveLength(0);
  });

  it('claims and releases received envelopes', () => {
    store!.insert({
      envelope_id: 'env_claim',
      received_at: '2026-04-26T22:34:00.000Z',
      source: { kind: 'cli', ref: 'manual' },
      kind: 'task_candidate',
      authority: { level: 'operator_confirmed' },
      payload: { title: 'Claim me' },
    });

    const claimed = store!.claim('env_claim', {
      handled_by: 'architect',
      claimed_at: '2026-04-26T22:35:00.000Z',
    });

    expect(claimed.status).toBe('handling');
    expect(claimed.handling?.handled_by).toBe('architect');
    expect(() => store!.claim('env_claim', {
      handled_by: 'a2',
      claimed_at: '2026-04-26T22:36:00.000Z',
    })).toThrow(/not claimable/);

    const released = store!.release('env_claim', 'architect');
    expect(released.status).toBe('received');
    expect(released.handling).toBeUndefined();
  });
});
