import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { runGovernedCommandSync } from '@narada2/process-launch-posture';
import { buildAgentIdentityRefV2, resolveAgentIdentityRef } from '@narada2/agent-identity';
import { defaultRuntimeForOperatorSurface } from '@narada2/operator-surface-runtime-contract/operator-surface-runtime-selection';
import type { WorkspaceLaunchAdmissionPolicy } from './workspace-launch-admission.js';
import {
  canonicalizeWorkspaceLaunchRecords as canonicalizeWorkspaceLaunchRecordsDomain,
  selectLaunchRecords as selectLaunchRecordsDomain,
} from './workspace-launch-selection.js';
import { defaultLaunchRegistryPath, listKnownSiteRootsForCli, type ResolvedSiteRoot } from '../lib/site-root-resolver.js';
import type {
  WorkspaceLaunchPlanOptions,
  WorkspaceLaunchRecord,
  WorkspaceLaunchRecordsLoad,
} from './workspace-launch-types.js';

export interface WorkspaceLaunchRegistryContext {
  admission: WorkspaceLaunchAdmissionPolicy;
}

interface RawLaunchRegistry {
  NaradaRoot?: string;
  Site?: string;
  SiteRoot?: string;
  WorkspaceRoot?: string;
  Launcher?: string;
  LauncherPath?: string;
  OperatorSurface?: string;
  Carrier?: string;
  Runtime?: string;
  Authority?: string;
  McpScope?: string;
  Agents?: RawAgentRecord[] | RawAgentRecord;
}

