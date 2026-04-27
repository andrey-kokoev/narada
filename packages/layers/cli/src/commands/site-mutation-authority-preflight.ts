import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { formattedResult, type CliFormat } from '../lib/cli-output.js';
import { ExitCode } from '../lib/exit-codes.js';

export type SiteMutationFamily = 'task_lifecycle' | 'inbox' | 'publication' | 'secret' | 'site';
export type SiteMutationLocusState =
  | 'authority_locus'
  | 'read_only_embodiment'
  | 'stale_clone'
  | 'unknown'
  | 'unsupported';
export type MutationSafety = 'allowed_with_command' | 'inspect_only' | 'refuse';

export interface SiteMutationAuthorityPreflightOptions {
  cwd?: string;
  mutationFamily?: string;
  format?: CliFormat;
}

export interface SiteMutationAuthorityPreflightResult {
  status: 'success';
  cwd: string;
  mutation_family: string;
  locus_state: SiteMutationLocusState;
  mutation_safety: MutationSafety;
  next_safe_command: string;
  reason: string;
  repo: GitPosture | null;
  authority_files: AuthorityFiles;
  integration_hooks: Record<SiteMutationFamily, string[]>;
}

interface GitPosture {
  root: string;
  branch: string | null;
  upstream: string | null;
  head: string | null;
  upstream_head: string | null;
  ahead: number | null;
  behind: number | null;
  dirty_count: number;
}

interface AuthorityFiles {
  task_lifecycle_db: boolean;
  task_snapshot: boolean;
  tasks_dir: boolean;
  inbox_db: boolean;
  inbox_exports: boolean;
  publication_dir: boolean;
  site_config: boolean;
  read_only_marker: boolean;
}

const SUPPORTED_FAMILIES: SiteMutationFamily[] = ['task_lifecycle', 'inbox', 'publication', 'secret', 'site'];

export async function siteMutationAuthorityPreflightCommand(
  options: SiteMutationAuthorityPreflightOptions = {},
): Promise<{ exitCode: ExitCode; result: unknown }> {
  const cwd = resolve(options.cwd ?? process.cwd());
  const mutationFamily = String(options.mutationFamily ?? 'task_lifecycle');
  const repo = inspectGitPosture(cwd);
  const authorityRoot = repo?.root ?? cwd;
  const authorityFiles = inspectAuthorityFiles(authorityRoot);
  const classification = classifyLocus(mutationFamily, repo, authorityFiles);
  const result: SiteMutationAuthorityPreflightResult = {
    status: 'success',
    cwd,
    mutation_family: mutationFamily,
    locus_state: classification.locus_state,
    mutation_safety: classification.mutation_safety,
    next_safe_command: classification.next_safe_command,
    reason: classification.reason,
    repo,
    authority_files: authorityFiles,
    integration_hooks: buildIntegrationHooks(),
  };

  return {
    exitCode: ExitCode.SUCCESS,
    result: formattedResult(result, formatHuman(result), options.format ?? 'auto'),
  };
}

function classifyLocus(
  mutationFamily: string,
  repo: GitPosture | null,
  authorityFiles: AuthorityFiles,
): Pick<SiteMutationAuthorityPreflightResult, 'locus_state' | 'mutation_safety' | 'next_safe_command' | 'reason'> {
  if (!SUPPORTED_FAMILIES.includes(mutationFamily as SiteMutationFamily)) {
    return {
      locus_state: 'unsupported',
      mutation_safety: 'inspect_only',
      next_safe_command: 'narada sites authority preflight --mutation-family task_lifecycle',
      reason: `Unsupported mutation family: ${mutationFamily}.`,
    };
  }

  if (authorityFiles.read_only_marker) {
    return {
      locus_state: 'read_only_embodiment',
      mutation_safety: 'refuse',
      next_safe_command: 'Run this mutation at the declared authority locus, or submit an inbox observation from this embodiment.',
      reason: 'This checkout declares itself as a read-only embodiment.',
    };
  }

  if (repo && (repo.behind ?? 0) > 0) {
    return {
      locus_state: 'stale_clone',
      mutation_safety: 'inspect_only',
      next_safe_command: 'git pull --ff-only && narada mutation-evidence reconcile --apply',
      reason: 'The local branch is behind its upstream; mutation would risk writing against stale authority.',
    };
  }

  if (hasAuthoritySurface(authorityFiles)) {
    return {
      locus_state: 'authority_locus',
      mutation_safety: 'allowed_with_command',
      next_safe_command: recommendedCommand(mutationFamily as SiteMutationFamily),
      reason: 'Authority-bearing Narada state surfaces are present at this locus.',
    };
  }

  return {
    locus_state: 'unknown',
    mutation_safety: 'refuse',
    next_safe_command: 'narada sites authority preflight --cwd <authority-site> --mutation-family task_lifecycle',
    reason: 'No authority-bearing Narada state surface was found.',
  };
}

