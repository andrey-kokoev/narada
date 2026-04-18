import type { CoordinatorConfig } from "@narada2/charters";
import { readConfig, findScope } from "../lib/config-io.js";
import { preflight as collectPreflight } from "../readiness/collect.js";
import { renderPreflight } from "../render/preflight.js";
import type { ReadinessReport } from "../readiness/types.js";

export interface PreflightOptions {
  configPath?: string;
  coordinatorConfig?: CoordinatorConfig;
  mailboxIdForTools?: string;
}

export function preflight(target: string, options: PreflightOptions): ReadinessReport {
  const config = readConfig(options.configPath);
  if (!config) {
    return collectPreflight({ target, configPath: options.configPath });
  }
  const scope = findScope(config, target);
  return collectPreflight({ target, configPath: options.configPath, scope, coordinatorConfig: options.coordinatorConfig, mailboxIdForTools: options.mailboxIdForTools });
}

export function renderTargetPreflight(target: string, options: PreflightOptions): string {
  return renderPreflight(preflight(target, options));
}
