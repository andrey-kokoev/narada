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

/** Explicit operational requirement for bootstrap/preflight tooling. */
export type OperationalRequirement =
  | {
      kind: "env_var";
      name: string;
      description: string;
      optional?: boolean;
    }
  | {
      kind: "directory";
      path: string;
      description: string;
      create_if_missing?: boolean;
      optional?: boolean;
    }
  | {
      kind: "local_file";
      path: string;
      description: string;
      optional?: boolean;
    }
  | {
      kind: "local_executable";
      command: string;
      description: string;
      working_directory?: string;
      optional?: boolean;
    }
  | {
      kind: "http_endpoint";
      url: string;
      description: string;
      optional?: boolean;
    };

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
  setup_requirements?: OperationalRequirement[];
}

export const AUTHORITY_CLASSES = [
  "derive",
  "propose",
  "claim",
  "execute",
  "resolve",
  "confirm",
  "admin",
] as const;

export type AuthorityClass = (typeof AUTHORITY_CLASSES)[number];

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
  authority_class: AuthorityClass;
}

/** Runtime-only authority classes that require Narada runtime authorization. */
export const RUNTIME_AUTHORITY_CLASSES: AuthorityClass[] = [
  "claim",
  "execute",
  "resolve",
  "confirm",
];

/** Domain/compiler-safe authority classes. */
export const DERIVER_AUTHORITY_CLASSES: AuthorityClass[] = ["derive", "propose"];

/**
 * Validate that a tool binding has a canonical authority class.
 * Returns an error string if invalid, undefined if valid.
 */
export function validateToolBindingAuthority(
  binding: ToolBinding,
): string | undefined {
  if (!binding.authority_class) {
    return `Tool binding ${binding.tool_id} is missing authority_class`;
  }
  if (!AUTHORITY_CLASSES.includes(binding.authority_class)) {
    return `Tool binding ${binding.tool_id} has invalid authority_class: ${binding.authority_class}`;
  }
  return undefined;
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

function makeImplicitRequirement(definition: ToolDefinition): OperationalRequirement | null {
  if (definition.source_type === "local_executable" && definition.executable_path) {
    return {
      kind: "local_executable",
      command: definition.executable_path,
      description: `Executable for tool ${definition.id}`,
      working_directory: definition.working_directory,
    };
  }

  if (definition.source_type === "http_endpoint" && definition.url) {
    return {
      kind: "http_endpoint",
      url: definition.url,
      description: `HTTP endpoint for tool ${definition.id}`,
    };
  }

  return null;
}

function requirementKey(requirement: OperationalRequirement): string {
  switch (requirement.kind) {
    case "env_var":
      return `${requirement.kind}:${requirement.name}`;
    case "directory":
      return `${requirement.kind}:${requirement.path}`;
    case "local_file":
      return `${requirement.kind}:${requirement.path}`;
    case "local_executable":
      return `${requirement.kind}:${requirement.command}:${requirement.working_directory ?? ""}`;
    case "http_endpoint":
      return `${requirement.kind}:${requirement.url}`;
  }
}

/**
 * Collect explicit ops/bootstrap requirements induced by enabled tools
 * for a mailbox and optional charter subset.
 */
export function collectOperationalRequirements(
  config: CoordinatorConfig,
  mailboxId: string,
  charterIds?: CharterId[],
): OperationalRequirement[] {
  const binding = config.mailbox_bindings[mailboxId];
  if (!binding) return [];

  const targetCharters = charterIds ?? binding.available_charters;
  const seenToolIds = new Set<string>();
  const seenRequirements = new Set<string>();
  const collected: OperationalRequirement[] = [];

  for (const charterId of targetCharters) {
    const toolBindings = (binding.charter_tools as Record<string, ToolBinding[]>)[charterId] ?? [];
    for (const toolBinding of toolBindings) {
      if (!toolBinding.enabled) continue;
      if (seenToolIds.has(toolBinding.tool_id)) continue;
      seenToolIds.add(toolBinding.tool_id);

      const definition = config.tool_definitions[toolBinding.tool_id];
      if (!definition) continue;

      const implicit = makeImplicitRequirement(definition);
      const requirements = [
        ...(definition.setup_requirements ?? []),
        ...(implicit ? [implicit] : []),
      ];

      for (const requirement of requirements) {
        const key = requirementKey(requirement);
        if (seenRequirements.has(key)) continue;
        seenRequirements.add(key);
        collected.push(requirement);
      }
    }
  }

  return collected;
}

/** @deprecated Use validateMailboxBinding */
export const validateMailboxCharterBinding = validateMailboxBinding;
