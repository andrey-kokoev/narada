import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { execFileGovernedSync } from '@narada2/process-launch-posture';
import { ExitCode } from '../lib/exit-codes.js';
import { formattedResult, type CliFormat } from '../lib/cli-output.js';
import { openTaskLifecycleStore, type TaskLifecycleStore } from '../lib/task-lifecycle-store.js';
import {
  inspectSiteMutationAuthorityPreflight,
  type SiteMutationAuthorityPreflightResult,
} from './site-mutation-authority-preflight.js';
import {
  type RepoPublicationRow,
  type RepoPublicationStatus,
} from '@narada2/intent-zones/repo-publication-intent';

export interface PublicationPrepareOptions {
  message?: string;
  by?: string;
  taskNumber?: number;
  include?: string[];
  governanceOnly?: boolean;
  remote?: string;
  baseRef?: string;
  cwd?: string;
  store?: TaskLifecycleStore;
  format?: CliFormat;
}

export interface PublicationConfirmOptions {
  publicationId?: string;
  status?: RepoPublicationStatus;
  by?: string;
  remoteRef?: string;
  failureReason?: string;
  cwd?: string;
  store?: TaskLifecycleStore;
  format?: CliFormat;
}

export interface PublicationListOptions {
  status?: RepoPublicationStatus;
  limit?: number;
  cwd?: string;
  store?: TaskLifecycleStore;
  format?: CliFormat;
}

function nowIso(): string {
  return new Date().toISOString();
}

function gitExecutable(): string {
  if (process.env.NARADA_GIT_BINARY) return process.env.NARADA_GIT_BINARY;
  if (existsSync('/usr/bin/git')) return '/usr/bin/git';
  return 'git';
}

function runGit(repoRoot: string, args: string[], gitDir?: string): string {
  const env = gitDir ? { ...process.env, GIT_DIR: gitDir, GIT_WORK_TREE: repoRoot } : process.env;
  return (execFileGovernedSync(gitExecutable(), args, {
    cwd: repoRoot,
    env,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }) as string).trim();
}

function gitDirWritable(repoRoot: string): boolean {
  const gitDir = runGit(repoRoot, ['rev-parse', '--absolute-git-dir']);
  const probe = join(gitDir, `.narada-write-probe-${process.pid}`);
  try {
    writeFileSync(probe, 'probe');
    rmSync(probe, { force: true });
    return true;
  } catch {
    return false;
  }
}

function stableIdForCommit(commitHash: string, requester: string): string {
  const digest = createHash('sha256').update(`${commitHash}\0${requester}`).digest('hex').slice(0, 12);
  return `rpi_${digest}`;
}

function normalizeIncludes(repoRoot: string, include: string[] | undefined): string[] {
  const values = include && include.length > 0 ? include : ['.'];
  return values.map((value) => {
    const abs = resolve(repoRoot, value);
    const rel = relative(repoRoot, abs);
    if (rel.startsWith('..') || rel === '') return rel === '' ? '.' : (() => { throw new Error(`Include path escapes repo: ${value}`); })();
    return rel;
  });
}

const GOVERNANCE_PUBLICATION_PATHS = [
  '.ai/chapters',
  '.ai/decisions',
  '.ai/do-not-open/tasks',
  '.ai/handoffs',
  '.ai/inbox-envelopes',
  '.ai/mutation-evidence',
  '.ai/reviews',
  '.ai/task-contracts',
  '.ai/task-lifecycle-snapshot.json',
];

