//! Durable client/projection attachment records.

use crate::CoreError;
use serde_json::{json, Map, Value};
use std::fs::{self, File};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};
use uuid::Uuid;

pub const SCHEMA: &str = "narada.nars.surface_attachment.v1";
pub const SUMMARY_SCHEMA: &str = "narada.nars.surface_attachment_summary.v1";
pub const REGISTRY_SCHEMA: &str = "narada.nars.surface_attachment_registry.v1";
pub const REGISTRY_FILE: &str = "surface-attachments.json";

pub fn create(options: &Value, session_id: &str) -> Result<Value, CoreError> {
    let now = options
        .get("now")
        .and_then(Value::as_str)
        .filter(|v| !v.trim().is_empty())
        .unwrap_or_else(|| "")
        .to_string();
    let now = if now.is_empty() { now_iso() } else { now };
    let required = |key: &str| {
        options
            .get(key)
            .and_then(Value::as_str)
            .filter(|v| !v.trim().is_empty())
            .map(str::to_string)
            .ok_or_else(|| CoreError(format!("surface_attachment_{key}_required")))
    };
    let attachment_id = required("attachment_id")?;
    let surface_kind = required("surface_kind")?;
    let surface_instance_id = required("surface_instance_id")?;
    let mut permission_set = options
        .get("permission_set")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default()
        .into_iter()
        .filter_map(|v| v.as_str().map(str::to_string))
        .filter(|v| !v.trim().is_empty())
        .collect::<Vec<_>>();
    permission_set.sort();
    permission_set.dedup();
    Ok(json!({
        "schema": SCHEMA,
        "attachment_id": attachment_id,
        "session_id": session_id,
        "authority_runtime_id": options.get("authority_runtime_id").cloned().unwrap_or(Value::Null),
        "surface_kind": surface_kind,
        "surface_instance_id": surface_instance_id,
        "projection_mode": options.get("projection_mode").and_then(Value::as_str).unwrap_or("live"),
        "view_policy": options.get("view_policy").cloned().unwrap_or(Value::Null),
        "permission_set": permission_set,
        "event_cursor": options.get("event_cursor").cloned().unwrap_or_else(|| json!({ "last_sequence": Value::Null, "next_sequence": Value::Null })),
        "event_endpoint": options.get("event_endpoint").cloned().unwrap_or(Value::Null),
        "health_endpoint": options.get("health_endpoint").cloned().unwrap_or(Value::Null),
        "attach_source": options.get("attach_source").and_then(Value::as_str).unwrap_or("manual"),
        "attachment_state": "requested",
        "health_state": "unknown",
        "created_at": now,
        "updated_at": now,
        "attached_at": Value::Null,
        "detached_at": Value::Null,
        "failure": Value::Null,
        "metadata": options.get("metadata").cloned().unwrap_or_else(|| json!({})),
    }))
}

pub fn normalize(value: &Value) -> Result<Value, CoreError> {
    let object = value
        .as_object()
        .ok_or_else(|| CoreError("surface_attachment_record_required".into()))?;
    if object.get("schema").and_then(Value::as_str) != Some(SCHEMA) {
        return Err(CoreError("surface_attachment_schema_invalid".into()));
    }
    let required = |key: &str| {
        object
            .get(key)
            .and_then(Value::as_str)
            .filter(|v| !v.trim().is_empty())
            .map(str::to_string)
            .ok_or_else(|| CoreError(format!("surface_attachment_{key}_required")))
    };
    let state = required("attachment_state")?;
    let health = required("health_state")?;
    if !is_state(&state) {
        return Err(CoreError(format!(
            "surface_attachment_state_invalid:{state}"
        )));
    }
    if !is_health(&health) {
        return Err(CoreError(format!(
            "surface_attachment_health_invalid:{health}"
        )));
    }
    let mut normalized = value.clone();
    normalized["schema"] = json!(SCHEMA);
    normalized["attachment_id"] = json!(required("attachment_id")?);
    normalized["session_id"] = json!(required("session_id")?);
    normalized["surface_kind"] = json!(required("surface_kind")?);
    normalized["surface_instance_id"] = json!(required("surface_instance_id")?);
    normalized["permission_set"] = json!(object
        .get("permission_set")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default());
    normalized["event_cursor"] = object
        .get("event_cursor")
        .cloned()
        .unwrap_or_else(|| json!({ "last_sequence": Value::Null, "next_sequence": Value::Null }));
    normalized["metadata"] = object.get("metadata").cloned().unwrap_or_else(|| json!({}));
    Ok(normalized)
}

pub fn can_transition(previous: &str, next: &str) -> bool {
    previous == next
        || matches!(
            (previous, next),
            ("requested", "discovering" | "failed")
                | ("discovering", "probing_health" | "failed")
                | (
                    "probing_health",
                    "attached" | "reconnecting" | "stale" | "failed"
                )
                | (
                    "attached",
                    "reconnecting" | "stale" | "detaching" | "failed"
                )
                | (
                    "reconnecting",
                    "probing_health" | "attached" | "stale" | "detaching" | "failed"
                )
                | (
                    "stale",
                    "reconnecting" | "detaching" | "detached" | "failed"
                )
                | ("detaching", "detached" | "failed")
        )
}

