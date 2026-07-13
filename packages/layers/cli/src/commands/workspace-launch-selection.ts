import { resolve } from 'node:path';
import { buildAgentIdentityRefV2 } from '@narada2/agent-identity';
import { NARADA_AGENT_RUNTIME_SERVER_KIND, normalizeRuntimeAlias } from '@narada2/carrier-runtime-contract/carrier-runtime-selection';
import type { ResolvedSiteRoot } from '../lib/site-root-resolver.js';
import type {
  WorkspaceLaunchSelectionCardinality,
  WorkspaceLaunchSelection as WorkspaceLaunchBrowserSelection,
  WorkspaceLaunchSelectionMode,
  WorkspaceLaunchOption as WorkspaceLaunchSelectorOptionContract,
  WorkspaceLaunchSelectorModel as WorkspaceLaunchSelectorModelContract,
} from '@narada2/workspace-launch-contract';
import type { WorkspaceLaunchPlanOptions, WorkspaceLaunchRecord } from './workspace-launch-types.js';

export interface WorkspaceLaunchProviderRegistry {
  default_provider?: string;
  providers?: Record<string, {
    meaning?: string;
    support_state?: string;
  }>;
}

export interface WorkspaceLaunchSelectionContext {
  providerRegistry: WorkspaceLaunchProviderRegistry;
  admittedProviders?: string[];
  resolveCarrierRuntimeSelection: (operatorSurface: string | undefined, runtime: string) => {
    carrier_kind: string;
    operator_surface_kind: string;
    runtime_substrate_kind: string;
    runtime_host_kind: string;
  };
}

export type WorkspaceLaunchSelectorOption = WorkspaceLaunchSelectorOptionContract;
export type WorkspaceLaunchSelectorModel = WorkspaceLaunchSelectorModelContract;

const NARS_OPERATOR_SURFACE_KINDS = ['agent-cli', 'agent-web-ui'] as const;

export function workspaceLaunchSelectionMode(
  raw: unknown,
  selection: Pick<WorkspaceLaunchBrowserSelection, 'site' | 'role' | 'operatorSurface'>,
): WorkspaceLaunchSelectionMode | undefined {
  const source = isRecord(raw) ? raw : {};
  const cardinality = (key: keyof WorkspaceLaunchSelectionMode, values: string[]): WorkspaceLaunchSelectionCardinality =>
    values.length > 1 || source[key] === 'multiple' ? 'multiple' : 'single';
  const mode = {
    site: cardinality('site', selection.site),
    role: cardinality('role', selection.role),
    operatorSurface: cardinality('operatorSurface', selection.operatorSurface),
  };
  return mode.site === 'single' && mode.role === 'single' && mode.operatorSurface === 'single' && !isRecord(raw) ? undefined : mode;
}

export function canonicalizeWorkspaceLaunchRecords(
  records: WorkspaceLaunchRecord[],
  siteCatalog: ResolvedSiteRoot[],
): WorkspaceLaunchRecord[] {
  const byRoot = new Map(
    siteCatalog
      .filter((site): site is ResolvedSiteRoot & { site_id: string } => typeof site.site_id === 'string' && site.site_id.length > 0)
      .map((site) => [resolve(site.site_root).toLowerCase(), site.site_id] as const),
  );
  if (byRoot.size === 0) return records;
  return records.map((record) => {
    const canonicalSiteId = byRoot.get(resolve(record.site_root).toLowerCase());
    if (!canonicalSiteId || canonicalSiteId === record.site) return record;
    const identityRef = record.agent_identity_ref
      ? buildAgentIdentityRefV2({
          identity_scope: { kind: 'narada_site', site_id: canonicalSiteId },
          local_agent_id: record.agent_identity_ref.local_agent_id,
          role: record.agent_identity_ref.role,
          legacy_agent_id: record.agent_identity_ref.legacy_agent_id ?? record.agent,
        })
      : record.agent_identity_ref;
    return {
      ...record,
      agent_identity_ref: identityRef,
      site: canonicalSiteId,
      legacy_site: record.legacy_site ?? record.site,
    };
  });
}

