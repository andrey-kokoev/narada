import { mkdtemp, mkdir, readFile, symlink, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildSiteTarget, buildUserTarget, loadPolicy, writePolicy } from '../src/policy.js';
import { LocalHistoryStore } from '../src/store.js';
import { runHistoryDaemon, stopHistoryDaemon, withHistoryOwnerLock } from '../src/daemon.js';

async function enabledSite(name: string): Promise<{ root: string; target: ReturnType<typeof buildSiteTarget> }> {
  const root = await mkdtemp(join(tmpdir(), `narada-history-${name}-`));
  const target = buildSiteTarget({ siteRoot: root, siteId: name });
  await writePolicy(target, { enabled: true });
  return { root, target };
}

describe('Site-owned local history', () => {
  it('captures immutable deduplicated snapshots and tombstones deletes', async () => {
    const { root, target } = await enabledSite('alpha');
    const file = join(root, 'notes.txt');
    await writeFile(file, 'one\n');
    const policy = await loadPolicy(target);
    const store = await LocalHistoryStore.open({ target, policy: policy! });

    const first = await store.captureFile('notes.txt', 'create');
    const duplicate = await store.captureFile('notes.txt', 'modify');
    await writeFile(file, 'two\n');
    const second = await store.captureFile('notes.txt', 'modify');
    expect(first.status).toBe('captured');
    expect(duplicate.status).toBe('deduplicated');
    expect(second.status).toBe('captured');
    expect(store.listSnapshots('notes.txt')).toHaveLength(2);

    const projection = await store.projectMetadata(root);
    const projectionText = await readFile(projection, 'utf8');
    expect(projectionText).toContain('"content_included": false');
    expect(projectionText).not.toContain('two\\n');

    try {
      await symlink(file, join(root, 'alias.txt'));
      expect((await store.captureFile('alias.txt')).status).toBe('not_admitted');
    } catch (error) {
      expect((error as NodeJS.ErrnoException).code).toBe('EPERM');
    }

    await unlink(file);
    expect((await store.captureFile('notes.txt', 'delete')).status).toBe('tombstone');
    await writeFile(join(root, 'renamed.txt'), 'two\n');
    const renamed = await store.captureFile('renamed.txt', 'create');
    expect(store.listSnapshots('renamed.txt')[0]?.event_kind).toBe('rename');
    expect(renamed.status).toBe('captured');
    expect(store.listSnapshots('renamed.txt')[0]?.git_context).toEqual({ renamed_from: 'notes.txt' });
    store.close();
  });

  it('keeps Site stores isolated and excludes secrets', async () => {
    const first = await enabledSite('first');
    const second = await enabledSite('second');
    await mkdir(join(first.root, 'src'), { recursive: true });
    await writeFile(join(first.root, 'src', 'a.ts'), 'export const a = 1;\n');
    await writeFile(join(first.root, '.env'), 'TOKEN=do-not-capture\n');
    await writeFile(join(first.root, 'root.pem'), 'PRIVATE KEY\n');
    await writeFile(join(first.root, '.narada', 'probe.txt'), 'authority\n');
    const firstStore = await LocalHistoryStore.open({ target: first.target, policy: (await loadPolicy(first.target))! });
    const secondStore = await LocalHistoryStore.open({ target: second.target, policy: (await loadPolicy(second.target))! });
    await firstStore.scanOnce();
    expect(firstStore.listFiles()).toHaveLength(1);
    expect(firstStore.listFiles()[0]?.relative_path).toBe('src/a.ts');
    expect((await firstStore.captureFile('.narada/probe.txt')).reason).toBe('authority_root_refused');
    expect(secondStore.listFiles()).toHaveLength(0);
    firstStore.close();
    secondStore.close();
  });

  it('recovers a stale owner lock and protects pinned snapshots from quota GC', async () => {
    const { root, target } = await enabledSite('quota');
    await writePolicy(target, { enabled: true, quota_bytes: 4 });
    await mkdir(target.storeRoot, { recursive: true });
    await writeFile(join(target.storeRoot, 'owner.lock'), `${JSON.stringify({
      schema: 'narada.local_work_history.owner_lock.v1',
      owner_id: 'stale-owner',
      pid: 999999999,
      started_at: new Date(0).toISOString(),
      heartbeat_at: new Date(0).toISOString(),
    })}\n`);
    const file = join(root, 'quota.txt');
    await writeFile(file, 'one\n');
    await withHistoryOwnerLock(target, async () => {
      const policy = (await loadPolicy(target))!;
      const store = await LocalHistoryStore.open({ target, policy });
      const first = await store.captureFile('quota.txt', 'create');
      store.pin(first.snapshot_id!, true);
      await writeFile(file, 'two\n');
      await store.captureFile('quota.txt', 'modify');
      expect(store.listSnapshots('quota.txt')).toHaveLength(2);
      store.close();
    });
  });

  it('uses a separate User Site store for a non-Site root', async () => {
    const userSiteRoot = await mkdtemp(join(tmpdir(), 'narada-history-user-site-'));
    const workspaceRoot = await mkdtemp(join(tmpdir(), 'narada-history-unregistered-'));
    const target = buildUserTarget({ userSiteRoot, workspaceRoot });
    await writePolicy(target, { enabled: true });
    const secondWorkspaceRoot = await mkdtemp(join(tmpdir(), 'narada-history-unregistered-second-'));
    const secondTarget = buildUserTarget({ userSiteRoot, workspaceRoot: secondWorkspaceRoot });
    await writePolicy(secondTarget, { enabled: true });
    expect(secondTarget.policyPath).not.toBe(target.policyPath);
    expect((await loadPolicy(target))?.workspace_root).toBe(workspaceRoot);
    const file = join(workspaceRoot, 'scratch.txt');
    await writeFile(file, 'scratch\n');
    const policy = (await loadPolicy(target))!;
    const store = await LocalHistoryStore.open({ target, policy });
    const captured = await store.captureFile('scratch.txt', 'create');
    expect(captured.status).toBe('captured');
    expect(target.storeRoot.startsWith(userSiteRoot)).toBe(true);
    const projection = await store.projectMetadata(userSiteRoot);
    expect((await readFile(projection, 'utf8'))).toContain('"content_included": false');
    store.close();
  });

  it('requires explicit confirmation and force for stale overwrite, preserving rollback evidence', async () => {
    const { root, target } = await enabledSite('restore');
    const file = join(root, 'restore.txt');
    await writeFile(file, 'original\n');
    const policy = (await loadPolicy(target))!;
    const store = await LocalHistoryStore.open({ target, policy });
    const snapshot = await store.captureFile('restore.txt', 'create');
    expect((await store.restore(snapshot.snapshot_id!, { confirm: false, force: false })).status).toBe('refused');
    await writeFile(file, 'changed\n');
    expect((await store.restore(snapshot.snapshot_id!, { confirm: true, force: false })).reason).toBe('history_restore_stale_target_requires_force');
    const restored = await store.restore(snapshot.snapshot_id!, { confirm: true, force: true });
    expect(restored.status).toBe('restored');
    expect(restored.rollback_snapshot_id).toBeTruthy();
    expect(await readFile(file, 'utf8')).toBe('original\n');
    store.close();
  });

  it('runs one supervised scan and leaves a stopped health record', async () => {
    const { root, target } = await enabledSite('daemon');
    await writeFile(join(root, 'daemon.txt'), 'daemon\n');
    const policy = (await loadPolicy(target))!;
    await runHistoryDaemon({ target, policy, once: true });
    const store = await LocalHistoryStore.open({ target, policy });
    const status = await store.status();
    expect(status.watcher.state).toBe('stopped');
    expect(status.counts.active_files).toBe(1);
    expect(await stopHistoryDaemon(target)).toEqual({ status: 'not_running', reason: 'daemon_record_missing' });
    store.close();
  });

  it('opens the Site store while holding its owner lock', async () => {
    const { target } = await enabledSite('locked');
    const policy = (await loadPolicy(target))!;
    await withHistoryOwnerLock(target, async () => {
      const store = await LocalHistoryStore.open({ target, policy });
      store.close();
    });
  });
});
