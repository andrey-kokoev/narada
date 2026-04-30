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

export type CredentialOperationKind =
  | 'bind_existing_secret'
  | 'create_new_secret'
  | 'rotate_remote_secret'
  | 'set_local_runtime_env';

export interface CapabilityCredentialPreflightOptions {
  cwd?: string;
  site?: string;
  principal?: string;
  kind?: string;
  operation?: CredentialOperationKind;
  credentialRef?: string;
  localEnv?: string;
  remoteSecretName?: string;
  remoteWorker?: string;
  approveRemoteSecretMutation?: boolean;
  by?: string;
  format?: string;
}

export interface CapabilityRequestOptions {
  cwd?: string;
  site?: string;
  principal?: string;
  agent?: string;
  kind?: string;
  origin?: string;
  path?: string;
  interaction?: string;
  evidenceSink?: string;
  redaction?: string;
  format?: string;
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

const BROWSER_DOM_INSPECTION_MUTATION_LIKE_INTERACTIONS = new Set([
  'submit_form',
  'revalidate',
  'download',
  'delete',
  'approve',
  'send',
  'purchase',
  'publish',
  'deploy',
  'mutate_business_data',
]);

const BROWSER_DOM_INSPECTION_DEFAULT_REDACTIONS = [
  'cookies',
  'tokens',
  'signed_urls',
  'secrets',
  'sensitive_query_strings',
];

function stringArrayField(value: unknown, field: string): string[] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
  const record = value as Record<string, unknown>;
  const raw = record[field];
  return Array.isArray(raw) ? raw.filter((entry): entry is string => typeof entry === 'string') : [];
}

function hasScopeMatch(scope: unknown, field: string, requested: string | null): boolean {
  if (!requested) return true;
  const allowed = stringArrayField(scope, field);
  return allowed.length === 0 || allowed.includes(requested);
}

