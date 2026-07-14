import { randomUUID } from 'node:crypto';
import { mkdir, readFile, stat, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { LocalHistoryError, LocalHistoryStore, writeHealth, writeJsonAtomic } from './store.js';
import type { HistoryDaemonOptions, HistoryTarget } from './types.js';

interface LockRecord {
  schema: 'narada.local_work_history.owner_lock.v1';
  owner_id: string;
  pid: number;
  started_at: string;
  heartbeat_at: string;
}

interface DaemonRecord {
  schema: 'narada.local_work_history.daemon.v1';
  owner_id: string;
  pid: number;
  started_at: string;
  health_path: string;
}

export async function withHistoryOwnerLock<T>(target: HistoryTarget, callback: () => Promise<T>): Promise<T> {
  const lock = await acquireOwnerLock(target.storeRoot);
  try {
    return await callback();
  } finally {
    await releaseOwnerLock(target.storeRoot, lock);
  }
}

export async function runHistoryDaemon(options: HistoryDaemonOptions): Promise<void> {
  const policy = options.policy;
  if (!policy || !policy.enabled) throw new LocalHistoryError('local_history_disabled');
  const lock = await acquireOwnerLock(options.target.storeRoot);
  let store: LocalHistoryStore;
  try {
    store = await LocalHistoryStore.open({ target: options.target, policy });
  } catch (error) {
    await releaseOwnerLock(options.target.storeRoot, lock);
    throw error;
  }
  const startedAt = new Date().toISOString();
  const stopRequestPath = join(options.target.storeRoot, 'stop.request');
  const daemonRecord: DaemonRecord = {
    schema: 'narada.local_work_history.daemon.v1',
    owner_id: lock.owner_id,
    pid: process.pid,
    started_at: startedAt,
    health_path: store.healthPath,
  };
  try {
    await writeDaemonRecord(options.target.storeRoot, daemonRecord);
  } catch (error) {
    store.close();
    await releaseOwnerLock(options.target.storeRoot, lock).catch(() => undefined);
    throw error;
  }
  let stopping = false;
  let timer: NodeJS.Timeout | undefined;
  let scanInFlight: Promise<void> | null = null;
  const stop = async (finalState: 'stopped' | 'failed' = 'stopped', failure?: unknown, waitForScan = true): Promise<void> => {
    if (stopping) return;
    stopping = true;
    if (timer) clearInterval(timer);
    if (waitForScan && scanInFlight) await scanInFlight.catch(() => undefined);
    try {
      await writeHealth(store.healthPath, {
        state: finalState,
        pid: process.pid,
        owner_id: lock.owner_id,
        started_at: startedAt,
        ...(finalState === 'stopped' ? { stopped_at: new Date().toISOString() } : {
          last_error: failure instanceof Error ? failure.message : String(failure ?? 'local_history_daemon_failed'),
        }),
      });
    } finally {
      await unlink(stopRequestPath).catch(() => undefined);
      await removeDaemonRecord(options.target.storeRoot, lock.owner_id).catch(() => undefined);
      await unlink(join(options.target.storeRoot, 'heartbeat.json')).catch(() => undefined);
      await releaseOwnerLock(options.target.storeRoot, lock).catch(() => undefined);
      store.close();
    }
  };
  process.once('SIGINT', () => void stop().finally(() => process.exit(0)));
  process.once('SIGTERM', () => void stop().finally(() => process.exit(0)));
  try {
    await writeHealth(store.healthPath, {
      state: 'running',
      pid: process.pid,
      owner_id: lock.owner_id,
      started_at: startedAt,
      last_scan_at: null,
      last_capture_at: null,
      last_error: null,
    });
  } catch (error) {
    await removeDaemonRecord(options.target.storeRoot, lock.owner_id).catch(() => undefined);
    await releaseOwnerLock(options.target.storeRoot, lock).catch(() => undefined);
    store.close();
    throw error;
  }

  const scan = async (): Promise<void> => {
    try {
      const result = await store.scanOnce({ debounce_ms: options.once ? 0 : policy.debounce_ms });
      await writeHealth(store.healthPath, {
        state: 'running',
        pid: process.pid,
        owner_id: lock.owner_id,
        started_at: startedAt,
        last_scan_at: new Date().toISOString(),
        last_capture_at: result.captured > 0 ? new Date().toISOString() : null,
        last_scan: result,
        last_error: null,
      });
      await refreshOwnerLock(options.target.storeRoot, lock);
    } catch (error) {
      await writeHealth(store.healthPath, {
        state: 'failed',
        pid: process.pid,
        owner_id: lock.owner_id,
        started_at: startedAt,
        last_scan_at: new Date().toISOString(),
        last_error: error instanceof Error ? error.message : String(error),
      });
      if (options.once) {
        await stop('failed', error, false);
        throw error;
      }
    }
  };

  const runScan = async (): Promise<void> => {
    if (stopping || scanInFlight) return;
    scanInFlight = scan();
    try {
      await scanInFlight;
    } finally {
      scanInFlight = null;
    }
  };

  await runScan();
  if (options.once) {
    await stop();
    return;
  }
  const interval = Math.max(250, options.poll_interval_ms ?? Math.min(2000, Math.max(250, policy.debounce_ms)));
  timer = setInterval(() => void tick(), interval);
  await new Promise<void>(() => undefined);

  async function tick(): Promise<void> {
    if (await fileExists(stopRequestPath)) {
      await stop();
      process.exit(0);
      return;
    }
    await runScan();
  }
}

export async function stopHistoryDaemon(target: HistoryTarget): Promise<{ status: string; pid?: number; reason?: string }> {
  const daemonPath = join(target.storeRoot, 'daemon.json');
  const record = await readJsonFile<DaemonRecord>(daemonPath);
  if (!record?.pid) return { status: 'not_running', reason: 'daemon_record_missing' };
  await writeJsonAtomic(join(target.storeRoot, 'stop.request'), { requested_at: new Date().toISOString() });
  const gracefulDeadline = Date.now() + 2000;
  while (Date.now() < gracefulDeadline) {
    if (!(await fileExists(daemonPath))) return { status: 'stop_requested', pid: record.pid };
    if (!isProcessAlive(record.pid)) {
      await markDaemonMissing(target, record);
      return { status: 'not_running', pid: record.pid, reason: 'daemon_process_missing' };
    }
    await delay(50);
  }
  return { status: 'stop_requested', pid: record.pid, reason: 'termination_pending' };
}

async function writeDaemonRecord(storeRoot: string, record: DaemonRecord): Promise<void> {
  await writeJsonAtomic(join(storeRoot, 'daemon.json'), record);
}

async function removeDaemonRecord(storeRoot: string, ownerId: string): Promise<void> {
  const path = join(storeRoot, 'daemon.json');
  const current = await readJsonFile<DaemonRecord>(path);
  if (current?.owner_id === ownerId) await unlink(path).catch(() => undefined);
}

async function acquireOwnerLock(storeRoot: string): Promise<LockRecord> {
  await mkdir(storeRoot, { recursive: true });
  const lockPath = join(storeRoot, 'owner.lock');
  const record: LockRecord = {
    schema: 'narada.local_work_history.owner_lock.v1',
    owner_id: `history_${randomUUID().replaceAll('-', '')}`,
    pid: process.pid,
    started_at: new Date().toISOString(),
    heartbeat_at: new Date().toISOString(),
  };
  try {
    await writeFile(lockPath, `${JSON.stringify(record, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    const current = await readJsonFile<LockRecord>(lockPath);
    if (!current) throw new LocalHistoryError('local_history_lock_corrupt');
    if (current.pid && isProcessAlive(current.pid)) {
      throw new LocalHistoryError('local_history_store_busy', 'local_history_store_busy: stop the background history process before running a mutating history command');
    }
    await unlink(lockPath).catch(() => undefined);
    await writeFile(lockPath, `${JSON.stringify(record, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
  }
  return record;
}

async function refreshOwnerLock(storeRoot: string, record: LockRecord): Promise<void> {
  await writeJsonAtomic(join(storeRoot, 'heartbeat.json'), { ...record, heartbeat_at: new Date().toISOString() });
}

async function releaseOwnerLock(storeRoot: string, record: LockRecord): Promise<void> {
  const path = join(storeRoot, 'owner.lock');
  const current = await readJsonFile<LockRecord>(path);
  if (current?.owner_id === record.owner_id) await unlink(path).catch(() => undefined);
}

async function markDaemonMissing(target: HistoryTarget, record: DaemonRecord): Promise<void> {
  await writeHealth(join(target.storeRoot, 'health.json'), {
    state: 'failed',
    pid: record.pid,
    owner_id: record.owner_id,
    started_at: record.started_at,
    last_error: 'local_history_daemon_process_missing',
  }).catch(() => undefined);
  await unlink(join(target.storeRoot, 'daemon.json')).catch(() => undefined);
  await unlink(join(target.storeRoot, 'stop.request')).catch(() => undefined);
  await unlink(join(target.storeRoot, 'heartbeat.json')).catch(() => undefined);
}

async function readJsonFile<T>(path: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(path, 'utf8')) as T;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    if (error instanceof SyntaxError) throw new LocalHistoryError('local_history_metadata_corrupt', `local_history_metadata_corrupt: ${path}`);
    throw error;
  }
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}
