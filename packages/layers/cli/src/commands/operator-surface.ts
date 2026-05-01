import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join, resolve } from 'node:path';
import type { CommandContext } from '../lib/command-wrapper.js';
import { ExitCode } from '../lib/exit-codes.js';
import { formattedResult, type CliFormat } from '../lib/cli-output.js';
import {
  makeOperatorSurfaceLabel,
  operatorSurfaceCarrierProjectionIssues,
  operatorSurfaceIdentityPath,
  operatorSurfaceDir,
  readOperatorSurfaceIdentities,
  writeOperatorSurfaceIdentities,
  type OperatorSurfaceIdentity,
  type OperatorSurfaceInputCapability,
  type OperatorSurfaceIdentityRegistry,
  type OperatorSurfaceSubmitStrategy,
} from '../lib/operator-surface-registry.js';
import { findTaskFile, loadRoster, readTaskFile, saveRoster, resolveTaskStatus, type AgentRoster } from '../lib/task-governance.js';
import { sitesAgentBootstrapCommand } from './sites.js';
import { grantEffectiveStatus, readCapabilityRegistry, validateCredentialRef } from '../lib/capability-consent-registry.js';
import { agentAddressResolutionPublic, resolveAgentAddress, type AgentAddressResolution } from '../lib/agent-address.js';

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

export interface OperatorSurfaceIdentityRenameOptions {
  cwd?: string;
  fromIdentity?: string;
  toIdentity?: string;
  by?: string;
  label?: string;
  allowActiveAssignment?: boolean;
  format?: CliFormat;
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
  from?: string;
  to?: string;
  currentSite?: string;
  runtimeLocus?: string;
  text?: string;
  dryRun?: boolean;
  execute?: boolean;
  rawInput?: boolean;
  operatorActivityState?: string;
  operatorActivityObservedAt?: string;
  activeDelivery?: string;
  deliveryTimeoutMs?: string | number;
  urgentInterruptAuthority?: string;
  currentDesktop?: string;
  targetDesktop?: string;
  crossDesktopPolicy?: string;
  crossDesktopAuthority?: string;
  format?: CliFormat;
}

export interface OperatorSurfaceStatusOptions {
  cwd?: string;
  site?: string;
  limit?: number;
  format?: CliFormat;
}

export interface OperatorSurfaceInspectCompactOptions {
  cwd?: string;
  site?: string;
  limit?: number;
  format?: CliFormat;
}

export interface OperatorSurfaceVoiceTranscriptionCheckOptions {
  cwd?: string;
  site?: string;
  principal?: string;
  capabilityGrantId?: string;
  credentialRef?: string;
  micOnly?: boolean;
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
  desktop_id?: string;
}

type OperatorActivityState = 'idle' | 'active_typing' | 'active_pointer' | 'unknown';
type ActiveDeliveryPolicy = 'queue' | 'refuse' | 'fallback_to_inbox';
type CrossDesktopPolicy = 'same_desktop_only' | 'allow_with_authority' | 'refuse';
type DeliveryResultStatus = 'queued_waiting_for_idle' | 'delivered' | 'expired' | 'refused' | 'fallback_to_inbox';
type OperatorSurfaceDeliveryState = 'requested' | DeliveryResultStatus | 'explicit_interrupt';

const OPERATOR_SURFACE_DELIVERY_STATES: readonly OperatorSurfaceDeliveryState[] = [
  'requested',
  'queued_waiting_for_idle',
  'delivered',
  'expired',
  'refused',
  'fallback_to_inbox',
  'explicit_interrupt',
] as const;

interface OperatorSurfaceVisibleLabelEvidence {
  identity_id?: string;
  site_id?: string;
  role?: string;
  label?: string;
  runtime_locus?: string;
  source?: string;
  observed_at?: string;
  status?: 'visible' | 'stale' | 'revoked';
}

type AgentWorkDutyLoopState =
  | 'unbound'
  | 'idle'
  | 'has_active_task'
  | 'needs_status_report'
  | 'in_review'
  | 'blocked'
  | 'done'
  | 'handoff_needed';

const LEGACY_SITE_ID_ALIASES: Record<string, string> = {
  'narada-proper': 'narada',
};

function canonicalSiteId(siteId: string | null | undefined): string | null {
  if (!siteId) return null;
  return LEGACY_SITE_ID_ALIASES[siteId] ?? siteId;
}

function isCanonicalSiteLocus(value: string): boolean {
  return Object.prototype.hasOwnProperty.call(LEGACY_SITE_ID_ALIASES, value)
    || Object.values(LEGACY_SITE_ID_ALIASES).includes(value);
}

