/** Principal access, account entitlement, quota, budget, and data governance. */

import type { EvidenceRef } from "./assertions.js";
import type { ResourceRef } from "./ids.js";
import type { InvocationRouteCandidate } from "./offerings.js";
import type { ModelOffering } from "./resources.js";

export const SERVICE_ACCOUNT_SCHEMA = "narada.invokable-intelligence.service-account.v1" as const;
export const INVOCATION_PRINCIPAL_SCHEMA = "narada.invokable-intelligence.principal.v1" as const;
export const CREDENTIAL_BINDING_SCHEMA = "narada.invokable-intelligence.credential-binding.v1" as const;
export const ACCESS_GRANT_SCHEMA = "narada.invokable-intelligence.access-grant.v1" as const;
export const SERVICE_ENTITLEMENT_SCHEMA = "narada.invokable-intelligence.service-entitlement.v1" as const;
export const QUOTA_OBSERVATION_SCHEMA = "narada.invokable-intelligence.quota-observation.v1" as const;
export const BUDGET_AUTHORIZATION_SCHEMA = "narada.invokable-intelligence.budget-authorization.v1" as const;
export const DATA_GOVERNANCE_REQUIREMENT_SCHEMA = "narada.invokable-intelligence.data-governance-requirement.v1" as const;

export interface AccessAuthorityRef {
  owner_kind: "account-owner" | "principal" | "target-site" | "execution-site" | "service-provider";
  owner_id: string;
  authority_ref: string;
}

export interface AccessValidity {
  valid_from: string;
  valid_until: string;
}

export interface ServiceAccount {
  schema: typeof SERVICE_ACCOUNT_SCHEMA;
  id: string;
  tenant_id: string;
  inference_provider: ResourceRef;
  owner: AccessAuthorityRef;
  region?: string;
  status: "active" | "suspended" | "closed";
}

export interface InvocationPrincipal {
  schema: typeof INVOCATION_PRINCIPAL_SCHEMA;
  id: string;
  kind: "human" | "agent" | "workload" | "site";
  authority: AccessAuthorityRef;
  /** Governed ways an authenticated actor may embody this invocation principal. */
  admission_bindings?: PrincipalAdmissionBinding[];
}

export type PrincipalAdmissionBinding =
  | {
      id: string;
      kind: "authenticated-principal";
      auth_type: string;
      principal_id: string;
    }
  | {
      id: string;
      kind: "site-membership";
      registry: string;
      site_id: string;
      roles: string[];
      auth_types?: string[];
    };

export interface AuthenticatedActorIdentity {
  principal_id: string;
  auth_type: string;
}

export interface AdmittedSiteMembershipIdentity {
  registry: string;
  site_id: string;
  role: string;
  evidence_ref: string;
}

export interface PrincipalAdmissionContext {
  actor: AuthenticatedActorIdentity;
  memberships: AdmittedSiteMembershipIdentity[];
}

export type PrincipalAdmissionResolution =
  | {
      ok: true;
      principal: InvocationPrincipal;
      binding: PrincipalAdmissionBinding;
      evidence_refs: string[];
    }
  | {
      ok: false;
      code: "principal-binding-missing" | "principal-binding-ambiguous";
      candidate_principal_ids: string[];
    };

function admissionEvidence(
  binding: PrincipalAdmissionBinding,
  context: PrincipalAdmissionContext,
): string[] | null {
  if (binding.kind === "authenticated-principal") {
    return binding.auth_type === context.actor.auth_type
      && binding.principal_id === context.actor.principal_id
      ? [`authenticated-actor:${context.actor.auth_type}:${context.actor.principal_id}`]
      : null;
  }
  const membership = context.memberships.find((candidate) =>
    candidate.registry === binding.registry
    && candidate.site_id === binding.site_id
    && binding.roles.includes(candidate.role)
    && (!binding.auth_types || binding.auth_types.includes(context.actor.auth_type)));
  return membership ? [membership.evidence_ref] : null;
}

