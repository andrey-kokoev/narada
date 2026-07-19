/**
 * Management operations over a registry store. Reads are open; writes are
 * locus-checked: records scoped to a Site other than the session's owning
 * Site are rejected unless performed through the explicit authorized
 * materialization operation.
 */

import type {
  CapabilityAssertion,
  ContractError,
  PolicyDocument,
  Resource,
  ResourceId,
  ResourceRef,
} from "@narada2/invokable-intelligence-contract";
import { validateBundle } from "@narada2/invokable-intelligence-contract";
import type { AssertionFilter, IntelligenceRegistryStore, PolicyFilter, RelationRow, ResourceFilter } from "@narada2/invokable-intelligence-registry";
import { resolveInvocation } from "@narada2/invokable-intelligence-resolver";
import type { ResolverContext } from "@narada2/invokable-intelligence-resolver";
import type { InvocationIntent, InvocationPlan, InvocationRefusal } from "@narada2/invokable-intelligence-contract";

export class ManagementError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "ManagementError";
    this.code = code;
  }
}

export interface ManagementSession {
  store: IntelligenceRegistryStore;
  /** The Site this management session belongs to. Cross-locus writes need materialization. */
  owningSite: ResourceRef;
}

export async function listResources(session: ManagementSession, filter?: ResourceFilter): Promise<Resource[]> {
  return session.store.listResources(filter);
}

export async function showResource(
  session: ManagementSession,
  id: ResourceId,
): Promise<{ resource: Resource; relations: RelationRow[] } | null> {
  const resource = await session.store.getResource(id);
  if (!resource) return null;
  return { resource, relations: await session.store.listRelations(id) };
}

export async function listAssertions(session: ManagementSession, filter?: AssertionFilter): Promise<CapabilityAssertion[]> {
  return session.store.listAssertions(filter);
}

export async function listPolicies(session: ManagementSession, filter?: PolicyFilter): Promise<PolicyDocument[]> {
  return session.store.listPolicies(filter);
}

/** Validate every record in the store against the contract, plus reference integrity. */
export async function validateStore(session: ManagementSession): Promise<ContractError[]> {
  const [resources, assertions, policies] = await Promise.all([
    session.store.listResources(),
    session.store.listAssertions({ includeSuperseded: true }),
    session.store.listPolicies(),
  ]);
  return validateBundle({ resources, assertions, policies });
}

export interface ResolutionExplanation {
  result: InvocationPlan | InvocationRefusal;
  lines: string[];
}

/** Resolve an intent and explain the outcome in operator-readable lines. */
export async function explainResolution(
  session: ManagementSession,
  intent: InvocationIntent,
  context: ResolverContext,
): Promise<ResolutionExplanation> {
  const result = await resolveInvocation(intent, context, { store: session.store });
  const lines: string[] = [];
  if (result.schema === "narada.invokable-intelligence.invocation-plan.v1") {
    lines.push(`plan ${result.id} (resolver ${result.resolver_version})`);
    lines.push(`selected model ${result.selected.model.id} via ${result.selected.endpoint.id}`);
    lines.push(`options ${JSON.stringify(result.options)}`);
    for (const entry of result.provenance.applied_constraints) lines.push(`constraint: ${entry.source} — ${entry.effect}`);
    for (const entry of result.provenance.applied_preferences) lines.push(`preference: ${entry.source} — ${entry.effect}`);
    for (const entry of result.provenance.applied_defaults) lines.push(`default: ${entry.source} — ${entry.effect}`);
    for (const rejected of result.provenance.rejected_candidates) {
      lines.push(`rejected ${rejected.candidate.id}: ${rejected.reasons.join("; ")}`);
    }
  } else {
    lines.push(`refusal ${result.id}: ${result.reason_code} — ${result.explanation}`);
    for (const rejected of result.rejected_candidates) {
      lines.push(`rejected ${rejected.candidate.id}: ${rejected.reasons.join("; ")}`);
    }
  }
  return { result, lines };
}

function recordLocusSiteId(record: CapabilityAssertion | PolicyDocument): ResourceId | null {
  if ("rules" in record) return record.site.id;
  return record.scope.site?.id ?? null;
}

/**
 * Locus-checked write. Rejects records scoped to a foreign Site; same-Site
 * writes pass. For cross-locus effects use materializeRecord.
 */
export async function writeRecord(session: ManagementSession, record: CapabilityAssertion | PolicyDocument): Promise<void> {
  const siteId = recordLocusSiteId(record);
  if (siteId !== null && siteId !== session.owningSite.id) {
    throw new ManagementError(
      "cross-locus-write",
      `record is scoped to '${siteId}' but this session owns '${session.owningSite.id}'; use explicit materialization`,
    );
  }
  if ("rules" in record) await session.store.putPolicy(record);
  else await session.store.putAssertion(record);
}

/**
 * The explicit authorized materialization operation: admits a record scoped
 * to a foreign locus, stamped with materialization provenance so the
 * cross-locus effect is auditable rather than silent.
 */
export async function materializeRecord(
  session: ManagementSession,
  record: CapabilityAssertion | PolicyDocument,
  authority: { actor: string; reference: string },
): Promise<void> {
  const stamped: CapabilityAssertion | PolicyDocument = "rules" in record
    ? record
    : {
        ...record,
        provenance: {
          source: "operator",
          recorded_at: new Date().toISOString(),
          actor: authority.actor,
          reference: `explicit-materialization:${authority.reference}`,
        },
      };
  if ("rules" in stamped) await session.store.putPolicy(stamped);
  else await session.store.putAssertion(stamped);
}
