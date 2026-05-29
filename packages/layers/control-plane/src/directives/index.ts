import { createHash } from "node:crypto";

export const DIRECTIVE_SCHEMA = "narada.directive.v1" as const;
export const DIRECTIVE_EVENT_SCHEMA = "narada.directive-event.v1" as const;
export const DIRECTIVE_EMISSION_AUTHORIZATION_SCHEMA = "narada.directive-emission-authorization.v1" as const;

export type DirectiveSourceKind = "operator" | "agent" | "system";

export type DirectiveKind =
  | "instruction"
  | "attention"
  | "constraint"
  | "policy"
  | "handoff"
  | "pause"
  | "escalation";

export type DirectiveTargetKind =
  | "agent"
  | "carrier"
  | "site"
  | "role"
  | "task"
  | "session"
  | "workspace";

export type DirectiveContentKind =
  | "instruction"
  | "constraint"
  | "routing"
  | "delivery"
  | "context"
  | "plain_text"
  | "task_ref"
  | "work_ref"
  | "source_ref"
  | "policy_ref"
  | "structured_instruction";

export type DirectiveAdmissionStatus =
  | "candidate"
  | "admitted"
  | "refused"
  | "delivered"
  | "superseded"
  | "expired";

export type DirectiveDeliveryStatus =
  | "pending"
  | "leased"
  | "delivered"
  | "receipt_recorded"
  | "failed"
  | "expired";

export type DirectiveTriageStatus =
  | "untriaged"
  | "carrier_accepted"
  | "accepted"
  | "refused"
  | "ignored_stale"
  | "superseded"
  | "blocked"
  | "needs_operator";

export type DirectiveRefKind = "task" | "work" | "source" | "policy" | "carrier" | "session";

export interface DirectiveSource {
  readonly kind: DirectiveSourceKind;
  readonly id: string;
  readonly label?: string;
}

export interface DirectiveAuthority {
  readonly locus: string;
  readonly basis: string;
}

export interface DirectiveTarget {
  readonly kind: DirectiveTargetKind;
  readonly id: string;
}

export interface DirectiveRef {
  readonly kind: DirectiveRefKind;
  readonly id: string;
  readonly locus?: string;
  readonly relation?: string;
}

export interface DirectiveContent {
  readonly kind: DirectiveContentKind;
  readonly text: string;
  readonly refs?: readonly DirectiveRef[];
  readonly data?: Record<string, unknown>;
}

export interface DirectiveOrdering {
  readonly priority: number;
  readonly sequence: number;
  readonly not_before?: string;
  readonly expires_at?: string;
}

export interface DirectiveAdmission {
  readonly status: DirectiveAdmissionStatus;
  readonly decided_at?: string;
  readonly decided_by?: string;
  readonly reason?: string;
}

export interface DirectiveDelivery {
  readonly status?: DirectiveDeliveryStatus;
  readonly delivered_at?: string;
  readonly transport?: string;
  readonly artifact_ref?: string;
  readonly lease_id?: string;
  readonly leased_until?: string;
  readonly carrier_session_id?: string;
  readonly receipt_id?: string;
}

export interface Directive {
  readonly schema: typeof DIRECTIVE_SCHEMA;
  readonly directive_id: string;
  readonly kind: DirectiveKind;
  readonly created_at: string;
  readonly source: DirectiveSource;
  readonly authority: DirectiveAuthority;
  readonly target: DirectiveTarget;
  readonly content: DirectiveContent;
  readonly ordering: DirectiveOrdering;
  readonly admission: DirectiveAdmission;
  readonly delivery?: DirectiveDelivery;
}

export interface DirectiveDraft {
  readonly kind?: DirectiveKind;
  readonly created_at: string;
  readonly source: DirectiveSource;
  readonly authority: DirectiveAuthority;
  readonly target: DirectiveTarget;
  readonly content: DirectiveContent;
  readonly ordering?: Partial<DirectiveOrdering>;
}

export interface DirectiveEmissionAuthorization {
  readonly schema: typeof DIRECTIVE_EMISSION_AUTHORIZATION_SCHEMA;
  readonly authorization_id: string;
  readonly authorized_at: string;
  readonly authorized_by: DirectiveSource;
  readonly authorized_emitter: DirectiveSource;
  readonly authority: DirectiveAuthority;
  readonly directive_template: {
    readonly target: DirectiveTarget;
    readonly content: DirectiveContent;
    readonly ordering?: Partial<DirectiveOrdering>;
  };
  readonly status: "authorized";
}

