import {
  buildWorkspaceLaunchSelectionUiModel as buildWorkspaceLaunchSelectionUiModelDomain,
  initialOperatorSurfaceValues as initialOperatorSurfaceValuesDomain,
  initialRoleValuesForInteractiveSelection as initialRoleValuesForInteractiveSelectionDomain,
  intelligenceProviderChoices as intelligenceProviderChoicesDomain,
  intelligenceProviderChoicesForLaunchSelection as intelligenceProviderChoicesForLaunchSelectionDomain,
  normalizeInteractiveOperatorSurfaceValues as normalizeInteractiveOperatorSurfaceValuesDomain,
  normalizeWorkspaceLaunchBrowserSelection as normalizeWorkspaceLaunchBrowserSelectionDomain,
  registryDefaultIntelligenceProvider as registryDefaultIntelligenceProviderDomain,
  registryDefaultIntelligenceProviderLabel as registryDefaultIntelligenceProviderLabelDomain,
  registryDefaultOperatorSurfaceLabel as registryDefaultOperatorSurfaceLabelDomain,
  registryDefaultRuntimeLabel as registryDefaultRuntimeLabelDomain,
  roleChoicesForSelectedSites as roleChoicesForSelectedSitesDomain,
  resolveWorkspaceLaunchBrowserSelection as resolveWorkspaceLaunchBrowserSelectionDomain,
  workspaceLaunchSelectorModel as workspaceLaunchSelectorModelDomain,
} from './workspace-launch-selection.js';
import { workspaceLaunchApplicationContext } from './workspace-launch-application-context.js';
import { createWorkspaceLaunchAdmissionPolicy } from './workspace-launch-admission.js';
import type { ResolvedSiteRoot } from '../lib/site-root-resolver.js';
import type { WorkspaceLaunchSelection as WorkspaceLaunchBrowserSelection } from '@narada2/workspace-launch-contract';
import type {
  WorkspaceLaunchPlanOptions,
  WorkspaceLaunchRecord,
  WorkspaceLaunchSelectionUiModel,
} from './workspace-launch-types.js';

export type { WorkspaceLaunchBrowserSelection };
export {
  registryDefaultIntelligenceProviderLabelDomain as registryDefaultIntelligenceProviderLabel,
  registryDefaultOperatorSurfaceLabelDomain as registryDefaultOperatorSurfaceLabel,
  registryDefaultRuntimeLabelDomain as registryDefaultRuntimeLabel,
};

export function workspaceLaunchSelectorModel(
  records: WorkspaceLaunchRecord[],
  selection: Partial<WorkspaceLaunchBrowserSelection> = {},
  siteCatalog: ResolvedSiteRoot[] = [],
) {
  return workspaceLaunchSelectorModelDomain(records, selection, siteCatalog, workspaceLaunchApplicationContext().selectionContext);
}

export function normalizeWorkspaceLaunchBrowserSelection(payload: Partial<WorkspaceLaunchBrowserSelection>): WorkspaceLaunchBrowserSelection {
  return normalizeWorkspaceLaunchBrowserSelectionDomain(payload);
}

export function resolveWorkspaceLaunchBrowserSelection(
  records: WorkspaceLaunchRecord[], options: WorkspaceLaunchPlanOptions,
  rememberedSelection: WorkspaceLaunchBrowserSelection | null, siteCatalog: ResolvedSiteRoot[] = [],
): WorkspaceLaunchBrowserSelection {
  return resolveWorkspaceLaunchBrowserSelectionDomain(records, options, rememberedSelection, siteCatalog, workspaceLaunchApplicationContext().selectionContext);
}

export function buildWorkspaceLaunchSelectionUiModel(
  records: WorkspaceLaunchRecord[], options: WorkspaceLaunchPlanOptions,
  rememberedSelection: WorkspaceLaunchBrowserSelection | null = null, siteCatalog: ResolvedSiteRoot[] = [],
): WorkspaceLaunchSelectionUiModel {
  return buildWorkspaceLaunchSelectionUiModelDomain(records, options, rememberedSelection, siteCatalog, workspaceLaunchApplicationContext().selectionContext);
}

export function registryDefaultIntelligenceProvider(): string {
  return registryDefaultIntelligenceProviderDomain(workspaceLaunchApplicationContext().selectionContext);
}

export function initialOperatorSurfaceValues(choices: string[], current?: string): string[] {
  return initialOperatorSurfaceValuesDomain(choices, current);
}

export function normalizeInteractiveOperatorSurfaceValues(values: string[]): string[] {
  return normalizeInteractiveOperatorSurfaceValuesDomain(values);
}

export function intelligenceProviderChoices({ admittedProviders }: { admittedProviders?: string[] } = {}) {
  const admission = workspaceLaunchApplicationContext().selectionContext.admission;
  return intelligenceProviderChoicesDomain({
    ...workspaceLaunchApplicationContext().selectionContext,
    admission: admittedProviders
      ? createWorkspaceLaunchAdmissionPolicy({ providerRegistry: admission.providerRegistry, admittedProviders })
      : admission,
  });
}

export function intelligenceProviderChoicesForLaunchSelection(args: {
  records: WorkspaceLaunchRecord[];
  operatorSurface: string;
  runtime: string;
}) {
  return intelligenceProviderChoicesForLaunchSelectionDomain({ ...args, context: workspaceLaunchApplicationContext().selectionContext });
}

export function roleChoicesForSelectedSites(records: WorkspaceLaunchRecord[], siteSelectors: string[]): string[] {
  return roleChoicesForSelectedSitesDomain(records, siteSelectors);
}

export function initialRoleValuesForInteractiveSelection(roleChoices: string[], explicitRoles?: string[]): string[] {
  return initialRoleValuesForInteractiveSelectionDomain(roleChoices, explicitRoles);
}
