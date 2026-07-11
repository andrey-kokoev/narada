import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, readdir, realpath, lstat, rename, rm, stat, unlink, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import Database from '@narada2/sqlite';
import { pathInsideWorkspace } from './policy.js';
import type {
  CaptureResult,
  FileSnapshot,
  HistoryFile,
  HistoryFileKind,
  HistoryStatus,
  HistoryTarget,
  LocalHistoryPolicy,
  RestoreResult,
} from './types.js';

export class LocalHistoryError extends Error {
  readonly code: string;

  constructor(code: string, message = code) {
    super(message);
    this.name = 'LocalHistoryError';
    this.code = code;
  }

}

interface StableRead {
  buffer: Buffer;
  size: number;
  mtimeMs: number;
  kind: HistoryFileKind;
}

interface StoredSnapshotRow {
  snapshot_id: string;
  file_id: string;
  relative_path: string;
  content_hash: string | null;
  blob_rel_path: string | null;
  size_bytes: number;
  captured_at: string;
  event_kind: string;
  is_tombstone: number;
  pinned: number;
  git_context_json: string | null;
  previous_hash: string | null;
}

export interface LocalHistoryStoreOptions {
  target: HistoryTarget;
  policy: LocalHistoryPolicy;
}

export interface HistoryDiff {
  status: 'identical' | 'different' | 'binary' | 'missing';
  from_snapshot_id: string;
  to_snapshot_id: string;
  added_lines: number;
  removed_lines: number;
  preview: string[];
}

export class LocalHistoryStore {
  readonly target: HistoryTarget;
  readonly policy: LocalHistoryPolicy;
  readonly dbPath: string;
  readonly blobRoot: string;
  readonly healthPath: string;
  private readonly db: Database;
  private closed = false;

  private constructor(options: LocalHistoryStoreOptions, db: Database) {
    this.target = options.target;
    this.policy = options.policy;
    this.db = db;
    this.dbPath = join(options.target.storeRoot, 'history.sqlite');
    this.blobRoot = join(options.target.storeRoot, 'blobs', 'sha256');
    this.healthPath = join(options.target.storeRoot, 'health.json');
  }

  static async open(options: LocalHistoryStoreOptions): Promise<LocalHistoryStore> {
    await mkdir(options.target.storeRoot, { recursive: true });
    await mkdir(join(options.target.storeRoot, 'blobs', 'sha256'), { recursive: true });
    const dbPath = join(options.target.storeRoot, 'history.sqlite');
    const store = new LocalHistoryStore(options, new Database(dbPath));
    store.ensureSchema();
    store.ensureWorkspace();
    return store;
  }

  close(): void {
    if (this.closed) return;
    this.db.close();
    this.closed = true;
  }

  async status(): Promise<HistoryStatus> {
    this.assertOpen();
    const health = await readJsonFileSafe<Record<string, unknown>>(this.healthPath);
    const counts = this.db.prepare(`
      SELECT
        (SELECT count(*) FROM history_files) AS files,
        (SELECT count(*) FROM history_files WHERE active = 1) AS active_files,
        (SELECT count(*) FROM history_snapshots) AS snapshots,
        (SELECT count(*) FROM history_snapshots WHERE pinned = 1) AS pinned_snapshots,
        (SELECT coalesce(sum(size_bytes), 0) FROM history_snapshots WHERE is_tombstone = 0) AS bytes
    `).get() as Record<string, unknown>;
    const blobRows = await listFilesSafe(this.blobRoot);
    const watcherState = String(health?.state ?? 'not_started');
    return {
      schema: 'narada.local_work_history.status.v1',
      status: this.policy.enabled ? 'enabled' : 'disabled',
      owner_kind: this.target.ownerKind,
      owner_id: this.target.ownerId,
      workspace_root: this.target.workspaceRoot,
      authority_root: this.target.authorityRoot,
      policy_path: this.target.policyPath,
      store_root: this.target.storeRoot,
      policy: this.policy,
      watcher: {
        state: isWatcherState(watcherState) ? watcherState : 'unknown',
        pid: numberOrNull(health?.pid),
        started_at: stringOrNull(health?.started_at),
        last_scan_at: stringOrNull(health?.last_scan_at),
        last_capture_at: stringOrNull(health?.last_capture_at),
        last_error: stringOrNull(health?.last_error),
      },
      counts: {
        files: Number(counts.files ?? 0),
        active_files: Number(counts.active_files ?? 0),
        snapshots: Number(counts.snapshots ?? 0),
        blobs: blobRows.length,
        bytes: Number(counts.bytes ?? 0),
        pinned_snapshots: Number(counts.pinned_snapshots ?? 0),
      },
    };
  }

