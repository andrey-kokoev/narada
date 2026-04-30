import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import type { CommandContext } from '../lib/command-wrapper.js';
import { ExitCode } from '../lib/exit-codes.js';
import {
  capabilityRegistryPath,
  type CredentialBindingProvenance,
  grantEffectiveStatus,
  makeCapabilityGrant,
  parseCsv,
  parseScopeJson,
  readCapabilityRegistry,
  validateCredentialRef,
  writeCapabilityRegistry,
} from '../lib/capability-consent-registry.js';
import { inboxSubmitCommand } from './inbox.js';

export interface CapabilityGrantOptions {
  cwd?: string;
  site?: string;
  principal?: string;
  agent?: string;
  kind?: string;
  scope?: string;
  allow?: string;
  deny?: string;
  credentialRef?: string;
  evidenceRef?: string;
  expiresAt?: string;
  by?: string;
  format?: string;
}

export interface CapabilityBindCredentialOptions extends CapabilityGrantOptions {
  localEnv?: string;
  reusedFromSite?: string;
  rationale?: string;
}

export interface CapabilityListOptions {
  cwd?: string;
  site?: string;
  principal?: string;
  agent?: string;
  kind?: string;
  status?: string;
  limit?: number;
  format?: string;
}

export interface CapabilityExplainOptions {
  cwd?: string;
  grantId?: string;
  format?: string;
}

export interface CapabilityRevokeOptions {
  cwd?: string;
  grantId?: string;
  by?: string;
  reason?: string;
  format?: string;
}

export interface CapabilityAnnouncementOptions {
  cwd?: string;
  id?: string;
  summary?: string;
  ownerSite?: string;
  authorityScope?: string;
  usableBy?: string;
  entrypoint?: string;
  prerequisite?: string;
  evidence?: string;
  constraint?: string;
  safetyPosture?: string;
  adoptionPosture?: string;
  supersedes?: string;
  by?: string;
  format?: string;
}

export interface CapabilityAnnouncementListOptions {
  cwd?: string;
  ownerSite?: string;
  status?: string;
  limit?: number;
  format?: string;
}

export interface CapabilityAnnouncementShowOptions {
  cwd?: string;
  id?: string;
  format?: string;
}

export interface CapabilityAnnouncementPublishOptions {
  cwd?: string;
  id?: string;
  by?: string;
  targetLocus?: string;
  format?: string;
}

export interface CapabilityAnnouncementSupersedeOptions {
  cwd?: string;
  id?: string;
  replacementId?: string;
  by?: string;
  reason?: string;
  format?: string;
}

export type CapabilityAnnouncementStatus = 'active' | 'superseded' | 'withdrawn';

export interface CapabilityAnnouncement {
  capability_id: string;
  version: number;
  summary: string;
  owner_site: string;
  authority_scope: string;
  usable_by: string[];
  entrypoints: string[];
  prerequisites: string[];
  evidence: string[];
  constraints: string[];
  safety_posture: string;
  adoption_posture: string;
  status: CapabilityAnnouncementStatus;
  supersedes: string | null;
  superseded_by: string | null;
  supersession_reason: string | null;
  announced_by: string;
  announced_at: string;
  updated_at: string;
}

export interface CapabilityAnnouncementRegistry {
  registry_kind: 'capability_announcement_registry';
  registry_version: 1;
  announcements: CapabilityAnnouncement[];
}

function requireOption(value: string | undefined, name: string): string {
  if (!value?.trim()) {
    throw new Error(`${name} is required`);
  }
  return value.trim();
}

function normalizeError(error: unknown): { exitCode: ExitCode; result: unknown } {
  const message = error instanceof Error ? error.message : String(error);
  return {
    exitCode: ExitCode.INVALID_CONFIG,
    result: { status: 'error', error: message },
  };
}

export function capabilityAnnouncementRegistryPath(cwd: string): string {
  return join(resolve(cwd), '.ai', 'capability-announcements.json');
}

