/** Public transport control for one canonical intelligence invocation attempt. */

import type { PlanAttemptMode } from "./temporal.js";

export const INTELLIGENCE_INVOCATION_CONTROL_SCHEMA =
  "narada.invokable-intelligence.invocation-control.v1" as const;

export const PLAN_ATTEMPT_MODES = [
  "immediate",
  "queued-batch",
  "delayed",
  "retry",
  "resume",
  "replay",
] as const satisfies readonly PlanAttemptMode[];

export interface IntelligenceInvocationControl {
  schema: typeof INTELLIGENCE_INVOCATION_CONTROL_SCHEMA;
  intent_id?: string;
  operation_id?: string;
  mode: PlanAttemptMode;
  allow_replan: boolean;
}

export class IntelligenceInvocationControlError extends Error {
  readonly code = "invalid-intelligence-invocation-control";
  readonly path: string;

  constructor(path: string, message: string) {
    super(`${path}: ${message}`);
    this.name = "IntelligenceInvocationControlError";
    this.path = path;
  }
}

const ALLOWED_KEYS = new Set([
  "schema",
  "intent_id",
  "operation_id",
  "mode",
  "allow_replan",
]);
const ATTEMPT_MODES = new Set<string>(PLAN_ATTEMPT_MODES);
const EXPLICIT_LINEAGE_MODES = new Set<PlanAttemptMode>(["retry", "resume", "replay"]);
const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,255}$/;

function optionalId(value: unknown, prefix: string, path: string): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || !ID_PATTERN.test(value) || !value.startsWith(`${prefix}:`)) {
    throw new IntelligenceInvocationControlError(
      path,
      `must be a non-empty ${prefix}: identity using only letters, digits, '.', '_', ':', '/', or '-'`,
    );
  }
  return value;
}

/**
 * Normalize an untrusted transport value. Unknown fields are rejected so a
 * misspelled lineage or idempotency control cannot silently become a fresh
 * provider invocation.
 */
export function normalizeIntelligenceInvocationControl(value: unknown): IntelligenceInvocationControl {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new IntelligenceInvocationControlError("$", "must be an object");
  }
  const input = value as Record<string, unknown>;
  for (const key of Object.keys(input)) {
    if (!ALLOWED_KEYS.has(key)) {
      throw new IntelligenceInvocationControlError(`$.${key}`, "unknown field");
    }
  }
  if (input.schema !== undefined && input.schema !== INTELLIGENCE_INVOCATION_CONTROL_SCHEMA) {
    throw new IntelligenceInvocationControlError("$.schema", `must equal '${INTELLIGENCE_INVOCATION_CONTROL_SCHEMA}'`);
  }
  const mode = input.mode ?? "immediate";
  if (typeof mode !== "string" || !ATTEMPT_MODES.has(mode)) {
    throw new IntelligenceInvocationControlError("$.mode", `must be one of ${PLAN_ATTEMPT_MODES.join(", ")}`);
  }
  if (input.allow_replan !== undefined && typeof input.allow_replan !== "boolean") {
    throw new IntelligenceInvocationControlError("$.allow_replan", "must be a boolean");
  }
  const intentId = optionalId(input.intent_id, "intent", "$.intent_id");
  const operationId = optionalId(input.operation_id, "operation", "$.operation_id");
  if (EXPLICIT_LINEAGE_MODES.has(mode as PlanAttemptMode) && (!intentId || !operationId)) {
    throw new IntelligenceInvocationControlError(
      "$",
      `mode '${mode}' requires both intent_id and operation_id`,
    );
  }
  return Object.freeze({
    schema: INTELLIGENCE_INVOCATION_CONTROL_SCHEMA,
    ...(intentId ? { intent_id: intentId } : {}),
    ...(operationId ? { operation_id: operationId } : {}),
    mode: mode as PlanAttemptMode,
    allow_replan: input.allow_replan !== false,
  });
}
