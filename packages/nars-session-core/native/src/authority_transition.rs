//! Authority-runtime transition and handoff state machines.

use crate::CoreError;
use serde_json::{json, Value};

pub const RUNTIME_SCHEMA: &str = "narada.nars.authority_runtime_host_transition_state.v1";
pub const HANDOFF_SCHEMA: &str = "narada.nars.authority_handoff.lifecycle_state.v1";

pub fn runtime_states() -> &'static [&'static str] {
    &[
        "not_requested",
        "proposed",
        "preparing_target",
        "source_draining",
        "source_sealed",
        "target_activating",
        "target_active",
        "source_retired",
        "preparation_failed",
        "drain_failed",
        "seal_failed",
        "target_activation_failed",
        "transition_aborted",
    ]
}
pub fn handoff_states() -> &'static [&'static str] {
    &[
        "proposed",
        "validating",
        "preparing",
        "draining",
        "source_sealed",
        "target_activating",
        "committed",
        "refused",
        "failed",
        "rolled_back",
    ]
}
pub fn runtime_terminal(state: &str) -> bool {
    [
        "source_retired",
        "preparation_failed",
        "drain_failed",
        "seal_failed",
        "target_activation_failed",
        "transition_aborted",
    ]
    .contains(&state)
}
pub fn handoff_terminal(state: &str) -> bool {
    ["committed", "refused", "failed", "rolled_back"].contains(&state)
}

pub fn can_runtime_transition(previous: Option<&str>, next: &str) -> bool {
    if !runtime_states().contains(&next) {
        return false;
    }
    let previous = previous.unwrap_or("not_requested");
    if previous == next {
        return true;
    }
    matches!(
        (previous, next),
        (
            "not_requested",
            "proposed" | "preparing_target" | "transition_aborted"
        ) | (
            "proposed",
            "preparing_target" | "preparation_failed" | "transition_aborted"
        ) | (
            "preparing_target",
            "source_draining" | "preparation_failed" | "transition_aborted"
        ) | (
            "source_draining",
            "source_sealed" | "drain_failed" | "transition_aborted"
        ) | (
            "source_sealed",
            "target_activating" | "seal_failed" | "transition_aborted"
        ) | (
            "target_activating",
            "target_active" | "target_activation_failed" | "transition_aborted"
        ) | ("target_active", "source_retired")
    )
}

pub fn can_handoff_transition(previous: &str, next: &str) -> bool {
    if !handoff_states().contains(&previous) || !handoff_states().contains(&next) {
        return false;
    }
    previous == next
        || matches!(
            (previous, next),
            ("proposed", "validating" | "refused" | "failed")
                | ("validating", "preparing" | "refused" | "failed")
                | ("preparing", "draining" | "refused" | "failed")
                | ("draining", "source_sealed" | "rolled_back" | "failed")
                | (
                    "source_sealed",
                    "target_activating" | "rolled_back" | "failed"
                )
                | ("target_activating", "committed" | "rolled_back" | "failed")
        )
}

pub fn transition_runtime(
    previous: Option<&str>,
    next: &str,
    evidence: Value,
) -> Result<Value, CoreError> {
    if !can_runtime_transition(previous, next) {
        return Err(CoreError(format!(
            "invalid_nars_authority_runtime_host_transition:{}:{next}",
            previous.unwrap_or("not_requested")
        )));
    }
    Ok(
        json!({ "schema": RUNTIME_SCHEMA, "previous_state": previous, "state": next, "evidence": evidence }),
    )
}

pub fn transition_handoff(previous: &str, next: &str) -> Result<Value, CoreError> {
    if !can_handoff_transition(previous, next) {
        return Err(CoreError(format!(
            "invalid_nars_authority_handoff_transition:{previous}->{next}"
        )));
    }
    Ok(json!({ "schema": HANDOFF_SCHEMA, "state": next, "history": [previous, next] }))
}

