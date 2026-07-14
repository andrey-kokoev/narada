import { z } from 'zod';

export const AGENT_START_RESULT_SCHEMA = 'narada.agent_start.result.v0' as const;
export const AGENT_START_RESULT_STATUSES = ['materialized', 'dry_run'] as const;
export const AGENT_START_SESSION_REF_KINDS = ['runtime', 'nars', 'carrier'] as const;

const nonEmptyString = z.string().min(1);
const optionalString = nonEmptyString.nullable().optional();
const processRecordShape = z.object({
  started_at: optionalString,
  parent_process: z.object({
    pid: z.number().int().nullable().optional(),
  }).passthrough().nullable().optional(),
}).passthrough();
const sessionRefShape = z.object({
  id: nonEmptyString,
  kind: z.enum(AGENT_START_SESSION_REF_KINDS),
});
const sessionShape = z.object({
  session_id: optionalString,
  runtime_session_id: optionalString,
  nars_session_id: optionalString,
  carrier_session_id: optionalString,
  operator_surface_kind: optionalString,
  runtime_host_kind: optionalString,
  launch_operator_surface_kind: optionalString,
  control_path: optionalString,
  session_path: optionalString,
  session_dir: optionalString,
  attach_commands: z.array(nonEmptyString).nullable().optional(),
  record: processRecordShape.nullable().optional(),
}).passthrough();
const carrierActionsShape = z.object({
  carrier_session_registration: sessionShape.nullable().optional(),
}).passthrough();
const handoffShape = z.object({
  session_ref: sessionRefShape,
}).passthrough();

const commonResultShape = {
  schema: z.literal(AGENT_START_RESULT_SCHEMA),
  identity: nonEmptyString.optional(),
  runtime: nonEmptyString.optional(),
  agent_start_event: nonEmptyString.optional(),
  target_site_id: nonEmptyString.nullable().optional(),
  target_site_root: nonEmptyString.optional(),
  session_site_root: nonEmptyString.optional(),
  launch_session_id: nonEmptyString.nullable().optional(),
  session_id: optionalString,
  runtime_session_id: optionalString,
  nars_session_id: optionalString,
  carrier_session_id: optionalString,
  required_environment: z.record(z.unknown()).optional(),
  nars_launch: sessionShape.nullable().optional(),
  carrier_session: sessionShape.nullable().optional(),
  carrier_actions: carrierActionsShape.nullable().optional(),
};

export const AgentStartResultV0Schema = z.union([
  z.object({
    ...commonResultShape,
    status: z.literal('materialized'),
    handoff: handoffShape,
  }).passthrough(),
  z.object({
    ...commonResultShape,
    status: z.literal('dry_run'),
    handoff: handoffShape.optional(),
  }).passthrough(),
]);

export type AgentStartResultV0 = z.infer<typeof AgentStartResultV0Schema>;
export type AgentStartSessionRef = z.infer<typeof sessionRefShape>;
export type AgentStartSessionRefKind = AgentStartSessionRef['kind'];
export type AgentStartSessionProjection = {
  session_ref: AgentStartSessionRef | null;
  session_id: string | null;
  runtime_session_id: string | null;
  nars_session_id: string | null;
  carrier_session_id: string | null;
};

export class AgentStartResultContractError extends Error {
  readonly code = 'agent_start_result_contract_invalid' as const;
  readonly issues: z.ZodIssue[];

  constructor(issues: z.ZodIssue[]) {
    const detail = issues.map((issue) => {
      const path = issue.path.length > 0 ? issue.path.join('.') : '<root>';
      return `${path}: ${issue.message}`;
    }).join('; ');
    super(`agent_start_result_contract_invalid: ${detail}`);
    this.name = 'AgentStartResultContractError';
    this.issues = issues;
  }
}

export function parseAgentStartResultV0(value: unknown) {
  return AgentStartResultV0Schema.safeParse(value);
}

