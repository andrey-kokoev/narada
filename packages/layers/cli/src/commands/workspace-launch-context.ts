import type { ResolvedSiteRoot } from '../lib/site-root-resolver.js';
import type {
  WorkspaceLaunchSelection as WorkspaceLaunchBrowserSelection,
  WorkspaceLaunchSelectorModel,
} from '@narada2/workspace-launch-contract';
import {
  buildWorkspaceLaunchSelectionUiModel,
  initialRoleValuesForInteractiveSelection,
  normalizeInteractiveOperatorSurfaceValues,
  normalizeWorkspaceLaunchBrowserSelection,
  roleChoicesForSelectedSites,
  workspaceLaunchSelectorModel,
} from './workspace-launch-selection.js';
import {
  createWorkspaceLaunchSelectionContext,
  type WorkspaceLaunchSelectionContext,
} from './workspace-launch-provider-context.js';
import type { WorkspaceLaunchRegistryContext } from './workspace-launch-registry.js';
import type {
  WorkspaceLaunchPlanOptions,
  WorkspaceLaunchRecord,
  WorkspaceLaunchSelectionUiModel,
} from './workspace-launch-types.js';

export type {
  WorkspaceLaunchProviderRegistry,
  WorkspaceLaunchRuntimeSelection,
  WorkspaceLaunchSelectionContext,
} from './workspace-launch-provider-context.js';

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
  ): WorkspaceLaunchSelectionUiModel;
  normalizeInteractiveOperatorSurfaceValues(values: string[]): string[];
  roleChoicesForSelectedSites(records: WorkspaceLaunchRecord[], siteSelectors: string[]): string[];
  initialRoleValuesForInteractiveSelection(roleChoices: string[], explicitRoles?: string[]): string[];
}

export interface WorkspaceLaunchContext {
  selectionContext: WorkspaceLaunchSelectionContext;
  registryContext: WorkspaceLaunchRegistryContext;
  selectionServices: WorkspaceLaunchSelectionServices;
}

export function createWorkspaceLaunchRegistryContext(
  selectionContext: WorkspaceLaunchSelectionContext = createWorkspaceLaunchSelectionContext(),
): WorkspaceLaunchRegistryContext {
  return {
    providerRegistry: selectionContext.providerRegistry,
    resolveOperatorSurfaceRuntimeSelection: selectionContext.resolveOperatorSurfaceRuntimeSelection,
  };
}

export function createWorkspaceLaunchSelectionServices(
  selectionContext: WorkspaceLaunchSelectionContext,
  registryContext: WorkspaceLaunchRegistryContext = createWorkspaceLaunchRegistryContext(selectionContext),
): WorkspaceLaunchSelectionServices {
  return {
    registryContext,
    workspaceLaunchSelectorModel: (records, selection = {}, siteCatalog = []) => workspaceLaunchSelectorModel(records, selection, siteCatalog, selectionContext),
    normalizeWorkspaceLaunchBrowserSelection: (payload) => normalizeWorkspaceLaunchBrowserSelection(payload),
    buildWorkspaceLaunchSelectionUiModel: (records, options, rememberedSelection = null, siteCatalog = []) => buildWorkspaceLaunchSelectionUiModel(records, options, rememberedSelection, siteCatalog, selectionContext),
    normalizeInteractiveOperatorSurfaceValues: (values) => normalizeInteractiveOperatorSurfaceValues(values),
    roleChoicesForSelectedSites: (records, siteSelectors) => roleChoicesForSelectedSites(records, siteSelectors),
    initialRoleValuesForInteractiveSelection: (roleChoices, explicitRoles) => initialRoleValuesForInteractiveSelection(roleChoices, explicitRoles),
  };
}

export function createWorkspaceLaunchContext(): WorkspaceLaunchContext {
  const selectionContext = createWorkspaceLaunchSelectionContext();
  const registryContext = createWorkspaceLaunchRegistryContext(selectionContext);
  return {
    selectionContext,
    registryContext,
    selectionServices: createWorkspaceLaunchSelectionServices(selectionContext, registryContext),
  };
}
