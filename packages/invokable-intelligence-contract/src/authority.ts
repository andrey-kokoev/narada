/**
 * Authority semantics for invokable intelligence.
 *
 * A statement's storage location is not its authority.  The matrix below is
 * the v1 source of truth for who may originate, materialize, supersede, and
 * revoke each statement kind and for the only effect that kind may have
 * during resolution.
 */

export const INTELLIGENCE_AUTHORITY_STATEMENT_SCHEMA =
  "narada.invokable-intelligence.authority-statement.v1" as const;

export type IntelligenceAuthorityLocus =
  | "target-site"
  | "principal"
  | "user-site"
  | "execution-site"
  | "resource-owner"
  | "runtime-observer";

/** A receiving Site may preserve a foreign statement after governed admission. */
export type IntelligenceAuthorityActorRole =
  | IntelligenceAuthorityLocus
  | "receiving-site-admission";

export type IntelligenceStatementKind =
  | "target-governance-constraint"
  | "principal-consent"
  | "principal-prohibition"
  | "user-preference"
  | "target-default"
  | "execution-feasibility"
  | "declared-capability"
  | "observed-capability";

export type IntelligenceResolutionEffect =
  | "eligibility-constraint"
  | "consent-gate"
  | "ranking"
  | "fallback"
  | "capability-evidence";

export type IntelligenceCompositionRule =
  | "accumulate"
  | "explicit-grant-with-deny-dominance"
  | "weighted-ranking"
  | "fill-unset-only"
  | "conjunctive-feasibility"
  | "freshest-valid-per-origin";

export interface IntelligenceAuthorityMatrixEntry {
  statement_kind: IntelligenceStatementKind;
  statement_class: "policy" | "assertion";
  authorized_actions: {
    originate: readonly IntelligenceAuthorityLocus[];
    materialize: readonly IntelligenceAuthorityActorRole[];
    supersede: readonly IntelligenceAuthorityLocus[];
    revoke: readonly IntelligenceAuthorityLocus[];
  };
  resolution_effect: IntelligenceResolutionEffect;
  composition: IntelligenceCompositionRule;
  /** Canonical application phase; lower phases run first. */
  phase: 10 | 20 | 30 | 40;
  conflict_semantics: string;
}

const admittedMaterializers = <T extends IntelligenceAuthorityLocus>(locus: T) =>
  [locus, "receiving-site-admission"] as const;

/**
 * Machine-readable v1 authority matrix.  No generic source priority and no
 * insertion-order precedence exists outside these typed rows.
 */