export function assertAgentStartResultV0(value: unknown): AgentStartResultV0 {
  const parsed = parseAgentStartResultV0(value);
  if (!parsed.success) throw new AgentStartResultContractError(parsed.error.issues);
  return parsed.data;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function nonEmptyValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function coherentSessionId(values: unknown[]): { value: string | null; conflict: boolean } {
  const ids = [...new Set(values.map(nonEmptyValue).filter((value): value is string => Boolean(value)))];
  return { value: ids[0] ?? null, conflict: ids.length > 1 };
}

export function resolveAgentStartSessionProjection(value: unknown): AgentStartSessionProjection | null {
  const parsed = parseAgentStartResultV0(value);
  if (!parsed.success) return null;
  const result = parsed.data;
  const requiredEnvironment = isRecord(result.required_environment) ? result.required_environment : null;
  const narsLaunch = isRecord(result.nars_launch) ? result.nars_launch : null;
  const carrierSession = isRecord(result.carrier_session) ? result.carrier_session : null;
  const carrierActions = isRecord(result.carrier_actions) ? result.carrier_actions : null;
  const carrierRegistration = carrierActions && isRecord(carrierActions.carrier_session_registration)
    ? carrierActions.carrier_session_registration
    : null;
  const sessionRefValue = result.handoff?.session_ref ?? null;
  const runtimeSession = coherentSessionId([
    result.runtime_session_id,
    result.session_id,
    narsLaunch?.session_id,
    narsLaunch?.runtime_session_id,
    carrierSession?.session_id,
    carrierSession?.runtime_session_id,
    requiredEnvironment?.NARADA_RUNTIME_SESSION_ID,
  ]);
  const narsSession = coherentSessionId([
    result.nars_session_id,
    result.session_id,
    narsLaunch?.session_id,
    narsLaunch?.nars_session_id,
    carrierSession?.session_id,
    requiredEnvironment?.NARADA_NARS_SESSION_ID,
  ]);
  const carrierSessionId = coherentSessionId([
    result.carrier_session_id,
    result.session_id,
    carrierSession?.session_id,
    carrierSession?.carrier_session_id,
    carrierRegistration?.carrier_session_id,
    requiredEnvironment?.NARADA_CARRIER_SESSION_ID,
  ]);
  if (runtimeSession.conflict || narsSession.conflict || carrierSessionId.conflict) return null;
  const componentId = sessionRefValue?.kind === 'runtime'
    ? runtimeSession.value
    : sessionRefValue?.kind === 'nars'
      ? narsSession.value
      : sessionRefValue?.kind === 'carrier'
        ? carrierSessionId.value
        : null;
  if (sessionRefValue && componentId !== sessionRefValue.id) return null;
  return {
    session_ref: sessionRefValue,
    session_id: sessionRefValue?.id ?? null,
    runtime_session_id: runtimeSession.value,
    nars_session_id: narsSession.value,
    carrier_session_id: carrierSessionId.value,
  };
}

export function evaluateAgentStartHandoff(value: unknown) {
  const parsed = parseAgentStartResultV0(value);
  if (!parsed.success) {
    return {
      eligible: false as const,
      status: 'invalid' as const,
      session_ref: null,
      session_id: null,
      reason: 'result_contract_invalid',
      detail: new AgentStartResultContractError(parsed.error.issues).message,
    };
  }
  if (parsed.data.status !== 'materialized') {
    return {
      eligible: false as const,
      status: 'ineligible' as const,
      session_ref: null,
      session_id: null,
      reason: 'result_not_materialized',
      detail: 'Only a materialized agent-start result can hand off a runtime session.',
    };
  }
  const projection = resolveAgentStartSessionProjection(parsed.data);
  if (!projection?.session_ref) {
    return {
      eligible: false as const,
      status: 'invalid' as const,
      session_ref: null,
      session_id: null,
      reason: 'materialized_result_session_ref_conflict',
      detail: 'handoff.session_ref conflicts with one or more declared session projections.',
    };
  }
  return {
    eligible: true as const,
    status: 'eligible' as const,
    session_ref: projection.session_ref,
    session_id: projection.session_ref.id,
    reason: null,
    detail: null,
  };
}
