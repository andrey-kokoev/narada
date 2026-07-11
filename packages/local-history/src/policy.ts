import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path';
import type { HistoryTarget, LocalHistoryPolicy } from './types.js';

export const LOCAL_HISTORY_POLICY_SCHEMA = 'narada.local_work_history.policy.v1' as const;

export const DEFAULT_HISTORY_EXCLUSIONS = [
  '.git/**',
  '.narada/**',
  '.narada/runtime/local-history/**',
  '.env',
  '.env.*',
  '**/*.pem',
  '**/*.key',
  '**/*.p12',
  '**/*secret*',
  '**/*credential*',
  '**/node_modules/**',
  '**/dist/**',
  '**/build/**',
];

export function defaultPolicy(target: HistoryTarget): LocalHistoryPolicy {
  return {
    schema: LOCAL_HISTORY_POLICY_SCHEMA,
    enabled: false,
    owner_kind: target.ownerKind,
    owner_id: target.ownerId,
    workspace_id: target.workspaceId,
    workspace_root: target.workspaceRoot,
    store_root: target.storeRoot,
    roots: ['.'],
    exclusions: [...DEFAULT_HISTORY_EXCLUSIONS],
    max_file_size_bytes: 5 * 1024 * 1024,
    debounce_ms: 750,
    stable_read_attempts: 3,
    stable_read_delay_ms: 50,
    retention_days: 30,
    quota_bytes: 2 * 1024 * 1024 * 1024,
    privacy_posture: 'default_exclusions',
  };
}

export function validatePolicy(value: unknown, target: HistoryTarget): LocalHistoryPolicy {
  if (!value || typeof value !== 'object') throw new Error('local_history_policy_invalid');
  const input = value as Record<string, unknown>;
  if (input.schema !== LOCAL_HISTORY_POLICY_SCHEMA) throw new Error('local_history_policy_schema_unsupported');
  if (input.owner_kind !== target.ownerKind) throw new Error('local_history_policy_owner_kind_mismatch');
  if (String(input.owner_id ?? '') !== target.ownerId) throw new Error('local_history_policy_owner_id_mismatch');
  if (String(input.workspace_id ?? '') !== target.workspaceId) throw new Error('local_history_policy_workspace_id_mismatch');
  if (resolve(String(input.workspace_root ?? '')) !== target.workspaceRoot) throw new Error('local_history_policy_workspace_root_mismatch');
  if (resolve(String(input.store_root ?? '')) !== target.storeRoot) throw new Error('local_history_policy_store_root_mismatch');
  const roots = asStringArray(input.roots, 'roots');
  for (const root of roots) {
    if (isAbsolute(root) || root.split(/[\\\\/]/).includes('..')) {
      throw new Error(`local_history_root_not_relative: ${root}`);
    }
  }
  const exclusions = asStringArray(input.exclusions, 'exclusions');
  const policy: LocalHistoryPolicy = {
    schema: LOCAL_HISTORY_POLICY_SCHEMA,
    enabled: input.enabled === true,
    owner_kind: target.ownerKind,
    owner_id: target.ownerId,
    workspace_id: target.workspaceId,
    workspace_root: target.workspaceRoot,
    store_root: target.storeRoot,
    roots: roots.length > 0 ? roots : ['.'],
    exclusions,
    max_file_size_bytes: positiveInteger(input.max_file_size_bytes, 'max_file_size_bytes'),
    debounce_ms: nonNegativeInteger(input.debounce_ms, 'debounce_ms'),
    stable_read_attempts: Math.max(1, positiveInteger(input.stable_read_attempts, 'stable_read_attempts')),
    stable_read_delay_ms: nonNegativeInteger(input.stable_read_delay_ms, 'stable_read_delay_ms'),
    retention_days: positiveInteger(input.retention_days, 'retention_days'),
    quota_bytes: positiveInteger(input.quota_bytes, 'quota_bytes'),
    privacy_posture: input.privacy_posture === 'custom_exclusions' ? 'custom_exclusions' : 'default_exclusions',
  };
  return policy;
}

