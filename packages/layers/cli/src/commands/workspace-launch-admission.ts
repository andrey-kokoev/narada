import {
  ADMITTED_RUNTIME_SUBSTRATE_KINDS,
  NARADA_AGENT_RUNTIME_SERVER_KIND,
  normalizeRuntimeAlias,
  operatorSurfaceKindsForRuntimeHost,
  resolveOperatorSurfaceRuntimeSelection as resolveCanonicalOperatorSurfaceRuntimeSelection,
} from '@narada2/operator-surface-runtime-contract/operator-surface-runtime-selection';
import { commandResultError } from '../lib/command-wrapper.js';
import type { WorkspaceLaunchRecord } from './workspace-launch-types.js';

export interface WorkspaceLaunchRuntimeSelection {
  operator_surface_kind: string;
  runtime_substrate_kind: string;
  runtime_host_kind: string;
}

export interface WorkspaceLaunchAdmissionPolicy {
  narsOperatorSurfaceKinds: readonly string[];
  runtimeServerKind: string;
  normalizeRuntimeAlias(runtime: string): string;
  resolveOperatorSurfaceRuntimeSelection(
    operatorSurface: string | undefined,
    runtime: string,
  ): WorkspaceLaunchRuntimeSelection;
  roleChoicesForSelectedSites(records: readonly WorkspaceLaunchRecord[], siteSelectors: readonly string[]): string[];
}

export const ADMITTED_NARS_OPERATOR_SURFACE_KINDS = Object.freeze(
  operatorSurfaceKindsForRuntimeHost(NARADA_AGENT_RUNTIME_SERVER_KIND),
);

export function createWorkspaceLaunchAdmissionPolicy(): WorkspaceLaunchAdmissionPolicy {
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

  return {
    narsOperatorSurfaceKinds,
    runtimeServerKind: NARADA_AGENT_RUNTIME_SERVER_KIND,
    normalizeRuntimeAlias,
    resolveOperatorSurfaceRuntimeSelection,
    roleChoicesForSelectedSites: (records, siteSelectors) => roleChoicesForSelectedSites(records, siteSelectors),
  };
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
