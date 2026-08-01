export {};

declare module '@narada-core/nars-client-projection-contract' {
  export type NarsClientProjectionDisposition = 'conversation_fact' | 'operation_fact' | 'diagnostic_signal' | 'protocol_evidence' | 'raw_record' | 'state_sample';
  export const OPERATOR_VIEW_LANES: readonly ['conversation', 'operations', 'diagnostics', 'protocol', 'raw'];
  export type OperatorViewLane = typeof OPERATOR_VIEW_LANES[number];
  export interface OperatorViewPolicyOptions {
    lane?: unknown;
    verbosity?: unknown;
    facets?: readonly unknown[];
    surface?: string;
    includeStateSamples?: boolean;
  }
  export function operatorViewLaneForDisposition(disposition: string): OperatorViewLane | null;
  export function operatorViewTransportVerbosity(options?: OperatorViewPolicyOptions): string;
  export function operatorViewIncludesDisposition(disposition: NarsClientProjectionDisposition, options?: OperatorViewPolicyOptions): boolean;
  export function classifyNarsClientEventDisposition(message: unknown): NarsClientProjectionDisposition;
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