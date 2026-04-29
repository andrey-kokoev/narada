import type { CommandContext } from '../lib/command-wrapper.js';
import { ExitCode } from '../lib/exit-codes.js';
import { formattedResult, type CliFormat } from '../lib/cli-output.js';
import {
  makeOperatorSurfaceLabel,
  operatorSurfaceIdentityPath,
  readOperatorSurfaceIdentities,
  writeOperatorSurfaceIdentities,
} from '../lib/operator-surface-registry.js';
import { loadRoster } from '../lib/task-governance.js';
import { sitesAgentBootstrapCommand } from './sites.js';

export interface OperatorSurfaceIdentityAddOptions {
  cwd?: string;
  identityName?: string;
  role?: string;
  agentKind?: string;
  site?: string;
  label?: string;
  siteAffinityColor?: string;
  roleAffinityColor?: string;
  by?: string;
  format?: string;
}

export interface OperatorSurfaceLabelsBuildOptions {
  cwd?: string;
  site?: string;
  limit?: number;
  format?: string;
}

export interface OperatorSurfaceBindingOptions {
  cwd?: string;
  identity?: string;
  as?: string;
  runtimeLocus?: string;
  handle?: string;
  staleAfter?: string;
  format?: string;
}

export interface OperatorSurfaceAgentInstantiateOptions {
  cwd?: string;
  site?: string;
  role?: string;
  agentKind?: string;
  by?: string;
  identityName?: string;
  label?: string;
  siteAffinityColor?: string;
  roleAffinityColor?: string;
  dryRun?: boolean;
  bindFocused?: boolean;
  runtimeLocus?: string;
  format?: CliFormat;
}

function requireText(value: string | undefined, name: string): string {
  const trimmed = value?.trim();
  if (!trimmed) throw new Error(`${name} is required`);
  return trimmed;
}

function errorResult(error: unknown): { exitCode: ExitCode; result: unknown } {
  return {
    exitCode: ExitCode.INVALID_CONFIG,
    result: { status: 'error', error: error instanceof Error ? error.message : String(error) },
  };
}

function normalizeInstantiateRole(role: string | undefined): 'architect' | 'builder' | null {
  const value = role?.trim().toLowerCase();
  return value === 'architect' || value === 'builder' ? value : null;
}

function defaultIdentityName(site: string, role: string): string {
  return `${site}-${role}`.toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');
}

function fallbackBootstrapText(role: 'architect' | 'builder'): string {
  const title = role === 'architect' ? 'Architect' : 'Builder';
  return [
    `You are ${role}. Operator is Operator. We are governed by Narada law.`,
    `Inhabit the ${title} role without claiming authority from the chat surface.`,
    'Before work, run: narada operator-surface bind-focused --as self',
  ].join('\n');
}

