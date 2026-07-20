/** Host-agnostic MCP projection of the canonical management service. */

import type {
  CanonicalCatalogRecord,
  InvocationIntent,
  MaterializationAdmission,
  MaterializationEnvelope,
  MaterializationRevocation,
} from "@narada2/invokable-intelligence-contract";
import type { ResolverContext } from "@narada2/invokable-intelligence-resolver";

import { deployManagementBundle } from "./deployment.js";
import type { ManagementDeploymentBundle } from "./deployment.js";
import {
  MANAGEMENT_AUTHORITY_LOCI,
  MANAGEMENT_MUTATION_CONTEXT_SCHEMA,
  IntelligenceManagementService,
  ManagementError,
  managementErrorResult,
} from "./service.js";
import type {
  ManagementCollection,
  ManagementMutationContext,
  ManagementSession,
} from "./service.js";

export interface ManagementToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  handler: (input: Record<string, unknown>) => Promise<unknown>;
}

const COLLECTIONS: ManagementCollection[] = [
  "resources", "offerings", "assertions", "policies", "catalog-records", "routes",
  "topologies", "authority-statements", "access", "materializations", "materialization-audit",
];
const ENTITIES = ["resource", "assertion", "policy", "catalog-record", "materialization"] as const;

function collection(value: unknown): ManagementCollection {
  if (typeof value !== "string" || !COLLECTIONS.includes(value as ManagementCollection)) {
    throw new ManagementError("invalid-collection", "Expected a canonical management collection.");
  }
  return value as ManagementCollection;
}

function entity(value: unknown): typeof ENTITIES[number] {
  if (typeof value !== "string" || !ENTITIES.includes(value as typeof ENTITIES[number])) {
    throw new ManagementError("invalid-entity", "Expected a canonical management entity kind.");
  }
  return value as typeof ENTITIES[number];
}

const MUTATION_CONTEXT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    schema: { const: MANAGEMENT_MUTATION_CONTEXT_SCHEMA },
    actor_id: { type: "string" },
    principal_id: { type: "string" },
    consent_ref: { type: "string" },
    authority: {
      type: "object",
      additionalProperties: false,
      properties: {
        site_id: { type: "string" },
        locus: { type: "string", enum: MANAGEMENT_AUTHORITY_LOCI },
        authority_ref: { type: "string" },
      },
      required: ["site_id", "locus", "authority_ref"],
    },
    destination_site_id: { type: "string" },
    target_site_id: { type: "string" },
    decided_at: { type: "string" },
    evidence_refs: { type: "array", minItems: 1, items: { type: "string" } },
  },
  required: [
    "schema",
    "actor_id",
    "principal_id",
    "consent_ref",
    "authority",
    "destination_site_id",
    "target_site_id",
    "decided_at",
    "evidence_refs",
  ],
} as const;

async function resolveRef<T>(session: ManagementSession, value: unknown): Promise<T> {
  if (typeof value !== "string" || value.length === 0) {
    throw new ManagementError("input-reference-required", "The operation requires an immutable JSON input reference.");
  }
  if (!session.resolveInputRef) {
    throw new ManagementError("input-reference-unavailable", "This MCP host has no immutable input-reference resolver.");
  }
  return await session.resolveInputRef(value) as T;
}

function mutationContext(value: unknown): ManagementMutationContext {
  if (!value || typeof value !== "object") {
    throw new ManagementError("invalid-mutation-context", "Mutation context is required.");
  }
  return value as ManagementMutationContext;
}

