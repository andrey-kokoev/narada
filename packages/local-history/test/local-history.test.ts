import { mkdtemp, mkdir, readFile, rename, rm, stat, symlink, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildSiteTarget, buildUserTarget, defaultPolicy, loadPolicy, loadUserHistoryDefaults, validatePolicy, writePolicy } from '../src/policy.js';
import { LocalHistoryStore } from '../src/store.js';
import { runHistoryDaemon, stopHistoryDaemon, withHistoryOwnerLock } from '../src/daemon.js';

async function enabledSite(name: string): Promise<{ root: string; target: ReturnType<typeof buildSiteTarget> }> {
  const root = await mkdtemp(join(tmpdir(), `narada-history-${name}-`));
  const target = buildSiteTarget({ siteRoot: root, siteId: name });
  await writePolicy(target, { enabled: true });
  return { root, target };
}

function delay(ms: number): Promise<void> {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
}

describe('Site-owned local history', () => {
  it('enforces opt-in at the store mutation boundary', async () => {
    const root = await mkdtemp(join(tmpdir(), 'narada-history-disabled-'));
    const target = buildSiteTarget({ siteRoot: root, siteId: 'disabled' });
    const store = await LocalHistoryStore.open({ target, policy: defaultPolicy(target) });
    await writeFile(join(root, 'disabled.txt'), 'must not capture\n');
    await expect(store.captureFile('disabled.txt')).rejects.toMatchObject({ code: 'local_history_disabled' });
    store.close();
  });

  it('reports corrupt daemon health metadata instead of treating it as absent', async () => {
    const { target } = await enabledSite('corrupt-health');
    const store = await LocalHistoryStore.open({ target, policy: (await loadPolicy(target))! });
    await writeFile(join(target.storeRoot, 'health.json'), '{broken');
    await expect(store.status()).rejects.toMatchObject({ code: 'local_history_metadata_corrupt' });
    store.close();
  });

  it('retries a file after a transient capture skip', async () => {
    const { root, target } = await enabledSite('retry');
    const file = join(root, 'retry.txt');
    await writeFile(file, 'retry me\n');
    const policy = (await loadPolicy(target))!;
    policy.max_file_size_bytes = 1;
    const store = await LocalHistoryStore.open({ target, policy });
    expect((await store.scanOnce({ debounce_ms: 0 })).captured).toBe(0);
    store.policy.max_file_size_bytes = 100;
    expect((await store.scanOnce({ debounce_ms: 0 })).captured).toBe(1);
    store.close();
  });

  it('keeps read-only inspection from creating persistent store state', async () => {
    const root = await mkdtemp(join(tmpdir(), 'narada-history-read-only-'));
    const target = buildSiteTarget({ siteRoot: root, siteId: 'read-only' });
    const store = await LocalHistoryStore.open({ target, policy: defaultPolicy(target), readOnly: true });
    expect((await store.status()).counts.snapshots).toBe(0);
    store.close();
    await expect(stat(join(target.storeRoot, 'history.sqlite'))).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('rejects missing files below a reparse-point parent', async () => {
    const { root, target } = await enabledSite('reparse-parent');
    const outside = await mkdtemp(join(tmpdir(), 'narada-history-outside-'));
    const linked = join(root, 'linked');
    try {
      await symlink(outside, linked, 'junction');
    } catch (error) {
      expect((error as NodeJS.ErrnoException).code).toBe('EPERM');
      return;
    }
    const store = await LocalHistoryStore.open({ target, policy: (await loadPolicy(target))! });
    const result = await store.captureFile('linked/missing.txt', 'create');
    expect(result.status).toBe('not_admitted');
    expect(result.reason).toBe('symlink_or_reparse_point_refused');
    store.close();
  });

  it('keeps workspace identity and history policy across User Site root moves', async () => {
    const userSiteRoot = await mkdtemp(join(tmpdir(), 'narada-history-relocation-user-'));
    const workspaceRoot = await mkdtemp(join(tmpdir(), 'narada-history-relocation-root-'));
    const target = buildUserTarget({ userSiteRoot, workspaceRoot });
    await writePolicy(target, { enabled: true });
    const parent = await mkdtemp(join(tmpdir(), 'narada-history-relocation-parent-'));
    const movedRoot = join(parent, 'moved-root');
    await rename(workspaceRoot, movedRoot);
    const movedTarget = buildUserTarget({ userSiteRoot, workspaceRoot: movedRoot });
    expect(movedTarget.workspaceId).toBe(target.workspaceId);
    expect((await loadPolicy(movedTarget))?.workspace_root).toBe(movedRoot);
  });

  it('fails closed when the User Site relocation marker is corrupt', async () => {
    const userSiteRoot = await mkdtemp(join(tmpdir(), 'narada-history-corrupt-identity-user-'));
    const workspaceRoot = await mkdtemp(join(tmpdir(), 'narada-history-corrupt-identity-root-'));
    const target = buildUserTarget({ userSiteRoot, workspaceRoot });
    await writePolicy(target, { enabled: true });
    await writeFile(join(workspaceRoot, '.narada', 'local-history-workspace.json'), '{broken');
    expect(() => buildUserTarget({ userSiteRoot, workspaceRoot })).toThrow('local_history_workspace_identity_corrupt');
  });

  it('rejects schema-invalid policy values instead of coercing them', async () => {
    const root = await mkdtemp(join(tmpdir(), 'narada-history-policy-invalid-'));
    const target = buildSiteTarget({ siteRoot: root, siteId: 'invalid' });
    const policy = defaultPolicy(target);
    expect(() => validatePolicy({ ...policy, enabled: 'true' }, target)).toThrow('local_history_enabled_invalid');
    expect(() => validatePolicy({ ...policy, privacy_posture: 'unknown' }, target)).toThrow('local_history_privacy_posture_invalid');
    expect(() => validatePolicy({ ...policy, unexpected: true }, target)).toThrow('local_history_policy_unknown_field');
    expect(() => validatePolicy({ ...policy, roots: [''] }, target)).toThrow('local_history_root_not_relative');
  });

  it('loads User Site defaults as a creation template and keeps the privacy floor', async () => {
    const userSiteRoot = await mkdtemp(join(tmpdir(), 'narada-history-defaults-user-'));
    const root = await mkdtemp(join(tmpdir(), 'narada-history-defaults-site-'));
    try {
      await mkdir(join(userSiteRoot, 'config'), { recursive: true });
      await writeFile(join(userSiteRoot, 'config', 'local-history.defaults.json'), `${JSON.stringify({
        schema: 'narada.local_work_history.defaults.v1',
        roots: ['src'],
        privacy_posture: 'custom_exclusions',
        exclusions: ['scratch/**'],
        max_file_size_bytes: 1024,
        stable_read_attempts: 4,
      })}\n`);
      const defaults = await loadUserHistoryDefaults(userSiteRoot);
      const target = buildSiteTarget({ siteRoot: root, siteId: 'defaults' });
      const policy = defaultPolicy(target, defaults!);
      expect(policy.roots).toEqual(['src']);
      expect(policy.max_file_size_bytes).toBe(1024);
      expect(policy.stable_read_attempts).toBe(4);
      expect(policy.privacy_posture).toBe('custom_exclusions');
      expect(policy.exclusions).toContain('scratch/**');
      expect(policy.exclusions).toContain('.env');
      expect(policy.exclusions).not.toContain('**/dist/**');
    } finally {
      await Promise.all([rm(userSiteRoot, { recursive: true, force: true }), rm(root, { recursive: true, force: true })]);
    }
  });

  it('fails closed when the User Site defaults file is malformed', async () => {
    const userSiteRoot = await mkdtemp(join(tmpdir(), 'narada-history-invalid-defaults-user-'));
    try {
      await mkdir(join(userSiteRoot, 'config'), { recursive: true });
      await writeFile(join(userSiteRoot, 'config', 'local-history.defaults.json'), '{broken');
      await expect(loadUserHistoryDefaults(userSiteRoot)).rejects.toThrow('local_history_defaults_corrupt');
    } finally {
      await rm(userSiteRoot, { recursive: true, force: true });
    }
  });

  it('enforces mandatory privacy exclusions even for a hand-built custom policy', async () => {
    const root = await mkdtemp(join(tmpdir(), 'narada-history-privacy-floor-'));
    const target = buildSiteTarget({ siteRoot: root, siteId: 'privacy-floor' });
    await writeFile(join(root, '.env'), 'TOKEN=must-not-capture\n');
    const policy = { ...defaultPolicy(target, { privacy_posture: 'custom_exclusions' }), enabled: true, exclusions: [] };
    const store = await LocalHistoryStore.open({ target, policy });
    const result = await store.captureFile('.env', 'create');
    expect(result.status).toBe('not_admitted');
    expect(result.reason).toBe('path_excluded_by_policy');
    store.close();
  });

  it('waits for the configured quiet period before capturing a polled change', async () => {
    const { root, target } = await enabledSite('debounce');
    await writeFile(join(root, 'debounce.txt'), 'debounced\n');
    const store = await LocalHistoryStore.open({ target, policy: (await loadPolicy(target))! });
    expect((await store.scanOnce({ debounce_ms: 40 })).captured).toBe(0);
    await delay(60);
    expect((await store.scanOnce({ debounce_ms: 40 })).captured).toBe(1);
    store.close();
  });

  it('fails closed when the owner lock is malformed', async () => {
    const { target } = await enabledSite('corrupt-lock');
    await mkdir(target.storeRoot, { recursive: true });
    await writeFile(join(target.storeRoot, 'owner.lock'), '{broken');
    await expect(withHistoryOwnerLock(target, async () => undefined)).rejects.toMatchObject({ code: 'local_history_metadata_corrupt' });
  });

  it('reports a dead daemon as failed rather than running', async () => {
    const { target } = await enabledSite('stale-health');
    await mkdir(target.storeRoot, { recursive: true });
    await writeFile(join(target.storeRoot, 'daemon.json'), `${JSON.stringify({
      schema: 'narada.local_work_history.daemon.v1',
      owner_id: 'dead-daemon',
      pid: 999999999,
      started_at: new Date(0).toISOString(),
      health_path: target.storeRoot + '/health.json',
    })}\n`);
    await writeFile(join(target.storeRoot, 'health.json'), `${JSON.stringify({
      schema: 'narada.local_work_history.health.v1',
      state: 'running',
      pid: 999999999,
      started_at: new Date(0).toISOString(),
    })}\n`);
    const store = await LocalHistoryStore.open({ target, policy: (await loadPolicy(target))! });
    expect((await store.status()).watcher.state).toBe('failed');
    store.close();
  });

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
    await writeFile(join(root, 'same.txt'), 'two\n');
    await store.captureFile('same.txt', 'create');
    expect(first.status).toBe('captured');
    expect(duplicate.status).toBe('deduplicated');
    expect(second.status).toBe('captured');
    expect(store.listSnapshots('notes.txt')).toHaveLength(2);
    const status = await store.status();
    expect(status.counts.bytes).toBe(8);
    expect(status.counts.logical_bytes).toBe(12);

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
    const secondStore = await LocalHistoryStore.open({ target: secondTarget, policy: (await loadPolicy(secondTarget))! });
    const secondProjection = await secondStore.projectMetadata(userSiteRoot);
    expect(secondProjection).not.toBe(projection);
    secondStore.close();
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
