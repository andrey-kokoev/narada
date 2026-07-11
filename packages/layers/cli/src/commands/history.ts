import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import type { CommandContext } from '../lib/command-wrapper.js';
import { ExitCode } from '../lib/exit-codes.js';
import { formattedResult, type CliFormat } from '../lib/cli-output.js';
import {
  buildSiteTarget,
  buildUserTarget,
  defaultPolicy,
  loadPolicy,
  LocalHistoryStore,
  runHistoryDaemon,
  stopHistoryDaemon,
  withHistoryOwnerLock,
  writePolicy,
  type HistoryTarget,
  type LocalHistoryPolicy,
} from '@narada2/local-history';

const require = createRequire(import.meta.url);

export interface HistoryOptions {
  siteRoot?: string;
  siteId?: string;
  userSiteRoot?: string;
  root?: string;
  watchRoots?: string[];
  exclusions?: string[];
  maxFileSize?: number;
  retentionDays?: number;
  quotaBytes?: number;
  debounceMs?: number;
  format?: CliFormat;
  path?: string;
  snapshot?: string;
  from?: string;
  to?: string;
  confirm?: boolean;
  force?: boolean;
  pinned?: boolean;
  background?: boolean;
  once?: boolean;
  pollIntervalMs?: number;
  userProjectionRoot?: string;
}

export async function historyStatusCommand(options: HistoryOptions, _context: CommandContext): Promise<Result> {
  const target = resolveTarget(options);
  const policy = await loadPolicy(target);
  if (!policy) return result('missing_policy', { target, policy: null }, options.format);
  const store = await LocalHistoryStore.open({ target, policy });
  try {
    const status = await store.status();
    const projection = options.userProjectionRoot ? await store.projectMetadata(options.userProjectionRoot) : null;
    return result('success', { ...status, user_site_projection_path: projection }, options.format);
  } finally {
    store.close();
  }
}

export async function historyConfigureCommand(options: HistoryOptions, _context: CommandContext): Promise<Result> {
  const target = resolveTarget(options);
  const current = await loadPolicy(target) ?? defaultPolicy(target);
  const policy = await writePolicy(target, {
    ...current,
    enabled: current.enabled,
    roots: options.watchRoots && options.watchRoots.length > 0 ? options.watchRoots : current.roots,
    exclusions: options.exclusions && options.exclusions.length > 0 ? [...current.exclusions, ...options.exclusions] : current.exclusions,
    max_file_size_bytes: options.maxFileSize ?? current.max_file_size_bytes,
    retention_days: options.retentionDays ?? current.retention_days,
    quota_bytes: options.quotaBytes ?? current.quota_bytes,
    debounce_ms: options.debounceMs ?? current.debounce_ms,
  });
  return result('success', { policy, policy_path: target.policyPath, authority: target.ownerKind }, options.format);
}

export async function historyEnableCommand(options: HistoryOptions, _context: CommandContext): Promise<Result> {
  const target = resolveTarget(options);
  const current = await loadPolicy(target) ?? defaultPolicy(target);
  const policy = await writePolicy(target, {
    ...current,
    enabled: true,
    roots: options.watchRoots && options.watchRoots.length > 0 ? options.watchRoots : current.roots,
    exclusions: options.exclusions && options.exclusions.length > 0 ? [...current.exclusions, ...options.exclusions] : current.exclusions,
  });
  return result('success', { policy, policy_path: target.policyPath, store_root: target.storeRoot }, options.format);
}

export async function historyCaptureCommand(options: HistoryOptions, _context: CommandContext): Promise<Result> {
  const target = resolveTarget(options);
  const policy = await requireEnabledPolicy(target);
  return withHistoryOwnerLock(target, async () => {
    const store = await LocalHistoryStore.open({ target, policy });
    try {
      const relativePath = options.path;
      if (!relativePath) throw new Error('history_path_required');
      const capture = await store.captureFile(relativePath, 'modify');
      return result(capture.status === 'not_admitted' ? 'refused' : 'success', capture, options.format);
    } finally {
      store.close();
    }
  });
}

export async function historyStartCommand(options: HistoryOptions, _context: CommandContext): Promise<Result> {
  const { target, policy } = await loadEnabledPolicy(options);
  if (options.background) {
    const daemonModule = require.resolve('@narada2/local-history/daemon');
    const args = [daemonModule, ...daemonArgs(target, options), ...(options.once ? ['--once'] : [])];
    const child = spawn(process.execPath, args, { detached: true, stdio: 'ignore', windowsHide: true });
    child.unref();
    return result('started', { pid: child.pid ?? null, target, mode: 'background' }, options.format);
  }
  await runHistoryDaemon({ target, policy, once: options.once, poll_interval_ms: options.pollIntervalMs });
  return result('stopped', { target, mode: 'foreground', once: Boolean(options.once) }, options.format);
}

export async function historyStopCommand(options: HistoryOptions, _context: CommandContext): Promise<Result> {
  const target = resolveTarget(options);
  const stopped = await stopHistoryDaemon(target);
  return result(stopped.status, { ...stopped, target }, options.format);
}

