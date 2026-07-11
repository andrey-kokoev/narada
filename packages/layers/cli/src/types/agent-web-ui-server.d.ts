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
  }): Promise<{ server: unknown; url: string }>;
}
