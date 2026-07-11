declare module '@narada2/nars-session-core/session-index' {
  export function discoverNarsSessions(options: Record<string, unknown>): {
    schema: string;
    site_root: string | null;
    sessions_root: string;
    generated_at: string;
    index: unknown;
    sessions: Array<Record<string, unknown>>;
  };
}
