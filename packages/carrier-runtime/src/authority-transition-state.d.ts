declare module '@narada2/carrier-runtime/authority-transition-state' {
  export function authorityTransitionStatePathFromSessionPath(sessionPath?: string | null): string | null;

  export function readAuthorityTransitionSourceState(path?: string | null): Record<string, unknown>;

  export function writeAuthorityTransitionSourceState(path?: string | null, state?: Record<string, unknown>): Record<string, unknown>;

  export function planTargetAuthorityTransition(options?: {
    sourceAuthorityRuntimeHost?: string;
    currentSiteRoot?: string | null;
    currentSessionId?: string | null;
    targetAuthorityLocator?: Record<string, unknown> | null;
    supersededBySessionId?: string | null;
    authorityLocatorRef?: string | null;
  }): Record<string, unknown>;

  export function prepareTargetAuthority(options?: {
    path?: string | null;
    sessionPath?: string | null;
    state?: Record<string, unknown> | null;
    targetAuthorityLocator?: Record<string, unknown> | null;
    supersededBySessionId?: string | null;
    authorityLocatorRef?: string | null;
    transitionPlan?: Record<string, unknown> | null;
    reason?: string | null;
    requestedBy?: string | null;
    now?: Date;
  }): Record<string, unknown>;

  export function activateTargetAuthority(options?: {
    path?: string | null;
    sessionPath?: string | null;
    state?: Record<string, unknown> | null;
    activationId?: string | null;
    targetFirstSequence?: number | null;
    authorityEpochToken?: Record<string, unknown> | null;
    targetAuthorityLocator?: Record<string, unknown> | null;
    supersededBySessionId?: string | null;
    authorityLocatorRef?: string | null;
    reason?: string | null;
    requestedBy?: string | null;
    now?: Date;
  }): Record<string, unknown>;

  export function beginSourceDrain(options?: {
    path?: string | null;
    sessionPath?: string | null;
    state?: Record<string, unknown> | null;
    reason?: string | null;
    requestedBy?: string | null;
    now?: Date;
  }): Record<string, unknown>;

  export function sealSourceAuthority(options?: {
    path?: string | null;
    sessionPath?: string | null;
    state?: Record<string, unknown> | null;
    sourceLastSequence?: number | null;
    reason?: string | null;
    requestedBy?: string | null;
    now?: Date;
  }): Record<string, unknown>;

  export function authorityTransitionSourceStateSnapshot(state?: Record<string, unknown>): Record<string, unknown>;

  export function classifyTargetWriteAdmission(state?: Record<string, unknown>, options?: {
    authorityEpochToken?: Record<string, unknown> | null;
    targetFirstSequence?: number | null;
    nextEventSequence?: number | null;
  }): Record<string, unknown>;

  export function classifySourceWriteAdmission(state?: Record<string, unknown>, options?: {
    methodKind?: string | null;
    transitionPolicy?: string | null;
  }): Record<string, unknown>;
}