pub fn transition(value: &Value, next: &str, evidence: &Value) -> Result<Value, CoreError> {
    let current = normalize(value)?;
    let previous = current
        .get("attachment_state")
        .and_then(Value::as_str)
        .unwrap_or("requested");
    if !can_transition(previous, next) {
        return Err(CoreError(format!(
            "invalid_nars_surface_attachment_transition:{previous}:{next}"
        )));
    }
    if previous == next {
        return Ok(current);
    }
    let now = evidence
        .get("now")
        .and_then(Value::as_str)
        .filter(|v| !v.trim().is_empty())
        .unwrap_or_else(|| "")
        .to_string();
    let now = if now.is_empty() { now_iso() } else { now };
    let mut next_value = current.clone();
    next_value["attachment_state"] = json!(next);
    next_value["updated_at"] = json!(now);
    if next == "attached"
        && current
            .get("attached_at")
            .map(Value::is_null)
            .unwrap_or(true)
    {
        next_value["attached_at"] = json!(now);
    }
    if next == "detached" || next == "failed" {
        if current
            .get("detached_at")
            .map(Value::is_null)
            .unwrap_or(true)
        {
            next_value["detached_at"] = json!(now);
        }
    }
    if let Some(health) = evidence
        .get("health_state")
        .and_then(Value::as_str)
        .filter(|v| is_health(v))
    {
        next_value["health_state"] = json!(health);
    }
    if let Some(cursor) = evidence.get("event_cursor") {
        next_value["event_cursor"] = cursor.clone();
    }
    if let Some(failure) = evidence.get("failure") {
        next_value["failure"] = failure.clone();
    } else if next == "failed" {
        next_value["failure"] = json!({ "code": "surface_attachment_failed", "message": evidence.get("error").and_then(Value::as_str).unwrap_or("surface attachment failed"), "at": now });
    }
    if let Some(reason) = evidence
        .get("reason")
        .and_then(Value::as_str)
        .filter(|v| !v.trim().is_empty())
    {
        next_value["metadata"]["last_transition_reason"] = json!(reason);
    }
    Ok(next_value)
}

pub fn summary(attachments: &[Value]) -> Value {
    let mut health_counts = Map::new();
    for health in ["unknown", "healthy", "degraded", "unavailable", "stale"] {
        health_counts.insert(health.into(), json!(0));
    }
    let mut attached = 0;
    let mut reconnecting = 0;
    let mut stale = 0;
    let mut detached = 0;
    let mut failed = 0;
    for attachment in attachments {
        if let Some(state) = attachment.get("attachment_state").and_then(Value::as_str) {
            match state {
                "attached" => attached += 1,
                "reconnecting" => reconnecting += 1,
                "stale" => stale += 1,
                "detached" => detached += 1,
                "failed" => failed += 1,
                _ => {}
            }
        }
        if let Some(health) = attachment.get("health_state").and_then(Value::as_str) {
            if let Some(counter) = health_counts.get_mut(health) {
                *counter = json!(counter.as_u64().unwrap_or(0) + 1);
            }
        }
    }
    json!({ "schema": SUMMARY_SCHEMA, "count": attachments.len(), "attached_count": attached, "reconnecting_count": reconnecting, "stale_count": stale, "detached_count": detached, "failed_count": failed, "health_counts": health_counts })
}

pub fn registry_path(session_path: &Path) -> Result<PathBuf, CoreError> {
    Ok(session_path
        .parent()
        .ok_or_else(|| CoreError("surface_attachment_session_path_required".into()))?
        .join(REGISTRY_FILE))
}
pub fn read_registry(session_path: Option<&Path>, session_id: &str) -> Result<Value, CoreError> {
    let Some(session_path) = session_path else {
        return Ok(
            json!({ "schema": REGISTRY_SCHEMA, "session_id": session_id, "generated_at": now_iso(), "attachments": [] }),
        );
    };
    let path = registry_path(session_path)?;
    if !path.exists() {
        return Ok(
            json!({ "schema": REGISTRY_SCHEMA, "session_id": session_id, "generated_at": now_iso(), "attachments": [] }),
        );
    }
    let parsed: Value = serde_json::from_str(
        &fs::read_to_string(&path)
            .map_err(|_| CoreError("surface_attachment_registry_corrupt".into()))?,
    )
    .map_err(|_| CoreError("surface_attachment_registry_corrupt".into()))?;
    if parsed.get("schema").and_then(Value::as_str) != Some(REGISTRY_SCHEMA) {
        return Err(CoreError(
            "surface_attachment_registry_schema_invalid".into(),
        ));
    }
    if parsed.get("session_id").and_then(Value::as_str) != Some(session_id) {
        return Err(CoreError(
            "surface_attachment_registry_session_mismatch".into(),
        ));
    }
    let mut result = parsed;
    if let Some(items) = result.get_mut("attachments").and_then(Value::as_array_mut) {
        for item in items.iter_mut() {
            *item = normalize(item)?;
        }
    } else {
        return Err(CoreError(
            "surface_attachment_registry_attachments_invalid".into(),
        ));
    }
    Ok(result)
}

