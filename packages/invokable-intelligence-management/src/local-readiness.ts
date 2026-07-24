/**
 * Read-only local intelligence readiness.
 *
 * This is deliberately a doctor, not a bootstrapper: it reports the explicit
 * authority chain needed by the local runtime and never invents a principal,
 * grant, consent, credential, quota, budget, or governance decision.
 */

import {
  ACCESS_GRANT_SCHEMA,
  BUDGET_AUTHORIZATION_SCHEMA,
  CREDENTIAL_BINDING_SCHEMA,
  DATA_GOVERNANCE_REQUIREMENT_SCHEMA,
  evaluateRouteAccess,
  INVOCATION_PRINCIPAL_SCHEMA,
  QUOTA_OBSERVATION_SCHEMA,
  resolveInvocationPrincipalAdmission,
  SERVICE_ACCOUNT_SCHEMA,
  SERVICE_ENTITLEMENT_SCHEMA,
  validateCanonicalCatalogRecord,
  validateInvocationRouteCandidate,
  validateModelOfferingGraph,
} from "@narada2/invokable-intelligence-contract";
import type {
  AccessGrant,
  BudgetAuthorization,
  CanonicalCatalogRecord,
  CatalogAccessRecord,
  CredentialBinding,
  DataGovernanceRequirement,
  InvocationPrincipal,
  InvocationRouteCandidate,
  PrincipalAdmissionContext,
  QuotaObservation,
  ServiceAccount,
  ServiceEntitlement,
  Resource,
  ModelOffering,
  IntelligenceAuthorityStatement,
} from "@narada2/invokable-intelligence-contract";
import type { IntelligenceRegistryStore } from "@narada2/invokable-intelligence-registry";

export const LOCAL_INTELLIGENCE_READINESS_SCHEMA =
  "narada.invokable-intelligence.local-readiness.v1" as const;

export type LocalReadinessCheckStatus = "ready" | "blocked" | "ambiguous";

export interface LocalPrincipalBindingContext extends PrincipalAdmissionContext {
  /** Non-secret evidence references supplied by the User Site binding. */
  evidence_refs?: string[];
}

export interface LocalReadinessContext {
  target_site_id: string;
  user_site_id: string;
  host_site_id: string;
  principal_id: string;
  /** Explicit authenticated actor/membership evidence; never inferred from names or paths. */
  principal_binding?: LocalPrincipalBindingContext | null;
  now?: string;
  purpose?: string;
  requested_region?: string;
  data_classification?: "public" | "internal" | "confidential" | "restricted";
  requested_retention_days?: number;
  provider_training?: "allowed" | "prohibited";
  expected_usage?: { amount: number; unit: string };
  expected_cost?: { amount: number; currency: string };
}

export interface LocalReadinessCheck {
  id: string;
  status: LocalReadinessCheckStatus;
  code: string;
  message: string;
  subject_ids: string[];
  evidence_refs: string[];
}

export interface LocalRouteReadiness {
  route_id: string;
  offering_id: string | null;
  structural_status: "ready" | "blocked";
  eligible: boolean;
  findings: Array<{ code: string; subject_id?: string; authority_ref?: string; message: string }>;
  evidence_refs: string[];
}

export interface LocalIntelligenceReadiness {
  schema: typeof LOCAL_INTELLIGENCE_READINESS_SCHEMA;
  status: "ready" | "blocked" | "ambiguous";
  mutation_performed: false;
  context: {
    target_site_id: string;
    user_site_id: string;
    host_site_id: string;
    principal_id: string;
    actor_auth_type: string | null;
  };
  checks: LocalReadinessCheck[];
  route_readiness: LocalRouteReadiness[];
  counts: {
    resources: number;
    catalog_records: number;
    access_records: number;
    routes: number;
    principals: number;
    authority_statements: number;
  };
  required_next_steps: string[];
}

function latestRecords(records: readonly CanonicalCatalogRecord[]): CanonicalCatalogRecord[] {
  const current = new Map<string, CanonicalCatalogRecord>();
  for (const record of records) {
    const previous = current.get(record.record_id);
    if (!previous
      || record.revision > previous.revision
      || (record.revision === previous.revision && record.id.localeCompare(previous.id) > 0)) {
      current.set(record.record_id, record);
    }
  }
  return [...current.values()].sort((a, b) => a.record_id.localeCompare(b.record_id));
}

function check(
  id: string,
  status: LocalReadinessCheckStatus,
  code: string,
  message: string,
  subjectIds: string[] = [],
  evidenceRefs: string[] = [],
): LocalReadinessCheck {
  return {
    id,
    status,
    code,
    message,
    subject_ids: [...new Set(subjectIds)].sort(),
    evidence_refs: [...new Set(evidenceRefs)].sort(),
  };
}

