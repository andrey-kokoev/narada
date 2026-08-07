//! Durable NARS artifact records and lifecycle operations.
//!
//! The TypeScript implementation stores artifact metadata under the session
//! directory.  The native implementation deliberately uses the same JSON
//! schemas and the same path admission rule: an artifact source must be under
//! either the Site root or the session directory.

use crate::CoreError;
use serde_json::{json, Map, Value};
use std::fs::{self, File};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};
use uuid::Uuid;

pub const ARTIFACT_RECORD_SCHEMA: &str = "narada.nars.artifact_record.v1";
pub const ARTIFACT_INDEX_SCHEMA: &str = "narada.nars.artifact_index.v1";
pub const ARTIFACT_PUBLIC_SCHEMA: &str = "narada.nars.artifact_public.v1";
pub const ARTIFACT_LIFECYCLE_SCHEMA: &str = "narada.nars.artifact_lifecycle_state.v1";

pub fn artifacts_root_from_session_path(session_path: &Path) -> Result<PathBuf, CoreError> {
    let parent = session_path
        .parent()
        .ok_or_else(|| CoreError("session_path_required".into()))?;
    Ok(parent.join("artifacts"))
}

pub fn empty_index(session_path: &Path) -> Result<Value, CoreError> {
    let _ = artifacts_root_from_session_path(session_path)?;
    Ok(json!({
        "schema": ARTIFACT_INDEX_SCHEMA,
        "session_id": Value::Null,
        "agent_id": Value::Null,
        "generated_at": now_iso(),
        "artifacts": [],
    }))
}

pub fn read_index(session_path: Option<&Path>) -> Result<Value, CoreError> {
    let Some(session_path) = session_path else {
        return Ok(json!({
            "schema": ARTIFACT_INDEX_SCHEMA,
            "session_id": Value::Null,
            "agent_id": Value::Null,
            "generated_at": now_iso(),
            "artifacts": [],
        }));
    };
    let root = artifacts_root_from_session_path(session_path)?;
    let path = root.join("index.json");
    let parsed = read_json(&path);
    if parsed.get("schema").and_then(Value::as_str) == Some(ARTIFACT_INDEX_SCHEMA)
        && parsed.get("artifacts").and_then(Value::as_array).is_some()
    {
        let mut normalized = parsed;
        if let Some(items) = normalized
            .get_mut("artifacts")
            .and_then(Value::as_array_mut)
        {
            for item in items.iter_mut() {
                normalize_record(item);
            }
        }
        return Ok(normalized);
    }
    empty_index(session_path)
}

