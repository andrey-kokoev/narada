/**
 * Foreman Core
 *
 * Control-plane facade for work opening, evaluation validation,
 * charter arbitration, and outbound handoff.
 */

export type {
  ForemanFacade,
  SyncCompletionSignal,
  ChangedConversation,
  WorkOpeningResult,
  OpenedWorkItem,
  SupersededWorkItem,
  ResolveWorkItemRequest,
  ResolutionResult,
  EvaluationEnvelope,
  CharterOutputEnvelope,
  CharterInvocationEnvelope,
  AllowedAction,
  ToolCatalogEntry,
  PriorEvaluation,
  CharterClassification,
  ExtractedFact,
  ProposedAction,
  EscalationProposal,
  ToolInvocationRequest,
} from "./types.js";

export { validateCharterOutput, arbitrateEvaluations } from "./validation.js";
export { DefaultForemanFacade, type ForemanFacadeDeps, type ForemanFacadeOptions } from "./facade.js";
export { OutboundHandoff, type OutboundHandoffDeps } from "./handoff.js";
export { IntentHandoff, type IntentHandoffDeps } from "../intent/handoff.js";