pub fn write_registry(session_path: &Path, registry: &Value) -> Result<Value, CoreError> {
    let path = registry_path(session_path)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|_| CoreError("surface_attachment_registry_directory_failed".into()))?;
    }
    write_atomic(&path, registry)?;
    Ok(registry.clone())
}
pub fn register(
    session_path: Option<&Path>,
    session_id: &str,
    options: &Value,
) -> Result<Value, CoreError> {
    let path =
        session_path.ok_or_else(|| CoreError("surface_attachment_session_path_required".into()))?;
    let mut registry = read_registry(Some(path), session_id)?;
    let attachment = if options.get("schema").is_some() {
        normalize(options)?
    } else {
        create(options, session_id)?
    };
    if attachment.get("session_id").and_then(Value::as_str) != Some(session_id) {
        return Err(CoreError("surface_attachment_session_mismatch".into()));
    }
    let mut items = registry
        .get("attachments")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    let id = attachment
        .get("attachment_id")
        .and_then(Value::as_str)
        .unwrap_or_default();
    items.retain(|item| item.get("attachment_id").and_then(Value::as_str) != Some(id));
    items.push(attachment.clone());
    registry["attachments"] = Value::Array(items);
    registry["generated_at"] = json!(now_iso());
    write_registry(path, &registry)?;
    Ok(attachment)
}
pub fn transition_in_registry(
    session_path: Option<&Path>,
    session_id: &str,
    attachment_id: &str,
    next: &str,
    evidence: &Value,
) -> Result<Value, CoreError> {
    let path =
        session_path.ok_or_else(|| CoreError("surface_attachment_session_path_required".into()))?;
    let mut registry = read_registry(Some(path), session_id)?;
    let items = registry
        .get_mut("attachments")
        .and_then(Value::as_array_mut)
        .ok_or_else(|| CoreError("surface_attachment_registry_attachments_invalid".into()))?;
    let index = items
        .iter()
        .position(|item| item.get("attachment_id").and_then(Value::as_str) == Some(attachment_id))
        .ok_or_else(|| CoreError("surface_attachment_not_found".into()))?;
    let previous = items[index].clone();
    let next_value = transition(&previous, next, evidence)?;
    let changed = next_value != previous;
    if changed {
        items[index] = next_value.clone();
        registry["generated_at"] = json!(evidence
            .get("now")
            .and_then(Value::as_str)
            .unwrap_or_else(|| ""));
        if registry["generated_at"]
            .as_str()
            .unwrap_or_default()
            .is_empty()
        {
            registry["generated_at"] = json!(now_iso());
        }
        write_registry(path, &registry)?;
    }
    Ok(json!({ "changed": changed, "previous_record": previous, "record": next_value }))
}
pub fn list(session_path: Option<&Path>, session_id: &str) -> Result<Vec<Value>, CoreError> {
    Ok(read_registry(session_path, session_id)?
        .get("attachments")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default())
}

fn is_state(value: &str) -> bool {
    [
        "requested",
        "discovering",
        "probing_health",
        "attached",
        "reconnecting",
        "stale",
        "detaching",
        "detached",
        "failed",
    ]
    .contains(&value)
}
fn is_health(value: &str) -> bool {
    ["unknown", "healthy", "degraded", "unavailable", "stale"].contains(&value)
}
fn write_atomic(path: &Path, value: &Value) -> Result<(), CoreError> {
    let temp = path.with_extension(format!(
        "tmp-{}-{}",
        std::process::id(),
        Uuid::new_v4().simple()
    ));
    let mut file = File::create(&temp)
        .map_err(|_| CoreError("surface_attachment_registry_write_failed".into()))?;
    serde_json::to_writer_pretty(&mut file, value)
        .map_err(|_| CoreError("surface_attachment_registry_write_failed".into()))?;
    file.write_all(b"\n")
        .map_err(|_| CoreError("surface_attachment_registry_write_failed".into()))?;
    file.flush()
        .map_err(|_| CoreError("surface_attachment_registry_write_failed".into()))?;
    drop(file);
    if path.exists() {
        fs::remove_file(path)
            .map_err(|_| CoreError("surface_attachment_registry_write_failed".into()))?;
    }
    fs::rename(temp, path).map_err(|_| CoreError("surface_attachment_registry_write_failed".into()))
}
fn now_iso() -> String {
    let millis = SystemTime::now()
        .duration_since(UNIX_EPOCH)
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
