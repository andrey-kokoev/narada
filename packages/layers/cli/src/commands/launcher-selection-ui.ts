import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import type { WorkspaceLaunchSelectionUiModel } from './workspace-launch-types.js';

const requireFromLauncherSelectionUi = createRequire(import.meta.url);
const WORKSPACE_LAUNCH_BOOTSTRAP_PLACEHOLDER = '__NARADA_WORKSPACE_LAUNCH_BOOTSTRAP__';

export interface WorkspaceLaunchSelectionHtmlOptions {
  persistent?: boolean;
  basePath?: string;
}

export function renderWorkspaceLaunchSelectionHtml(
  template: string,
  model: WorkspaceLaunchSelectionUiModel,
  options: WorkspaceLaunchSelectionHtmlOptions = {},
): string {
  const bootstrap = JSON.stringify({
    model,
    persistent: options.persistent === true,
    ...(options.basePath ? { basePath: options.basePath } : {}),
  }).replace(/</g, '\\u003c');

  if (!template.includes(WORKSPACE_LAUNCH_BOOTSTRAP_PLACEHOLDER)) {
    throw new Error('workspace_launch_ui_bootstrap_placeholder_missing');
  }
  return template.replace(WORKSPACE_LAUNCH_BOOTSTRAP_PLACEHOLDER, bootstrap);
}

export function buildWorkspaceLaunchSelectionHtml(
  model: WorkspaceLaunchSelectionUiModel,
  options: WorkspaceLaunchSelectionHtmlOptions = {},
): string {
  const templatePath = requireFromLauncherSelectionUi.resolve('@narada2/workspace-launch-ui/dist/index.html');
  return renderWorkspaceLaunchSelectionHtml(readFileSync(templatePath, 'utf8'), model, options);
}