interface RawAgentRecord {
  Agent?: string;
  Title?: string;
  Role?: string;
  Site?: string;
  NaradaRoot?: string;
  SiteRoot?: string;
  WorkspaceRoot?: string;
  Launcher?: string;
  LauncherPath?: string;
  OperatorSurface?: string;
  Carrier?: string;
  Runtime?: string;
  Authority?: string;
  McpScope?: string;
  EnableNativeShell?: boolean;
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

function nonEmpty(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function nonEmptyStringArray(values: string[] | undefined): string[] {
  return (values ?? []).map((value) => nonEmpty(value)).filter((value): value is string => Boolean(value));
}

export async function readWorkspaceLaunchRecords(options: WorkspaceLaunchPlanOptions): Promise<WorkspaceLaunchRecordsLoad> {
  const registryPaths = resolveRegistryPaths(options);
  const records = (await Promise.all(registryPaths.map(readLaunchRegistry))).flat();
  let siteCatalog: ResolvedSiteRoot[] = [];
  try {
    siteCatalog = await listKnownSiteRootsForCli({ launchRegistryPath: registryPaths[0] });
  } catch {
    // Keep launch planning usable for explicit non-interactive compatibility
    // paths; interactive selection reports the missing catalog below.
  }
  return {
    records: canonicalizeWorkspaceLaunchRecords(records, siteCatalog),
    siteCatalog,
  };
}

function canonicalizeWorkspaceLaunchRecords(
  records: WorkspaceLaunchRecord[],
  siteCatalog: ResolvedSiteRoot[],
): WorkspaceLaunchRecord[] {
  return canonicalizeWorkspaceLaunchRecordsDomain(records, siteCatalog);
}

export function requireSiteCatalogForInteractiveSelection(
  options: WorkspaceLaunchPlanOptions,
  siteCatalog: ResolvedSiteRoot[],
  records: WorkspaceLaunchRecord[],
): void {
  if ((options.interactiveSelection === true || options.interactiveSelectionUi === true) && siteCatalog.length === 0) {
    throw new Error('site_registry_empty_for_interactive_selection: run `narada sites discover` before opening launcher selection');
  }
  if (options.interactiveSelection !== true && options.interactiveSelectionUi !== true) return;
  const catalogRoots = new Set(siteCatalog.map((site) => resolve(site.site_root).toLowerCase()));
  const unregisteredRoots = unique(records
    .filter((record) => !catalogRoots.has(resolve(record.site_root).toLowerCase()))
    .map((record) => record.site_root));
  if (unregisteredRoots.length > 0) {
    throw new Error(`site_registry_missing_launch_roots: run 'narada sites discover' before opening launcher selection (${unregisteredRoots.join(', ')})`);
  }
}


export function resolveRegistryPaths(options: WorkspaceLaunchPlanOptions): string[] {
  const configPaths = nonEmptyStringArray(options.configPath);
  const paths = configPaths.length > 0
    ? configPaths
    : [options.registryPath ?? defaultLaunchRegistryPath()];
  return paths.map((path) => resolve(path));
}

export function hasWorkspaceLaunchSelectionIntent(options: WorkspaceLaunchPlanOptions): boolean {
  return options.all === true
    || nonEmptyStringArray(options.agent).length > 0
    || nonEmptyStringArray(options.role).length > 0
    || nonEmptyStringArray(options.site).length > 0
    || nonEmptyStringArray(options.configPath).length > 0;
}

export function normalizeWorkspaceLaunchPlanOptions(options: WorkspaceLaunchPlanOptions): WorkspaceLaunchPlanOptions {
  const normalized: WorkspaceLaunchPlanOptions = {
    ...options,
    agent: nonEmptyStringArray(options.agent),
    role: nonEmptyStringArray(options.role),
    site: nonEmptyStringArray(options.site),
    configPath: nonEmptyStringArray(options.configPath),
  };
  if (normalized.defaultInteractiveSelection === true && !hasWorkspaceLaunchSelectionIntent(normalized)) {
    return { ...normalized, interactiveSelection: true };
  }
  return normalized;
}

export async function readLaunchRegistry(path: string): Promise<WorkspaceLaunchRecord[]> {
  if (!existsSync(path)) throw new Error(`launch_registry_missing: ${path}`);
  const raw = path.toLowerCase().endsWith('.json')
    ? JSON.parse(await readFile(path, 'utf8')) as RawLaunchRegistry
    : readPowerShellDataFile(path);
  const agents = Array.isArray(raw.Agents) ? raw.Agents : raw.Agents ? [raw.Agents] : [];
  return agents.map((agent) => normalizeAgentRecord(raw, agent, path));
}

function readPowerShellDataFile(path: string): RawLaunchRegistry {
  const script = [
    '$ErrorActionPreference = "Stop"',
    '$path = $env:NARADA_LAUNCH_REGISTRY_PATH',
    '$data = Import-PowerShellDataFile -Path $path',
    '$data | ConvertTo-Json -Depth 20 -Compress',
  ].join('; ');
  const result = runGovernedCommandSync('pwsh', ['-NoProfile', '-NonInteractive', '-Command', script], {
    encoding: 'utf8',
    timeout: 30_000,
    windowsHide: true,
    env: {
      ...process.env,
      NARADA_LAUNCH_REGISTRY_PATH: path,
    },
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    const detail = String(result.stderr || result.stdout || `exit ${result.status}`).trim();
    throw new Error(`launch_registry_read_failed: ${path}: ${detail}`);
  }
  return JSON.parse(String(result.stdout || '{}')) as RawLaunchRegistry;
}

function normalizeAgentRecord(registry: RawLaunchRegistry, agent: RawAgentRecord, configPath: string): WorkspaceLaunchRecord {
  const agentId = nonEmpty(agent.Agent);
  if (!agentId) throw new Error(`agent_id_missing_in_launch_registry: ${configPath}`);
  const explicitSite = nonEmpty(agent.Site) ?? nonEmpty(registry.Site) ?? null;
  if (!agentId.includes('.') && !explicitSite) {
    throw new Error(`site_local_agent_requires_explicit_site: ${agentId} in ${configPath}`);
  }
  const naradaRoot = nonEmpty(agent.NaradaRoot) ?? nonEmpty(registry.NaradaRoot);
  if (!naradaRoot) throw new Error(`agent_narada_root_missing: ${agentId} in ${configPath}`);
  const siteRoot = nonEmpty(agent.SiteRoot) ?? nonEmpty(registry.SiteRoot) ?? naradaRoot;
  const workspaceRoot = nonEmpty(agent.WorkspaceRoot) ?? nonEmpty(registry.WorkspaceRoot) ?? null;
  const launcher = nonEmpty(agent.Launcher) ?? nonEmpty(registry.Launcher);
  const launcherPath = nonEmpty(agent.LauncherPath) ?? nonEmpty(registry.LauncherPath)
    ?? (launcher ? join(naradaRoot, launcher) : '');
  if (!launcherPath) throw new Error(`launcher_path_missing: ${agentId} in ${configPath}`);
  // Carrier is accepted only as a legacy registry input alias; normalized records use operator_surface.
  const operatorSurface = nonEmpty(agent.OperatorSurface)
    ?? nonEmpty(registry.OperatorSurface)
    ?? nonEmpty(agent.Carrier)
    ?? nonEmpty(registry.Carrier)
    ?? 'codex';
  const runtime = nonEmpty(agent.Runtime) ?? nonEmpty(registry.Runtime) ?? defaultRuntimeForOperatorSurface(operatorSurface);
  const authority = nonEmpty(agent.Authority) ?? nonEmpty(registry.Authority) ?? null;
  const role = nonEmpty(agent.Role) ?? (agentId.split('.').at(-1) ?? agentId).replace(/\d+$/, '');
  const resolvedAgentIdentityRef = resolveAgentIdentityRef(agentId, { site_id: explicitSite, role });
  const agentIdentityRef = resolvedAgentIdentityRef.status === 'resolved' ? resolvedAgentIdentityRef.value : buildAgentIdentityRefV2({
    identity_scope: explicitSite ? { kind: 'narada_site', site_id: explicitSite } : { kind: 'unscoped' },
    local_agent_id: agentId.split('.').at(-1) ?? agentId,
    role,
    legacy_agent_id: agentId,
  });
  const agentIdentitySite = agentIdentityRef.identity_scope.kind === 'narada_site'
    ? agentIdentityRef.identity_scope.site_id
    : null;
  return {
    agent: agentId,
    agent_identity_ref: agentIdentityRef,
    title: nonEmpty(agent.Title) ?? agentId.split('.').at(-1) ?? agentId,
    role,
    site: agentIdentitySite ?? agentId.split('.')[0] ?? agentId,
    narada_root: naradaRoot,
    site_root: siteRoot,
    workspace_root: workspaceRoot,
    launcher_path: launcherPath,
    operator_surface: operatorSurface,
    runtime,
    authority,
    enable_native_shell: agent.EnableNativeShell === true,
    mcp_scope: nonEmpty(agent.McpScope) ?? nonEmpty(registry.McpScope) ?? null,
    config_path: configPath,
  };
}

export function selectLaunchRecords(records: WorkspaceLaunchRecord[], options: WorkspaceLaunchPlanOptions): WorkspaceLaunchRecord[] {
  return selectLaunchRecordsDomain(records, options);
}

