import type { ScopeConfig } from "@narada2/control-plane";
import { readConfig, findScope } from "../lib/config-io.js";
import { renderScopeInspect } from "../render/inspect.js";

export interface InspectOptions {
  configPath?: string;
}

export interface InspectResult {
  target: string;
  scope?: ScopeConfig;
  summary: string;
}

export function inspect(target: string, options: InspectOptions): InspectResult {
  const config = readConfig(options.configPath);
  if (!config) {
    return { target, summary: "Config not found." };
  }
  const scope = findScope(config, target);
  if (!scope) {
    return { target, summary: `Target ${target} not found in config.` };
  }
  return {
    target,
    scope,
    summary: renderScopeInspect(scope),
  };
}
