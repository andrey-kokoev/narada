import { createRequire } from 'node:module';
import { spawn, spawnSync } from 'node:child_process';
import { readFile, stat } from 'node:fs/promises';
import { statSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import type { CommandContext } from '../lib/command-wrapper.js';
import { ExitCode } from '../lib/exit-codes.js';
import { formattedResult, type CliFormat } from '../lib/cli-output.js';
import {
  buildSiteTarget,
  buildUserTarget,
  DEFAULT_HISTORY_EXCLUSIONS,
  defaultPolicy,
  loadPolicy,
  loadUserHistoryDefaults,
  LocalHistoryStore,
  MANDATORY_HISTORY_EXCLUSIONS,
  runHistoryDaemon,
  stopHistoryDaemon,
  userHistoryDefaultsPath,
  withHistoryOwnerLock,
  writePolicy,
  type HistoryPrivacyPosture,
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
  stableReadAttempts?: number;
  stableReadDelayMs?: number;
  privacyPosture?: HistoryPrivacyPosture;
  replaceExclusions?: boolean;
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

async function projectMetadata(store: LocalHistoryStore, userSiteRoot: string): Promise<string> {
  const projectionRoot = join(resolve(userSiteRoot), '.narada', 'runtime', 'local-history', 'projections');
  const check = gitIgnoreCheck(projectionRoot);
  if (!check.ignored) throw new Error(`local_history_projection_not_ignored: add ${check.display}/ to the User Site ignore policy before projecting history`);
  return store.projectMetadata(userSiteRoot);
}

function assertHistoryArtifactsIgnored(target: HistoryTarget): void {
  const storeCheck = gitIgnoreCheck(target.storeRoot);
  const markerCheck = target.ownerKind === 'user_site'
    ? gitIgnoreCheck(join(target.workspaceRoot, '.narada', 'local-history-workspace.json'))
    : { ignored: true, display: '' };
  const missing = [
    ...(storeCheck.ignored ? [] : [`${storeCheck.display}/`]),
    ...(markerCheck.ignored ? [] : [markerCheck.display]),
  ];
  if (missing.length > 0) throw new Error(`local_history_store_not_ignored: add ${missing.join(', ')} to the Site ignore policy before enabling history`);
}

function gitIgnoreCheck(path: string): { ignored: boolean; display: string } {
  const gitRoot = findGitRoot(path);
  if (!gitRoot) return { ignored: true, display: path };
  const relativePath = relative(gitRoot, resolve(path)).replaceAll('\\', '/');
  if (isAbsolute(relativePath) || relativePath === '..' || relativePath.startsWith('../')) return { ignored: true, display: path };
  const candidates = [relativePath, `${relativePath}/`, `${relativePath}/history.sqlite`];
  const ignored = candidates.some((candidate) => spawnSync('git', ['-C', gitRoot, 'check-ignore', '--quiet', '--', candidate], {
    windowsHide: true,
    stdio: 'ignore',
  }).status === 0);
  return { ignored, display: relativePath };
}

function findGitRoot(path: string): string | null {
  let current = resolve(path);
  while (true) {
    const info = statSync(current, { throwIfNoEntry: false });
    const directory = info?.isDirectory() ? current : dirname(current);
    const probe = spawnSync('git', ['-C', directory, 'rev-parse', '--show-toplevel'], {
      encoding: 'utf8',
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    if (probe.status === 0 && typeof probe.stdout === 'string' && probe.stdout.trim()) return resolve(probe.stdout.trim());
    const parent = dirname(directory);
    if (parent === directory) return null;
    current = parent;
  }
}

async function policySeed(target: HistoryTarget, options: HistoryOptions): Promise<{
  policy: LocalHistoryPolicy;
  source: 'persisted_policy' | 'user_site_defaults' | 'package_defaults';
  defaults_path: string | null;
}> {
  const current = await loadPolicy(target);
  if (current) return { policy: current, source: 'persisted_policy', defaults_path: null };
  const userSiteRoot = resolveUserSiteRoot(options);
  const defaultsPath = userHistoryDefaultsPath(userSiteRoot);
  const defaults = await loadUserHistoryDefaults(userSiteRoot);
  return {
    policy: defaultPolicy(target, defaults ?? {}),
    source: defaults ? 'user_site_defaults' : 'package_defaults',
    defaults_path: defaultsPath,
  };
}

function resolveUserSiteRoot(options: HistoryOptions): string {
  return resolve(options.userSiteRoot ?? process.env.NARADA_USER_SITE_ROOT ?? join(homedir(), 'Narada'));
}

function applyPolicyOptions(current: LocalHistoryPolicy, options: HistoryOptions, enabled: boolean): Partial<LocalHistoryPolicy> {
  let exclusions = current.exclusions;
  if (options.privacyPosture && options.privacyPosture !== current.privacy_posture) {
    exclusions = options.privacyPosture === 'custom_exclusions'
      ? exclusions.filter((pattern) => MANDATORY_HISTORY_EXCLUSIONS.includes(pattern))
      : [...exclusions, ...DEFAULT_HISTORY_EXCLUSIONS];
  }
  if (options.replaceExclusions) exclusions = options.exclusions ?? [];
  else if (options.exclusions && options.exclusions.length > 0) exclusions = [...exclusions, ...options.exclusions];
  return {
    ...current,
    enabled,
    roots: options.watchRoots && options.watchRoots.length > 0 ? options.watchRoots : current.roots,
    exclusions,
    max_file_size_bytes: options.maxFileSize ?? current.max_file_size_bytes,
    retention_days: options.retentionDays ?? current.retention_days,
    quota_bytes: options.quotaBytes ?? current.quota_bytes,
    debounce_ms: options.debounceMs ?? current.debounce_ms,
    stable_read_attempts: options.stableReadAttempts ?? current.stable_read_attempts,
    stable_read_delay_ms: options.stableReadDelayMs ?? current.stable_read_delay_ms,
    privacy_posture: options.privacyPosture ?? current.privacy_posture,
  };
}

export async function historyStatusCommand(options: HistoryOptions, _context: CommandContext): Promise<Result> {
  const target = resolveTarget(options);
  const policy = await loadPolicy(target);
  if (!policy) return result('missing_policy', { target, policy: null }, options.format);
  const store = await LocalHistoryStore.open({ target, policy, readOnly: true });
  try {
    const status = await store.status();
    const projection = options.userProjectionRoot ? await projectMetadata(store, options.userProjectionRoot) : null;
    return result('success', { ...status, user_site_projection_path: projection }, options.format);
  } finally {
    store.close();
  }
}

export async function historyConfigureCommand(options: HistoryOptions, _context: CommandContext): Promise<Result> {
  const target = resolveTarget(options);
  const seed = await policySeed(target, options);
  const policy = await writePolicy(target, applyPolicyOptions(seed.policy, options, seed.policy.enabled));
  return result('success', {
    policy,
    policy_path: target.policyPath,
    authority: target.ownerKind,
    policy_defaults_source: seed.source,
    policy_defaults_path: seed.defaults_path,
  }, options.format);
}

export async function historyEnableCommand(options: HistoryOptions, _context: CommandContext): Promise<Result> {
  const target = resolveTarget(options);
  assertHistoryArtifactsIgnored(target);
  const seed = await policySeed(target, options);
  const policy = await writePolicy(target, applyPolicyOptions(seed.policy, options, true));
  return result('success', {
    policy,
    policy_path: target.policyPath,
    store_root: target.storeRoot,
    policy_defaults_source: seed.source,
    policy_defaults_path: seed.defaults_path,
  }, options.format);
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
    const readiness = await waitForDaemonReady(target, child);
    if (readiness.error) throw new Error(readiness.error);
    return result(readiness.ready ? 'started' : 'starting', {
      pid: child.pid ?? null,
      target,
      mode: 'background',
      ready: readiness.ready,
      reason: readiness.reason ?? null,
    }, options.format);
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
    const projection = options.userProjectionRoot ? await projectMetadata(store, options.userProjectionRoot) : null;
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
  return { target, policy, store: await LocalHistoryStore.open({ target, policy, readOnly: true }) };
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
  const interval = options.pollIntervalMs === undefined ? [] : ['--poll-interval-ms', String(options.pollIntervalMs)];
  if (target.ownerKind === 'site') return ['--site-root', target.workspaceRoot, '--site-id', target.ownerId, ...interval];
  return ['--user-site-root', resolve(options.userSiteRoot as string), '--root', target.workspaceRoot, ...interval];
}

async function waitForDaemonReady(target: HistoryTarget, child: ReturnType<typeof spawn>, timeoutMs = 5000): Promise<{ ready: boolean; reason?: string; error?: string }> {
  let exited = false;
  let exitCode: number | null = null;
  let childError: Error | null = null;
  child.once('exit', (code) => {
    exited = true;
    exitCode = code;
  });
  child.once('error', (error) => {
    exited = true;
    childError = error instanceof Error ? error : new Error(String(error));
  });
  const daemonPath = resolve(target.storeRoot, 'daemon.json');
  const healthPath = resolve(target.storeRoot, 'health.json');
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const daemon = await readJson(daemonPath);
    const health = await readJson(healthPath);
    if (daemon?.pid === child.pid && health?.state === 'running') return { ready: true };
    if (exited) {
      return {
        ready: false,
        reason: exitCode === 0 ? 'daemon_exited' : 'daemon_start_failed',
        error: exitCode === 0 ? undefined : (childError ? String(childError) : `local_history_daemon_start_failed: ${exitCode}`),
      };
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 50));
  }
  return { ready: false, reason: 'daemon_start_pending' };
}

async function readJson(path: string): Promise<Record<string, unknown> | null> {
  try {
    await stat(path);
    return JSON.parse(await readFile(path, 'utf8')) as Record<string, unknown>;
  } catch {
    return null;
  }
}