  async captureFile(relativePath: string, eventKind: 'create' | 'modify' | 'delete' | 'rename' | 'pre_restore' | 'restore' = 'modify'): Promise<CaptureResult> {
    this.assertOpen();
    const normalized = normalizeRelativePath(relativePath);
    const admission = await this.admit(normalized);
    if (admission.status !== 'admitted') {
      return { status: 'not_admitted', relative_path: normalized, reason: admission.reason };
    }
    const existing = this.getFileRow(normalized);
    if (admission.missing) {
      if (!existing || !Number(existing.active)) {
        return { status: 'skipped', relative_path: normalized, reason: 'file_not_seen' };
      }
      const snapshotId = `snap_${randomUUID().replaceAll('-', '')}`;
      const now = new Date().toISOString();
      this.db.transaction(() => {
        this.db.prepare('UPDATE history_files SET active = 0, last_seen_at = ? WHERE file_id = ?').run(now, existing.file_id);
        this.db.prepare(`
          INSERT INTO history_snapshots
            (snapshot_id, file_id, content_hash, blob_rel_path, size_bytes, captured_at, event_kind, is_tombstone, pinned, git_context_json, previous_hash)
          VALUES (?, ?, NULL, NULL, 0, ?, ?, 1, 0, NULL, ?)
        `).run(snapshotId, existing.file_id, now, eventKind === 'pre_restore' ? 'delete' : 'delete', existing.last_hash ?? null);
        this.db.prepare(`
          INSERT INTO history_captures (capture_id, file_id, snapshot_id, event_kind, observed_at, stable, source_hash, previous_hash, git_context_json)
          VALUES (?, ?, ?, ?, ?, 1, NULL, ?, NULL)
        `).run(`capture_${randomUUID().replaceAll('-', '')}`, existing.file_id, snapshotId, 'delete', now, existing.last_hash ?? null);
      })();
      return { status: 'tombstone', file_id: existing.file_id, snapshot_id: snapshotId, relative_path: normalized, content_hash: null };
    }

    const stable = await readStable(admission.path, this.policy);
    if (!stable) return { status: 'skipped', relative_path: normalized, reason: 'unstable_read' };
    if (existing?.last_hash === hashBuffer(stable.buffer)) {
      this.db.prepare('UPDATE history_files SET last_seen_at = ?, active = 1 WHERE file_id = ?').run(new Date().toISOString(), existing.file_id);
      return { status: 'deduplicated', file_id: existing.file_id, relative_path: normalized, content_hash: existing.last_hash };
    }

    const contentHash = hashBuffer(stable.buffer);
    const previousHash = existing?.last_hash ?? null;
    const fileId = existing?.file_id ?? `file_${randomUUID().replaceAll('-', '')}`;
    const snapshotId = `snap_${randomUUID().replaceAll('-', '')}`;
    const now = new Date().toISOString();
    const renameCandidate = eventKind === 'modify' || eventKind === 'create'
      ? this.db.prepare(`
          SELECT s.snapshot_id, f.relative_path
          FROM history_snapshots s
          JOIN history_files f ON f.file_id = s.file_id
          WHERE s.is_tombstone = 1 AND s.previous_hash = ? AND f.relative_path <> ?
          ORDER BY s.captured_at DESC
          LIMIT 1
        `).get(contentHash, normalized) as { snapshot_id?: string; relative_path?: string } | undefined
      : undefined;
    const effectiveEventKind = renameCandidate ? 'rename' : eventKind;
    const gitContextJson = renameCandidate?.relative_path
      ? JSON.stringify({ renamed_from: renameCandidate.relative_path })
      : null;
    const blobRelPath = join('blobs', 'sha256', contentHash.slice(0, 2), contentHash);
    const blobPath = join(this.target.storeRoot, blobRelPath);
    await writeBlobOnce(blobPath, stable.buffer);
    this.db.transaction(() => {
      this.db.prepare(`
        INSERT INTO history_files (file_id, workspace_id, relative_path, file_kind, active, last_hash, last_size_bytes, last_seen_at)
        VALUES (?, ?, ?, ?, 1, ?, ?, ?)
        ON CONFLICT(workspace_id, relative_path) DO UPDATE SET
          active = 1, file_kind = excluded.file_kind, last_hash = excluded.last_hash,
          last_size_bytes = excluded.last_size_bytes, last_seen_at = excluded.last_seen_at
      `).run(fileId, this.workspaceId(), normalized, stable.kind, contentHash, stable.size, now);
      const currentFile = this.getFileRow(normalized);
      const actualFileId = currentFile?.file_id ?? fileId;
      this.db.prepare(`
        INSERT INTO history_snapshots
          (snapshot_id, file_id, content_hash, blob_rel_path, size_bytes, captured_at, event_kind, is_tombstone, pinned, git_context_json, previous_hash)
        VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0, ?, ?)
      `).run(snapshotId, actualFileId, contentHash, blobRelPath, stable.size, now, effectiveEventKind, gitContextJson, previousHash);
      this.db.prepare(`
        INSERT INTO history_captures (capture_id, file_id, snapshot_id, event_kind, observed_at, stable, source_hash, previous_hash, git_context_json)
        VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?)
      `).run(`capture_${randomUUID().replaceAll('-', '')}`, actualFileId, snapshotId, effectiveEventKind, now, contentHash, previousHash, gitContextJson);
    })();
    await this.collectGarbage();
    return { status: 'captured', file_id: fileId, snapshot_id: snapshotId, relative_path: normalized, content_hash: contentHash };
  }

