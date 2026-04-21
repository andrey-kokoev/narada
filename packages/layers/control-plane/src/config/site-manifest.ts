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
