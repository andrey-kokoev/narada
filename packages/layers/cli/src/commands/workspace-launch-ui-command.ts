import { formattedResult } from '../lib/cli-output.js';
import { ExitCode } from '../lib/exit-codes.js';
import type { WorkspaceLaunchSelection as WorkspaceLaunchBrowserSelection } from '@narada2/workspace-launch-contract';
import type { WorkspaceLaunchRegistryContext } from './workspace-launch-registry.js';
import type {
  WorkspaceLaunchCommandResult,
  WorkspaceLaunchCommandOutput,
  WorkspaceLaunchPlanOptions,
  WorkspaceLaunchUiSessionResult,
} from './workspace-launch-types.js';
import type { WorkspaceLaunchSelectionServices } from './workspace-launch-context.js';
import {
  normalizeWorkspaceLaunchPlanOptions,
  readWorkspaceLaunchRecords,
  requireSiteCatalogForInteractiveSelection,
  resolveRegistryPaths,
} from './workspace-launch-registry.js';
import { workspaceLaunchOptionsFromBrowserSelection } from './workspace-launch-selection-adapters.js';
import { runPersistentWorkspaceLaunchSelectionUi as runPersistentWorkspaceLaunchSelectionUiController } from './workspace-launch-ui-controller.js';

export type WorkspaceLaunchCommandRunner = (
  options: WorkspaceLaunchPlanOptions,
) => Promise<WorkspaceLaunchCommandResult<WorkspaceLaunchCommandOutput>>;

export async function runPersistentWorkspaceLaunchSelectionUiCommand(
  options: WorkspaceLaunchPlanOptions,
  selectionServices: WorkspaceLaunchSelectionServices,
  registryContext: WorkspaceLaunchRegistryContext,
  runLaunchCommand: WorkspaceLaunchCommandRunner,
): Promise<WorkspaceLaunchCommandResult<WorkspaceLaunchUiSessionResult>> {
  const normalizedOptions = normalizeWorkspaceLaunchPlanOptions(options);
  const registryPaths = resolveRegistryPaths(normalizedOptions);
  const loaded = await readWorkspaceLaunchRecords(normalizedOptions);
  requireSiteCatalogForInteractiveSelection(normalizedOptions, loaded.siteCatalog, loaded.records);
  const session = await runPersistentWorkspaceLaunchSelectionUiController(loaded.records, normalizedOptions, async (selection: WorkspaceLaunchBrowserSelection) => {
    const selectionOptions = workspaceLaunchOptionsFromBrowserSelection(normalizedOptions, selection);
    return runLaunchCommand({
      ...selectionOptions,
      interactiveSelection: false,
      interactiveSelectionUi: false,
    });
  }, loaded.siteCatalog, selectionServices);

  const result: WorkspaceLaunchUiSessionResult = {
    schema: 'narada.workspace_launch.interactive_selection_ui_session.v1',
    status: session.status,
    mutation_performed: session.launch_count > 0,
    url: session.url,
    direct_url: session.direct_url,
    router_url: session.router_url,
    stable_url: session.stable_url,
    ingress_mode: session.ingress_mode,
    ingress_reason: session.reason,
    launch_count: session.launch_count,
    registry_paths: registryPaths,
    ownership: {
      planner: 'narada-cli',
      executor: 'narada-cli.workspace-launch',
      interactive_selection_surface: 'browser',
    },
  };

  return {
    exitCode: session.status === 'cancelled' ? ExitCode.SUCCESS : ExitCode.GENERAL_ERROR,
    result: formattedResult(result, `workspace launch selection UI ${session.status}`, normalizedOptions.format ?? 'auto'),
  };
}
