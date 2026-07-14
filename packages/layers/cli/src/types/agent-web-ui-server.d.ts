declare module '@narada2/agent-web-ui/server' {
  export function startAgentWebUiServer(options: {
    host: string;
    port: number;
    eventEndpoint: string;
    healthEndpoint: string | null;
    inputEndpoint?: string | null;
    sessionId?: string | null;
    siteRoot?: string | null;
    siteId?: string | null;
    agentId?: string | null;
    cloudflareApiBaseUrl?: string | null;
    authorityTransition?: unknown;
    publicBasePath?: string | null;
    publicEventEndpoint?: string | null;
    publicHealthEndpoint?: string | null;
    publicArtifactBasePath?: string | null;
    publicArtifactTransport?: string | null;
    artifactRoot?: string | null;
  }): Promise<{ server: unknown; url: string }>;
}
