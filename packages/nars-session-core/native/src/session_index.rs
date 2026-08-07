//! Rebuildable per-session and aggregate discovery projections.

use crate::CoreError;
use serde_json::{json, Value};
use std::fs::{self, File};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};
use uuid::Uuid;

pub const RECORD_SCHEMA: &str = "narada.nars.session_index_record.v1";
pub const INDEX_SCHEMA: &str = "narada.nars.session_index.v1";
pub const DISCOVERY_SCHEMA: &str = "narada.nars.session_discovery.v1";

#[derive(Debug, Clone)]
pub struct IndexPaths {
    pub session_dir: PathBuf,
    pub record_path: PathBuf,
    pub heartbeat_path: PathBuf,
    pub aggregate_path: PathBuf,
}

pub fn paths_from_session_path(session_path: Option<&Path>) -> Option<IndexPaths> {
    let path = session_path?;
    let session_dir = path.parent()?.to_path_buf();
    Some(IndexPaths {
        session_dir: session_dir.clone(),
        record_path: session_dir.join("session-index-record.json"),
        heartbeat_path: session_dir.join("heartbeat.json"),
        aggregate_path: session_dir.parent()?.join("index.json"),
    })
}

pub fn write_started(
    session_started: &Value,
    session_path: Option<&Path>,
    site_root: Option<&Path>,
) -> Result<Option<Value>, CoreError> {
    let Some(paths) = paths_from_session_path(session_path) else {
        return Ok(None);
    };
    let now = session_started
        .get("timestamp")
        .and_then(Value::as_str)
        .unwrap_or_else(|| "");
    let now = if now.is_empty() {
        now_iso()
    } else {
        now.to_string()
    };
    let session_id = session_started
        .get("session_id")
        .or_else(|| session_started.get("carrier_session_id"))
        .cloned()
        .unwrap_or(Value::Null);
    let site = site_root
        .map(|p| p.to_string_lossy().to_string())
        .or_else(|| {
            session_started
                .get("site_root")
                .and_then(Value::as_str)
                .map(str::to_string)
        });
    let session_path_value = session_started
        .get("session_path")
        .cloned()
        .or_else(|| session_path.map(|p| json!(p.to_string_lossy())))
        .unwrap_or(Value::Null);
    let events_path_value = session_started
        .get("events_path")
        .cloned()
        .or_else(|| {
            session_path.map(|p| {
                json!(p
                    .parent()
                    .unwrap_or(p)
                    .join("events.jsonl")
                    .to_string_lossy())
            })
        })
        .unwrap_or(Value::Null);
    let authority_runtime_host = session_started
        .get("authority_runtime_host")
        .cloned()
        .unwrap_or_else(|| json!("local"));
    let authority_epoch = session_started
        .get("authority_epoch")
        .cloned()
        .unwrap_or_else(|| json!(1));
    let runtime_origin = session_started
        .get("runtime_origin")
        .cloned()
        .unwrap_or_else(|| json!("local"));
    let record = json!({
        "schema": RECORD_SCHEMA,
        "session_id": session_id,
        "runtime_session_id": session_started.get("session_id"),
        "nars_session_id": session_started.get("session_id"),
        "carrier_session_id": session_started.get("carrier_session_id").or_else(|| session_started.get("session_id")),
        "agent_id": session_started.get("agent_id"),
        "agent_identity_ref": session_started.get("agent_identity_ref"),
        "site_id": session_started.get("site_id"),
        "site_root": site,
        "session_dir": paths.session_dir,
        "session_path": session_path_value,
        "events_path": events_path_value,
        "record_path": paths.record_path,
        "heartbeat_path": paths.heartbeat_path,
        "runtime_kind": session_started.get("runtime"),
        "runtime_engine_kind": session_started.get("runtime_engine_kind"),
        "site_id_source": "session_started",
        "launch_session_id": session_started.get("launch_session_id"),
        "process_ownership": { "ownership": "runtime_process", "cleanup_policy": "session_close", "pid": session_started.get("pid") },
        "event_endpoint": session_started.get("event_endpoint"),
        "health_endpoint": session_started.get("health_endpoint"),
        "started_at": now,
        "last_seen_at": now,
        "terminal_state": Value::Null,
        "status_hint": "alive",
        "authority_runtime_host": authority_runtime_host,
        "authority_epoch": authority_epoch,
        "runtime_origin": runtime_origin,
        "authority_runtime_id": session_started.get("authority_runtime_id"),
        "authority_transition_id": session_started.get("authority_transition_id"),
        "authority_handoff_evidence": session_started.get("authority_handoff_evidence"),
        "authority_reconciliation_evidence": session_started.get("authority_reconciliation_evidence"),
        "attach_commands": session_started.get("attach_commands"),
        "projection_generated_at": now,
    });
    write_atomic(&paths.record_path, &record)?;
    let index = rebuild(&paths.aggregate_path, site.as_deref())?;
    Ok(Some(
        json!({ "record": record, "index": index, "paths": { "session_dir": paths.session_dir, "record_path": paths.record_path, "heartbeat_path": paths.heartbeat_path, "aggregate_path": paths.aggregate_path } }),
    ))
}

