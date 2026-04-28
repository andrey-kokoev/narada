/**
 * Site Manifest Schema
 *
 * Config schema that describes a Cloudflare-backed Site.
 * Uses the crystallized vocabulary from SEMANTICS.md §2.14:
 * Aim / Site / Cycle / Act / Trace.
 */

import { z } from "zod";
import { AllowedActionSchema } from "@narada2/charters";

// ---------------------------------------------------------------------------
// Re-use existing source config shape for Site bindings
// ---------------------------------------------------------------------------

const SourceConfigSchema = z.object({
  type: z.enum(["graph", "timer", "webhook"]),
  tenant_id: z.string().min(1).optional(),
  client_id: z.string().min(1).optional(),
  client_secret: z.string().min(1).optional(),
  user_id: z.string().min(1).optional(),
  base_url: z.string().url().optional(),
  prefer_immutable_ids: z.boolean().optional(),
}).catchall(z.unknown());

// ---------------------------------------------------------------------------
// Aim — the pursued telos
// ---------------------------------------------------------------------------

export const AimSchema = z.object({
  name: z.string().min(1, "Aim name is required"),
  description: z.string().min(1, "Aim description is required"),
  vertical: z.enum(["mailbox", "timer", "webhook", "filesystem"]).default("mailbox"),
});

export type Aim = z.infer<typeof AimSchema>;

// ---------------------------------------------------------------------------
// Cloudflare-specific bindings
// ---------------------------------------------------------------------------

/**
 * Validate a standard 5-field Cron expression.
 * Supports: * , - / and numeric ranges.
 */
function isValidCron(expression: string): boolean {
  // 5 fields: minute hour day month weekday
  const cronRegex =
    /^((\*|([0-5]?\d)(-[0-5]?\d)?)(\/\d+)?)(,((\*|([0-5]?\d)(-[0-5]?\d)?)(\/\d+)?))*\s+((\*|([01]?\d|2[0-3])(-([01]?\d|2[0-3]))?)(\/\d+)?)(,((\*|([01]?\d|2[0-3])(-([01]?\d|2[0-3]))?)(\/\d+)?))*\s+((\*|([1-2]?\d|3[01])(-([1-2]?\d|3[01]))?)(\/\d+)?)(,((\*|([1-2]?\d|3[01])(-([1-2]?\d|3[01]))?)(\/\d+)?))*\s+((\*|([1-9]|1[0-2])(-([1-9]|1[0-2]))?)(\/\d+)?)(,((\*|([1-9]|1[0-2])(-([1-9]|1[0-2]))?)(\/\d+)?))*\s+((\*|([0-6])(-([0-6]))?)(\/\d+)?)(,((\*|([0-6])(-([0-6]))?)(\/\d+)?))*$/;
  return cronRegex.test(expression);
}

export const CloudflareBindingsSchema = z.object({
  worker_name: z.string().min(1, "Cloudflare worker_name is required"),
  do_namespace: z.string().min(1, "Cloudflare do_namespace is required"),
  r2_bucket: z.string().min(1, "Cloudflare r2_bucket is required"),
  cron_schedule: z
    .string()
    .min(1, "Cloudflare cron_schedule is required")
    .refine(isValidCron, {
      message: "cron_schedule must be a valid 5-field Cron expression (e.g. '0 * * * *')",
    }),
  secret_prefix: z
    .string()
    .min(1, "Cloudflare secret_prefix is required")
    .regex(/^[a-zA-Z0-9_]+$/, "secret_prefix must be URL-safe (alphanumeric and underscore only)"),
});

export type CloudflareBindings = z.infer<typeof CloudflareBindingsSchema>;

// ---------------------------------------------------------------------------
// Site policy — runtime governance
// ---------------------------------------------------------------------------

export const SitePolicySchema = z.object({
  primary_charter: z.string().min(1).default("support_steward"),
  secondary_charters: z.array(z.string().min(1)).optional(),
  allowed_actions: z.array(AllowedActionSchema).min(1, "At least one allowed action is required"),
  allowed_tools: z.array(z.string().min(1)).optional(),
  require_human_approval: z.boolean().default(true),
});

export type SitePolicy = z.infer<typeof SitePolicySchema>;

// ---------------------------------------------------------------------------
// Site governance coordinates — authority and embodiment declaration
// ---------------------------------------------------------------------------

const SiteRefSchema = z.string().min(1, "Site reference is required");
const PathRefSchema = z.string().min(1, "Path reference is required");

export const SiteGoverningLawSourceSchema = z.object({
  source_site_id: SiteRefSchema,
  law_artifacts: z.array(PathRefSchema).min(1, "At least one law artifact is required"),
  mode: z.enum(["inherited", "local", "federated", "external"]),
  version_ref: z.string().min(1).optional(),
  admission: z.enum(["declared", "imported", "reviewed", "operator_confirmed"]),
});

export const SiteAuthorityLocusSchema = z.object({
  locus_kind: z.enum(["narada_proper", "user", "pc", "project", "client_service", "data", "elt", "cloud", "external"]),
  authority_site_id: SiteRefSchema.optional(),
  mutation_policy: z.enum(["direct_only_at_locus", "forward_to_locus", "read_only_projection", "operator_confirmed"]),
});

export const SiteEmbodimentSchema = z.object({
  embodiment_id: z.string().min(1, "Embodiment id is required"),
  role: z.enum(["authority", "execution", "forwarding", "read_only", "projection"]),
  root: PathRefSchema.optional(),
  substrate: z.string().min(1).optional(),
  mutation_policy: z.enum(["may_mutate_at_authority_locus", "must_forward", "read_only", "dry_run_only"]),
});