pub fn handoff_from_runtime(runtime_state: &str) -> Value {
    let mapped = match runtime_state {
        "preparing_target" => "preparing",
        "source_draining" => "draining",
        "source_sealed" => "source_sealed",
        "target_activating" => "target_activating",
        "target_active" | "source_retired" => "committed",
        "preparation_failed" | "drain_failed" | "seal_failed" | "target_activation_failed" => {
            "failed"
        }
        "transition_aborted" => "refused",
        _ => "proposed",
    };
    json!({ "schema": HANDOFF_SCHEMA, "state": mapped, "history": [mapped] })
}

pub fn source_state_path(session_path: Option<&std::path::Path>) -> Option<std::path::PathBuf> {
    session_path
        .and_then(|path| path.parent())
        .map(|parent| parent.join("authority-transition-state.json"))
}

pub const SOURCE_SCHEMA: &str = "narada.nars.authority_transition_source_state.v1";

pub fn empty_source_state(path: Option<&std::path::Path>, corrupt: bool) -> Value {
    json!({
        "schema": SOURCE_SCHEMA,
        "path": path.map(|p| p.to_string_lossy().to_string()),
        "corrupt": corrupt,
        "updated_at": Value::Null,
        "authority_transition_state": Value::Null,
        "source_write_admission": if corrupt { "sealed" } else { "active" },
        "source_authority_runtime_host": "local",
        "source_authority_epoch": 1,
        "source_authority_runtime_id": Value::Null,
        "transition_id": Value::Null,
        "target_write_admission": "not_before_source_seal",
        "drain_started_at": Value::Null,
        "drain_reason": Value::Null,
        "drain_requested_by": Value::Null,
        "sealed_at": Value::Null,
        "source_last_sequence": Value::Null,
        "target_prepared_at": Value::Null,
        "target_prepare_reason": Value::Null,
        "target_prepare_requested_by": Value::Null,
        "target_activation_started_at": Value::Null,
        "target_activated_at": Value::Null,
        "target_first_sequence": Value::Null,
        "authority_epoch_token": Value::Null,
        "activation_id": Value::Null,
        "target_authority_locator": Value::Null,
        "superseded_by_session_id": Value::Null,
        "authority_locator_ref": Value::Null,
        "target_transition_plan": Value::Null,
        "authority_handoff_lifecycle": handoff_from_runtime("not_requested"),
        "handoff_evidence": Value::Null,
        "reconciliation_evidence": Value::Null,
        "target_activation_reason": Value::Null,
        "target_activation_requested_by": Value::Null,
        "seal_reason": Value::Null,
        "seal_requested_by": Value::Null,
        "last_transition": Value::Null,
    })
}

pub fn read_source_state(path: Option<&std::path::Path>) -> Value {
    let Some(path) = path else {
        return empty_source_state(None, false);
    };
    let Ok(text) = std::fs::read_to_string(path) else {
        return empty_source_state(Some(path), false);
    };
    let Ok(value) = serde_json::from_str::<Value>(&text) else {
        return empty_source_state(Some(path), true);
    };
    if value.get("schema").and_then(Value::as_str) != Some(SOURCE_SCHEMA) {
        return empty_source_state(Some(path), true);
    }
    normalize_source_state(
        &value,
        Some(path),
        value
            .get("corrupt")
            .and_then(Value::as_bool)
            .unwrap_or(false),
    )
}

pub fn write_source_state(
    path: Option<&std::path::Path>,
    state: &Value,
) -> Result<Value, CoreError> {
    let normalized = normalize_source_state(
        state,
        path,
        state
            .get("corrupt")
            .and_then(Value::as_bool)
            .unwrap_or(false),
    );
    let Some(path) = path else {
        return Ok(normalized);
    };
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| CoreError(format!("authority_transition_directory_failed:{e}")))?;
    }
    let temp = path.with_extension(format!(
        "tmp-{}-{}",
        std::process::id(),
        uuid::Uuid::new_v4().simple()
    ));
    std::fs::write(
        &temp,
        serde_json::to_vec_pretty(&normalized)
            .map_err(|e| CoreError(format!("authority_transition_encode_failed:{e}")))?,
    )
    .map_err(|e| CoreError(format!("authority_transition_write_failed:{e}")))?;
    if path.exists() {
        std::fs::remove_file(path)
            .map_err(|e| CoreError(format!("authority_transition_replace_failed:{e}")))?;
    }
    std::fs::rename(temp, path)
        .map_err(|e| CoreError(format!("authority_transition_rename_failed:{e}")))?;
    Ok(normalized)
}

