import {
  createWorkspaceLaunchAdmissionPolicy,
  type WorkspaceLaunchAdmissionPolicy,
  type WorkspaceLaunchRuntimeSelection,
} from './workspace-launch-admission.js';
import type { WorkspaceLaunchRegistryContext } from './workspace-launch-registry.js';

export type { WorkspaceLaunchRuntimeSelection };

export interface WorkspaceLaunchSelectionContext {
  admission: WorkspaceLaunchAdmissionPolicy;
}

export function createWorkspaceLaunchSelectionContext(): WorkspaceLaunchSelectionContext {
  return { admission: createWorkspaceLaunchAdmissionPolicy() };
}

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
