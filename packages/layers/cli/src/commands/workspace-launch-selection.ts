import { resolve } from 'node:path';
import { buildAgentIdentityRefV2 } from '@narada2/agent-identity';
import type { ResolvedSiteRoot } from '../lib/site-root-resolver.js';
import type {
  WorkspaceLaunchSelectionCardinality,
  WorkspaceLaunchSelection as WorkspaceLaunchBrowserSelection,
  WorkspaceLaunchSelectionMode,
  WorkspaceLaunchOption as WorkspaceLaunchSelectorOptionContract,
  WorkspaceLaunchSelectorModel as WorkspaceLaunchSelectorModelContract,
} from '@narada2/workspace-launch-contract';
import type {
  WorkspaceLaunchPlanOptions,
  WorkspaceLaunchRecord,
  WorkspaceLaunchSelectionUiModel,
} from './workspace-launch-types.js';
import type {
  WorkspaceLaunchProviderRegistry,
  WorkspaceLaunchSelectionContext,
} from './workspace-launch-provider-context.js';
import {
  ADMITTED_NARS_OPERATOR_SURFACE_KINDS,
  recordMatchesSiteSelectors,
  roleChoicesForSelectedSites as roleChoicesForSelectedSitesDomain,
} from './workspace-launch-admission.js';
import {
  filterWorkspaceLaunchValues,
  initialOperatorSurfaceValues,
  initialRoleValuesForInteractiveSelection,
  isRecord,
  normalizeInteractiveOperatorSurfaceValues,
  nonEmpty,
  nonEmptyStringArray,
  rememberedArraySelection,
  rememberedScalarSelection,
  stringArray,
  unique,
} from './workspace-launch-selection-state.js';
export {
  initialOperatorSurfaceValues,
  initialRoleValuesForInteractiveSelection,
  normalizeInteractiveOperatorSurfaceValues,
};
export type { WorkspaceLaunchProviderRegistry, WorkspaceLaunchSelectionContext } from './workspace-launch-provider-context.js';

export type WorkspaceLaunchSelectorOption = WorkspaceLaunchSelectorOptionContract;
export type WorkspaceLaunchSelectorModel = WorkspaceLaunchSelectorModelContract;