function workspaceLaunchCapabilityPairs(
  records: WorkspaceLaunchRecord[],
  context: WorkspaceLaunchSelectionContext,
): Array<{ operatorSurface: string; runtime: string }> {
  const candidates = records.flatMap((record) => {
    const runtime = normalizeRuntimeAlias(record.runtime);
    const pairs: Array<{ operatorSurface: string; runtime: string }> = [{ operatorSurface: record.carrier, runtime }];
    if (runtime === NARADA_AGENT_RUNTIME_SERVER_KIND) {
      for (const operatorSurface of NARS_OPERATOR_SURFACE_KINDS) pairs.push({ operatorSurface, runtime });
    }
    return pairs;
  });
  const admitted = new Map<string, { operatorSurface: string; runtime: string }>();
  for (const pair of candidates) {
    try {
      context.resolveCarrierRuntimeSelection(pair.operatorSurface, pair.runtime);
      admitted.set(`${pair.operatorSurface}\u0000${pair.runtime}`, pair);
    } catch {
      // Historical registry entries do not make an interactive option launchable.
    }
  }
  return [...admitted.values()];
}

function workspaceLaunchCapabilityValues(
  records: WorkspaceLaunchRecord[],
  context: WorkspaceLaunchSelectionContext,
  operatorSurfaces: string[] = [],
  runtime?: string,
): { operatorSurfaceValues: string[]; runtimeValues: string[] } {
  const pairs = workspaceLaunchCapabilityPairs(records, context);
  const explicitSurfaces = operatorSurfaces.filter((value) => value !== 'registry default');
  const explicitRuntime = runtime && runtime !== 'registry default' ? normalizeRuntimeAlias(runtime) : null;
  const filteredPairs = explicitRuntime ? pairs.filter((pair) => pair.runtime === explicitRuntime) : pairs;
  const operatorSurfaceValues = unique(['registry default', ...filteredPairs.map((pair) => pair.operatorSurface)]);
  const selectedSurfaces = explicitSurfaces.filter((surface) => operatorSurfaceValues.includes(surface));
  const compatiblePairs = selectedSurfaces.length === 0
    ? pairs
    : pairs.filter((pair) => selectedSurfaces.every((surface) => pair.operatorSurface === surface
      || pairs.some((candidate) => candidate.operatorSurface === surface && candidate.runtime === pair.runtime)));
  return {
    operatorSurfaceValues,
    runtimeValues: unique(['registry default', ...compatiblePairs.map((pair) => pair.runtime)]),
  };
}

export function workspaceLaunchSelectorModel(
  records: WorkspaceLaunchRecord[],
  selection: Partial<WorkspaceLaunchBrowserSelection> = {},
  siteCatalog: ResolvedSiteRoot[] = [],
  context: WorkspaceLaunchSelectionContext,
): WorkspaceLaunchSelectorModel {
  const effectiveRecords = canonicalizeWorkspaceLaunchRecords(records, siteCatalog);
  const siteValues = unique(effectiveRecords.map((record) => record.site));
  const selectedSites = nonEmptyStringArray(selection.site).filter((site) => siteValues.includes(site));
  const roleValues = roleChoicesForSelectedSites(effectiveRecords, selectedSites);
  const requestedRoles = nonEmptyStringArray(selection.role).filter((role) => roleValues.includes(role));
  const selectedRoles = requestedRoles.length > 0 ? requestedRoles : initialRoleValuesForInteractiveSelection(roleValues);
  const selectedRecords = selectLaunchRecords(effectiveRecords, { all: true, site: selectedSites, role: selectedRoles });
  const capabilityValues = workspaceLaunchCapabilityValues(selectedRecords, context);
  const selectedOperatorSurfaces = initialOperatorSurfaceValues(capabilityValues.operatorSurfaceValues, nonEmptyStringArray(selection.operatorSurface).join(','));
  const requestedRuntime = nonEmpty(selection.runtime);
  const runtimeValues = workspaceLaunchCapabilityValues(selectedRecords, context, selectedOperatorSurfaces).runtimeValues;
  const selectedRuntime = requestedRuntime && runtimeValues.includes(normalizeRuntimeAlias(requestedRuntime))
    ? normalizeRuntimeAlias(requestedRuntime)
    : 'registry default';
  const operatorSurfaceValues = workspaceLaunchCapabilityValues(selectedRecords, context, selectedOperatorSurfaces, selectedRuntime).operatorSurfaceValues;
  const normalizedOperatorSurfaces = initialOperatorSurfaceValues(operatorSurfaceValues, selectedOperatorSurfaces.join(','));
  const providerOperatorSurface = normalizedOperatorSurfaces.includes('agent-cli') ? 'agent-cli' : (normalizedOperatorSurfaces[0] ?? 'registry default');
  const intelligenceProviderOptions = intelligenceProviderChoicesForLaunchSelection({
    records: selectedRecords,
    operatorSurface: providerOperatorSurface,
    runtime: selectedRuntime,
    context,
  });
  const providerValues = new Set(intelligenceProviderOptions.map((option) => option.value));
  const requestedProvider = nonEmpty(selection.intelligenceProvider);
  const selectedProvider = requestedProvider && providerValues.has(requestedProvider) ? requestedProvider : 'registry default';
  return {
    schema: 'narada.workspace_launch.selector_model.v1',
    siteOptions: siteValues.map((site) => ({ value: site, label: site })),
    roleOptions: roleValues.map((role) => ({ value: role, label: role })),
    operatorSurfaceOptions: operatorSurfaceValues.map((surface) => ({
      value: surface,
      label: surface === 'registry default' ? registryDefaultOperatorSurfaceLabel(selectedRecords) : surface,
      hint: surface === 'registry default' ? 'use each registry entry value' : undefined,
    })),
    runtimeOptions: runtimeValues.map((runtimeValue) => ({
      value: runtimeValue,
      label: runtimeValue === 'registry default' ? registryDefaultRuntimeLabel(selectedRecords) : runtimeValue,
      hint: runtimeValue === 'registry default' ? 'use each registry entry value' : undefined,
    })),
    intelligenceProviderOptions,
    selected: {
      site: selectedSites,
      role: selectedRoles,
      operatorSurface: normalizedOperatorSurfaces,
      runtime: selectedRuntime,
      intelligenceProvider: selectedProvider,
    },
  };
}

