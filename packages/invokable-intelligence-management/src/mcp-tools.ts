/**
 * Host-agnostic MCP tool surface for intelligence management. A host
 * (typed-mcp surface, stdio server, worker harness) registers these
 * definitions and routes calls to the handlers. Every handler returns
 * structured data; errors come back as { error: { code, message } }.
 */

import type { InvocationIntent, ResourceRef } from "@narada2/invokable-intelligence-contract";

import { projectLegacyRegistry } from "./compat.js";
import { explainResolution, listAssertions, listPolicies, listResources, showResource, validateStore } from "./operations.js";
import type { ManagementSession } from "./operations.js";

export interface ManagementToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  handler: (input: Record<string, unknown>) => Promise<unknown>;
}

function siteRef(value: unknown): ResourceRef {
  if (typeof value !== "string" || !value.startsWith("site:")) {
    throw new Error(`expected a site:<slug> reference, got ${String(value)}`);
  }
  return { kind: "site", id: value };
}

export function createManagementTools(session: ManagementSession): ManagementToolDefinition[] {
  const wrap = (fn: () => Promise<unknown>) =>
    fn().catch((error: unknown) => ({
      error: { code: error instanceof Error && "code" in error ? String((error as { code: unknown }).code) : "internal", message: error instanceof Error ? error.message : String(error) },
    }));

  return [
    {
      name: "intelligence_list_resources",
      description: "List intelligence registry resources, optionally filtered by kind.",
      inputSchema: { type: "object", properties: { kind: { type: "string" } } },
      handler: (input) =>
        wrap(() =>
          listResources(session, input.kind ? { kind: input.kind as never } : undefined),
        ),
    },
    {
      name: "intelligence_show_resource",
      description: "Show one resource with its derived typed relations.",
      inputSchema: { type: "object", properties: { id: { type: "string" } }, required: ["id"] },
      handler: (input) => wrap(() => showResource(session, String(input.id))),
    },
    {
      name: "intelligence_list_assertions",
      description: "List capability assertions with provenance, filterable by subject/family/locus/site.",
      inputSchema: {
        type: "object",
        properties: {
          subjectId: { type: "string" },
          family: { type: "string" },
          name: { type: "string" },
          locus: { type: "string" },
          siteId: { type: "string" },
          includeSuperseded: { type: "boolean" },
        },
      },
      handler: (input) =>
        wrap(() =>
          listAssertions(session, {
            ...(input.subjectId ? { subjectId: String(input.subjectId) } : {}),
            ...(input.family ? { family: String(input.family) } : {}),
            ...(input.name ? { name: String(input.name) } : {}),
            ...(input.locus ? { locus: input.locus as never } : {}),
            ...(input.siteId ? { siteId: String(input.siteId) } : {}),
            ...(input.includeSuperseded ? { includeSuperseded: true } : {}),
          }),
        ),
    },
    {
      name: "intelligence_list_policies",
      description: "List policy documents, filterable by locus/site/kind.",
      inputSchema: {
        type: "object",
        properties: { locus: { type: "string" }, siteId: { type: "string" }, kind: { type: "string" } },
      },
      handler: (input) =>
        wrap(() =>
          listPolicies(session, {
            ...(input.locus ? { locus: input.locus as never } : {}),
            ...(input.siteId ? { siteId: String(input.siteId) } : {}),
            ...(input.kind ? { kind: input.kind as never } : {}),
          }),
        ),
    },
    {
      name: "intelligence_validate_store",
      description: "Validate every registry record and cross-reference against the contract.",
      inputSchema: { type: "object", properties: {} },
      handler: () =>
        wrap(async () => {
          const errors = await validateStore(session);
          return { ok: errors.length === 0, errors };
        }),
    },
    {
      name: "intelligence_explain_resolution",
      description: "Resolve an intent and explain the plan or refusal with full provenance.",
      inputSchema: {
        type: "object",
        properties: {
          intent: { type: "object" },
          targetSite: { type: "string" },
          userSite: { type: "string" },
          hostSite: { type: "string" },
          time: { type: "string" },
        },
        required: ["intent", "targetSite", "userSite", "hostSite"],
      },
      handler: (input) =>
        wrap(() =>
          explainResolution(session, input.intent as unknown as InvocationIntent, {
            targetSite: siteRef(input.targetSite),
            userSite: siteRef(input.userSite),
            hostSite: siteRef(input.hostSite),
            runtime: "node",
            time: typeof input.time === "string" ? input.time : new Date().toISOString(),
          }),
        ),
    },
    {
      name: "intelligence_compat_projection",
      description: "Read-only legacy provider-registry projection (temporary, for unmigrated consumers).",
      inputSchema: { type: "object", properties: {} },
      handler: () => wrap(() => projectLegacyRegistry(session.store)),
    },
  ];
}
