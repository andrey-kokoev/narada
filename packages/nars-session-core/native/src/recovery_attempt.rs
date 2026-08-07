//! Recovery-attempt state machine shared by replay and supervision.

use serde_json::{json, Value};
use uuid::Uuid;

pub const SCHEMA: &str = "narada.nars.recovery_attempt_state.v1";

pub fn states() -> &'static [&'static str] {
    &[
        "requested",
        "claimed",
        "replaying",
        "reconciled",
        "completed",
        "skipped",
        "interrupted",
        "failed",
        "abandoned",
    ]
}
pub fn terminal_states() -> &'static [&'static str] {
    &["completed", "skipped", "interrupted", "failed", "abandoned"]
}
pub fn is_state(value: &str) -> bool {
    states().contains(&value)
}
pub fn is_terminal(value: &str) -> bool {
    terminal_states().contains(&value)
}

pub fn can_transition(previous: Option<&str>, next: &str) -> bool {
    if !is_state(next) {
        return false;
    }
    if previous == Some(next) {
        return true;
    }
    matches!(
        (previous, next),
        (
            Some("requested"),
            "claimed" | "skipped" | "failed" | "abandoned"
        ) | (
            Some("claimed"),
            "replaying" | "skipped" | "failed" | "abandoned"
        ) | (
            Some("replaying"),
            "reconciled" | "interrupted" | "failed" | "abandoned"
        ) | (Some("reconciled"), "completed" | "failed")
    )
}

pub fn create(
    attempt_id: Option<&str>,
    turn_id: Option<&str>,
    input_event_id: Option<&str>,
    session_id: Option<&str>,
    attempt_number: u64,
    recovery_kind: Value,
    requested_at: Option<&str>,
    reason: Value,
) -> Value {
    let id = attempt_id
        .map(str::to_string)
        .unwrap_or_else(|| format!("recovery_{}", Uuid::new_v4().simple()));
    json!({
        "schema": SCHEMA,
        "attempt_id": id,
        "turn_id": turn_id,
        "input_event_id": input_event_id,
        "session_id": session_id,
        "attempt_number": attempt_number.max(1),
        "recovery_kind": recovery_kind,
        "recovery_attempt_state": "requested",
        "terminal_state": Value::Null,
        "requested_at": requested_at,
        "updated_at": requested_at,
        "reason": reason,
        "error": Value::Null,
    })
}

pub fn normalize(value: &Value) -> Result<Value, String> {
    let state = value
        .get("recovery_attempt_state")
        .and_then(Value::as_str)
        .unwrap_or("requested");
    if !is_state(state) {
        return Err(format!("invalid_nars_recovery_attempt_state:{state}"));
    }
    let mut normalized = create(
        value.get("attempt_id").and_then(Value::as_str),
        value.get("turn_id").and_then(Value::as_str),
        value.get("input_event_id").and_then(Value::as_str),
        value.get("session_id").and_then(Value::as_str),
        value
            .get("attempt_number")
            .and_then(Value::as_u64)
            .unwrap_or(1),
        value.get("recovery_kind").cloned().unwrap_or(Value::Null),
        value.get("requested_at").and_then(Value::as_str),
        value.get("reason").cloned().unwrap_or(Value::Null),
    );
    normalized["recovery_attempt_state"] = json!(state);
    normalized["terminal_state"] = if is_terminal(state) {
        json!(state)
    } else {
        Value::Null
    };
    normalized["updated_at"] = value
        .get("updated_at")
        .cloned()
        .unwrap_or_else(|| normalized["updated_at"].clone());
    normalized["error"] = value.get("error").cloned().unwrap_or(Value::Null);
    Ok(normalized)
}

pub fn transition(value: &Value, next: &str, evidence: &Value) -> Result<Value, String> {
    let current = normalize(value)?;
    let previous = current
        .get("recovery_attempt_state")
        .and_then(Value::as_str);
    if !can_transition(previous, next) {
        return Err(format!(
            "invalid_nars_recovery_attempt_transition:{}:{next}",
            previous.unwrap_or("null")
        ));
    }
    if previous == Some(next) {
        return Ok(current);
    }
    let mut next_value = current;
    next_value["recovery_attempt_state"] = json!(next);
    next_value["terminal_state"] = if is_terminal(next) {
        json!(next)
    } else {
        Value::Null
    };
    if let Some(updated_at) = evidence.get("updated_at") {
        next_value["updated_at"] = updated_at.clone();
    }
    if let Some(reason) = evidence.get("reason") {
        next_value["reason"] = reason.clone();
    }
    if let Some(error) = evidence.get("error") {
        next_value["error"] = error.clone();
    }
    Ok(next_value)
}
