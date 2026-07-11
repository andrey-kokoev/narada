import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path';
import type { HistoryPrivacyPosture, HistoryTarget, LocalHistoryPolicy, LocalHistoryPolicyDefaults } from './types.js';

export const LOCAL_HISTORY_POLICY_SCHEMA = 'narada.local_work_history.policy.v1' as const;
export const LOCAL_HISTORY_DEFAULTS_SCHEMA = 'narada.local_work_history.defaults.v1' as const;

// These exclusions are a privacy floor. They remain effective even when a
// policy is hand-edited or a caller supplies an in-memory policy object.
export const MANDATORY_HISTORY_EXCLUSIONS = [
  '.git/**',
  '.narada/**',
  '.env',
  '.env.*',
  '**/*.pem',
  '**/*.key',
  '**/*.p12',
  '**/*secret*',
  '**/*credential*',
];

export const OPTIONAL_HISTORY_EXCLUSIONS = [
  '**/node_modules/**',
  '**/dist/**',
  '**/build/**',
];

export const DEFAULT_HISTORY_EXCLUSIONS = [
  ...MANDATORY_HISTORY_EXCLUSIONS,
  ...OPTIONAL_HISTORY_EXCLUSIONS,
];

export const USER_HISTORY_DEFAULTS_RELATIVE_PATH = join('config', 'local-history.defaults.json');

export function defaultPolicy(target: HistoryTarget, defaults: Partial<LocalHistoryPolicyDefaults> = {}): LocalHistoryPolicy {
  const privacyPosture = defaults.privacy_posture ?? 'default_exclusions';
  const baselineExclusions = privacyPosture === 'default_exclusions'
    ? DEFAULT_HISTORY_EXCLUSIONS
    : MANDATORY_HISTORY_EXCLUSIONS;
  return {
    schema: LOCAL_HISTORY_POLICY_SCHEMA,
    enabled: false,
    owner_kind: target.ownerKind,
    owner_id: target.ownerId,
    workspace_id: target.workspaceId,
    workspace_root: target.workspaceRoot,
    store_root: target.storeRoot,
    roots: defaults.roots ? [...defaults.roots] : ['.'],
    exclusions: uniqueStrings([...baselineExclusions, ...(defaults.exclusions ?? [])]),
    max_file_size_bytes: defaults.max_file_size_bytes ?? 5 * 1024 * 1024,
    debounce_ms: defaults.debounce_ms ?? 750,
    stable_read_attempts: defaults.stable_read_attempts ?? 3,
    stable_read_delay_ms: defaults.stable_read_delay_ms ?? 50,
    retention_days: defaults.retention_days ?? 30,
    quota_bytes: defaults.quota_bytes ?? 2 * 1024 * 1024 * 1024,
    privacy_posture: privacyPosture,
  };
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values)];
}

