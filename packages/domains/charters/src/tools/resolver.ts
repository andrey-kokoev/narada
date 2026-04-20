/**
 * Tool Catalog Resolver
 *
 * Resolves the effective runtime capability envelope for a charter
 * execution attempt from coordinator configuration.
 *
 * Spec: .ai/tasks/20260414-007-assignment-agent-c-tool-binding-runtime.md
 */

import type { CoordinatorConfig, ToolBinding, AuthorityClass } from "../types/coordinator.js";
import { validateToolBindingAuthority } from "../types/coordinator.js";
import type { KnowledgeSourceRef } from "../types/knowledge.js";
import type { AllowedAction, ToolCatalogEntry } from "../runtime/envelope.js";

export interface KnowledgeCatalogEntry {
  source_id: string;
  kind: "doc" | "playbook" | "sqlite_history" | "custom";
  description: string;
  content_ref?: string;
}

export interface SideEffectBudget {
  max_tool_calls: number;
  max_write_tool_calls: number;
  total_timeout_ms: number;
}

export interface RuntimeCapabilityEnvelope {
  available_tools: ToolCatalogEntry[];
  available_knowledge_sources: KnowledgeCatalogEntry[];
  allowed_actions: AllowedAction[];
  side_effect_budget: SideEffectBudget;
}

export interface CatalogResolverOptions {
  /** Dynamic foreman overrides: tool_ids to remove from catalog */
  removed_tool_ids?: string[];
  /** Dynamic foreman overrides: tool_ids to require approval regardless of binding */
  force_approval_tool_ids?: string[];
  /** Default allowed actions if binding doesn't specify */
  defaultAllowedActions?: AllowedAction[];
}

/**
 * Resolve the runtime capability envelope for a single execution attempt.
 */
export function resolveToolCatalog(
  mailboxId: string,
  charterId: string,
  config: CoordinatorConfig,
  opts: CatalogResolverOptions = {},
): RuntimeCapabilityEnvelope {
  const binding = config.mailbox_bindings[mailboxId];
  if (!binding) {
    return makeEmptyEnvelope(opts.defaultAllowedActions);
  }

  const charterTools = (binding.charter_tools as Record<string, ToolBinding[]>)[charterId] ?? [];
  const knowledgeSources = (binding.knowledge_sources as Record<string, KnowledgeSourceRef[]>)[charterId] ?? [];

  const removedSet = new Set(opts.removed_tool_ids ?? []);
  const forceApprovalSet = new Set(opts.force_approval_tool_ids ?? []);

  const availableTools: ToolCatalogEntry[] = [];
  for (const toolBinding of charterTools) {
    if (removedSet.has(toolBinding.tool_id)) continue;
    if (!toolBinding.enabled) continue;

    const authError = validateToolBindingAuthority(toolBinding);
    if (authError) {
      // Skip tools with invalid authority rather than silently including them.
      // This makes the envelope conservative: broken bindings produce empty slots
      // that are visible in the catalog length mismatch.
      continue;
    }

    const definition = config.tool_definitions[toolBinding.tool_id];

    availableTools.push({
      tool_id: toolBinding.tool_id,
      tool_signature: `${toolBinding.tool_id}@v1`,
      description: toolBinding.purpose,
      read_only: toolBinding.read_only,
      requires_approval: toolBinding.requires_approval || forceApprovalSet.has(toolBinding.tool_id),
      schema_args: definition?.schema_args ?? toolBinding.allowed_env_vars?.map((name: string) => ({
        name,
        type: "string" as const,
        required: false,
        description: `Environment variable ${name}`,
      })),
      timeout_ms: toolBinding.timeout_ms,
      authority_class: toolBinding.authority_class as AuthorityClass,
    });
  }

  const availableKnowledge: KnowledgeCatalogEntry[] = [];
  for (const source of knowledgeSources) {
    // Disabled sources are treated as stale and omitted
    if (!source.enabled) continue;
    availableKnowledge.push({
      source_id: source.id,
      kind: mapKnowledgeTypeToKind(source.type),
      description: source.purpose ?? `Knowledge source ${source.id}`,
      content_ref: undefined,
    });
  }

  function mapKnowledgeTypeToKind(type: string): KnowledgeCatalogEntry["kind"] {
    switch (type) {
      case "url":
        return "doc";
      case "local_path":
        return "playbook";
      case "sqlite":
        return "sqlite_history";
      default:
        return "custom";
    }
  }

  const writeToolCount = availableTools.filter((t) => !t.read_only).length;

  return {
    available_tools: availableTools,
    available_knowledge_sources: availableKnowledge,
    allowed_actions: opts.defaultAllowedActions ?? ["no_action"],
    side_effect_budget: {
      max_tool_calls: 10,
      max_write_tool_calls: writeToolCount > 0 ? 3 : 0,
      total_timeout_ms: availableTools.reduce((sum, t) => sum + t.timeout_ms, 0) || 30000,
    },
  };
}

function makeEmptyEnvelope(defaultAllowedActions?: AllowedAction[]): RuntimeCapabilityEnvelope {
  return {
    available_tools: [],
    available_knowledge_sources: [],
    allowed_actions: defaultAllowedActions ?? ["no_action"],
    side_effect_budget: {
      max_tool_calls: 0,
      max_write_tool_calls: 0,
      total_timeout_ms: 0,
    },
  };
}
