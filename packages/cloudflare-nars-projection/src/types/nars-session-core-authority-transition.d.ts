declare module '@narada2/nars-session-core/authority-transition-state' {
  export function authorityTransitionStatePathFromSessionPath(sessionPath: string | null | undefined): string | null;

  export interface AuthorityTransitionPlan {
    schema: string;
    status: 'ready' | 'refused';
    direction: string;
    source_authority_runtime_host: string;
    target_authority_runtime_host: string | null;
    target_authority_locator: Record<string, unknown> | null;
    preparation_requirements: string[];
    shared_activation_requirements: string[];
    refusals: Array<{ reason_code: string; failed_invariant: string; reason: string }>;
  }

  export function planTargetAuthorityTransition(input?: {
    sourceAuthorityRuntimeHost?: string;
    currentSiteRoot?: string | null;
    currentSessionId?: string | null;
    targetAuthorityLocator?: Record<string, unknown> | null;
    supersededBySessionId?: string | null;
    authorityLocatorRef?: string | null;
  }): AuthorityTransitionPlan;

  export function prepareTargetAuthority(input?: {
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

  export function beginSourceDrain(input?: {
    path?: string | null;
    sessionPath?: string | null;
    state?: Record<string, unknown> | null;
    reason?: string | null;
    requestedBy?: string | null;
    now?: Date;
  }): Record<string, unknown>;

  export function sealSourceAuthority(input?: {
    path?: string | null;
    sessionPath?: string | null;
    state?: Record<string, unknown> | null;
    sourceLastSequence?: number | null;
    reason?: string | null;
    requestedBy?: string | null;
    now?: Date;
  }): Record<string, unknown>;

  export function classifyTargetWriteAdmission(state: Record<string, unknown>, options?: {
    authorityEpochToken?: Record<string, unknown> | null;
    targetFirstSequence?: number | null;
    nextEventSequence?: number | null;
  }): {
    admitted: boolean;
    reason_code?: string;
    reason?: string;
    missing?: string[];
    target_first_sequence?: number;
    authority_epoch_token?: Record<string, unknown>;
  };
}
