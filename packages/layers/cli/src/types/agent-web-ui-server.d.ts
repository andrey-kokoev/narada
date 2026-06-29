declare module '@narada2/agent-web-ui/server' {
  export function startAgentWebUiServer(options: {
    host: string;
    port: number;
    eventEndpoint: string;
    healthEndpoint: string | null;
  }): Promise<{ server: unknown; url: string }>;
}
