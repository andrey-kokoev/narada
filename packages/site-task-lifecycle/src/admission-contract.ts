import { join } from 'node:path';
import { assertNeutralIdentities, findDeniedSourceImports } from './import-refusal.js';
import type {
  CompatibilityProjectionPolicy,
  McpTransportRegistration,
  SiteTaskLifecycleAdmissionContract,
  SiteTaskLifecycleAdmissionContractOptions,
} from './types.js';

const PACKAGE_NAME = '@narada2/site-task-lifecycle';
const LEGACY_SOURCE_TABLE = 'narada_andrey_task_role_preferences';

export class NonNeutralProjectionPolicyError extends Error {
  constructor(tableName: string) {
    super(`Compatibility projection table must be neutral, got: ${tableName}`);
    this.name = 'NonNeutralProjectionPolicyError';
  }
}

export function createMcpRegistrationSnippet(siteRoot: string): McpTransportRegistration {
  return {
    status: 'snippet_ready',
    siteRoot,
    packageName: PACKAGE_NAME,
    command: 'narada-mcp',
    args: [
      'register',
      PACKAGE_NAME,
      '--site-root',
      siteRoot,
      '--entry',
      join('node_modules', PACKAGE_NAME, 'dist', 'index.js'),
    ],
  };
}

export function buildCompatibilityProjectionPolicy(
  tableName = 'site_task_role_preferences',
  notes: string[] = [],
): CompatibilityProjectionPolicy {
  return {
    tableName,
    legacySourceTables: [LEGACY_SOURCE_TABLE],
    projectionMode: 'read_legacy_write_neutral',
    notes,
  };
}

export function buildSiteTaskLifecycleAdmissionContract(
  options: SiteTaskLifecycleAdmissionContractOptions,
): SiteTaskLifecycleAdmissionContract {
  const packageName = options.packageName ?? PACKAGE_NAME;
  if (packageName !== PACKAGE_NAME) {
    throw new Error(`Unexpected package for task lifecycle admission: ${packageName}`);
  }

  if (options.compatibilityProjectionPolicy.tableName === LEGACY_SOURCE_TABLE) {
    throw new NonNeutralProjectionPolicyError(options.compatibilityProjectionPolicy.tableName);
  }

  assertNeutralIdentities(options.localIdentityMappings.map((mapping) => mapping.localIdentity));

  return {
    schema: 'narada.site_task_lifecycle.admission_contract.v0',
    packageName,
    packageVersion: options.packageVersion,
    localSiteRoot: options.localSiteRoot,
    localTaskDbPath: options.localTaskDbPath,
    taskSpecProjectionDir: options.taskSpecProjectionDir,
    rosterInitializationSource: options.rosterInitializationSource,
    mcpTransportRegistration: {
      ...createMcpRegistrationSnippet(options.localSiteRoot),
      ...options.mcpTransportRegistration,
    },
    packageTests: options.packageTests,
    localIdentityMappings: options.localIdentityMappings,
    rejectedSourcePaths: options.rejectedSourcePaths,
    rejectedSourceFindings: findDeniedSourceImports(options.rejectedSourcePaths),
    compatibilityProjectionPolicy: options.compatibilityProjectionPolicy,
    admittedBy: options.admittedBy,
    admittedAt: options.admittedAt,
  };
}
