import { builtinModules, createRequire } from 'node:module';

export const SQLITE_BACKEND_ENV = 'NARADA_SQLITE_BACKEND';

export type SqliteBackendPreference = 'auto' | 'better-sqlite3' | 'node:sqlite';
export type SqliteBackendKind = 'better-sqlite3' | 'node:sqlite';

export interface SqliteRuntimePosture {
  preference: SqliteBackendPreference;
  selected: SqliteBackendKind;
  supported: boolean;
  node_version: string;
  node_major: number;
  node_sqlite_available: boolean;
  better_sqlite3_available: boolean;
  reason: string;
  remediation?: string;
}

export interface SelectSqliteRuntimeOptions {
  preference?: string | null;
  nodeVersion?: string;
  nodeSqliteAvailable?: boolean;
  betterSqlite3Available?: boolean;
}

const VALID_PREFERENCES = new Set<SqliteBackendPreference>([
  'auto',
  'better-sqlite3',
  'node:sqlite',
]);

export function parseSqliteBackendPreference(value: string | null | undefined): SqliteBackendPreference {
  const normalized = (value ?? 'auto').trim();
  if (VALID_PREFERENCES.has(normalized as SqliteBackendPreference)) {
    return normalized as SqliteBackendPreference;
  }
  throw new Error(
    `${SQLITE_BACKEND_ENV} must be one of: auto, better-sqlite3, node:sqlite; received ${JSON.stringify(value)}`,
  );
}

export function detectNodeSqliteAvailability(): boolean {
  const builtins = new Set<string>();
  for (const name of builtinModules) {
    builtins.add(name);
    builtins.add(`node:${name}`);
  }
  return builtins.has('sqlite') || builtins.has('node:sqlite');
}

export function detectBetterSqlite3Availability(rootPackageJsonPath = process.cwd()): boolean {
  try {
    const requireFromRoot = createRequire(rootPackageJsonPath.endsWith('package.json')
      ? rootPackageJsonPath
      : `${rootPackageJsonPath}/package.json`);
    requireFromRoot.resolve('better-sqlite3');
    return true;
  } catch {
    return false;
  }
}

export function selectSqliteRuntime(options: SelectSqliteRuntimeOptions = {}): SqliteRuntimePosture {
  const nodeVersion = options.nodeVersion ?? process.versions.node;
  const nodeMajor = Number(nodeVersion.split('.')[0] ?? '0');
  const preference = parseSqliteBackendPreference(
    options.preference ?? process.env[SQLITE_BACKEND_ENV] ?? 'auto',
  );
  const nodeSqliteAvailable = options.nodeSqliteAvailable ?? detectNodeSqliteAvailability();
  const betterSqlite3Available = options.betterSqlite3Available ?? true;

  if (preference === 'node:sqlite') {
    const supported = nodeMajor >= 22 && nodeSqliteAvailable;
    return {
      preference,
      selected: 'node:sqlite',
      supported: false,
      node_version: nodeVersion,
      node_major: nodeMajor,
      node_sqlite_available: nodeSqliteAvailable,
      better_sqlite3_available: betterSqlite3Available,
      reason: supported
        ? 'node:sqlite is available, but Narada has not yet promoted a node:sqlite lifecycle adapter as authoritative'
        : 'node:sqlite is unavailable in this Node runtime',
      remediation: supported
        ? 'Keep NARADA_SQLITE_BACKEND=auto until the adapter conformance suite is implemented.'
        : 'Use Node 22+ with node:sqlite or keep NARADA_SQLITE_BACKEND=auto.',
    };
  }

  if (preference === 'better-sqlite3') {
    return {
      preference,
      selected: 'better-sqlite3',
      supported: betterSqlite3Available,
      node_version: nodeVersion,
      node_major: nodeMajor,
      node_sqlite_available: nodeSqliteAvailable,
      better_sqlite3_available: betterSqlite3Available,
      reason: betterSqlite3Available
        ? 'better-sqlite3 is the current authoritative Narada SQLite runtime'
        : 'better-sqlite3 is not resolvable in this installation',
      remediation: betterSqlite3Available
        ? undefined
        : 'Run pnpm install and pnpm rebuild better-sqlite3, or use an installation with native build scripts enabled.',
    };
  }

  return {
    preference,
    selected: 'better-sqlite3',
    supported: betterSqlite3Available,
    node_version: nodeVersion,
    node_major: nodeMajor,
    node_sqlite_available: nodeSqliteAvailable,
    better_sqlite3_available: betterSqlite3Available,
    reason: nodeSqliteAvailable && nodeMajor >= 22
      ? 'auto keeps better-sqlite3 until node:sqlite passes Narada adapter conformance'
      : 'auto keeps better-sqlite3 because node:sqlite is not available on this runtime',
    remediation: betterSqlite3Available
      ? undefined
      : 'Run pnpm install and pnpm rebuild better-sqlite3, or use an installation with native build scripts enabled.',
  };
}

export function assertSqliteRuntimeSupported(posture: SqliteRuntimePosture): void {
  if (posture.supported) return;
  throw new Error(`${SQLITE_BACKEND_ENV}=${posture.preference} is not supported: ${posture.reason}. ${posture.remediation ?? ''}`.trim());
}