export const INTELLIGENCE_AUTHORITY_MATRIX = {
  "target-governance-constraint": {
    statement_kind: "target-governance-constraint",
    statement_class: "policy",
    authorized_actions: {
      originate: ["target-site"],
      materialize: admittedMaterializers("target-site"),
      supersede: ["target-site"],
      revoke: ["target-site"],
    },
    resolution_effect: "eligibility-constraint",
    composition: "accumulate",
    phase: 10,
    conflict_semantics: "All applicable constraints accumulate; an unsatisfiable set is a typed policy conflict.",
  },
  "principal-consent": {
    statement_kind: "principal-consent",
    statement_class: "policy",
    authorized_actions: {
      originate: ["principal"],
      materialize: admittedMaterializers("principal"),
      supersede: ["principal"],
      revoke: ["principal"],
    },
    resolution_effect: "consent-gate",
    composition: "explicit-grant-with-deny-dominance",
    phase: 20,
    conflict_semantics: "Consent must be explicit and scope-matched; a principal prohibition or revocation dominates a grant.",
  },
  "principal-prohibition": {
    statement_kind: "principal-prohibition",
    statement_class: "policy",
    authorized_actions: {
      originate: ["principal"],
      materialize: admittedMaterializers("principal"),
      supersede: ["principal"],
      revoke: ["principal"],
    },
    resolution_effect: "eligibility-constraint",
    composition: "accumulate",
    phase: 10,
    conflict_semantics: "Applicable prohibitions accumulate and cannot be weakened by preferences, defaults, or foreign materialization.",
  },
  "user-preference": {
    statement_kind: "user-preference",
    statement_class: "policy",
    authorized_actions: {
      originate: ["user-site"],
      materialize: admittedMaterializers("user-site"),
      supersede: ["user-site"],
      revoke: ["user-site"],
    },
    resolution_effect: "ranking",
    composition: "weighted-ranking",
    phase: 30,
    conflict_semantics: "Preferences rank only already-eligible candidates and never grant consent or override a constraint.",
  },
  "target-default": {
    statement_kind: "target-default",
    statement_class: "policy",
    authorized_actions: {
      originate: ["target-site"],
      materialize: admittedMaterializers("target-site"),
      supersede: ["target-site"],
      revoke: ["target-site"],
    },
    resolution_effect: "fallback",
    composition: "fill-unset-only",
    phase: 40,
    conflict_semantics: "Defaults fill only unresolved values after eligibility, consent, and explicit preference; conflicting defaults are invalid.",
  },
  "execution-feasibility": {
    statement_kind: "execution-feasibility",
    statement_class: "policy",
    authorized_actions: {
      originate: ["execution-site"],
      materialize: admittedMaterializers("execution-site"),
      supersede: ["execution-site"],
      revoke: ["execution-site"],
    },
    resolution_effect: "eligibility-constraint",
    composition: "conjunctive-feasibility",
    phase: 10,
    conflict_semantics: "Every execution-path requirement must be feasible at the selected execution Site; ranking cannot repair infeasibility.",
  },
  "declared-capability": {
    statement_kind: "declared-capability",
    statement_class: "assertion",
    authorized_actions: {
      originate: ["resource-owner"],
      materialize: admittedMaterializers("resource-owner"),
      supersede: ["resource-owner"],
      revoke: ["resource-owner"],
    },
    resolution_effect: "capability-evidence",
    composition: "freshest-valid-per-origin",
    phase: 10,
    conflict_semantics: "Declarations are evidence, not permission; stale or mutually incompatible current declarations make capability support unresolved.",
  },
  "observed-capability": {
    statement_kind: "observed-capability",
    statement_class: "assertion",
    authorized_actions: {
      originate: ["runtime-observer"],
      materialize: admittedMaterializers("runtime-observer"),
      supersede: ["runtime-observer"],
      revoke: ["runtime-observer"],
    },
    resolution_effect: "capability-evidence",
    composition: "freshest-valid-per-origin",
    phase: 10,
    conflict_semantics: "Observed support is scoped to the observed route and validity interval; observation does not become governance or consent.",
  },
} as const satisfies Record<IntelligenceStatementKind, IntelligenceAuthorityMatrixEntry>;

export interface IntelligenceAuthorityOrigin {
  locus: IntelligenceAuthorityLocus;
  /** Required for Site-scoped loci; identifies the authority object, not merely a folder. */
  site_id?: string;
  /** Required for principal-originated consent and prohibition. */
  principal_id?: string;
  /** Durable authority or provenance record supporting the statement. */
  authority_ref: string;
}

export interface IntelligenceAuthorityStatement {
  schema: typeof INTELLIGENCE_AUTHORITY_STATEMENT_SCHEMA;
  id: string;
  kind: IntelligenceStatementKind;
  origin: IntelligenceAuthorityOrigin;
  effect: IntelligenceResolutionEffect;
  revision: number;
  issued_at: string;
  payload_ref: string;
  supersedes?: string;
}

export type IntelligenceAuthorityAction = "originate" | "materialize" | "supersede" | "revoke";

export interface IntelligenceAuthorityActionRequest {
  action: IntelligenceAuthorityAction;
  actor_role: IntelligenceAuthorityActorRole;
  actor_site_id?: string;
  actor_principal_id?: string;
  statement: IntelligenceAuthorityStatement;
  /** Materialization must preserve kind and effect byte-for-byte. */
  materialized_as?: Pick<IntelligenceAuthorityStatement, "kind" | "effect">;
}

export type IntelligenceAuthorityDiagnosticCode =
  | "unknown-statement-kind"
  | "origin-not-authorized"
  | "action-not-authorized"
  | "authority-identity-mismatch"
  | "effect-mismatch"
  | "cross-locus-escalation"
  | "invalid-authority-statement";

