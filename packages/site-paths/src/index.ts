import { basename, dirname, join, resolve } from 'node:path';

export const SITE_AUTHORITY_DIR_NAME = '.narada' as const;

export type NaradaSiteRootKind = 'site_authority_root' | 'workspace_root';

export interface ResolveNaradaSitePathsOptions {
  siteRoot?: string | null;
  workspaceRoot?: string | null;
  sessionId?: string | null;
}

export interface NaradaSitePaths {
  inputRoot: string;
  rootKind: NaradaSiteRootKind;
  workspaceRoot: string;
  siteRoot: string;
  siteAuthorityRoot: string;
  aiRoot: string;
  runtimeRoot: string;
  crewRoot: string;
  narsSessionsRoot: string;
  narsSessionDir?: string;
  narsControlSidebandPath?: string;
  narsOperatorInputQueuePath?: string;
  narsControlPath?: string;
  narsSessionPath?: string;
  narsEventsPath?: string;
  narsHeartbeatPath?: string;
  narsSessionIndexRecordPath?: string;
  narsArtifactsRoot?: string;
  narsArtifactsIndexPath?: string;
}

function normalizeRoot(value: string | null | undefined, fieldName: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${fieldName}_required`);
  }
  return resolve(value.trim());
}

function isSiteAuthorityRoot(path: string): boolean {
  return basename(path).toLowerCase() === SITE_AUTHORITY_DIR_NAME;
}

function maybeSessionPaths(
  narsSessionsRoot: string,
  sessionId: string | null | undefined,
): Partial<NaradaSitePaths> {
  if (sessionId === undefined || sessionId === null || String(sessionId).trim().length === 0) return {};
  const normalizedSessionId = String(sessionId).trim();
  const narsSessionDir = join(narsSessionsRoot, normalizedSessionId);
  const narsControlSidebandPath = join(narsSessionDir, 'control.jsonl');
  const narsOperatorInputQueuePath = join(narsSessionDir, 'operator-input-queue.json');
  return {
    narsSessionDir,
    narsControlSidebandPath,
    narsOperatorInputQueuePath,
    narsControlPath: narsControlSidebandPath,
    narsSessionPath: join(narsSessionDir, 'session.jsonl'),
    narsEventsPath: join(narsSessionDir, 'events.jsonl'),
    narsHeartbeatPath: join(narsSessionDir, 'heartbeat.json'),
    narsSessionIndexRecordPath: join(narsSessionDir, 'session-index-record.json'),
    narsArtifactsRoot: join(narsSessionDir, 'artifacts'),
    narsArtifactsIndexPath: join(narsSessionDir, 'artifacts', 'index.json'),
  };
}

export function resolveNaradaSitePaths({
  siteRoot,
  workspaceRoot,
  sessionId,
}: ResolveNaradaSitePathsOptions = {}): NaradaSitePaths {
  const inputRoot = normalizeRoot(siteRoot ?? workspaceRoot, 'site_root');
  const rootKind = isSiteAuthorityRoot(inputRoot) ? 'site_authority_root' : 'workspace_root';
  const resolvedWorkspaceRoot = workspaceRoot === undefined || workspaceRoot === null || String(workspaceRoot).trim().length === 0
    ? rootKind === 'site_authority_root'
      ? dirname(inputRoot)
      : inputRoot
    : normalizeRoot(workspaceRoot, 'workspace_root');
  const siteAuthorityRoot = rootKind === 'site_authority_root'
    ? inputRoot
    : join(inputRoot, SITE_AUTHORITY_DIR_NAME);
  const aiRoot = join(siteAuthorityRoot, '.ai');
  const runtimeRoot = join(aiRoot, 'runtime');
  const crewRoot = join(siteAuthorityRoot, 'crew');
  const narsSessionsRoot = join(crewRoot, 'nars-sessions');

  return Object.freeze({
    inputRoot,
    rootKind,
    workspaceRoot: resolvedWorkspaceRoot,
    siteRoot: inputRoot,
    siteAuthorityRoot,
    aiRoot,
    runtimeRoot,
    crewRoot,
    narsSessionsRoot,
    ...maybeSessionPaths(narsSessionsRoot, sessionId),
  });
}

export function siteAuthorityRootFromSiteRoot(siteRoot: string): string {
  return resolveNaradaSitePaths({ siteRoot }).siteAuthorityRoot;
}

export function narsSessionsRootFromSiteRoot(siteRoot: string): string {
  return resolveNaradaSitePaths({ siteRoot }).narsSessionsRoot;
}