  async scanOnce(): Promise<{ scanned: number; captured: number; skipped: number }> {
    const seen = new Set<string>();
    const discovered: string[] = [];
    let scanned = 0;
    let captured = 0;
    let skipped = 0;
    for (const root of this.policy.roots) {
      const rootPath = resolve(this.target.workspaceRoot, root);
      if (!pathInsideWorkspace(this.target.workspaceRoot, rootPath)) throw new LocalHistoryError('local_history_root_escape');
      await walkFiles(rootPath, async (path) => {
        const rel = normalizeRelativePath(relative(this.target.workspaceRoot, path));
        seen.add(rel);
        discovered.push(rel);
        scanned += 1;
      });
    }
    const activeRows = this.db.prepare('SELECT relative_path FROM history_files WHERE active = 1').all() as Array<{ relative_path: string }>;
    for (const row of activeRows) {
      if (!seen.has(row.relative_path)) {
        const result = await this.captureFile(row.relative_path, 'delete');
        if (result.status === 'tombstone') captured += 1;
      }
    }
    for (const rel of discovered) {
      const result = await this.captureFile(rel, 'modify');
      if (result.status === 'captured' || result.status === 'tombstone') captured += 1;
      if (result.status === 'skipped' || result.status === 'not_admitted') skipped += 1;
    }
    return { scanned, captured, skipped };
  }

  listFiles(pathPrefix?: string): HistoryFile[] {
    this.assertOpen();
    const rows = (pathPrefix
      ? this.db.prepare('SELECT * FROM history_files WHERE relative_path LIKE ? ORDER BY relative_path').all(`${normalizeRelativePath(pathPrefix)}%`)
      : this.db.prepare('SELECT * FROM history_files ORDER BY relative_path').all()) as Array<Record<string, unknown>>;
    return rows.map((row) => ({
      file_id: String(row.file_id),
      workspace_id: String(row.workspace_id),
      relative_path: String(row.relative_path),
      file_kind: String(row.file_kind) as HistoryFileKind,
      active: Number(row.active) === 1,
      last_hash: stringOrNull(row.last_hash),
      last_size_bytes: numberOrNull(row.last_size_bytes),
      last_seen_at: stringOrNull(row.last_seen_at),
      snapshots: this.listSnapshots(String(row.file_id)),
    }));
  }