/** Resolve an authenticated actor to one canonical principal without interpreting any name. */
export function resolveInvocationPrincipalAdmission(
  principals: readonly InvocationPrincipal[],
  context: PrincipalAdmissionContext,
): PrincipalAdmissionResolution {
  const matches = principals.flatMap((principal) =>
    (principal.admission_bindings ?? []).flatMap((binding) => {
      const evidenceRefs = admissionEvidence(binding, context);
      return evidenceRefs ? [{ principal, binding, evidence_refs: evidenceRefs }] : [];
    }));
  if (matches.length === 1) return { ok: true, ...matches[0]! };
  return {
    ok: false,
    code: matches.length === 0 ? "principal-binding-missing" : "principal-binding-ambiguous",
    candidate_principal_ids: [...new Set(matches.map(({ principal }) => principal.id))].sort(),
  };
}

export interface SecretTransportRef {
  kind: "runtime-binding" | "credential-handle" | "secret-store-handle" | "none";
  /** Opaque locator/handle only. Raw secret values are forbidden. */
  ref: string;
  holder_site_id: string;
}

export interface CredentialBinding {
  schema: typeof CREDENTIAL_BINDING_SCHEMA;
  id: string;
  account_id: string;
  credential_locator?: ResourceRef;
  transport: SecretTransportRef;
  presence: "present" | "missing";
  usability: "usable" | "unusable" | "unknown";
  observed_at: string;
  valid_until?: string;
  owner: AccessAuthorityRef;
  evidence: EvidenceRef[];
}

export interface AccessGrant {
  schema: typeof ACCESS_GRANT_SCHEMA;
  id: string;
  principal_id: string;
  account_id: string;
  actions: Array<"invoke" | "batch" | "stream">;
  scope: {
    offering_ids: string[];
    route_ids?: string[];
    purposes: string[];
    target_site_ids: string[];
    topology_ids?: string[];
  };
  validity: AccessValidity;
  status: "active" | "revoked";
  granted_by: AccessAuthorityRef;
  principal_consent_ref: string;
  evidence: EvidenceRef[];
  revocation?: { revoked_at: string; revoked_by: AccessAuthorityRef; reason_code: string; evidence_ref: string };
}

export interface ServiceEntitlement {
  schema: typeof SERVICE_ENTITLEMENT_SCHEMA;
  id: string;
  account_id: string;
  offering_id: string;
  service_class: string;
  features: string[];
  validity: AccessValidity;
  status: "active" | "suspended" | "expired";
  owner: AccessAuthorityRef;
  evidence: EvidenceRef[];
}

export interface QuotaObservation {
  schema: typeof QUOTA_OBSERVATION_SCHEMA;
  id: string;
  account_id: string;
  offering_id: string;
  unit: string;
  limit: number;
  consumed: number;
  reserved: number;
  period_start: string;
  period_end: string;
  observed_at: string;
  fresh_until: string;
  owner: AccessAuthorityRef;
  evidence: EvidenceRef[];
}

export interface BudgetAuthorization {
  schema: typeof BUDGET_AUTHORIZATION_SCHEMA;
  id: string;
  principal_id: string;
  account_id: string;
  target_site_id: string;
  currency: string;
  limit: number;
  committed: number;
  reserved: number;
  validity: AccessValidity;
  status: "authorized" | "denied" | "exhausted";
  owner: AccessAuthorityRef;
  evidence: EvidenceRef[];
}

export interface DataGovernanceRequirement {
  schema: typeof DATA_GOVERNANCE_REQUIREMENT_SCHEMA;
  id: string;
  target_site_id: string;
  purposes: string[];
  data_classifications: Array<"public" | "internal" | "confidential" | "restricted">;
  allowed_regions: string[];
  maximum_retention_days: number;
  provider_training: "allowed" | "prohibited";
  validity: AccessValidity;
  status: "active" | "revoked";
  owner: AccessAuthorityRef;
  evidence: EvidenceRef[];
}

export interface RouteAccessEvaluationContext {
  principal: InvocationPrincipal;
  target_site_id: string;
  purpose: string;
  action: "invoke" | "batch" | "stream";
  now: string;
  requested_region: string;
  data_classification: "public" | "internal" | "confidential" | "restricted";
  requested_retention_days: number;
  provider_training: "allowed" | "prohibited";
  expected_usage?: { amount: number; unit: string };
  expected_cost?: { amount: number; currency: string };
}