export async function loadPolicy(target: HistoryTarget): Promise<LocalHistoryPolicy | null> {
  try {
    const raw = await readFile(target.policyPath, 'utf8');
    return validatePolicy(JSON.parse(raw) as unknown, target);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
}

export async function writePolicy(target: HistoryTarget, input: Partial<LocalHistoryPolicy>): Promise<LocalHistoryPolicy> {
  const current = await loadPolicy(target);
  const policy = validatePolicy({
    ...(current ?? defaultPolicy(target)),
    ...input,
    schema: LOCAL_HISTORY_POLICY_SCHEMA,
    owner_kind: target.ownerKind,
    owner_id: target.ownerId,
    workspace_id: target.workspaceId,
    workspace_root: target.workspaceRoot,
    store_root: target.storeRoot,
  }, target);
  await mkdir(dirname(target.policyPath), { recursive: true });
  await writeFile(target.policyPath, `${JSON.stringify(policy, null, 2)}\n`, 'utf8');
  return policy;
}

export function buildSiteTarget({ siteRoot, siteId }: { siteRoot: string; siteId?: string }): HistoryTarget {
  const input = resolve(siteRoot);
  const authorityRoot = basename(input).toLowerCase() === '.narada' ? input : join(input, '.narada');
  const workspaceRoot = basename(input).toLowerCase() === '.narada' ? dirname(input) : input;
  const ownerId = siteId ?? inferSiteId(workspaceRoot);
  const storeRoot = join(authorityRoot, 'runtime', 'local-history');
  return {
    ownerKind: 'site',
    ownerId,
    workspaceRoot,
    workspaceId: `site_${ownerId}`,
    authorityRoot,
    policyPath: join(authorityRoot, 'local-history.json'),
    storeRoot,
  };
}

export function buildUserTarget({ userSiteRoot, workspaceRoot }: { userSiteRoot: string; workspaceRoot: string }): HistoryTarget {
  const userRoot = resolve(userSiteRoot);
  const workspace = resolve(workspaceRoot);
  const authorityRoot = basename(userRoot).toLowerCase() === '.narada' ? userRoot : join(userRoot, '.narada');
  const storeRoot = join(authorityRoot, 'runtime', 'local-history', 'user-roots', stablePathId(workspace));
  return {
    ownerKind: 'user_site',
    ownerId: 'andrey-user',
    workspaceRoot: workspace,
    workspaceId: `user_root_${stablePathId(workspace)}`,
    authorityRoot,
    policyPath: join(authorityRoot, 'local-history-user', `${stablePathId(workspace)}.json`),
    storeRoot,
  };
}

function inferSiteId(workspaceRoot: string): string {
  return basename(workspaceRoot).toLowerCase().replace(/[^a-z0-9._-]+/g, '-');
}

function stablePathId(path: string): string {
  const normalized = resolve(path).toLowerCase().replaceAll('\\', '/');
  const label = normalized.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 64) || 'root';
  const digest = createHash('sha256').update(normalized, 'utf8').digest('hex').slice(0, 16);
  return `${label}-${digest}`;
}

function asStringArray(value: unknown, field: string): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) throw new Error(`local_history_${field}_invalid`);
  return value.map((item) => String(item));
}

function positiveInteger(value: unknown, field: string): number {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number <= 0) throw new Error(`local_history_${field}_invalid`);
  return number;
}

function nonNegativeInteger(value: unknown, field: string): number {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 0) throw new Error(`local_history_${field}_invalid`);
  return number;
}

export function pathInsideWorkspace(workspaceRoot: string, candidate: string): boolean {
  const rel = relative(resolve(workspaceRoot), resolve(candidate));
  return rel === '' || (rel !== '..' && !rel.startsWith(`..${candidate.includes('\\') ? '\\' : '/'}`) && !isAbsolute(rel));
}