export function normalizeWorkspaceLaunchBrowserSelection(
  payload: Partial<WorkspaceLaunchBrowserSelection>,
): WorkspaceLaunchBrowserSelection {
  const site = stringArray(payload.site).filter(Boolean);
  const role = stringArray(payload.role).filter(Boolean);
  const operatorSurface = normalizeInteractiveOperatorSurfaceValues(stringArray(payload.operatorSurface).filter(Boolean));
  const runtime = nonEmpty(payload.runtime) ?? 'registry default';
  const intelligenceProvider = nonEmpty(payload.intelligenceProvider) ?? 'registry default';
  if (site.length === 0) throw new Error('interactive_selection_ui_site_required');
  if (role.length === 0) throw new Error('interactive_selection_ui_role_required');
  if (operatorSurface.length === 0) throw new Error('interactive_selection_ui_operator_surface_required');
  const explicitSurfaces = operatorSurface.filter((value) => value !== 'registry default');
  if (explicitSurfaces.length > 1 && explicitSurfaces.some((value) => !NARS_OPERATOR_SURFACE_KINDS.includes(value as typeof NARS_OPERATOR_SURFACE_KINDS[number]))) {
    throw new Error('interactive_selection_ui_multiple_operator_surfaces_require_nars_projections');
  }
  const selectionMode = workspaceLaunchSelectionMode(payload.selectionMode, { site, role, operatorSurface });
  return { site, role, operatorSurface, runtime, intelligenceProvider, ...(selectionMode ? { selectionMode } : {}) };
}

