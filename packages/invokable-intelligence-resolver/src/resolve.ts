/** Deterministic canonical offering/route/access/topology/authority resolution. */

import {
  PLAN_DECISION_SNAPSHOT_SCHEMA,
  planIntelligenceAuthorityApplication,
  validateAuthoritativeDecisionClock,
  validateInvocation,
} from "@narada2/invokable-intelligence-contract";
import type {
  CanonicalCatalogRecord,
  CatalogAccessRecord,
  CatalogTemporalInput,
  ContractError,
  IntelligenceAuthorityResolutionProvenance,
  IntelligenceAuthorityStatement,
  InvocationIntent,
  InvocationPlan,
  InvocationPrincipal,
  InvocationRefusal,
  InvocationRouteCandidate,
  MaterializedProjection,
  PlanDecisionSnapshot,
  PlanSnapshotDigests,
  PolicyDocument,
  PolicyLocus,
  ProvenanceEntry,
  RefusalReasonCode,
  RejectedCandidate,
  Resource,
  RouteCapabilityAssertion,
  ResolverMaterializedInputs,
} from "@narada2/invokable-intelligence-contract";
import type { IntelligenceRegistryStore } from "@narada2/invokable-intelligence-registry";

import { assembleCandidates, evaluateCandidate } from "./evaluate.js";
import type { CandidateEvaluation, ResolverContext } from "./types.js";
import { RESOLVER_VERSION, deterministicId, sha256Digest } from "./types.js";

export class ResolverError extends Error {
  readonly code: string;
  readonly contractErrors?: ContractError[];

  constructor(code: string, message: string, contractErrors?: ContractError[]) {
    super(message);
    this.name = "ResolverError";
    this.code = code;
    this.contractErrors = contractErrors;
  }
}

const LOCUS_ORDER: Record<PolicyLocus, number> = { "target-site": 0, "user-site": 1, "host-site": 2 };
const SELECTION_DEFAULT_KEYS = new Set(["route", "model_offering", "inference_provider"]);

interface CanonicalResolverState {
  records: CanonicalCatalogRecord[];
  resources: Resource[];
  policies: PolicyDocument[];
  routes: InvocationRouteCandidate[];
  routeAssertions: RouteCapabilityAssertion[];
  accessRecords: CatalogAccessRecord[];
  temporalInputs: CatalogTemporalInput[];
  authorityStatements: IntelligenceAuthorityStatement[];
  materializations: MaterializedProjection[];
}

function latestRecords(records: CanonicalCatalogRecord[]): CanonicalCatalogRecord[] {
  const current = new Map<string, CanonicalCatalogRecord>();
  for (const record of records) {
    const prior = current.get(record.record_id);
    if (!prior || record.revision > prior.revision || (record.revision === prior.revision && record.id.localeCompare(prior.id) > 0)) current.set(record.record_id, record);
  }
  return [...current.values()].sort((a, b) => a.record_id.localeCompare(b.record_id) || a.revision - b.revision || a.id.localeCompare(b.id));
}

function materializationForStatement(
  record: CanonicalCatalogRecord,
  recordsById: Map<string, CanonicalCatalogRecord>,
  destinationSiteId: string,
  materializedInputs: ResolverMaterializedInputs,
): MaterializedProjection | "local" | null {
  const statement = record.document as IntelligenceAuthorityStatement;
  const originSiteId = statement.origin.site_id ?? record.authority.site_id;
  if (!originSiteId || originSiteId === destinationSiteId) return "local";
  const payload = recordsById.get(statement.payload_ref);
  if (!payload) return null;
  return materializedInputs.admitted.find(({ envelope }) =>
    envelope.origin.site_id === originSiteId
    && envelope.origin.locus === statement.origin.locus
    && envelope.origin.authority_ref === statement.origin.authority_ref
    && envelope.destination.site_id === destinationSiteId
    && envelope.statement.id === statement.id
    && envelope.statement.kind === statement.kind
    && envelope.statement.effect === statement.effect
    && envelope.statement.source_revision === statement.revision
    && envelope.statement.payload_digest === payload.source.digest
  ) ?? null;
}

