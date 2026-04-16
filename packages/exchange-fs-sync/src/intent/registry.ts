/**
 * Intent Family Registry
 *
 * Explicit, enforced taxonomy for all intent types.
 * No ad hoc intent shapes are allowed.
 *
 * Invariant: Intent is the universal effect boundary.
 */

import type { Intent, IntentType } from "./types.js";

export type IdempotencyScope = "context_action" | "global" | "context";

export type ConfirmationModel = "none" | "implicit" | "explicit";

export interface SchemaProperty {
  type: "string" | "number" | "boolean" | "array" | "object";
  items?: { type: "string" | "number" | "boolean" | "object" };
}

export interface IntentFamily {
  intent_type: IntentType;
  executor_family: string;
  payload_schema: {
    type: "object";
    required?: string[];
    properties: Record<string, SchemaProperty>;
  };
  idempotency_scope: IdempotencyScope;
  confirmation_model: ConfirmationModel;
}

function obj(props: Record<string, SchemaProperty>, required?: string[]): IntentFamily["payload_schema"] {
  return { type: "object", required, properties: props };
}

export const INTENT_FAMILIES: Record<IntentType, IntentFamily> = {
  "mail.send_reply": {
    intent_type: "mail.send_reply",
    executor_family: "mail",
    payload_schema: obj({
      to: { type: "array" },
      cc: { type: "array" },
      bcc: { type: "array" },
      subject: { type: "string" },
      body_text: { type: "string" },
      body_html: { type: "string" },
      reply_to_message_id: { type: "string" },
      target_message_id: { type: "string" },
    }),
    idempotency_scope: "context_action",
    confirmation_model: "implicit",
  },
  "mail.send_new_message": {
    intent_type: "mail.send_new_message",
    executor_family: "mail",
    payload_schema: obj({
      to: { type: "array" },
      cc: { type: "array" },
      bcc: { type: "array" },
      subject: { type: "string" },
      body_text: { type: "string" },
      body_html: { type: "string" },
    }),
    idempotency_scope: "context_action",
    confirmation_model: "implicit",
  },
  "mail.mark_read": {
    intent_type: "mail.mark_read",
    executor_family: "mail",
    payload_schema: obj({
      message_ids: { type: "array", items: { type: "string" } },
      target_message_id: { type: "string" },
    }),
    idempotency_scope: "context_action",
    confirmation_model: "none",
  },
  "mail.move_message": {
    intent_type: "mail.move_message",
    executor_family: "mail",
    payload_schema: obj({
      message_ids: { type: "array", items: { type: "string" } },
      destination_folder_id: { type: "string" },
      target_message_id: { type: "string" },
    }),
    idempotency_scope: "context_action",
    confirmation_model: "none",
  },
  "mail.draft_reply": {
    intent_type: "mail.draft_reply",
    executor_family: "mail",
    payload_schema: obj({
      to: { type: "array" },
      cc: { type: "array" },
      bcc: { type: "array" },
      subject: { type: "string" },
      body_text: { type: "string" },
      body_html: { type: "string" },
      reply_to_message_id: { type: "string" },
      target_message_id: { type: "string" },
    }),
    idempotency_scope: "context_action",
    confirmation_model: "none",
  },
  "mail.set_categories": {
    intent_type: "mail.set_categories",
    executor_family: "mail",
    payload_schema: obj({
      message_ids: { type: "array", items: { type: "string" } },
      categories: { type: "array", items: { type: "string" } },
      target_message_id: { type: "string" },
    }),
    idempotency_scope: "context_action",
    confirmation_model: "none",
  },
  "process.run": {
    intent_type: "process.run",
    executor_family: "process",
    payload_schema: obj(
      {
        command: { type: "string" },
        args: { type: "array", items: { type: "string" } },
        cwd: { type: "string" },
        env: { type: "object" },
        timeout_ms: { type: "number" },
      },
      ["command"],
    ),
    idempotency_scope: "context_action",
    confirmation_model: "none",
  },
};

export function getIntentFamily(intentType: string): IntentFamily | undefined {
  return (INTENT_FAMILIES as Record<string, IntentFamily>)[intentType];
}

function matchesType(value: unknown, prop: SchemaProperty): boolean {
  if (value === undefined || value === null) {
    return true;
  }
  switch (prop.type) {
    case "string":
      return typeof value === "string";
    case "number":
      return typeof value === "number";
    case "boolean":
      return typeof value === "boolean";
    case "array":
      return Array.isArray(value);
    case "object":
      return typeof value === "object" && !Array.isArray(value);
    default:
      return true;
  }
}

function validatePayload(payload: unknown, family: IntentFamily): string | null {
  const schema = family.payload_schema;
  if (schema.type === "object") {
    if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
      return `Payload for ${family.intent_type} must be an object`;
    }
    const record = payload as Record<string, unknown>;
    for (const key of schema.required ?? []) {
      if (!(key in record) || record[key] === undefined) {
        return `Payload for ${family.intent_type} is missing required field: ${key}`;
      }
    }
    for (const [key, value] of Object.entries(record)) {
      const prop = schema.properties[key];
      if (prop && !matchesType(value, prop)) {
        return `Payload field ${key} for ${family.intent_type} has invalid type (expected ${prop.type})`;
      }
    }
  }
  return null;
}

export interface ValidationError {
  valid: false;
  reason: string;
}

export interface ValidationSuccess {
  valid: true;
  family: IntentFamily;
}

export type ValidationResult = ValidationSuccess | ValidationError;

export function validateIntent(intent: Pick<Intent, "intent_type" | "executor_family" | "payload_json">): ValidationResult {
  const family = getIntentFamily(intent.intent_type);
  if (!family) {
    return { valid: false, reason: `Unregistered intent_type: ${intent.intent_type}` };
  }
  if (intent.executor_family !== family.executor_family) {
    return {
      valid: false,
      reason: `Intent ${intent.intent_type} expects executor_family "${family.executor_family}", got "${intent.executor_family}"`,
    };
  }

  let payload: unknown;
  try {
    payload = JSON.parse(intent.payload_json);
  } catch {
    return { valid: false, reason: `Invalid JSON in payload_json for ${intent.intent_type}` };
  }

  const payloadError = validatePayload(payload, family);
  if (payloadError) {
    return { valid: false, reason: payloadError };
  }

  return { valid: true, family };
}

export function assertValidIntent(
  intent: Pick<Intent, "intent_type" | "executor_family" | "payload_json">,
): IntentFamily {
  const result = validateIntent(intent);
  if (!result.valid) {
    throw new Error(`Intent validation failed: ${result.reason}`);
  }
  return result.family;
}