function isGovernancePublicationPath(path: string): boolean {
  const normalized = path.replace(/\\/g, '/').replace(/^\.\//, '');
  return GOVERNANCE_PUBLICATION_PATHS.some((allowed) => {
    const clean = allowed.replace(/^\.\//, '');
    return normalized === clean || normalized.startsWith(`${clean}/`);
  });
}

function normalizePublicationIncludes(repoRoot: string, options: PublicationPrepareOptions): string[] {
  const requested = options.governanceOnly && (!options.include || options.include.length === 0)
    ? GOVERNANCE_PUBLICATION_PATHS
    : options.include;
  const includes = normalizeIncludes(repoRoot, requested);
  if (options.governanceOnly) {
    const forbidden = includes.filter((include) => include !== '.' && !isGovernancePublicationPath(include));
    if (forbidden.length > 0) {
      throw new Error(`--governance-only refuses non-governance include(s): ${forbidden.join(', ')}`);
    }
    const existing = includes.filter((include) => existsSync(resolve(repoRoot, include)));
    if (existing.length === 0) {
      throw new Error('--governance-only found no existing governance paths to stage');
    }
    return existing;
  }
  return includes;
}

function publicPublication(row: RepoPublicationRow): Record<string, unknown> {
  return {
    publication_id: row.publication_id,
    repo_root: row.repo_root,
    branch: row.branch,
    remote: row.remote,
    commit_hash: row.commit_hash,
    base_ref: row.base_ref,
    bundle_path: row.bundle_path,
    patch_path: row.patch_path,
    task_number: row.task_number,
    requester_id: row.requester_id,
    requested_at: row.requested_at,
    status: row.status,
    pushed_at: row.pushed_at,
    confirmed_by: row.confirmed_by,
    failure_reason: row.failure_reason,
    updated_at: row.updated_at,
  };
}

function renderPublication(row: RepoPublicationRow): string[] {
  const lines = [
    `Publication: ${row.publication_id}`,
    `Status:      ${row.status}`,
    `Commit:      ${row.commit_hash}`,
    `Bundle:      ${row.bundle_path}`,
  ];
  if (row.patch_path) lines.push(`Patch:       ${row.patch_path}`);
  if (row.status === 'prepared') {
    lines.push('', 'Prepared only. This is not a push confirmation.');
    lines.push(`Apply/push: git fetch ${row.bundle_path} main && git merge --ff-only FETCH_HEAD && git push ${row.remote} ${row.branch}`);
  }
  return lines;
}

function publicPublicationPreflight(preflight: SiteMutationAuthorityPreflightResult): Record<string, unknown> {
  return {
    mutation_family: preflight.mutation_family,
    locus_state: preflight.locus_state,
    mutation_safety: preflight.mutation_safety,
    next_safe_command: preflight.next_safe_command,
    reason: preflight.reason,
  };
}

function publicationPreflightError(preflight: SiteMutationAuthorityPreflightResult): { exitCode: ExitCode; result: unknown } | null {
  if (preflight.mutation_safety === 'allowed_with_command') return null;
  return {
    exitCode: ExitCode.GENERAL_ERROR,
    result: {
      status: 'error',
      reason: 'publication_authority_preflight_failed',
      publication_authority_preflight: publicPublicationPreflight(preflight),
      error: preflight.reason,
      next_safe_command: preflight.next_safe_command,
    },
  };
}

export async function publicationPrepareCommand(options: PublicationPrepareOptions): Promise<{ exitCode: ExitCode; result: unknown }> {
  const repoRoot = options.cwd ? resolve(options.cwd) : process.cwd();
  const format = options.format ?? 'auto';
  const requester = options.by?.trim();
  if (!requester) {
    return { exitCode: ExitCode.INVALID_CONFIG, result: { status: 'error', error: '--by is required' } };
  }
  const message = options.message?.trim();
  if (!message) {
    return { exitCode: ExitCode.INVALID_CONFIG, result: { status: 'error', error: '--message is required' } };
  }

  let store: TaskLifecycleStore | null = null;
  let tempGitDir: string | null = null;
  try {
    store = options.store ?? openTaskLifecycleStore(repoRoot);
    const preflight = inspectSiteMutationAuthorityPreflight({ cwd: repoRoot, mutationFamily: 'publication' });
    const preflightError = publicationPreflightError(preflight);
    if (preflightError) return preflightError;
    const branch = runGit(repoRoot, ['rev-parse', '--abbrev-ref', 'HEAD']);
    const remote = options.remote ?? 'origin';
    const baseRef = options.baseRef ?? `${remote}/${branch}`;
    const realGitDir = runGit(repoRoot, ['rev-parse', '--absolute-git-dir']);
    tempGitDir = mkdtempSync(join(tmpdir(), 'narada-publication-git-'));
    cpSync(realGitDir, tempGitDir, { recursive: true });

    const includes = normalizePublicationIncludes(repoRoot, options);
    runGit(repoRoot, ['add', ...includes], tempGitDir);
    const staged = runGit(repoRoot, ['diff', '--cached', '--name-only'], tempGitDir);
    if (!staged) throw new Error('No staged changes for publication handoff');
    runGit(repoRoot, ['commit', '-m', message], tempGitDir);
    const commitHash = runGit(repoRoot, ['rev-parse', 'HEAD'], tempGitDir);
    const publicationId = stableIdForCommit(commitHash, requester);
    const artifactDir = join(repoRoot, '.ai', 'publications', publicationId);
    mkdirSync(artifactDir, { recursive: true });
    const bundlePath = join(artifactDir, `${publicationId}.bundle`);
    const patchPath = join(artifactDir, `${publicationId}.patch`);
    runGit(repoRoot, ['bundle', 'create', bundlePath, `${baseRef}..HEAD`], tempGitDir);
    const patch = runGit(repoRoot, ['format-patch', '-1', '--stdout'], tempGitDir);
    writeFileSync(patchPath, `${patch}\n`);

    const now = nowIso();
    const row: RepoPublicationRow = {
      publication_id: publicationId,
      repo_root: repoRoot,
      branch,
      remote,
      commit_hash: commitHash,
      base_ref: baseRef,
      bundle_path: bundlePath,
      patch_path: patchPath,
      task_number: options.taskNumber ?? null,
      requester_id: requester,
      requested_at: now,
      status: 'prepared',
      pushed_at: null,
      confirmed_by: null,
      confirmation_json: JSON.stringify({
        git_metadata_writable: gitDirWritable(repoRoot),
        staged_files: staged.split(/\r?\n/).filter(Boolean),
        temp_git_dir: tempGitDir,
        governance_only: Boolean(options.governanceOnly),
        governance_include_paths: options.governanceOnly ? includes : [],
      }),
      failure_reason: null,
      updated_at: now,
    };
    store.upsertRepoPublication(row);
    return {
      exitCode: ExitCode.SUCCESS,
      result: formattedResult({
        status: 'success',
        publication: publicPublication(row),
        publication_authority_preflight: publicPublicationPreflight(preflight),
      }, renderPublication(row), format),
    };
  } catch (error) {
    return {
      exitCode: ExitCode.GENERAL_ERROR,
      result: { status: 'error', error: error instanceof Error ? error.message : String(error) },
    };
  } finally {
    if (!options.store) store?.db.close();
  }
}

export async function publicationConfirmCommand(options: PublicationConfirmOptions): Promise<{ exitCode: ExitCode; result: unknown }> {
  const repoRoot = options.cwd ? resolve(options.cwd) : process.cwd();
  const format = options.format ?? 'auto';
  if (!options.publicationId) {
    return { exitCode: ExitCode.INVALID_CONFIG, result: { status: 'error', error: 'publication id is required' } };
  }
  const status = options.status;
  if (status !== 'pushed' && status !== 'failed' && status !== 'abandoned') {
    return { exitCode: ExitCode.INVALID_CONFIG, result: { status: 'error', error: '--status must be pushed, failed, or abandoned' } };
  }
  if (!options.by) {
    return { exitCode: ExitCode.INVALID_CONFIG, result: { status: 'error', error: '--by is required' } };
  }
  let store: TaskLifecycleStore | null = null;
  try {
    store = options.store ?? openTaskLifecycleStore(repoRoot);
    const preflight = inspectSiteMutationAuthorityPreflight({ cwd: repoRoot, mutationFamily: 'publication' });
    const preflightError = publicationPreflightError(preflight);
    if (preflightError) return preflightError;
    const existing = store.getRepoPublication(options.publicationId);
    if (!existing) throw new Error(`Publication ${options.publicationId} not found`);
    const now = nowIso();
    const row: RepoPublicationRow = {
      ...existing,
      status,
      pushed_at: status === 'pushed' ? now : existing.pushed_at,
      confirmed_by: options.by,
      confirmation_json: JSON.stringify({ remote_ref: options.remoteRef ?? null, confirmed_at: now }),
      failure_reason: status === 'failed' || status === 'abandoned' ? options.failureReason ?? 'unspecified' : null,
      updated_at: now,
    };
    store.upsertRepoPublication(row);
    return {
      exitCode: ExitCode.SUCCESS,
      result: formattedResult({
        status: 'success',
        publication: publicPublication(row),
        publication_authority_preflight: publicPublicationPreflight(preflight),
      }, renderPublication(row), format),
    };
  } catch (error) {
    return {
      exitCode: ExitCode.GENERAL_ERROR,
      result: { status: 'error', error: error instanceof Error ? error.message : String(error) },
    };
  } finally {
    if (!options.store) store?.db.close();
  }
}

export async function publicationListCommand(options: PublicationListOptions): Promise<{ exitCode: ExitCode; result: unknown }> {
  const repoRoot = options.cwd ? resolve(options.cwd) : process.cwd();
  const format = options.format ?? 'auto';
  let store: TaskLifecycleStore | null = null;
  try {
    store = options.store ?? openTaskLifecycleStore(repoRoot);
    const publications = store.listRepoPublications(options.limit ?? 20, options.status ?? null);
    const result = {
      status: 'success',
      count: publications.length,
      publications: publications.map(publicPublication),
    };
    const lines = publications.length === 0
      ? ['No repo publications.']
      : publications.map((row) => `${row.publication_id} ${row.status} ${row.commit_hash.slice(0, 12)} ${basename(dirname(row.bundle_path))}`);
    return { exitCode: ExitCode.SUCCESS, result: formattedResult(result, lines, format) };
  } finally {
    if (!options.store) store?.db.close();
  }
}