async function readCapabilityAnnouncementRegistry(cwd: string): Promise<CapabilityAnnouncementRegistry> {
  const path = capabilityAnnouncementRegistryPath(cwd);
  if (!existsSync(path)) {
    return {
      registry_kind: 'capability_announcement_registry',
      registry_version: 1,
      announcements: [],
    };
  }
  const parsed = JSON.parse(await readFile(path, 'utf8')) as CapabilityAnnouncementRegistry;
  return {
    registry_kind: 'capability_announcement_registry',
    registry_version: 1,
    announcements: Array.isArray(parsed.announcements) ? parsed.announcements : [],
  };
}

async function writeCapabilityAnnouncementRegistry(
  cwd: string,
  registry: CapabilityAnnouncementRegistry,
): Promise<string> {
  const path = capabilityAnnouncementRegistryPath(cwd);
  await mkdir(dirname(path), { recursive: true });
  const tempPath = `${path}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(tempPath, `${JSON.stringify(registry, null, 2)}\n`, 'utf8');
  await rename(tempPath, path);
  return path;
}

function parseList(value: string | undefined): string[] {
  return parseCsv(value);
}

function makeAnnouncement(options: CapabilityAnnouncementOptions): CapabilityAnnouncement {
  const now = new Date().toISOString();
  return {
    capability_id: requireOption(options.id, '--id'),
    version: 1,
    summary: requireOption(options.summary, '--summary'),
    owner_site: requireOption(options.ownerSite, '--owner-site'),
    authority_scope: requireOption(options.authorityScope, '--authority-scope'),
    usable_by: parseList(options.usableBy),
    entrypoints: parseList(options.entrypoint),
    prerequisites: parseList(options.prerequisite),
    evidence: parseList(options.evidence),
    constraints: parseList(options.constraint),
    safety_posture: options.safetyPosture?.trim() || 'metadata_only',
    adoption_posture: options.adoptionPosture?.trim() || 'operator_entrypoint',
    status: 'active',
    supersedes: options.supersedes?.trim() || null,
    superseded_by: null,
    supersession_reason: null,
    announced_by: requireOption(options.by, '--by'),
    announced_at: now,
    updated_at: now,
  };
}

export async function capabilityGrantCommand(
  options: CapabilityGrantOptions,
  _context: CommandContext,
): Promise<{ exitCode: ExitCode; result: unknown }> {
  try {
    const cwd = options.cwd ?? '.';
    const siteId = requireOption(options.site, '--site');
    const principalId = requireOption(options.principal, '--principal');
    const kind = requireOption(options.kind, '--kind');
    const grantedBy = requireOption(options.by, '--by');
    const allowedActions = parseCsv(options.allow);
    if (allowedActions.length === 0) {
      throw new Error('--allow must include at least one action');
    }
    const credentialRef = validateCredentialRef(options.credentialRef);
    const grant = makeCapabilityGrant({
      siteId,
      principalId,
      agentId: options.agent,
      capabilityKind: kind,
      scope: parseScopeJson(options.scope),
      allowedActions,
      deniedActions: parseCsv(options.deny),
      credentialRef,
      evidenceRef: options.evidenceRef,
      expiresAt: options.expiresAt,
      grantedBy,
    });
    const registry = await readCapabilityRegistry(cwd);
    registry.grants.push(grant);
    const path = await writeCapabilityRegistry(cwd, registry);
    return {
      exitCode: ExitCode.SUCCESS,
      result: {
        status: 'success',
        mutation_performed: true,
        registry_path: path,
        grant,
        secret_values_stored: false,
      },
    };
  } catch (error) {
    return normalizeError(error);
  }
}

export async function capabilityBindCredentialCommand(
  options: CapabilityBindCredentialOptions,
  _context: CommandContext,
): Promise<{ exitCode: ExitCode; result: unknown }> {
  try {
    const cwd = options.cwd ?? '.';
    const siteId = requireOption(options.site, '--site');
    const principalId = requireOption(options.principal, '--principal');
    const kind = requireOption(options.kind, '--kind');
    const grantedBy = requireOption(options.by, '--by');
    const allowedActions = parseCsv(options.allow);
    if (allowedActions.length === 0) {
      throw new Error('--allow must include at least one action');
    }
    const credentialRef = validateCredentialRef(options.credentialRef);
    const localEnv = options.localEnv?.trim() || null;
    const localStatus: CredentialBindingProvenance['local_material']['status'] = localEnv
      ? process.env[localEnv]?.trim() ? 'present' : 'missing'
      : 'not_checked';
    const now = new Date().toISOString();
    const provenance: CredentialBindingProvenance = {
      binding_kind: 'credential_reference_reuse',
      credential_ref: credentialRef,
      reused_from_site: options.reusedFromSite?.trim() || null,
      local_material: {
        checked: Boolean(localEnv),
        env_var: localEnv,
        status: localStatus,
      },
      rationale: options.rationale?.trim() || null,
      recorded_by: grantedBy,
      recorded_at: now,
      raw_secret_stored: false,
    };
    const grant = makeCapabilityGrant({
      siteId,
      principalId,
      agentId: options.agent,
      capabilityKind: kind,
      scope: parseScopeJson(options.scope),
      allowedActions,
      deniedActions: parseCsv(options.deny),
      credentialRef,
      evidenceRef: options.evidenceRef,
      expiresAt: options.expiresAt,
      credentialProvenance: provenance,
      grantedBy,
      now: new Date(now),
    });
    const registry = await readCapabilityRegistry(cwd);
    registry.grants.push(grant);
    const path = await writeCapabilityRegistry(cwd, registry);
    return {
      exitCode: ExitCode.SUCCESS,
      result: {
        status: 'success',
        mutation_performed: true,
        registry_path: path,
        grant,
        credential_binding: provenance,
        local_secret_material_available: localStatus === 'present',
        local_secret_material_status: localStatus,
        secret_values_stored: false,
        warnings: localStatus === 'missing'
          ? [`Local secret material not found in env var ${localEnv}; credential reference is recorded but runtime availability remains unresolved.`]
          : [],
      },
    };
  } catch (error) {
    return normalizeError(error);
  }
}

export async function capabilityAnnouncementCreateCommand(
  options: CapabilityAnnouncementOptions,
  _context: CommandContext,
): Promise<{ exitCode: ExitCode; result: unknown }> {
  try {
    const cwd = options.cwd ?? '.';
    const announcement = makeAnnouncement(options);
    const registry = await readCapabilityAnnouncementRegistry(cwd);
    const existing = registry.announcements.find((entry) => entry.capability_id === announcement.capability_id);
    if (existing && existing.status === 'active') {
      throw new Error(`Capability announcement already exists: ${announcement.capability_id}`);
    }
    registry.announcements = [
      ...registry.announcements.filter((entry) => entry.capability_id !== announcement.capability_id),
      announcement,
    ].sort((a, b) => a.capability_id.localeCompare(b.capability_id));
    const path = await writeCapabilityAnnouncementRegistry(cwd, registry);
    return {
      exitCode: ExitCode.SUCCESS,
      result: {
        status: 'success',
        mutation_performed: true,
        registry_path: path,
        announcement,
      },
    };
  } catch (error) {
    return normalizeError(error);
  }
}

export async function capabilityAnnouncementListCommand(
  options: CapabilityAnnouncementListOptions,
  _context: CommandContext,
): Promise<{ exitCode: ExitCode; result: unknown }> {
  const cwd = options.cwd ?? '.';
  const registry = await readCapabilityAnnouncementRegistry(cwd);
  const limit = options.limit ?? 20;
  const announcements = registry.announcements
    .filter((entry) => !options.ownerSite || entry.owner_site === options.ownerSite)
    .filter((entry) => !options.status || entry.status === options.status)
    .slice(0, limit);
  return {
    exitCode: ExitCode.SUCCESS,
    result: {
      status: 'success',
      mutation_performed: false,
      registry_path: capabilityAnnouncementRegistryPath(cwd),
      count: announcements.length,
      limit,
      announcements,
    },
  };
}

export async function capabilityAnnouncementShowCommand(
  options: CapabilityAnnouncementShowOptions,
  _context: CommandContext,
): Promise<{ exitCode: ExitCode; result: unknown }> {
  const id = requireOption(options.id, '<id>');
  const cwd = options.cwd ?? '.';
  const registry = await readCapabilityAnnouncementRegistry(cwd);
  const announcement = registry.announcements.find((entry) => entry.capability_id === id);
  if (!announcement) {
    return {
      exitCode: ExitCode.INVALID_CONFIG,
      result: { status: 'error', error: `Capability announcement not found: ${id}` },
    };
  }
  return {
    exitCode: ExitCode.SUCCESS,
    result: {
      status: 'success',
      mutation_performed: false,
      registry_path: capabilityAnnouncementRegistryPath(cwd),
      announcement,
    },
  };
}

export async function capabilityAnnouncementPublishCommand(
  options: CapabilityAnnouncementPublishOptions,
  context: CommandContext,
): Promise<{ exitCode: ExitCode; result: unknown }> {
  const show = await capabilityAnnouncementShowCommand({ cwd: options.cwd, id: options.id, format: 'json' }, context);
  if (show.exitCode !== ExitCode.SUCCESS) return show;
  const announcement = (show.result as { announcement: CapabilityAnnouncement }).announcement;
  await mkdir(join(resolve(options.cwd ?? '.'), '.ai'), { recursive: true });
  const submitted = await inboxSubmitCommand({
    cwd: options.cwd,
    sourceKind: 'cli',
    sourceRef: `capability-announcement:${announcement.capability_id}`,
    kind: 'observation',
    authorityLevel: 'operator_confirmed',
    principal: options.by,
    targetLocus: options.targetLocus,
    payload: JSON.stringify({
      title: `Capability announcement: ${announcement.capability_id}`,
      capability_announcement: announcement,
      authority_note: 'Capability announcement is discovery metadata, not execution consent.',
    }),
    format: 'json',
  });
  if (submitted.exitCode !== ExitCode.SUCCESS) return submitted;
  return {
    exitCode: ExitCode.SUCCESS,
    result: {
      status: 'success',
      mutation_performed: true,
      announcement,
      inbox: (submitted.result as { envelope: unknown; portable_artifact?: string }),
    },
  };
}

export async function capabilityAnnouncementSupersedeCommand(
  options: CapabilityAnnouncementSupersedeOptions,
  _context: CommandContext,
): Promise<{ exitCode: ExitCode; result: unknown }> {
  try {
    const id = requireOption(options.id, '<id>');
    const replacementId = requireOption(options.replacementId, '--replacement');
    const by = requireOption(options.by, '--by');
    const cwd = options.cwd ?? '.';
    const registry = await readCapabilityAnnouncementRegistry(cwd);
    const announcement = registry.announcements.find((entry) => entry.capability_id === id);
    const replacement = registry.announcements.find((entry) => entry.capability_id === replacementId);
    if (!announcement) throw new Error(`Capability announcement not found: ${id}`);
    if (!replacement) throw new Error(`Replacement capability announcement not found: ${replacementId}`);
    announcement.status = 'superseded';
    announcement.superseded_by = replacementId;
    announcement.supersession_reason = options.reason?.trim() || `superseded by ${replacementId}`;
    announcement.updated_at = new Date().toISOString();
    replacement.supersedes = id;
    replacement.updated_at = new Date().toISOString();
    const path = await writeCapabilityAnnouncementRegistry(cwd, registry);
    return {
      exitCode: ExitCode.SUCCESS,
      result: {
        status: 'success',
        mutation_performed: true,
        registry_path: path,
        announcement,
        replacement,
        superseded_by: replacementId,
        superseded_by_principal: by,
      },
    };
  } catch (error) {
    return normalizeError(error);
  }
}

export async function capabilityListCommand(
  options: CapabilityListOptions,
  _context: CommandContext,
): Promise<{ exitCode: ExitCode; result: unknown }> {
  const cwd = options.cwd ?? '.';
  const registry = await readCapabilityRegistry(cwd);
  const limit = options.limit ?? 20;
  const grants = registry.grants
    .map((grant) => ({ ...grant, effective_status: grantEffectiveStatus(grant) }))
    .filter((grant) => !options.site || grant.site_id === options.site)
    .filter((grant) => !options.principal || grant.principal_id === options.principal)
    .filter((grant) => !options.agent || grant.agent_id === options.agent)
    .filter((grant) => !options.kind || grant.capability_kind === options.kind)
    .filter((grant) => !options.status || grant.effective_status === options.status)
    .slice(0, limit);
  return {
    exitCode: ExitCode.SUCCESS,
    result: {
      status: 'success',
      mutation_performed: false,
      registry_path: capabilityRegistryPath(cwd),
      count: grants.length,
      limit,
      grants,
    },
  };
}

export async function capabilityExplainCommand(
  options: CapabilityExplainOptions,
  _context: CommandContext,
): Promise<{ exitCode: ExitCode; result: unknown }> {
  const grantId = requireOption(options.grantId, '<grant-id>');
  const cwd = options.cwd ?? '.';
  const registry = await readCapabilityRegistry(cwd);
  const grant = registry.grants.find((entry) => entry.grant_id === grantId);
  if (!grant) {
    return {
      exitCode: ExitCode.INVALID_CONFIG,
      result: { status: 'error', error: `Capability grant not found: ${grantId}` },
    };
  }
  const effectiveStatus = grantEffectiveStatus(grant);
  const blockers = [];
  if (effectiveStatus === 'revoked') blockers.push('grant revoked');
  if (effectiveStatus === 'expired') blockers.push('grant expired');
  return {
    exitCode: ExitCode.SUCCESS,
    result: {
      status: 'success',
      mutation_performed: false,
      registry_path: capabilityRegistryPath(cwd),
      grant,
      effective_status: effectiveStatus,
      admissible_for_execution: blockers.length === 0,
      blockers,
      explanation: blockers.length === 0
        ? 'Grant is active. Execution surfaces must still satisfy local crossing law and action-specific validation.'
        : `Grant is not currently admissible: ${blockers.join(', ')}`,
      secret_values_stored: false,
    },
  };
}

export async function capabilityRevokeCommand(
  options: CapabilityRevokeOptions,
  _context: CommandContext,
): Promise<{ exitCode: ExitCode; result: unknown }> {
  try {
    const grantId = requireOption(options.grantId, '<grant-id>');
    const revokedBy = requireOption(options.by, '--by');
    const registry = await readCapabilityRegistry(options.cwd ?? '.');
    const grant = registry.grants.find((entry) => entry.grant_id === grantId);
    if (!grant) {
      return {
        exitCode: ExitCode.INVALID_CONFIG,
        result: { status: 'error', error: `Capability grant not found: ${grantId}` },
      };
    }
    grant.status = 'revoked';
    grant.revoked_by = revokedBy;
    grant.revoked_at = new Date().toISOString();
    grant.revocation_reason = options.reason ?? null;
    const path = await writeCapabilityRegistry(options.cwd ?? '.', registry);
    return {
      exitCode: ExitCode.SUCCESS,
      result: {
        status: 'success',
        mutation_performed: true,
        registry_path: path,
        grant,
      },
    };
  } catch (error) {
    return normalizeError(error);
  }
}