  listSnapshots(fileIdOrPath?: string): FileSnapshot[] {
    this.assertOpen();
    const rows = (fileIdOrPath && !fileIdOrPath.startsWith('file_')
      ? this.db.prepare(`SELECT s.*, f.relative_path FROM history_snapshots s JOIN history_files f ON f.file_id = s.file_id WHERE f.relative_path = ? ORDER BY s.captured_at DESC`).all(normalizeRelativePath(fileIdOrPath))
      : fileIdOrPath
        ? this.db.prepare('SELECT s.*, f.relative_path FROM history_snapshots s JOIN history_files f ON f.file_id = s.file_id WHERE s.file_id = ? ORDER BY s.captured_at DESC').all(fileIdOrPath)
        : this.db.prepare('SELECT s.*, f.relative_path FROM history_snapshots s JOIN history_files f ON f.file_id = s.file_id ORDER BY s.captured_at DESC').all()) as StoredSnapshotRow[];
    return rows.map(parseSnapshot);
  }

  async diff(fromSnapshotId: string, toSnapshotId: string): Promise<HistoryDiff> {
    const from = this.getSnapshotRow(fromSnapshotId);
    const to = this.getSnapshotRow(toSnapshotId);
    if (!from || !to) throw new LocalHistoryError('history_snapshot_not_found');
    if (from.is_tombstone || to.is_tombstone) return { status: 'missing', from_snapshot_id: fromSnapshotId, to_snapshot_id: toSnapshotId, added_lines: 0, removed_lines: 0, preview: [] };
    const [left, right] = await Promise.all([this.readSnapshot(from), this.readSnapshot(to)]);
    if (left.equals(right)) return { status: 'identical', from_snapshot_id: fromSnapshotId, to_snapshot_id: toSnapshotId, added_lines: 0, removed_lines: 0, preview: [] };
    if (looksBinary(left) || looksBinary(right)) return { status: 'binary', from_snapshot_id: fromSnapshotId, to_snapshot_id: toSnapshotId, added_lines: 0, removed_lines: 0, preview: [] };
    const leftLines = left.toString('utf8').split(/\r?\n/);
    const rightLines = right.toString('utf8').split(/\r?\n/);
    const removed = leftLines.filter((line) => !rightLines.includes(line));
    const added = rightLines.filter((line) => !leftLines.includes(line));
    return {
      status: 'different',
      from_snapshot_id: fromSnapshotId,
      to_snapshot_id: toSnapshotId,
      added_lines: added.length,
      removed_lines: removed.length,
      preview: [...removed.slice(0, 20).map((line) => `- ${line}`), ...added.slice(0, 20).map((line) => `+ ${line}`)],
    };
  }

  async restore(snapshotId: string, options: { confirm: boolean; force: boolean }): Promise<RestoreResult> {
    const snapshot = this.getSnapshotRow(snapshotId);
    if (!snapshot) throw new LocalHistoryError('history_snapshot_not_found');
    if (!options.confirm) return { status: 'refused', snapshot_id: snapshotId, relative_path: snapshot.relative_path, stale: false, reason: 'explicit_confirmation_required' };
    const admission = await this.admit(snapshot.relative_path);
    if (admission.status !== 'admitted') return { status: 'refused', snapshot_id: snapshotId, relative_path: snapshot.relative_path, stale: false, reason: admission.reason };
    const current = await readCurrent(admission.path);
    const currentHash = current ? hashBuffer(current.buffer) : null;
    const stale = currentHash !== null && currentHash !== snapshot.content_hash;
    if (stale && !options.force) return { status: 'refused', snapshot_id: snapshotId, relative_path: snapshot.relative_path, stale: true, reason: 'history_restore_stale_target_requires_force' };
    let rollbackSnapshotId: string | undefined;
    if (current) {
      const rollback = await this.captureFile(snapshot.relative_path, 'pre_restore');
      rollbackSnapshotId = rollback.snapshot_id;
    }
    if (snapshot.is_tombstone) {
      await unlink(admission.path).catch((error: unknown) => {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      });
      await this.captureFile(snapshot.relative_path, 'restore');
      this.recordRestore(snapshotId, rollbackSnapshotId, snapshot.relative_path, stale, options.force);
      return { status: 'deleted', snapshot_id: snapshotId, relative_path: snapshot.relative_path, stale, rollback_snapshot_id: rollbackSnapshotId };
    }
    const content = await this.readSnapshot(snapshot);
    await mkdir(dirname(admission.path), { recursive: true });
    const temp = `${admission.path}.narada-restore-${randomUUID()}.tmp`;
    await writeFile(temp, content);
    await rename(temp, admission.path);
    await this.captureFile(snapshot.relative_path, 'restore');
    this.recordRestore(snapshotId, rollbackSnapshotId, snapshot.relative_path, stale, options.force);
    return { status: 'restored', snapshot_id: snapshotId, relative_path: snapshot.relative_path, stale, rollback_snapshot_id: rollbackSnapshotId };
  }