pub fn mark_closed(
    session_path: Option<&Path>,
    terminal_state: &str,
    reason: Option<&str>,
    site_root: Option<&Path>,
) -> Result<Option<Value>, CoreError> {
    let Some(paths) = paths_from_session_path(session_path) else {
        return Ok(None);
    };
    let Some(mut record) = read_json(&paths.record_path) else {
        return Ok(None);
    };
    if record.get("schema").and_then(Value::as_str) != Some(RECORD_SCHEMA) {
        return Ok(None);
    }
    let now = now_iso();
    record["terminal_state"] = json!(terminal_state);
    record["terminal_reason"] = reason.map_or(Value::Null, |v| json!(v));
    record["status_hint"] = json!(terminal_state);
    record["closed_at"] = json!(now);
    record["last_seen_at"] = json!(now);
    record["projection_generated_at"] = json!(now);
    write_atomic(&paths.record_path, &record)?;
    let index = rebuild(&paths.aggregate_path, site_root.and_then(|p| p.to_str()))?;
    Ok(Some(
        json!({ "record": record, "index": index, "paths": { "session_dir": paths.session_dir, "record_path": paths.record_path, "heartbeat_path": paths.heartbeat_path, "aggregate_path": paths.aggregate_path } }),
    ))
}

pub fn update_authority_transition(
    session_path: Option<&Path>,
    state: Option<&str>,
    handoff: Option<Value>,
    source_write_admission: Option<&str>,
    evidence: Option<Value>,
    site_root: Option<&Path>,
) -> Result<Option<Value>, CoreError> {
    let Some(paths) = paths_from_session_path(session_path) else {
        return Ok(None);
    };
    let Some(mut record) = read_json(&paths.record_path) else {
        return Ok(None);
    };
    if record.get("schema").and_then(Value::as_str) != Some(RECORD_SCHEMA) {
        return Ok(None);
    }
    if let Some(value) = state {
        record["authority_transition_state"] = json!(value);
    }
    if let Some(value) = handoff {
        record["authority_handoff_lifecycle"] = value;
    }
    if let Some(value) = source_write_admission {
        record["source_write_admission"] = json!(value);
    }
    if let Some(value) = evidence {
        record["authority_handoff_evidence"] = value;
    }
    let now = now_iso();
    record["last_seen_at"] = json!(now);
    record["projection_generated_at"] = json!(now);
    write_atomic(&paths.record_path, &record)?;
    let index = rebuild(&paths.aggregate_path, site_root.and_then(|p| p.to_str()))?;
    Ok(Some(
        json!({ "record": record, "index": index, "paths": { "session_dir": paths.session_dir, "record_path": paths.record_path, "heartbeat_path": paths.heartbeat_path, "aggregate_path": paths.aggregate_path } }),
    ))
}

pub fn read_index(
    sessions_root: Option<&Path>,
    site_root: Option<&Path>,
) -> Result<Value, CoreError> {
    let Some(root) = sessions_root else {
        return Ok(empty_index(
            site_root.map(|p| p.to_string_lossy().to_string()),
        ));
    };
    let aggregate_path = root.join("index.json");
    if let Some(index) = read_json(&aggregate_path) {
        if index.get("schema").and_then(Value::as_str) == Some(INDEX_SCHEMA)
            && index.get("sessions").and_then(Value::as_array).is_some()
        {
            return Ok(index);
        }
    }
    rebuild(&aggregate_path, site_root.and_then(|p| p.to_str()))
}

pub fn discover(
    site_root: &Path,
    now: Option<&str>,
    heartbeat_fresh_ms: u64,
) -> Result<Value, CoreError> {
    let sessions_root = site_root.join(".narada").join("crew").join("nars-sessions");
    let index = read_index(Some(&sessions_root), Some(site_root))?;
    let generated_at = now.map(str::to_string).unwrap_or_else(now_iso);
    let observations = index
        .get("sessions")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default()
        .into_iter()
        .map(|entry| observe(entry, &generated_at, heartbeat_fresh_ms))
        .collect::<Vec<_>>();
    Ok(
        json!({ "schema": DISCOVERY_SCHEMA, "site_root": site_root, "sessions_root": sessions_root, "generated_at": generated_at, "index": index, "sessions": observations }),
    )
}