export async function operatorSurfaceAgentInstantiateCommand(
  options: OperatorSurfaceAgentInstantiateOptions,
  context: CommandContext,
): Promise<{ exitCode: ExitCode; result: unknown }> {
  try {
    const cwd = options.cwd ?? '.';
    const site = requireText(options.site, '--site');
    const role = normalizeInstantiateRole(options.role);
    if (!role) {
      return {
        exitCode: ExitCode.INVALID_CONFIG,
        result: {
          status: 'error',
          error: `Unsupported role: ${options.role ?? ''}`,
          allowed_roles: ['architect', 'builder'],
          mutation_performed: false,
        },
      };
    }
    const agentKind = requireText(options.agentKind, '--agent-kind');
    const by = requireText(options.by, '--by');
    const identityName = options.identityName?.trim() || defaultIdentityName(site, role);
    const registry = await readOperatorSurfaceIdentities(cwd);
    const existing = registry.identities.find((entry) => entry.identity_id === identityName);
    let identityResult: unknown = null;
    let mutationPerformed = false;

    if (options.dryRun) {
      identityResult = {
        status: existing ? 'would_reuse' : 'would_admit',
        identity_id: identityName,
      };
    } else if (existing) {
      identityResult = {
        status: 'reused',
        identity: existing,
      };
    } else {
      const admitted = await operatorSurfaceIdentityAddCommand({
        cwd,
        identityName,
        role,
        agentKind,
        site,
        by,
        label: options.label ?? identityName,
        siteAffinityColor: options.siteAffinityColor,
        roleAffinityColor: options.roleAffinityColor,
        format: 'json',
      }, context);
      if (admitted.exitCode !== ExitCode.SUCCESS) return admitted;
      identityResult = admitted.result;
      mutationPerformed = true;
    }

    const bootstrap = await sitesAgentBootstrapCommand(site, {
      role,
      format: 'json',
      verbose: false,
    }, context).catch((error) => ({
      exitCode: ExitCode.GENERAL_ERROR,
      result: {
        status: 'error',
        error: error instanceof Error ? error.message : String(error),
      },
    }));
    const bootstrapResult = bootstrap.result as { bootstrap_text?: string; error?: string };
    const bootstrapText = bootstrap.exitCode === ExitCode.SUCCESS && bootstrapResult.bootstrap_text
      ? bootstrapResult.bootstrap_text
      : fallbackBootstrapText(role);
    const selfBindInstruction = 'narada operator-surface bind-focused --as self';
    const runtimeBinding = options.bindFocused
      ? {
          status: 'deferred',
          reason: 'runtime_locus_required',
          runtime_binding_mutated: false,
          deferred_command: `Route to owning runtime locus: narada operator-surface bind-focused --identity ${identityName} --runtime-locus ${options.runtimeLocus ?? '<pc-or-user-site>'}`,
        }
      : null;

    const result = {
      status: 'success',
      mutation_performed: mutationPerformed,
      dry_run: Boolean(options.dryRun),
      site,
      role,
      agent_kind: agentKind,
      identity_id: identityName,
      registry_path: operatorSurfaceIdentityPath(cwd),
      identity: identityResult,
      bootstrap: {
        source: bootstrap.exitCode === ExitCode.SUCCESS ? 'site_agent_bootstrap' : 'fallback',
        warning: bootstrap.exitCode === ExitCode.SUCCESS ? null : bootstrapResult.error ?? 'Site bootstrap contract unavailable',
        text: bootstrapText,
      },
      self_bind_instruction: selfBindInstruction,
      runtime_binding: runtimeBinding,
      copyable_text: [
        bootstrapText,
        '',
        `Identity: ${identityName}`,
        `Self-bind: ${selfBindInstruction}`,
      ].join('\n'),
    };

    const lines = [
      `Instantiate ${role}: ${identityName}`,
      `Mutation: ${mutationPerformed ? 'identity admitted' : options.dryRun ? 'dry-run' : 'identity reused'}`,
      `Self-bind: ${selfBindInstruction}`,
      ...(runtimeBinding ? [`Runtime binding: deferred (${runtimeBinding.deferred_command})`] : []),
    ];
    return {
      exitCode: ExitCode.SUCCESS,
      result: formattedResult(result, lines, options.format ?? 'auto'),
    };
  } catch (error) {
    return errorResult(error);
  }
}

export async function operatorSurfaceIdentityAddCommand(
  options: OperatorSurfaceIdentityAddOptions,
  _context: CommandContext,
): Promise<{ exitCode: ExitCode; result: unknown }> {
  try {
    const cwd = options.cwd ?? '.';
    const identityId = requireText(options.identityName, '<identity-name>');
    const siteId = requireText(options.site, '--site');
    const role = requireText(options.role, '--role');
    const agentKind = requireText(options.agentKind, '--agent-kind');
    const by = requireText(options.by, '--by');
    const now = new Date().toISOString();
    const registry = await readOperatorSurfaceIdentities(cwd);
    const existing = registry.identities.find((entry) => entry.identity_id === identityId);
    const record = {
      identity_id: identityId,
      site_id: siteId,
      role,
      agent_kind: agentKind,
      label: options.label?.trim() || identityId,
      admitted_by: by,
      admitted_at: existing?.admitted_at ?? now,
      updated_at: now,
      authority_limits: [
        'identity_record_is_site_authority',
        'runtime_handle_binding_is_not_admitted_here',
        'operator_surface_does_not_grant_effect_capability',
      ],
    };
    const siteAffinityColor = options.siteAffinityColor?.trim();
    if (siteAffinityColor) {
      registry.sites = {
        ...registry.sites,
        [siteId]: {
          ...(registry.sites?.[siteId] ?? {}),
          affinity_color: siteAffinityColor,
        },
      };
    }
    const roleAffinityColor = options.roleAffinityColor?.trim();
    if (roleAffinityColor) {
      registry.roles = {
        ...registry.roles,
        [role]: {
          ...(registry.roles?.[role] ?? {}),
          affinity_color: roleAffinityColor,
        },
      };
    }
    if (existing) {
      Object.assign(existing, record);
    } else {
      registry.identities.push(record);
    }
    const path = await writeOperatorSurfaceIdentities(cwd, registry);
    return {
      exitCode: ExitCode.SUCCESS,
      result: {
        status: 'success',
        mutation_performed: true,
        registry_path: path,
        identity: record,
        runtime_binding_mutated: false,
      },
    };
  } catch (error) {
    return errorResult(error);
  }
}