export type RouteAccessRefusalCode =
  | "account-unavailable"
  | "missing-secret"
  | "credential-unusable"
  | "principal-unauthorized"
  | "expired-grant"
  | "revoked-grant"
  | "entitlement-missing"
  | "entitlement-expired"
  | "quota-unknown"
  | "quota-exhausted"
  | "budget-denied"
  | "governance-mismatch";

export interface RouteAccessFinding {
  code: RouteAccessRefusalCode;
  authority_ref?: string;
  subject_id?: string;
  message: string;
}

export interface RouteAccessEvaluation {
  eligible: boolean;
  findings: RouteAccessFinding[];
  provenance: {
    account_id: string;
    credential_binding_id?: string;
    grant_id?: string;
    entitlement_id?: string;
    quota_id?: string;
    budget_id?: string;
    governance_requirement_ids: string[];
  };
}

export interface RouteAccessFacts {
  account?: ServiceAccount;
  credential_binding?: CredentialBinding;
  grants: AccessGrant[];
  entitlements: ServiceEntitlement[];
  quotas: QuotaObservation[];
  budgets: BudgetAuthorization[];
  governance: DataGovernanceRequirement[];
}

const validAt = (validity: AccessValidity, now: string) =>
  Number.isFinite(Date.parse(now))
  && Date.parse(validity.valid_from) <= Date.parse(now)
  && Date.parse(now) < Date.parse(validity.valid_until);

const finding = (
  code: RouteAccessRefusalCode,
  message: string,
  subject?: { id: string; authority?: AccessAuthorityRef },
): RouteAccessFinding => ({
  code,
  message,
  ...(subject ? { subject_id: subject.id } : {}),
  ...(subject?.authority ? { authority_ref: subject.authority.authority_ref } : {}),
});

/**
 * Access is an eligibility gate, never a ranking signal. Successful secret
 * retrieval/authentication alone cannot create principal authorization.
 */
