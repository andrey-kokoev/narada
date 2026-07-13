declare module '@narada2/nars-session-core/artifacts' {
  export interface NarsArtifactContentResult {
    content: Buffer;
    content_type: string;
    headers: Record<string, string>;
  }

  export function readNarsArtifactContent(input: { sessionPath: string; artifactId: string }): NarsArtifactContentResult;
  export function readNarsArtifact(input: { sessionPath: string; artifactId: string }): Record<string, unknown>;
  export function publicNarsArtifactRecord(record: Record<string, unknown>): Record<string, unknown>;
  export function registerNarsArtifact(input: { sessionPath: string; sessionId: string; siteRoot: string; sourcePath: string; kind: string }): { record: { artifact_id: string } };
}

declare module '@narada2/nars-session-core/session-index' {
  export interface NarsSessionDiscoveryResult {
    sessions: Array<Record<string, unknown> & { session_id?: string | null; record?: Record<string, unknown> | null }>;
  }

  export function discoverNarsSessions(input: { siteRoot: string }): NarsSessionDiscoveryResult;
  export function writeNarsSessionStartedIndex(input: { sessionStartedEvent: Record<string, unknown>; sessionPath: string; siteRoot: string }): unknown;
}