export async function operatorSurfaceLabelsBuildCommand(
  options: OperatorSurfaceLabelsBuildOptions,
  _context: CommandContext,
): Promise<{ exitCode: ExitCode; result: unknown }> {
  const cwd = options.cwd ?? '.';
  const registry = await readOperatorSurfaceIdentities(cwd);
  const limit = options.limit ?? 50;
  const identities = registry.identities
    .filter((entry) => !options.site || entry.site_id === options.site)
    .slice(0, limit);
  return {
    exitCode: ExitCode.SUCCESS,
    result: {
      status: 'success',
      mutation_performed: false,
      registry_path: operatorSurfaceIdentityPath(cwd),
      count: identities.length,
      limit,
      labels: identities.map((identity) => makeOperatorSurfaceLabel(identity, registry)),
    },
  };
}

async function resolveSelfIdentity(cwd: string): Promise<{ identity: string | null; source: string; blockers: string[] }> {
  const envIdentity = process.env.NARADA_AGENT_ID || process.env.NARADA_PRINCIPAL_ID;
  if (envIdentity) return { identity: envIdentity, source: 'environment', blockers: [] };
  try {
    const roster = await loadRoster(cwd);
    const active = roster.agents.filter((agent) => agent.task != null);
    if (active.length === 1) {
      return { identity: active[0]!.agent_id, source: 'active_roster_assignment', blockers: [] };
    }
    return {
      identity: null,
      source: 'roster',
      blockers: active.length === 0
        ? ['no active roster assignment and no NARADA_AGENT_ID/NARADA_PRINCIPAL_ID']
        : ['multiple active roster assignments; self is ambiguous'],
    };
  } catch (error) {
    return {
      identity: null,
      source: 'roster',
      blockers: [`roster unavailable: ${error instanceof Error ? error.message : String(error)}`],
    };
  }
}

export async function operatorSurfaceBindFocusedCommand(
  options: OperatorSurfaceBindingOptions,
  _context: CommandContext,
): Promise<{ exitCode: ExitCode; result: unknown }> {
  const cwd = options.cwd ?? '.';
  let identity = options.identity?.trim() || null;
  let selfResolution: Awaited<ReturnType<typeof resolveSelfIdentity>> | null = null;
  if (options.as === 'self') {
    selfResolution = await resolveSelfIdentity(cwd);
    identity = selfResolution.identity;
  }
  if (!identity) {
    return {
      exitCode: ExitCode.INVALID_CONFIG,
      result: {
        status: 'error',
        reason: 'identity_unresolved',
        blockers: selfResolution?.blockers ?? ['--identity is required unless --as self resolves'],
        repair_command: 'Set NARADA_AGENT_ID or admit exactly one active roster assignment before using --as self.',
      },
    };
  }
  const registry = await readOperatorSurfaceIdentities(cwd);
  const known = registry.identities.some((entry) => entry.identity_id === identity);
  return {
    exitCode: known ? ExitCode.SUCCESS : ExitCode.INVALID_CONFIG,
    result: {
      status: known ? 'deferred' : 'error',
      reason: known ? 'runtime_locus_required' : 'identity_not_admitted',
      identity,
      self_resolution: selfResolution,
      mutation_performed: false,
      runtime_binding_mutated: false,
      authority_split: {
        durable_identity_authority: operatorSurfaceIdentityPath(cwd),
        volatile_handle_authority: options.runtimeLocus ?? 'owning_runtime_locus_required',
      },
      deferred_command: known
        ? `Route to owning runtime locus: narada operator-surface bind-focused --identity ${identity} --runtime-locus <pc-or-user-site>`
        : undefined,
      blockers: known ? [] : [`identity not admitted: ${identity}`],
    },
  };
}

export async function operatorSurfaceBindingDeferredCommand(
  action: 'rebind' | 'unbind' | 'list' | 'clean-stale',
  options: OperatorSurfaceBindingOptions,
  _context: CommandContext,
): Promise<{ exitCode: ExitCode; result: unknown }> {
  return {
    exitCode: ExitCode.SUCCESS,
    result: {
      status: 'deferred',
      action,
      mutation_performed: false,
      runtime_binding_mutated: false,
      reason: 'runtime_locus_required',
      authority_split: {
        durable_identity_authority: operatorSurfaceIdentityPath(options.cwd ?? '.'),
        volatile_handle_authority: options.runtimeLocus ?? 'owning_runtime_locus_required',
      },
      next_step: `Run this operation through the User/PC Site that owns the runtime handle; Narada proper does not mutate volatile handles by convenience.`,
    },
  };
}