async function loadCanonicalState(
  store: IntelligenceRegistryStore,
  destinationSiteId: string,
  materializedInputs: ResolverMaterializedInputs,
): Promise<CanonicalResolverState> {
  const allRecords = latestRecords(await store.listCatalogRecords());
  const recordsById = new Map(allRecords.map((record) => [record.record_id, record]));
  const usableStatements: CanonicalCatalogRecord[] = [];
  const materializations: MaterializedProjection[] = [];
  for (const record of allRecords.filter(({ record_kind }) => record_kind === "authority-statement")) {
    const acquisition = materializationForStatement(record, recordsById, destinationSiteId, materializedInputs);
    if (!acquisition) continue;
    usableStatements.push(record);
    if (acquisition !== "local") materializations.push(acquisition);
  }
  const usablePayloadRefs = new Set(usableStatements.map(({ document }) =>
    (document as IntelligenceAuthorityStatement).payload_ref
  ));
  const records = allRecords.filter((record) => {
    if (record.record_kind === "authority-statement") return usableStatements.includes(record);
    if (record.record_kind === "policy" || record.record_kind === "assertion") {
      return usablePayloadRefs.has(record.record_id);
    }
    return true;
  });
  return {
    records,
    resources: records.filter(({ record_kind }) => record_kind === "resource").map(({ document }) => document as Resource),
    policies: records.filter(({ record_kind }) => record_kind === "policy").map(({ document }) => document as PolicyDocument),
    routes: records.filter(({ record_kind }) => record_kind === "route").map(({ document }) => document as InvocationRouteCandidate),
    routeAssertions: records
      .filter(({ record_kind, document }) => record_kind === "assertion" && document.schema === "narada.invokable-intelligence.route-capability-assertion.v1")
      .map(({ document }) => document as RouteCapabilityAssertion),
    accessRecords: records.filter(({ record_kind }) => record_kind === "access").map(({ document }) => document as CatalogAccessRecord),
    temporalInputs: records.filter(({ record_kind }) => record_kind === "temporal-input").map(({ document }) => document as CatalogTemporalInput),
    authorityStatements: records.filter(({ record_kind }) => record_kind === "authority-statement").map(({ document }) => document as IntelligenceAuthorityStatement),
    materializations: materializations.sort((a, b) => a.projection_key.localeCompare(b.projection_key)),
  };
}

async function stateDigests(state: CanonicalResolverState, intent: InvocationIntent, context: ResolverContext): Promise<PlanSnapshotDigests> {
  const records = (kind: CanonicalCatalogRecord["record_kind"]) => state.records.filter(({ record_kind }) => record_kind === kind);
  return {
    // Decision time is recorded and bounded by the plan snapshot, but it is
    // not part of the semantic invocation input. Including clock.instant here
    // would make every later revalidation appear to be an input mutation.
    normalized_resolver_input: await sha256Digest({
      intent,
      targetSite: context.targetSite,
      userSite: context.userSite,
      hostSite: context.hostSite,
      runtime: context.runtime,
      access: context.access,
    }),
    catalog: await sha256Digest(records("resource")),
    policy: await sha256Digest([...records("policy"), ...records("authority-statement")]),
    assertions: await sha256Digest(records("assertion")),
    topology: await sha256Digest([...records("route"), ...context.topology_observations]),
    access: await sha256Digest(records("access")),
    materialization: await sha256Digest(state.materializations),
  };
}

export async function computeResolverStateDigests(
  intent: InvocationIntent,
  context: ResolverContext,
  options: { store: IntelligenceRegistryStore; materializedInputs?: ResolverMaterializedInputs },
): Promise<PlanSnapshotDigests> {
  return stateDigests(await loadCanonicalState(
    options.store,
    context.targetSite.id,
    options.materializedInputs ?? { admitted: [], excluded: [], acquisition_refs: [] },
  ), intent, context);
}

function refusal(intent: InvocationIntent, context: ResolverContext, code: RefusalReasonCode, explanation: string, rejected: RejectedCandidate[] = []): InvocationRefusal {
  return {
    schema: "narada.invokable-intelligence.invocation-refusal.v1",
    id: deterministicId("refusal", { intent, context, resolver: RESOLVER_VERSION, code, explanation, rejected }),
    intent_id: intent.id,
    created_at: context.clock.instant,
    resolver_version: RESOLVER_VERSION,
    reason_code: code,
    explanation,
    rejected_candidates: rejected,
  };
}