pub fn register(
    session_path: Option<&Path>,
    session_id: Option<&str>,
    agent_id: Option<&str>,
    site_root: Option<&Path>,
    source_path: &Path,
    kind: Option<&str>,
    title: Option<&str>,
    content_type: Option<&str>,
    render_hint: Option<&str>,
    access_scope: Option<&str>,
) -> Result<Value, CoreError> {
    let session_path = session_path.ok_or_else(|| CoreError("session_path_required".into()))?;
    let source = canonical_existing_file(source_path)?;
    let mut roots = vec![session_path.parent().unwrap_or(session_path).to_path_buf()];
    if let Some(site) = site_root {
        roots.push(canonical_path(site));
    }
    if !within_any_root(&source, &roots) {
        return Err(CoreError("artifact_path_outside_admitted_roots".into()));
    }
    let inferred_kind = infer_kind(&source);
    let artifact_kind = normalize_kind(kind.unwrap_or(&inferred_kind));
    if !["html", "markdown", "image", "json", "text", "audio"].contains(&artifact_kind.as_str()) {
        return Err(CoreError("artifact_kind_unsupported".into()));
    }
    let effective_content_type = validate_content_type(&artifact_kind, content_type, &source)?;
    let now = now_iso();
    let artifact_id = format!(
        "art_{}_{}",
        compact_timestamp(&now),
        Uuid::new_v4().simple()
    );
    let mut render = Map::new();
    render.insert(
        "preferred".into(),
        json!(if render_hint == Some("link") {
            "link"
        } else {
            "inline"
        }),
    );
    if artifact_kind == "html" {
        render.insert(
            "sandbox".into(),
            json!({
                "allow_scripts": true,
                "allow_forms": true,
                "allow_same_origin": false,
                "allow_top_navigation": false,
            }),
        );
    } else {
        render.insert("sandbox".into(), Value::Null);
    }
    if artifact_kind == "audio" {
        render.insert("media_controls".into(), json!(true));
    }
    let lifecycle = json!({
        "schema": ARTIFACT_LIFECYCLE_SCHEMA,
        "state": "active",
        "terminal_state": Value::Null,
        "owner": "nars-session",
        "created_at": now,
        "updated_at": now,
        "reason": "artifact_registered",
        "history": [{ "previous_state": Value::Null, "artifact_state": "active", "transitioned_at": now, "reason": "artifact_registered" }],
    });
    let record = json!({
        "schema": ARTIFACT_RECORD_SCHEMA,
        "artifact_id": artifact_id,
        "session_id": session_id,
        "agent_id": agent_id,
        "kind": artifact_kind,
        "title": title.map(str::to_string).unwrap_or_else(|| source.file_name().and_then(|v| v.to_str()).unwrap_or("Artifact").to_string()),
        "source_path": source.to_string_lossy(),
        "content_type": effective_content_type,
        "created_at": now,
        "access": { "scope": if access_scope == Some("site") { "site" } else { "session" }, "token_required": false },
        "render": Value::Object(render),
        "lifecycle": lifecycle,
    });
    let mut index = read_index(Some(session_path))?;
    index["session_id"] = session_id.map_or(Value::Null, |v| json!(v));
    index["agent_id"] = agent_id.map_or(Value::Null, |v| json!(v));
    index["generated_at"] = json!(now);
    let mut artifacts = index
        .get("artifacts")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    artifacts.retain(|item| item.get("artifact_id") != record.get("artifact_id"));
    artifacts.push(record.clone());
    index["artifacts"] = Value::Array(artifacts);
    write_index(session_path, &index)?;
    Ok(
        json!({ "record": record, "public_record": public_record(&record), "index": public_index(&index) }),
    )
}

pub fn transition(
    session_path: Option<&Path>,
    artifact_id: &str,
    next_state: &str,
    evidence: &Value,
) -> Result<Value, CoreError> {
    let session_path = session_path.ok_or_else(|| CoreError("session_path_required".into()))?;
    let mut index = read_index(Some(session_path))?;
    let original = index
        .get("artifacts")
        .and_then(Value::as_array)
        .and_then(|items| {
            items
                .iter()
                .find(|item| item.get("artifact_id").and_then(Value::as_str) == Some(artifact_id))
        })
        .cloned()
        .ok_or_else(|| CoreError("artifact_not_found".into()))?;
    let mut item = original;
    normalize_record(&mut item);
    let previous = item
        .get("lifecycle")
        .and_then(|v| v.get("state"))
        .and_then(Value::as_str)
        .unwrap_or("active")
        .to_string();
    if !can_transition(&previous, next_state) {
        return Err(CoreError(format!(
            "invalid_nars_artifact_lifecycle_transition:{previous}:{next_state}"
        )));
    }
    if previous == next_state {
        return Ok(
            json!({ "changed": false, "previous_record": item.clone(), "record": item.clone(), "public_record": public_record(&item), "index": public_index(&index) }),
        );
    }
    let at = evidence
        .get("transitioned_at")
        .and_then(Value::as_str)
        .or_else(|| evidence.get("updated_at").and_then(Value::as_str))
        .unwrap_or_else(|| "")
        .to_string();
    let at = if at.trim().is_empty() { now_iso() } else { at };
    let reason = evidence
        .get("reason")
        .and_then(Value::as_str)
        .unwrap_or_else(|| match next_state {
            "revoked" => "artifact_revoked",
            "expired" => "artifact_expired",
            "archived" => "artifact_archived",
            _ => "artifact_transition",
        });
    let old = item.clone();
    let lifecycle = item.get("lifecycle").cloned().unwrap_or_else(|| json!({}));
    let mut history = lifecycle
        .get("history")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    history.push(json!({ "previous_state": previous, "artifact_state": next_state, "transitioned_at": at, "reason": reason }));
    item["lifecycle"] = json!({
        "schema": ARTIFACT_LIFECYCLE_SCHEMA,
        "state": next_state,
        "terminal_state": if next_state == "archived" { json!(next_state) } else { Value::Null },
        "owner": lifecycle.get("owner").cloned().unwrap_or_else(|| json!("nars-session")),
        "created_at": lifecycle.get("created_at").cloned().unwrap_or(Value::Null),
        "updated_at": at,
        "reason": reason,
        "history": history,
    });
    let artifacts = index
        .get_mut("artifacts")
        .and_then(Value::as_array_mut)
        .ok_or_else(|| CoreError("artifact_index_invalid".into()))?;
    if let Some(position) = artifacts
        .iter()
        .position(|value| value.get("artifact_id").and_then(Value::as_str) == Some(artifact_id))
    {
        artifacts[position] = item.clone();
    }
    index["generated_at"] = json!(at);
    write_index(session_path, &index)?;
    Ok(
        json!({ "changed": true, "previous_record": old, "record": item.clone(), "public_record": public_record(&item), "index": public_index(&index) }),
    )
}

