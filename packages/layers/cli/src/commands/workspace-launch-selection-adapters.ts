import * as prompts from '@clack/prompts';
import type { ResolvedSiteRoot } from '../lib/site-root-resolver.js';
import * as support from './workspace-launch-support.js';
import type { WorkspaceLaunchSelectionServices } from './workspace-launch-context.js';
import type { WorkspaceLaunchPlanOptions, WorkspaceLaunchRecord } from './workspace-launch-types.js';
import { normalizeOperatorSurfaceList } from './workspace-launch-plan-builder.js';
import {
  runWorkspaceLaunchSelectionUi as runWorkspaceLaunchSelectionUiController,
} from './workspace-launch-ui-controller.js';
import type { WorkspaceLaunchSelection as WorkspaceLaunchBrowserSelection } from '@narada2/workspace-launch-contract';

export async function resolveInteractiveSelectionOptions(
  records: WorkspaceLaunchRecord[],
  options: WorkspaceLaunchPlanOptions,
  siteCatalog: ResolvedSiteRoot[] = [],
  selectionServices: WorkspaceLaunchSelectionServices,
): Promise<WorkspaceLaunchPlanOptions> {
  if (options.interactiveSelectionUi) return resolveInteractiveSelectionUiOptions(records, options, siteCatalog, selectionServices);
  if (!options.interactiveSelection) return options;
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new Error('interactive_selection_requires_tty: --interactive-selection requires an interactive terminal');
  }

  const siteChoices = support.unique(records.map((record) => record.site));
  const selectedSites = await prompts.multiselect({
    message: 'Select Site(s)',
    options: siteChoices.map((site) => ({ value: site, label: site })),
    initialValues: options.site,
    required: true,
  });
  if (prompts.isCancel(selectedSites)) throw new Error('interactive_selection_cancelled');

  const selectedSiteValues = selectedSites as string[];
  const roleChoices = selectionServices.roleChoicesForSelectedSites(records, selectedSiteValues);
  const initialRoleValues = selectionServices.initialRoleValuesForInteractiveSelection(roleChoices, options.role);
  const selectedRoles = await prompts.multiselect({
    message: 'Select Role(s)',
    options: roleChoices.map((role) => ({ value: role, label: role })),
    initialValues: initialRoleValues.length > 0 ? initialRoleValues : undefined,
    required: true,
  });
  if (prompts.isCancel(selectedRoles)) throw new Error('interactive_selection_cancelled');

  const selectedRoleValues = selectedRoles as string[];
  const selectorModel = selectionServices.workspaceLaunchSelectorModel(records, {
    site: selectedSiteValues,
    role: selectedRoleValues,
    operatorSurface: options.operatorSurface ? normalizeOperatorSurfaceList(options.operatorSurface) : undefined,
    runtime: options.runtime ?? 'registry default',
    intelligenceProvider: options.intelligenceProvider ?? 'registry default',
  }, siteCatalog);
  const selectedOperatorSurfaces = await prompts.multiselect({
    message: 'Select Operator Surface(s)',
    options: selectorModel.operatorSurfaceOptions,
    initialValues: selectorModel.selected.operatorSurface,
    required: true,
  });
  if (prompts.isCancel(selectedOperatorSurfaces)) throw new Error('interactive_selection_cancelled');

  const selectedRuntime = await prompts.select({
    message: 'Select Runtime',
    options: selectorModel.runtimeOptions,
    initialValue: selectorModel.selected.runtime,
  });
  if (prompts.isCancel(selectedRuntime)) throw new Error('interactive_selection_cancelled');

  const selectedOperatorSurfaceValues = selectionServices.normalizeInteractiveOperatorSurfaceValues(selectedOperatorSurfaces as string[]);
  const providerSelectorModel = selectionServices.workspaceLaunchSelectorModel(records, {
    site: selectedSiteValues,
    role: selectedRoleValues,
    operatorSurface: selectedOperatorSurfaceValues,
    runtime: selectedRuntime as string,
    intelligenceProvider: options.intelligenceProvider ?? 'registry default',
  }, siteCatalog);
  let selectedProvider: string | undefined;
  if (providerSelectorModel.intelligenceProviderOptions.length > 1) {
    const selectedProviderValue = await prompts.select({
      message: 'Select Intelligence Provider',
      options: providerSelectorModel.intelligenceProviderOptions,
      initialValue: providerSelectorModel.selected.intelligenceProvider,
    });
    if (prompts.isCancel(selectedProviderValue)) throw new Error('interactive_selection_cancelled');
    selectedProvider = selectedProviderValue as string;
  }

  return {
    ...options,
    all: false,
    site: selectedSiteValues,
    role: selectedRoleValues,
    operatorSurface: selectedOperatorSurfaceValues.includes('registry default') ? undefined : selectedOperatorSurfaceValues.join(','),
    runtime: selectedRuntime === 'registry default' ? undefined : selectedRuntime,
    intelligenceProvider: selectedProvider === 'registry default' ? undefined : selectedProvider,
  };
}

async function resolveInteractiveSelectionUiOptions(
  records: WorkspaceLaunchRecord[],
  options: WorkspaceLaunchPlanOptions,
  siteCatalog: ResolvedSiteRoot[] = [],
  selectionServices: WorkspaceLaunchSelectionServices,
): Promise<WorkspaceLaunchPlanOptions> {
  const selection = await runWorkspaceLaunchSelectionUiController(records, options, siteCatalog, selectionServices);
  return workspaceLaunchOptionsFromBrowserSelection(options, selection);
}

export function workspaceLaunchOptionsFromBrowserSelection(
  options: WorkspaceLaunchPlanOptions,
  selection: WorkspaceLaunchBrowserSelection,
): WorkspaceLaunchPlanOptions {
  return {
    ...options,
    all: false,
    site: selection.site,
    role: selection.role,
    operatorSurface: selection.operatorSurface.includes('registry default') ? undefined : selection.operatorSurface.join(','),
    runtime: selection.runtime === 'registry default' ? undefined : selection.runtime,
    intelligenceProvider: selection.intelligenceProvider === 'registry default' ? undefined : selection.intelligenceProvider,
  };
}