  pin(snapshotId: string, pinned = true): FileSnapshot {
    const row = this.getSnapshotRow(snapshotId);
    if (!row) throw new LocalHistoryError('history_snapshot_not_found');
    this.db.prepare('UPDATE history_snapshots SET pinned = ? WHERE snapshot_id = ?').run(pinned ? 1 : 0, snapshotId);
    return parseSnapshot({ ...row, pinned: pinned ? 1 : 0 });
  }

  async forget(snapshotId: string): Promise<{ status: string; snapshot_id: string; blob_deleted: boolean }> {
    const row = this.getSnapshotRow(snapshotId);
    if (!row) throw new LocalHistoryError('history_snapshot_not_found');
    if (row.pinned) throw new LocalHistoryError('history_snapshot_pinned');
    this.db.prepare('DELETE FROM history_captures WHERE snapshot_id = ?').run(snapshotId);
    this.db.prepare('DELETE FROM history_restores WHERE target_snapshot_id = ? OR rollback_snapshot_id = ?').run(snapshotId, snapshotId);
    this.db.prepare('DELETE FROM history_snapshots WHERE snapshot_id = ?').run(snapshotId);
    let blobDeleted = false;
    if (row.blob_rel_path && !this.db.prepare('SELECT 1 FROM history_snapshots WHERE blob_rel_path = ? LIMIT 1').get(row.blob_rel_path)) {
      await rm(join(this.target.storeRoot, row.blob_rel_path), { force: true });
      blobDeleted = true;
    }
    return { status: 'forgotten', snapshot_id: snapshotId, blob_deleted: blobDeleted };
  }

  async projectMetadata(userSiteRoot: string): Promise<string> {
    const projectionRoot = join(resolve(userSiteRoot), '.narada', 'runtime', 'local-history', 'projections');
    await mkdir(projectionRoot, { recursive: true });
    const path = join(projectionRoot, `${this.target.ownerId}.json`);
    const files = this.listFiles().map((file) => ({
      file_id: file.file_id,
      relative_path: file.relative_path,
      active: file.active,
      last_hash: file.last_hash,
      last_seen_at: file.last_seen_at,
      snapshot_ids: file.snapshots.map((snapshot) => snapshot.snapshot_id),
    }));
    await writeFile(path, `${JSON.stringify({
      schema: 'narada.local_work_history.user_site_projection.v1',
      generated_at: new Date().toISOString(),
      owner_kind: this.target.ownerKind,
      owner_id: this.target.ownerId,
      site_workspace_root: this.target.workspaceRoot,
      site_store_root: this.target.storeRoot,
      files,
      content_included: false,
    }, null, 2)}\n`, 'utf8');
    return path;
  }