pub fn normalize_source_state(
    value: &Value,
    path: Option<&std::path::Path>,
    corrupt: bool,
) -> Value {
    let mut state = empty_source_state(path, corrupt);
    if let Some(object) = value.as_object() {
        for (key, item) in object {
            state[key] = item.clone();
        }
    }
    state["schema"] = json!(SOURCE_SCHEMA);
    state["path"] = path
        .map(|p| json!(p.to_string_lossy()))
        .unwrap_or_else(|| state.get("path").cloned().unwrap_or(Value::Null));
    state["corrupt"] = json!(
        corrupt
            || state
                .get("corrupt")
                .and_then(Value::as_bool)
                .unwrap_or(false)
    );
    if !runtime_states().contains(
        &state
            .get("authority_transition_state")
            .and_then(Value::as_str)
            .unwrap_or(""),
    ) {
        state["authority_transition_state"] = Value::Null;
    }
    if !["active", "draining", "sealed", "retired"].contains(
        &state
            .get("source_write_admission")
            .and_then(Value::as_str)
            .unwrap_or(""),
    ) {
        state["source_write_admission"] = json!(if corrupt { "sealed" } else { "active" });
    }
    if ![
        "not_before_source_seal",
        "active_after_epoch_token",
        "refused",
    ]
    .contains(
        &state
            .get("target_write_admission")
            .and_then(Value::as_str)
            .unwrap_or(""),
    ) {
        state["target_write_admission"] = json!("not_before_source_seal");
    }
    state["authority_handoff_lifecycle"] = synchronize_handoff(
        state.get("authority_handoff_lifecycle"),
        state
            .get("authority_transition_state")
            .and_then(Value::as_str),
    );
    state
}

pub fn snapshot(state: &Value) -> Value {
    let normalized = normalize_source_state(
        state,
        state
            .get("path")
            .and_then(Value::as_str)
            .map(std::path::Path::new),
        state
            .get("corrupt")
            .and_then(Value::as_bool)
            .unwrap_or(false),
    );
    let mut result = normalized.clone();
    if let Some(object) = result.as_object_mut() {
        object.remove("corrupt");
        object.remove("updated_at");
    }
    result
}

pub fn classify_source_write(
    state: &Value,
    method_kind: Option<&str>,
    transition_policy: Option<&str>,
) -> Value {
    let normalized = normalize_source_state(state, None, false);
    let admission = normalized
        .get("source_write_admission")
        .and_then(Value::as_str)
        .unwrap_or("active");
    if admission == "active" {
        return json!({ "admitted": true, "admission": "active" });
    }
    if admission == "sealed" || admission == "retired" {
        return json!({ "admitted": false, "reason_code": "source_authority_sealed", "reason": "Source authority is sealed and cannot admit canonical writes.", "authority_transition": snapshot(&normalized) });
    }
    if method_kind == Some("conversation_enqueue")
        && transition_policy == Some("queue_during_drain")
    {
        return json!({ "admitted": true, "admission": "queued_during_drain", "drain": false });
    }
    json!({ "admitted": false, "reason_code": "source_authority_draining", "reason": "Source authority is draining; only explicit queue_during_drain enqueue is admitted.", "authority_transition": snapshot(&normalized) })
}

