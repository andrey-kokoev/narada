import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join, resolve } from 'node:path';
import type { CommandContext } from '../lib/command-wrapper.js';
import { ExitCode } from '../lib/exit-codes.js';
import { formattedResult, type CliFormat } from '../lib/cli-output.js';
import {
  makeOperatorSurfaceLabel,
  operatorSurfaceIdentityPath,
  readOperatorSurfaceIdentities,
  writeOperatorSurfaceIdentities,
  type OperatorSurfaceInputCapability,
  type OperatorSurfaceSubmitStrategy,
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
  inputCapabilities?: string;
  submitStrategy?: string;
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

export interface OperatorSurfaceSendOptions {
  cwd?: string;
  identity?: string;
  runtimeLocus?: string;
  text?: string;
  dryRun?: boolean;
  execute?: boolean;
  format?: CliFormat;
}

interface OperatorSurfaceRuntimeBinding {
  binding_id?: string;
  identity_id: string;
  runtime_locus?: string;
  handle?: string;
  transport?: string;
  submit_strategy?: OperatorSurfaceSubmitStrategy;
  input_capabilities?: OperatorSurfaceInputCapability[];
  status?: 'active' | 'stale' | 'revoked';
  stale_after?: string;
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
  inputCapabilities?: string;
  submitStrategy?: string;
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

type OperatorSurfaceAgentRole = 'architect' | 'builder' | 'observer';

function normalizeInstantiateRole(role: string | undefined): OperatorSurfaceAgentRole | null {
  const value = role?.trim().toLowerCase();
  return value === 'architect' || value === 'builder' || value === 'observer' ? value : null;
}

function defaultIdentityName(site: string, role: string): string {
  return `${site}-${role}`.toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');
}

function parseInputCapabilities(value: string | undefined): OperatorSurfaceInputCapability[] | undefined {
  if (!value?.trim()) return undefined;
  const allowed: OperatorSurfaceInputCapability[] = ['focus', 'type_text', 'submit', 'clear_pending_input', 'recover_surface_state'];
  const parsed = value.split(',').map((part) => part.trim()).filter(Boolean);
  const invalid = parsed.find((part) => !allowed.includes(part as OperatorSurfaceInputCapability));
  if (invalid) throw new Error(`Unsupported input capability: ${invalid}`);
  return parsed as OperatorSurfaceInputCapability[];
}

function parseSubmitStrategy(value: string | undefined): OperatorSurfaceSubmitStrategy {
  if (!value?.trim()) return 'type_only';
  const allowed: OperatorSurfaceSubmitStrategy[] = ['type_only', 'operator_confirmed_submit', 'known_surface_submit'];
  if (!allowed.includes(value.trim() as OperatorSurfaceSubmitStrategy)) {
    throw new Error(`Unsupported submit strategy: ${value}`);
  }
  return value.trim() as OperatorSurfaceSubmitStrategy;
}

function runtimeBindingPath(cwd: string): string {
  return join(resolve(cwd), 'operator-surfaces', 'runtime-bindings.json');
}

async function readRuntimeBindings(cwd: string): Promise<OperatorSurfaceRuntimeBinding[]> {
  const path = runtimeBindingPath(cwd);
  if (!existsSync(path)) return [];
  const parsed = JSON.parse(await readFile(path, 'utf8')) as { bindings?: OperatorSurfaceRuntimeBinding[] } | OperatorSurfaceRuntimeBinding[];
  return Array.isArray(parsed) ? parsed : Array.isArray(parsed.bindings) ? parsed.bindings : [];
}

function isStaleBinding(binding: OperatorSurfaceRuntimeBinding, now = new Date()): boolean {
  if (binding.status === 'stale' || binding.status === 'revoked') return true;
  if (!binding.stale_after) return false;
  const timestamp = Date.parse(binding.stale_after);
  return Number.isFinite(timestamp) && timestamp <= now.getTime();
}

function looksSecretLike(text: string): boolean {
  return /\b(password|passwd|secret|api[_ -]?key|token|bearer|private[_ -]?key)\b/i.test(text);
}

function textDigest(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

async function writeOperatorSurfaceSendEvent(cwd: string, event: Record<string, unknown>): Promise<string> {
  const dir = join(resolve(cwd), '.ai', 'operator-surface-events');
  await mkdir(dir, { recursive: true });
  const path = join(dir, `${String(event.event_id)}.json`);
  await writeFile(path, `${JSON.stringify(event, null, 2)}\n`, 'utf8');
  return path;
}

function fallbackBootstrapText(role: OperatorSurfaceAgentRole): string {
  const title = role === 'architect' ? 'Architect' : role === 'builder' ? 'Builder' : 'Observer';
  const rolePosture = role === 'observer'
    ? 'Observe coherence without building, lifecycle-reviewing, assigning, closing, or mutating tasks.'
    : `Inhabit the ${title} role without claiming authority from the chat surface.`;
  return [
    `You are ${role}. Operator is Operator. We are governed by Narada law.`,
    rolePosture,
    'Before work, run: narada operator-surface bind-focused --as self',
  ].join('\n');
}

function roleDuties(role: OperatorSurfaceAgentRole): string[] {
  switch (role) {
    case 'architect':
      return [
        'Convert Operator pressure into governed work packages.',
        'Preserve Narada doctrine, topology, authority boundaries, and acceptance criteria.',
        'Do not become builder merely because execution is convenient.',
      ];
    case 'builder':
      return [
        'Execute approved local work packages within accepted scope.',
        'Verify changes and preserve evidence before reporting completion.',
        'Do not redesign doctrine or widen scope by convenience.',
      ];
    case 'observer':
      return [
        'Observe Narada law, Aim, authority-boundary, and inhabited-evolution coherence.',
        'Submit bounded observations or proposals without building or lifecycle-reviewing tasks.',
        'Do not silently repair the incoherence you observe.',
      ];
  }
}

function roleBoundaries(role: OperatorSurfaceAgentRole): string[] {
  const common = [
    'The human is Operator.',
    'This role does not grant effect authority or mutation authority outside the declared Site locus.',
    '`next` means run this role normal duty loop before asking for new work.',
  ];
  return role === 'observer'
    ? [...common, 'Observer must not build, assign, implement, review, accept, reject, close, or mutate tasks.']
    : common;
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
          allowed_roles: ['architect', 'builder', 'observer'],
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
        inputCapabilities: options.inputCapabilities,
        submitStrategy: options.submitStrategy,
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
    const labelVerificationCommand = `narada operator-surface labels build --site ${JSON.stringify(site)} --format json`;
    const bindingVerification = {
      command: labelVerificationCommand,
      expected_identity_id: identityName,
      expected_role: role,
      misbinding_error: `Focused surface is misbound if ${labelVerificationCommand} does not include identity ${identityName} with role ${role}.`,
    };
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
      role_contract: {
        duties: roleDuties(role),
        boundaries: roleBoundaries(role),
        normal_loop_trigger: 'next',
      },
      self_bind_instruction: selfBindInstruction,
      binding_verification: bindingVerification,
      runtime_binding: runtimeBinding,
      copyable_text: [
        bootstrapText,
        '',
        `Identity: ${identityName}`,
        `Self-bind: ${selfBindInstruction}`,
        `Verify binding: ${bindingVerification.command}`,
        `Expected label identity: ${identityName}`,
        'When Operator says `next`, run the normal duty loop for this role.',
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
    const inputCapabilities = parseInputCapabilities(options.inputCapabilities);
    const submitStrategy = parseSubmitStrategy(options.submitStrategy);
    const record = {
      identity_id: identityId,
      site_id: siteId,
      role,
      agent_kind: agentKind,
      label: options.label?.trim() || identityId,
      input_capabilities: inputCapabilities,
      submit_strategy: submitStrategy,
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

export async function operatorSurfaceSendCommand(
  options: OperatorSurfaceSendOptions,
  _context: CommandContext,
): Promise<{ exitCode: ExitCode; result: unknown }> {
  try {
    const cwd = options.cwd ?? '.';
    const identity = requireText(options.identity, '--identity');
    const text = requireText(options.text, '--text');
    const registry = await readOperatorSurfaceIdentities(cwd);
    const admittedIdentity = registry.identities.find((entry) => entry.identity_id === identity);
    if (!admittedIdentity) {
      return {
        exitCode: ExitCode.INVALID_CONFIG,
        result: {
          status: 'error',
          reason: 'identity_not_admitted',
          identity,
          mutation_performed: false,
          unblock_command: `narada operator-surface agent instantiate --site <site-id-or-root> --role <role> --agent-kind codex_cli --by <principal> --identity ${identity}`,
        },
      };
    }
    if (looksSecretLike(text)) {
      return {
        exitCode: ExitCode.INVALID_CONFIG,
        result: {
          status: 'error',
          reason: 'secret_like_text_refused',
          identity,
          mutation_performed: false,
          unblock_command: 'Route secrets through capability consent and secret references; do not send raw secret-like text through Operator Surface input.',
        },
      };
    }

    const bindings = (await readRuntimeBindings(cwd))
      .filter((binding) => binding.identity_id === identity)
      .filter((binding) => !options.runtimeLocus || binding.runtime_locus === options.runtimeLocus);
    const activeBindings = bindings.filter((binding) => !isStaleBinding(binding));
    if (bindings.length > 0 && activeBindings.length === 0) {
      return {
        exitCode: ExitCode.INVALID_CONFIG,
        result: {
          status: 'error',
          reason: 'stale_binding',
          identity,
          mutation_performed: false,
          unblock_command: `narada operator-surface bind-focused --identity ${identity} --runtime-locus ${options.runtimeLocus ?? '<pc-or-user-site>'}`,
        },
      };
    }
    if (activeBindings.length === 0) {
      return {
        exitCode: ExitCode.INVALID_CONFIG,
        result: {
          status: 'error',
          reason: 'no_binding',
          identity,
          mutation_performed: false,
          unblock_command: `narada operator-surface bind-focused --identity ${identity} --runtime-locus ${options.runtimeLocus ?? '<pc-or-user-site>'}`,
        },
      };
    }
    if (activeBindings.length > 1) {
      return {
        exitCode: ExitCode.INVALID_CONFIG,
        result: {
          status: 'error',
          reason: 'ambiguous_binding',
          identity,
          mutation_performed: false,
          matching_bindings: activeBindings.map((binding) => ({
            binding_id: binding.binding_id ?? null,
            runtime_locus: binding.runtime_locus ?? null,
            handle: binding.handle ?? null,
          })),
          unblock_command: `Pass --runtime-locus or run narada operator-surface bindings clean-stale --runtime-locus ${options.runtimeLocus ?? '<pc-or-user-site>'}`,
        },
      };
    }

    const binding = activeBindings[0]!;
    const capabilities = binding.input_capabilities ?? admittedIdentity.input_capabilities ?? [];
    const submitStrategy = binding.submit_strategy ?? admittedIdentity.submit_strategy ?? 'type_only';
    if (!capabilities.includes('type_text') && !capabilities.includes('submit')) {
      return {
        exitCode: ExitCode.INVALID_CONFIG,
        result: {
          status: 'error',
          reason: 'missing_transport',
          identity,
          mutation_performed: false,
          binding: {
            binding_id: binding.binding_id ?? null,
            runtime_locus: binding.runtime_locus ?? null,
          },
          unblock_command: `Admit or repair Operator Surface transport for ${identity}, then rerun narada operator-surface send --identity ${identity}.`,
        },
      };
    }

    const eventId = `ose_${Date.now()}_${textDigest(`${identity}:${text}`).slice(0, 12)}`;
    const send = {
      event_id: eventId,
      identity,
      runtime_locus: binding.runtime_locus ?? options.runtimeLocus ?? null,
      resolved_runtime_handle: binding.handle ?? null,
      transport: binding.transport ?? null,
      submit_strategy: submitStrategy,
      text_digest: textDigest(text),
      text_length: text.length,
      dry_run: Boolean(options.dryRun || !options.execute),
      status: options.execute ? 'event_recorded_for_runtime_locus' : 'validated_dry_run',
    };
    const eventArtifact = options.execute ? await writeOperatorSurfaceSendEvent(cwd, send) : null;
    return {
      exitCode: ExitCode.SUCCESS,
      result: {
        status: 'success',
        mutation_performed: Boolean(options.execute),
        event_artifact: eventArtifact,
        send,
      },
    };
  } catch (error) {
    return errorResult(error);
  }
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
