import { createHash } from "node:crypto";

export const DIRECTIVE_SCHEMA = "narada.directive.v1" as const;
export const DIRECTIVE_EVENT_SCHEMA = "narada.directive-event.v1" as const;

export type DirectiveSourceKind = "operator" | "agent" | "system";

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
  | "context";

export type DirectiveAdmissionStatus =
  | "candidate"
  | "admitted"
  | "refused"
  | "delivered"
  | "superseded"
  | "expired";

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

export interface DirectiveContent {
  readonly kind: DirectiveContentKind;
  readonly text: string;
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
  readonly delivered_at?: string;
  readonly transport?: string;
  readonly artifact_ref?: string;
}

export interface Directive {
  readonly schema: typeof DIRECTIVE_SCHEMA;
  readonly directive_id: string;
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
  readonly created_at: string;
  readonly source: DirectiveSource;
  readonly authority: DirectiveAuthority;
  readonly target: DirectiveTarget;
  readonly content: DirectiveContent;
  readonly ordering?: Partial<DirectiveOrdering>;
}

export type DirectiveEventKind =
  | "directive.created"
  | "directive.admitted"
  | "directive.refused"
  | "directive.delivered"
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
}

export function createDirective(draft: DirectiveDraft): Directive {
  const directive: Omit<Directive, "directive_id"> = {
    schema: DIRECTIVE_SCHEMA,
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
      const label = `${directive.content.kind}:${directive.directive_id}`;
      return `[${label}]\n${directive.content.text}`;
    })
    .join("\n\n");
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
