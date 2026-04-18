import fs from "node:fs";
import path from "node:path";
import { readConfig, findScope, resolveConfigPath } from "../lib/config-io.js";
import type { ActivationState } from "../readiness/types.js";

export interface ActivateOptions {
  configPath?: string;
}

export function activate(target: string, options: ActivateOptions): ActivationState {
  const config = readConfig(options.configPath);
  if (!config) return { target, activated: false, reason: "Config not found." };
  const scope = findScope(config, target);
  if (!scope) return { target, activated: false, reason: `Target ${target} not found in config.` };

  const configDir = path.dirname(resolveConfigPath(options.configPath));
  const resolvedRootDir = path.isAbsolute(scope.root_dir) ? scope.root_dir : path.resolve(configDir, scope.root_dir);
  const activatedAt = new Date().toISOString();
  try {
    fs.mkdirSync(resolvedRootDir, { recursive: true });
    fs.writeFileSync(path.join(resolvedRootDir, ".activated"), JSON.stringify({ target, activatedAt }, null, 2) + "\n", "utf-8");
    return { target, activated: true, activatedAt };
  } catch (error) {
    return { target, activated: false, reason: error instanceof Error ? error.message : String(error) };
  }
}
