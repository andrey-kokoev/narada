import { existsSync } from 'node:fs';
import { dirname, join, parse } from 'node:path';
import { asJsonRecord, type JsonRecord } from './launcher-contracts.js';
import { readJsonFile } from './launcher-runtime-results.js';

export interface WorkspaceDependencyPreflightResult {
  schema: 'narada.workspace_dependency_preflight.v1';
  status: 'ready' | 'not_ready';
  workspace_root: string;
  root_packages: string[];
  checked_packages: string[];
  missing: Array<{
    package_name: string;
    importer: string;
    detail: string;
  }>;
  repair_command: ['pnpm', 'install', '--frozen-lockfile'];
}

const REPAIR_COMMAND: ['pnpm', 'install', '--frozen-lockfile'] = ['pnpm', 'install', '--frozen-lockfile'];

export function checkWorkspaceDependencyPreflight(workspaceRoot: string): WorkspaceDependencyPreflightResult {
  const rootPackages = [
    join(workspaceRoot, 'packages', 'layers', 'cli'),
    join(workspaceRoot, 'packages', 'agent-start'),
  ];
  const queue = [...rootPackages];
  const visitedRoots = new Set<string>();
  const checkedPackages: string[] = [];
  const missing: WorkspaceDependencyPreflightResult['missing'] = [];

  while (queue.length > 0) {
    const importerRoot = queue.shift()!;
    const normalizedImporterRoot = importerRoot.toLowerCase();
    if (visitedRoots.has(normalizedImporterRoot)) continue;
    visitedRoots.add(normalizedImporterRoot);

    const packageJsonPath = join(importerRoot, 'package.json');
    const metadata = asJsonRecord(readJsonFile(packageJsonPath));
    const packageName = stringField(metadata, 'name') ?? importerRoot;
    checkedPackages.push(packageName);
    if (!metadata) {
      missing.push({
        package_name: packageName,
        importer: importerRoot,
        detail: `package.json not found: ${packageJsonPath}`,
      });
      continue;
    }

    for (const dependency of workspaceDependencies(metadata)) {
      const resolved = resolveDependency(importerRoot, workspaceRoot, dependency);
      if (!resolved) {
        missing.push({
          package_name: dependency,
          importer: packageName,
          detail: 'workspace package is not resolvable from the installed workspace graph',
        });
        continue;
      }
      const dependencyRoot = packageRootFromResolvedPath(resolved, workspaceRoot);
      if (dependencyRoot) queue.push(dependencyRoot);
    }
  }

  return {
    schema: 'narada.workspace_dependency_preflight.v1',
    status: missing.length === 0 ? 'ready' : 'not_ready',
    workspace_root: workspaceRoot,
    root_packages: rootPackages,
    checked_packages: checkedPackages,
    missing,
    repair_command: REPAIR_COMMAND,
  };
}

export function formatWorkspaceDependencyPreflightFailure(
  result: WorkspaceDependencyPreflightResult,
): string {
  const details = result.missing
    .map((entry) => `${entry.package_name} (imported by ${entry.importer}): ${entry.detail}`)
    .join('; ');
  return `narada_workspace_dependencies_not_ready: ${details}. Run from ${result.workspace_root}: ${result.repair_command.join(' ')}`;
}

function workspaceDependencies(metadata: JsonRecord): string[] {
  const dependencies = asJsonRecord(metadata.dependencies);
  if (!dependencies) return [];
  return Object.entries(dependencies)
    .filter(([, spec]) => typeof spec === 'string' && spec.startsWith('workspace:'))
    .map(([name]) => name);
}

function resolveDependency(importerRoot: string, workspaceRoot: string, packageName: string): string | null {
  const packageSegments = packageName.split('/');
  const candidates = [
    join(importerRoot, 'node_modules', ...packageSegments),
    join(workspaceRoot, 'node_modules', ...packageSegments),
  ];
  return candidates.find((candidate) => existsSync(join(candidate, 'package.json'))) ?? null;
}

function packageRootFromResolvedPath(resolvedPath: string, workspaceRoot: string): string | null {
  let current = resolvedPath;
  const workspaceRootLower = workspaceRoot.toLowerCase();
  const filesystemRoot = parse(current).root;
  while (current.toLowerCase().startsWith(workspaceRootLower) && current !== filesystemRoot) {
    if (existsSync(join(current, 'package.json'))) return current;
    current = dirname(current);
  }
  return null;
}

function stringField(record: JsonRecord | null, field: string): string | null {
  const value = record?.[field];
  return typeof value === 'string' && value.length > 0 ? value : null;
}