  private ensureSchema(): void {
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS history_workspaces (
        workspace_id TEXT PRIMARY KEY,
        owner_id TEXT NOT NULL,
        workspace_root TEXT NOT NULL,
        policy_version TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS history_files (
        file_id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL,
        relative_path TEXT NOT NULL,
        file_kind TEXT NOT NULL,
        active INTEGER NOT NULL DEFAULT 1,
        last_hash TEXT,
        last_size_bytes INTEGER,
        last_seen_at TEXT,
        UNIQUE(workspace_id, relative_path)
      );
      CREATE TABLE IF NOT EXISTS history_snapshots (
        snapshot_id TEXT PRIMARY KEY,
        file_id TEXT NOT NULL,
        content_hash TEXT,
        blob_rel_path TEXT,
        size_bytes INTEGER NOT NULL,
        captured_at TEXT NOT NULL,
        event_kind TEXT NOT NULL,
        is_tombstone INTEGER NOT NULL DEFAULT 0,
        pinned INTEGER NOT NULL DEFAULT 0,
        git_context_json TEXT,
        previous_hash TEXT
      );
      CREATE TABLE IF NOT EXISTS history_captures (
        capture_id TEXT PRIMARY KEY,
        file_id TEXT NOT NULL,
        snapshot_id TEXT NOT NULL,
        event_kind TEXT NOT NULL,
        observed_at TEXT NOT NULL,
        stable INTEGER NOT NULL,
        source_hash TEXT,
        previous_hash TEXT,
        git_context_json TEXT
      );
      CREATE TABLE IF NOT EXISTS history_restores (
        restore_id TEXT PRIMARY KEY,
        target_snapshot_id TEXT NOT NULL,
        rollback_snapshot_id TEXT,
        relative_path TEXT NOT NULL,
        restored_at TEXT NOT NULL,
        stale INTEGER NOT NULL,
        forced INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_history_files_path ON history_files(relative_path);
      CREATE INDEX IF NOT EXISTS idx_history_snapshots_file_time ON history_snapshots(file_id, captured_at DESC);
    `);
  }

  private ensureWorkspace(): void {
    const now = new Date().toISOString();
    this.db.prepare(`
      INSERT INTO history_workspaces (workspace_id, owner_id, workspace_root, policy_version, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(workspace_id) DO UPDATE SET updated_at = excluded.updated_at, policy_version = excluded.policy_version
    `).run(this.workspaceId(), this.target.ownerId, this.target.workspaceRoot, this.policy.schema, now, now);
  }

  private workspaceId(): string {
    return this.target.workspaceId;
  }

  private getFileRow(relativePath: string): { file_id: string; active: number; last_hash: string | null } | null {
    const row = this.db.prepare('SELECT file_id, active, last_hash FROM history_files WHERE workspace_id = ? AND relative_path = ?').get(this.workspaceId(), relativePath) as Record<string, unknown> | undefined;
    return row ? { file_id: String(row.file_id), active: Number(row.active), last_hash: stringOrNull(row.last_hash) } : null;
  }

  private getSnapshotRow(snapshotId: string): StoredSnapshotRow | null {
    const row = this.db.prepare(`SELECT s.*, f.relative_path FROM history_snapshots s JOIN history_files f ON f.file_id = s.file_id WHERE s.snapshot_id = ?`).get(snapshotId) as StoredSnapshotRow | undefined;
    return row ?? null;
  }

  private recordRestore(snapshotId: string, rollbackSnapshotId: string | undefined, relativePath: string, stale: boolean, forced: boolean): void {
    this.db.prepare(`
      INSERT INTO history_restores (restore_id, target_snapshot_id, rollback_snapshot_id, relative_path, restored_at, stale, forced)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(`restore_${randomUUID().replaceAll('-', '')}`, snapshotId, rollbackSnapshotId ?? null, relativePath, new Date().toISOString(), stale ? 1 : 0, forced ? 1 : 0);
  }

  private async readSnapshot(row: StoredSnapshotRow): Promise<Buffer> {
    if (!row.blob_rel_path) throw new LocalHistoryError('history_snapshot_has_no_blob');
    return readFile(join(this.target.storeRoot, row.blob_rel_path));
  }

  private async admit(relativePath: string): Promise<{ status: 'admitted' | 'missing' | 'refused'; path: string; missing?: boolean; reason?: string }> {
    const path = resolve(this.target.workspaceRoot, relativePath);
    if (pathInsideWorkspace(this.target.authorityRoot, path)) return { status: 'refused', path, reason: 'authority_root_refused' };
    if (!pathInsideWorkspace(this.target.workspaceRoot, path)) return { status: 'refused', path, reason: 'path_outside_workspace' };
    const admittedRoot = this.policy.roots.some((root) => pathInsideWorkspace(resolve(this.target.workspaceRoot, root), path));
    if (!admittedRoot) return { status: 'refused', path, reason: 'path_outside_admitted_roots' };
    if (matchesExclusion(relativePath, this.policy.exclusions)) return { status: 'refused', path, reason: 'path_excluded_by_policy' };
    try {
      const info = await lstat(path);
      if (info.isSymbolicLink()) return { status: 'refused', path, reason: 'symlink_or_reparse_point_refused' };
      if (!info.isFile()) return { status: 'refused', path, reason: 'not_a_regular_file' };
      const canonical = await realpath(path);
      const canonicalRoots = await Promise.all(this.policy.roots.map(async (root) => realpath(resolve(this.target.workspaceRoot, root)).catch(() => resolve(this.target.workspaceRoot, root))));
      if (!canonicalRoots.some((root) => pathInsideWorkspace(root, canonical))) return { status: 'refused', path, reason: 'canonical_path_outside_admitted_root' };
      return { status: 'admitted', path };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return { status: 'admitted', path, missing: true };
      }
      throw error;
    }
  }

  private assertOpen(): void {
    if (this.closed) throw new LocalHistoryError('history_store_closed');
  }

  private async collectGarbage(): Promise<void> {
    const cutoff = Date.now() - this.policy.retention_days * 24 * 60 * 60 * 1000;
    const rows = this.db.prepare('SELECT * FROM history_snapshots ORDER BY captured_at ASC').all() as StoredSnapshotRow[];
    const latestRows = this.db.prepare('SELECT file_id, max(captured_at) AS captured_at FROM history_snapshots GROUP BY file_id').all() as Array<Record<string, unknown>>;
    const latest = new Set(latestRows.map((row) => `${String(row.file_id)}|${String(row.captured_at)}`));
    for (const row of rows) {
      if (row.pinned || latest.has(`${row.file_id}|${row.captured_at}`)) continue;
      if (Date.parse(row.captured_at) < cutoff) await this.forget(row.snapshot_id).catch(() => undefined);
    }
    const remainingRow = this.db.prepare('SELECT coalesce(sum(size_bytes), 0) AS bytes FROM history_snapshots WHERE is_tombstone = 0').get() as Record<string, unknown>;
    let remainingBytes = Number(remainingRow.bytes ?? 0);
    if (remainingBytes <= this.policy.quota_bytes) return;
    const candidates = this.db.prepare('SELECT * FROM history_snapshots WHERE pinned = 0 ORDER BY captured_at ASC').all() as StoredSnapshotRow[];
    for (const row of candidates) {
      if (remainingBytes <= this.policy.quota_bytes) break;
      if (latest.has(`${row.file_id}|${row.captured_at}`)) continue;
      const forgotten = await this.forget(row.snapshot_id).catch(() => null);
      if (forgotten && !row.is_tombstone) remainingBytes -= Number(row.size_bytes ?? 0);
    }
  }
}

export async function writeHealth(path: string, health: Record<string, unknown>): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify({ schema: 'narada.local_work_history.health.v1', ...health }, null, 2)}\n`, 'utf8');
}

async function readStable(path: string, policy: LocalHistoryPolicy): Promise<StableRead | null> {
  for (let attempt = 0; attempt < policy.stable_read_attempts; attempt += 1) {
    const before = await stat(path).catch(() => null);
    if (!before || !before.isFile()) return null;
    if (before.size > policy.max_file_size_bytes) return null;
    const buffer = await readFile(path).catch(() => null);
    const after = await stat(path).catch(() => null);
    if (buffer && after && before.size === after.size && before.mtimeMs === after.mtimeMs) {
      return { buffer, size: before.size, mtimeMs: before.mtimeMs, kind: looksBinary(buffer) ? 'binary' : 'text' };
    }
    if (attempt + 1 < policy.stable_read_attempts && policy.stable_read_delay_ms > 0) await delay(policy.stable_read_delay_ms);
  }
  return null;
}

async function readCurrent(path: string): Promise<StableRead | null> {
  const before = await stat(path).catch(() => null);
  if (!before || !before.isFile()) return null;
  const buffer = await readFile(path);
  return { buffer, size: before.size, mtimeMs: before.mtimeMs, kind: looksBinary(buffer) ? 'binary' : 'text' };
}

async function walkFiles(root: string, callback: (path: string) => Promise<void>): Promise<void> {
  const info = await lstat(root).catch(() => null);
  if (!info || info.isSymbolicLink()) return;
  if (info.isFile()) {
    await callback(root);
    return;
  }
  if (!info.isDirectory()) return;
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (entry.isSymbolicLink()) continue;
    if (entry.isDirectory()) await walkFiles(path, callback);
    else if (entry.isFile()) await callback(path);
  }
}

async function writeBlobOnce(path: string, buffer: Buffer): Promise<void> {
  try {
    await stat(path);
    return;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  await mkdir(dirname(path), { recursive: true });
  const temp = `${path}.${randomUUID()}.tmp`;
  await writeFile(temp, buffer);
  try {
    await rename(temp, path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    await rm(temp, { force: true });
  }
}

async function listFilesSafe(path: string): Promise<string[]> {
  const result: string[] = [];
  async function visit(current: string): Promise<void> {
    for (const entry of await readdir(current, { withFileTypes: true }).catch(() => [])) {
      const child = join(current, entry.name);
      if (entry.isDirectory()) await visit(child);
      else if (entry.isFile()) result.push(child);
    }
  }
  await visit(path);
  return result;
}

function parseSnapshot(row: StoredSnapshotRow): FileSnapshot {
  return {
    snapshot_id: String(row.snapshot_id),
    file_id: String(row.file_id),
    relative_path: String(row.relative_path),
    content_hash: stringOrNull(row.content_hash),
    size_bytes: Number(row.size_bytes ?? 0),
    captured_at: String(row.captured_at),
    event_kind: String(row.event_kind) as FileSnapshot['event_kind'],
    is_tombstone: Number(row.is_tombstone) === 1,
    pinned: Number(row.pinned) === 1,
    git_context: row.git_context_json ? JSON.parse(row.git_context_json) as Record<string, unknown> : null,
  };
}

function normalizeRelativePath(value: string): string {
  const normalized = value.replaceAll('\\', '/').replace(/^\.\//, '');
  if (!normalized || normalized === '.') return '.';
  if (normalized.startsWith('/') || normalized.split('/').includes('..')) throw new LocalHistoryError('local_history_relative_path_invalid');
  return normalized;
}

function matchesExclusion(path: string, patterns: string[]): boolean {
  return patterns.some((pattern) => globToRegExp(pattern).test(path));
}

function globToRegExp(pattern: string): RegExp {
  let output = '';
  for (let index = 0; index < pattern.length; index += 1) {
    const char = pattern[index];
    if (char === '*' && pattern[index + 1] === '*') {
      if (pattern[index + 2] === '/') {
        output += '(?:.*/)?';
        index += 2;
      } else {
        output += '.*';
        index += 1;
      }
    } else if (char === '*') output += '[^/]*';
    else if (char === '?') output += '[^/]';
    else output += /[.+^${}()|[\]\\]/.test(char) ? `\\${char}` : char;
  }
  return new RegExp(`^${output}$`, 'i');
}

function hashBuffer(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex');
}

function looksBinary(buffer: Buffer): boolean {
  const sample = buffer.subarray(0, Math.min(buffer.length, 4096));
  return sample.includes(0);
}

function stringOrNull(value: unknown): string | null {
  return value === null || value === undefined ? null : String(value);
}

function numberOrNull(value: unknown): number | null {
  return value === null || value === undefined ? null : Number(value);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
}

function isWatcherState(value: string): value is HistoryStatus['watcher']['state'] {
  return ['running', 'stopped', 'not_started', 'failed', 'unknown'].includes(value);
}

async function readJsonFileSafe<T>(path: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(path, 'utf8')) as T;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    return null;
  }
}
