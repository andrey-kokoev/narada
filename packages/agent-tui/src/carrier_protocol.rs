use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

pub const INPUT_EVENT_SCHEMA: &str = "narada.carrier.input_event.v1";
pub const CONTROL_INPUT_EVENT_SCHEMA: &str = "narada.carrier.control.input_event.v1";
pub const SESSION_EVENT_SCHEMA: &str = "narada.carrier.session_event.v1";
pub const PAYLOAD_REF_SCHEMA: &str = "narada.carrier.payload_ref.v1";
pub const PAYLOAD_POLICY_SCHEMA: &str = "narada.carrier.payload_policy.v1";
pub const PROVIDER_REQUEST_PAYLOAD_SCHEMA: &str = "narada.agent_tui.provider_request_payload.v0";
pub const TURN_TERMINAL_PAYLOAD_SCHEMA: &str = "narada.agent_tui.turn_terminal_payload.v0";

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum SourceKind {
    Operator,
    System,
    Agent,
    External,
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum Transport {
    InteractiveTerminal,
    ControlJsonl,
    StartupInjection,
    CarrierServerApi,
    TestHarness,
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum DeliveryMode {
    AdmitForCurrentTurn,
    AdmitAfterActiveTurn,
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum HoldCondition {
    ComposerClearRequired,
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum SessionEventKind {
    InputQueuedForTurnBoundary,
    InputAdmittedToTurn,
    InputDroppedByOperator,
    InputAbandonedOnSessionEnd,
    InputCompleted,
    SystemDirectiveHeld,
    SystemDirectiveReleased,
    DirectiveReceiptRecorded,
    DirectiveCarrierAcceptedRecorded,
    TurnStarted,
    ProviderRequestRecorded,
    ProviderTextDeltaRecorded,
    ProviderToolCallRequested,
    TurnCompleted,
    TurnInterrupted,
    TurnFailed,
    InterruptRequested,
    ToolCallRequested,
    ToolResultReceived,
    CarrierCommandExecuted,
    CarrierDiagnosticRecorded,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct InputEvent {
    pub schema: String,
    pub event_id: String,
    pub source_kind: SourceKind,
    pub source_id: String,
    pub transport: Transport,
    pub delivery_mode: DeliveryMode,
    pub hold_condition: Option<HoldCondition>,
    pub content: String,
    pub created_at: String,
    pub authority_ref: Option<String>,
    pub directive_id: Option<String>,
    #[serde(default)]
    pub metadata: Value,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct ControlInputEvent {
    pub schema: String,
    pub control_event_id: String,
    pub input_event_id: String,
    pub written_at: String,
    pub input: InputEvent,
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, Eq)]
pub struct SessionEvent {
    pub schema: String,
    pub event_kind: SessionEventKind,
    pub event_id: String,
    pub occurred_at: String,
    pub carrier_session_id: String,
    pub agent_id: String,
    pub site_id: String,
    pub site_root: String,
    pub payload: Value,
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, Eq)]
pub struct PayloadRef {
    pub schema: String,
    pub payload_ref: String,
    pub reader_tool: String,
    pub summary: String,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct PayloadPolicy {
    pub schema: String,
    pub max_inline_chars: u64,
    pub max_inline_bytes: u64,
    pub sensitive_payloads_require_ref: bool,
}

pub fn parse_input_event(json: &str) -> Result<InputEvent, String> {
    let event: InputEvent = serde_json::from_str(json).map_err(|error| error.to_string())?;
    validate_input_event(&event)?;
    Ok(event)
}

pub fn parse_control_input_event(json: &str) -> Result<ControlInputEvent, String> {
    let event: ControlInputEvent = serde_json::from_str(json).map_err(|error| error.to_string())?;
    validate_control_input_event(&event)?;
    Ok(event)
}

pub fn parse_session_event(json: &str) -> Result<SessionEvent, String> {
    let event: SessionEvent = serde_json::from_str(json).map_err(|error| error.to_string())?;
    validate_session_event(&event)?;
    Ok(event)
}

pub fn parse_payload_ref(json: &str) -> Result<PayloadRef, String> {
    let payload_ref: PayloadRef = serde_json::from_str(json).map_err(|error| error.to_string())?;
    validate_payload_ref(&payload_ref)?;
    Ok(payload_ref)
}

pub fn parse_payload_policy(json: &str) -> Result<PayloadPolicy, String> {
    let policy: PayloadPolicy = serde_json::from_str(json).map_err(|error| error.to_string())?;
    validate_payload_policy(&policy)?;
    Ok(policy)
}

pub fn serialize_session_event(event: &SessionEvent) -> Result<String, String> {
    validate_session_event(event)?;
    serde_json::to_string(event).map_err(|error| error.to_string())
}

fn validate_input_event(event: &InputEvent) -> Result<(), String> {
    if event.schema != INPUT_EVENT_SCHEMA {
        return Err(format!("invalid_schema:{}", event.schema));
    }
    require_prefix("event_id", &event.event_id, "input_")?;
    require_nonempty("source_id", &event.source_id)?;
    require_rfc3339_utc("created_at", &event.created_at)?;
    if !event.metadata.is_object() {
        return Err("invalid_metadata".to_string());
    }
    match event.source_kind {
        SourceKind::Agent => {
            if event.metadata.get("agent_control_input") != Some(&Value::Bool(true)) {
                return Err("agent_source_requires_agent_control_input_metadata".to_string());
            }
        }
        SourceKind::External => {
            if event.metadata.get("admitted_by").is_none() {
                return Err("external_source_requires_admitted_by_metadata".to_string());
            }
        }
        SourceKind::Operator | SourceKind::System => {}
    }
    if let Some(directive_id) = &event.directive_id {
        require_nonempty("directive_id", directive_id)?;
        let explicit_operator_directive = event.source_kind == SourceKind::Operator
            && event
                .metadata
                .get("directive_provenance")
                .and_then(|value| value.get("kind"))
                .and_then(|value| value.as_str())
                == Some("explicit_operator_directive_surface");
        if event.source_kind != SourceKind::System && !explicit_operator_directive {
            return Err("directive_id_incompatible_with_source".to_string());
        }
        if event.authority_ref.is_none() && event.metadata.get("directive_provenance").is_none() {
            return Err("directive_id_missing_authority_or_provenance".to_string());
        }
    }
    Ok(())
}

fn validate_control_input_event(event: &ControlInputEvent) -> Result<(), String> {
    if event.schema != CONTROL_INPUT_EVENT_SCHEMA {
        return Err(format!("invalid_schema:{}", event.schema));
    }
    require_prefix("control_event_id", &event.control_event_id, "control_")?;
    require_prefix("input_event_id", &event.input_event_id, "input_")?;
    require_rfc3339_utc("written_at", &event.written_at)?;
    validate_input_event(&event.input)?;
    if event.input_event_id != event.input.event_id {
        return Err("input_event_id_mismatch".to_string());
    }
    Ok(())
}

fn validate_session_event(event: &SessionEvent) -> Result<(), String> {
    if event.schema != SESSION_EVENT_SCHEMA {
        return Err(format!("invalid_schema:{}", event.schema));
    }
    require_prefix("event_id", &event.event_id, "session_event_")?;
    require_rfc3339_utc("occurred_at", &event.occurred_at)?;
    require_nonempty("carrier_session_id", &event.carrier_session_id)?;
    require_nonempty("agent_id", &event.agent_id)?;
    require_nonempty("site_id", &event.site_id)?;
    require_nonempty("site_root", &event.site_root)?;
    if !event.payload.is_object() {
        return Err("invalid_payload".to_string());
    }
    validate_session_payload(&event.event_kind, &event.payload)
}

pub fn create_provider_request_payload(
    turn_id: &str,
    input_event_id: &str,
    provider_request_status: &str,
    provider_execution_enabled: bool,
    provider_runtime_status: &str,
    provider_adapter_admission_status: &str,
    provider_adapter_kind: Option<String>,
    provider: Option<String>,
    model: Option<String>,
    thinking: Option<String>,
    stream: bool,
    provider_adapter_refusal_reason: Option<String>,
    content_preview: &str,
) -> Value {
    json!({
        "schema": PROVIDER_REQUEST_PAYLOAD_SCHEMA,
        "turn_id": turn_id,
        "input_event_id": input_event_id,
        "provider_request_status": provider_request_status,
        "provider_execution_enabled": provider_execution_enabled,
        "provider_runtime_status": provider_runtime_status,
        "provider_adapter_admission_status": provider_adapter_admission_status,
        "provider_adapter_kind": provider_adapter_kind,
        "provider": provider,
        "model": model,
        "thinking": thinking,
        "stream": stream,
        "provider_adapter_refusal_reason": provider_adapter_refusal_reason,
        "content_preview": content_preview,
    })
}

pub fn create_turn_terminal_payload(
    turn_id: &str,
    input_event_id: Option<&str>,
    provider_request_status: &str,
    terminal_status: &str,
    provider_execution_enabled: bool,
    error_summary: Option<&str>,
) -> Value {
    let mut payload = json!({
        "schema": TURN_TERMINAL_PAYLOAD_SCHEMA,
        "turn_id": turn_id,
        "provider_request_status": provider_request_status,
        "terminal_status": terminal_status,
        "provider_execution_enabled": provider_execution_enabled,
    });
    if let Some(input_event_id) = input_event_id {
        payload["input_event_id"] = json!(input_event_id);
    }
    if let Some(error_summary) = error_summary {
        payload["error_summary"] = json!(error_summary);
    }
    payload
}

fn validate_session_payload(kind: &SessionEventKind, payload: &Value) -> Result<(), String> {
    match kind {
        SessionEventKind::InputQueuedForTurnBoundary => {
            require_payload_fields(payload, &["input_event_id", "queue_state"])
        }
        SessionEventKind::InputAdmittedToTurn => {
            require_payload_fields(payload, &["input_event_id"])
        }
        SessionEventKind::InputDroppedByOperator => {
            require_payload_fields(payload, &["input_event_id", "drop_reason"])
        }
        SessionEventKind::InputAbandonedOnSessionEnd => {
            require_payload_fields(payload, &["input_event_id"])
        }
        SessionEventKind::InputCompleted => {
            require_payload_fields(payload, &["input_event_id", "terminal_state"])?;
            require_terminal_state(payload, "terminal_state")
        }
        SessionEventKind::SystemDirectiveHeld => validate_system_directive_held_payload(payload),
        SessionEventKind::SystemDirectiveReleased => {
            validate_system_directive_released_payload(payload)
        }
        SessionEventKind::DirectiveReceiptRecorded
        | SessionEventKind::DirectiveCarrierAcceptedRecorded => {
            require_payload_fields(payload, &["input_event_id", "directive_id"])
        }
        SessionEventKind::TurnStarted => {
            require_payload_fields(payload, &["input_event_id", "turn_id"])
        }
        SessionEventKind::TurnCompleted
        | SessionEventKind::TurnInterrupted
        | SessionEventKind::TurnFailed => validate_turn_terminal_payload(kind, payload),
        SessionEventKind::InterruptRequested => require_payload_fields(payload, &["turn_id"]),
        SessionEventKind::ToolCallRequested => validate_tool_call_payload(payload),
        SessionEventKind::ToolResultReceived => validate_tool_result_payload(payload),
        SessionEventKind::CarrierCommandExecuted => require_payload_fields(payload, &["command"]),
        SessionEventKind::CarrierDiagnosticRecorded => validate_carrier_diagnostic_payload(payload),
        SessionEventKind::ProviderRequestRecorded => validate_provider_request_payload(payload),
        SessionEventKind::ProviderTextDeltaRecorded
        | SessionEventKind::ProviderToolCallRequested => Ok(()),
    }
}

fn validate_provider_request_payload(payload: &Value) -> Result<(), String> {
    require_payload_fields(
        payload,
        &[
            "schema",
            "turn_id",
            "input_event_id",
            "provider_request_status",
            "provider_execution_enabled",
            "provider_runtime_status",
            "provider_adapter_admission_status",
            "stream",
            "content_preview",
        ],
    )?;
    if payload.get("schema").and_then(Value::as_str) != Some(PROVIDER_REQUEST_PAYLOAD_SCHEMA) {
        return Err(format!(
            "payload.invalid_schema:{}",
            payload_value_string(payload, "schema")
        ));
    }
    require_payload_nonempty_string(payload, "turn_id")?;
    require_payload_nonempty_string(payload, "input_event_id")?;
    require_payload_nonempty_string(payload, "provider_request_status")?;
    require_payload_nonempty_string(payload, "provider_runtime_status")?;
    require_payload_nonempty_string(payload, "provider_adapter_admission_status")?;
    require_payload_string(payload, "content_preview")?;
    match payload.get("provider_execution_enabled") {
        Some(Value::Bool(_)) => {}
        _ => return Err("payload.invalid_provider_execution_enabled".to_string()),
    }
    match payload.get("stream") {
        Some(Value::Bool(_)) => {}
        _ => return Err("payload.invalid_stream".to_string()),
    }
    for field in [
        "provider_adapter_kind",
        "provider",
        "model",
        "thinking",
        "provider_adapter_refusal_reason",
    ] {
        require_optional_string(payload, field)?;
    }
    Ok(())
}

fn validate_system_directive_held_payload(payload: &Value) -> Result<(), String> {
    require_payload_fields(
        payload,
        &[
            "input_event_id",
            "held_at",
            "held_reason",
            "original_delivery_mode",
        ],
    )?;
    require_payload_rfc3339(payload, "held_at")?;
    if payload.get("held_reason").and_then(Value::as_str) != Some("composer_nonempty") {
        return Err(format!(
            "payload.invalid_held_reason:{}",
            payload_value_string(payload, "held_reason")
        ));
    }
    require_delivery_mode(payload, "original_delivery_mode")?;
    require_optional_nonempty_string(payload, "directive_id")
}

fn validate_system_directive_released_payload(payload: &Value) -> Result<(), String> {
    require_payload_fields(payload, &["input_event_id", "released_at"])?;
    require_payload_rfc3339(payload, "released_at")?;
    require_optional_nonempty_string(payload, "directive_id")
}

fn validate_tool_call_payload(payload: &Value) -> Result<(), String> {
    require_payload_fields(
        payload,
        &["tool_name", "arguments_summary", "requesting_agent_id"],
    )?;
    require_payload_nonempty_string(payload, "tool_name")?;
    require_payload_string(payload, "arguments_summary")?;
    require_payload_nonempty_string(payload, "requesting_agent_id")?;
    validate_optional_payload_ref(payload, "arguments_ref")
}

fn validate_tool_result_payload(payload: &Value) -> Result<(), String> {
    require_payload_fields(
        payload,
        &["tool_name", "status", "duration_ms", "result_summary"],
    )?;
    require_payload_nonempty_string(payload, "tool_name")?;
    require_payload_nonempty_string(payload, "status")?;
    require_payload_nonnegative_number(payload, "duration_ms")?;
    require_payload_string(payload, "result_summary")?;
    validate_optional_payload_ref(payload, "result_ref")
}

fn validate_carrier_diagnostic_payload(payload: &Value) -> Result<(), String> {
    require_payload_fields(payload, &["level", "message"])?;
    match payload.get("level").and_then(Value::as_str) {
        Some("debug" | "info" | "warn" | "error") => {}
        _ => {
            return Err(format!(
                "payload.invalid_level:{}",
                payload_value_string(payload, "level")
            ));
        }
    }
    require_payload_nonempty_string(payload, "message")?;
    if let Some(suppression_count) = payload.get("suppression_count") {
        let valid = suppression_count
            .as_u64()
            .or_else(|| {
                suppression_count
                    .as_i64()
                    .filter(|value| *value >= 0)
                    .map(|v| v as u64)
            })
            .is_some();
        if !valid {
            return Err("payload.invalid_suppression_count".to_string());
        }
    }
    if let Some(suppression_policy) = payload.get("suppression_policy") {
        if !suppression_policy.is_string() {
            return Err("payload.invalid_suppression_policy".to_string());
        }
    }
    Ok(())
}

fn validate_turn_terminal_payload(kind: &SessionEventKind, payload: &Value) -> Result<(), String> {
    require_payload_fields(
        payload,
        &[
            "schema",
            "turn_id",
            "terminal_status",
            "provider_request_status",
            "provider_execution_enabled",
        ],
    )?;
    if payload.get("schema").and_then(Value::as_str) != Some(TURN_TERMINAL_PAYLOAD_SCHEMA) {
        return Err(format!(
            "payload.invalid_schema:{}",
            payload_value_string(payload, "schema")
        ));
    }
    require_payload_nonempty_string(payload, "turn_id")?;
    require_payload_nonempty_string(payload, "provider_request_status")?;
    match payload.get("provider_execution_enabled") {
        Some(Value::Bool(_)) => {}
        _ => return Err("payload.invalid_provider_execution_enabled".to_string()),
    }
    match (kind, payload.get("terminal_status").and_then(Value::as_str)) {
        (
            SessionEventKind::TurnCompleted,
            Some("completed" | "completed_after_dispatch" | "completed_without_provider"),
        ) => Ok(()),
        (SessionEventKind::TurnInterrupted, Some("interrupted")) => Ok(()),
        (SessionEventKind::TurnFailed, Some("failed")) => {
            require_payload_nonempty_string(payload, "error_summary")
        }
        _ => Err(format!(
            "payload.invalid_terminal_status:{}",
            payload_value_string(payload, "terminal_status")
        )),
    }
}

fn require_payload_fields(payload: &Value, fields: &[&str]) -> Result<(), String> {
    for field in fields {
        if payload.get(*field).is_none() {
            return Err(format!("payload.missing_required_field:{field}"));
        }
    }
    Ok(())
}

fn require_payload_string(payload: &Value, field: &str) -> Result<(), String> {
    if payload.get(field).and_then(Value::as_str).is_some() {
        Ok(())
    } else {
        Err(format!("payload.invalid_{field}"))
    }
}

fn require_payload_nonempty_string(payload: &Value, field: &str) -> Result<(), String> {
    match payload.get(field).and_then(Value::as_str) {
        Some(value) if !value.is_empty() => Ok(()),
        _ => Err(format!("payload.invalid_{field}")),
    }
}

fn require_payload_nonnegative_number(payload: &Value, field: &str) -> Result<(), String> {
    match payload.get(field).and_then(Value::as_f64) {
        Some(value) if value >= 0.0 => Ok(()),
        _ => Err(format!("payload.invalid_{field}")),
    }
}

fn require_payload_rfc3339(payload: &Value, field: &str) -> Result<(), String> {
    let Some(value) = payload.get(field).and_then(Value::as_str) else {
        return Err(format!("payload.invalid_{field}"));
    };
    require_rfc3339_utc(&format!("payload.{field}"), value)
}

fn require_delivery_mode(payload: &Value, field: &str) -> Result<(), String> {
    match payload.get(field).and_then(Value::as_str) {
        Some("admit_for_current_turn" | "admit_after_active_turn") => Ok(()),
        _ => Err(format!("payload.invalid_{field}")),
    }
}

fn require_terminal_state(payload: &Value, field: &str) -> Result<(), String> {
    match payload.get(field).and_then(Value::as_str) {
        Some("completed" | "interrupted" | "failed") => Ok(()),
        _ => Err(format!("payload.invalid_{field}")),
    }
}

fn require_optional_nonempty_string(payload: &Value, field: &str) -> Result<(), String> {
    match payload.get(field) {
        None => Ok(()),
        Some(Value::String(value)) if !value.is_empty() => Ok(()),
        Some(_) => Err(format!("payload.invalid_{field}")),
    }
}

fn require_optional_string(payload: &Value, field: &str) -> Result<(), String> {
    match payload.get(field) {
        None | Some(Value::Null) | Some(Value::String(_)) => Ok(()),
        Some(_) => Err(format!("payload.invalid_{field}")),
    }
}

fn validate_optional_payload_ref(payload: &Value, field: &str) -> Result<(), String> {
    let Some(value) = payload.get(field) else {
        return Ok(());
    };
    if value.is_null() {
        return Ok(());
    }
    let payload_ref: PayloadRef = serde_json::from_value(value.clone())
        .map_err(|_| format!("payload.{field}.invalid_payload_ref"))?;
    validate_payload_ref(&payload_ref).map_err(|error| format!("payload.{field}.{error}"))
}

fn payload_value_string(payload: &Value, field: &str) -> String {
    payload
        .get(field)
        .map(Value::to_string)
        .unwrap_or_else(|| "undefined".to_string())
}

fn validate_payload_ref(payload_ref: &PayloadRef) -> Result<(), String> {
    if payload_ref.schema != PAYLOAD_REF_SCHEMA {
        return Err(format!("invalid_schema:{}", payload_ref.schema));
    }
    if !is_valid_payload_ref(&payload_ref.payload_ref) {
        return Err("invalid_payload_ref".to_string());
    }
    if payload_ref.reader_tool != "mcp_payload_read" && payload_ref.reader_tool != "mcp_output_show"
    {
        return Err(format!("invalid_reader_tool:{}", payload_ref.reader_tool));
    }
    require_nonempty("summary", &payload_ref.summary)?;
    Ok(())
}

fn validate_payload_policy(policy: &PayloadPolicy) -> Result<(), String> {
    if policy.schema != PAYLOAD_POLICY_SCHEMA {
        return Err(format!("invalid_schema:{}", policy.schema));
    }
    Ok(())
}

fn require_prefix(field: &str, value: &str, prefix: &str) -> Result<(), String> {
    if value.starts_with(prefix) {
        Ok(())
    } else {
        Err(format!("invalid_{field}"))
    }
}

fn require_nonempty(field: &str, value: &str) -> Result<(), String> {
    if value.trim().is_empty() {
        Err(format!("invalid_{field}"))
    } else {
        Ok(())
    }
}

fn require_rfc3339_utc(field: &str, value: &str) -> Result<(), String> {
    let bytes = value.as_bytes();
    let valid_shape = bytes.len() == 24
        && bytes[4] == b'-'
        && bytes[7] == b'-'
        && bytes[10] == b'T'
        && bytes[13] == b':'
        && bytes[16] == b':'
        && bytes[19] == b'.'
        && bytes[23] == b'Z';
    if valid_shape {
        Ok(())
    } else {
        Err(format!("invalid_{field}"))
    }
}

fn is_valid_payload_ref(value: &str) -> bool {
    let Some(rest) = value.strip_prefix("mcp_payload:") else {
        return false;
    };
    let Some((id, version)) = rest.rsplit_once("@v") else {
        return false;
    };
    !id.is_empty()
        && !version.is_empty()
        && version.chars().all(|ch| ch.is_ascii_digit())
        && id
            .chars()
            .all(|ch| ch.is_ascii_alphanumeric() || matches!(ch, '_' | '.' | ':' | '-'))
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn parses_shared_input_event_fixture() {
        let event = parse_input_event(include_str!(
            "../../carrier-protocol/fixtures/input-event.json"
        ))
        .expect("input fixture parses");
        assert_eq!(event.source_kind, SourceKind::Operator);
        assert_eq!(event.transport, Transport::InteractiveTerminal);
        assert_eq!(event.delivery_mode, DeliveryMode::AdmitForCurrentTurn);
        assert_eq!(event.content, "run startup sequence");
    }

    #[test]
    fn parses_shared_control_input_event_fixture() {
        let event = parse_control_input_event(include_str!(
            "../../carrier-protocol/fixtures/control-input-event.json"
        ))
        .expect("control fixture parses");
        assert_eq!(event.input.source_kind, SourceKind::System);
        assert_eq!(
            event.input.hold_condition,
            Some(HoldCondition::ComposerClearRequired)
        );
    }

    #[test]
    fn parses_shared_session_event_fixture() {
        let event = parse_session_event(include_str!(
            "../../carrier-protocol/fixtures/session-event.json"
        ))
        .expect("session fixture parses");
        assert_eq!(event.event_kind, SessionEventKind::InputAdmittedToTurn);
        assert_eq!(event.payload["input_event_id"], "input_fixture_1");
    }

    #[test]
    fn parses_shared_turn_terminal_session_event_fixture() {
        let event = parse_session_event(include_str!(
            "../../carrier-protocol/fixtures/turn-terminal-session-event.json"
        ))
        .expect("turn terminal session fixture parses");
        assert_eq!(event.event_kind, SessionEventKind::TurnCompleted);
        assert_eq!(
            event.payload,
            create_turn_terminal_payload(
                "turn_fixture_1",
                None,
                "recorded_not_dispatched",
                "completed_without_provider",
                false,
                None,
            )
        );
    }

    #[test]
    fn serializes_shared_session_event_fixture_as_jsonl_line() {
        let event = parse_session_event(include_str!(
            "../../carrier-protocol/fixtures/session-event.json"
        ))
        .expect("session fixture parses");
        let line = serialize_session_event(&event).expect("session event serializes");
        assert!(!line.contains('\n'));
        let reparsed = parse_session_event(&line).expect("serialized line reparses");
        assert_eq!(reparsed.event_id, event.event_id);
    }

    #[test]
    fn parses_shared_payload_ref_fixture() {
        let payload_ref = parse_payload_ref(include_str!(
            "../../carrier-protocol/fixtures/payload-ref.json"
        ))
        .expect("payload ref fixture parses");
        assert_eq!(payload_ref.reader_tool, "mcp_payload_read");
    }

    #[test]
    fn parses_shared_payload_policy_fixture() {
        let policy = parse_payload_policy(include_str!(
            "../../carrier-protocol/fixtures/payload-policy.json"
        ))
        .expect("payload policy fixture parses");
        assert_eq!(policy.max_inline_chars, 4000);
        assert!(policy.sensitive_payloads_require_ref);
    }

    #[test]
    fn rejects_invalid_schema() {
        let error = parse_input_event(r#"{"schema":"wrong"}"#).expect_err("schema rejected");
        assert!(error.contains("missing field") || error.contains("invalid_schema"));
    }

    #[test]
    fn rejects_non_object_metadata() {
        let mut event = parse_input_event(include_str!(
            "../../carrier-protocol/fixtures/input-event.json"
        ))
        .expect("input fixture parses");
        event.metadata = json!([]);

        assert_eq!(
            validate_input_event(&event),
            Err("invalid_metadata".to_string())
        );
    }

    #[test]
    fn enforces_agent_and_external_source_provenance_metadata() {
        let mut agent = parse_input_event(include_str!(
            "../../carrier-protocol/fixtures/input-event.json"
        ))
        .expect("input fixture parses");
        agent.source_kind = SourceKind::Agent;
        assert_eq!(
            validate_input_event(&agent),
            Err("agent_source_requires_agent_control_input_metadata".to_string())
        );
        agent.metadata = json!({ "agent_control_input": true });
        assert!(validate_input_event(&agent).is_ok());

        let mut external = agent.clone();
        external.source_kind = SourceKind::External;
        external.metadata = json!({});
        assert_eq!(
            validate_input_event(&external),
            Err("external_source_requires_admitted_by_metadata".to_string())
        );
        external.metadata = json!({ "admitted_by": "sonar.resident" });
        assert!(validate_input_event(&external).is_ok());
    }

    #[test]
    fn enforces_directive_source_and_provenance_rules() {
        let mut event = parse_input_event(include_str!(
            "../../carrier-protocol/fixtures/input-event.json"
        ))
        .expect("input fixture parses");
        event.directive_id = Some("dir_1".to_string());
        event.authority_ref = Some("auth_1".to_string());
        assert_eq!(
            validate_input_event(&event),
            Err("directive_id_incompatible_with_source".to_string())
        );

        event.metadata = json!({
            "directive_provenance": {
                "kind": "explicit_operator_directive_surface"
            }
        });
        assert!(validate_input_event(&event).is_ok());

        event.source_kind = SourceKind::System;
        event.authority_ref = None;
        event.metadata = json!({});
        assert_eq!(
            validate_input_event(&event),
            Err("directive_id_missing_authority_or_provenance".to_string())
        );
    }

    #[test]
    fn rejects_loose_payload_refs() {
        assert!(is_valid_payload_ref("mcp_payload:payload_abc-1@v2"));
        assert!(!is_valid_payload_ref("mcp_payload:payload abc@v2"));
        assert!(!is_valid_payload_ref("mcp_payload:payload_abc@v"));
        assert!(!is_valid_payload_ref("mcp_payload:payload_abc"));
    }

    #[test]
    fn validates_session_payload_requirements() {
        assert_eq!(
            validate_session_payload(
                &SessionEventKind::InterruptRequested,
                &json!({ "reason": "missing turn" })
            ),
            Err("payload.missing_required_field:turn_id".to_string())
        );
        assert!(validate_session_payload(
            &SessionEventKind::SystemDirectiveHeld,
            &json!({
                "input_event_id": "input_1",
                "held_at": "2026-05-30T00:00:02.000Z",
                "held_reason": "composer_nonempty",
                "original_delivery_mode": "admit_for_current_turn"
            })
        )
        .is_ok());
        let terminal_payload = create_turn_terminal_payload(
            "turn_1",
            Some("input_1"),
            "recorded_not_dispatched",
            "completed_without_provider",
            false,
            None,
        );
        assert_eq!(terminal_payload["input_event_id"], "input_1");
        assert!(
            validate_session_payload(&SessionEventKind::TurnCompleted, &terminal_payload).is_ok()
        );
        assert_eq!(
            validate_session_payload(
                &SessionEventKind::TurnCompleted,
                &json!({
                    "schema": TURN_TERMINAL_PAYLOAD_SCHEMA,
                    "turn_id": "turn_1",
                    "terminal_status": "failed",
                    "provider_request_status": "recorded_not_dispatched",
                    "provider_execution_enabled": false
                })
            ),
            Err("payload.invalid_terminal_status:\"failed\"".to_string())
        );
    }
}
