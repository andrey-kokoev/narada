/** Deterministic plan snapshots, time inputs, revalidation, and lineage. */

export const PLAN_DECISION_SNAPSHOT_SCHEMA = "narada.invokable-intelligence.plan-decision-snapshot.v1" as const;
export const PLAN_REVALIDATION_EVIDENCE_SCHEMA = "narada.invokable-intelligence.plan-revalidation-evidence.v1" as const;

export type ContentDigest = string;

export interface AuthoritativeDecisionClock {
  /** Time is an explicit resolver input; implementations must not read the wall clock implicitly. */
  source: "execution-site-clock" | "operator-supplied" | "scheduled-trigger" | "test-clock";
  authority_ref: string;
  instant: string;
  /** IANA zone or UTC used by time-window policies. */
  timezone: string;
  /** Explicit normalized local fields produced by the named clock authority. */
  local: {
    date: string;
    time: string;
    weekday: 0 | 1 | 2 | 3 | 4 | 5 | 6;
  };
}

export type PlanRevisionKind =
  | "catalog"
  | "policy"
  | "assertion"
  | "topology"
  | "access"
  | "credential-binding"
  | "materialization";

export interface ImmutableRevisionRef {
  kind: PlanRevisionKind;
  record_id: string;
  revision: string;
  digest: ContentDigest;
  /** Content-addressed or otherwise immutable historical readback location. */
  immutable_ref: string;
}

export interface PlanSnapshotDigests {
  normalized_resolver_input: ContentDigest;
  catalog: ContentDigest;
  policy: ContentDigest;
  assertions: ContentDigest;
  topology: ContentDigest;
  access: ContentDigest;
  /** Destination-admitted cross-Site projections used by this decision. */
  materialization: ContentDigest;
}

export type PlanRevalidationTrigger =
  | "before-queued-attempt"
  | "at-scheduled-window"
  | "before-retry"
  | "before-resume"
  | "catalog-change"
  | "policy-change"
  | "assertion-expiry"
  | "topology-change"
  | "access-change"
  | "materialization-change"
  | "credential-change"
  | "quota-change";

export interface PlanDecisionSnapshot {
  schema: typeof PLAN_DECISION_SNAPSHOT_SCHEMA;
  plan_id: string;
  intent_id: string;
  resolved_at: string;
  clock: AuthoritativeDecisionClock;
  resolver_version: string;
  digests: PlanSnapshotDigests;
  snapshot_digest: ContentDigest;
  /** Required upper validity boundary; callers may choose a short immediate-use boundary. */
  valid_until: string;
  revalidation_triggers: PlanRevalidationTrigger[];
  referenced_revisions: ImmutableRevisionRef[];
  lineage: {
    relation: "initial" | "replan-of";
    predecessor_plan_id?: string;
  };
}

export type PlanAttemptMode = "immediate" | "queued-batch" | "delayed" | "retry" | "resume";

export interface PlanUseContext {
  evaluated_at: string;
  clock: AuthoritativeDecisionClock;
  mode: PlanAttemptMode;
  current_digests: PlanSnapshotDigests;
  observed_triggers: PlanRevalidationTrigger[];
  /** False means execution must refuse rather than silently create a replacement plan. */
  replan_available: boolean;
  predecessor_attempt_id?: string;
}

export type PlanUseDecision = "reuse" | "revalidated" | "replan-required" | "refuse-stale-plan";

export type PlanStalenessReason =
  | "plan-expired"
  | "catalog-changed"
  | "policy-changed"
  | "assertions-changed"
  | "topology-changed"
  | "access-changed"
  | "materialization-changed"
  | "normalized-input-changed"
  | "required-revalidation-trigger"
  | "invalid-snapshot";

export interface PlanUseEvaluation {
  decision: PlanUseDecision;
  reasons: PlanStalenessReason[];
  checked_at: string;
  requires_provider_refusal: boolean;
  attempt_binding: AttemptPlanBinding;
}

export interface AttemptPlanBinding {
  plan_id: string;
  relation: "initial" | "reused" | "revalidated" | "replanned";
  predecessor_plan_id?: string;
  predecessor_attempt_id?: string;
}

export interface PlanRevalidationEvidence {
  schema: typeof PLAN_REVALIDATION_EVIDENCE_SCHEMA;
  id: string;
  intent_id: string;
  plan_id: string;
  evaluated_at: string;
  mode: PlanAttemptMode;
  decision: PlanUseDecision;
  reasons: PlanStalenessReason[];
  prior_snapshot_digest: ContentDigest;
  compared_digests: PlanSnapshotDigests;
  clock_authority_ref: string;
  replacement_plan_id?: string;
}