pub fn classify_target_write(
    state: &Value,
    epoch_token: Option<Value>,
    target_first_sequence: Option<u64>,
    next_event_sequence: Option<u64>,
) -> Value {
    let normalized = normalize_source_state(state, None, false);
    let mut missing = Vec::new();
    if !matches!(
        normalized
            .get("source_write_admission")
            .and_then(Value::as_str),
        Some("sealed" | "retired")
    ) {
        missing.push("source_seal_evidence");
    }
    if normalized
        .get("sealed_at")
        .map(Value::is_null)
        .unwrap_or(true)
        || normalized
            .get("source_last_sequence")
            .and_then(Value::as_u64)
            .is_none()
    {
        missing.push("source_event_cursor");
    }
    let token = epoch_token.or_else(|| normalized.get("authority_epoch_token").cloned());
    if token.is_none() {
        missing.push("authority_epoch_token");
    }
    let first = target_first_sequence.or_else(|| {
        normalized
            .get("target_first_sequence")
            .and_then(Value::as_u64)
    });
    if first.is_none() {
        missing.push("target_first_sequence");
    }
    if let (Some(first), Some(next)) = (first, next_event_sequence) {
        if first != next {
            missing.push("target_first_sequence_boundary");
        }
    }
    if !missing.is_empty() {
        return json!({ "admitted": false, "reason_code": "target_activation_evidence_missing", "reason": format!("Target authority activation requires {}.", missing.join(", ")), "missing": missing, "authority_transition": snapshot(&normalized) });
    }
    json!({ "admitted": true, "target_first_sequence": first, "authority_epoch_token": token, "authority_transition": snapshot(&normalized) })
}

fn synchronize_handoff(current: Option<&Value>, runtime_state: Option<&str>) -> Value {
    let target = handoff_from_runtime(runtime_state.unwrap_or("not_requested"));
    if current.and_then(|v| v.get("state")).and_then(Value::as_str)
        == target.get("state").and_then(Value::as_str)
    {
        current.cloned().unwrap_or(target)
    } else {
        target
    }
}

pub fn prepare_target(
    path: Option<&std::path::Path>,
    state: Option<&Value>,
    locator: Option<Value>,
    plan: Option<Value>,
    reason: Option<&str>,
    requested_by: Option<Value>,
) -> Result<Value, CoreError> {
    let current = state.cloned().unwrap_or_else(|| read_source_state(path));
    let current_state = current
        .get("authority_transition_state")
        .and_then(Value::as_str);
    let transition_state = if current_state.is_none() {
        "proposed"
    } else {
        current_state.unwrap_or("not_requested")
    };
    if current_state.is_none() && !can_runtime_transition(None, "proposed") {
        return Err(CoreError(
            "invalid_nars_authority_runtime_host_transition:not_requested:proposed".into(),
        ));
    }
    if !can_runtime_transition(Some(transition_state), "preparing_target") {
        return Err(CoreError(format!(
            "invalid_nars_authority_runtime_host_transition:{transition_state}:preparing_target"
        )));
    }
    let at = now_iso();
    let mut next = normalize_source_state(&current, path, false);
    next["authority_transition_state"] = json!("preparing_target");
    next["target_write_admission"] = json!("not_before_source_seal");
    next["target_prepared_at"] = next
        .get("target_prepared_at")
        .filter(|v| !v.is_null())
        .cloned()
        .unwrap_or_else(|| json!(at));
    next["target_prepare_reason"] = reason.map_or(Value::Null, |v| json!(v));
    next["target_prepare_requested_by"] = requested_by.unwrap_or(Value::Null);
    if let Some(value) = locator {
        next["target_authority_locator"] = value;
    }
    if let Some(value) = plan {
        next["target_transition_plan"] = value;
    }
    next["transition_id"] = next
        .get("transition_id")
        .filter(|v| !v.is_null())
        .cloned()
        .unwrap_or_else(|| json!(format!("arht_{}", uuid::Uuid::new_v4().simple())));
    next["last_transition"] = json!({ "transition": "preparing_target", "occurred_at": at, "reason": reason, "requested_by": next["target_prepare_requested_by"] });
    write_source_state(path, &next)
}

pub fn begin_source_drain(
    path: Option<&std::path::Path>,
    state: Option<&Value>,
    reason: Option<&str>,
    requested_by: Option<Value>,
) -> Result<Value, CoreError> {
    let current = state.cloned().unwrap_or_else(|| read_source_state(path));
    if current
        .get("source_write_admission")
        .and_then(Value::as_str)
        == Some("sealed")
    {
        return Ok(current);
    }
    let current_state = current
        .get("authority_transition_state")
        .and_then(Value::as_str);
    if !can_runtime_transition(current_state, "source_draining") {
        return Err(CoreError(format!(
            "invalid_nars_authority_runtime_host_transition:{}:source_draining",
            current_state.unwrap_or("not_requested")
        )));
    }
    let at = now_iso();
    let mut next = normalize_source_state(&current, path, false);
    next["authority_transition_state"] = json!("source_draining");
    next["source_write_admission"] = json!("draining");
    next["drain_started_at"] = next
        .get("drain_started_at")
        .filter(|v| !v.is_null())
        .cloned()
        .unwrap_or_else(|| json!(at));
    next["drain_reason"] = reason.map_or(Value::Null, |v| json!(v));
    next["drain_requested_by"] = requested_by.unwrap_or(Value::Null);
    next["last_transition"] = json!({ "transition": "source_draining", "occurred_at": at, "reason": reason, "requested_by": next["drain_requested_by"] });
    write_source_state(path, &next)
}