export interface IntelligenceAuthorityDiagnostic {
  code: IntelligenceAuthorityDiagnosticCode;
  statement_id: string;
  statement_kind?: IntelligenceStatementKind;
  action?: IntelligenceAuthorityAction;
  expected?: unknown;
  actual?: unknown;
  message: string;
}

/** Resolver-facing provenance: every authority-bearing decision is inspectable. */
export interface IntelligenceAuthorityDecisionProvenance {
  statement_id: string;
  statement_kind: IntelligenceStatementKind;
  origin: IntelligenceAuthorityOrigin;
  effect: IntelligenceResolutionEffect;
  disposition: "applied" | "rejected" | "not-applicable";
  reason_code?: IntelligenceAuthorityDiagnosticCode | IntelligenceAuthorityRefusalCode;
}

export interface IntelligenceAuthorityResolutionProvenance {
  schema: "narada.invokable-intelligence.authority-resolution-provenance.v1";
  decisions: IntelligenceAuthorityDecisionProvenance[];
}

/** Typed refusal reasons contributed by the authority layer to invocation resolution. */
export type IntelligenceAuthorityRefusalCode =
  | "unauthorized-authority-statement"
  | "cross-locus-authority-escalation"
  | "principal-consent-required"
  | "principal-prohibited"
  | "authority-policy-conflict";

const SITE_SCOPED_LOCI: readonly IntelligenceAuthorityLocus[] = [
  "target-site",
  "user-site",
  "execution-site",
  "resource-owner",
  "runtime-observer",
];

export function validateIntelligenceAuthorityStatement(
  statement: IntelligenceAuthorityStatement,
): IntelligenceAuthorityDiagnostic[] {
  const diagnostics: IntelligenceAuthorityDiagnostic[] = [];
  const matrix = INTELLIGENCE_AUTHORITY_MATRIX as Record<string, IntelligenceAuthorityMatrixEntry>;
  const rule = matrix[statement.kind];
  if (!rule) {
    return [{
      code: "unknown-statement-kind",
      statement_id: statement.id,
      actual: statement.kind,
      message: `Unknown intelligence statement kind: ${String(statement.kind)}`,
    }];
  }
  if (statement.schema !== INTELLIGENCE_AUTHORITY_STATEMENT_SCHEMA || !statement.id || !statement.payload_ref || statement.revision < 1) {
    diagnostics.push({
      code: "invalid-authority-statement",
      statement_id: statement.id,
      statement_kind: statement.kind,
      message: "Authority statement requires the v1 schema, identity, payload reference, and a positive revision.",
    });
  }
  if (!rule.authorized_actions.originate.includes(statement.origin.locus as never)) {
    diagnostics.push({
      code: "origin-not-authorized",
      statement_id: statement.id,
      statement_kind: statement.kind,
      expected: rule.authorized_actions.originate,
      actual: statement.origin.locus,
      message: `${statement.origin.locus} may not originate ${statement.kind}.`,
    });
  }
  if (statement.effect !== rule.resolution_effect) {
    diagnostics.push({
      code: "effect-mismatch",
      statement_id: statement.id,
      statement_kind: statement.kind,
      expected: rule.resolution_effect,
      actual: statement.effect,
      message: `${statement.kind} may only have the ${rule.resolution_effect} resolution effect.`,
    });
  }
  if (SITE_SCOPED_LOCI.includes(statement.origin.locus) && !statement.origin.site_id) {
    diagnostics.push({
      code: "invalid-authority-statement",
      statement_id: statement.id,
      statement_kind: statement.kind,
      message: `${statement.origin.locus} statements require site_id.`,
    });
  }
  if (statement.origin.locus === "principal" && !statement.origin.principal_id) {
    diagnostics.push({
      code: "invalid-authority-statement",
      statement_id: statement.id,
      statement_kind: statement.kind,
      message: "Principal consent and prohibition require principal_id.",
    });
  }
  return diagnostics;
}

