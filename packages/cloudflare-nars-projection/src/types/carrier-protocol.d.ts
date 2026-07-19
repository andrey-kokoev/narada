declare module '@narada2/carrier-protocol' {
  export const NARS_AUTHORITY_RUNTIME_HOST_TRANSITION_SCHEMA: string;
  export const NARS_AUTHORITY_RUNTIME_HOST_TRANSITION_REFUSAL_SCHEMA: string;
  export const NARS_AUTHORITY_RUNTIME_HOST_KINDS: readonly string[];
  export const NARS_AUTHORITY_RUNTIME_HOST_TRANSITION_STATES: readonly string[];
  export const NARS_AUTHORITY_RUNTIME_HOST_TRANSITION_TERMINAL_STATES: readonly string[];
  export const NARS_AUTHORITY_RUNTIME_SOURCE_WRITE_ADMISSIONS: readonly string[];
  export const NARS_AUTHORITY_RUNTIME_TARGET_WRITE_ADMISSIONS: readonly string[];
  export const NARS_AUTHORITY_RUNTIME_EVENT_LOG_HANDOFF_MODES: readonly string[];
  export const NARS_AUTHORITY_RUNTIME_QUEUE_HANDOFF_MODES: readonly string[];
  export const NARS_AUTHORITY_RUNTIME_ARTIFACT_HANDOFF_MODES: readonly string[];
  export const NARS_AUTHORITY_RUNTIME_MCP_FABRIC_HANDOFF_MODES: readonly string[];
  export const NARS_AUTHORITY_RUNTIME_MCP_FABRIC_STATUSES: readonly string[];
  export const NARS_AUTHORITY_RUNTIME_PROVIDER_HANDOFF_MODES: readonly string[];
  export function validateNarsAuthorityRuntimeHostTransitionRecord(record: unknown): string[];
  export function assertValidNarsAuthorityRuntimeHostTransitionRecord(record: unknown): void;
}
