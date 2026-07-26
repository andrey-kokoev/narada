import { readFileSync } from 'node:fs';

export interface CarrierProtocolContract {
  schema: string;
  schemas: Readonly<Record<string, string>>;
  id_prefixes: Readonly<Record<string, string>>;
  diagnostic: {
    levels: readonly string[];
    warning_level: string;
    info_level: string;
  };
  turn_terminal_status: {
    completed: readonly string[];
    interrupted: readonly string[];
    failed: readonly string[];
  };
  terminal_state: StringValuesContract;
  delivery_mode: StringValuesContract;
  observer_visibility: StringValuesContract;
  directive_visibility: StringValuesContract;
  directive_kind: StringValuesContract & { basic_test_kind: string };
  directive_target_kind: StringValuesContract;
  directive_trigger_kind: StringValuesContract;
  directive_emission_suppression_reason: StringValuesContract;
  directive_emitter_registry: {
    entries: readonly DirectiveEmitterEntry[];
  };
  directive_emission_event_kind: StringValuesContract;
  queue_state: StringValuesContract;
  input_admission_action: StringValuesContract;
  input_hold_action: StringValuesContract;
  observer_suppression_reason: StringValuesContract;
  payload_ref_reader_tool: StringValuesContract;
  tool_result_status: StringValuesContract;
  tool_effect_admission_action: StringValuesContract;
  tool_effect_admission_reason: StringValuesContract;
  tool_result_payload: ToolResultPayloadContract;
  input_pipeline_event_kind: {
    queue: readonly string[];
    admission: readonly string[];
    visible: readonly string[];
    hold: readonly string[];
    release: readonly string[];
  };
  carrier_session_lifecycle_event_kind: StringValuesContract;
  carrier_host_command_event_kind: StringValuesContract;
}

export interface StringValuesContract {
  values: readonly string[];
  default?: string;
}

export type DirectiveKind = 'operation_heartbeat' | 'operation_attention';

export interface DirectiveEmitterEntry {
  directive_kind: DirectiveKind;
  default_visibility: string;
  default_cadence: string | null;
  trigger_kind: string;
  target_kind: string;
}

export interface ToolResultPayloadContract {
  required: readonly string[];
  optional: readonly string[];
  consistency: {
    paired_fields: readonly (readonly [string, string])[];
    admission_action_status: {
      deny: readonly string[];
      admit: readonly string[];
    };
    admission_action_reason: {
      admit: readonly string[];
      deny: readonly string[];
    };
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function loadCarrierProtocolContract(
  url: URL = new URL('../contracts/carrier-protocol.json', import.meta.url),
): Readonly<CarrierProtocolContract> {
  const parsed: unknown = JSON.parse(readFileSync(url, 'utf-8'));
  if (!isRecord(parsed)) throw new Error('carrier_protocol_contract_must_be_object');
  return Object.freeze(parsed as unknown as CarrierProtocolContract);
}