pub fn seal_source(
    path: Option<&std::path::Path>,
    state: Option<&Value>,
    source_last_sequence: Option<u64>,
    reason: Option<&str>,
    requested_by: Option<Value>,
) -> Result<Value, CoreError> {
    let current = state.cloned().unwrap_or_else(|| read_source_state(path));
    let current_state = current
        .get("authority_transition_state")
        .and_then(Value::as_str);
    if !can_runtime_transition(current_state, "source_sealed") {
        return Err(CoreError(format!(
            "invalid_nars_authority_runtime_host_transition:{}:source_sealed",
            current_state.unwrap_or("not_requested")
        )));
    }
    let at = now_iso();
    let mut next = normalize_source_state(&current, path, false);
    next["authority_transition_state"] = json!("source_sealed");
    next["source_write_admission"] = json!("sealed");
    next["sealed_at"] = next
        .get("sealed_at")
        .filter(|v| !v.is_null())
        .cloned()
        .unwrap_or_else(|| json!(at));
    next["source_last_sequence"] = source_last_sequence.map_or(Value::Null, |v| json!(v));
    next["seal_reason"] = reason.map_or(Value::Null, |v| json!(v));
    next["seal_requested_by"] = requested_by.unwrap_or(Value::Null);
    next["last_transition"] = json!({ "transition": "source_sealed", "occurred_at": at, "reason": reason, "requested_by": next["seal_requested_by"] });
    write_source_state(path, &next)
}

pub fn begin_target_activation(
    path: Option<&std::path::Path>,
    state: Option<&Value>,
    locator: Option<Value>,
    reason: Option<&str>,
    requested_by: Option<Value>,
) -> Result<Value, CoreError> {
    let current = state.cloned().unwrap_or_else(|| read_source_state(path));
    let current_state = current
        .get("authority_transition_state")
        .and_then(Value::as_str);
    if !can_runtime_transition(current_state, "target_activating") {
        return Err(CoreError(format!(
            "invalid_nars_authority_runtime_host_transition:{}:target_activating",
            current_state.unwrap_or("not_requested")
        )));
    }
    let at = now_iso();
    let mut next = normalize_source_state(&current, path, false);
    next["authority_transition_state"] = json!("target_activating");
    next["source_write_admission"] = json!("sealed");
    next["target_write_admission"] = json!("not_before_source_seal");
    next["target_activation_started_at"] = next
        .get("target_activation_started_at")
        .filter(|v| !v.is_null())
        .cloned()
        .unwrap_or_else(|| json!(at));
    next["target_activation_reason"] = reason.map_or(Value::Null, |v| json!(v));
    next["target_activation_requested_by"] = requested_by.unwrap_or(Value::Null);
    if let Some(value) = locator {
        next["target_authority_locator"] = value;
    }
    next["last_transition"] = json!({ "transition": "target_activating", "occurred_at": at, "reason": reason, "requested_by": next["target_activation_requested_by"] });
    write_source_state(path, &next)
}