export function resolveWorkspaceLaunchBrowserSelection(
  records: WorkspaceLaunchRecord[],
  options: WorkspaceLaunchPlanOptions,
  rememberedSelection: WorkspaceLaunchBrowserSelection | null,
  siteCatalog: ResolvedSiteRoot[] = [],
  context: WorkspaceLaunchSelectionContext,
): WorkspaceLaunchBrowserSelection {
  const effectiveRecords = canonicalizeWorkspaceLaunchRecords(records, siteCatalog);
  const siteChoices = unique(effectiveRecords.map((record) => record.site));
  const requestedSites = filterWorkspaceLaunchValues(options.site, siteChoices);
  const rememberedSites = rememberedSelection ? filterWorkspaceLaunchValues(rememberedSelection.site, siteChoices) : [];
  const selectedSites = requestedSites.length > 0 ? requestedSites : rememberedSites;

  const roleChoices = roleChoicesForSelectedSites(effectiveRecords, selectedSites);
  const requestedRoles = initialRoleValuesForInteractiveSelection(roleChoices, options.role);
  const rememberedRoles = rememberedSelection ? filterWorkspaceLaunchValues(rememberedSelection.role, roleChoices) : [];
  const selectedRoles = nonEmptyStringArray(options.role).length > 0
    ? requestedRoles
    : (rememberedRoles.length > 0 ? rememberedRoles : requestedRoles);

  const selectedRecords = selectLaunchRecords(effectiveRecords, { ...options, all: true, site: selectedSites, role: selectedRoles });
  const capabilityValues = workspaceLaunchCapabilityValues(selectedRecords, context);
  const requestedOperatorSurfaces = initialOperatorSurfaceValues(capabilityValues.operatorSurfaceValues, options.operatorSurface);
  const rememberedOperatorSurfaces = rememberedSelection
    ? initialOperatorSurfaceValues(capabilityValues.operatorSurfaceValues, rememberedSelection.operatorSurface.join(','))
    : [];
  const selectedOperatorSurfaces = options.operatorSurface
    ? requestedOperatorSurfaces
    : (rememberedOperatorSurfaces.length > 0 ? rememberedOperatorSurfaces : requestedOperatorSurfaces);

  const runtimeValues = workspaceLaunchCapabilityValues(selectedRecords, context, selectedOperatorSurfaces).runtimeValues;
  const requestedRuntime = nonEmpty(options.runtime);
  const rememberedRuntime = rememberedSelection && nonEmpty(rememberedSelection.runtime)
    && runtimeValues.includes(normalizeRuntimeAlias(rememberedSelection.runtime))
    ? normalizeRuntimeAlias(rememberedSelection.runtime)
    : null;
  const selectedRuntime = requestedRuntime
    ? (runtimeValues.includes(normalizeRuntimeAlias(requestedRuntime)) ? normalizeRuntimeAlias(requestedRuntime) : 'registry default')
    : (rememberedRuntime ?? (options.runtime ?? 'registry default'));

  const providerOperatorSurface = selectedOperatorSurfaces.includes('agent-cli') ? 'agent-cli' : (selectedOperatorSurfaces[0] ?? 'registry default');
  const intelligenceProviderOptions = intelligenceProviderChoicesForLaunchSelection({
    records: selectedRecords,
    operatorSurface: providerOperatorSurface,
    runtime: selectedRuntime,
    context,
  });
  const providerValues = new Set(intelligenceProviderOptions.map((option) => option.value));
  const requestedProvider = nonEmpty(options.intelligenceProvider);
  const rememberedProvider = rememberedSelection && nonEmpty(rememberedSelection.intelligenceProvider)
    && providerValues.has(rememberedSelection.intelligenceProvider)
    ? rememberedSelection.intelligenceProvider
    : null;
  const selectedProvider = requestedProvider
    ? (providerValues.has(requestedProvider) ? requestedProvider : 'registry default')
    : (rememberedProvider ?? (options.intelligenceProvider ?? 'registry default'));

  const selection = {
    site: selectedSites,
    role: selectedRoles,
    operatorSurface: selectedOperatorSurfaces,
    runtime: selectedRuntime,
    intelligenceProvider: selectedProvider,
  };
  const selectionMode = workspaceLaunchSelectionMode(
    options.site || options.role || options.operatorSurface ? undefined : rememberedSelection?.selectionMode,
    selection,
  );
  return { ...selection, ...(selectionMode ? { selectionMode } : {}) };
}