export interface DirectiveDeliveryAttempt {
  readonly schema: "narada.directive-delivery-attempt.v1";
  readonly attempt_id: string;
  readonly directive_id: string;
  readonly attempted_at: string;
  readonly target: DirectiveTarget;
  readonly transport: string;
  readonly status: "leased" | "delivered" | "failed" | "expired";
  readonly lease_id?: string;
  readonly leased_until?: string;
  readonly carrier_session_id?: string;
  readonly reason?: string;
}

export interface DirectiveReceipt {
  readonly schema: "narada.directive-receipt.v1";
  readonly receipt_id: string;
  readonly directive_id: string;
  readonly received_at: string;
  readonly carrier_session_id: string;
  readonly agent_id: string;
  readonly transport: string;
}

export interface DirectiveTriageRecord {
  readonly schema: "narada.directive-triage.v1";
  readonly triage_id: string;
  readonly directive_id: string;
  readonly triaged_at: string;
  readonly agent_id: string;
  readonly status: DirectiveTriageStatus;
  readonly reason?: string;
  readonly selected_work_ref?: DirectiveRef;
}

export interface DirectiveValidationResult {
  readonly valid: boolean;
  readonly errors: string[];
  readonly warnings: string[];
}

export type DirectiveEventKind =
  | "directive.emission_authorized"
  | "directive.created"
  | "directive.admitted"
  | "directive.refused"
  | "directive.delivery_leased"
  | "directive.delivered"
  | "directive.receipt_recorded"
  | "directive.triaged"
  | "directive.superseded"
  | "directive.expired";

export interface DirectiveEvent {
  readonly schema: typeof DIRECTIVE_EVENT_SCHEMA;
  readonly event_id: string;
  readonly directive_id: string;
  readonly kind: DirectiveEventKind;
  readonly occurred_at: string;
  readonly actor: string;
  readonly reason?: string;
  readonly artifact_ref?: string;
  readonly authorization_id?: string;
}

export function createDirectiveEmissionAuthorization(args: Omit<DirectiveEmissionAuthorization, "schema" | "authorization_id">): DirectiveEmissionAuthorization {
  const authorization: Omit<DirectiveEmissionAuthorization, "authorization_id"> = {
    schema: DIRECTIVE_EMISSION_AUTHORIZATION_SCHEMA,
    ...args,
  };
  return {
    ...authorization,
    authorization_id: `auth_${hashStable(authorization).slice(0, 32)}`,
  };
}

export function createDirective(draft: DirectiveDraft): Directive {
  const directive: Omit<Directive, "directive_id"> = {
    schema: DIRECTIVE_SCHEMA,
    kind: draft.kind ?? inferDirectiveKind(draft.content.kind),
    created_at: draft.created_at,
    source: draft.source,
    authority: draft.authority,
    target: draft.target,
    content: draft.content,
    ordering: {
      priority: draft.ordering?.priority ?? 0,
      sequence: draft.ordering?.sequence ?? 0,
      not_before: draft.ordering?.not_before,
      expires_at: draft.ordering?.expires_at,
    },
    admission: { status: "candidate" },
  };

  return {
    ...directive,
    directive_id: `dir_${hashStable(directive).slice(0, 32)}`,
  };
}

export function admitDirective(
  directive: Directive,
  decision: { readonly decided_at: string; readonly decided_by: string; readonly reason?: string },
): Directive {
  return {
    ...directive,
    admission: {
      status: "admitted",
      decided_at: decision.decided_at,
      decided_by: decision.decided_by,
      reason: decision.reason,
    },
  };
}

export function refuseDirective(
  directive: Directive,
  decision: { readonly decided_at: string; readonly decided_by: string; readonly reason: string },
): Directive {
  return {
    ...directive,
    admission: {
      status: "refused",
      decided_at: decision.decided_at,
      decided_by: decision.decided_by,
      reason: decision.reason,
    },
  };
}

export function markDirectiveDelivered(
  directive: Directive,
  delivery: { readonly delivered_at: string; readonly transport: string; readonly artifact_ref?: string },
): Directive {
  return {
    ...directive,
    admission: {
      ...directive.admission,
      status: "delivered",
    },
    delivery,
  };
}

export function markDirectiveDeliveryLeased(
  directive: Directive,
  lease: { readonly lease_id: string; readonly leased_until: string; readonly transport: string; readonly carrier_session_id?: string },
): Directive {
  return {
    ...directive,
    delivery: {
      status: "leased",
      lease_id: lease.lease_id,
      leased_until: lease.leased_until,
      transport: lease.transport,
      carrier_session_id: lease.carrier_session_id,
    },
  };
}

