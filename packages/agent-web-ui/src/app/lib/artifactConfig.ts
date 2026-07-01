import type { InjectionKey } from 'vue';

export interface ArtifactRenderingConfig {
  artifactBasePath: string | null;
  artifactTransport?: string | null;
  browserToken?: string | null;
}

export function artifactFetchHeaders(config: ArtifactRenderingConfig): Record<string, string> {
  return config.browserToken ? { 'x-narada-browser-token-fingerprint': config.browserToken } : {};
}

function withBrowserToken(url: string, browserToken: string | null | undefined): string {
  if (!browserToken) return url;
  const parsed = new URL(url);
  parsed.searchParams.set('browser-token', browserToken);
  return parsed.toString();
}

export const ArtifactRenderingConfigKey: InjectionKey<ArtifactRenderingConfig> = Symbol('ArtifactRenderingConfig');

export function artifactMetadataPath(config: ArtifactRenderingConfig, sessionId: string | null | undefined, artifactId: string): string | null {
  const basePath = config.artifactBasePath?.replace(/\/+$/, '') ?? null;
  if (!basePath || !artifactId) return null;
  if (config.artifactTransport === 'cloudflare-projection' || config.artifactTransport === 'cloudflare-authority') return withBrowserToken(`${basePath}/${encodeURIComponent(artifactId)}`, config.browserToken);
  if (!sessionId) return null;
  return `${basePath}/sessions/${encodeURIComponent(sessionId)}/artifacts/${encodeURIComponent(artifactId)}`;
}

export function artifactContentPath(config: ArtifactRenderingConfig, sessionId: string | null | undefined, artifactId: string): string | null {
  const basePath = config.artifactBasePath?.replace(/\/+$/, '') ?? null;
  if (!basePath || !artifactId) return null;
  if (config.artifactTransport === 'cloudflare-projection' || config.artifactTransport === 'cloudflare-authority') return withBrowserToken(`${basePath}/${encodeURIComponent(artifactId)}/content`, config.browserToken);
  if (!sessionId) return null;
  return `${basePath}/sessions/${encodeURIComponent(sessionId)}/artifacts/${encodeURIComponent(artifactId)}/content`;
}
