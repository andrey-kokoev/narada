declare module '@narada2/nars-session-core/authority-transition-state' {
  export function authorityTransitionStatePathFromSessionPath(sessionPath: string | null | undefined): string | null;

  export function readAuthorityTransitionSourceState(path: string | null | undefined): Record<string, unknown>;

  export function prepareTargetAuthority(options: Record<string, unknown>): Record<string, unknown>;
}
