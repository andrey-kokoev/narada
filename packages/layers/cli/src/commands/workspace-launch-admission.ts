import {
  ADMITTED_RUNTIME_SUBSTRATE_KINDS,
  NARADA_AGENT_RUNTIME_SERVER_KIND,
  normalizeRuntimeAlias,
  operatorSurfaceKindsForRuntimeHost,
  resolveOperatorSurfaceRuntimeSelection as resolveCanonicalOperatorSurfaceRuntimeSelection,
} from '@narada2/operator-surface-runtime-contract/operator-surface-runtime-selection';
import { commandResultError } from '../lib/command-wrapper.js';
import type { WorkspaceLaunchRecord } from './workspace-launch-types.js';

export interface WorkspaceLaunchProviderRegistry {
  default_provider?: string;
  providers?: Record<string, {
    meaning?: string;
    support_state?: string;
  }>;
}

export interface WorkspaceLaunchRuntimeSelection {
  operator_surface_kind: string;
  runtime_substrate_kind: string;
  runtime_host_kind: string;
}

export interface WorkspaceLaunchProviderChoice {
  value: string;
  label: string;
  hint?: string;
}

export interface WorkspaceLaunchAdmissionPolicy {
  providerRegistry: WorkspaceLaunchProviderRegistry;
  admittedProviders?: readonly string[];
  narsOperatorSurfaceKinds: readonly string[];
  runtimeServerKind: string;
  normalizeRuntimeAlias(runtime: string): string;
  resolveOperatorSurfaceRuntimeSelection(
    operatorSurface: string | undefined,
    runtime: string,
  ): WorkspaceLaunchRuntimeSelection;
  roleChoicesForSelectedSites(records: readonly WorkspaceLaunchRecord[], siteSelectors: readonly string[]): string[];
  intelligenceProviderChoices(): WorkspaceLaunchProviderChoice[];
  intelligenceProviderChoicesForLaunchSelection(args: {
    records: readonly WorkspaceLaunchRecord[];
    operatorSurface: string;
    runtime: string;
  }): WorkspaceLaunchProviderChoice[];
}

export const ADMITTED_NARS_OPERATOR_SURFACE_KINDS = Object.freeze(
  operatorSurfaceKindsForRuntimeHost(NARADA_AGENT_RUNTIME_SERVER_KIND),
);

export function createWorkspaceLaunchAdmissionPolicy(args: {
  providerRegistry: WorkspaceLaunchProviderRegistry;
  admittedProviders?: readonly string[];
}): WorkspaceLaunchAdmissionPolicy {
  const admittedProviders = args.admittedProviders;
  const narsOperatorSurfaceKinds = ADMITTED_NARS_OPERATOR_SURFACE_KINDS;
  const resolveOperatorSurfaceRuntimeSelection = (
    operatorSurface: string | undefined,
    runtime: string,
  ): WorkspaceLaunchRuntimeSelection => {
    const selection = resolveCanonicalOperatorSurfaceRuntimeSelection({
      operatorSurfaceValue: operatorSurface,
      runtimeValue: runtime,
      admittedRuntimeSubstrateKinds: [...ADMITTED_RUNTIME_SUBSTRATE_KINDS],
      runtimeContractSchema: 'narada.runtime_substrate_kind.v1',
    });
    if (selection.status === 'refused') {
      throw commandResultError({
        schema: 'narada.workspace_launch.action_refusal.v1',
        status: 'refused',
        command: 'launcher workspace-plan',
        reason_code: selection.reason_code,
        message: selection.reason,
        required_next_step: selection.required_next_step,
        artifact_path: null,
        retryable: false,
      }, selection.reason_code);
    }
    return {
      operator_surface_kind: selection.operator_surface_kind,
      runtime_substrate_kind: selection.runtime_substrate_kind,
      runtime_host_kind: selection.runtime_host_kind,
    };
  };

  const intelligenceProviderChoices = (): WorkspaceLaunchProviderChoice[] => {
    const admitted = admittedProviders ? new Set(admittedProviders) : null;
    const entries = Object.entries(args.providerRegistry.providers ?? {})
      .filter(([, provider]) => provider.support_state === 'verified_supported')
      .filter(([provider]) => !admitted || admitted.has(provider))
      .map(([provider, metadata]) => ({ value: provider, label: provider, hint: metadata.meaning }))
      .sort((a, b) => a.label.localeCompare(b.label));
    return [
      {
        value: 'registry default',
        label: registryDefaultIntelligenceProviderLabel(args.providerRegistry.default_provider),
        hint: args.providerRegistry.default_provider
          ? `use default provider ${args.providerRegistry.default_provider}`
          : 'use launcher/provider defaults',
      },
      ...entries,
    ];
  };

  return {
    providerRegistry: args.providerRegistry,
    admittedProviders,
    narsOperatorSurfaceKinds,
    runtimeServerKind: NARADA_AGENT_RUNTIME_SERVER_KIND,
    normalizeRuntimeAlias,
    resolveOperatorSurfaceRuntimeSelection,
    roleChoicesForSelectedSites: (records, siteSelectors) => roleChoicesForSelectedSites(records, siteSelectors),
    intelligenceProviderChoices,
    intelligenceProviderChoicesForLaunchSelection: ({ records, operatorSurface, runtime }) => {
      const narsSurfaceRecords = records.filter((record) => {
        const selection = resolveOperatorSurfaceRuntimeSelection(
          operatorSurface === 'registry default' ? record.operator_surface : operatorSurface,
          runtime === 'registry default' ? record.runtime : runtime,
        );
        return narsOperatorSurfaceKinds.includes(selection.operator_surface_kind);
      });
      if (narsSurfaceRecords.length === 0) {
        return [{ value: 'registry default', label: 'registry default', hint: 'no NARS operator-surface launches selected' }];
      }
      return intelligenceProviderChoices();
    },
  };
}

export function registryDefaultIntelligenceProviderLabel(defaultProvider?: string): string {
  return defaultProvider ? `registry default (${defaultProvider})` : 'registry default';
}

export function roleChoicesForSelectedSites(
  records: readonly WorkspaceLaunchRecord[],
  siteSelectors: readonly string[],
): string[] {
  return unique(records.filter((record) => recordMatchesSiteSelectors(record, siteSelectors)).map((record) => record.role));
}

export function recordMatchesSiteSelectors(record: WorkspaceLaunchRecord, siteSelectors: readonly string[]): boolean {
  const sites = new Set(siteSelectors.map((site) => site.toLowerCase()));
  const aliases = [record.site, record.legacy_site, record.site.replace(/^narada-/, ''), record.agent.split('.')[0]]
    .filter((value): value is string => typeof value === 'string' && value.length > 0)
    .map((value) => value.toLowerCase());
  return aliases.some((alias) => sites.has(alias));
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}