function recordRef(record: CanonicalCatalogRecord | undefined): string[] {
  return record ? [record.id] : [];
}

function accessDocument<T extends CatalogAccessRecord>(
  records: readonly CanonicalCatalogRecord[],
  schema: string,
): T[] {
  return records
    .filter(({ record_kind, document }) => record_kind === "access" && document.schema === schema)
    .map(({ document }) => document as T);
}

function validAt(validity: { valid_from: string; valid_until: string }, now: string): boolean {
  const at = Date.parse(now);
  return Number.isFinite(at)
    && Date.parse(validity.valid_from) <= at
    && at < Date.parse(validity.valid_until);
}

function categoryCodes(category: string): Set<string> {
  switch (category) {
    case "authority-consent": return new Set(["principal-consent-missing", "principal-consent-mismatch"]);
    case "credentials": return new Set(["account-unavailable", "missing-secret", "credential-unusable"]);
    case "grants": return new Set(["principal-unauthorized", "expired-grant", "revoked-grant"]);
    case "entitlements": return new Set(["entitlement-missing", "entitlement-expired"]);
    case "quota": return new Set(["quota-unknown", "quota-exhausted"]);
    case "budget": return new Set(["budget-denied"]);
    case "governance": return new Set(["governance-mismatch"]);
    default: return new Set();
  }
}

function routeCategoryCheck(
  id: string,
  category: string,
  routes: readonly LocalRouteReadiness[],
): LocalReadinessCheck {
  if (routes.length === 0) {
    return check(id, "blocked", "route-required", `Cannot evaluate ${category}: no structurally valid invocation route is admitted.`);
  }
  const codes = categoryCodes(category);
  const passing = routes.find((route) => route.structural_status === "ready"
    && !route.findings.some(({ code }) => codes.has(code)));
  if (passing) return check(id, "ready", "ready", `At least one admitted route satisfies the ${category} prerequisite chain.`, [passing.route_id], passing.evidence_refs);
  const findings = routes.flatMap(({ findings }) => findings.filter(({ code }) => codes.has(code)));
  return check(
    id,
    "blocked",
    findings[0]?.code ?? `${category.replaceAll("-", "_")}_not_ready`,
    findings[0]?.message ?? `No admitted route satisfies the ${category} prerequisite chain.`,
    routes.map(({ route_id }) => route_id),
    routes.flatMap(({ evidence_refs }) => evidence_refs),
  );
}

