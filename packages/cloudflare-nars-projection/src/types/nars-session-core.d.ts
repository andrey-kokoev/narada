declare module '@narada2/nars-session-core/artifacts' {
  export interface NarsArtifactIndexResult {
    artifacts: Array<Record<string, unknown>>;
  }

  export interface NarsArtifactContentResult {
    content: Uint8Array;
    content_type: string;
    headers: Record<string, string>;
  }

  export function readNarsArtifactIndex(input: { sessionPath: string }): NarsArtifactIndexResult;
  export function readNarsArtifactContent(input: { sessionPath: string; artifactId: string; siteRoot?: string }): NarsArtifactContentResult;
}