export function evaluateRouteAccess(
  route: InvocationRouteCandidate,
  offering: ModelOffering,
  context: RouteAccessEvaluationContext,
  facts: RouteAccessFacts,
): RouteAccessEvaluation {
  const findings: RouteAccessFinding[] = [];
  const account = facts.account;
  if (!account || account.id !== route.access.account_ref || account.status !== "active") {
    findings.push(finding("account-unavailable", `Route account ${route.access.account_ref} is missing or inactive.`, account));
  }

  const binding = facts.credential_binding;
  if (!binding || binding.account_id !== route.access.account_ref || binding.presence === "missing") {
    findings.push(finding("missing-secret", "No present secret transport binding exists for the selected account.", binding));
  } else if (binding.usability !== "usable" || (binding.valid_until && Date.parse(context.now) >= Date.parse(binding.valid_until))) {
    findings.push(finding("credential-unusable", `Credential binding is ${binding.usability} or expired.`, binding));
  } else if (route.access.credential && binding.credential_locator?.id !== route.access.credential.id) {
    findings.push(finding("credential-unusable", "Route credential locator and account binding do not match.", binding));
  }

  const referencedGrants = facts.grants.filter(({ id }) => route.access.grant_refs.includes(id));
  const principalGrants = referencedGrants.filter(({ principal_id, account_id }) =>
    principal_id === context.principal.id && account_id === route.access.account_ref);
  const revoked = principalGrants.find(({ status }) => status === "revoked");
  if (revoked) findings.push(finding("revoked-grant", `Access grant ${revoked.id} is revoked.`, { id: revoked.id, authority: revoked.granted_by }));
  const expired = principalGrants.find((grant) => grant.status === "active" && !validAt(grant.validity, context.now));
  if (expired) findings.push(finding("expired-grant", `Access grant ${expired.id} is outside its validity interval.`, { id: expired.id, authority: expired.granted_by }));
  const grant = principalGrants.find((candidate) =>
    candidate.status === "active"
    && validAt(candidate.validity, context.now)
    && candidate.actions.includes(context.action)
    && candidate.scope.offering_ids.includes(offering.id)
    && candidate.scope.purposes.includes(context.purpose)
    && candidate.scope.target_site_ids.includes(context.target_site_id)
    && (!candidate.scope.route_ids || candidate.scope.route_ids.includes(route.id))
    && (!candidate.scope.topology_ids || candidate.scope.topology_ids.includes(route.topology.id)));
  if (!grant) {
    findings.push(finding("principal-unauthorized", `Principal ${context.principal.id} has no active scope-matched invoke grant for this route.`));
  }

  const entitlement = facts.entitlements.find((candidate) =>
    candidate.account_id === route.access.account_ref
    && candidate.offering_id === offering.id
    && candidate.service_class === offering.service_class);
  if (!entitlement) findings.push(finding("entitlement-missing", `Account has no entitlement for offering ${offering.id}.`));
  else if (entitlement.status !== "active" || !validAt(entitlement.validity, context.now)) {
    findings.push(finding("entitlement-expired", `Entitlement ${entitlement.id} is inactive or expired.`, { id: entitlement.id, authority: entitlement.owner }));
  }

  const quota = facts.quotas.find((candidate) => candidate.account_id === route.access.account_ref && candidate.offering_id === offering.id);
  if (!quota || Date.parse(context.now) >= Date.parse(quota.fresh_until) || Date.parse(context.now) < Date.parse(quota.period_start) || Date.parse(context.now) >= Date.parse(quota.period_end)) {
    findings.push(finding("quota-unknown", "No fresh quota observation covers this attempt.", quota));
  } else {
    const expected = context.expected_usage?.unit === quota.unit ? context.expected_usage.amount : 0;
    if (quota.limit - quota.consumed - quota.reserved < expected) {
      findings.push(finding("quota-exhausted", `Quota ${quota.id} cannot cover expected ${expected} ${quota.unit}.`, { id: quota.id, authority: quota.owner }));
    }
  }

  const budget = facts.budgets.find((candidate) =>
    candidate.principal_id === context.principal.id
    && candidate.account_id === route.access.account_ref
    && candidate.target_site_id === context.target_site_id);
  const expectedCost = context.expected_cost?.amount ?? 0;
  if (
    !budget
    || budget.status !== "authorized"
    || !validAt(budget.validity, context.now)
    || (context.expected_cost && budget.currency !== context.expected_cost.currency)
    || budget.limit - budget.committed - budget.reserved < expectedCost
  ) {
    findings.push(finding("budget-denied", "No current budget authorization covers the expected route cost.", budget));
  }

  const governance = facts.governance.filter((candidate) =>
    candidate.target_site_id === context.target_site_id
    && candidate.purposes.includes(context.purpose));
  const matchingGovernance = governance.filter((candidate) =>
    candidate.status === "active"
    && validAt(candidate.validity, context.now)
    && candidate.data_classifications.includes(context.data_classification)
    && candidate.allowed_regions.includes(context.requested_region)
    && context.requested_retention_days <= candidate.maximum_retention_days
    && (candidate.provider_training === "allowed" || context.provider_training === "prohibited"));
  if (!governance.length || matchingGovernance.length !== governance.length) {
    findings.push(finding("governance-mismatch", "Region, retention, classification, training, or validity does not satisfy every applicable target governance requirement."));
  }

  return {
    eligible: findings.length === 0,
    findings,
    provenance: {
      account_id: route.access.account_ref,
      ...(binding ? { credential_binding_id: binding.id } : {}),
      ...(grant ? { grant_id: grant.id } : {}),
      ...(entitlement ? { entitlement_id: entitlement.id } : {}),
      ...(quota ? { quota_id: quota.id } : {}),
      ...(budget ? { budget_id: budget.id } : {}),
      governance_requirement_ids: matchingGovernance.map(({ id }) => id).sort(),
    },
  };
}

/** Runtime guard for accidental raw-secret expansion on access records. */
export function containsForbiddenSecretMaterial(record: unknown): boolean {
  if (!record || typeof record !== "object") return false;
  const forbidden = new Set(["secret", "secret_value", "token", "password", "api_key", "key_material"]);
  return Object.entries(record as Record<string, unknown>).some(([key, value]) =>
    forbidden.has(key.toLowerCase()) || (value && typeof value === "object" && containsForbiddenSecretMaterial(value)));
}
