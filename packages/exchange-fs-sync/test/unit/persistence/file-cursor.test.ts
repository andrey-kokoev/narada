import { describe, expect, it } from 'vitest';
import { FileCursorStore } from '../../../src/persistence/cursor.js';
import { vol } from 'memfs';

describe('FileCursorStore', () => {
  it('reads null when cursor does not exist', async () => {
    const store = new FileCursorStore({
      rootDir: '/test/data',
      mailboxId: 'test@example.com',
    });

    const cursor = await store.read();
    expect(cursor).toBeNull();
  });

  it('commits and reads cursor', async () => {
    vol.fromJSON({});

    const store = new FileCursorStore({
      rootDir: '/test/data',
      mailboxId: 'test@example.com',
    });

    await store.commit('test-cursor-123');
    const cursor = await store.read();

    expect(cursor).toBe('test-cursor-123');
  });

  it('overwrites existing cursor', async () => {
    vol.fromJSON({
      '/test/data/state/cursor.json': JSON.stringify({ cursor: 'old-cursor' }),
    });

    const store = new FileCursorStore({
      rootDir: '/test/data',
      mailboxId: 'test@example.com',
    });

    await store.commit('new-cursor');
    const cursor = await store.read();

    expect(cursor).toBe('new-cursor');
  });

  it('stores cursor in correct location', async () => {
    vol.fromJSON({});

    const store = new FileCursorStore({
      rootDir: '/test/data',
      mailboxId: 'test@example.com',
    });

    await store.commit('cursor-data');

    const stored = vol.readFileSync('/test/data/state/cursor.json', 'utf8');
    expect(JSON.parse(stored)).toEqual({ cursor: 'cursor-data' });
  });

  it('handles concurrent writes gracefully', async () => {
    vol.fromJSON({});

    const store = new FileCursorStore({
      rootDir: '/test/data',
      mailboxId: 'test@example.com',
    });

    // Simulate concurrent writes
    await Promise.all([
      store.commit('cursor-1'),
      store.commit('cursor-2'),
      store.commit('cursor-3'),
    ]);

    // Final cursor should be one of the written values
    const cursor = await store.read();
    expect(['cursor-1', 'cursor-2', 'cursor-3']).toContain(cursor);
  });
});