export function recordDirectiveReceipt(
  directive: Directive,
  receipt: Omit<DirectiveReceipt, "schema" | "receipt_id" | "directive_id">,
): { readonly directive: Directive; readonly receipt: DirectiveReceipt } {
  const base = {
    schema: "narada.directive-receipt.v1" as const,
    directive_id: directive.directive_id,
    ...receipt,
  };
  const recorded = {
    ...base,
    receipt_id: `dirrcpt_${hashStable(base).slice(0, 32)}`,
  };
  return {
    directive: {
      ...directive,
      delivery: {
        ...(directive.delivery ?? {}),
        status: "receipt_recorded",
        delivered_at: directive.delivery?.delivered_at ?? receipt.received_at,
        transport: receipt.transport,
        carrier_session_id: receipt.carrier_session_id,
        receipt_id: recorded.receipt_id,
      },
    },
    receipt: recorded,
  };
}

export function createDirectiveTriageRecord(
  directive: Directive,
  triage: Omit<DirectiveTriageRecord, "schema" | "triage_id" | "directive_id">,
): DirectiveTriageRecord {
  const base = {
    schema: "narada.directive-triage.v1" as const,
    directive_id: directive.directive_id,
    ...triage,
  };
  return {
    ...base,
    triage_id: `dirtriage_${hashStable(base).slice(0, 32)}`,
  };
}

export function validateDirectiveForAdmission(
  directive: Directive,
  options: {
    readonly authorityLocus?: string;
    readonly residentAgentId?: string;
    readonly residentRole?: string;
  } = {},
): DirectiveValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!directive.source.kind || !directive.source.id) errors.push("missing_source_identity");
  if (!directive.authority.locus) errors.push("missing_authority_locus");
  if (!directive.authority.basis) errors.push("missing_authority_basis");
  if (options.authorityLocus && directive.authority.locus !== options.authorityLocus) {
    errors.push(`authority_locus_mismatch:${directive.authority.locus}`);
  }
  if (!directive.target.kind || !directive.target.id) errors.push("missing_target");
  if (!directive.content.kind) errors.push("missing_content_kind");

  if (directive.kind === "attention" && directive.source.kind === "system") {
    const hasWorkRef = (directive.content.refs ?? []).some((ref) => ref.kind === "task" || ref.kind === "work");
    if (!hasWorkRef) errors.push("system_attention_directive_requires_task_or_work_ref");
    const targetsResident =
      (options.residentAgentId && directive.target.kind === "agent" && directive.target.id === options.residentAgentId)
      || (options.residentRole && directive.target.kind === "role" && directive.target.id === options.residentRole);
    if (!targetsResident && (options.residentAgentId || options.residentRole)) {
      warnings.push("system_attention_directive_not_targeted_to_configured_resident");
    }
  }

  if ((directive.content.kind === "plain_text" || directive.content.kind === "instruction") && directive.content.data?.["execute"] === true) {
    errors.push("plain_text_or_instruction_cannot_assert_execution_authority");
  }

  return { valid: errors.length === 0, errors, warnings };
}

export function directiveEvent(
  directive: Directive,
  event: Omit<DirectiveEvent, "schema" | "event_id" | "directive_id">,
): DirectiveEvent {
  const base = {
    schema: DIRECTIVE_EVENT_SCHEMA,
    directive_id: directive.directive_id,
    ...event,
  };

  return {
    ...base,
    event_id: `direvt_${hashStable(base).slice(0, 32)}`,
  };
}

export function compareDirectives(left: Directive, right: Directive): number {
  return (
    right.ordering.priority - left.ordering.priority ||
    left.ordering.sequence - right.ordering.sequence ||
    left.created_at.localeCompare(right.created_at) ||
    left.directive_id.localeCompare(right.directive_id)
  );
}

export function activeAdmittedDirectives(
  directives: readonly Directive[],
  nowIso: string,
): Directive[] {
  return directives
    .filter((directive) => directive.admission.status === "admitted")
    .filter((directive) => !directive.ordering.not_before || directive.ordering.not_before <= nowIso)
    .filter((directive) => !directive.ordering.expires_at || directive.ordering.expires_at > nowIso)
    .slice()
    .sort(compareDirectives);
}

export function renderDirectivePromptContext(directives: readonly Directive[]): string {
  return directives
    .map((directive) => {
      const label = `${directive.kind}/${directive.content.kind}:${directive.directive_id}`;
      return `[${label}]\n${directive.content.text}`;
    })
    .join("\n\n");
}

function inferDirectiveKind(contentKind: DirectiveContentKind): DirectiveKind {
  if (contentKind === "constraint" || contentKind === "policy_ref") return "constraint";
  if (contentKind === "routing" || contentKind === "delivery") return "handoff";
  if (contentKind === "task_ref" || contentKind === "work_ref" || contentKind === "source_ref") return "attention";
  return "instruction";
}

function hashStable(value: unknown): string {
  return createHash("sha256").update(stableStringify(value)).digest("hex");
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }

  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .filter((key) => record[key] !== undefined)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
    .join(",")}}`;
}