export function validateIntelligenceAuthorityAction(
  request: IntelligenceAuthorityActionRequest,
): IntelligenceAuthorityDiagnostic[] {
  const diagnostics = validateIntelligenceAuthorityStatement(request.statement);
  const rule = INTELLIGENCE_AUTHORITY_MATRIX[request.statement.kind];
  const allowed = rule.authorized_actions[request.action] as readonly IntelligenceAuthorityActorRole[];
  if (!allowed.includes(request.actor_role)) {
    diagnostics.push({
      code: "action-not-authorized",
      statement_id: request.statement.id,
      statement_kind: request.statement.kind,
      action: request.action,
      expected: allowed,
      actual: request.actor_role,
      message: `${request.actor_role} may not ${request.action} ${request.statement.kind}.`,
    });
  }
  const sameOriginActor = request.actor_role === request.statement.origin.locus;
  if (sameOriginActor && request.statement.origin.site_id && request.actor_site_id !== request.statement.origin.site_id) {
    diagnostics.push({
      code: "authority-identity-mismatch",
      statement_id: request.statement.id,
      statement_kind: request.statement.kind,
      action: request.action,
      expected: request.statement.origin.site_id,
      actual: request.actor_site_id,
      message: "The acting Site is not the statement's originating authority object.",
    });
  }
  if (sameOriginActor && request.statement.origin.principal_id && request.actor_principal_id !== request.statement.origin.principal_id) {
    diagnostics.push({
      code: "authority-identity-mismatch",
      statement_id: request.statement.id,
      statement_kind: request.statement.kind,
      action: request.action,
      expected: request.statement.origin.principal_id,
      actual: request.actor_principal_id,
      message: "The acting principal is not the statement's originating authority.",
    });
  }
  if (
    request.action === "materialize"
    && request.materialized_as
    && (request.materialized_as.kind !== request.statement.kind || request.materialized_as.effect !== request.statement.effect)
  ) {
    diagnostics.push({
      code: "cross-locus-escalation",
      statement_id: request.statement.id,
      statement_kind: request.statement.kind,
      action: request.action,
      expected: { kind: request.statement.kind, effect: request.statement.effect },
      actual: request.materialized_as,
      message: "Materialization must preserve statement kind and resolution effect; storage at another locus cannot promote authority.",
    });
  }
  return diagnostics;
}

export interface IntelligenceAuthorityApplicationPlan {
  constraints: IntelligenceAuthorityStatement[];
  consent_gates: IntelligenceAuthorityStatement[];
  ranking: IntelligenceAuthorityStatement[];
  fallbacks: IntelligenceAuthorityStatement[];
  capability_evidence: IntelligenceAuthorityStatement[];
  diagnostics: IntelligenceAuthorityDiagnostic[];
}

/**
 * Produces the canonical, deterministic application phases used by a
 * resolver.  Payload evaluation remains a resolver concern; this function
 * prevents authority categories from being reordered or reinterpreted.
 */
export function planIntelligenceAuthorityApplication(
  statements: readonly IntelligenceAuthorityStatement[],
): IntelligenceAuthorityApplicationPlan {
  const diagnostics = statements.flatMap(validateIntelligenceAuthorityStatement);
  const validIds = new Set(
    statements
      .filter((statement) => !diagnostics.some((diagnostic) => diagnostic.statement_id === statement.id))
      .map((statement) => statement.id),
  );
  const accepted = [...statements]
    .filter((statement) => validIds.has(statement.id))
    .sort((a, b) => {
      const phase = INTELLIGENCE_AUTHORITY_MATRIX[a.kind].phase - INTELLIGENCE_AUTHORITY_MATRIX[b.kind].phase;
      return phase || a.kind.localeCompare(b.kind) || a.id.localeCompare(b.id);
    });
  const byEffect = (effect: IntelligenceResolutionEffect) =>
    accepted.filter((statement) => statement.effect === effect);
  return {
    constraints: byEffect("eligibility-constraint"),
    consent_gates: byEffect("consent-gate"),
    ranking: byEffect("ranking"),
    fallbacks: byEffect("fallback"),
    capability_evidence: byEffect("capability-evidence"),
    diagnostics,
  };
}
