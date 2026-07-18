import {
  createWorkspaceLaunchSelectionContext,
  type WorkspaceLaunchSelectionContext,
} from './workspace-launch-provider-context.js';
import type { WorkspaceLaunchRegistryContext } from './workspace-launch-registry.js';

export type {
  WorkspaceLaunchProviderRegistry,
  WorkspaceLaunchRuntimeSelection,
  WorkspaceLaunchSelectionContext,
} from './workspace-launch-provider-context.js';

export interface WorkspaceLaunchContext {
  selectionContext: WorkspaceLaunchSelectionContext;
  registryContext: WorkspaceLaunchRegistryContext;
}

export function createWorkspaceLaunchRegistryContext(
  selectionContext: WorkspaceLaunchSelectionContext = createWorkspaceLaunchSelectionContext(),
): WorkspaceLaunchRegistryContext {
  return {
    admission: selectionContext.admission,
  };
}

export function createWorkspaceLaunchContext(): WorkspaceLaunchContext {
  const selectionContext = createWorkspaceLaunchSelectionContext();
  const registryContext = createWorkspaceLaunchRegistryContext(selectionContext);
  return {
    selectionContext,
    registryContext,
  };
}
