import {
  createWorkspaceLaunchContext,
  type WorkspaceLaunchContext,
} from './workspace-launch-context.js';

let applicationContext: WorkspaceLaunchContext | undefined;

export function workspaceLaunchApplicationContext(): WorkspaceLaunchContext {
  return applicationContext ??= createWorkspaceLaunchContext();
}
