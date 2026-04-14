/**
 * Coordinator Binding Contracts
 *
 * Mailbox-to-charter attachments, invocation policies, knowledge sources,
 * tool bindings, and top-level coordinator configuration.
 *
 * Spec: .ai/tasks/20260413-007-foreman-and-charters-architecture.md
 * Spec: .ai/tasks/20260413-008-mailbox-charter-knowledge-sources.md
 * Spec: .ai/tasks/20260413-011-charter-tool-bindings.md
 * Spec: .ai/tasks/20260413-012-coordinator-state-and-foreman-handoff.md
 */

import type { KnowledgeSourceRef } from "./knowledge.js";

export type CharterId = "support_steward" | "obligation_keeper";

export type InvocationMode = "always" | "conditional" | "manual";

/** Policy controlling when a charter is invoked for a thread */
export interface CharterInvocationPolicy {
  charter_id: CharterId;
  mode: InvocationMode;
  trigger_tags?: string[];
}

/** Argument schema for tool invocation */
export interface ToolArgSchema {
  name: string;
  type: "string" | "number" | "boolean" | "date";
  required: boolean;
  description: string;
}

/** Tool source types */
export type ToolSourceType = "local_executable" | "http_endpoint" | "docker_image";

/** Global tool definition (deployment/repo specific) */
export interface ToolDefinition {
  id: string;
  source_type: ToolSourceType;
  repo_root?: string;
  working_directory?: string;
  executable_path?: string;
  url?: string;
  docker_image?: string;
  schema_args?: ToolArgSchema[];
}

/** Binding of a tool to a charter within a mailbox */
export interface ToolBinding {
  tool_id: string;
  enabled: boolean;
  purpose: string;
  read_only: boolean;
  timeout_ms: number;
  allowed_env_vars?: string[];
  requires_approval: boolean;
  working_directory_override?: string;
}

/** Canonical mailbox-to-coordinator binding */
export interface MailboxBinding {
  mailbox_id: string;
  available_charters: CharterId[];
  default_primary_charter: CharterId;
  invocation_policies: CharterInvocationPolicy[];
  knowledge_sources: Record<CharterId, KnowledgeSourceRef[]>;
  charter_tools: Record<CharterId, ToolBinding[]>;
}

/** @deprecated Use MailboxBinding */
export type MailboxCharterBinding = MailboxBinding;

/** Top-level coordinator configuration envelope */
export interface CoordinatorConfig {
  foreman_id: string;
  mailbox_bindings: Record<string, MailboxBinding>;
  global_escalation_precedence: string[];
  tool_definitions: Record<string, ToolDefinition>;
}

/**
 * Validate a mailbox binding.
 */
export function validateMailboxBinding(
  binding: unknown,
): binding is MailboxBinding {
  if (typeof binding !== "object" || binding === null) return false;
  const b = binding as Record<string, unknown>;

  if (typeof b.mailbox_id !== "string" || b.mailbox_id.length === 0) return false;
  if (!Array.isArray(b.available_charters)) return false;
  if (b.available_charters.length === 0) return false;
  if (
    b.available_charters.some(
      (c: unknown) => typeof c !== "string" || c.length === 0,
    )
  ) {
    return false;
  }

  if (
    typeof b.default_primary_charter !== "string" ||
    !b.available_charters.includes(b.default_primary_charter)
  ) {
    return false;
  }

  if (!Array.isArray(b.invocation_policies)) return false;
  for (const policy of b.invocation_policies as unknown[]) {
    if (typeof policy !== "object" || policy === null) return false;
    const p = policy as Record<string, unknown>;
    if (typeof p.charter_id !== "string") return false;
    if (!["always", "conditional", "manual"].includes(p.mode as string)) {
      return false;
    }
    if (
      p.trigger_tags !== undefined &&
      (!Array.isArray(p.trigger_tags) ||
        p.trigger_tags.some((t: unknown) => typeof t !== "string"))
    ) {
      return false;
    }
  }

  if (typeof b.knowledge_sources !== "object" || b.knowledge_sources === null) {
    return false;
  }

  if (typeof b.charter_tools !== "object" || b.charter_tools === null) {
    return false;
  }

  return true;
}

/** @deprecated Use validateMailboxBinding */
export const validateMailboxCharterBinding = validateMailboxBinding;
