import type { WorkspaceLaunchSelectionResolutionSource } from './workspace-launch-types.js';

export const REGISTRY_DEFAULT_SELECTION = 'registry default';

export interface WorkspaceLaunchResolvedSelection {
  requested: string | null;
  value: string;
  source: Exclude<WorkspaceLaunchSelectionResolutionSource, 'not_applicable'>;
}

export function resolveWorkspaceLaunchSelection(
  requestedValue: string | undefined,
  registryValue: string | null | undefined,
  field: 'operator_surface' | 'runtime' | 'intelligence_provider',
  implicitSource: 'registry_record' | 'registry_default' | 'command_default' = 'registry_record',
): WorkspaceLaunchResolvedSelection {
  if (requestedValue !== undefined) {
    const requested = nonEmpty(requestedValue);
    if (!requested) throw new Error(`workspace_launch_${field}_selection_empty`);
    if (requested === REGISTRY_DEFAULT_SELECTION) {
      const resolved = nonEmpty(registryValue);
      if (!resolved || resolved === REGISTRY_DEFAULT_SELECTION) {
        throw new Error(`workspace_launch_${field}_registry_default_missing`);
      }
      return { requested, value: resolved, source: 'registry_default' };
    }
    return { requested, value: requested, source: 'explicit_selection' };
  }

  const resolved = nonEmpty(registryValue);
  if (!resolved || resolved === REGISTRY_DEFAULT_SELECTION) {
    throw new Error(`workspace_launch_${field}_${implicitSource}_missing`);
  }
  return { requested: null, value: resolved, source: implicitSource };
}

function nonEmpty(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}