export async function historyListCommand(options: HistoryOptions, _context: CommandContext): Promise<Result> {
  const { store } = await openEnabledStore(options);
  try {
    const files = store.listFiles(options.path);
    const projection = options.userProjectionRoot ? await store.projectMetadata(options.userProjectionRoot) : null;
    return result('success', { files, user_site_projection_path: projection }, options.format);
  } finally {
    store.close();
  }
}

export async function historyShowCommand(options: HistoryOptions, _context: CommandContext): Promise<Result> {
  const { store } = await openEnabledStore(options);
  try {
    if (!options.snapshot) throw new Error('history_snapshot_required');
    const snapshot = store.listSnapshots().find((item) => item.snapshot_id === options.snapshot);
    if (!snapshot) throw new Error('history_snapshot_not_found');
    return result('success', snapshot, options.format);
  } finally {
    store.close();
  }
}

export async function historyDiffCommand(options: HistoryOptions, _context: CommandContext): Promise<Result> {
  const { store } = await openEnabledStore(options);
  try {
    if (!options.from || !options.to) throw new Error('history_diff_snapshots_required');
    return result('success', await store.diff(options.from, options.to), options.format);
  } finally {
    store.close();
  }
}

export async function historyPinCommand(options: HistoryOptions, _context: CommandContext): Promise<Result> {
  const target = resolveTarget(options);
  const policy = await requireEnabledPolicy(target);
  return withHistoryOwnerLock(target, async () => {
    const store = await LocalHistoryStore.open({ target, policy });
    try {
      if (!options.snapshot) throw new Error('history_snapshot_required');
      return result('success', store.pin(options.snapshot, options.pinned !== false), options.format);
    } finally {
      store.close();
    }
  });
}

export async function historyForgetCommand(options: HistoryOptions, _context: CommandContext): Promise<Result> {
  const target = resolveTarget(options);
  const policy = await requireEnabledPolicy(target);
  return withHistoryOwnerLock(target, async () => {
    const store = await LocalHistoryStore.open({ target, policy });
    try {
      if (!options.snapshot) throw new Error('history_snapshot_required');
      return result('success', await store.forget(options.snapshot), options.format);
    } finally {
      store.close();
    }
  });
}

export async function historyRestoreCommand(options: HistoryOptions, _context: CommandContext): Promise<Result> {
  const target = resolveTarget(options);
  const policy = await requireEnabledPolicy(target);
  return withHistoryOwnerLock(target, async () => {
    const store = await LocalHistoryStore.open({ target, policy });
    try {
      if (!options.snapshot) throw new Error('history_snapshot_required');
      const restored = await store.restore(options.snapshot, { confirm: options.confirm === true, force: options.force === true });
      return result(restored.status === 'refused' ? 'refused' : 'success', restored, options.format);
    } finally {
      store.close();
    }
  });
}

interface Result {
  exitCode: ExitCode;
  result: unknown;
}

function result(status: string, value: Record<string, unknown> | object, format: CliFormat = 'auto'): Result {
  const payload: Record<string, unknown> = {
    schema: 'narada.history.command_result.v1',
    command_status: status,
    ...value,
  };
  if (!('status' in payload)) payload.status = status;
  const human = status === 'success'
    ? `Local history ${status}.`
    : `Local history: ${status}.`;
  return { exitCode: status === 'refused' || status === 'error' ? ExitCode.GENERAL_ERROR : ExitCode.SUCCESS, result: formattedResult(payload, human, format ?? 'auto') };
}

async function openEnabledStore(options: HistoryOptions): Promise<{ target: HistoryTarget; policy: LocalHistoryPolicy; store: LocalHistoryStore }> {
  const target = resolveTarget(options);
  const policy = await loadPolicy(target);
  if (!policy) throw new Error('local_history_policy_missing');
  if (!policy.enabled) throw new Error('local_history_disabled');
  return { target, policy, store: await LocalHistoryStore.open({ target, policy }) };
}

async function loadEnabledPolicy(options: HistoryOptions): Promise<{ target: HistoryTarget; policy: LocalHistoryPolicy }> {
  const target = resolveTarget(options);
  const policy = await requireEnabledPolicy(target);
  return { target, policy };
}

async function requireEnabledPolicy(target: HistoryTarget): Promise<LocalHistoryPolicy> {
  const policy = await loadPolicy(target);
  if (!policy) throw new Error('local_history_policy_missing');
  if (!policy.enabled) throw new Error('local_history_disabled');
  return policy;
}

function resolveTarget(options: HistoryOptions): HistoryTarget {
  if (options.siteRoot) return buildSiteTarget({ siteRoot: options.siteRoot, siteId: options.siteId });
  if (options.userSiteRoot && options.root) return buildUserTarget({ userSiteRoot: options.userSiteRoot, workspaceRoot: options.root });
  throw new Error('history_target_required: pass --site-root, or --user-site-root with --root');
}

function daemonArgs(target: HistoryTarget, options: HistoryOptions): string[] {
  if (target.ownerKind === 'site') return ['--site-root', target.workspaceRoot, '--site-id', target.ownerId];
  return ['--user-site-root', resolve(options.userSiteRoot as string), '--root', target.workspaceRoot];
}