export type TemporalDiagnosticCode =
  | "invalid-plan-snapshot"
  | "invalid-time"
  | "invalid-clock"
  | "invalid-digest"
  | "missing-revalidation-trigger"
  | "missing-immutable-revision"
  | "invalid-plan-lineage";

export interface TemporalDiagnostic {
  code: TemporalDiagnosticCode;
  path: string;
  message: string;
}

const DIGEST_PATTERN = /^sha256:[a-f0-9]{64}$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d{1,9})?)?$/;

const validInstant = (value: string) => typeof value === "string" && Number.isFinite(Date.parse(value));

export function validateAuthoritativeDecisionClock(
  clock: AuthoritativeDecisionClock,
  path = "$.clock",
): TemporalDiagnostic[] {
  const diagnostics: TemporalDiagnostic[] = [];
  if (!clock.authority_ref || !clock.timezone || !validInstant(clock.instant)) {
    diagnostics.push({ code: "invalid-clock", path, message: "Clock requires authority_ref, timezone, and a valid explicit instant." });
  }
  if (!DATE_PATTERN.test(clock.local.date) || !TIME_PATTERN.test(clock.local.time) || clock.local.weekday < 0 || clock.local.weekday > 6) {
    diagnostics.push({ code: "invalid-clock", path: `${path}.local`, message: "Clock requires normalized local date, time, and weekday fields." });
  }
  return diagnostics;
}

const validateDigest = (digest: string, path: string): TemporalDiagnostic[] =>
  DIGEST_PATTERN.test(digest)
    ? []
    : [{ code: "invalid-digest", path, message: "Digest must be a lowercase sha256 content digest." }];

export function validatePlanDecisionSnapshot(snapshot: PlanDecisionSnapshot): TemporalDiagnostic[] {
  const diagnostics: TemporalDiagnostic[] = [];
  if (snapshot.schema !== PLAN_DECISION_SNAPSHOT_SCHEMA || !snapshot.plan_id || !snapshot.intent_id || !snapshot.resolver_version) {
    diagnostics.push({ code: "invalid-plan-snapshot", path: "$", message: "Plan snapshot requires the v1 schema, plan, intent, and resolver identities." });
  }
  if (!validInstant(snapshot.resolved_at) || !validInstant(snapshot.valid_until)) {
    diagnostics.push({ code: "invalid-time", path: "$", message: "resolved_at and valid_until must be explicit ISO-compatible instants." });
  } else if (Date.parse(snapshot.valid_until) <= Date.parse(snapshot.resolved_at)) {
    diagnostics.push({ code: "invalid-time", path: "$.valid_until", message: "valid_until must be later than resolved_at." });
  }
  diagnostics.push(...validateAuthoritativeDecisionClock(snapshot.clock));
  if (snapshot.clock.instant !== snapshot.resolved_at) {
    diagnostics.push({ code: "invalid-clock", path: "$.clock.instant", message: "Resolution clock instant must equal resolved_at." });
  }
  for (const [name, digest] of Object.entries(snapshot.digests)) {
    diagnostics.push(...validateDigest(digest, `$.digests.${name}`));
  }
  diagnostics.push(...validateDigest(snapshot.snapshot_digest, "$.snapshot_digest"));
  if (!snapshot.revalidation_triggers.length) {
    diagnostics.push({ code: "missing-revalidation-trigger", path: "$.revalidation_triggers", message: "Every plan must declare at least one condition requiring revalidation." });
  }
  if (!snapshot.referenced_revisions.length) {
    diagnostics.push({ code: "missing-immutable-revision", path: "$.referenced_revisions", message: "Historical explanation requires immutable referenced revisions." });
  }
  snapshot.referenced_revisions.forEach((revision, index) => {
    diagnostics.push(...validateDigest(revision.digest, `$.referenced_revisions[${index}].digest`));
    if (!revision.record_id || !revision.revision || !revision.immutable_ref) {
      diagnostics.push({
        code: "missing-immutable-revision",
        path: `$.referenced_revisions[${index}]`,
        message: "Referenced revisions require record, revision, digest, and immutable readback reference.",
      });
    }
  });
  if (snapshot.lineage.relation === "initial" && snapshot.lineage.predecessor_plan_id) {
    diagnostics.push({ code: "invalid-plan-lineage", path: "$.lineage", message: "An initial plan cannot name a predecessor." });
  }
  if (snapshot.lineage.relation === "replan-of" && !snapshot.lineage.predecessor_plan_id) {
    diagnostics.push({ code: "invalid-plan-lineage", path: "$.lineage", message: "A replacement plan must name its predecessor." });
  }
  return diagnostics;
}

