/**
 * Charter Runtime Envelopes
 *
 * TypeScript types and Zod schemas for charter invocation and output.
 *
 * Spec: .ai/tasks/20260414-006-assignment-agent-b-charter-invocation-v2.md
 * Spec: .ai/tasks/20260415-054-de-mailbox-charter-envelope.md
 */

import { z } from "zod";

export const CharterIdSchema = z.string();
export type CharterId = z.infer<typeof CharterIdSchema>;

export const AllowedActionSchema = z.enum([
  "draft_reply",
  "send_reply",
  "send_new_message",
  "mark_read",
  "move_message",
  "set_categories",
  "extract_obligations",
  "create_followup",
  "tool_request",
  "process_run",
  "no_action",
]);
export type AllowedAction = z.infer<typeof AllowedActionSchema>;

export const NormalizedMessageSchema = z.object({
  message_id: z.string(),
  conversation_id: z.string(),
  internet_message_id: z.string().nullable(),
  subject: z.string().nullable(),
  body_preview: z.string().nullable(),
  from: z.object({ email: z.string().nullable(), name: z.string().nullable() }).array(),
  to: z.object({ email: z.string().nullable(), name: z.string().nullable() }).array(),
  cc: z.object({ email: z.string().nullable(), name: z.string().nullable() }).array(),
  bcc: z.object({ email: z.string().nullable(), name: z.string().nullable() }).array(),
  received_at: z.string().nullable(),
  sent_at: z.string().nullable(),
  is_draft: z.boolean(),
  is_read: z.boolean(),
  categories: z.string().array(),
  parent_folder_id: z.string().nullable(),
  importance: z.enum(["low", "normal", "high"]).nullable(),
});
export type NormalizedMessage = z.infer<typeof NormalizedMessageSchema>;

export const NormalizedThreadContextSchema = z.object({
  conversation_id: z.string(),
  mailbox_id: z.string(),
  revision_id: z.string(),
  messages: NormalizedMessageSchema.array(),
});
export type NormalizedThreadContext = z.infer<typeof NormalizedThreadContextSchema>;

export const ToolCatalogEntrySchema = z.object({
  tool_id: z.string(),
  tool_signature: z.string(),
  description: z.string(),
  schema_args: z
    .object({
      name: z.string(),
      type: z.string(),
      required: z.boolean(),
      description: z.string(),
    })
    .array()
    .optional(),
  read_only: z.boolean(),
  requires_approval: z.boolean(),
  timeout_ms: z.number().int().nonnegative(),
  authority_class: z.enum(["derive", "propose", "claim", "execute", "resolve", "confirm", "admin"]),
});
export type ToolCatalogEntry = z.infer<typeof ToolCatalogEntrySchema>;

export const PriorEvaluationSchema = z.object({
  evaluation_id: z.string(),
  charter_id: CharterIdSchema,
  role: z.enum(["primary", "secondary"]),
  evaluated_at: z.string().datetime(),
  summary: z.string(),
  key_classifications: z
    .object({
      kind: z.string(),
      confidence: z.enum(["low", "medium", "high"]),
    })
    .array(),
});
export type PriorEvaluation = z.infer<typeof PriorEvaluationSchema>;

export const CharterInvocationEnvelopeSchema = z.object({
  invocation_version: z.literal("2.0"),
  execution_id: z.string().min(1),
  work_item_id: z.string().min(1),
  context_id: z.string().min(1),
  scope_id: z.string().min(1),
  charter_id: CharterIdSchema,
  role: z.enum(["primary", "secondary"]),
  invoked_at: z.string().datetime(),
  revision_id: z.string().min(1),
  context_materialization: z.any(),
  vertical_hints: z.record(z.unknown()).optional(),
  allowed_actions: AllowedActionSchema.array(),
  available_tools: ToolCatalogEntrySchema.array(),
  coordinator_flags: z.string().array(),
  prior_evaluations: PriorEvaluationSchema.array(),
  max_prior_evaluations: z.number().int().nonnegative(),
});
export type CharterInvocationEnvelope = z.infer<typeof CharterInvocationEnvelopeSchema>;

export const CharterClassificationSchema = z.object({
  kind: z.string(),
  confidence: z.enum(["low", "medium", "high"]),
  rationale: z.string().max(1000),
});
export type CharterClassification = z.infer<typeof CharterClassificationSchema>;

export const ExtractedFactSchema = z.object({
  kind: z.string(),
  value_json: z.string(),
  source_record_ids: z.string().array(),
  confidence: z.enum(["low", "medium", "high"]),
});
export type ExtractedFact = z.infer<typeof ExtractedFactSchema>;

export const ProposedActionSchema = z.object({
  action_type: AllowedActionSchema,
  authority: z.enum(["proposed", "recommended"]),
  payload_json: z.string(),
  rationale: z.string(),
});
export type ProposedAction = z.infer<typeof ProposedActionSchema>;

export const EscalationProposalSchema = z.object({
  kind: z.string(),
  reason: z.string(),
  urgency: z.enum(["low", "medium", "high"]),
  suggested_recipient: z.string().optional(),
});
export type EscalationProposal = z.infer<typeof EscalationProposalSchema>;

export const ToolInvocationRequestSchema = z.object({
  tool_id: z.string(),
  arguments_json: z.string(),
  purpose: z.string(),
});
export type ToolInvocationRequest = z.infer<typeof ToolInvocationRequestSchema>;

export const CharterOutputEnvelopeSchema = z.object({
  output_version: z.literal("2.0"),
  execution_id: z.string().min(1),
  charter_id: CharterIdSchema,
  role: z.enum(["primary", "secondary"]),
  analyzed_at: z.string().datetime(),
  outcome: z.enum(["complete", "clarification_needed", "escalation", "no_op"]),
  confidence: z.object({
    overall: z.enum(["low", "medium", "high"]),
    uncertainty_flags: z.string().array(),
  }),
  summary: z.string().max(500),
  classifications: CharterClassificationSchema.array(),
  facts: ExtractedFactSchema.array(),
  recommended_action_class: AllowedActionSchema.optional(),
  proposed_actions: ProposedActionSchema.array(),
  tool_requests: ToolInvocationRequestSchema.array(),
  escalations: EscalationProposalSchema.array(),
  reasoning_log: z.string().optional(),
});
export type CharterOutputEnvelope = z.infer<typeof CharterOutputEnvelopeSchema>;

export interface ValidationResult {
  valid: boolean;
  stripped_actions?: ProposedAction[];
  stripped_tool_requests?: { tool_id: string; reason: string }[];
  corrected_outcome?: CharterOutputEnvelope["outcome"];
  errors: string[];
}

export function validateInvocationEnvelope(envelope: unknown): CharterInvocationEnvelope {
  return CharterInvocationEnvelopeSchema.parse(envelope);
}

export function validateOutputEnvelope(envelope: unknown): CharterOutputEnvelope {
  return CharterOutputEnvelopeSchema.parse(envelope);
}
