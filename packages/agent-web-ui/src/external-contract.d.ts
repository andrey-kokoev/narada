export {};

declare module '@narada2/nars-client-projection-contract' {
  export function buildAgentWebUiArtifactsSummaryFrame(
    options?: Record<string, unknown>,
  ): Record<string, unknown>;
  export function buildAgentWebUiDelegationSummaryFrame(
    options?: Record<string, unknown>,
  ): Record<string, unknown>;
  export function buildAgentWebUiGitSummaryFrame(
    options?: Record<string, unknown>,
  ): Record<string, unknown>;
  export function buildAgentWebUiInboxSummaryFrame(
    options?: Record<string, unknown>,
  ): Record<string, unknown>;
  export function buildAgentWebUiMailboxSummaryFrame(
    options?: Record<string, unknown>,
  ): Record<string, unknown>;
  export function buildAgentWebUiSchedulerSummaryFrame(
    options?: Record<string, unknown>,
  ): Record<string, unknown>;
  export function buildAgentWebUiTaskLifecycleSummaryFrame(
    options?: Record<string, unknown>,
  ): Record<string, unknown>;
  export function buildAgentWebUiSopSummaryFrame(
    options?: Record<string, unknown>,
  ): Record<string, unknown>;
  export function buildAgentWebUiSurfaceAffordancesFrame(
    options?: Record<string, unknown>,
  ): Record<string, unknown>;
  export function buildAgentWebUiSurfaceFeedbackSummaryFrame(
    options?: Record<string, unknown>,
  ): Record<string, unknown>;
  export function buildAgentWebUiAffordanceActionRequestFrame(
    input?: Record<string, unknown>,
    options?: Record<string, unknown>,
  ): Record<string, unknown> | null;
  export function buildAgentWebUiAffordanceActionConfirmFrame(
    input?: Record<string, unknown>,
    options?: Record<string, unknown>,
  ): Record<string, unknown> | null;
  export function buildAgentWebUiAffordanceActionCancelFrame(
    input?: Record<string, unknown>,
    options?: Record<string, unknown>,
  ): Record<string, unknown> | null;
  export function buildAgentWebUiConversationEnqueueFrame(
    text: unknown,
    options?: Record<string, unknown>,
  ): Record<string, unknown> | null;
  export function buildAgentWebUiConversationSendFrame(
    text: unknown,
    options?: Record<string, unknown>,
  ): Record<string, unknown> | null;
  export function buildAgentWebUiConversationSteerFrame(
    text: unknown,
    options?: Record<string, unknown>,
  ): Record<string, unknown> | null;
  export function buildAgentWebUiOperatorInputAction(
    text: unknown,
    options?: Record<string, unknown>,
  ): Record<string, unknown> | null;
  export function translateAgentWebUiFrameForCloudflare(
    frame: unknown,
  ): Record<string, unknown> | null;
}
