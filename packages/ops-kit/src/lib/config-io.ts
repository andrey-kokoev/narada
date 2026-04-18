/**
 * Config I/O utilities for ops-kit.
 */

import fs from "node:fs";
import path from "node:path";
import type { ExchangeFsSyncConfig, ScopeConfig } from "@narada2/exchange-fs-sync";

const DEFAULT_CONFIG_PATH = "./config/config.json";

export function resolveConfigPath(configPath?: string): string {
  return path.resolve(configPath ?? DEFAULT_CONFIG_PATH);
}

export function getOpsRepoRoot(configPath?: string): string {
  return path.dirname(path.dirname(resolveConfigPath(configPath)));
}

export function readConfig(configPath?: string): ExchangeFsSyncConfig | null {
  const p = resolveConfigPath(configPath);
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, "utf-8")) as ExchangeFsSyncConfig;
}

export function writeConfig(config: ExchangeFsSyncConfig, configPath?: string): void {
  const p = resolveConfigPath(configPath);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  const tmp = `${p}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(config, null, 2) + "\n", "utf-8");
  fs.renameSync(tmp, p);
}

export function ensureConfig(configPath?: string): ExchangeFsSyncConfig {
  const existing = readConfig(configPath);
  if (existing) return existing;
  const fresh: ExchangeFsSyncConfig = { root_dir: "./data", scopes: [] };
  writeConfig(fresh, configPath);
  return fresh;
}

export function findScope(config: ExchangeFsSyncConfig, scopeId: string): ScopeConfig | undefined {
  return config.scopes.find((scope) => scope.scope_id === scopeId);
}

export function upsertScope(config: ExchangeFsSyncConfig, scope: ScopeConfig): void {
  const idx = config.scopes.findIndex((s) => s.scope_id === scope.scope_id);
  if (idx >= 0) config.scopes[idx] = scope;
  else config.scopes.push(scope);
}
