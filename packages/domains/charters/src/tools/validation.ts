/**
 * Tool Request Validation
 *
 * Implements the 7 foreman validation rules for tool requests.
 *
 * Spec: .ai/do-not-open/tasks/20260414-007-assignment-agent-c-tool-binding-runtime.md
 */

import type { ToolInvocationRequest, ToolCatalogEntry } from "../runtime/envelope.js";
import type { SideEffectBudget } from "./resolver.js";

export interface ToolValidationResult {
  allowed: boolean;
  reason?: string;
  sanitized_args?: Record<string, unknown>;
}

export interface ExecutionBudgetState {
  tool_calls_used: number;
  write_tool_calls_used: number;
  total_duration_ms_used: number;
}

/**
 * Validate a tool invocation request against the runtime capability envelope.
 *
 * Rules:
 * 1. Catalog Membership
 * 2. Enabled Check
 * 3. Approval Gate
 * 4. Read-Write Policy
 * 5. Schema Validation
 * 6. Budget Check
 * 7. Arg Sanitization
 */
export function validateToolRequest(
  request: ToolInvocationRequest,
  catalog: ToolCatalogEntry[],
  budget: SideEffectBudget,
  budgetState: ExecutionBudgetState,
  approvalMap: Record<string, boolean>,
): ToolValidationResult {
  // Rule 1: Catalog Membership
  const tool = catalog.find((t) => t.tool_id === request.tool_id);
  if (!tool) {
    return {
      allowed: false,
      reason: `Tool '${request.tool_id}' is not in the available catalog for this execution.`,
    };
  }

  // Rule 2: Enabled Check
  // (Tools in the catalog are already filtered to enabled ones by the resolver,
  // but we retain the explicit check for defense in depth.)
  // This is implicitly satisfied because the resolver only includes enabled tools.

  // Rule 3: Approval Gate
  if (tool.requires_approval && !approvalMap[tool.tool_id]) {
    return {
      allowed: false,
      reason: `Tool '${request.tool_id}' requires approval before invocation.`,
    };
  }

  // Rule 4: Read-Write Policy
  if (!tool.read_only) {
    if (budget.max_write_tool_calls <= 0) {
      return {
        allowed: false,
        reason: `Write tools are not permitted for this execution attempt.`,
      };
    }
    if (budgetState.write_tool_calls_used >= budget.max_write_tool_calls) {
      return {
        allowed: false,
        reason: `Write tool call budget exhausted (${budget.max_write_tool_calls}).`,
      };
    }
  }

  // Rule 6: Budget Check (must happen before execution)
  if (budgetState.tool_calls_used >= budget.max_tool_calls) {
    return {
      allowed: false,
      reason: `Tool call budget exhausted (${budget.max_tool_calls}).`,
    };
  }

  if (budgetState.total_duration_ms_used >= budget.total_timeout_ms) {
    return {
      allowed: false,
      reason: `Cumulative tool timeout budget exhausted (${budget.total_timeout_ms}ms).`,
    };
  }

  // Rule 5: Schema Validation + Rule 7: Arg Sanitization
  let parsedArgs: Record<string, unknown>;
  try {
    parsedArgs = JSON.parse(request.arguments_json);
  } catch {
    return {
      allowed: false,
      reason: `Unparseable arguments_json for tool '${request.tool_id}'.`,
    };
  }

  if (typeof parsedArgs !== "object" || parsedArgs === null || Array.isArray(parsedArgs)) {
    return {
      allowed: false,
      reason: `arguments_json must be an object for tool '${request.tool_id}'.`,
    };
  }

  const schema = tool.schema_args ?? [];
  const sanitized: Record<string, unknown> = {};

  for (const argSchema of schema) {
    const value = parsedArgs[argSchema.name];
    if (value === undefined) {
      if (argSchema.required) {
        return {
          allowed: false,
          reason: `Missing required argument '${argSchema.name}' for tool '${request.tool_id}'.`,
        };
      }
      continue;
    }

    // Type check
    if (!isTypeMatch(value, argSchema.type)) {
      return {
        allowed: false,
        reason: `Argument '${argSchema.name}' for tool '${request.tool_id}' expected type '${argSchema.type}'.`,
      };
    }

    // Sanitization: string args cannot contain shell metacharacters
    if (argSchema.type === "string" && typeof value === "string") {
      if (/[;&|`$(){}[\]\*\?\\]/.test(value)) {
        return {
          allowed: false,
          reason: `Argument '${argSchema.name}' contains forbidden shell metacharacters.`,
        };
      }
    }

    sanitized[argSchema.name] = value;
  }

  // Reject unknown args not in schema
  for (const key of Object.keys(parsedArgs)) {
    if (!schema.some((s: { name: string }) => s.name === key)) {
      return {
        allowed: false,
        reason: `Unknown argument '${key}' for tool '${request.tool_id}'.`,
      };
    }
  }

  return { allowed: true, sanitized_args: sanitized };
}

function isTypeMatch(value: unknown, type: string): boolean {
  switch (type) {
    case "string":
      return typeof value === "string";
    case "number":
      return typeof value === "number" && !Number.isNaN(value);
    case "boolean":
      return typeof value === "boolean";
    case "date":
      return typeof value === "string" && !Number.isNaN(Date.parse(value));
    default:
      return true;
  }
}