function detectPolicyConflicts(hardConstraints: PolicyDocument[]): string[] {
  const required = new Map<string, string>();
  const forbidden = new Map<string, string>();
  for (const policy of hardConstraints) {
    for (const rule of policy.rules) {
      const label = rule.type === "require-capability" || rule.type === "forbid-capability"
        ? `${rule.capability.family}/${rule.capability.name}`
        : null;
      if (label && rule.type === "require-capability" && !required.has(label)) required.set(label, policy.id);
      if (label && rule.type === "forbid-capability" && !forbidden.has(label)) forbidden.set(label, policy.id);
    }
  }
  return [...required].flatMap(([label, requiredBy]) => forbidden.has(label) ? [`${label} is both required (${requiredBy}) and forbidden (${forbidden.get(label)})`] : []).sort();
}

function toRejected(evaluations: CandidateEvaluation[]): RejectedCandidate[] {
  return evaluations.map(({ candidate, reasons }) => ({
    candidate: { kind: "model-offering", id: candidate.offering.id },
    reasons: reasons.length ? reasons : ["not ranked first"],
  }));
}

function expectedStatementKind(policy: PolicyDocument): IntelligenceAuthorityStatement["kind"] {
  if (policy.kind === "preferences") return "user-preference";
  if (policy.kind === "defaults") return "target-default";
  if (policy.kind === "eligibility") return "execution-feasibility";
  return "target-governance-constraint";
}

function applicableStatements(state: CanonicalResolverState, intent: InvocationIntent, context: ResolverContext): IntelligenceAuthorityStatement[] {
  const siteIds = new Set([context.targetSite.id, context.userSite.id, context.hostSite.id]);
  return state.authorityStatements.filter(({ origin }) =>
    origin.locus === "principal" ? origin.principal_id === intent.principal : !origin.site_id || siteIds.has(origin.site_id));
}

function authorityProvenance(statements: IntelligenceAuthorityStatement[], usedPayloadRefs: Set<string>): IntelligenceAuthorityResolutionProvenance {
  return {
    schema: "narada.invokable-intelligence.authority-resolution-provenance.v1",
    decisions: statements.map((statement) => ({
      statement_id: statement.id,
      statement_kind: statement.kind,
      origin: statement.origin,
      effect: statement.effect,
      disposition: usedPayloadRefs.has(statement.payload_ref) ? "applied" : "not-applicable",
    })),
  };
}

function chooseValidUntil(state: CanonicalResolverState, instant: string): string | null {
  const live = state.temporalInputs.map(({ valid_until }) => valid_until).filter((value) => Date.parse(value) > Date.parse(instant)).sort();
  return live[0] ?? null;
}

function selectRefusalCode(evaluations: CandidateEvaluation[]): RefusalReasonCode {
  const reasons = evaluations.flatMap(({ reasons }) => reasons);
  if (reasons.some((reason) => reason.startsWith("route topology"))) return "topology-infeasible";
  if (reasons.some((reason) => reason.startsWith("route access refused"))) return "access-denied";
  if (evaluations.some(({ reasonCodes }) => reasonCodes.length === 1 && reasonCodes[0] === "unsupported-options")) return "unsupported-options";
  return "no-candidates";
}

export interface ResolveOptions {
  store: IntelligenceRegistryStore;
  predecessorPlanId?: string;
  materializedInputs?: ResolverMaterializedInputs;
}

