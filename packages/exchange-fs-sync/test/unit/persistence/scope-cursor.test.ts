import { describe, expect, it, beforeEach } from 'vitest';
import { vol } from 'memfs';
import { ScopeCursorStore } from '../../../src/persistence/scope-cursor.js';
import { FileCursorStore } from '../../../src/persistence/cursor.js';

describe('ScopeCursorStore', () => {
  beforeEach(() => {
    vol.reset();
  });

  it('returns empty object when no cursor exists', async () => {
    const inner = new FileCursorStore({ rootDir: '/test/data', scopeId: 'm1' });
    const store = new ScopeCursorStore({ inner, defaultSourceId: 'graph' });

    const all = await store.readAll();
    expect(all).toEqual({});
  });

  it('reads legacy plain-string cursor as default source checkpoint', async () => {
    vol.fromJSON({
      '/test/data/state/cursor.json': JSON.stringify({
        scope_id: 'm1',
        committed_cursor: 'legacy-cursor-123',
        committed_at: new Date().toISOString(),
      }),
    });

    const inner = new FileCursorStore({ rootDir: '/test/data', scopeId: 'm1' });
    const store = new ScopeCursorStore({ inner, defaultSourceId: 'graph' });

    const all = await store.readAll();
    expect(all).toEqual({ graph: 'legacy-cursor-123' });
  });

  it('reads composite cursor from JSON object', async () => {
    vol.fromJSON({
      '/test/data/state/cursor.json': JSON.stringify({
        scope_id: 'm1',
        committed_cursor: JSON.stringify({ graph: 'c1', timer: 'c2' }),
        committed_at: new Date().toISOString(),
      }),
    });

    const inner = new FileCursorStore({ rootDir: '/test/data', scopeId: 'm1' });
    const store = new ScopeCursorStore({ inner, defaultSourceId: 'graph' });

    const all = await store.readAll();
    expect(all).toEqual({ graph: 'c1', timer: 'c2' });
  });

  it('commits composite cursor as JSON when multiple sources present', async () => {
    vol.fromJSON({});
    const inner = new FileCursorStore({ rootDir: '/test/data', scopeId: 'm1' });
    const store = new ScopeCursorStore({ inner, defaultSourceId: 'graph' });

    await store.commitAll({ graph: 'g1', timer: 't1' });

    const all = await store.readAll();
    expect(all).toEqual({ graph: 'g1', timer: 't1' });

    const raw = await inner.read();
    expect(raw).toBe(JSON.stringify({ graph: 'g1', timer: 't1' }));
  });

  it('commits single non-default source as JSON object', async () => {
    vol.fromJSON({});
    const inner = new FileCursorStore({ rootDir: '/test/data', scopeId: 'm1' });
    const store = new ScopeCursorStore({ inner, defaultSourceId: 'graph' });

    await store.commitAll({ timer: 't1' });

    const raw = await inner.read();
    expect(raw).toBe(JSON.stringify({ timer: 't1' }));
  });

  it('commits single default source as plain string for backward compat', async () => {
    vol.fromJSON({});
    const inner = new FileCursorStore({ rootDir: '/test/data', scopeId: 'm1' });
    const store = new ScopeCursorStore({ inner, defaultSourceId: 'graph' });

    await store.commitAll({ graph: 'g1' });

    const raw = await inner.read();
    expect(raw).toBe('g1');
  });

  it('merges new checkpoints with existing ones', async () => {
    vol.fromJSON({
      '/test/data/state/cursor.json': JSON.stringify({
        scope_id: 'm1',
        committed_cursor: JSON.stringify({ graph: 'old-graph', timer: 'old-timer' }),
        committed_at: new Date().toISOString(),
      }),
    });

    const inner = new FileCursorStore({ rootDir: '/test/data', scopeId: 'm1' });
    const store = new ScopeCursorStore({ inner, defaultSourceId: 'graph' });

    await store.commitAll({ graph: 'new-graph' });

    const all = await store.readAll();
    expect(all).toEqual({ graph: 'new-graph', timer: 'old-timer' });
  });

  it('removes a source checkpoint when explicitly set to null', async () => {
    vol.fromJSON({
      '/test/data/state/cursor.json': JSON.stringify({
        scope_id: 'm1',
        committed_cursor: JSON.stringify({ graph: 'g1', timer: 't1' }),
        committed_at: new Date().toISOString(),
      }),
    });

    const inner = new FileCursorStore({ rootDir: '/test/data', scopeId: 'm1' });
    const store = new ScopeCursorStore({ inner, defaultSourceId: 'graph' });

    await store.commitAll({ timer: null });

    const all = await store.readAll();
    expect(all).toEqual({ graph: 'g1' });
  });

  it('ignores empty string checkpoints', async () => {
    vol.fromJSON({});
    const inner = new FileCursorStore({ rootDir: '/test/data', scopeId: 'm1' });
    const store = new ScopeCursorStore({ inner, defaultSourceId: 'graph' });

    await store.commitAll({ graph: 'g1', timer: '' });

    const all = await store.readAll();
    expect(all).toEqual({ graph: 'g1' });
  });

  it('returns empty object and does not throw on corrupted JSON cursor', async () => {
    vol.fromJSON({
      '/test/data/state/cursor.json': JSON.stringify({
        scope_id: 'm1',
        committed_cursor: '{not valid json}',
        committed_at: new Date().toISOString(),
      }),
    });

    const inner = new FileCursorStore({ rootDir: '/test/data', scopeId: 'm1' });
    const store = new ScopeCursorStore({ inner, defaultSourceId: 'graph' });

    const all = await store.readAll();
    expect(all).toEqual({});
  });

  it('reset writes empty JSON object', async () => {
    vol.fromJSON({});
    const inner = new FileCursorStore({ rootDir: '/test/data', scopeId: 'm1' });
    const store = new ScopeCursorStore({ inner, defaultSourceId: 'graph' });

    await store.commitAll({ graph: 'g1' });
    await store.reset();

    const all = await store.readAll();
    expect(all).toEqual({});

    const raw = await inner.read();
    expect(raw).toBe('{}');
  });
});