export async function loadUserHistoryDefaults(userSiteRoot: string): Promise<LocalHistoryPolicyDefaults | null> {
  const path = userHistoryDefaultsPath(userSiteRoot);
  try {
    const raw = await readFile(path, 'utf8');
    try {
      return validatePolicyDefaults(JSON.parse(raw) as unknown, path);
    } catch (error) {
      if (error instanceof SyntaxError) throw new Error(`local_history_defaults_corrupt: ${path}`);
      throw error;
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
}

export function userHistoryDefaultsPath(userSiteRoot: string): string {
  return join(resolve(userSiteRoot), USER_HISTORY_DEFAULTS_RELATIVE_PATH);
}

export function validatePolicyDefaults(value: unknown, sourcePath = 'local-history.defaults.json'): LocalHistoryPolicyDefaults {
  if (!value || typeof value !== 'object') throw new Error(`local_history_defaults_invalid: ${sourcePath}`);
  const input = value as Record<string, unknown>;
  const allowedFields = new Set([
    'schema', 'roots', 'exclusions', 'max_file_size_bytes', 'debounce_ms', 'stable_read_attempts',
    'stable_read_delay_ms', 'retention_days', 'quota_bytes', 'privacy_posture',
  ]);
  for (const field of Object.keys(input)) {
    if (!allowedFields.has(field)) throw new Error(`local_history_defaults_unknown_field: ${field}`);
  }
  if (input.schema !== LOCAL_HISTORY_DEFAULTS_SCHEMA) throw new Error(`local_history_defaults_schema_unsupported: ${sourcePath}`);
  const defaults: LocalHistoryPolicyDefaults = { schema: LOCAL_HISTORY_DEFAULTS_SCHEMA };
  if (input.roots !== undefined) {
    const roots = asStringArray(input.roots, 'roots');
    if (roots.length === 0) throw new Error(`local_history_defaults_roots_invalid: ${sourcePath}`);
    for (const root of roots) {
      if (!root || isAbsolute(root) || root.split(/[\\\\/]/).includes('..')) throw new Error(`local_history_root_not_relative: ${root}`);
    }
    defaults.roots = roots;
  }
  if (input.exclusions !== undefined) defaults.exclusions = asStringArray(input.exclusions, 'exclusions');
  if (input.max_file_size_bytes !== undefined) defaults.max_file_size_bytes = positiveInteger(input.max_file_size_bytes, 'max_file_size_bytes');
  if (input.debounce_ms !== undefined) defaults.debounce_ms = nonNegativeInteger(input.debounce_ms, 'debounce_ms');
  if (input.stable_read_attempts !== undefined) defaults.stable_read_attempts = positiveInteger(input.stable_read_attempts, 'stable_read_attempts');
  if (input.stable_read_delay_ms !== undefined) defaults.stable_read_delay_ms = nonNegativeInteger(input.stable_read_delay_ms, 'stable_read_delay_ms');
  if (input.retention_days !== undefined) defaults.retention_days = positiveInteger(input.retention_days, 'retention_days');
  if (input.quota_bytes !== undefined) defaults.quota_bytes = positiveInteger(input.quota_bytes, 'quota_bytes');
  if (input.privacy_posture !== undefined) defaults.privacy_posture = enumField(input.privacy_posture, ['default_exclusions', 'custom_exclusions'], 'privacy_posture') as HistoryPrivacyPosture;
  return defaults;
}

export function validatePolicy(value: unknown, target: HistoryTarget): LocalHistoryPolicy {
  if (!value || typeof value !== 'object') throw new Error('local_history_policy_invalid');
  const input = value as Record<string, unknown>;
  const allowedFields = new Set([
    'schema', 'enabled', 'owner_kind', 'owner_id', 'workspace_id', 'workspace_root', 'store_root',
    'roots', 'exclusions', 'max_file_size_bytes', 'debounce_ms', 'stable_read_attempts',
    'stable_read_delay_ms', 'retention_days', 'quota_bytes', 'privacy_posture',
  ]);
  for (const field of Object.keys(input)) {
    if (!allowedFields.has(field)) throw new Error(`local_history_policy_unknown_field: ${field}`);
  }
  if (input.schema !== LOCAL_HISTORY_POLICY_SCHEMA) throw new Error('local_history_policy_schema_unsupported');
  if (input.owner_kind !== target.ownerKind) throw new Error('local_history_policy_owner_kind_mismatch');
  if (typeof input.owner_id !== 'string' || input.owner_id !== target.ownerId) throw new Error('local_history_policy_owner_id_mismatch');
  if (typeof input.workspace_id !== 'string' || input.workspace_id !== target.workspaceId) throw new Error('local_history_policy_workspace_id_mismatch');
  if (typeof input.workspace_root !== 'string' || !input.workspace_root) throw new Error('local_history_policy_workspace_root_invalid');
  if (typeof input.store_root !== 'string' || !input.store_root) throw new Error('local_history_policy_store_root_invalid');
  // The authority identity is stable across a workspace move. The current target
  // owns the relocated policy and rewrites these derived absolute paths below.
  const roots = asStringArray(input.roots, 'roots');
  for (const root of roots) {
    if (!root || isAbsolute(root) || root.split(/[\\\\/]/).includes('..')) {
      throw new Error(`local_history_root_not_relative: ${root}`);
    }
  }
  const privacyPosture = enumField(input.privacy_posture, ['default_exclusions', 'custom_exclusions'], 'privacy_posture') as HistoryPrivacyPosture;
  const exclusions = uniqueStrings([
    ...(privacyPosture === 'default_exclusions' ? DEFAULT_HISTORY_EXCLUSIONS : MANDATORY_HISTORY_EXCLUSIONS),
    ...asStringArray(input.exclusions, 'exclusions'),
  ]);
  if (roots.length === 0) throw new Error('local_history_roots_invalid');
  const policy: LocalHistoryPolicy = {
    schema: LOCAL_HISTORY_POLICY_SCHEMA,
    enabled: booleanField(input.enabled, 'enabled'),
    owner_kind: target.ownerKind,
    owner_id: target.ownerId,
    workspace_id: target.workspaceId,
    workspace_root: target.workspaceRoot,
    store_root: target.storeRoot,
    roots,
    exclusions,
    max_file_size_bytes: positiveInteger(input.max_file_size_bytes, 'max_file_size_bytes'),
    debounce_ms: nonNegativeInteger(input.debounce_ms, 'debounce_ms'),
    stable_read_attempts: Math.max(1, positiveInteger(input.stable_read_attempts, 'stable_read_attempts')),
    stable_read_delay_ms: nonNegativeInteger(input.stable_read_delay_ms, 'stable_read_delay_ms'),
    retention_days: positiveInteger(input.retention_days, 'retention_days'),
    quota_bytes: positiveInteger(input.quota_bytes, 'quota_bytes'),
    privacy_posture: privacyPosture,
  };
  return policy;
}

export async function loadPolicy(target: HistoryTarget): Promise<LocalHistoryPolicy | null> {
  try {
    const raw = await readFile(target.policyPath, 'utf8');
    return validatePolicy(JSON.parse(raw) as unknown, target);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    if (error instanceof SyntaxError) throw new Error(`local_history_policy_corrupt: ${target.policyPath}`);
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
  await writeJsonAtomic(target.policyPath, policy);
  if (target.ownerKind === 'user_site') await writeWorkspaceIdentity(target);
  return policy;
}

export function buildSiteTarget({ siteRoot, siteId }: { siteRoot: string; siteId?: string }): HistoryTarget {
  const input = resolve(siteRoot);
  const authorityRoot = basename(input).toLowerCase() === '.narada' ? input : join(input, '.narada');
  const workspaceRoot = basename(input).toLowerCase() === '.narada' ? dirname(input) : input;
  const ownerId = validateOwnerId(siteId ?? inferSiteId(workspaceRoot));
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
  const identity = readWorkspaceIdentity(workspace);
  const policyKey = identity?.policy_key ?? stablePathId(workspace);
  const workspaceId = identity?.workspace_id ?? `user_root_${policyKey}`;
  validateOwnerId(policyKey);
  validateOwnerId(workspaceId);
  const storeKey = identity?.store_key ?? policyKey;
  validateOwnerId(storeKey);
  const storeRoot = join(authorityRoot, 'runtime', 'local-history', 'user-roots', storeKey);
  return {
    ownerKind: 'user_site',
    ownerId: 'andrey-user',
    workspaceRoot: workspace,
    workspaceId,
    authorityRoot,
    policyPath: join(authorityRoot, 'local-history-user', `${policyKey}.json`),
    storeRoot,
  };
}

function inferSiteId(workspaceRoot: string): string {
  return basename(workspaceRoot).toLowerCase().replace(/[^a-z0-9._-]+/g, '-');
}

function validateOwnerId(value: string): string {
  if (!value || value === '.' || value === '..' || value.includes('/') || value.includes('\\') || value.includes('\0')) {
    throw new Error('local_history_owner_id_invalid');
  }
  return value;
}

interface WorkspaceIdentity {
  schema: 'narada.local_work_history.workspace_identity.v1';
  workspace_id: string;
  policy_key: string;
  store_key: string;
}

function workspaceIdentityPath(workspaceRoot: string): string {
  return join(workspaceRoot, '.narada', 'local-history-workspace.json');
}

function readWorkspaceIdentity(workspaceRoot: string): WorkspaceIdentity | null {
  const path = workspaceIdentityPath(workspaceRoot);
  let raw: string;
  try {
    raw = readFileSync(path, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new Error(`local_history_workspace_identity_corrupt: ${path}`);
  }
  if (!value || typeof value !== 'object') throw new Error(`local_history_workspace_identity_corrupt: ${path}`);
  const identity = value as Partial<WorkspaceIdentity>;
  if (identity.schema !== 'narada.local_work_history.workspace_identity.v1') throw new Error(`local_history_workspace_identity_schema_unsupported: ${path}`);
  if (typeof identity.workspace_id !== 'string' || typeof identity.policy_key !== 'string' || typeof identity.store_key !== 'string') {
    throw new Error(`local_history_workspace_identity_corrupt: ${path}`);
  }
  try {
    validateOwnerId(identity.workspace_id);
    validateOwnerId(identity.policy_key);
    validateOwnerId(identity.store_key);
  } catch {
    throw new Error(`local_history_workspace_identity_corrupt: ${path}`);
  }
  return identity as WorkspaceIdentity;
}

async function writeWorkspaceIdentity(target: HistoryTarget): Promise<void> {
  const policyKey = basename(target.policyPath, '.json');
  const storeKey = basename(target.storeRoot);
  const path = workspaceIdentityPath(target.workspaceRoot);
  await mkdir(dirname(path), { recursive: true });
  await writeJsonAtomic(path, {
    schema: 'narada.local_work_history.workspace_identity.v1',
    workspace_id: target.workspaceId,
    policy_key: policyKey,
    store_key: storeKey,
  });
}

async function writeJsonAtomic(path: string, value: unknown): Promise<void> {
  const temporaryPath = `${path}.${randomUUID()}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  try {
    await rename(temporaryPath, path);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== 'EEXIST' && code !== 'EPERM') {
      await unlink(temporaryPath).catch(() => undefined);
      throw error;
    }
    await unlink(path).catch(() => undefined);
    await rename(temporaryPath, path);
  }
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
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0) throw new Error(`local_history_${field}_invalid`);
  return value;
}

function nonNegativeInteger(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) throw new Error(`local_history_${field}_invalid`);
  return value;
}

function booleanField(value: unknown, field: string): boolean {
  if (typeof value !== 'boolean') throw new Error(`local_history_${field}_invalid`);
  return value;
}

function enumField(value: unknown, allowed: string[], field: string): string {
  if (typeof value !== 'string' || !allowed.includes(value)) throw new Error(`local_history_${field}_invalid`);
  return value;
}

export function pathInsideWorkspace(workspaceRoot: string, candidate: string): boolean {
  const rel = relative(resolve(workspaceRoot), resolve(candidate));
  return rel === '' || (rel !== '..' && !rel.startsWith(`..${candidate.includes('\\') ? '\\' : '/'}`) && !isAbsolute(rel));
}
