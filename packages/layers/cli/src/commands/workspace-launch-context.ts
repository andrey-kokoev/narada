import type { ResolvedSiteRoot } from '../lib/site-root-resolver.js';
import type { WorkspaceLaunchSelection as WorkspaceLaunchBrowserSelection, WorkspaceLaunchSelectorModel } from '@narada2/workspace-launch-contract';
import type { WorkspaceLaunchRegistryContext } from './workspace-launch-registry.js';
import type { WorkspaceLaunchPlanOptions, WorkspaceLaunchRecord } from './workspace-launch-types.js';

export interface WorkspaceLaunchSelectionServices {
  registryContext: WorkspaceLaunchRegistryContext;
  workspaceLaunchSelectorModel(
    records: WorkspaceLaunchRecord[],
    selection?: Partial<WorkspaceLaunchBrowserSelection>,
    siteCatalog?: ResolvedSiteRoot[],
  ): WorkspaceLaunchSelectorModel;
  normalizeWorkspaceLaunchBrowserSelection(payload: Partial<WorkspaceLaunchBrowserSelection>): WorkspaceLaunchBrowserSelection;
  buildWorkspaceLaunchSelectionUiModel(
    records: WorkspaceLaunchRecord[],
    options: WorkspaceLaunchPlanOptions,
    rememberedSelection?: WorkspaceLaunchBrowserSelection | null,
    siteCatalog?: ResolvedSiteRoot[],
  ): Record<string, unknown>;
  normalizeInteractiveOperatorSurfaceValues(values: string[]): string[];
  roleChoicesForSelectedSites(records: WorkspaceLaunchRecord[], siteSelectors: string[]): string[];
  initialRoleValuesForInteractiveSelection(roleChoices: string[], explicitRoles?: string[]): string[];
}