export const SiteMutationEvidenceLocusSchema = z.object({
  kind: z.enum(["git", "sqlite_export", "filesystem", "external_ledger"]),
  path: PathRefSchema.optional(),
  required: z.boolean().default(true),
});

export const SiteInboxSourceSchema = z.object({
  source_id: z.string().min(1),
  kind: z.enum(["canonical_inbox", "file_drop", "mcp", "pubsub", "operator_chat", "email", "webhook"]),
  path: PathRefSchema.optional(),
  admission: z.enum(["inert_until_promoted", "operator_confirmed", "trusted_local"]),
});

export const SiteOutboxTargetSchema = z.object({
  target_id: z.string().min(1),
  kind: z.enum(["canonical_outbox", "git_export", "mcp", "pubsub", "operator_chat", "email", "webhook"]),
  authority: z.enum(["handoff_only", "operator_confirmed", "local_effect"]),
});

export const SiteCapabilityGrantSchema = z.object({
  capability_id: z.string().min(1),
  source: z.enum(["operator", "credential_store", "site_registry", "external"]),
  scope: z.string().min(1),
  grants_effect_authority: z.boolean().default(false),
});

export const SiteGovernanceCoordinatesSchema = z.object({
  governing_law_source: SiteGoverningLawSourceSchema,
  law_admission_mode: z.enum(["inherit_without_fork", "local_overlay", "federated_review", "external_reference"]),
  authority_locus: SiteAuthorityLocusSchema,
  embodiments: z.array(SiteEmbodimentSchema).default([]),
  mutation_evidence_locus: SiteMutationEvidenceLocusSchema,
  inbox_sources: z.array(SiteInboxSourceSchema).default([]),
  outbox_targets: z.array(SiteOutboxTargetSchema).default([]),
  effect_authority_policy: z.enum(["metadata_only", "operator_confirmed", "capability_grant_required", "no_effects"]),
  capability_grants: z.array(SiteCapabilityGrantSchema).default([]),
  lineage_source: z.object({
    kind: z.enum(["site_lineage", "git_history", "operator_declaration", "external_registry"]),
    path: PathRefSchema.optional(),
  }),
  readiness_phase: z.enum(["bootstrap", "inhabited_onboarding", "operational_steady_state", "archived"]),
  operator_identity: z.object({
    principal_id: z.string().min(1),
    role: z.enum(["Operator", "delegate", "external"]),
  }),
  agent_identity_contract: z.object({
    default_agent_name: z.string().min(1),
    operator_label: z.string().min(1),
    contract_path: PathRefSchema.optional(),
  }),
  local_overlays: z.array(z.object({
    overlay_id: z.string().min(1),
    path: PathRefSchema,
    admission: z.enum(["operator_confirmed", "site_local", "proposal_only"]),
  })).default([]),
  federation_policy: z.object({
    posture: z.enum(["none", "receive_only", "publish_only", "bidirectional"]),
    admission: z.enum(["local_admission_required", "operator_confirmed", "trusted_peer"]),
  }),
});

export type SiteGoverningLawSource = z.infer<typeof SiteGoverningLawSourceSchema>;
export type SiteAuthorityLocus = z.infer<typeof SiteAuthorityLocusSchema>;
export type SiteEmbodiment = z.infer<typeof SiteEmbodimentSchema>;
export type SiteGovernanceCoordinates = z.infer<typeof SiteGovernanceCoordinatesSchema>;

// ---------------------------------------------------------------------------
// Site manifest — the top-level descriptor
// ---------------------------------------------------------------------------

/**
 * URL-safe identifier: alphanumeric, hyphens, and underscores only.
 */
const SiteIdSchema = z
  .string()
  .min(1, "site_id is required")
  .regex(/^[a-zA-Z0-9_-]+$/, "site_id must be URL-safe (alphanumeric, hyphens, and underscores only)");

export const SiteManifestSchema = z.object({
  site_id: SiteIdSchema,
  substrate: z.literal("cloudflare-workers-do-sandbox"),
  aim: AimSchema,
  cloudflare: CloudflareBindingsSchema,
  policy: SitePolicySchema.default({ allowed_actions: ["no_action"] }),
  sources: z.array(SourceConfigSchema).min(1, "At least one source is required"),
  governance: SiteGovernanceCoordinatesSchema.optional(),
});

export type SiteManifest = z.infer<typeof SiteManifestSchema>;

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

export interface SiteValidationSuccess {
  success: true;
  data: SiteManifest;
}

export interface SiteValidationFailure {
  success: false;
  errors: string[];
}

export type SiteValidationResult = SiteValidationSuccess | SiteValidationFailure;

function formatZodErrors(error: z.ZodError): string[] {
  return error.errors.map((e) => {
    const path = e.path.length > 0 ? e.path.join(".") : "manifest";
    return `${path}: ${e.message}`;
  });
}

/**
 * Validate a raw Site manifest against the schema.
 * Returns success with data or failure with formatted errors.
 */
export function validateSiteManifest(raw: unknown): SiteValidationResult {
  const result = SiteManifestSchema.safeParse(raw);

  if (result.success) {
    return { success: true, data: result.data };
  }

  return {
    success: false,
    errors: formatZodErrors(result.error),
  };
}

/**
 * Validate and return data or throw formatted error.
 */
export function validateSiteManifestOrThrow(raw: unknown): SiteManifest {
  const result = validateSiteManifest(raw);

  if (!result.success) {
    throw new Error(`Site manifest validation failed:\n${result.errors.join("\n")}`);
  }

  return result.data;
}

/**
 * Check if value is a valid Site manifest without throwing.
 */
export function isValidSiteManifest(raw: unknown): raw is SiteManifest {
  return SiteManifestSchema.safeParse(raw).success;
}