const revalidationTriggerForMode: Record<Exclude<PlanAttemptMode, "immediate">, PlanRevalidationTrigger> = {
  "queued-batch": "before-queued-attempt",
  delayed: "at-scheduled-window",
  retry: "before-retry",
  resume: "before-resume",
};

const changedDigestReasons: Array<[keyof PlanSnapshotDigests, PlanStalenessReason]> = [
  ["normalized_resolver_input", "normalized-input-changed"],
  ["catalog", "catalog-changed"],
  ["policy", "policy-changed"],
  ["assertions", "assertions-changed"],
  ["topology", "topology-changed"],
  ["access", "access-changed"],
  ["materialization", "materialization-changed"],
];

/**
 * Evaluate plan reuse from explicit inputs only.  This function deliberately
 * has no Date.now(), process environment, registry read, or mutable singleton.
 */
export function evaluatePlanUse(snapshot: PlanDecisionSnapshot, context: PlanUseContext): PlanUseEvaluation {
  const reasons: PlanStalenessReason[] = [];
  if (validatePlanDecisionSnapshot(snapshot).length || validateAuthoritativeDecisionClock(context.clock, "$.context.clock").length) {
    reasons.push("invalid-snapshot");
  }
  if (!validInstant(context.evaluated_at) || context.clock.instant !== context.evaluated_at) {
    if (!reasons.includes("invalid-snapshot")) reasons.push("invalid-snapshot");
  } else if (Date.parse(context.evaluated_at) >= Date.parse(snapshot.valid_until)) {
    reasons.push("plan-expired");
  }
  for (const [key, reason] of changedDigestReasons) {
    if (snapshot.digests[key] !== context.current_digests[key]) reasons.push(reason);
  }

  const modeTrigger = context.mode === "immediate" ? undefined : revalidationTriggerForMode[context.mode];
  const requiresModeRevalidation = Boolean(modeTrigger && snapshot.revalidation_triggers.includes(modeTrigger));
  if (modeTrigger && !context.observed_triggers.includes(modeTrigger)) {
    reasons.push("required-revalidation-trigger");
  }

  const stale = reasons.length > 0;
  const decision: PlanUseDecision = stale
    ? context.replan_available ? "replan-required" : "refuse-stale-plan"
    : requiresModeRevalidation ? "revalidated" : "reuse";
  return {
    decision,
    reasons,
    checked_at: context.evaluated_at,
    requires_provider_refusal: decision === "replan-required" || decision === "refuse-stale-plan",
    attempt_binding: {
      plan_id: snapshot.plan_id,
      relation: decision === "revalidated" ? "revalidated" : decision === "reuse" ? (context.mode === "immediate" ? "initial" : "reused") : "replanned",
      ...(snapshot.lineage.predecessor_plan_id ? { predecessor_plan_id: snapshot.lineage.predecessor_plan_id } : {}),
      ...(context.predecessor_attempt_id ? { predecessor_attempt_id: context.predecessor_attempt_id } : {}),
    },
  };
}

export interface TemporalWindow {
  timezone: string;
  weekdays: Array<0 | 1 | 2 | 3 | 4 | 5 | 6>;
  start_local: string;
  end_local: string;
}

const minuteOfDay = (value: string): number | null => {
  if (!TIME_PATTERN.test(value)) return null;
  const [hour, minute] = value.split(":").map(Number);
  return hour * 60 + minute;
};

/** Evaluate an off-peak/scheduled window against explicit normalized clock fields. */
export function isWithinTemporalWindow(window: TemporalWindow, clock: AuthoritativeDecisionClock): boolean {
  if (window.timezone !== clock.timezone || !window.weekdays.includes(clock.local.weekday)) return false;
  const current = minuteOfDay(clock.local.time);
  const start = minuteOfDay(window.start_local);
  const end = minuteOfDay(window.end_local);
  if (current === null || start === null || end === null) return false;
  return start <= end ? current >= start && current < end : current >= start || current < end;
}