pub fn read_content(
    session_path: Option<&Path>,
    artifact_id: &str,
    site_root: Option<&Path>,
) -> Result<Value, CoreError> {
    let session_path = session_path.ok_or_else(|| CoreError("session_path_required".into()))?;
    let index = read_index(Some(session_path))?;
    let record = index
        .get("artifacts")
        .and_then(Value::as_array)
        .and_then(|items| {
            items
                .iter()
                .find(|item| item.get("artifact_id").and_then(Value::as_str) == Some(artifact_id))
        })
        .cloned()
        .ok_or_else(|| CoreError("artifact_not_found".into()))?;
    let state = record
        .get("lifecycle")
        .and_then(|v| v.get("state"))
        .and_then(Value::as_str)
        .unwrap_or("active");
    if state != "active" {
        return Err(CoreError(format!("artifact_not_active:{state}")));
    }
    let source = canonical_existing_file(Path::new(
        record
            .get("source_path")
            .and_then(Value::as_str)
            .unwrap_or_default(),
    ))?;
    if let Some(site) = site_root {
        let roots = vec![
            session_path.parent().unwrap_or(session_path).to_path_buf(),
            canonical_path(site),
        ];
        if !within_any_root(&source, &roots) {
            return Err(CoreError("artifact_path_outside_admitted_roots".into()));
        }
    }
    let mut bytes = Vec::new();
    File::open(&source)
        .map_err(|_| CoreError("artifact_content_unreadable".into()))?
        .read_to_end(&mut bytes)
        .map_err(|_| CoreError("artifact_content_unreadable".into()))?;
    let headers = if record.get("kind").and_then(Value::as_str) == Some("html")
        || record
            .get("content_type")
            .and_then(Value::as_str)
            .unwrap_or("")
            .to_ascii_lowercase()
            .starts_with("text/html")
    {
        json!({ "content-security-policy": "sandbox allow-scripts allow-forms; default-src 'self' data: blob:; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; connect-src 'none'; base-uri 'none'; form-action 'none'", "x-narada-artifact-id": artifact_id, "x-narada-artifact-kind": record.get("kind") })
    } else {
        json!({})
    };
    Ok(
        json!({ "record": record, "content_base64": base64_encode(&bytes), "content_type": record.get("content_type"), "headers": headers }),
    )
}

