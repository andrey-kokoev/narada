import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { ExitCode } from './exit-codes.js';

export interface AuthorityCloneConfig {
  authority_root: string;
  non_authority_embeddings?: Array<{ root: string; purpose?: string }>;
}

export interface AuthorityClonePosture {
  configured: boolean;
  cwd: string;
  repo_root: string | null;
  authority_root: string | null;
  is_authority: boolean;
  stale: boolean;
  ahead: number | null;
  behind: number | null;
  runtime_origin: string;
  status: 'authority_clone' | 'non_authority_clone' | 'stale_authority_clone' | 'unconfigured';
  next_safe_command: string | null;
}

export class AuthorityCloneRefusal extends Error {
  readonly result: {
    status: 'error';
    error: string;
    authority_clone: AuthorityClonePosture;
  };

  constructor(posture: AuthorityClonePosture, command: string) {
    super(`Refusing ${command}: current clone is not the declared Narada proper authority clone.`);
    this.result = {
      status: 'error',
      error: this.message,
      authority_clone: posture,
    };
  }
}

const MUTATING_PREFIXES = [
  'task allocate',
  'task create',
  'task amend',
  'task promote-recommendation',
  'task pull-next',
  'task work-next',
  'task claim',
  'task release',
  'task report',
  'task continue',
  'task finish',
  'task review',
  'task close',
  'task reopen',
  'task confirm',
  'task dispatch',
  'task roster',
  'task lifecycle import',
  'task reconcile record',
  'task reconcile repair',
  'chapter init',
  'chapter close',
  'chapter finish-range',
  'inbox submit',
  'inbox import',
  'inbox claim',
  'inbox release',
  'inbox promote',
  'inbox triage',
  'inbox pending',
  'inbox task',
  'inbox work-next',
  'publication prepare',
  'publication confirm',
  'mutation-evidence reconcile',
];

export function shouldGuardAuthorityClone(command: string, args: unknown[]): boolean {
  if (command === 'task allocate' && lastOptions(args)?.dryRun) return false;
  if (command === 'task create' && lastOptions(args)?.dryRun) return false;
  if (command === 'task work-next' && lastOptions(args)?.peek) return false;
  if (command === 'inbox work-next' && lastOptions(args)?.peek) return false;
  if (command === 'mutation-evidence reconcile' && !lastOptions(args)?.apply) return false;
  return MUTATING_PREFIXES.some((prefix) => command === prefix || command.startsWith(`${prefix} `));
}

export function assertAuthorityCloneForMutation(command: string, args: unknown[]): void {
  if (!shouldGuardAuthorityClone(command, args)) return;
  const cwd = resolve(String(lastOptions(args)?.cwd ?? process.cwd()));
  const posture = inspectAuthorityClonePosture(cwd);
  if (!posture.configured || posture.is_authority && !posture.stale) return;
  throw new AuthorityCloneRefusal(posture, command);
}

export function inspectAuthorityClonePosture(cwd = process.cwd()): AuthorityClonePosture {
  const resolvedCwd = resolve(cwd);
  const repoRoot = git(resolvedCwd, ['rev-parse', '--show-toplevel']);
  const root = repoRoot ?? resolvedCwd;
  const configPath = join(root, '.ai', 'authority-clone.json');
  const config = readAuthorityCloneConfig(configPath);
  const ahead = numberOrNull(git(root, ['rev-list', '--count', '@{u}..HEAD']));
  const behind = numberOrNull(git(root, ['rev-list', '--count', 'HEAD..@{u}']));
  const authorityRoot = config ? resolve(root, config.authority_root) : null;
  const isAuthority = authorityRoot ? samePath(root, authorityRoot) : false;
  const stale = Boolean(isAuthority && (behind ?? 0) > 0);

  return {
    configured: Boolean(config),
    cwd: resolvedCwd,
    repo_root: repoRoot,
    authority_root: authorityRoot,
    is_authority: isAuthority,
    stale,
    ahead,
    behind,
    runtime_origin: `${process.platform}:${process.cwd()}`,
    status: !config
      ? 'unconfigured'
      : stale
        ? 'stale_authority_clone'
        : isAuthority
          ? 'authority_clone'
          : 'non_authority_clone',
    next_safe_command: !config || isAuthority && !stale
      ? null
      : stale
        ? 'git pull --ff-only && narada mutation-evidence reconcile --apply'
        : `cd ${authorityRoot} && narada <same-command>`,
  };
}

export function authorityCloneErrorToCommandResult(error: unknown): { exitCode: ExitCode; result: unknown } | null {
  if (!(error instanceof AuthorityCloneRefusal)) return null;
  return { exitCode: ExitCode.GENERAL_ERROR, result: error.result };
}

function readAuthorityCloneConfig(path: string): AuthorityCloneConfig | null {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as AuthorityCloneConfig;
  } catch {
    return null;
  }
}

function lastOptions(args: unknown[]): Record<string, unknown> | null {
  const last = args[args.length - 1];
  return last && typeof last === 'object' && !Array.isArray(last) ? last as Record<string, unknown> : null;
}

function samePath(a: string, b: string): boolean {
  return resolve(a) === resolve(b);
}

function git(cwd: string, args: string[]): string | null {
  try {
    const output = execFileSync(process.env.NARADA_GIT_BINARY ?? '/usr/bin/git', args, {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    return output || null;
  } catch {
    return null;
  }
}

function numberOrNull(value: string | null): number | null {
  if (value === null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}
