/** Typed library projections over the canonical management application service. */

import type {
  CapabilityAssertion,
  InvocationIntent,
  InvocationPlan,
  InvocationRefusal,
  PolicyDocument,
  Resource,
  ResourceId,
} from "@narada2/invokable-intelligence-contract";
import type {
  AssertionFilter,
  PolicyFilter,
  RelationRow,
  ResourceFilter,
} from "@narada2/invokable-intelligence-registry";
import type { ResolverContext } from "@narada2/invokable-intelligence-resolver";

import { IntelligenceManagementService } from "./service.js";
import type {
  ManagementDiagnostic,
  ManagementSession,
} from "./service.js";

interface PageData<T> { items: T[] }

export async function listResources(
  session: ManagementSession,
  filter?: ResourceFilter,
): Promise<Resource[]> {
  const response = await new IntelligenceManagementService(session).execute({
    operation: "list",
    collection: "resources",
    ...(filter ? { filter: { ...filter } } : {}),
    page: { limit: 100 },
  });
  return (response.data as PageData<Resource>).items;
}

export async function showResource(
  session: ManagementSession,
  id: ResourceId,
): Promise<{ resource: Resource; relations: RelationRow[] } | null> {
  try {
    const response = await new IntelligenceManagementService(session).execute({
      operation: "show",
      entity: "resource",
      id,
    });
    return response.data as { resource: Resource; relations: RelationRow[] };
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "not-found") return null;
    throw error;
  }
}

export async function listAssertions(
  session: ManagementSession,
  filter?: AssertionFilter,
): Promise<CapabilityAssertion[]> {
  const response = await new IntelligenceManagementService(session).execute({
    operation: "list",
    collection: "assertions",
    ...(filter ? { filter: { ...filter } } : {}),
    page: { limit: 100 },
  });
  return (response.data as PageData<CapabilityAssertion>).items;
}

export async function listPolicies(
  session: ManagementSession,
  filter?: PolicyFilter,
): Promise<PolicyDocument[]> {
  const response = await new IntelligenceManagementService(session).execute({
    operation: "list",
    collection: "policies",
    ...(filter ? { filter: { ...filter } } : {}),
    page: { limit: 100 },
  });
  return (response.data as PageData<PolicyDocument>).items;
}

export async function validateStore(session: ManagementSession): Promise<ManagementDiagnostic[]> {
  const response = await new IntelligenceManagementService(session).execute({ operation: "validate" });
  return (response.data as { diagnostics: ManagementDiagnostic[] }).diagnostics;
}

export interface ResolutionExplanation {
  result: InvocationPlan | InvocationRefusal;
  lines: string[];
}

export async function explainResolution(
  session: ManagementSession,
  resolver: "local" | "cloudflare",
  intent: InvocationIntent,
  context: ResolverContext,
): Promise<ResolutionExplanation> {
  const response = await new IntelligenceManagementService(session).execute({
    operation: "explain-resolution",
    resolver,
    intent,
    context,
  });
  return response.data as ResolutionExplanation;
}

export {
  IntelligenceManagementService,
  ManagementError,
  managementErrorResult,
} from "./service.js";
export type {
  ManagementCollection,
  ManagementDiagnostic,
  ManagementErrorResult,
  ManagementMutationContext,
  ManagementMutationReceipt,
  ManagementRequest,
  ManagementResult,
  ManagementSession,
} from "./service.js";