function grantMatchesCapabilityRequest(
  grant: { site_id: string; principal_id: string; agent_id: string | null; capability_kind: string; allowed_actions: string[]; denied_actions: string[]; scope_json: unknown },
  request: { siteId: string; principalId: string; agentId: string | null; kind: string; origin: string | null; path: string | null; interaction: string; evidenceSink: string | null },
): boolean {
  if (grant.site_id !== request.siteId) return false;
  if (grant.principal_id !== request.principalId) return false;
  if (grant.agent_id && grant.agent_id !== request.agentId) return false;
  if (grant.capability_kind !== request.kind) return false;
  if (!grant.allowed_actions.includes(request.interaction)) return false;
  if (grant.denied_actions.includes(request.interaction)) return false;
  return (
    hasScopeMatch(grant.scope_json, 'allowed_origins', request.origin) &&
    hasScopeMatch(grant.scope_json, 'allowed_paths', request.path) &&
    hasScopeMatch(grant.scope_json, 'allowed_evidence_sinks', request.evidenceSink)
  );
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
        credential_operation: {
          kind: 'bind_existing_secret',
          remote_secret_mutation: false,
          local_runtime_env_mutation: false,
          requires_remote_secret_approval: false,
          approval_recorded: false,
          authority_note: 'Credential binding records a reference and local-material posture only; it must not create or rotate upstream secrets.',
        },
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

function credentialOperationRisk(kind: CredentialOperationKind): {
  effect_class: 'local_reference_binding' | 'local_runtime_mutation' | 'dangerous_external_effect';
  requires_explicit_approval: boolean;
  remote_secret_mutation: boolean;
} {
  switch (kind) {
    case 'bind_existing_secret':
      return {
        effect_class: 'local_reference_binding',
        requires_explicit_approval: false,
        remote_secret_mutation: false,
      };
    case 'set_local_runtime_env':
      return {
        effect_class: 'local_runtime_mutation',
        requires_explicit_approval: false,
        remote_secret_mutation: false,
      };
    case 'create_new_secret':
    case 'rotate_remote_secret':
      return {
        effect_class: 'dangerous_external_effect',
        requires_explicit_approval: true,
        remote_secret_mutation: true,
      };
  }
}

function normalizeCredentialOperation(value: string | undefined): CredentialOperationKind {
  const operation = value?.trim() as CredentialOperationKind | undefined;
  if (
    operation === 'bind_existing_secret' ||
    operation === 'create_new_secret' ||
    operation === 'rotate_remote_secret' ||
    operation === 'set_local_runtime_env'
  ) {
    return operation;
  }
  throw new Error('--operation must be one of: bind_existing_secret, create_new_secret, rotate_remote_secret, set_local_runtime_env');
}

export async function capabilityCredentialPreflightCommand(
  options: CapabilityCredentialPreflightOptions,
  _context: CommandContext,
): Promise<{ exitCode: ExitCode; result: unknown }> {
  try {
    const siteId = requireOption(options.site, '--site');
    const principalId = requireOption(options.principal, '--principal');
    const kind = requireOption(options.kind, '--kind');
    const operation = normalizeCredentialOperation(options.operation);
    const risk = credentialOperationRisk(operation);
    const credentialRef = validateCredentialRef(options.credentialRef);
    const localEnv = options.localEnv?.trim() || null;
    const localEnvStatus = localEnv
      ? process.env[localEnv]?.trim() ? 'present' : 'missing'
      : 'not_checked';
    const remoteSecretTarget = options.remoteWorker || options.remoteSecretName
      ? {
          worker: options.remoteWorker?.trim() || null,
          secret_name: options.remoteSecretName?.trim() || null,
        }
      : null;
    const blockers: string[] = [];
    if (risk.requires_explicit_approval && !options.approveRemoteSecretMutation) {
      blockers.push(`${operation} requires explicit --approve-remote-secret-mutation`);
    }
    if (operation === 'bind_existing_secret' && !credentialRef) {
      blockers.push('bind_existing_secret requires --credential-ref');
    }
    if (operation === 'set_local_runtime_env' && !localEnv) {
      blockers.push('set_local_runtime_env requires --local-env');
    }
    if (risk.remote_secret_mutation && !remoteSecretTarget?.secret_name) {
      blockers.push(`${operation} requires --remote-secret-name`);
    }
    const choices = [
      {
        operation: 'bind_existing_secret',
        label: 'Reuse existing secret reference',
        command: 'narada capability bind-credential --site <site> --principal <principal> --kind <kind> --credential-ref <ref> --allow <action> --by <principal>',
        remote_secret_mutation: false,
      },
      {
        operation: 'set_local_runtime_env',
        label: 'Bind or repair local runtime environment material',
        command: 'Set the local env var in the owning runtime locus, then run narada capability credential-preflight --operation set_local_runtime_env --local-env <VAR>',
        remote_secret_mutation: false,
      },
      {
        operation: 'create_new_secret',
        label: 'Create a new upstream secret',
        command: 'Use an explicitly named remote-secret creation command with --approve-remote-secret-mutation; do not perform this as setup side effect.',
        remote_secret_mutation: true,
      },
      {
        operation: 'rotate_remote_secret',
        label: 'Rotate an existing upstream secret',
        command: 'Use an explicitly named remote-secret rotation command with --approve-remote-secret-mutation; do not perform this as setup side effect.',
        remote_secret_mutation: true,
      },
    ];

    return {
      exitCode: blockers.length === 0 ? ExitCode.SUCCESS : ExitCode.INVALID_CONFIG,
      result: {
        status: blockers.length === 0 ? 'success' : 'error',
        mutation_performed: false,
        site_id: siteId,
        principal_id: principalId,
        capability_kind: kind,
        operation,
        operation_classification: {
          ...risk,
          approval_recorded: Boolean(options.approveRemoteSecretMutation),
          adapter_setup_may_perform_as_side_effect: false,
        },
        credential_posture: {
          credential_ref: credentialRef,
          local_env: localEnv,
          local_env_status: localEnvStatus,
          remote_secret_target: remoteSecretTarget,
          raw_secret_exposed: false,
        },
        preflight_paths: {
          existing_local_credential_binding: operation === 'bind_existing_secret' && credentialRef ? 'candidate' : 'not_selected',
          missing_local_binding: operation === 'bind_existing_secret' && !credentialRef ? 'blocked' : localEnvStatus === 'missing' ? 'observed' : 'not_observed',
          create_new_secret: operation === 'create_new_secret' ? (blockers.length === 0 ? 'approved' : 'requires_approval') : 'not_selected',
          rotate_remote_secret: operation === 'rotate_remote_secret' ? (blockers.length === 0 ? 'approved' : 'requires_approval') : 'not_selected',
          set_local_runtime_env: operation === 'set_local_runtime_env' ? (blockers.length === 0 ? 'candidate' : 'blocked') : 'not_selected',
        },
        operator_choices: choices,
        blockers,
        recommended_safe_default: 'bind_existing_secret',
        secret_values_stored: false,
        raw_secret_exposed: false,
        recorded_by: options.by ?? null,
      },
    };
  } catch (error) {
    return normalizeError(error);
  }
}

export async function capabilityRequestCommand(
  options: CapabilityRequestOptions,
  _context: CommandContext,
): Promise<{ exitCode: ExitCode; result: unknown }> {
  try {
    const cwd = options.cwd ?? '.';
    const siteId = requireOption(options.site, '--site');
    const principalId = requireOption(options.principal, '--principal');
    const kind = requireOption(options.kind, '--kind');
    const interaction = requireOption(options.interaction, '--interaction');
    const agentId = options.agent?.trim() || null;
    const origin = options.origin?.trim() || null;
    const path = options.path?.trim() || null;
    const evidenceSink = options.evidenceSink?.trim() || null;
    const requestedRedactions = parseCsv(options.redaction);
    const redactionPolicy = Array.from(new Set([
      ...BROWSER_DOM_INSPECTION_DEFAULT_REDACTIONS,
      ...requestedRedactions,
    ])).sort();
    const blockers: string[] = [];
    if (kind === 'browser_dom_inspection' && BROWSER_DOM_INSPECTION_MUTATION_LIKE_INTERACTIONS.has(interaction)) {
      blockers.push(`${interaction} is mutation-like and must use a separate command/execution intent, not browser_dom_inspection`);
    }

    const registry = await readCapabilityRegistry(cwd);
    const activeMatches = registry.grants
      .map((grant) => ({ ...grant, effective_status: grantEffectiveStatus(grant) }))
      .filter((grant) => grant.effective_status === 'active')
      .filter((grant) => grantMatchesCapabilityRequest(grant, {
        siteId,
        principalId,
        agentId,
        kind,
        origin,
        path,
        interaction,
        evidenceSink,
      }));

    if (activeMatches.length === 0) {
      blockers.push('no active matching capability grant');
    }

    const admitted = blockers.length === 0;
    return {
      exitCode: admitted ? ExitCode.SUCCESS : ExitCode.INVALID_CONFIG,
      result: {
        status: admitted ? 'success' : 'error',
        mutation_performed: false,
        request_status: admitted ? 'admitted' : 'deferred',
        capability_kind: kind,
        site_id: siteId,
        principal_id: principalId,
        agent_id: agentId,
        requested_scope: {
          origin,
          path,
          interaction,
          evidence_sink: evidenceSink,
        },
        admission: {
          default_posture: 'denied_until_operator_approval_or_explicit_site_capability_grant',
          admitted,
          grant_id: admitted ? activeMatches[0]?.grant_id : null,
          blockers,
          repair_guidance: admitted
            ? 'Capability request is admitted by an active scoped grant; execution surface must still obey action-specific law and evidence redaction.'
            : 'Ask Operator for interactive approval or create a scoped grant with narada capability grant --kind browser_dom_inspection --allow <interaction> --scope <json> --expires-at <iso>.',
        },
        browser_dom_inspection: kind === 'browser_dom_inspection'
          ? {
              readonly_modes: ['inspect_dom_readonly', 'inspect_network_readonly', 'screenshot_evidence'],
              mutation_like_modes_require_separate_intent: Array.from(BROWSER_DOM_INSPECTION_MUTATION_LIKE_INTERACTIONS).sort(),
              evidence_redaction_policy: redactionPolicy,
              use_ephemeral_browser_context_by_default: true,
              raw_cookies_tokens_signed_urls_or_secrets_allowed: false,
            }
          : null,
        matching_grants: activeMatches.map((grant) => ({
          grant_id: grant.grant_id,
          effective_status: grant.effective_status,
          evidence_ref: grant.evidence_ref,
          expires_at: grant.expires_at,
        })),
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