pub fn public_record(record: &Value) -> Value {
    json!({
        "schema": ARTIFACT_PUBLIC_SCHEMA,
        "artifact_id": record.get("artifact_id"),
        "session_id": record.get("session_id").cloned().unwrap_or(Value::Null),
        "agent_id": record.get("agent_id").cloned().unwrap_or(Value::Null),
        "kind": record.get("kind"),
        "title": record.get("title").cloned().unwrap_or(Value::Null),
        "content_type": record.get("content_type").cloned().unwrap_or_else(|| json!("application/octet-stream")),
        "created_at": record.get("created_at").cloned().unwrap_or(Value::Null),
        "access": record.get("access").cloned().unwrap_or_else(|| json!({ "scope": "session", "token_required": false })),
        "render": record.get("render").cloned().unwrap_or_else(|| json!({ "preferred": "inline" })),
        "lifecycle": record.get("lifecycle").cloned().unwrap_or(Value::Null),
    })
}

pub fn public_index(index: &Value) -> Value {
    json!({
        "schema": ARTIFACT_INDEX_SCHEMA,
        "session_id": index.get("session_id").cloned().unwrap_or(Value::Null),
        "agent_id": index.get("agent_id").cloned().unwrap_or(Value::Null),
        "generated_at": index.get("generated_at").cloned().unwrap_or_else(|| json!(now_iso())),
        "artifacts": index.get("artifacts").and_then(Value::as_array).map(|items| items.iter().map(public_record).collect::<Vec<_>>()).unwrap_or_default(),
    })
}

fn normalize_record(record: &mut Value) {
    let Some(object) = record.as_object_mut() else {
        return;
    };
    if !object.contains_key("schema") {
        object.insert("schema".into(), json!(ARTIFACT_RECORD_SCHEMA));
    }
    if let Some(lifecycle) = object.get_mut("lifecycle") {
        normalize_lifecycle(lifecycle);
    }
}

fn normalize_lifecycle(lifecycle: &mut Value) {
    let Some(object) = lifecycle.as_object_mut() else {
        *lifecycle = json!({ "schema": ARTIFACT_LIFECYCLE_SCHEMA, "state": "active", "terminal_state": Value::Null, "owner": "nars-session", "history": [] });
        return;
    };
    let state = object
        .get("state")
        .and_then(Value::as_str)
        .unwrap_or("active")
        .to_string();
    object.insert("schema".into(), json!(ARTIFACT_LIFECYCLE_SCHEMA));
    object.insert(
        "terminal_state".into(),
        if state == "archived" {
            json!(state)
        } else {
            Value::Null
        },
    );
    if !object.contains_key("owner") {
        object.insert("owner".into(), json!("nars-session"));
    }
    if !object.contains_key("history") {
        object.insert("history".into(), json!([]));
    }
}