pub fn activate_target(
    path: Option<&std::path::Path>,
    state: Option<&Value>,
    first_sequence: Option<u64>,
    epoch_token: Option<Value>,
    activation_id: Option<Value>,
    reason: Option<&str>,
    requested_by: Option<Value>,
) -> Result<Value, CoreError> {
    let current = state.cloned().unwrap_or_else(|| read_source_state(path));
    let current_state = current
        .get("authority_transition_state")
        .and_then(Value::as_str);
    if !can_runtime_transition(current_state, "target_active") {
        return Err(CoreError(format!(
            "invalid_nars_authority_runtime_host_transition:{}:target_active",
            current_state.unwrap_or("not_requested")
        )));
    }
    let at = now_iso();
    let mut next = normalize_source_state(&current, path, false);
    next["authority_transition_state"] = json!("target_active");
    next["source_write_admission"] = json!("sealed");
    next["target_write_admission"] = json!("active_after_epoch_token");
    next["target_activated_at"] = next
        .get("target_activated_at")
        .filter(|v| !v.is_null())
        .cloned()
        .unwrap_or_else(|| json!(at));
    next["target_first_sequence"] = first_sequence.map_or(Value::Null, |v| json!(v));
    next["authority_epoch_token"] = epoch_token.unwrap_or(Value::Null);
    next["activation_id"] = activation_id.unwrap_or(Value::Null);
    next["last_transition"] = json!({ "transition": "target_active", "occurred_at": at, "reason": reason, "requested_by": requested_by });
    write_source_state(path, &next)
}

pub fn retire_source(
    path: Option<&std::path::Path>,
    state: Option<&Value>,
    reason: Option<&str>,
    requested_by: Option<Value>,
) -> Result<Value, CoreError> {
    let current = state.cloned().unwrap_or_else(|| read_source_state(path));
    let current_state = current
        .get("authority_transition_state")
        .and_then(Value::as_str);
    if !can_runtime_transition(current_state, "source_retired") {
        return Err(CoreError(format!(
            "invalid_nars_authority_runtime_host_transition:{}:source_retired",
            current_state.unwrap_or("not_requested")
        )));
    }
    let at = now_iso();
    let mut next = normalize_source_state(&current, path, false);
    next["authority_transition_state"] = json!("source_retired");
    next["source_write_admission"] = json!("retired");
    next["last_transition"] = json!({ "transition": "source_retired", "occurred_at": at, "reason": reason, "requested_by": requested_by });
    write_source_state(path, &next)
}

pub fn record_failure(
    path: Option<&std::path::Path>,
    state: Option<&Value>,
    failure_state: &str,
    reason: Option<&str>,
    requested_by: Option<Value>,
) -> Result<Value, CoreError> {
    let current = state.cloned().unwrap_or_else(|| read_source_state(path));
    let current_state = current
        .get("authority_transition_state")
        .and_then(Value::as_str);
    if !can_runtime_transition(current_state, failure_state) {
        return Err(CoreError(format!(
            "invalid_nars_authority_runtime_host_transition:{}:{failure_state}",
            current_state.unwrap_or("not_requested")
        )));
    }
    let at = now_iso();
    let mut next = normalize_source_state(&current, path, false);
    next["authority_transition_state"] = json!(failure_state);
    next["failure_reason"] = reason.map_or(Value::Null, |v| json!(v));
    next["failure_requested_by"] = requested_by.unwrap_or(Value::Null);
    next["last_transition"] = json!({ "transition": failure_state, "occurred_at": at, "reason": reason, "requested_by": next["failure_requested_by"] });
    write_source_state(path, &next)
}

fn now_iso() -> String {
    let millis = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64;
    let seconds = millis.div_euclid(1_000);
    let days = seconds.div_euclid(86_400);
    let sod = seconds.rem_euclid(86_400);
    let (year, month, day) = civil_from_days(days);
    format!(
        "{year:04}-{month:02}-{day:02}T{:02}:{:02}:{:02}.{:03}Z",
        sod / 3_600,
        (sod % 3_600) / 60,
        sod % 60,
        millis.rem_euclid(1_000)
    )
}
fn civil_from_days(days: i64) -> (i64, i64, i64) {
    let z = days + 719468;
    let era = if z >= 0 { z } else { z - 146096 }.div_euclid(146097);
    let doe = z - era * 146097;
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096).div_euclid(365);
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2).div_euclid(153);
    let day = doy - (153 * mp + 2).div_euclid(5) + 1;
    let month = mp + if mp < 10 { 3 } else { -9 };
    let year = y + if month <= 2 { 1 } else { 0 };
    (year, month, day)
}
