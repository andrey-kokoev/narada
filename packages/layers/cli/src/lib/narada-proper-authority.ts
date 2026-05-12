import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { ExitCode } from './exit-codes.js';

export type SiteEmbodimentRole = 'authority' | 'read_only_forwarding' | 'read_only' | 'forwarding';

export interface SiteEmbodimentConfig {
  id?: string;
  kind?: string;
  root: string;
  role?: SiteEmbodimentRole;
  mutation_policy?: 'allow' | 'refuse' | 'forward' | 'refuse_or_forward';
  purpose?: string;
}

export interface AuthorityCloneConfig {
  site_id?: string;
  authority_root: string;
  embodiments?: SiteEmbodimentConfig[];
  /** @deprecated Use embodiments. */
  non_authority_embeddings?: Array<{ root: string; purpose?: string }>;
}

export interface SiteEmbodimentPosture {
  id: string | null;
  kind: string;
  root: string;
  role: SiteEmbodimentRole;
  mutation_policy: string;
  exists: boolean;
  current: boolean;
  ahead: number | null;
  behind: number | null;
  dirty_count: number | null;
  inbox_drop_count: number;
  status: 'current' | 'reachable' | 'missing';
  purpose: string | null;
}

export interface AuthorityClonePosture {
  configured: boolean;
  cwd: string;
  repo_root: string | null;
  authority_root: string | null;
  is_authority: boolean;
  temporary_authority_admission: boolean;
  stale: boolean;
  ahead: number | null;
  behind: number | null;
  runtime_origin: string;
  status: 'authority_clone' | 'non_authority_clone' | 'stale_authority_clone' | 'unconfigured';
  next_safe_command: string | null;
  embodiments: SiteEmbodimentPosture[];
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
  'work-next',
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
  if (command === 'work-next' && lastOptions(args)?.peek) return false;
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
  const embodiments = config ? inspectConfiguredEmbodiments(root, config) : [];
  const authorityRoot = config ? resolveConfiguredPath(root, config.authority_root) : null;
  const temporaryAuthorityAdmission = Boolean(config && isTemporaryAuthorityAdmitted(root, config));
  const isAuthority = authorityRoot ? samePath(root, authorityRoot) || temporaryAuthorityAdmission : temporaryAuthorityAdmission;
  const stale = Boolean(isAuthority && (behind ?? 0) > 0);

  return {
    configured: Boolean(config),
    cwd: resolvedCwd,
    repo_root: repoRoot,
    authority_root: authorityRoot,
    is_authority: isAuthority,
    temporary_authority_admission: temporaryAuthorityAdmission,
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
    embodiments,
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

function isTemporaryAuthorityAdmitted(root: string, config: AuthorityCloneConfig): boolean {
  const siteConfigPath = join(root, '.narada', 'site.json');
  if (!existsSync(siteConfigPath)) return false;
  try {
    const siteConfig = JSON.parse(readFileSync(siteConfigPath, 'utf8')) as {
      authority_admission?: {
        kind?: string;
        admitted_path?: string;
        canonical_authority_root?: string;
      };
    };
    const admission = siteConfig.authority_admission;
    if (admission?.kind !== 'operator_explicit_temporary_path_admission') return false;
    if (!admission.admitted_path || !samePath(root, admission.admitted_path)) return false;
    if (admission.canonical_authority_root && admission.canonical_authority_root !== config.authority_root) return false;
    return true;
  } catch {
    return false;
  }
}

function inspectConfiguredEmbodiments(root: string, config: AuthorityCloneConfig): SiteEmbodimentPosture[] {
  const configured = normalizeEmbodimentsConfig(config);
  return configured.map((embodiment) => {
    const embodimentRoot = resolveConfiguredPath(root, embodiment.root);
    const exists = existsSync(embodimentRoot);
    return {
      id: embodiment.id ?? null,
      kind: embodiment.kind ?? 'git_clone',
      root: embodimentRoot,
      role: embodiment.role ?? 'read_only_forwarding',
      mutation_policy: embodiment.mutation_policy ?? (embodiment.role === 'authority' ? 'allow' : 'refuse_or_forward'),
      exists,
      current: samePath(root, embodimentRoot),
      ahead: exists ? numberOrNull(git(embodimentRoot, ['rev-list', '--count', '@{u}..HEAD'])) : null,
      behind: exists ? numberOrNull(git(embodimentRoot, ['rev-list', '--count', 'HEAD..@{u}'])) : null,
      dirty_count: exists ? dirtyCount(embodimentRoot) : null,
      inbox_drop_count: exists ? inboxDropCount(embodimentRoot) : 0,
      status: samePath(root, embodimentRoot) ? 'current' : exists ? 'reachable' : 'missing',
      purpose: embodiment.purpose ?? null,
    };
  });
}

function normalizeEmbodimentsConfig(config: AuthorityCloneConfig): SiteEmbodimentConfig[] {
  if (Array.isArray(config.embodiments) && config.embodiments.length > 0) {
    return config.embodiments;
  }
  const result: SiteEmbodimentConfig[] = [
    {
      id: 'authority',
      kind: 'git_clone',
      root: config.authority_root,
      role: 'authority',
      mutation_policy: 'allow',
      purpose: 'Declared mutation authority clone',
    },
  ];
  for (const legacy of config.non_authority_embeddings ?? []) {
    result.push({
      kind: 'git_clone',
      root: legacy.root,
      role: 'read_only_forwarding',
      mutation_policy: 'refuse_or_forward',
      purpose: legacy.purpose,
    });
  }
  return result;
}

function resolveConfiguredPath(base: string, path: string): string {
  const windowsPath = path.match(/^([A-Za-z]):\\(.*)$/);
  if (windowsPath) {
    if (process.platform === 'win32') {
      return resolve(path);
    }
    return `/${process.env.NARADA_WINDOWS_MOUNT_ROOT ?? 'mnt'}/${windowsPath[1].toLowerCase()}/${windowsPath[2].replace(/\\/g, '/')}`;
  }
  const wslMountPath = path.match(/^\/mnt\/([A-Za-z])\/(.*)$/);
  if (process.platform === 'win32' && wslMountPath) {
    return resolve(`${wslMountPath[1].toUpperCase()}:\\${wslMountPath[2].replace(/\//g, '\\')}`);
  }
  return resolve(base, path);
}

function dirtyCount(cwd: string): number | null {
  const output = git(cwd, ['status', '--porcelain', '--untracked-files=no']);
  return output === null ? null : output.split('\n').filter(Boolean).length;
}

function inboxDropCount(root: string): number {
  const dropDir = join(root, '.ai', 'inbox-drop');
  try {
    return readdirSync(dropDir, { withFileTypes: true })
      .filter((entry) => entry.isFile() && !entry.name.startsWith('.'))
      .length;
  } catch {
    return 0;
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
    const output = execFileSync(gitBinary(), args, {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    return output || null;
  } catch {
    return null;
  }
}

function gitBinary(): string {
  return process.env.NARADA_GIT_BINARY ?? (process.platform === 'win32' ? 'git' : '/usr/bin/git');
}

function numberOrNull(value: string | null): number | null {
  if (value === null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}