export function createManagementTools(session: ManagementSession): ManagementToolDefinition[] {
  const service = new IntelligenceManagementService(session);
  const wrap = (fn: () => Promise<unknown>) => Promise.resolve().then(fn).catch(managementErrorResult);

  return [
    {
      name: "intelligence_management_list",
      description: "List canonical intelligence resources, offerings, policies, access, topology, or materializations with bounded paging.",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        properties: {
          collection: { type: "string", enum: COLLECTIONS },
          filter: { type: "object" },
          offset: { type: "integer", minimum: 0 },
          limit: { type: "integer", minimum: 1, maximum: 100 },
        },
        required: ["collection"],
      },
      handler: (input) => wrap(() => service.execute({
        operation: "list",
        collection: collection(input.collection),
        ...(input.filter && typeof input.filter === "object" ? { filter: input.filter as Record<string, unknown> } : {}),
        page: {
          ...(typeof input.offset === "number" ? { offset: input.offset } : {}),
          ...(typeof input.limit === "number" ? { limit: input.limit } : {}),
        },
      })),
    },
    {
      name: "intelligence_management_show",
      description: "Show one canonical entity and its linked relations or materialization audit.",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        properties: { entity: { type: "string", enum: ENTITIES }, id: { type: "string" } },
        required: ["entity", "id"],
      },
      handler: (input) => wrap(() => service.execute({
        operation: "show",
        entity: entity(input.entity),
        id: String(input.id),
      })),
    },
    {
      name: "intelligence_management_validate",
      description: "Validate canonical registry, catalog, and materialized projections.",
      inputSchema: { type: "object", additionalProperties: false, properties: {} },
      handler: () => wrap(() => service.execute({ operation: "validate" })),
    },
    {
      name: "intelligence_management_deploy",
      description: "Deploy one complete digest-bound Site catalog and its authorized foreign materializations from an immutable bundle reference.",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        properties: { bundle_ref: { type: "string" } },
        required: ["bundle_ref"],
      },
      handler: (input) => wrap(async () => deployManagementBundle(
        session,
        await resolveRef<ManagementDeploymentBundle>(session, input.bundle_ref),
      )),
    },
    {
      name: "intelligence_management_admit_catalog_record",
      description: "Admit one same-locus canonical record from an immutable reference with explicit authority and evidence.",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        properties: { record_ref: { type: "string" }, context: MUTATION_CONTEXT_SCHEMA },
        required: ["record_ref", "context"],
      },
      handler: (input) => wrap(async () => service.execute({
        operation: "admit-catalog-record",
        record: await resolveRef<CanonicalCatalogRecord>(session, input.record_ref),
        context: mutationContext(input.context),
      })),
    },
    {
      name: "intelligence_management_explain_resolution",
      description: "Resolve an immutable intent reference at an explicit time and explain the plan or refusal.",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        properties: {
          resolver: { type: "string", enum: ["local", "cloudflare"] },
          intent_ref: { type: "string" },
          context_ref: { type: "string" },
        },
        required: ["resolver", "intent_ref", "context_ref"],
      },
      handler: (input) => wrap(async () => service.execute({
        operation: "explain-resolution",
        resolver: input.resolver as "local" | "cloudflare",
        intent: await resolveRef<InvocationIntent>(session, input.intent_ref),
        context: await resolveRef<ResolverContext>(session, input.context_ref),
      })),
    },
    ...(["materialize", "refresh"] as const).map((operation): ManagementToolDefinition => ({
      name: `intelligence_management_${operation.replaceAll("-", "_")}`,
      description: `${operation} one cross-locus envelope through the dedicated materialization authority.`,
      inputSchema: {
        type: "object",
        additionalProperties: false,
        properties: {
          envelope_ref: { type: "string" },
          admission_ref: { type: "string" },
          statement_record_ref: { type: "string" },
          payload_record_ref: { type: "string" },
          context: MUTATION_CONTEXT_SCHEMA,
        },
        required: ["envelope_ref", "admission_ref", "statement_record_ref", "payload_record_ref", "context"],
      },
      handler: (input) => wrap(async () => service.execute({
        operation,
        envelope: await resolveRef<MaterializationEnvelope>(session, input.envelope_ref),
        admission: await resolveRef<MaterializationAdmission>(session, input.admission_ref),
        statement_record: await resolveRef<CanonicalCatalogRecord>(session, input.statement_record_ref),
        payload_record: await resolveRef<CanonicalCatalogRecord>(session, input.payload_record_ref),
        context: mutationContext(input.context),
      })),
    })),
    {
      name: "intelligence_management_reject_materialization",
      description: "Record a rejected or deferred destination admission without loading foreign records.",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        properties: {
          envelope_ref: { type: "string" },
          admission_ref: { type: "string" },
          context: MUTATION_CONTEXT_SCHEMA,
        },
        required: ["envelope_ref", "admission_ref", "context"],
      },
      handler: (input) => wrap(async () => service.execute({
        operation: "reject-materialization",
        envelope: await resolveRef<MaterializationEnvelope>(session, input.envelope_ref),
        admission: await resolveRef<MaterializationAdmission>(session, input.admission_ref),
        context: mutationContext(input.context),
      })),
    },
    {
      name: "intelligence_management_revoke_materialization",
      description: "Apply an origin-authorized revocation from an immutable reference.",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        properties: { revocation_ref: { type: "string" }, context: MUTATION_CONTEXT_SCHEMA },
        required: ["revocation_ref", "context"],
      },
      handler: (input) => wrap(async () => service.execute({
        operation: "revoke-materialization",
        revocation: await resolveRef<MaterializationRevocation>(session, input.revocation_ref),
        context: mutationContext(input.context),
      })),
    },
    ...(["inspect-materialization", "explain-materialization"] as const).map((operation): ManagementToolDefinition => ({
      name: `intelligence_management_${operation.replaceAll("-", "_")}`,
      description: `${operation} with preserved origin, destination, transition, and evidence readback.`,
      inputSchema: {
        type: "object",
        additionalProperties: false,
        properties: { projection_key: { type: "string" }, envelope_id: { type: "string" } },
      },
      handler: (input) => wrap(() => service.execute({
        operation,
        ...(typeof input.projection_key === "string" ? { projection_key: input.projection_key } : {}),
        ...(typeof input.envelope_id === "string" ? { envelope_id: input.envelope_id } : {}),
      })),
    })),
  ];
}