fn observe(entry: Value, now: &str, fresh_ms: u64) -> Value {
    let record_path = entry
        .get("record_path")
        .and_then(Value::as_str)
        .map(PathBuf::from);
    let heartbeat_path = entry
        .get("heartbeat_path")
        .and_then(Value::as_str)
        .map(PathBuf::from);
    let record = record_path
        .as_deref()
        .and_then(read_json)
        .unwrap_or_else(|| entry.clone());
    let heartbeat = heartbeat_path.as_deref().and_then(read_json);
    let heartbeat_at = heartbeat
        .as_ref()
        .and_then(|v| v.get("heartbeat_at").or_else(|| v.get("updated_at")))
        .and_then(Value::as_str);
    let age = heartbeat_at.and_then(|value| {
        parse_ms(now)
            .zip(parse_ms(value))
            .map(|(n, h)| n.saturating_sub(h))
    });
    let fresh = age.map(|value| value <= fresh_ms).unwrap_or(false);
    let display = if record.get("terminal_state").and_then(Value::as_str) == Some("closed") {
        ("closed", "terminal_state_closed")
    } else if fresh {
        ("starting_or_degraded", "fresh_heartbeat_without_health")
    } else if heartbeat_at.is_some()
        || record.get("status_hint").and_then(Value::as_str) == Some("alive")
    {
        ("stale", "stale_or_missing_liveness")
    } else {
        ("historical", "historical_record_only")
    };
    let mut result = entry;
    result["display_state"] = json!(display.0);
    result["display_state_reason"] = json!(display.1);
    result["heartbeat_fresh"] = json!(fresh);
    result["heartbeat_age_ms"] = age.map_or(Value::Null, |v| json!(v));
    result["health_status"] = json!("unknown");
    result["record"] = record;
    result["heartbeat"] = heartbeat.map_or(Value::Null, |v| v);
    result
}

fn rebuild(aggregate_path: &Path, site_root: Option<&str>) -> Result<Value, CoreError> {
    let root = aggregate_path
        .parent()
        .ok_or_else(|| CoreError("session_index_root_required".into()))?;
    let mut sessions = Vec::new();
    if root.exists() {
        for entry in fs::read_dir(root)
            .map_err(|_| CoreError("session_index_read_failed".into()))?
            .filter_map(Result::ok)
            .filter(|e| e.file_type().map(|t| t.is_dir()).unwrap_or(false))
        {
            let path = entry.path().join("session-index-record.json");
            if let Some(record) = read_json(&path) {
                if record.get("schema").and_then(Value::as_str) == Some(RECORD_SCHEMA) {
                    sessions.push(record);
                }
            }
        }
    }
    sessions.sort_by(|left, right| {
        right
            .get("started_at")
            .and_then(Value::as_str)
            .unwrap_or_default()
            .cmp(
                left.get("started_at")
                    .and_then(Value::as_str)
                    .unwrap_or_default(),
            )
    });
    let index = json!({ "schema": INDEX_SCHEMA, "site_root": site_root, "generated_at": now_iso(), "maintenance": "incremental_rebuildable_v1", "session_count": sessions.len(), "sessions": sessions });
    write_atomic(aggregate_path, &index)?;
    Ok(index)
}

fn empty_index(site_root: Option<String>) -> Value {
    json!({ "schema": INDEX_SCHEMA, "site_root": site_root, "generated_at": now_iso(), "maintenance": "incremental_rebuildable_v1", "session_count": 0, "sessions": [] })
}
fn read_json(path: &Path) -> Option<Value> {
    fs::read_to_string(path)
        .ok()
        .and_then(|text| serde_json::from_str(&text).ok())
}
fn write_atomic(path: &Path, value: &Value) -> Result<(), CoreError> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|_| CoreError("session_index_directory_failed".into()))?;
    }
    let temp = path.with_extension(format!(
        "tmp-{}-{}",
        std::process::id(),
        Uuid::new_v4().simple()
    ));
    let mut file =
        File::create(&temp).map_err(|_| CoreError("session_index_write_failed".into()))?;
    serde_json::to_writer_pretty(&mut file, value)
        .map_err(|_| CoreError("session_index_write_failed".into()))?;
    file.write_all(b"\n")
        .map_err(|_| CoreError("session_index_write_failed".into()))?;
    file.flush()
        .map_err(|_| CoreError("session_index_write_failed".into()))?;
    drop(file);
    if path.exists() {
        fs::remove_file(path).map_err(|_| CoreError("session_index_write_failed".into()))?;
    }
    fs::rename(temp, path).map_err(|_| CoreError("session_index_write_failed".into()))
}
fn parse_ms(value: &str) -> Option<u64> {
    let value = value.trim();
    if let Ok(number) = value.parse::<u64>() {
        return Some(number);
    }
    let date = chrono_like_parse(value)?;
    Some(date)
}
fn chrono_like_parse(value: &str) -> Option<u64> {
    let bytes = value.as_bytes();
    if bytes.len() < 20 {
        return None;
    }
    let year: u64 = value.get(0..4)?.parse().ok()?;
    let month: u64 = value.get(5..7)?.parse().ok()?;
    let day: u64 = value.get(8..10)?.parse().ok()?;
    let hour: u64 = value.get(11..13)?.parse().ok()?;
    let minute: u64 = value.get(14..16)?.parse().ok()?;
    let second: u64 = value.get(17..19)?.parse().ok()?;
    let millis: u64 = value.get(20..23).unwrap_or("0").parse().unwrap_or(0);
    Some(
        (((year * 12 + month) * 31 + day) * 24 + hour) * 60 * 60 * 1000
            + minute * 60 * 1000
            + second * 1000
            + millis,
    )
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
