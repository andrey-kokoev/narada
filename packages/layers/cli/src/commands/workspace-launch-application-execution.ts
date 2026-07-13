import type { CommandContext } from '../lib/command-wrapper.js';
import {
  workspaceLaunchCommand as workspaceLaunchCommandImpl,
  workspaceLaunchPlanCommand as workspaceLaunchPlanCommandImpl,
} from './workspace-launch-command.js';
import { workspaceLaunchApplicationContext } from './workspace-launch-application-context.js';
import type {
  WorkspaceLaunchCommandOutput,
  WorkspaceLaunchCommandResult,
  WorkspaceLaunchPlanOptions,
} from './workspace-launch-types.js';

export async function workspaceLaunchCommand(
  options: WorkspaceLaunchPlanOptions,
  context: CommandContext,
): Promise<WorkspaceLaunchCommandResult<WorkspaceLaunchCommandOutput>> {
  const applicationContext = workspaceLaunchApplicationContext();
  return workspaceLaunchCommandImpl(options, context, applicationContext.selectionServices, applicationContext.registryContext);
}

export async function workspaceLaunchPlanCommand(
  options: WorkspaceLaunchPlanOptions,
  context: CommandContext,
): Promise<WorkspaceLaunchCommandResult<WorkspaceLaunchCommandOutput>> {
  const applicationContext = workspaceLaunchApplicationContext();
  return workspaceLaunchPlanCommandImpl(options, context, applicationContext.selectionServices, applicationContext.registryContext);
}
