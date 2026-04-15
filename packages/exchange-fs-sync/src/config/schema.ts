import { z } from 'zod';

// Attachment policy enum
const AttachmentPolicySchema = z.enum(['exclude', 'metadata_only', 'include_content']);

// Body policy enum
const BodyPolicySchema = z.enum(['text_only', 'html_only', 'text_and_html']);

// Folder reference (non-empty string)
const FolderRefSchema = z.string().min(1);

// Item kind (non-empty string)
const ItemKindSchema = z.string().min(1);

// Graph configuration schema
const GraphConfigSchema = z.object({
  tenant_id: z.string().min(1).optional(),
  client_id: z.string().min(1).optional(),
  client_secret: z.string().min(1).optional(),
  user_id: z.string().min(1),
  base_url: z.string().url().optional(),
  prefer_immutable_ids: z.boolean(),
});

// Scope configuration schema
const ScopeConfigSchema = z.object({
  included_container_refs: z.array(FolderRefSchema).min(1, 'At least one folder reference is required'),
  included_item_kinds: z.array(ItemKindSchema).min(1, 'At least one item kind is required'),
});

// Normalize configuration schema
const NormalizeConfigSchema = z.object({
  attachment_policy: AttachmentPolicySchema.default('metadata_only'),
  body_policy: BodyPolicySchema.default('text_only'),
  include_headers: z.boolean().default(false),
  tombstones_enabled: z.boolean().default(true),
});

// Runtime configuration schema
const RuntimeConfigSchema = z.object({
  polling_interval_ms: z.number().int().min(1000).default(60000),
  acquire_lock_timeout_ms: z.number().int().min(1000).default(30000),
  cleanup_tmp_on_startup: z.boolean().default(true),
  rebuild_views_after_sync: z.boolean().default(false),
});

// Retention policy schema
const RetentionPolicySchema = z.object({
  max_age_days: z.number().int().min(1).optional(),
  max_total_size: z.string().regex(/^\d+(\.\d+)?\s*(B|KB|MB|GB|TB)?$/i).optional(),
  max_message_count: z.number().int().min(1).optional(),
  preserve_flagged: z.boolean().default(true),
  preserve_unread: z.boolean().default(true),
});

// Cleanup schedule schema
const CleanupScheduleSchema = z.object({
  frequency: z.enum(['daily', 'weekly', 'on-sync', 'manual']).default('weekly'),
  max_run_time_minutes: z.number().int().min(1).default(60),
  time_window: z.object({
    start: z.string().regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/),
    end: z.string().regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/),
  }).optional(),
});

// Lifecycle configuration schema
const LifecycleConfigSchema = z.object({
  tombstone_retention_days: z.number().int().min(1).default(30),
  archive_after_days: z.number().int().min(1).default(90),
  archive_dir: z.string().min(1).default('archive'),
  compress_archives: z.boolean().default(true),
  retention: RetentionPolicySchema.default({}),
  schedule: CleanupScheduleSchema.default({}),
});

// Charter runtime configuration schema
const CharterRuntimeConfigSchema = z.object({
  runtime: z.string().min(1).default('mock'),
  api_key: z.string().min(1).optional(),
  model: z.string().min(1).optional(),
  base_url: z.string().url().optional(),
  timeout_ms: z.number().int().min(1).optional(),
});

// Allowed action enum
const AllowedActionSchema = z.enum([
  'draft_reply',
  'send_reply',
  'send_new_message',
  'mark_read',
  'move_message',
  'set_categories',
  'extract_obligations',
  'create_followup',
  'tool_request',
  'no_action',
]);

// Mailbox policy schema
const MailboxPolicySchema = z.object({
  primary_charter: z.string().min(1).default('support_steward'),
  secondary_charters: z.array(z.string().min(1)).optional(),
  allowed_actions: z.array(AllowedActionSchema).min(1, 'At least one allowed action is required'),
  allowed_tools: z.array(z.string().min(1)).optional(),
  require_human_approval: z.boolean().optional(),
});

// Webhook configuration schema
const WebhookConfigSchema = z.object({
  enabled: z.boolean(),
  public_url: z.string().min(1).optional(),
  port: z.number().int().min(1).max(65535).optional(),
  host: z.string().min(1).optional(),
  path: z.string().min(1).optional(),
  client_state: z.string().min(1).optional(),
  hmac_secret: z.string().min(1).optional(),
  subscription_expiration_minutes: z.number().int().min(1).optional(),
  auto_renew: z.boolean().optional(),
  change_types: z.array(z.string().min(1)).optional(),
  lifecycle_url: z.string().min(1).optional(),
  fallback_poll_minutes: z.number().int().min(1).optional(),
  hybrid_mode: z.boolean().optional(),
  rate_limit_max_requests: z.number().int().min(1).optional(),
  max_body_size: z.number().int().min(1).optional(),
}).refine((data) => {
  if (data.enabled) {
    return data.public_url !== undefined && data.port !== undefined && data.client_state !== undefined;
  }
  return true;
}, {
  message: 'public_url, port, and client_state are required when webhook is enabled',
});

// Main configuration schema
export const ConfigSchema = z.object({
  mailbox_id: z.string().min(1, 'Mailbox ID is required'),
  root_dir: z.string().min(1, 'Root directory is required'),
  graph: GraphConfigSchema,
  scope: ScopeConfigSchema,
  normalize: NormalizeConfigSchema.default({}),
  runtime: RuntimeConfigSchema.default({}),
  lifecycle: LifecycleConfigSchema.default({}),
  charter: CharterRuntimeConfigSchema.default({}),
  policy: MailboxPolicySchema.default({ allowed_actions: ['no_action'] }),
  webhook: WebhookConfigSchema.optional(),
});

// Export inferred type
export type ConfigSchemaType = z.infer<typeof ConfigSchema>;

// Validation result type
export interface ValidationSuccess<T> {
  success: true;
  data: T;
}

export interface ValidationFailure {
  success: false;
  errors: z.ZodError;
  formatted: string[];
}

export type ValidationResult<T> = ValidationSuccess<T> | ValidationFailure;

/**
 * Validate raw configuration against schema
 * Returns success with data or failure with formatted errors
 */
export function validateConfig(raw: unknown): ValidationResult<ConfigSchemaType> {
  const result = ConfigSchema.safeParse(raw);
  
  if (result.success) {
    return { success: true, data: result.data };
  }
  
  return {
    success: false,
    errors: result.error,
    formatted: formatZodErrors(result.error),
  };
}

/**
 * Format Zod errors into human-readable strings
 */
function formatZodErrors(error: z.ZodError): string[] {
  return error.errors.map((e) => {
    const path = e.path.length > 0 ? e.path.join('.') : 'config';
    return `${path}: ${e.message}`;
  });
}

/**
 * Validate and return data or throw formatted error
 */
export function validateConfigOrThrow(raw: unknown): ConfigSchemaType {
  const result = validateConfig(raw);
  
  if (!result.success) {
    throw new Error(`Configuration validation failed:\n${result.formatted.join('\n')}`);
  }
  
  return result.data;
}

/**
 * Check if value is a valid config without throwing
 */
export function isValidConfig(raw: unknown): raw is ConfigSchemaType {
  return ConfigSchema.safeParse(raw).success;
}
