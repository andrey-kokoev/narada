import fs from "node:fs";
import path from "node:path";
import { ensureConfig, findScope, getOpsRepoRoot, resolveConfigPath } from "../lib/config-io.js";
import { scaffoldGlobal, scaffoldMailbox, scaffoldWorkflow } from "../lib/scaffold.js";

export interface SetupOptions {
  configPath?: string;
}

export interface SetupResult {
  target?: string;
  createdPaths: string[];
  summary: string;
}

function ensureDir(dir: string): boolean {
  if (fs.existsSync(dir)) return false;
  fs.mkdirSync(dir, { recursive: true });
  return true;
}

export function setup(options: SetupOptions & { target?: string }): SetupResult {
  const config = ensureConfig(options.configPath);
  const opsRoot = getOpsRepoRoot(options.configPath);
  const createdPaths: string[] = [];
  createdPaths.push(...scaffoldGlobal(opsRoot));

  const scopes = options.target
    ? (() => {
        const scope = findScope(config, options.target as string);
        if (!scope) throw new Error(`Target not found in config: ${options.target}`);
        return [scope];
      })()
    : config.scopes;

  const configDir = path.dirname(resolveConfigPath(options.configPath));
  for (const scope of scopes) {
    if (scope.context_strategy === "mail") createdPaths.push(...scaffoldMailbox(opsRoot, scope.scope_id));
    if (scope.context_strategy === "timer") createdPaths.push(...scaffoldWorkflow(opsRoot, scope.scope_id));
    const resolvedRootDir = path.isAbsolute(scope.root_dir) ? scope.root_dir : path.resolve(configDir, scope.root_dir);
    if (ensureDir(resolvedRootDir)) createdPaths.push(resolvedRootDir);
  }

  return {
    target: options.target,
    createdPaths,
    summary: options.target
      ? `Setup complete for ${options.target}: ${createdPaths.length} path(s) ensured.`
      : `Setup complete for ${config.scopes.length} scope(s): ${createdPaths.length} path(s) ensured.`,
  };
}
