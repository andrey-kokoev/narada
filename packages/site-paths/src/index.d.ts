export const SITE_AUTHORITY_DIR_NAME: '.narada';

export type NaradaSiteRootKind = 'workspace_root' | 'site_authority_root';

export interface ResolveNaradaSitePathsInput {
  siteRoot?: string;
  workspaceRoot?: string;
  sessionId?: string;
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
  narsControlPath?: string;
  narsSessionPath?: string;
  narsEventsPath?: string;
  narsHeartbeatPath?: string;
  narsSessionIndexRecordPath?: string;
  narsArtifactsRoot?: string;
  narsArtifactsIndexPath?: string;
}

export function resolveNaradaSitePaths(input?: ResolveNaradaSitePathsInput): Readonly<NaradaSitePaths>;
export function siteAuthorityRootFromSiteRoot(siteRoot: string): string;
export function narsSessionsRootFromSiteRoot(siteRoot: string): string;