export function buildWorkspaceLaunchSelectionUiModel(
  records: WorkspaceLaunchRecord[],
  options: WorkspaceLaunchPlanOptions,
  rememberedSelection: WorkspaceLaunchBrowserSelection | null = null,
  siteCatalog: ResolvedSiteRoot[] = [],
  context: WorkspaceLaunchSelectionContext,
): Record<string, unknown> {
  const effectiveRecords = canonicalizeWorkspaceLaunchRecords(records, siteCatalog);
  const resolvedSelection = resolveWorkspaceLaunchBrowserSelection(effectiveRecords, options, rememberedSelection, siteCatalog, context);
  const siteChoices = unique(effectiveRecords.map((record) => record.site));
  return {
    records: effectiveRecords,
    siteChoices,
    siteCatalog: siteCatalog.map((site) => ({ site_id: site.site_id, site_root: site.site_root, source: site.source })),
    rememberedSelection,
    rememberedSelectionSemantics: {
      schema: 'narada.workspace_launch.remembered_selection_semantics.v1',
      role: 'form_defaults_only',
      binds_runtime_session: false,
      binds_carrier_session: false,
      binds_launch_session: false,
      launch_submission: 'always_creates_new_launch_session',
    },
    initialSites: resolvedSelection.site,
    initialRoles: resolvedSelection.role,
    initialOperatorSurfaces: resolvedSelection.operatorSurface,
    initialRuntime: resolvedSelection.runtime,
    initialIntelligenceProvider: resolvedSelection.intelligenceProvider,
    initialSelectionMode: resolvedSelection.selectionMode ?? { site: 'single', role: 'single', operatorSurface: 'single' },
    narsOperatorSurfaceChoices: [...NARS_OPERATOR_SURFACE_KINDS],
    selectorModel: workspaceLaunchSelectorModel(effectiveRecords, resolvedSelection, siteCatalog, context),
    explicitSelection: {
      site: nonEmptyStringArray(options.site).length > 0,
      role: nonEmptyStringArray(options.role).length > 0,
      operatorSurface: normalizeInteractiveOperatorSurfaceValues(options.operatorSurface ? options.operatorSurface.split(',') : []).length > 0,
      runtime: !!options.runtime,
      intelligenceProvider: !!options.intelligenceProvider,
    },
  };
}

export function registryDefaultOperatorSurfaceLabel(records: WorkspaceLaunchRecord[]): string {
  const defaults = unique(records.map((record) => record.operator_surface).filter(Boolean));
  return defaults.length > 0 ? `registry default (${defaults.join(', ')})` : 'registry default';
}

export function registryDefaultRuntimeLabel(records: WorkspaceLaunchRecord[]): string {
  const defaults = unique(records.map((record) => record.runtime).filter(Boolean));
  return defaults.length > 0 ? `registry default (${defaults.join(', ')})` : 'registry default';
}

export function registryDefaultIntelligenceProviderLabel(defaultProvider?: string): string {
  return defaultProvider ? `registry default (${defaultProvider})` : 'registry default';
}

export function registryDefaultIntelligenceProvider(context: WorkspaceLaunchSelectionContext): string {
  return context.providerRegistry.default_provider ?? 'registry default';
}

export function initialOperatorSurfaceValues(choices: string[], current?: string): string[] {
  if (!current) return ['registry default'];
  const explicit = normalizeCarrierList(current).filter((value) => choices.some((choice) => choice.toLowerCase() === value.toLowerCase()));
  return explicit.length > 0 ? explicit : ['registry default'];
}

export function normalizeInteractiveOperatorSurfaceValues(values: string[]): string[] {
  const normalized = unique(values);
  const explicit = normalized.filter((value) => value !== 'registry default');
  if (explicit.length > 0) return explicit;
  if (normalized.includes('registry default')) return ['registry default'];
  return normalized;
}

export function intelligenceProviderChoicesForLaunchSelection({
  records,
  operatorSurface,
  runtime,
  context,
}: {
  records: WorkspaceLaunchRecord[];
  operatorSurface: string;
  runtime: string;
  context: WorkspaceLaunchSelectionContext;
}): Array<{ value: string; label: string; hint?: string }> {
  const narsSurfaceRecords = records.filter((record) => {
    const selection = context.resolveCarrierRuntimeSelection(
      operatorSurface === 'registry default' ? record.operator_surface : operatorSurface,
      runtime === 'registry default' ? record.runtime : runtime,
    );
    return selection.carrier_kind === 'agent-cli' || selection.carrier_kind === 'agent-web-ui';
  });
  if (narsSurfaceRecords.length === 0) {
    return [{ value: 'registry default', label: 'registry default', hint: 'no NARS operator-surface launches selected' }];
  }
  return intelligenceProviderChoices(context);
}

export function intelligenceProviderChoices(context: WorkspaceLaunchSelectionContext): Array<{ value: string; label: string; hint?: string }> {
  const admitted = context.admittedProviders ? new Set(context.admittedProviders) : null;
  const entries = Object.entries(context.providerRegistry.providers ?? {})
    .filter(([, provider]) => provider.support_state === 'verified_supported')
    .filter(([provider]) => !admitted || admitted.has(provider))
    .map(([provider, metadata]) => ({ value: provider, label: provider, hint: metadata.meaning }))
    .sort((a, b) => a.label.localeCompare(b.label));
  return [
    {
      value: 'registry default',
      label: registryDefaultIntelligenceProviderLabel(context.providerRegistry.default_provider),
      hint: context.providerRegistry.default_provider
        ? `use default provider ${context.providerRegistry.default_provider}`
        : 'use launcher/provider defaults',
    },
    ...entries,
  ];
}