const NARS_OPERATOR_SURFACE_KINDS = ADMITTED_NARS_OPERATOR_SURFACE_KINDS;

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
    const runtime = context.admission.normalizeRuntimeAlias(record.runtime);
    const pairs: Array<{ operatorSurface: string; runtime: string }> = [{ operatorSurface: record.operator_surface, runtime }];
    if (runtime === context.admission.runtimeServerKind) {
      for (const operatorSurface of context.admission.narsOperatorSurfaceKinds) pairs.push({ operatorSurface, runtime });
    }
    return pairs;
  });
  const admitted = new Map<string, { operatorSurface: string; runtime: string }>();
  for (const pair of candidates) {
    try {
      context.admission.resolveOperatorSurfaceRuntimeSelection(pair.operatorSurface, pair.runtime);
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
  const explicitRuntime = runtime && runtime !== 'registry default' ? context.admission.normalizeRuntimeAlias(runtime) : null;
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
  const roleValues = context.admission.roleChoicesForSelectedSites(effectiveRecords, selectedSites);
  const requestedRoles = nonEmptyStringArray(selection.role).filter((role) => roleValues.includes(role));
  const selectedRoles = requestedRoles.length > 0 ? requestedRoles : initialRoleValuesForInteractiveSelection(roleValues);
  const selectedRecords = selectLaunchRecords(effectiveRecords, { all: true, site: selectedSites, role: selectedRoles });
  const capabilityValues = workspaceLaunchCapabilityValues(selectedRecords, context);
  const selectedOperatorSurfaces = initialOperatorSurfaceValues(capabilityValues.operatorSurfaceValues, nonEmptyStringArray(selection.operatorSurface).join(','));
  const requestedRuntime = nonEmpty(selection.runtime);
  const runtimeValues = workspaceLaunchCapabilityValues(selectedRecords, context, selectedOperatorSurfaces).runtimeValues;
  const selectedRuntime = requestedRuntime && runtimeValues.includes(context.admission.normalizeRuntimeAlias(requestedRuntime))
    ? context.admission.normalizeRuntimeAlias(requestedRuntime)
    : 'registry default';
  const operatorSurfaceValues = workspaceLaunchCapabilityValues(selectedRecords, context, selectedOperatorSurfaces, selectedRuntime).operatorSurfaceValues;
  const normalizedOperatorSurfaces = initialOperatorSurfaceValues(operatorSurfaceValues, selectedOperatorSurfaces.join(','));
  const providerOperatorSurface = NARS_OPERATOR_SURFACE_KINDS.find((surface) => normalizedOperatorSurfaces.includes(surface))
    ?? (normalizedOperatorSurfaces[0] ?? 'registry default');
  const intelligenceProviderOptions = context.admission.intelligenceProviderChoicesForLaunchSelection({
    records: selectedRecords,
    operatorSurface: providerOperatorSurface,
    runtime: selectedRuntime,
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
  const selectedSites = rememberedArraySelection(
    requestedSites,
    rememberedSites,
    siteChoices,
    nonEmptyStringArray(options.site).length > 0,
    [],
  );

  const roleChoices = context.admission.roleChoicesForSelectedSites(effectiveRecords, selectedSites);
  const requestedRoles = initialRoleValuesForInteractiveSelection(roleChoices, options.role);
  const rememberedRoles = rememberedSelection ? filterWorkspaceLaunchValues(rememberedSelection.role, roleChoices) : [];
  const selectedRoles = rememberedArraySelection(
    requestedRoles,
    rememberedRoles,
    roleChoices,
    nonEmptyStringArray(options.role).length > 0,
    requestedRoles,
  );

  const selectedRecords = selectLaunchRecords(effectiveRecords, { ...options, all: true, site: selectedSites, role: selectedRoles });
  const capabilityValues = workspaceLaunchCapabilityValues(selectedRecords, context);
  const requestedOperatorSurfaces = initialOperatorSurfaceValues(capabilityValues.operatorSurfaceValues, options.operatorSurface);
  const rememberedOperatorSurfaces = rememberedSelection
    ? initialOperatorSurfaceValues(capabilityValues.operatorSurfaceValues, rememberedSelection.operatorSurface.join(','))
    : [];
  const selectedOperatorSurfaces = rememberedArraySelection(
    requestedOperatorSurfaces,
    rememberedOperatorSurfaces,
    capabilityValues.operatorSurfaceValues,
    Boolean(options.operatorSurface),
    requestedOperatorSurfaces,
  );

  const runtimeValues = workspaceLaunchCapabilityValues(selectedRecords, context, selectedOperatorSurfaces).runtimeValues;
  const requestedRuntime = nonEmpty(options.runtime);
  const rememberedRuntime = rememberedSelection && nonEmpty(rememberedSelection.runtime)
    && runtimeValues.includes(context.admission.normalizeRuntimeAlias(rememberedSelection.runtime))
    ? context.admission.normalizeRuntimeAlias(rememberedSelection.runtime)
    : null;
  const selectedRuntime = rememberedScalarSelection(
    requestedRuntime ? context.admission.normalizeRuntimeAlias(requestedRuntime) : null,
    rememberedRuntime,
    runtimeValues,
    Boolean(options.runtime),
    'registry default',
  );

  const providerOperatorSurface = NARS_OPERATOR_SURFACE_KINDS.find((surface) => selectedOperatorSurfaces.includes(surface))
    ?? (selectedOperatorSurfaces[0] ?? 'registry default');
  const intelligenceProviderOptions = context.admission.intelligenceProviderChoicesForLaunchSelection({
    records: selectedRecords,
    operatorSurface: providerOperatorSurface,
    runtime: selectedRuntime,
  });
  const providerValues = new Set(intelligenceProviderOptions.map((option) => option.value));
  const requestedProvider = nonEmpty(options.intelligenceProvider);
  const rememberedProvider = rememberedSelection && nonEmpty(rememberedSelection.intelligenceProvider)
    && providerValues.has(rememberedSelection.intelligenceProvider)
    ? rememberedSelection.intelligenceProvider
    : null;
  const selectedProvider = rememberedScalarSelection(
    requestedProvider,
    rememberedProvider,
    [...providerValues],
    Boolean(options.intelligenceProvider),
    'registry default',
  );

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
): WorkspaceLaunchSelectionUiModel {
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
  return context.admission.providerRegistry.default_provider ?? 'registry default';
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
  return context.admission.intelligenceProviderChoicesForLaunchSelection({ records, operatorSurface, runtime });
}

export function intelligenceProviderChoices(context: WorkspaceLaunchSelectionContext): Array<{ value: string; label: string; hint?: string }> {
  return context.admission.intelligenceProviderChoices();
}

export function roleChoicesForSelectedSites(records: WorkspaceLaunchRecord[], siteSelectors: string[]): string[] {
  return roleChoicesForSelectedSitesDomain(records, siteSelectors);
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



