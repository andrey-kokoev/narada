/**
 * Charter Runtime
 *
 * Envelope contracts, validation, and runners for charter execution.
 */

export type {
  CharterId,
  AllowedAction,
  NormalizedMessage,
  NormalizedThreadContext,
  ToolCatalogEntry,
  PriorEvaluation,
  CharterInvocationEnvelope,
  CharterClassification,
  ExtractedFact,
  ProposedAction,
  EscalationProposal,
  ToolInvocationRequest,
  CharterOutputEnvelope,
  ValidationResult,
} from "./envelope.js";

export {
  CharterIdSchema,
  AllowedActionSchema,
  NormalizedMessageSchema,
  NormalizedThreadContextSchema,
  ToolCatalogEntrySchema,
  PriorEvaluationSchema,
  CharterInvocationEnvelopeSchema,
  CharterClassificationSchema,
  ExtractedFactSchema,
  ProposedActionSchema,
  EscalationProposalSchema,
  ToolInvocationRequestSchema,
  CharterOutputEnvelopeSchema,
  validateInvocationEnvelope,
  validateOutputEnvelope,
} from "./envelope.js";

export { validateCharterOutput } from "./validation.js";

export type { CharterRunner } from "./mock-runner.js";
export { MockCharterRunner, type MockCharterRunnerOptions } from "./mock-runner.js";

export type {
  CodexCharterRunnerOptions,
  TraceRecord,
  RuntimeHooks,
} from "./runner.js";
export { CodexCharterRunner } from "./runner.js";

export type {
  CharterRuntimeHealthClass,
  CharterRuntimeHealth,
  RecoveryGuidance,
} from "./health.js";
export {
  getRecoveryGuidance,
  healthClassPermitsExecution,
} from "./health.js";

export type { SystemPromptTemplate } from "./prompts.js";
export {
  registerPromptTemplate,
  resolveSystemPrompt,
} from "./prompts.js";