export function roleChoicesForSelectedSites(records: WorkspaceLaunchRecord[], siteSelectors: string[]): string[] {
  return unique(records.filter((record) => recordMatchesSiteSelectors(record, siteSelectors)).map((record) => record.role));
}

export function initialRoleValuesForInteractiveSelection(roleChoices: string[], explicitRoles?: string[]): string[] {
  const explicitRoleValues = (explicitRoles ?? []).filter((role) => roleChoices.some((choice) => choice.toLowerCase() === role.toLowerCase()));
  if (explicitRoleValues.length > 0) return explicitRoleValues;
  const residentChoice = roleChoices.find((role) => role.toLowerCase() === 'resident');
  return residentChoice ? [residentChoice] : [];
}

export function selectLaunchRecords(records: WorkspaceLaunchRecord[], options: WorkspaceLaunchPlanOptions): WorkspaceLaunchRecord[] {
  let selected: WorkspaceLaunchRecord[];
  const agentSelectors = nonEmptyStringArray(options.agent);
  const roleSelectors = nonEmptyStringArray(options.role);
  const siteSelectors = nonEmptyStringArray(options.site);
  const configPathSelectors = nonEmptyStringArray(options.configPath);
  const hasRoleSelector = roleSelectors.length > 0;
  const hasSiteSelector = siteSelectors.length > 0;
  const hasConfigPathSelector = configPathSelectors.length > 0;
  if (agentSelectors.length > 0) {
    selected = [];
    for (const agent of agentSelectors) {
      const matches = records.filter((record) => record.agent === agent);
      if (matches.length === 0) throw new Error(`agent_not_found_in_launch_registry: ${agent}`);
      if (matches.length > 1) throw new Error(`agent_duplicate_in_launch_registry: ${agent}`);
      selected.push(matches[0]);
    }
  } else if (options.all || hasConfigPathSelector || hasRoleSelector || hasSiteSelector) {
    selected = records;
  } else {
    throw new Error('launch_selection_required: specify --agent, --all, --site, --role, or --config-path');
  }
  if (hasRoleSelector) {
    const roles = new Set(roleSelectors.map((role) => role.toLowerCase()));
    selected = selected.filter((record) => roles.has(record.role.toLowerCase()));
    if (selected.length === 0) throw new Error(`no_agents_match_role_filter: ${roleSelectors.join(', ')}`);
  }
  if (hasSiteSelector) {
    selected = selected.filter((record) => recordMatchesSiteSelectors(record, siteSelectors));
    if (selected.length === 0) throw new Error(`no_agents_match_site_filter: ${siteSelectors.join(', ')}`);
  }
  return selected;
}

function recordMatchesSiteSelectors(record: WorkspaceLaunchRecord, siteSelectors: string[]): boolean {
  const sites = new Set(siteSelectors.map((site) => site.toLowerCase()));
  const aliases = [record.site, record.legacy_site, record.site.replace(/^narada-/, ''), record.agent.split('.')[0]]
    .filter((value): value is string => typeof value === 'string' && value.length > 0)
    .map((value) => value.toLowerCase());
  return aliases.some((alias) => sites.has(alias));
}

function filterWorkspaceLaunchValues(values: string[] | undefined, allowed: string[]): string[] {
  const allowedSet = new Set(allowed.map((value) => value.toLowerCase()));
  return unique(stringArray(values).filter((value) => allowedSet.has(value.toLowerCase())));
}

function normalizeCarrierList(value: string | undefined): string[] {
  return unique((value ?? '').split(',').map((part) => part.trim()).filter(Boolean));
}

function normalizeSiteToken(value: string): string {
  return value.toLowerCase().replace(/^narada[-.]/, '').replace(/^narada/, '').replace(/^[-.]/, '');
}

function nonEmpty(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function nonEmptyStringArray(values: string[] | undefined): string[] {
  return (values ?? []).map((value) => nonEmpty(value)).filter((value): value is string => Boolean(value));
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : [];
}

function unique(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const normalized = value.trim();
    if (!normalized) continue;
    const key = normalized.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(normalized);
  }
  return result;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
