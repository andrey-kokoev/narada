import type { CommandContext } from '../lib/command-wrapper.js';
import { explainMcpCommand } from './launcher-mcp-authority.js';
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
import {
  createWorkspaceLaunchContext,
  type WorkspaceLaunchContext,
} from './workspace-launch-context.js';
import {
  workspaceLaunchCommand as workspaceLaunchCommandImpl,
  workspaceLaunchPlanCommand as workspaceLaunchPlanCommandImpl,
} from './workspace-launch-command.js';
import {
  readWorkspaceLaunchRememberedSelection,
  writeWorkspaceLaunchRememberedSelection,
} from './workspace-launch-attempt-store.js';
import type { ResolvedSiteRoot } from '../lib/site-root-resolver.js';
import type { WorkspaceLaunchSelection as WorkspaceLaunchBrowserSelection } from '@narada2/workspace-launch-contract';
import type { WorkspaceLaunchPlanOptions, WorkspaceLaunchRecord } from './workspace-launch-types.js';

export type { WorkspaceLaunchBrowserSelection };
export { explainMcpCommand };
export { readWorkspaceLaunchRememberedSelection, writeWorkspaceLaunchRememberedSelection };
export {
  registryDefaultIntelligenceProviderLabelDomain as registryDefaultIntelligenceProviderLabel,
  registryDefaultOperatorSurfaceLabelDomain as registryDefaultOperatorSurfaceLabel,
  registryDefaultRuntimeLabelDomain as registryDefaultRuntimeLabel,
};

let applicationContext: WorkspaceLaunchContext | undefined;

function getApplicationContext(): WorkspaceLaunchContext {
  return applicationContext ??= createWorkspaceLaunchContext();
}

export async function workspaceLaunchCommand(
  options: WorkspaceLaunchPlanOptions,
  context: CommandContext,
): Promise<{ exitCode: number; result: unknown }> {
  return workspaceLaunchCommandImpl(
    options,
    context,
    getApplicationContext().selectionServices,
    getApplicationContext().registryContext,
  );
}

export async function workspaceLaunchPlanCommand(
  options: WorkspaceLaunchPlanOptions,
  context: CommandContext,
): Promise<{ exitCode: number; result: unknown }> {
  return workspaceLaunchPlanCommandImpl(
    options,
    context,
    getApplicationContext().selectionServices,
    getApplicationContext().registryContext,
  );
}

export function workspaceLaunchSelectorModel(
  records: WorkspaceLaunchRecord[],
  selection: Partial<WorkspaceLaunchBrowserSelection> = {},
  siteCatalog: ResolvedSiteRoot[] = [],
) {
  return workspaceLaunchSelectorModelDomain(records, selection, siteCatalog, getApplicationContext().selectionContext);
}

export function normalizeWorkspaceLaunchBrowserSelection(
  payload: Partial<WorkspaceLaunchBrowserSelection>,
): WorkspaceLaunchBrowserSelection {
  return normalizeWorkspaceLaunchBrowserSelectionDomain(payload);
}

export function resolveWorkspaceLaunchBrowserSelection(
  records: WorkspaceLaunchRecord[],
  options: WorkspaceLaunchPlanOptions,
  rememberedSelection: WorkspaceLaunchBrowserSelection | null,
  siteCatalog: ResolvedSiteRoot[] = [],
): WorkspaceLaunchBrowserSelection {
  return resolveWorkspaceLaunchBrowserSelectionDomain(
    records,
    options,
    rememberedSelection,
    siteCatalog,
    getApplicationContext().selectionContext,
  );
}

export function buildWorkspaceLaunchSelectionUiModel(
  records: WorkspaceLaunchRecord[],
  options: WorkspaceLaunchPlanOptions,
  rememberedSelection: WorkspaceLaunchBrowserSelection | null = null,
  siteCatalog: ResolvedSiteRoot[] = [],
): Record<string, unknown> {
  return buildWorkspaceLaunchSelectionUiModelDomain(
    records,
    options,
    rememberedSelection,
    siteCatalog,
    getApplicationContext().selectionContext,
  );
}

export function registryDefaultIntelligenceProvider(): string {
  return registryDefaultIntelligenceProviderDomain(getApplicationContext().selectionContext);
}

export function initialOperatorSurfaceValues(choices: string[], current?: string): string[] {
  return initialOperatorSurfaceValuesDomain(choices, current);
}

export function normalizeInteractiveOperatorSurfaceValues(values: string[]): string[] {
  return normalizeInteractiveOperatorSurfaceValuesDomain(values);
}

export function intelligenceProviderChoices({ admittedProviders }: { admittedProviders?: string[] } = {}) {
  return intelligenceProviderChoicesDomain({
    ...getApplicationContext().selectionContext,
    admittedProviders,
  });
}

export function intelligenceProviderChoicesForLaunchSelection(args: {
  records: WorkspaceLaunchRecord[];
  operatorSurface: string;
  runtime: string;
}) {
  return intelligenceProviderChoicesForLaunchSelectionDomain({
    ...args,
    context: getApplicationContext().selectionContext,
  });
}

export function roleChoicesForSelectedSites(records: WorkspaceLaunchRecord[], siteSelectors: string[]): string[] {
  return roleChoicesForSelectedSitesDomain(records, siteSelectors);
}

export function initialRoleValuesForInteractiveSelection(roleChoices: string[], explicitRoles?: string[]): string[] {
  return initialRoleValuesForInteractiveSelectionDomain(roleChoices, explicitRoles);
}
