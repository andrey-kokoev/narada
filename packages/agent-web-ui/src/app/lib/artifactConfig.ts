import type { InjectionKey } from 'vue';

export interface ArtifactRenderingConfig {
  artifactBasePath: string | null;
  artifactTransport?: string | null;
}

export const ArtifactRenderingConfigKey: InjectionKey<ArtifactRenderingConfig> = Symbol('ArtifactRenderingConfig');

export function artifactMetadataPath(config: ArtifactRenderingConfig, sessionId: string | null | undefined, artifactId: string): string | null {
  const basePath = config.artifactBasePath?.replace(/\/+$/, '') ?? null;
  if (!basePath || !artifactId) return null;
  if (config.artifactTransport === 'cloudflare-projection') return `${basePath}/${encodeURIComponent(artifactId)}`;
  if (!sessionId) return null;
  return `${basePath}/sessions/${encodeURIComponent(sessionId)}/artifacts/${encodeURIComponent(artifactId)}`;
}

export function artifactContentPath(config: ArtifactRenderingConfig, sessionId: string | null | undefined, artifactId: string): string | null {
  const metadataPath = artifactMetadataPath(config, sessionId, artifactId);
  return metadataPath ? `${metadataPath}/content` : null;
}