export async function resolveInvocation(intent: InvocationIntent, context: ResolverContext, options: ResolveOptions): Promise<InvocationPlan | InvocationRefusal> {
  const validationErrors = validateInvocation(intent);
  if (validationErrors.length) throw new ResolverError("invalid-intent", `intent '${intent.id}' failed contract validation: ${validationErrors[0].code} at ${validationErrors[0].path}`, validationErrors);
  if (
    validateAuthoritativeDecisionClock(context.clock).length
    || Date.parse(context.clock.instant) < Date.parse(intent.created_at)
  ) {
    throw new ResolverError("invalid-resolution-clock", "resolution requires a valid explicit clock at or after intent creation");
  }
  if (!intent.principal) return refusal(intent, context, "principal-required", "canonical resolution requires an explicit principal identity");

  const state = await loadCanonicalState(
    options.store,
    context.targetSite.id,
    options.materializedInputs ?? { admitted: [], excluded: [], acquisition_refs: [] },
  );
  if (!state.routes.length) return refusal(intent, context, "explicit-route-required", "no canonical invocation route records are admitted");
  const validUntil = chooseValidUntil(state, context.clock.instant);
  if (!validUntil) return refusal(intent, context, "temporal-input-required", "no live canonical temporal input bounds this decision");
  const principal = state.accessRecords.find((record): record is InvocationPrincipal => record.schema === "narada.invokable-intelligence.principal.v1" && record.id === intent.principal);
  if (!principal) return refusal(intent, context, "principal-required", `principal '${intent.principal}' has no admitted canonical identity`);

  const statements = applicableStatements(state, intent, context);
  const authorityPlan = planIntelligenceAuthorityApplication(statements);
  if (authorityPlan.diagnostics.length) return refusal(intent, context, "authority-policy-conflict", authorityPlan.diagnostics.map(({ message }) => message).join("; "));
  const prohibition = statements.find(({ kind, origin }) => kind === "principal-prohibition" && origin.principal_id === intent.principal);
  if (prohibition) return refusal(intent, context, "principal-prohibited", `principal prohibition '${prohibition.id}' applies`);

  const applicablePolicies = state.policies.filter((policy) => {
    if (policy.locus === "target-site") return policy.site.id === context.targetSite.id;
    if (policy.locus === "user-site") return policy.site.id === context.userSite.id;
    return policy.site.id === context.hostSite.id;
  });
  const unauthorisedPolicy = applicablePolicies.find((policy) => !statements.some(({ kind, payload_ref }) => payload_ref === policy.id && kind === expectedStatementKind(policy)));
  if (unauthorisedPolicy) return refusal(intent, context, "authority-policy-conflict", `policy '${unauthorisedPolicy.id}' lacks a matching canonical authority statement`);

  const hardConstraints = applicablePolicies.filter(({ kind }) => kind === "hard-constraints").sort((a, b) => LOCUS_ORDER[a.locus] - LOCUS_ORDER[b.locus] || a.id.localeCompare(b.id));
  const conflicts = detectPolicyConflicts(hardConstraints);
  if (conflicts.length) return refusal(intent, context, "policy-conflict", `contradictory hard constraints: ${conflicts.join("; ")}`);
  const policyGroups = {
    hardConstraints,
    eligibility: applicablePolicies.filter(({ kind }) => kind === "eligibility"),
    preferences: applicablePolicies.filter(({ kind }) => kind === "preferences"),
    defaults: applicablePolicies.filter(({ kind }) => kind === "defaults"),
  };

  const candidates = assembleCandidates(state.resources, state.routes);
  const evaluations = candidates.map((candidate) => evaluateCandidate(candidate, intent, principal, state.routeAssertions, state.accessRecords, policyGroups, context));
  for (const evaluation of evaluations) {
    const grantId = evaluation.access.provenance.grant_id;
    if (evaluation.eligible && (!grantId || !statements.some(({ kind, origin, payload_ref }) => kind === "principal-consent" && origin.principal_id === intent.principal && payload_ref === grantId))) {
      evaluation.eligible = false;
      evaluation.reasonCodes.push("hard-constraint");
      evaluation.reasons.push(`principal consent authority statement for grant '${grantId ?? "missing"}' is absent`);
    }
  }
  const eligible = evaluations.filter(({ eligible }) => eligible);
  if (!eligible.length) {
    const rejected = toRejected(evaluations);
    const consentOnly = evaluations.length > 0 && evaluations.every(({ reasons }) => reasons.some((reason) => reason.startsWith("principal consent")));
    return refusal(intent, context, consentOnly ? "principal-consent-required" : selectRefusalCode(evaluations), consentOnly ? "no route has explicit principal consent" : "no eligible canonical offering/route", rejected);
  }

  const ranked = [...eligible].sort((a, b) => b.score - a.score || b.defaultsScore - a.defaultsScore || a.candidate.offering.id.localeCompare(b.candidate.offering.id) || a.candidate.route.id.localeCompare(b.candidate.route.id));
  const winner = ranked[0];
  const effectiveOptions: Record<string, unknown> = {};
  const appliedDefaults: ProvenanceEntry[] = [];
  for (const policy of [...policyGroups.defaults].sort((a, b) => a.id.localeCompare(b.id))) {
    for (const rule of policy.rules) {
      if (rule.type !== "default-option" || SELECTION_DEFAULT_KEYS.has(rule.option) || rule.option.includes(".default_") || rule.option.endsWith(".route")) continue;
      effectiveOptions[rule.option] = rule.value;
      appliedDefaults.push({ source: policy.id, effect: `${rule.option} = ${JSON.stringify(rule.value)}` });
    }
  }
  for (const [key, value] of Object.entries(intent.requested_options ?? {})) {
    effectiveOptions[key] = value;
    appliedDefaults.push({ source: "intent", effect: `${key} = ${JSON.stringify(value)} (requested)` });
  }

  const selected: InvocationPlan["selected"] = {
    model: { kind: "model", id: winner.candidate.model.id },
    model_provider: { kind: "model-provider", id: winner.candidate.modelProvider.id },
    inference_provider: { kind: "inference-provider", id: winner.candidate.inferenceProvider.id },
    endpoint: { kind: "inference-endpoint", id: winner.candidate.endpoint.id },
    adapter: { kind: "adapter", id: winner.candidate.adapter.id },
    ...(winner.candidate.credential ? { credential: { kind: "credential-locator" as const, id: winner.candidate.credential.id } } : {}),
  };
  const route: InvocationPlan["route"] = {
    offering: { kind: "model-offering", id: winner.candidate.offering.id },
    route_id: winner.candidate.route.id,
    composition_digest: winner.candidate.route.composition_digest,
    topology_id: winner.candidate.route.topology.id,
    endpoint: selected.endpoint,
    adapter: selected.adapter,
    execution_loci: winner.candidate.route.execution_loci,
    account_ref: winner.candidate.route.access.account_ref,
    grant_refs: winner.candidate.route.access.grant_refs,
    ...(selected.credential ? { credential: selected.credential } : {}),
  };
  const digests = await stateDigests(state, intent, context);
  const planId = deterministicId("plan", { intent, context, resolver: RESOLVER_VERSION, selected, route, digests, predecessorPlanId: options.predecessorPlanId ?? null });
  const snapshotBase = {
    schema: PLAN_DECISION_SNAPSHOT_SCHEMA,
    plan_id: planId,
    intent_id: intent.id,
    resolved_at: context.clock.instant,
    clock: context.clock,
    resolver_version: RESOLVER_VERSION,
    digests,
    valid_until: validUntil,
    revalidation_triggers: ["before-queued-attempt", "at-scheduled-window", "before-retry", "before-resume", "catalog-change", "policy-change", "assertion-expiry", "topology-change", "access-change", "materialization-change", "credential-change", "quota-change"] as PlanDecisionSnapshot["revalidation_triggers"],
    referenced_revisions: [...state.records.map((record) => ({
      kind: record.record_kind === "resource" ? "catalog" as const : record.record_kind === "policy" || record.record_kind === "authority-statement" ? "policy" as const : record.record_kind === "assertion" ? "assertion" as const : record.record_kind === "route" ? "topology" as const : record.record_kind === "access" ? "access" as const : "catalog" as const,
      record_id: record.record_id,
      revision: `${record.revision}:${record.source.revision}`,
      digest: record.source.digest,
      immutable_ref: record.id,
    })), ...state.materializations.map((projection) => ({
      kind: "materialization" as const,
      record_id: projection.envelope.statement.id,
      revision: `${projection.envelope.statement.source_revision}:${projection.admission.id}`,
      digest: projection.envelope.statement.payload_digest,
      immutable_ref: projection.envelope.id,
    }))],
    lineage: options.predecessorPlanId ? { relation: "replan-of" as const, predecessor_plan_id: options.predecessorPlanId } : { relation: "initial" as const },
  };
  const snapshot: PlanDecisionSnapshot = { ...snapshotBase, snapshot_digest: await sha256Digest(snapshotBase) };
  const access = winner.access.provenance;
  const usedPayloadRefs = new Set([
    ...applicablePolicies.map(({ id }) => id),
    ...winner.routeCapabilities.flatMap(({ assertion_ids }) => assertion_ids),
    access.grant_id!,
  ]);
  return {
    schema: "narada.invokable-intelligence.invocation-plan.v2",
    id: planId,
    intent_id: intent.id,
    created_at: context.clock.instant,
    resolver_version: RESOLVER_VERSION,
    selected,
    route,
    access: {
      account_id: access.account_id,
      ...(access.credential_binding_id ? { credential_binding_id: access.credential_binding_id } : {}),
      grant_id: access.grant_id!,
      entitlement_id: access.entitlement_id!,
      quota_id: access.quota_id!,
      budget_id: access.budget_id!,
      governance_requirement_ids: access.governance_requirement_ids,
    },
    authority_provenance: authorityProvenance(statements, usedPayloadRefs),
    snapshot,
    options: effectiveOptions,
    provenance: {
      applied_constraints: winner.appliedConstraints,
      applied_preferences: winner.appliedPreferences,
      applied_defaults: [...winner.appliedDefaultsRank, ...appliedDefaults],
      rejected_candidates: toRejected([...evaluations.filter(({ eligible }) => !eligible), ...ranked.slice(1)]),
    },
  };
}