async function normalizeIdentitySiteForRuntimeLocus(
  cwd: string,
  registry: OperatorSurfaceIdentityRegistry,
  identity: string,
  runtimeLocus: string,
): Promise<{ registry: OperatorSurfaceIdentityRegistry; normalized: boolean; before_site_id: string | null; after_site_id: string | null }> {
  const entry = registry.identities.find((candidate) => candidate.identity_id === identity);
  if (!entry) {
    return { registry, normalized: false, before_site_id: null, after_site_id: null };
  }
  const canonicalIdentitySite = canonicalSiteId(entry.site_id);
  const canonicalRuntimeLocus = canonicalSiteId(runtimeLocus);
  if (!canonicalIdentitySite || canonicalIdentitySite !== canonicalRuntimeLocus || entry.site_id === canonicalIdentitySite) {
    return { registry, normalized: false, before_site_id: entry.site_id, after_site_id: entry.site_id };
  }
  const updatedRegistry = {
    ...registry,
    updated_at: new Date().toISOString(),
    identities: registry.identities.map((candidate) => candidate.identity_id === identity
      ? { ...candidate, site_id: canonicalIdentitySite, updated_at: new Date().toISOString() }
      : candidate),
  };
  await writeOperatorSurfaceIdentities(cwd, updatedRegistry);
  return { registry: updatedRegistry, normalized: true, before_site_id: entry.site_id, after_site_id: canonicalIdentitySite };
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

export interface OperatorSurfaceAgentForkOptions {
  cwd?: string;
  site?: string;
  role?: string;
  agentKind?: string;
  identityName?: string;
  taskNumber?: string;
  workPacket?: string;
  runtimeLocus?: string;
  by?: string;
  exec?: boolean;
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

function normalizeAlias(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function operatorSurfaceAliases(identity: OperatorSurfaceIdentity): string[] {
  const aliases = new Set([
    identity.identity_id,
    ...(identity.previous_identity_ids ?? []),
    identity.label,
    identity.role,
    `${identity.site_id}-${identity.role}`,
    `${identity.site_id}.${identity.role}`,
    `narada-${identity.role}`,
    `${identity.site_id} ${identity.role}`,
    `narada ${identity.role}`,
  ]);
  return [...aliases].filter(Boolean);
}

function resolveSendIdentity(registry: OperatorSurfaceIdentityRegistry, requestedIdentity: string): {
  admittedIdentity: OperatorSurfaceIdentity | null;
  requested_identity: string;
  resolved_identity: string | null;
  resolution: 'identity_id' | 'alias' | 'unresolved';
  matched_alias: string | null;
  known_aliases: string[];
} {
  const exact = registry.identities.find((entry) => entry.identity_id === requestedIdentity);
  const knownAliases = registry.identities.flatMap(operatorSurfaceAliases);
  if (exact) {
    return {
      admittedIdentity: exact,
      requested_identity: requestedIdentity,
      resolved_identity: exact.identity_id,
      resolution: 'identity_id',
      matched_alias: exact.identity_id,
      known_aliases: knownAliases,
    };
  }

  const requestedAlias = normalizeAlias(requestedIdentity);
  const matched = registry.identities.find((entry) => operatorSurfaceAliases(entry).some((alias) => normalizeAlias(alias) === requestedAlias));
  return {
    admittedIdentity: matched ?? null,
    requested_identity: requestedIdentity,
    resolved_identity: matched?.identity_id ?? null,
    resolution: matched ? 'alias' : 'unresolved',
    matched_alias: matched ? operatorSurfaceAliases(matched).find((alias) => normalizeAlias(alias) === requestedAlias) ?? null : null,
    known_aliases: knownAliases,
  };
}

function publicIdentityResolution(resolution: ReturnType<typeof resolveSendIdentity>): Record<string, unknown> {
  return {
    requested_identity: resolution.requested_identity,
    resolved_identity: resolution.resolved_identity,
    resolution: resolution.resolution,
    matched_alias: resolution.matched_alias,
    known_aliases: resolution.known_aliases,
  };
}

function looksSiteQualifiedAgentAddress(value: string): boolean {
  const trimmed = value.trim();
  const dot = trimmed.lastIndexOf('.');
  return dot > 0 && dot < trimmed.length - 1;
}

function inferCurrentSite(registry: OperatorSurfaceIdentityRegistry): string | null {
  const sites = [...new Set(registry.identities.map((identity) => identity.site_id).filter(Boolean))];
  return sites.length === 1 ? sites[0]! : null;
}

function sitePrefixFromAddress(value: string): string | null {
  const trimmed = value.trim();
  const dot = trimmed.lastIndexOf('.');
  return dot > 0 && dot < trimmed.length - 1 ? trimmed.slice(0, dot) : null;
}

function sitePrefixFromIdentityId(value: string): string | null {
  return sitePrefixFromAddress(value);
}

function isBareRoleAddress(value: string): boolean {
  return normalizeInstantiateRole(value) !== null;
}

async function resolveOperatorSurfaceSendIdentity(
  cwd: string,
  registry: OperatorSurfaceIdentityRegistry,
  requestedIdentity: string,
): Promise<{
  admittedIdentity: OperatorSurfaceIdentity | null;
  identity: string;
  identityResolution: ReturnType<typeof resolveSendIdentity>;
  agentResolution: AgentAddressResolution | null;
}> {
  const initialIdentityResolution = resolveSendIdentity(registry, requestedIdentity);
  if (initialIdentityResolution.resolution === 'identity_id') {
    return {
      admittedIdentity: initialIdentityResolution.admittedIdentity,
      identity: initialIdentityResolution.resolved_identity ?? requestedIdentity,
      identityResolution: initialIdentityResolution,
      agentResolution: null,
    };
  }

  if (looksSiteQualifiedAgentAddress(requestedIdentity)) {
    const roster = await loadRosterForAgentAddress(cwd);
    const agentResolution = resolveAgentAddress(roster, requestedIdentity);
    if (!agentResolution.resolved_agent) {
      return {
        admittedIdentity: null,
        identity: requestedIdentity,
        identityResolution: initialIdentityResolution,
        agentResolution,
      };
    }
    const resolvedIdentityResolution = resolveSendIdentity(registry, agentResolution.resolved_agent);
    return {
      admittedIdentity: resolvedIdentityResolution.admittedIdentity,
      identity: resolvedIdentityResolution.resolved_identity ?? agentResolution.resolved_agent,
      identityResolution: resolvedIdentityResolution,
      agentResolution,
    };
  }

  return {
    admittedIdentity: initialIdentityResolution.admittedIdentity,
    identity: initialIdentityResolution.resolved_identity ?? requestedIdentity,
    identityResolution: initialIdentityResolution,
    agentResolution: null,
  };
}

async function loadRosterForAgentAddress(cwd: string): Promise<Awaited<ReturnType<typeof loadRoster>>> {
  try {
    const roster = await loadRoster(cwd);
    if (roster.agents.length > 0) return roster;
  } catch {
    // Fall through to the compatibility projection below.
  }
  try {
    const raw = await readFile(join(resolve(cwd), '.ai', 'agents', 'roster.json'), 'utf8');
    const parsed = JSON.parse(raw) as Awaited<ReturnType<typeof loadRoster>>;
    if (!Array.isArray(parsed.agents)) throw new Error('Invalid roster JSON projection shape');
    return parsed;
  } catch {
    return await loadRoster(cwd);
  }
}

function agentResolutionFields(agentResolution: AgentAddressResolution | null): Record<string, unknown> {
  return agentResolution
    ? {
        requested_agent: agentResolution.requested_agent,
        resolved_agent: agentResolution.resolved_agent,
        agent_address_resolution: agentAddressResolutionPublic(agentResolution),
      }
    : {};
}

function routeFields(args: {
  sender: string;
  requestedRecipient: string;
  currentSite: string | null;
  targetSite: string | null;
  resolvedRecipient: string | null;
  bindingStatus?: string;
  legacyIdentityAlias: boolean;
}): Record<string, unknown> {
  return {
    requested_address: args.requestedRecipient,
    current_site: args.currentSite,
    target_site: args.targetSite,
    message_route: {
      sender: args.sender,
      requested_recipient: args.requestedRecipient,
      resolved_recipient: args.resolvedRecipient,
      current_site: args.currentSite,
      target_site: args.targetSite,
      binding_status: args.bindingStatus ?? null,
      identity_flag_mode: args.legacyIdentityAlias ? 'deprecated_recipient_alias' : 'explicit_to',
    },
    ...(args.legacyIdentityAlias
      ? { warning: '--identity is deprecated for message recipient routing; use --to <recipient> and --from <sender>.' }
      : {}),
  };
}

function renderOperatorSurfaceMessage(sender: string, text: string, rawInput: boolean): {
  rendered_text: string;
  rendered_text_digest: string;
  rendered_text_length: number;
  sender_header_included: boolean;
  input_posture: 'typed_message' | 'raw_input';
} {
  const renderedText = rawInput ? text : `From: ${sender}\n\n${text}`;
  return {
    rendered_text: renderedText,
    rendered_text_digest: textDigest(renderedText),
    rendered_text_length: renderedText.length,
    sender_header_included: !rawInput,
    input_posture: rawInput ? 'raw_input' : 'typed_message',
  };
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

function visibleLabelEvidencePath(cwd: string): string {
  return join(resolve(cwd), 'operator-surfaces', 'visible-labels.json');
}

function resolveSiteLocalRegistryCwd(cwd: string, site: string): {
  registryCwd: string;
  registryAuthority: 'target_site_local' | 'caller_context';
  authorityWarning: string | null;
} {
  const callerCwd = resolve(cwd);
  const directSiteRoot = resolve(cwd, site);
  const containedSiteRoot = join(directSiteRoot, '.narada');
  const siteRoot = existsSync(join(directSiteRoot, 'AGENTS.md'))
    ? directSiteRoot
    : existsSync(join(containedSiteRoot, 'AGENTS.md'))
      ? containedSiteRoot
      : null;
  if (!siteRoot) {
    return {
      registryCwd: callerCwd,
      registryAuthority: 'caller_context',
      authorityWarning: null,
    };
  }
  const resolvedSiteRoot = resolve(siteRoot);
  return {
    registryCwd: resolvedSiteRoot,
    registryAuthority: 'target_site_local',
    authorityWarning: resolvedSiteRoot === callerCwd
      ? null
      : `--site resolves to ${resolvedSiteRoot}; operator-surface identity registry is target Site-local. Use --cwd ${JSON.stringify(resolvedSiteRoot)} for explicit authority-locus targeting.`,
  };
}

async function readRuntimeBindings(cwd: string): Promise<OperatorSurfaceRuntimeBinding[]> {
  const path = runtimeBindingPath(cwd);
  if (!existsSync(path)) return [];
  const parsed = JSON.parse(await readFile(path, 'utf8')) as { bindings?: OperatorSurfaceRuntimeBinding[] } | OperatorSurfaceRuntimeBinding[];
  return Array.isArray(parsed) ? parsed : Array.isArray(parsed.bindings) ? parsed.bindings : [];
}

async function readVisibleLabelEvidence(cwd: string): Promise<OperatorSurfaceVisibleLabelEvidence[]> {
  const path = visibleLabelEvidencePath(cwd);
  if (!existsSync(path)) return [];
  const parsed = JSON.parse(await readFile(path, 'utf8')) as { labels?: OperatorSurfaceVisibleLabelEvidence[] } | OperatorSurfaceVisibleLabelEvidence[];
  return Array.isArray(parsed) ? parsed : Array.isArray(parsed.labels) ? parsed.labels : [];
}

async function readVisibleLabelEvidenceStrict(cwd: string): Promise<{
  status: 'success';
  labels: OperatorSurfaceVisibleLabelEvidence[];
} | {
  status: 'error';
  reason: 'operator_surface_visible_labels_schema_mismatch';
  path: string;
  repair_guidance: string;
}> {
  const path = visibleLabelEvidencePath(cwd);
  if (!existsSync(path)) return { status: 'success', labels: [] };
  const parsed = JSON.parse(await readFile(path, 'utf8')) as unknown;
  if (Array.isArray(parsed)) return { status: 'success', labels: parsed as OperatorSurfaceVisibleLabelEvidence[] };
  if (parsed && typeof parsed === 'object' && Array.isArray((parsed as { labels?: unknown }).labels)) {
    return { status: 'success', labels: (parsed as { labels: OperatorSurfaceVisibleLabelEvidence[] }).labels };
  }
  return {
    status: 'error',
    reason: 'operator_surface_visible_labels_schema_mismatch',
    path,
    repair_guidance: 'Use narada operator-surface inspect compact or update the carrier wrapper to emit { "labels": [...] }; do not Select-Object a guessed labels property from raw overlay JSON.',
  };
}

async function writeRuntimeBindings(cwd: string, bindings: OperatorSurfaceRuntimeBinding[]): Promise<string> {
  const path = runtimeBindingPath(cwd);
  await mkdir(operatorSurfaceDir(cwd), { recursive: true });
  await writeFile(path, `${JSON.stringify({ bindings }, null, 2)}\n`, 'utf8');
  return path;
}

async function writeVisibleLabelEvidence(cwd: string, labels: OperatorSurfaceVisibleLabelEvidence[]): Promise<string> {
  const path = visibleLabelEvidencePath(cwd);
  await mkdir(operatorSurfaceDir(cwd), { recursive: true });
  await writeFile(path, `${JSON.stringify({ labels }, null, 2)}\n`, 'utf8');
  return path;
}

function visibleLabelForIdentity(
  identity: OperatorSurfaceIdentity,
  labels: OperatorSurfaceVisibleLabelEvidence[],
): OperatorSurfaceVisibleLabelEvidence | null {
  return labels.find((entry) => {
    if (entry.status === 'stale' || entry.status === 'revoked') return false;
    if (entry.identity_id && entry.identity_id === identity.identity_id) return true;
    if (entry.site_id && entry.role && entry.site_id === identity.site_id && entry.role === identity.role) return true;
    if (entry.label && normalizeAlias(entry.label) === normalizeAlias(identity.label)) return true;
    if (entry.label && normalizeAlias(entry.label) === normalizeAlias(identity.identity_id)) return true;
    return false;
  }) ?? null;
}

function bindFocusedHandoff(identity: string, runtimeLocus: string | null): {
  status: 'executable' | 'discovery_required';
  command: string | null;
  discovery_commands: string[];
  explanation: string;
} {
  if (runtimeLocus?.trim()) {
    return {
      status: 'executable',
      command: `narada operator-surface bind-focused --identity ${identity} --runtime-locus ${runtimeLocus.trim()}`,
      discovery_commands: [],
      explanation: 'Run this command in the User/PC/runtime Site that owns the focused volatile surface handle.',
    };
  }
  return {
    status: 'discovery_required',
    command: null,
    discovery_commands: [
      'narada sites list --format json',
      `narada operator-surface status --format json`,
      `narada operator-surface bind-focused --identity ${identity} --runtime-locus <runtime-locus-from-status>`,
    ],
    explanation: 'Runtime-locus id is not known in this authority locus. Discover the owning User/PC/runtime Site before mutating volatile handle bindings.',
  };
}

function bindFocusedRepairCommand(identity: string, runtimeLocus: string | null): string {
  return bindFocusedHandoff(identity, runtimeLocus).command
    ?? bindFocusedHandoff(identity, runtimeLocus).discovery_commands.join(' && ');
}

function observedCurrentRuntimeHandle(options: OperatorSurfaceBindingOptions): {
  handle: string;
  transport: string;
  source: string;
} {
  const explicit = options.handle?.trim();
  if (explicit) {
    return { handle: explicit, transport: 'explicit_runtime_handle', source: '--handle' };
  }
  if (process.env.CODEX_THREAD_ID?.trim()) {
    return {
      handle: `codex-thread:${process.env.CODEX_THREAD_ID.trim()}`,
      transport: 'codex_cli_thread',
      source: 'CODEX_THREAD_ID',
    };
  }
  if (process.env.WT_SESSION?.trim()) {
    return {
      handle: `windows-terminal:${process.env.WT_SESSION.trim()}`,
      transport: 'windows_terminal_session',
      source: 'WT_SESSION',
    };
  }
  return {
    handle: `process:${process.pid}`,
    transport: 'process_session',
    source: 'process.pid',
  };
}

function isStaleBinding(binding: OperatorSurfaceRuntimeBinding, now = new Date()): boolean {
  if (binding.status === 'stale' || binding.status === 'revoked') return true;
  if (!binding.stale_after) return false;
  const timestamp = Date.parse(binding.stale_after);
  return Number.isFinite(timestamp) && timestamp <= now.getTime();
}

function parseOperatorActivityState(value: string | undefined): OperatorActivityState {
  const normalized = value?.trim() || 'unknown';
  const allowed: OperatorActivityState[] = ['idle', 'active_typing', 'active_pointer', 'unknown'];
  if (!allowed.includes(normalized as OperatorActivityState)) {
    throw new Error(`Unsupported operator activity state: ${value}`);
  }
  return normalized as OperatorActivityState;
}

function parseActiveDeliveryPolicy(value: string | undefined): ActiveDeliveryPolicy {
  const normalized = value?.trim() || 'queue';
  const allowed: ActiveDeliveryPolicy[] = ['queue', 'refuse', 'fallback_to_inbox'];
  if (!allowed.includes(normalized as ActiveDeliveryPolicy)) {
    throw new Error(`Unsupported active delivery policy: ${value}`);
  }
  return normalized as ActiveDeliveryPolicy;
}

function parseCrossDesktopPolicy(value: string | undefined): CrossDesktopPolicy {
  const normalized = value?.trim() || 'same_desktop_only';
  const allowed: CrossDesktopPolicy[] = ['same_desktop_only', 'allow_with_authority', 'refuse'];
  if (!allowed.includes(normalized as CrossDesktopPolicy)) {
    throw new Error(`Unsupported cross-desktop policy: ${value}`);
  }
  return normalized as CrossDesktopPolicy;
}

function parseDeliveryTimeoutMs(value: string | number | undefined): number {
  if (value === undefined || value === null || value === '') return 300_000;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) throw new Error(`Unsupported delivery timeout ms: ${String(value)}`);
  return parsed;
}

function validateOperatorSurfaceDeliveryStatePath(statePath: OperatorSurfaceDeliveryState[]): {
  valid: boolean;
  invalid_transition_reason: string | null;
} {
  if (statePath[0] !== 'requested') {
    return { valid: false, invalid_transition_reason: 'delivery state path must start with requested' };
  }
  const invalid = statePath.find((state) => !OPERATOR_SURFACE_DELIVERY_STATES.includes(state));
  if (invalid) {
    return { valid: false, invalid_transition_reason: `unknown delivery state: ${String(invalid)}` };
  }
  const terminal = statePath[statePath.length - 1];
  if (!terminal || terminal === 'requested' || terminal === 'explicit_interrupt') {
    return { valid: false, invalid_transition_reason: 'delivery state path must end in a delivery result' };
  }
  if (statePath.includes('explicit_interrupt') && terminal !== 'delivered') {
    return { valid: false, invalid_transition_reason: 'explicit interruption can only transition to delivered' };
  }
  return { valid: true, invalid_transition_reason: null };
}

function decideOperatorSurfaceDelivery(args: {
  activityState: OperatorActivityState;
  activityObservedAt: string | null;
  activeDeliveryPolicy: ActiveDeliveryPolicy;
  deliveryTimeoutMs: number;
  urgentInterruptAuthority: string | null;
  currentDesktop: string | null;
  targetDesktop: string | null;
  crossDesktopPolicy: CrossDesktopPolicy;
  crossDesktopAuthority: string | null;
}): {
  status: DeliveryResultStatus;
  state_path: OperatorSurfaceDeliveryState[];
  deliverable: boolean;
  reason: string;
  operator_activity: Record<string, unknown>;
  urgent_interrupt: Record<string, unknown>;
  cross_desktop: Record<string, unknown>;
  queue: Record<string, unknown> | null;
} {
  const activityBlocks = args.activityState !== 'idle';
  const urgentAuthorized = Boolean(args.urgentInterruptAuthority);
  const crossDesktop = Boolean(args.currentDesktop && args.targetDesktop && args.currentDesktop !== args.targetDesktop);
  const crossDesktopAuthorized = !crossDesktop
    || (args.crossDesktopPolicy === 'allow_with_authority' && Boolean(args.crossDesktopAuthority));
  if (crossDesktop && !crossDesktopAuthorized) {
    return {
      status: 'refused',
      state_path: ['requested', 'refused'],
      deliverable: false,
      reason: args.crossDesktopPolicy === 'allow_with_authority'
        ? 'cross_desktop_authority_required'
        : 'cross_desktop_summon_refused',
      operator_activity: {
        state: args.activityState,
        observed_at: args.activityObservedAt,
      },
      urgent_interrupt: {
        authorized: urgentAuthorized,
        authority_ref: args.urgentInterruptAuthority,
      },
      cross_desktop: {
        required: true,
        current_desktop: args.currentDesktop,
        target_desktop: args.targetDesktop,
        policy: args.crossDesktopPolicy,
        authority_ref: args.crossDesktopAuthority,
        reversible_or_rejected: true,
      },
      queue: null,
    };
  }
  if (activityBlocks && !urgentAuthorized) {
    const queuedStatus: DeliveryResultStatus = args.activeDeliveryPolicy === 'fallback_to_inbox'
      ? 'fallback_to_inbox'
      : args.activeDeliveryPolicy === 'refuse'
        ? 'refused'
        : args.deliveryTimeoutMs === 0
          ? 'expired'
          : 'queued_waiting_for_idle';
    return {
      status: queuedStatus,
      state_path: ['requested', queuedStatus],
      deliverable: false,
      reason: args.activityState === 'unknown'
        ? 'operator_activity_unknown'
        : 'operator_recent_activity_detected',
      operator_activity: {
        state: args.activityState,
        observed_at: args.activityObservedAt,
      },
      urgent_interrupt: {
        authorized: false,
        authority_ref: null,
      },
      cross_desktop: {
        required: crossDesktop,
        current_desktop: args.currentDesktop,
        target_desktop: args.targetDesktop,
        policy: args.crossDesktopPolicy,
        authority_ref: args.crossDesktopAuthority,
        reversible_or_rejected: true,
      },
      queue: queuedStatus === 'queued_waiting_for_idle'
        ? { timeout_ms: args.deliveryTimeoutMs, next_state: 'wait_for_idle' }
        : null,
    };
  }
  return {
    status: 'delivered',
    state_path: ['requested', ...(urgentAuthorized ? ['explicit_interrupt' as const] : []), 'delivered'],
    deliverable: true,
    reason: activityBlocks ? 'urgent_interrupt_authorized' : 'operator_idle',
    operator_activity: {
      state: args.activityState,
      observed_at: args.activityObservedAt,
    },
    urgent_interrupt: {
      authorized: urgentAuthorized,
      authority_ref: args.urgentInterruptAuthority,
    },
    cross_desktop: {
      required: crossDesktop,
      current_desktop: args.currentDesktop,
      target_desktop: args.targetDesktop,
      policy: args.crossDesktopPolicy,
      authority_ref: args.crossDesktopAuthority,
      reversible_or_rejected: !crossDesktop || Boolean(args.crossDesktopAuthority),
    },
    queue: null,
  };
}

function looksSecretLike(text: string): boolean {
  return /\b(password|passwd|secret|api[_ -]?key|token|bearer|private[_ -]?key)\b/i.test(text);
}

function textDigest(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

function resolveCredentialReferencePosture(credentialRef: string | null): {
  credential_ref: string | null;
  credential_ref_kind: 'none' | 'env' | 'windows_credential_manager' | 'site_local_extension';
  local_secret_material_status: 'not_required' | 'present' | 'missing' | 'site_local_extension_required';
  raw_secret_exposed: false;
  repair: string | null;
} {
  if (!credentialRef) {
    return {
      credential_ref: null,
      credential_ref_kind: 'none',
      local_secret_material_status: 'missing',
      raw_secret_exposed: false,
      repair: 'Bind a credential reference: narada capability bind-credential --kind voice.transcription.remote --credential-ref env:<VAR> --allow remote_audio_transcribe --by <principal>',
    };
  }
  if (credentialRef.startsWith('env:')) {
    const envVar = credentialRef.slice('env:'.length);
    const present = Boolean(envVar && process.env[envVar]?.trim());
    return {
      credential_ref: credentialRef,
      credential_ref_kind: 'env',
      local_secret_material_status: present ? 'present' : 'missing',
      raw_secret_exposed: false,
      repair: present ? null : `Set local secret material for ${envVar} in the owning runtime locus; do not put the raw token in config, logs, traces, artifacts, or task evidence.`,
    };
  }
  if (credentialRef.startsWith('credential-manager:')) {
    return {
      credential_ref: credentialRef,
      credential_ref_kind: 'windows_credential_manager',
      local_secret_material_status: 'site_local_extension_required',
      raw_secret_exposed: false,
      repair: 'Resolve this credential through the owning Windows Site adapter; Narada proper records only the credential-manager reference.',
    };
  }
  return {
    credential_ref: credentialRef,
    credential_ref_kind: 'site_local_extension',
    local_secret_material_status: 'site_local_extension_required',
    raw_secret_exposed: false,
    repair: 'Resolve this credential through a Site-local secret resolver extension; Narada proper must not receive raw secret material.',
  };
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
    const registryTarget = resolveSiteLocalRegistryCwd(cwd, site);
    const registry = await readOperatorSurfaceIdentities(registryTarget.registryCwd);
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
        cwd: registryTarget.registryCwd,
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
          handoff: bindFocusedHandoff(identityName, options.runtimeLocus ?? null),
          deferred_command: bindFocusedRepairCommand(identityName, options.runtimeLocus ?? null),
        }
      : null;
    let taskRosterReadiness: Record<string, unknown>;
    if (role === 'builder' && !options.dryRun) {
      const roster = await loadRoster(registryTarget.registryCwd).catch((): AgentRoster => ({
        version: 2,
        updated_at: new Date().toISOString(),
        agents: [],
      }));
      const existingRosterAgent = roster.agents.find((agent) => agent.agent_id === identityName);
      if (existingRosterAgent) {
        taskRosterReadiness = {
          status: 'ready',
          mutation_performed: false,
          agent_id: identityName,
          command: `narada task work-next --agent ${identityName}`,
          role_address_command: `narada task work-next --agent ${site}.${role}`,
        };
      } else {
        const now = new Date().toISOString();
        roster.agents.push({
          agent_id: identityName,
          role,
          capabilities: ['execute', 'test', 'report'],
          first_seen_at: now,
          last_active_at: now,
          status: 'idle',
          task: null,
          last_done: null,
          updated_at: now,
        });
        await saveRoster(registryTarget.registryCwd, roster);
        mutationPerformed = true;
        taskRosterReadiness = {
          status: 'created',
          mutation_performed: true,
          agent_id: identityName,
          command: `narada task work-next --agent ${identityName}`,
          role_address_command: `narada task work-next --agent ${site}.${role}`,
        };
      }
    } else {
      taskRosterReadiness = {
        status: role === 'builder' ? 'dry_run' : 'not_required',
        mutation_performed: false,
        reason: role === 'builder' ? 'dry-run does not mutate task roster' : 'task execution roster readiness is only auto-reconciled for builder role',
        repair_command: role === 'builder' ? `narada task roster add ${identityName} --role builder` : null,
      };
    }
    const labelReadiness = {
      status: 'ready',
      command: labelVerificationCommand,
      expected_identity_id: identityName,
      expected_identity_name: identityName,
      authority_boundary: 'labels are carrier projections; identity registry remains durable authority',
    };
    const aliasReadiness = {
      status: 'ready',
      aliases: operatorSurfaceAliases({
        identity_id: identityName,
        site_id: site,
        role,
        agent_kind: agentKind,
        label: options.label ?? identityName,
        admitted_by: by,
        admitted_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        authority_limits: [],
      }),
      role_address: `${site}.${role}`,
    };
    const submitStrategyReadiness = {
      status: parseSubmitStrategy(options.submitStrategy) === 'type_only' ? 'type_only_default' : 'ready',
      submit_strategy: parseSubmitStrategy(options.submitStrategy),
      repair_command: parseSubmitStrategy(options.submitStrategy) === 'type_only'
        ? `narada operator-surface identity add ${identityName} --site ${site} --role ${role} --agent-kind ${agentKind} --submit-strategy known_surface_submit --by ${by}`
        : null,
    };

    const result = {
      status: 'success',
      mutation_performed: mutationPerformed,
      dry_run: Boolean(options.dryRun),
      site,
      role,
      agent_kind: agentKind,
      identity_id: identityName,
      registry_path: operatorSurfaceIdentityPath(registryTarget.registryCwd),
      registry_authority: {
        classification: registryTarget.registryAuthority,
        cwd: resolve(cwd),
        target_registry_cwd: registryTarget.registryCwd,
        warning: registryTarget.authorityWarning,
      },
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
      readiness: {
        identity: { status: existing ? 'reused' : options.dryRun ? 'would_admit' : 'ready', identity_id: identityName },
        alias: aliasReadiness,
        submit_strategy: submitStrategyReadiness,
        binding: runtimeBinding ?? {
          status: 'deferred',
          reason: 'runtime_locus_required_for_focused_window_binding',
          repair_command: bindFocusedRepairCommand(identityName, options.runtimeLocus ?? null),
        },
        label: labelReadiness,
        task_roster: taskRosterReadiness,
      },
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

export async function operatorSurfaceAgentForkCommand(
  options: OperatorSurfaceAgentForkOptions,
  context: CommandContext,
): Promise<{ exitCode: ExitCode; result: unknown }> {
  try {
    const cwd = options.cwd ?? '.';
    const site = requireText(options.site, '--site');
    const role = normalizeInstantiateRole(options.role);
    if (!role) {
      return {
        exitCode: ExitCode.INVALID_CONFIG,
        result: { status: 'error', error: `Unsupported role: ${options.role ?? ''}`, allowed_roles: ['architect', 'builder', 'observer'] },
      };
    }
    const agentKind = requireText(options.agentKind, '--agent-kind');
    const by = requireText(options.by, '--by');
    const identityName = options.identityName?.trim() || defaultIdentityName(site, role);
    const taskNumber = options.taskNumber?.trim() || null;
    if (!taskNumber && !options.workPacket?.trim()) {
      return {
        exitCode: ExitCode.INVALID_CONFIG,
        result: {
          status: 'error',
          reason: 'task_or_work_packet_required',
          repair_command: 'narada operator-surface agent fork --site <site> --role builder --agent-kind codex_cli --task <number> --by <principal>',
        },
      };
    }

    const instantiate = await operatorSurfaceAgentInstantiateCommand({
      cwd,
      site,
      role,
      agentKind,
      by,
      identityName,
      inputCapabilities: 'type_text,submit',
      submitStrategy: 'known_surface_submit',
      dryRun: false,
      bindFocused: true,
      runtimeLocus: options.runtimeLocus,
      format: 'json',
    }, context);
    if (instantiate.exitCode !== ExitCode.SUCCESS) return instantiate;

    let taskContext: Record<string, unknown> | null = null;
    if (taskNumber) {
      const taskFile = await findTaskFile(cwd, taskNumber);
      if (!taskFile) {
        return {
          exitCode: ExitCode.INVALID_CONFIG,
          result: {
            status: 'error',
            reason: 'task_not_found',
            task_number: taskNumber,
            repair_command: `narada task read ${taskNumber} --format json`,
          },
        };
      }
      const { frontMatter, body } = await readTaskFile(taskFile.path);
      const title = /^#\s+(.+)$/m.exec(body)?.[1]?.trim() ?? taskFile.taskId;
      taskContext = {
        task_id: taskFile.taskId,
        task_number: Number(taskNumber),
        title,
        status: frontMatter.status ?? null,
        source: 'task',
      };
    }

    const now = new Date().toISOString();
    const forkId = `fork_${createHash('sha256').update(`${identityName}:${taskNumber ?? options.workPacket}:${now}`).digest('hex').slice(0, 16)}`;
    const evidenceDir = join(resolve(cwd), '.ai', 'operator-surface-forks');
    await mkdir(evidenceDir, { recursive: true });
    const handoffPath = join(evidenceDir, `${forkId}-handoff.json`);
    const adoptionPath = join(evidenceDir, `${forkId}-adoption.json`);
    const prompt = [
      `You are ${identityName}.`,
      'The human is Operator. We are governed by Narada law.',
      role === 'builder' ? 'Run the builder duty loop: claim/continue assigned work, verify through TIZ, report, close with evidence, commit, and push.' : `Run the ${role} duty loop.`,
      taskContext ? `Current task: ${taskContext.task_number} - ${taskContext.title}` : `Work packet: ${options.workPacket}`,
      'Do not widen role authority. Preserve Site and runtime locus boundaries.',
    ].join('\n');
    const handoff = {
      fork_id: forkId,
      evidence_kind: 'fork_handoff',
      created_at: now,
      created_by: by,
      identity_id: identityName,
      site,
      role,
      agent_kind: agentKind,
      runtime_locus: options.runtimeLocus ?? null,
      task_context: taskContext,
      work_packet_ref: options.workPacket ?? null,
      prompt,
      dry_run_default: true,
      exec_requested: Boolean(options.exec),
      authority_limits: [
        'fork_handoff_is_prompt_and_readiness_evidence_not_process_authority',
        'runtime_process_launch_belongs_to_owning_runtime_locus',
        'task_authority_remains_in_task_lifecycle',
      ],
    };
    const adoption = {
      fork_id: forkId,
      evidence_kind: 'fork_adoption',
      status: options.exec ? 'pending_runtime_locus_execution' : 'pending_agent_ack',
      expected_identity_id: identityName,
      expected_adoption_command: `narada operator-surface bind-focused --identity ${identityName} --runtime-locus ${options.runtimeLocus ?? '<runtime-locus-from-status>'}`,
      created_at: now,
    };
    await writeFile(handoffPath, `${JSON.stringify(handoff, null, 2)}\n`, 'utf8');
    await writeFile(adoptionPath, `${JSON.stringify(adoption, null, 2)}\n`, 'utf8');
    const result = {
      status: 'success',
      mutation_performed: true,
      action: 'operator_surface_agent_fork',
      fork_id: forkId,
      execution_status: options.exec ? 'deferred_to_runtime_locus' : 'dry_run_prepared',
      process_launch_performed: false,
      handoff_artifact: handoffPath,
      adoption_artifact: adoptionPath,
      identity_readiness: instantiate.result,
      prompt,
      next_command: options.exec
        ? `Route ${handoffPath} to the owning runtime locus ${options.runtimeLocus ?? '<runtime-locus>'} for process launch.`
        : `Inspect ${handoffPath}; rerun with --exec only from/through the owning runtime locus when launch is intended.`,
    };
    return {
      exitCode: ExitCode.SUCCESS,
      result: formattedResult(result, [
        `Prepared agent fork: ${forkId}`,
        `Identity: ${identityName}`,
        `Execution: ${result.execution_status}`,
        `Handoff: ${handoffPath}`,
        `Adoption: ${adoptionPath}`,
      ], options.format ?? 'auto'),
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

export async function operatorSurfaceIdentityRenameCommand(
  options: OperatorSurfaceIdentityRenameOptions,
  _context: CommandContext,
): Promise<{ exitCode: ExitCode; result: unknown }> {
  try {
    const cwd = options.cwd ?? '.';
    const oldIdentityId = requireText(options.fromIdentity, '--from');
    const newIdentityId = requireText(options.toIdentity, '--to');
    const by = requireText(options.by, '--by');
    if (oldIdentityId === newIdentityId) {
      return {
        exitCode: ExitCode.INVALID_CONFIG,
        result: {
          status: 'error',
          reason: 'identity_unchanged',
          mutation_performed: false,
        },
      };
    }

    const registry = await readOperatorSurfaceIdentities(cwd);
    const oldIdentity = registry.identities.find((entry) => entry.identity_id === oldIdentityId);
    if (!oldIdentity) {
      return {
        exitCode: ExitCode.INVALID_CONFIG,
        result: {
          status: 'error',
          reason: 'identity_not_found',
          mutation_performed: false,
          old_identity_id: oldIdentityId,
          unblock_command: `narada operator-surface identity add ${oldIdentityId} --site <site-id> --role <role> --agent-kind <kind> --by ${by}`,
        },
      };
    }
    const registeredSiteIds = Object.keys(registry.sites ?? {});
    const registryHasSiteAuthority = registeredSiteIds.length > 0;
    if (registryHasSiteAuthority && !registeredSiteIds.includes(oldIdentity.site_id)) {
      return {
        exitCode: ExitCode.INVALID_CONFIG,
        result: {
          status: 'error',
          reason: 'site_identity_unregistered',
          mutation_performed: false,
          old_identity_id: oldIdentityId,
          new_identity_id: newIdentityId,
          old_site_id: oldIdentity.site_id,
          registered_site_ids: registeredSiteIds,
          canonical_site_id: registeredSiteIds.length === 1 ? registeredSiteIds[0] : null,
          unblock_command: `Reconcile operator-surface identity Site ids before rename; registered Sites: ${registeredSiteIds.join(', ') || '(none)'}.`,
        },
      };
    }
    const newSitePrefix = sitePrefixFromIdentityId(newIdentityId);
    if (newSitePrefix && registryHasSiteAuthority && !registeredSiteIds.includes(newSitePrefix)) {
      return {
        exitCode: ExitCode.INVALID_CONFIG,
        result: {
          status: 'error',
          reason: 'requested_site_identity_unregistered',
          mutation_performed: false,
          old_identity_id: oldIdentityId,
          new_identity_id: newIdentityId,
          old_site_id: oldIdentity.site_id,
          requested_new_site_id: newSitePrefix,
          registered_site_ids: registeredSiteIds,
          canonical_site_id: registeredSiteIds.length === 1 ? registeredSiteIds[0] : null,
          unblock_command: `Use a registered Site id (${registeredSiteIds.join(', ')}) or reconcile Site identity aliases before rename.`,
        },
      };
    }
    if (newSitePrefix && newSitePrefix !== oldIdentity.site_id) {
      return {
        exitCode: ExitCode.INVALID_CONFIG,
        result: {
          status: 'error',
          reason: 'site_locus_mismatch',
          mutation_performed: false,
          old_identity_id: oldIdentityId,
          new_identity_id: newIdentityId,
          old_site_id: oldIdentity.site_id,
          requested_new_site_id: newSitePrefix,
          unblock_command: `Use a new identity under Site ${oldIdentity.site_id}, or perform a governed cross-Site handoff instead of identity rename.`,
        },
      };
    }
    const existingNewIdentity = registry.identities.find((entry) => entry.identity_id === newIdentityId);
    if (existingNewIdentity) {
      return {
        exitCode: ExitCode.INVALID_CONFIG,
        result: {
          status: 'error',
          reason: 'new_identity_already_exists',
          mutation_performed: false,
          old_identity_id: oldIdentityId,
          new_identity_id: newIdentityId,
          unblock_command: `Choose an unclaimed --to identity or inspect: narada operator-surface labels build --site ${oldIdentity.site_id} --format json`,
        },
      };
    }

    const roster = await loadRoster(cwd).catch(() => null);
    const rosterAgent = roster?.agents.find((agent) => agent.agent_id === oldIdentityId) ?? null;
    const activeAssignment = Boolean(rosterAgent && (rosterAgent.task != null || rosterAgent.status === 'working' || rosterAgent.status === 'reviewing'));
    if (activeAssignment && !options.allowActiveAssignment) {
      return {
        exitCode: ExitCode.INVALID_CONFIG,
        result: {
          status: 'error',
          reason: 'active_assignment_requires_explicit_consent',
          mutation_performed: false,
          old_identity_id: oldIdentityId,
          new_identity_id: newIdentityId,
          active_task: rosterAgent?.task ?? null,
          unblock_command: `Complete or release active work for ${oldIdentityId}, or rerun with --allow-active-assignment to migrate the roster pointer intentionally.`,
        },
      };
    }

    const now = new Date().toISOString();
    const migrationId = `osim_${Date.now()}_${createHash('sha256').update(`${oldIdentityId}->${newIdentityId}:${now}`).digest('hex').slice(0, 12)}`;
    const migrationDir = join(operatorSurfaceDir(cwd), 'identity-migrations');
    await mkdir(migrationDir, { recursive: true });
    const migrationPath = join(migrationDir, `${migrationId}.json`);
    const migration = {
      migration_id: migrationId,
      old_identity_id: oldIdentityId,
      new_identity_id: newIdentityId,
      site_id: oldIdentity.site_id,
      role: oldIdentity.role,
      migrated_by: by,
      migrated_at: now,
      immutable_history_posture: 'old evidence remains attributed to old_identity_id; current addressability resolves through previous_identity_ids alias',
      authority_limits: [
        'durable_identity_registry_mutated_here',
        'runtime_bindings_are_projection_records_updated_only_when present_in_same_site_root',
        'historical_evidence_not_rewritten',
      ],
    };
    await writeFile(migrationPath, `${JSON.stringify(migration, null, 2)}\n`, 'utf8');

    oldIdentity.identity_id = newIdentityId;
    oldIdentity.previous_identity_ids = [...new Set([...(oldIdentity.previous_identity_ids ?? []), oldIdentityId])];
    oldIdentity.label = options.label?.trim() || oldIdentity.label;
    oldIdentity.updated_at = now;
    oldIdentity.migration_history = [
      ...(oldIdentity.migration_history ?? []),
      {
        old_identity_id: oldIdentityId,
        new_identity_id: newIdentityId,
        migrated_by: by,
        migrated_at: now,
        evidence_path: migrationPath,
      },
    ];
    const registryPath = await writeOperatorSurfaceIdentities(cwd, registry);

    const bindings = await readRuntimeBindings(cwd);
    const migratedBindings = bindings.map((binding) => (
      binding.identity_id === oldIdentityId
        ? { ...binding, identity_id: newIdentityId }
        : binding
    ));
    const bindingsUpdated = JSON.stringify(bindings) !== JSON.stringify(migratedBindings);
    const bindingPath = bindingsUpdated ? await writeRuntimeBindings(cwd, migratedBindings) : null;

    const labels = await readVisibleLabelEvidence(cwd);
    const migratedLabels = labels.map((label) => (
      label.identity_id === oldIdentityId
        ? { ...label, identity_id: newIdentityId }
        : label
    ));
    const labelsUpdated = JSON.stringify(labels) !== JSON.stringify(migratedLabels);
    const labelPath = labelsUpdated ? await writeVisibleLabelEvidence(cwd, migratedLabels) : null;

    let rosterUpdated = false;
    if (rosterAgent && roster) {
      rosterAgent.agent_id = newIdentityId;
      rosterAgent.updated_at = now;
      await saveRoster(cwd, roster);
      rosterUpdated = true;
    }

    return {
      exitCode: ExitCode.SUCCESS,
      result: {
        status: 'success',
        mutation_performed: true,
        old_identity_id: oldIdentityId,
        new_identity_id: newIdentityId,
        role: oldIdentity.role,
        site_id: oldIdentity.site_id,
        registry_path: registryPath,
        migration_evidence_path: migrationPath,
        projection_updates: {
          runtime_bindings: bindingsUpdated ? { status: 'updated', path: bindingPath } : { status: 'none' },
          visible_labels: labelsUpdated ? { status: 'updated', path: labelPath } : { status: 'none' },
          roster: rosterUpdated ? { status: 'updated' } : { status: 'none' },
        },
        immutable_history_preserved: true,
        current_addressability_aliases: operatorSurfaceAliases(oldIdentity),
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
  const compatibilityIssues = operatorSurfaceCarrierProjectionIssues(registry);
  if (compatibilityIssues.length > 0) {
    return {
      exitCode: ExitCode.INVALID_CONFIG,
      result: {
        status: 'error',
        mutation_performed: false,
        reason: 'operator_surface_identity_registry_incompatible_with_carrier_projection',
        registry_path: operatorSurfaceIdentityPath(cwd),
        projection_boundary: {
          durable_identity_authority: operatorSurfaceIdentityPath(cwd),
          carrier_fields_are_projection: true,
          windows_identity_name_source: 'identity_id',
        },
        issues: compatibilityIssues,
        repair_guidance: 'Repair durable identity records through narada operator-surface identity add or identity rename; do not edit Windows carrier files as identity authority.',
      },
    };
  }
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
      projection_boundary: {
        durable_identity_authority: operatorSurfaceIdentityPath(cwd),
        carrier_fields_are_projection: true,
        windows_identity_name_source: 'identity_id',
      },
      projection_compatibility: {
        status: 'pass',
        carrier: 'windows_focused_window_binding',
      },
      labels: identities.map((identity) => makeOperatorSurfaceLabel(identity, registry)),
    },
  };
}

function bindingPosture(
  identity: OperatorSurfaceIdentity,
  bindings: OperatorSurfaceRuntimeBinding[],
  labelEvidence: OperatorSurfaceVisibleLabelEvidence | null = null,
): {
  runtime_locus: string | null;
  binding_status: 'bound' | 'unbound' | 'stale' | 'ambiguous' | 'missing_transport' | 'labeled_unbound';
  addressability_status: 'reachable' | 'unbound' | 'stale' | 'ambiguous' | 'missing_transport' | 'labeled_unbound';
  next_command: string | null;
  label_evidence_status: 'none' | 'visible_label_without_binding';
  visible_label: OperatorSurfaceVisibleLabelEvidence | null;
  reconciliation_command: string | null;
} {
  const bindCommand = bindFocusedRepairCommand(identity.identity_id, labelEvidence?.runtime_locus ?? null);
  const matching = bindings.filter((binding) => binding.identity_id === identity.identity_id);
  const active = matching.filter((binding) => !isStaleBinding(binding));
  if (matching.length > 0 && active.length === 0) {
    return {
      runtime_locus: matching[0]?.runtime_locus ?? null,
      binding_status: 'stale',
      addressability_status: 'stale',
      next_command: bindFocusedRepairCommand(identity.identity_id, matching[0]?.runtime_locus ?? null),
      label_evidence_status: 'none',
      visible_label: null,
      reconciliation_command: null,
    };
  }
  if (active.length === 0) {
    return {
      runtime_locus: labelEvidence?.runtime_locus ?? null,
      binding_status: labelEvidence ? 'labeled_unbound' : 'unbound',
      addressability_status: labelEvidence ? 'labeled_unbound' : 'unbound',
      next_command: bindCommand,
      label_evidence_status: labelEvidence ? 'visible_label_without_binding' : 'none',
      visible_label: labelEvidence,
      reconciliation_command: bindCommand,
    };
  }
  if (active.length > 1) {
    return {
      runtime_locus: null,
      binding_status: 'ambiguous',
      addressability_status: 'ambiguous',
      next_command: 'narada operator-surface bindings clean-stale --runtime-locus <runtime-locus-from-status>',
      label_evidence_status: 'none',
      visible_label: null,
      reconciliation_command: null,
    };
  }
  const binding = active[0]!;
  const capabilities = binding.input_capabilities ?? identity.input_capabilities ?? [];
  const hasInput = capabilities.includes('type_text') || capabilities.includes('submit');
  if (!hasInput) {
    return {
      runtime_locus: binding.runtime_locus ?? null,
      binding_status: 'missing_transport',
      addressability_status: 'missing_transport',
      next_command: `Admit or repair Operator Surface transport for ${identity.identity_id}.`,
      label_evidence_status: 'none',
      visible_label: null,
      reconciliation_command: null,
    };
  }
  return {
    runtime_locus: binding.runtime_locus ?? null,
    binding_status: 'bound',
    addressability_status: 'reachable',
    next_command: null,
    label_evidence_status: 'none',
    visible_label: null,
    reconciliation_command: null,
  };
}

function deriveOperatorSurfaceDutyLoopState(args: {
  bindingStatus: string;
  workStatus: string;
  currentTask: number | null;
  lifecycleStatus: string | null | undefined;
}): AgentWorkDutyLoopState {
  if (args.bindingStatus === 'unbound' || args.bindingStatus === 'labeled_unbound' || args.bindingStatus === 'stale' || args.bindingStatus === 'ambiguous' || args.bindingStatus === 'missing_transport') {
    return 'unbound';
  }
  if (args.workStatus === 'blocked') return 'blocked';
  if (args.workStatus === 'done') return 'done';
  if (args.lifecycleStatus === 'in_review') return 'in_review';
  if (args.currentTask != null) return 'has_active_task';
  return 'idle';
}

export async function operatorSurfaceStatusCommand(
  options: OperatorSurfaceStatusOptions,
  _context: CommandContext,
): Promise<{ exitCode: ExitCode; result: unknown }> {
  const cwd = options.cwd ?? '.';
  const registry = await readOperatorSurfaceIdentities(cwd);
  const bindings = await readRuntimeBindings(cwd);
  const labelEvidence = await readVisibleLabelEvidence(cwd);
  const roster = await loadRoster(cwd).then(async (loaded) => {
    if (loaded.agents.length > 0) return loaded;
    try {
      const raw = await readFile(join(resolve(cwd), '.ai', 'agents', 'roster.json'), 'utf8');
      const parsed = JSON.parse(raw) as { agents?: unknown[] };
      return Array.isArray(parsed.agents) ? parsed as Awaited<ReturnType<typeof loadRoster>> : loaded;
    } catch {
      return loaded;
    }
  }).catch(async () => {
    try {
      const raw = await readFile(join(resolve(cwd), '.ai', 'agents', 'roster.json'), 'utf8');
      const parsed = JSON.parse(raw) as { agents?: unknown[] };
      return Array.isArray(parsed.agents) ? parsed as Awaited<ReturnType<typeof loadRoster>> : null;
    } catch {
      return null;
    }
  });
  const identities = registry.identities
    .filter((identity) => !options.site || identity.site_id === options.site)
    .slice(0, options.limit ?? 50);

  const agents = await Promise.all(identities.map(async (identity) => {
    const rosterAgent = (roster?.agents ?? []).find((agent) => (
      agent.agent_id === identity.identity_id
      || agent.agent_id === identity.role
      || agent.role === identity.role
    ));
    const currentTask = rosterAgent?.task ?? null;
    const lifecycle = currentTask == null ? { status: null, source: null } : await resolveTaskStatus(cwd, currentTask);
    const posture = bindingPosture(identity, bindings, visibleLabelForIdentity(identity, labelEvidence));
    const workStatus = rosterAgent?.status ?? 'untracked';
    const dutyLoopState = deriveOperatorSurfaceDutyLoopState({
      bindingStatus: posture.binding_status,
      workStatus,
      currentTask,
      lifecycleStatus: lifecycle.status,
    });
    const nextCommand = posture.next_command
      ?? (currentTask != null
        ? `narada task continue ${currentTask} --agent ${rosterAgent?.agent_id ?? identity.role}`
        : `narada work-next --agent ${rosterAgent?.agent_id ?? identity.role} --format json`);
    return {
      identity_id: identity.identity_id,
      role: identity.role,
      site_id: identity.site_id,
      runtime_locus: posture.runtime_locus,
      binding_status: posture.binding_status,
      addressability_status: posture.addressability_status,
      label_evidence_status: posture.label_evidence_status,
      visible_label: posture.visible_label,
      reconciliation_command: posture.reconciliation_command,
      work_status: workStatus,
      duty_loop_state: dutyLoopState,
      current_task: currentTask,
      lifecycle_status: lifecycle.status,
      lifecycle_status_source: lifecycle.source,
      last_activity_at: rosterAgent?.last_active_at ?? rosterAgent?.updated_at ?? null,
      next_command: nextCommand,
    };
  }));

  return {
    exitCode: ExitCode.SUCCESS,
    result: {
      status: 'success',
      mutation_performed: false,
      registry_path: operatorSurfaceIdentityPath(cwd),
      count: agents.length,
      agents,
      human: agents.map((agent) => [
        `${agent.role}: ${agent.work_status}`,
        `identity=${agent.identity_id}`,
        `addressability=${agent.addressability_status}`,
        agent.label_evidence_status === 'none' ? null : `label=${agent.label_evidence_status}`,
        agent.current_task == null ? 'task=none' : `task=${agent.current_task}(${agent.lifecycle_status ?? 'unknown'})`,
        `next=${agent.next_command}`,
      ].filter(Boolean).join(' | ')),
    },
  };
}

export async function operatorSurfaceInspectCompactCommand(
  options: OperatorSurfaceInspectCompactOptions,
  _context: CommandContext,
): Promise<{ exitCode: ExitCode; result: unknown }> {
  const cwd = options.cwd ?? '.';
  const registry = await readOperatorSurfaceIdentities(cwd);
  const labelEvidence = await readVisibleLabelEvidenceStrict(cwd);
  if (labelEvidence.status === 'error') {
    return {
      exitCode: ExitCode.INVALID_CONFIG,
      result: {
        status: 'error',
        mutation_performed: false,
        reason: labelEvidence.reason,
        inspected_path: labelEvidence.path,
        expected_schema: {
          labels: [{
            identity_id: 'string optional',
            site_id: 'string optional',
            role: 'string optional',
            label: 'string optional',
            runtime_locus: 'string optional',
            status: 'visible | stale | revoked optional',
          }],
        },
        repair_guidance: labelEvidence.repair_guidance,
      },
    };
  }
  const bindings = await readRuntimeBindings(cwd);
  const compatibilityIssues = operatorSurfaceCarrierProjectionIssues(registry);
  if (compatibilityIssues.length > 0) {
    return {
      exitCode: ExitCode.INVALID_CONFIG,
      result: {
        status: 'error',
        mutation_performed: false,
        reason: 'operator_surface_identity_registry_incompatible_with_carrier_projection',
        issues: compatibilityIssues,
        repair_guidance: 'Repair durable identity records through narada operator-surface identity add or identity rename before compact inspection.',
      },
    };
  }

  const identities = registry.identities
    .filter((identity) => !options.site || identity.site_id === options.site)
    .slice(0, options.limit ?? 50);
  const labels = identities.map((identity) => makeOperatorSurfaceLabel(identity, registry));
  const rows = identities.map((identity) => {
    const label = labels.find((entry) => entry.identity_id === identity.identity_id) ?? null;
    const visible = visibleLabelForIdentity(identity, labelEvidence.labels);
    const posture = bindingPosture(identity, bindings, visible);
    return {
      identity_id: identity.identity_id,
      identity_name: label?.identity_name ?? identity.identity_id,
      site_id: identity.site_id,
      role: identity.role,
      label: label?.label ?? identity.label ?? identity.identity_id,
      runtime_locus: posture.runtime_locus,
      binding_status: posture.binding_status,
      addressability_status: posture.addressability_status,
      visible_label_status: posture.label_evidence_status,
      repair_command: posture.next_command,
    };
  });

  return {
    exitCode: ExitCode.SUCCESS,
    result: {
      status: 'success',
      mutation_performed: false,
      schema: 'https://narada.dev/schemas/operator-surface-compact-inspect/v1',
      inspected_paths: {
        identities: operatorSurfaceIdentityPath(cwd),
        runtime_bindings: runtimeBindingPath(cwd),
        visible_labels: visibleLabelEvidencePath(cwd),
      },
      projection_boundary: {
        durable_identity_authority: operatorSurfaceIdentityPath(cwd),
        runtime_binding_authority: 'owning runtime locus',
        visible_labels_are_carrier_evidence: true,
      },
      count: rows.length,
      labels,
      rows,
      architect_loop_guidance: 'Use this compact schema instead of ad hoc Select-Object projections against carrier-specific overlay JSON.',
    },
  };
}

export async function operatorSurfaceVoiceTranscriptionCheckCommand(
  options: OperatorSurfaceVoiceTranscriptionCheckOptions,
  _context: CommandContext,
): Promise<{ exitCode: ExitCode; result: unknown }> {
  try {
    const cwd = options.cwd ?? '.';
    const site = requireText(options.site, '--site');
    const principal = requireText(options.principal, '--principal');
    const micOnly = Boolean(options.micOnly);

    if (micOnly) {
      return {
        exitCode: ExitCode.SUCCESS,
        result: {
          status: 'success',
          mutation_performed: false,
          mode: 'mic_only',
          site,
          principal,
          microphone_capture_available: 'not_tested_by_narada_proper',
          remote_transcription_admissible: false,
          remote_audio_will_be_sent: false,
          credential: resolveCredentialReferencePosture(null),
          capability: {
            required: false,
            grant_id: null,
            kind: 'voice.transcription.remote',
            action: 'remote_audio_transcribe',
          },
          repair: null,
          raw_secret_exposed: false,
        },
      };
    }

    const registry = await readCapabilityRegistry(cwd);
    const grant = options.capabilityGrantId
      ? registry.grants.find((entry) => entry.grant_id === options.capabilityGrantId)
      : registry.grants.find((entry) =>
        entry.site_id === site &&
        entry.principal_id === principal &&
        entry.capability_kind === 'voice.transcription.remote' &&
        entry.allowed_actions.includes('remote_audio_transcribe') &&
        grantEffectiveStatus(entry) === 'active'
      );

    if (!grant) {
      return {
        exitCode: ExitCode.INVALID_CONFIG,
        result: {
          status: 'error',
          reason: 'missing_capability_consent',
          mode: 'remote_transcription',
          site,
          principal,
          microphone_capture_available: 'not_tested_by_narada_proper',
          transcription_credential_available: false,
          remote_transcription_admissible: false,
          remote_audio_will_be_sent: false,
          capability: {
            required: true,
            grant_id: options.capabilityGrantId ?? null,
            kind: 'voice.transcription.remote',
            action: 'remote_audio_transcribe',
            effective_status: null,
          },
          credential: resolveCredentialReferencePosture(validateCredentialRef(options.credentialRef)),
          repair: 'Grant consent before remote audio transcription: narada capability grant --site <site> --principal <principal> --kind voice.transcription.remote --allow remote_audio_transcribe --credential-ref env:<VAR> --by <principal>',
          raw_secret_exposed: false,
        },
      };
    }

    const effectiveStatus = grantEffectiveStatus(grant);
    const actionAllowed = grant.allowed_actions.includes('remote_audio_transcribe');
    const kindAllowed = grant.capability_kind === 'voice.transcription.remote';
    const siteAllowed = grant.site_id === site;
    const principalAllowed = grant.principal_id === principal;
    const credentialRef = validateCredentialRef(options.credentialRef) ?? grant.credential_ref;
    const credential = resolveCredentialReferencePosture(credentialRef);
    const blockers: string[] = [];
    if (effectiveStatus !== 'active') blockers.push(`grant ${effectiveStatus}`);
    if (!kindAllowed) blockers.push('grant kind is not voice.transcription.remote');
    if (!actionAllowed) blockers.push('grant does not allow remote_audio_transcribe');
    if (!siteAllowed) blockers.push('grant site does not match requested Site');
    if (!principalAllowed) blockers.push('grant principal does not match requested principal');
    if (!credentialRef) blockers.push('credential reference missing');
    if (credential.local_secret_material_status === 'missing') blockers.push('credential material missing');

    return {
      exitCode: blockers.length === 0 ? ExitCode.SUCCESS : ExitCode.INVALID_CONFIG,
      result: {
        status: blockers.length === 0 ? 'success' : 'error',
        reason: blockers.length === 0 ? null : 'remote_transcription_not_admissible',
        mode: 'remote_transcription',
        site,
        principal,
        microphone_capture_available: 'not_tested_by_narada_proper',
        transcription_credential_available: credential.local_secret_material_status === 'present' || credential.local_secret_material_status === 'site_local_extension_required',
        remote_transcription_admissible: blockers.length === 0,
        remote_audio_will_be_sent: false,
        capability: {
          required: true,
          grant_id: grant.grant_id,
          kind: grant.capability_kind,
          action: 'remote_audio_transcribe',
          effective_status: effectiveStatus,
          allowed: kindAllowed && actionAllowed && siteAllowed && principalAllowed,
        },
        credential,
        blockers,
        repair: blockers.length === 0
          ? 'Remote adapter may proceed only after its own dry-run/output-admission path; this check does not send audio.'
          : credential.repair ?? 'Repair capability consent before remote audio transcription.',
        raw_secret_exposed: false,
      },
    };
  } catch (error) {
    return errorResult(error);
  }
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
  let registry = await readOperatorSurfaceIdentities(cwd);
  const known = registry.identities.some((entry) => entry.identity_id === identity);
  const requestedRuntimeLocus = options.runtimeLocus?.trim();
  const siteNormalization = requestedRuntimeLocus
    ? await normalizeIdentitySiteForRuntimeLocus(cwd, registry, identity, requestedRuntimeLocus)
    : { registry, normalized: false, before_site_id: null, after_site_id: null };
  registry = siteNormalization.registry;
  const admittedIdentity = registry.identities.find((entry) => entry.identity_id === identity) ?? null;
  if (
    known
    && requestedRuntimeLocus
    && isCanonicalSiteLocus(requestedRuntimeLocus)
    && admittedIdentity?.site_id !== canonicalSiteId(requestedRuntimeLocus)
  ) {
    return {
      exitCode: ExitCode.INVALID_CONFIG,
      result: {
        status: 'error',
        reason: 'runtime_locus_site_mismatch',
        identity,
        identity_site_id: admittedIdentity?.site_id ?? null,
        requested_runtime_locus: requestedRuntimeLocus,
        canonical_runtime_locus: canonicalSiteId(requestedRuntimeLocus),
        mutation_performed: false,
        runtime_binding_mutated: false,
        repair_command: `Use runtime locus ${admittedIdentity?.site_id ?? '<identity-site-id>'}, or admit/rename the identity under the canonical Site before binding.`,
      },
    };
  }
  if (known && requestedRuntimeLocus) {
    const observed = observedCurrentRuntimeHandle(options);
    const bindings = await readRuntimeBindings(cwd);
    const now = new Date().toISOString();
    const binding: OperatorSurfaceRuntimeBinding = {
      binding_id: `bind_${createHash('sha256').update(`${identity}:${canonicalSiteId(requestedRuntimeLocus)}:${observed.handle}`).digest('hex').slice(0, 16)}`,
      identity_id: identity,
      runtime_locus: canonicalSiteId(requestedRuntimeLocus) ?? requestedRuntimeLocus,
      handle: observed.handle,
      transport: observed.transport,
      submit_strategy: 'known_surface_submit',
      input_capabilities: ['type_text', 'submit'],
      status: 'active',
      stale_after: options.staleAfter?.trim() || undefined,
    };
    const nextBindings = [
      ...bindings.filter((entry) => entry.identity_id !== identity),
      binding,
    ];
    const bindingPath = await writeRuntimeBindings(cwd, nextBindings);
    return {
      exitCode: ExitCode.SUCCESS,
      result: {
        status: 'success',
        reason: 'runtime_binding_admitted',
        identity,
        self_resolution: selfResolution,
        mutation_performed: true,
        runtime_binding_mutated: true,
        binding,
        binding_path: bindingPath,
        site_normalization: siteNormalization.normalized ? {
          before_site_id: siteNormalization.before_site_id,
          after_site_id: siteNormalization.after_site_id,
        } : null,
        observed_handle_source: observed.source,
        admitted_at: now,
        authority_split: {
          durable_identity_authority: operatorSurfaceIdentityPath(cwd),
          volatile_handle_authority: binding.runtime_locus,
        },
      },
    };
  }
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
      handoff: known ? bindFocusedHandoff(identity, options.runtimeLocus ?? null) : null,
      deferred_command: known ? bindFocusedRepairCommand(identity, options.runtimeLocus ?? null) : undefined,
      next_commands: known ? bindFocusedHandoff(identity, options.runtimeLocus ?? null).discovery_commands : [],
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
    const requestedRecipient = (options.to?.trim() || options.identity?.trim()) ?? '';
    if (!requestedRecipient) throw new Error('--to is required');
    const legacyIdentityAlias = !options.to?.trim() && Boolean(options.identity?.trim());
    const text = requireText(options.text, '--text');
    const registry = await readOperatorSurfaceIdentities(cwd);
    const sender = options.from?.trim() || 'operator';
    const rawInput = Boolean(options.rawInput);
    const currentSite = options.currentSite?.trim() || inferCurrentSite(registry);
    if (isBareRoleAddress(requestedRecipient) && !currentSite) {
      return {
        exitCode: ExitCode.INVALID_CONFIG,
        result: {
          status: 'error',
          reason: 'current_site_required_for_bare_role',
          mutation_performed: false,
          unblock_command: 'Rerun with --current-site <site-id> or use a Site-qualified recipient such as <site>.builder.',
          ...routeFields({
            sender,
            requestedRecipient,
            currentSite,
            targetSite: null,
            resolvedRecipient: null,
            legacyIdentityAlias,
          }),
        },
      };
    }
    const sendIdentity = await resolveOperatorSurfaceSendIdentity(cwd, registry, requestedRecipient);
    const identityResolution = sendIdentity.identityResolution;
    const admittedIdentity = sendIdentity.admittedIdentity;
    const identity = sendIdentity.identity;
    const agentFields = agentResolutionFields(sendIdentity.agentResolution);
    const targetSite = sendIdentity.agentResolution?.site_prefix
      ?? admittedIdentity?.site_id
      ?? sitePrefixFromAddress(requestedRecipient)
      ?? (isBareRoleAddress(requestedRecipient) ? currentSite : null);
    const baseRoute = {
      sender,
      requestedRecipient,
      currentSite,
      targetSite,
      resolvedRecipient: admittedIdentity?.identity_id ?? sendIdentity.agentResolution?.resolved_agent ?? null,
      legacyIdentityAlias,
    };
    if (isBareRoleAddress(requestedRecipient) && admittedIdentity && currentSite && admittedIdentity.site_id !== currentSite) {
      return {
        exitCode: ExitCode.INVALID_CONFIG,
        result: {
          status: 'error',
          reason: 'site_plane_mismatch',
          identity,
          identity_resolution: publicIdentityResolution(identityResolution),
          ...agentFields,
          ...routeFields(baseRoute),
          mutation_performed: false,
          unblock_command: `Use a Site-qualified recipient such as ${admittedIdentity.site_id}.${admittedIdentity.role}, or rerun with --current-site ${admittedIdentity.site_id} if that is the intended Site plane.`,
        },
      };
    }
    if (sendIdentity.agentResolution && !sendIdentity.agentResolution.resolved_agent) {
      return {
        exitCode: ExitCode.INVALID_CONFIG,
        result: {
          status: 'error',
          reason: sendIdentity.agentResolution.status === 'multi_match' ? 'agent_address_ambiguous' : 'agent_not_in_roster',
          identity: requestedRecipient,
          identity_resolution: publicIdentityResolution(identityResolution),
          ...agentFields,
          ...routeFields(baseRoute),
          mutation_performed: false,
          candidates: sendIdentity.agentResolution.candidates,
          unblock_command: 'repair_command' in sendIdentity.agentResolution
            ? sendIdentity.agentResolution.repair_command
            : `narada task roster add ${requestedRecipient}`,
        },
      };
    }
    if (!admittedIdentity) {
      const roleRepair = normalizeInstantiateRole(requestedRecipient)
        ? `narada operator-surface agent instantiate --site <site-id-or-root> --role ${normalizeInstantiateRole(requestedRecipient)} --agent-kind codex_cli --by <principal>`
        : `narada operator-surface agent instantiate --site <site-id-or-root> --role <role> --agent-kind codex_cli --by <principal> --identity ${identity}`;
      return {
        exitCode: ExitCode.INVALID_CONFIG,
        result: {
          status: 'error',
          reason: 'identity_not_admitted',
          identity,
          identity_resolution: publicIdentityResolution(identityResolution),
          ...agentFields,
          ...routeFields(baseRoute),
          available_aliases: identityResolution.known_aliases,
          mutation_performed: false,
          unblock_command: roleRepair,
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
          ...agentFields,
          ...routeFields(baseRoute),
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
          identity_resolution: publicIdentityResolution(identityResolution),
          ...agentFields,
          ...routeFields({ ...baseRoute, bindingStatus: 'stale' }),
          mutation_performed: false,
          handoff: bindFocusedHandoff(identity, options.runtimeLocus ?? null),
          unblock_command: bindFocusedRepairCommand(identity, options.runtimeLocus ?? null),
        },
      };
    }
    if (activeBindings.length === 0) {
      const labelEvidence = visibleLabelForIdentity(admittedIdentity, await readVisibleLabelEvidence(cwd));
      const bindCommand = bindFocusedRepairCommand(identity, labelEvidence?.runtime_locus ?? options.runtimeLocus ?? null);
      return {
        exitCode: ExitCode.INVALID_CONFIG,
        result: {
          status: 'error',
          reason: 'no_binding',
          identity,
          identity_resolution: publicIdentityResolution(identityResolution),
          ...agentFields,
          ...routeFields({ ...baseRoute, bindingStatus: labelEvidence ? 'labeled_unbound' : 'unbound' }),
          visible_label: labelEvidence,
          label_evidence_status: labelEvidence ? 'visible_label_without_binding' : 'none',
          explanation: labelEvidence
            ? 'A visible title/label is evidence that a surface may be present, but it is not an addressable runtime binding and does not authorize message send.'
            : 'The identity is admitted, but no active runtime binding exists. A window title or label alone is not enough to send input.',
          mutation_performed: false,
          handoff: bindFocusedHandoff(identity, labelEvidence?.runtime_locus ?? options.runtimeLocus ?? null),
          unblock_command: bindCommand,
          reconciliation_command: bindCommand,
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
          identity_resolution: publicIdentityResolution(identityResolution),
          ...agentFields,
          ...routeFields({ ...baseRoute, bindingStatus: 'ambiguous' }),
          mutation_performed: false,
          matching_bindings: activeBindings.map((binding) => ({
            binding_id: binding.binding_id ?? null,
            runtime_locus: binding.runtime_locus ?? null,
            handle: binding.handle ?? null,
          })),
          unblock_command: `Pass --runtime-locus or run narada operator-surface bindings clean-stale --runtime-locus ${options.runtimeLocus ?? '<runtime-locus-from-status>'}`,
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
          identity_resolution: publicIdentityResolution(identityResolution),
          ...agentFields,
          ...routeFields({ ...baseRoute, bindingStatus: 'missing_transport' }),
          mutation_performed: false,
          binding: {
            binding_id: binding.binding_id ?? null,
            runtime_locus: binding.runtime_locus ?? null,
          },
          handoff: bindFocusedHandoff(identity, binding.runtime_locus ?? options.runtimeLocus ?? null),
          unblock_command: `Admit or repair Operator Surface transport for ${identity}, then rerun narada operator-surface send --to ${identity}.`,
        },
      };
    }

    const activityState = options.operatorActivityState?.trim()
      ? parseOperatorActivityState(options.operatorActivityState)
      : options.execute ? 'unknown' : 'idle';
    const activeDeliveryPolicy = parseActiveDeliveryPolicy(options.activeDelivery);
    const deliveryTimeoutMs = parseDeliveryTimeoutMs(options.deliveryTimeoutMs);
    const crossDesktopPolicy = parseCrossDesktopPolicy(options.crossDesktopPolicy);
    const currentDesktop = options.currentDesktop?.trim() || null;
    const targetDesktop = options.targetDesktop?.trim() || binding.desktop_id || null;
    const delivery = decideOperatorSurfaceDelivery({
      activityState,
      activityObservedAt: options.operatorActivityObservedAt?.trim() || null,
      activeDeliveryPolicy,
      deliveryTimeoutMs,
      urgentInterruptAuthority: options.urgentInterruptAuthority?.trim() || null,
      currentDesktop,
      targetDesktop,
      crossDesktopPolicy,
      crossDesktopAuthority: options.crossDesktopAuthority?.trim() || null,
    });
    const deliveryStateValidation = validateOperatorSurfaceDeliveryStatePath(delivery.state_path);
    if (!deliveryStateValidation.valid) {
      return {
        exitCode: ExitCode.INVALID_CONFIG,
        result: {
          status: 'error',
          reason: 'invalid_operator_surface_delivery_state_transition',
          mutation_performed: false,
          validation: deliveryStateValidation,
          delivery_result: delivery,
        },
      };
    }

    const renderedMessage = renderOperatorSurfaceMessage(sender, text, rawInput);
    const eventId = `ose_${Date.now()}_${textDigest(`${identity}:${renderedMessage.rendered_text}`).slice(0, 12)}`;
    const send = {
      event_id: eventId,
      identity,
      runtime_locus: binding.runtime_locus ?? options.runtimeLocus ?? null,
      resolved_runtime_handle: binding.handle ?? null,
      transport: binding.transport ?? null,
      submit_strategy: submitStrategy,
      text_digest: textDigest(renderedMessage.rendered_text),
      text_length: renderedMessage.rendered_text_length,
      original_text_digest: textDigest(text),
      original_text_length: text.length,
      rendered_text: renderedMessage.rendered_text,
      rendered_text_digest: renderedMessage.rendered_text_digest,
      rendered_text_length: renderedMessage.rendered_text_length,
      sender_header_included: renderedMessage.sender_header_included,
      input_posture: renderedMessage.input_posture,
      ...agentFields,
      ...routeFields({ ...baseRoute, bindingStatus: 'bound', resolvedRecipient: identity }),
      sender,
      sender_identity: sender,
      resolved_sender_identity: sender,
      recipient: identity,
      site_plane: {
        current_site: currentSite,
        target_site: targetSite,
      },
      binding_proof: {
        binding_id: binding.binding_id ?? null,
        runtime_locus: binding.runtime_locus ?? options.runtimeLocus ?? null,
        status: 'bound',
      },
      delivery_result: delivery,
      dry_run: Boolean(options.dryRun || !options.execute || !delivery.deliverable),
      status: delivery.deliverable
        ? options.execute ? 'event_recorded_for_runtime_locus' : 'validated_dry_run'
        : delivery.status,
    };
    const eventArtifact = options.execute ? await writeOperatorSurfaceSendEvent(cwd, send) : null;
    return {
      exitCode: ExitCode.SUCCESS,
      result: {
        status: 'success',
        mutation_performed: Boolean(options.execute && delivery.deliverable),
        event_artifact: eventArtifact,
        identity_resolution: publicIdentityResolution(identityResolution),
        ...agentFields,
        ...routeFields({ ...baseRoute, bindingStatus: 'bound', resolvedRecipient: identity }),
        delivery_result: delivery,
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