/** Inspect one explicit local catalog without performing any mutation. */
export async function inspectLocalIntelligenceReadiness(
  store: IntelligenceRegistryStore,
  context: LocalReadinessContext,
): Promise<LocalIntelligenceReadiness> {
  const now = context.now ?? new Date().toISOString();
  const records = latestRecords(await store.listCatalogRecords());
  const resources = await store.listResources();
  const residuals = await store.listCatalogResiduals();
  const resourceById = new Map(resources.map((resource) => [resource.id, resource]));
  const accessRecords = records.filter(({ record_kind }) => record_kind === "access");
  const principals = accessDocument<InvocationPrincipal>(records, INVOCATION_PRINCIPAL_SCHEMA);
  const principalRecord = records.find(({ record_kind, document, record_id }) =>
    record_kind === "access"
    && record_id === context.principal_id
    && document.schema === INVOCATION_PRINCIPAL_SCHEMA
    && document.id === context.principal_id);
  const principal = principalRecord?.document as InvocationPrincipal | undefined;
  const authorityStatements = records
    .filter(({ record_kind, document }) => record_kind === "authority-statement" && document.schema === "narada.invokable-intelligence.authority-statement.v1")
    .map(({ document }) => document as IntelligenceAuthorityStatement);

  const checks: LocalReadinessCheck[] = [];
  const invalidCatalog = records.flatMap((record) => validateCanonicalCatalogRecord(record));
  checks.push(invalidCatalog.length === 0 && residuals.length === 0
    ? check("catalog-integrity", "ready", "ready", "Canonical catalog records and migration residuals are clean.", records.map(({ id }) => id))
    : check(
      "catalog-integrity",
      "blocked",
      residuals.length > 0 ? "catalog-residuals-present" : "catalog-record-invalid",
      residuals.length > 0
        ? "Catalog contains explicit migration residuals; they are not authority and must be dispositioned before readiness."
        : `Catalog contains ${invalidCatalog.length} structurally invalid record diagnostic(s).`,
      invalidCatalog.map(({ record_id }) => record_id ?? "unknown"),
      residuals.map(({ id }) => id),
    ));

  const siteIds = [context.target_site_id, context.user_site_id, context.host_site_id];
  const missingSites = siteIds.filter((id) => resourceById.get(id)?.schema !== "narada.invokable-intelligence.site.v1");
  checks.push(missingSites.length === 0
    ? check("site-admission", "ready", "ready", "Target, User, and Host Site resources are explicitly admitted.", siteIds)
    : check("site-admission", "blocked", "site-not-admitted", `Missing canonical Site resource(s): ${missingSites.join(", ")}.`, missingSites));

  checks.push(principalRecord
    ? check("principal-admission", "ready", "ready", `Canonical invocation principal ${context.principal_id} is admitted.`, [context.principal_id], recordRef(principalRecord))
    : check("principal-admission", "blocked", "principal-not-admitted", `Canonical invocation principal ${context.principal_id} is not admitted; service-account records do not substitute for it.`, [context.principal_id]));

  let bindingCheck: LocalReadinessCheck;
  if (!principal) {
    bindingCheck = check("principal-binding", "blocked", "principal-not-admitted", "Principal binding cannot be resolved until the canonical principal is admitted.", [context.principal_id]);
  } else if (!context.principal_binding) {
    bindingCheck = check("principal-binding", "blocked", "principal-binding-context-required", "An explicit authenticated actor or Site-membership binding is required; identity names and paths are not used for admission.", [principal.id], recordRef(principalRecord));
  } else {
    const resolution = resolveInvocationPrincipalAdmission([principal], context.principal_binding);
    bindingCheck = resolution.ok
      ? resolution.principal.id === context.principal_id
        ? check("principal-binding", "ready", "ready", `Authenticated actor is explicitly bound to ${context.principal_id}.`, [context.principal_id, resolution.binding.id], [...recordRef(principalRecord), ...resolution.evidence_refs, ...(context.principal_binding.evidence_refs ?? [])])
        : check("principal-binding", "blocked", "principal-binding-mismatch", `Authenticated actor resolved to ${resolution.principal.id}, not the requested ${context.principal_id}.`, [resolution.principal.id, context.principal_id], resolution.evidence_refs)
      : check("principal-binding", resolution.code === "principal-binding-ambiguous" ? "ambiguous" : "blocked", resolution.code, `Explicit actor binding did not resolve uniquely to ${context.principal_id}.`, [context.principal_id, ...resolution.candidate_principal_ids]);
  }
  checks.push(bindingCheck);

  const routeRecords = records.filter(({ record_kind, document }) =>
    record_kind === "route" && document.schema === "narada.invokable-intelligence.invocation-route-candidate.v1");
  const offerings = resources.filter(({ schema }) => schema === "narada.invokable-intelligence.model-offering.v1") as ModelOffering[];
  const accounts = accessDocument<ServiceAccount>(records, SERVICE_ACCOUNT_SCHEMA);
  const credentialBindings = accessDocument<CredentialBinding>(records, CREDENTIAL_BINDING_SCHEMA);
  const grants = accessDocument<AccessGrant>(records, ACCESS_GRANT_SCHEMA);
  const entitlements = accessDocument<ServiceEntitlement>(records, SERVICE_ENTITLEMENT_SCHEMA);
  const quotas = accessDocument<QuotaObservation>(records, QUOTA_OBSERVATION_SCHEMA);
  const budgets = accessDocument<BudgetAuthorization>(records, BUDGET_AUTHORIZATION_SCHEMA);
  const governance = accessDocument<DataGovernanceRequirement>(records, DATA_GOVERNANCE_REQUIREMENT_SCHEMA);
  const routeReadiness: LocalRouteReadiness[] = [];
  for (const record of routeRecords) {
    const route = record.document as InvocationRouteCandidate;
    const offering = offerings.find(({ id }) => id === route.offering.id);
    const structuralDiagnostics = offering
      ? [...validateModelOfferingGraph(offering, resources), ...validateInvocationRouteCandidate(route, offering, resources)]
      : [{ code: "offering-missing", subject_id: route.offering.id, message: `Route offering ${route.offering.id} is not admitted.` }];
    const baseRefs = [record.id, ...record.validation.evidence.map(({ ref }) => ref)];
    if (!offering || structuralDiagnostics.length > 0 || !principal) {
      routeReadiness.push({
        route_id: route.id,
        offering_id: offering?.id ?? null,
        structural_status: "blocked",
        eligible: false,
        findings: structuralDiagnostics.map((diagnostic) => ({
          code: diagnostic.code,
          ...(("subject_id" in diagnostic && diagnostic.subject_id) ? { subject_id: diagnostic.subject_id } : {}),
          message: diagnostic.message,
        })),
        evidence_refs: baseRefs,
      });
      continue;
    }
    const facts = {
      account: accounts.find(({ id }) => id === route.access.account_ref),
      credential_binding: credentialBindings.find(({ account_id }) => account_id === route.access.account_ref),
      grants,
      entitlements,
      quotas,
      budgets,
      governance,
    };
    const access = evaluateRouteAccess(route, offering, {
      principal,
      target_site_id: context.target_site_id,
      purpose: context.purpose ?? "operator-chat",
      action: "invoke",
      now,
      requested_region: context.requested_region ?? "global",
      data_classification: context.data_classification ?? "internal",
      requested_retention_days: context.requested_retention_days ?? 0,
      provider_training: context.provider_training ?? "prohibited",
      expected_usage: context.expected_usage ?? { amount: 1, unit: "requests" },
      expected_cost: context.expected_cost ?? { amount: 1, currency: "USD" },
    }, facts);
    const routeGrants = grants.filter(({ id }) => route.access.grant_refs.includes(id));
    const missingConsent = routeGrants.filter((grant) => {
      const statement = authorityStatements.find(({ id }) => id === grant.principal_consent_ref);
      return !statement || statement.kind !== "principal-consent" || statement.origin.principal_id !== principal.id;
    });
    const consentFindings = missingConsent.map((grant) => ({
      code: "principal-consent-missing",
      subject_id: grant.id,
      authority_ref: grant.principal_consent_ref,
      message: `Grant ${grant.id} does not reference an admitted consent statement for ${principal.id}.`,
    }));
    const findings = [...access.findings, ...consentFindings];
    routeReadiness.push({
      route_id: route.id,
      offering_id: offering.id,
      structural_status: "ready",
      eligible: findings.length === 0,
      findings,
      evidence_refs: [...new Set([...baseRefs, ...findings.flatMap(({ authority_ref }) => authority_ref ? [authority_ref] : [])])],
    });
  }

  checks.push(routeRecords.length > 0 && routeReadiness.some(({ structural_status }) => structural_status === "ready")
    ? check("route-admission", "ready", "ready", "At least one invocation route is structurally admitted.", routeReadiness.filter(({ structural_status }) => structural_status === "ready").map(({ route_id }) => route_id), routeReadiness.flatMap(({ evidence_refs }) => evidence_refs))
    : check("route-admission", "blocked", routeRecords.length === 0 ? "route-not-admitted" : "route-structurally-invalid", "No structurally valid invocation route is admitted for local readiness.", routeRecords.map(({ record_id }) => record_id)));
  checks.push(routeCategoryCheck("authority-consent", "authority-consent", routeReadiness));
  checks.push(routeCategoryCheck("credential-readiness", "credentials", routeReadiness));
  checks.push(routeCategoryCheck("grant-readiness", "grants", routeReadiness));
  checks.push(routeCategoryCheck("entitlement-readiness", "entitlements", routeReadiness));
  checks.push(routeCategoryCheck("quota-readiness", "quota", routeReadiness));
  checks.push(routeCategoryCheck("budget-readiness", "budget", routeReadiness));
  checks.push(routeCategoryCheck("governance-readiness", "governance", routeReadiness));

  const status = checks.some(({ status }) => status === "ambiguous")
    ? "ambiguous"
    : checks.every(({ status }) => status === "ready") ? "ready" : "blocked";
  const requiredNextSteps = status === "ready"
    ? []
    : [
      "Admit or repair the missing canonical records through the owning User Site management path.",
      "Provide an explicit principal_binding in the User Site launch context; do not infer identity from agent names or paths.",
      "Re-run the read-only local-readiness doctor before launching the runtime.",
    ];
  return {
    schema: LOCAL_INTELLIGENCE_READINESS_SCHEMA,
    status,
    mutation_performed: false,
    context: {
      target_site_id: context.target_site_id,
      user_site_id: context.user_site_id,
      host_site_id: context.host_site_id,
      principal_id: context.principal_id,
      actor_auth_type: context.principal_binding?.actor.auth_type ?? null,
    },
    checks,
    route_readiness: routeReadiness,
    counts: {
      resources: resources.length,
      catalog_records: records.length,
      access_records: accessRecords.length,
      routes: routeRecords.length,
      principals: principals.length,
      authority_statements: authorityStatements.length,
    },
    required_next_steps: requiredNextSteps,
  };
}