fn can_transition(previous: &str, next: &str) -> bool {
    previous == next
        || matches!(
            (previous, next),
            ("active", "revoked" | "expired" | "archived")
                | ("revoked", "archived")
                | ("expired", "archived")
        )
}
fn normalize_kind(kind: &str) -> String {
    let value = kind.trim().to_ascii_lowercase();
    if value == "text/html" {
        "html".into()
    } else {
        value
    }
}
fn infer_kind(path: &Path) -> String {
    match path
        .extension()
        .and_then(|x| x.to_str())
        .unwrap_or("")
        .to_ascii_lowercase()
        .as_str()
    {
        "html" | "htm" => "html".into(),
        "md" | "markdown" => "markdown".into(),
        "json" => "json".into(),
        "wav" | "mp3" | "ogg" | "m4a" => "audio".into(),
        _ => "text".into(),
    }
}
fn validate_content_type(
    kind: &str,
    supplied: Option<&str>,
    source: &Path,
) -> Result<String, CoreError> {
    let expected = if kind == "audio" {
        match source
            .extension()
            .and_then(|x| x.to_str())
            .unwrap_or("")
            .to_ascii_lowercase()
            .as_str()
        {
            "mp3" => "audio/mpeg",
            "ogg" => "audio/ogg",
            "m4a" => "audio/mp4",
            _ => "audio/wav",
        }
    } else {
        match kind {
            "html" => "text/html; charset=utf-8",
            "markdown" => "text/markdown; charset=utf-8",
            "json" => "application/json; charset=utf-8",
            "text" => "text/plain; charset=utf-8",
            _ => "application/octet-stream",
        }
    };
    if let Some(value) = supplied {
        if value.trim().to_ascii_lowercase() != expected.to_ascii_lowercase() {
            return Err(CoreError("artifact_content_type_mismatch".into()));
        }
    }
    Ok(expected.into())
}
fn canonical_existing_file(path: &Path) -> Result<PathBuf, CoreError> {
    let canonical =
        fs::canonicalize(path).map_err(|_| CoreError("artifact_source_not_found".into()))?;
    if !canonical.is_file() {
        return Err(CoreError("artifact_source_not_found".into()));
    }
    Ok(canonical)
}
fn canonical_path(path: &Path) -> PathBuf {
    fs::canonicalize(path).unwrap_or_else(|_| path.to_path_buf())
}
fn within_any_root(path: &Path, roots: &[PathBuf]) -> bool {
    roots
        .iter()
        .any(|root| path == root || path.starts_with(root))
}
fn read_json(path: &Path) -> Value {
    fs::read_to_string(path)
        .ok()
        .and_then(|value| serde_json::from_str(&value).ok())
        .unwrap_or(Value::Null)
}
fn write_index(session_path: &Path, value: &Value) -> Result<(), CoreError> {
    let root = artifacts_root_from_session_path(session_path)?;
    fs::create_dir_all(&root)
        .map_err(|error| CoreError(format!("artifact_directory_create_failed:{error}")))?;
    write_atomic(&root.join("index.json"), value)
}
fn write_atomic(path: &Path, value: &Value) -> Result<(), CoreError> {
    let temporary = path.with_extension(format!(
        "tmp-{}-{}",
        std::process::id(),
        Uuid::new_v4().simple()
    ));
    let mut file = File::create(&temporary)
        .map_err(|error| CoreError(format!("artifact_index_open_failed:{error}")))?;
    serde_json::to_writer_pretty(&mut file, value)
        .map_err(|error| CoreError(format!("artifact_index_encode_failed:{error}")))?;
    file.write_all(b"\n")
        .map_err(|error| CoreError(format!("artifact_index_write_failed:{error}")))?;
    file.flush()
        .map_err(|error| CoreError(format!("artifact_index_flush_failed:{error}")))?;
    drop(file);
    if path.exists() {
        fs::remove_file(path)
            .map_err(|error| CoreError(format!("artifact_index_replace_failed:{error}")))?;
    }
    fs::rename(temporary, path)
        .map_err(|error| CoreError(format!("artifact_index_rename_failed:{error}")))
}
fn compact_timestamp(value: &str) -> String {
    value
        .chars()
        .filter(|ch| ch.is_ascii_alphanumeric())
        .take(16)
        .collect()
}
fn base64_encode(bytes: &[u8]) -> String {
    const TABLE: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut out = String::with_capacity((bytes.len() + 2) / 3 * 4);
    for chunk in bytes.chunks(3) {
        let a = chunk[0] as u32;
        let b = chunk.get(1).copied().unwrap_or(0) as u32;
        let c = chunk.get(2).copied().unwrap_or(0) as u32;
        let triple = (a << 16) | (b << 8) | c;
        out.push(TABLE[((triple >> 18) & 63) as usize] as char);
        out.push(TABLE[((triple >> 12) & 63) as usize] as char);
        out.push(if chunk.len() > 1 {
            TABLE[((triple >> 6) & 63) as usize] as char
        } else {
            '='
        });
        out.push(if chunk.len() > 2 {
            TABLE[(triple & 63) as usize] as char
        } else {
            '='
        });
    }
    out
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