function hasAuthoritySurface(files: AuthorityFiles): boolean {
  return files.task_lifecycle_db
    || files.task_snapshot
    || files.tasks_dir
    || files.inbox_db
    || files.inbox_exports
    || files.publication_dir
    || files.site_config;
}

function recommendedCommand(family: SiteMutationFamily): string {
  switch (family) {
    case 'task_lifecycle':
      return 'narada work-next --agent <agent> --claim';
    case 'inbox':
      return 'narada inbox work-next --claim --by <principal>';
    case 'publication':
      return 'narada publication prepare --by <principal> --message "<message>"';
    case 'secret':
      return 'narada sites authority preflight --mutation-family secret && <sanctioned secret command>';
    case 'site':
      return 'narada sites lifecycle preflight <kind> --source-site <ref> --target-site <ref>';
  }
}

function inspectAuthorityFiles(root: string): AuthorityFiles {
  return {
    task_lifecycle_db: existsSync(join(root, '.ai', 'task-lifecycle.db')),
    task_snapshot: existsSync(join(root, '.ai', 'task-lifecycle-snapshot.json')),
    tasks_dir: existsSync(join(root, '.ai', 'do-not-open', 'tasks')),
    inbox_db: existsSync(join(root, '.ai', 'inbox.db')),
    inbox_exports: existsSync(join(root, '.ai', 'inbox-envelopes')),
    publication_dir: existsSync(join(root, '.ai', 'repo-publications')),
    site_config: existsSync(join(root, 'config.json')) || existsSync(join(root, '.narada-site.json')),
    read_only_marker: existsSync(join(root, '.ai', 'read-only-embodiment.json')),
  };
}

function inspectGitPosture(cwd: string): GitPosture | null {
  const root = git(cwd, ['rev-parse', '--show-toplevel']);
  if (!root) return null;
  return {
    root,
    branch: git(root, ['branch', '--show-current']),
    upstream: git(root, ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}']),
    head: git(root, ['rev-parse', 'HEAD']),
    upstream_head: git(root, ['rev-parse', '@{u}']),
    ahead: numberOrNull(git(root, ['rev-list', '--count', '@{u}..HEAD'])),
    behind: numberOrNull(git(root, ['rev-list', '--count', 'HEAD..@{u}'])),
    dirty_count: git(root, ['status', '--porcelain'])?.split('\n').filter(Boolean).length ?? 0,
  };
}

function git(cwd: string, args: string[]): string | null {
  try {
    const output = execFileSync(process.env.NARADA_GIT_BINARY ?? '/usr/bin/git', args, {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    return output.length > 0 ? output : null;
  } catch {
    return null;
  }
}

function numberOrNull(value: string | null): number | null {
  if (value === null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function buildIntegrationHooks(): Record<SiteMutationFamily, string[]> {
  return {
    task_lifecycle: [
      'preflight before task claim/report/review/finish/close/reopen/release/confirm',
      'deny mutation when locus_state is read_only_embodiment, stale_clone, unknown, or unsupported',
    ],
    inbox: [
      'preflight before inbox submit/import/claim/release/promote/work-next --claim',
      'allow read-only inbox list/show/next without mutation preflight',
    ],
    publication: [
      'preflight before publication prepare/confirm and push handoff publication',
      'require clean upstream posture before remote publication confirmation',
    ],
    secret: [
      'preflight before credential or secret material writes',
      'never treat read-only embodiment as secret authority',
    ],
    site: [
      'preflight before Site lifecycle transformations',
      'route lifecycle details through narada sites lifecycle preflight',
    ],
  };
}

function formatHuman(result: SiteMutationAuthorityPreflightResult): string[] {
  return [
    `Site mutation authority preflight: ${result.locus_state}`,
    `Mutation family: ${result.mutation_family}`,
    `Safety: ${result.mutation_safety}`,
    `Reason: ${result.reason}`,
    `Next safe command: ${result.next_safe_command}`,
    `Repo: ${result.repo ? `${result.repo.branch ?? '(detached)'} behind=${result.repo.behind ?? 'n/a'} ahead=${result.repo.ahead ?? 'n/a'} dirty=${result.repo.dirty_count}` : 'none'}`,
  ];
}
