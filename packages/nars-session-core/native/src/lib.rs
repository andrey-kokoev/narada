//! Native implementation of the durable NARS session-core boundary.
//!
//! This library deliberately contains no provider or MCP implementation.  It
//! owns the journal, lifecycle and turn FSMs, durable operator queue, replay,
//! recovery attempts, and health/recovery projections.  A carrier/provider
//! adapter supplies only the terminal outcome of an admitted turn.

use serde_json::{json, Map, Value};
use std::collections::{BTreeMap, BTreeSet};
use std::fs::{self, File, OpenOptions};
use std::io::{BufRead, BufReader, Write};
use std::path::{Path, PathBuf};
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc,
};
use std::time::{SystemTime, UNIX_EPOCH};
use uuid::Uuid;

pub mod artifacts;
pub mod authority_transition;
pub mod event_hub;
pub mod recovery_attempt;
pub mod session_index;
pub mod supervisor;
pub mod surface_attachment;

pub const SESSION_LIFECYCLE_SCHEMA: &str = "narada.nars.session_lifecycle_state.v1";
pub const TURN_SCHEMA: &str = "narada.nars.turn_state.v1";
pub const INPUT_ADMISSION_SCHEMA: &str = "narada.nars.input_admission_state.v1";
pub const QUEUE_SCHEMA: &str = "narada.nars.operator_input_queue_state.v1";
pub const HEALTH_SCHEMA: &str = "narada.nars.session_core_health.v1";
pub const RECOVERY_SCHEMA: &str = "narada.nars.session_core_recovery.v1";
pub const EVENTS_READ_SCHEMA: &str = "narada.nars.events.read.v1";
pub const SHUTDOWN_SCHEMA: &str = "narada.nars.session_shutdown_state.v1";
pub const INPUT_ADMISSION_STATES: &[&str] = &[
    "accepted",
    "queued",
    "held",
    "admitted",
    "dropped",
    "abandoned",
];

#[derive(Debug, Clone)]
pub struct CoreError(pub String);

impl std::fmt::Display for CoreError {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter.write_str(&self.0)
    }
}

fn any_of_selector_active(value: &Value) -> bool {
    !value.is_null() && !matches!(value, Value::String(value) if value.is_empty())
}

pub fn can_transition_recovery(previous: &str, next: &str) -> bool {
    matches!(
        (previous, next),
        ("requested", "claimed" | "skipped" | "failed" | "abandoned")
            | ("claimed", "replaying" | "skipped" | "failed" | "abandoned")
            | (
                "replaying",
                "reconciled" | "interrupted" | "failed" | "abandoned"
            )
            | ("reconciled", "completed" | "failed")
    )
}

pub fn is_terminal_recovery(state: &str) -> bool {
    matches!(
        state,
        "completed" | "skipped" | "interrupted" | "failed" | "abandoned"
    )
}
impl std::error::Error for CoreError {}

/// The native core owns turn admission and terminal state transitions; a
/// provider adapter contributes only the observation of an admitted turn.
/// `Failed`/`Interrupted` are explicit terminal outcomes; `Error` represents
/// an adapter failure without a terminal result and remains replayable.
/// Provider execution and MCP effects stay outside this crate.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ProviderOutcome {
    Completed(String),
    Blocked(String),
    Refused(String),
    Failed(String),
    Interrupted(String),
    /// The adapter could not return a terminal result (for example an
    /// aborted provider request).  The supervisor keeps this input durable
    /// for replay, matching the TypeScript supervisor's thrown-error path.
    Error(String),
}

/// Cooperative cancellation shared by the Rust supervisor and a provider
/// adapter.  The supervisor owns the lifecycle; an adapter may poll this
/// token while performing provider work and return `Interrupted` promptly.
#[derive(Debug, Clone, Default)]
pub struct CancellationToken(Arc<AtomicBool>);

impl CancellationToken {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn cancel(&self) {
        self.0.store(true, Ordering::Release);
    }

    pub fn is_cancelled(&self) -> bool {
        self.0.load(Ordering::Acquire)
    }
}

/// Context supplied by the Rust-owned session supervisor to a provider
/// adapter.  The adapter may execute provider calls or MCP effects, but it
/// does not own NARS lifecycle, queue, journal, or authority semantics.
pub struct ProviderTurnContext<'a> {
    pub input: &'a Value,
    pub turn_id: &'a str,
    pub input_event_id: &'a str,
    pub recovery_replay: bool,
    pub recovery_attempt_id: Option<&'a str>,
    pub cancellation: CancellationToken,
}

pub trait NarsProviderAdapter {
    fn run_turn(&mut self, input: &Value) -> ProviderOutcome;

    /// Extended adapter boundary used by the native supervisor.  Existing
    /// adapters remain source-compatible through the terminal-only default;
    /// richer adapters can publish carrier/tool/assistant events through the
    /// supplied sink without taking ownership of the durable journal.
    fn run_turn_with_context(
        &mut self,
        context: ProviderTurnContext<'_>,
        _event_sink: &mut dyn FnMut(Value) -> Result<(), CoreError>,
    ) -> Result<ProviderOutcome, CoreError> {
        Ok(self.run_turn(context.input))
    }
}

#[derive(Debug, Clone)]
pub struct SessionCoreConfig {
    pub session_id: String,
    pub agent_id: String,
    pub session_path: Option<PathBuf>,
    pub events_path: PathBuf,
    pub site_root: Option<PathBuf>,
    pub max_event_buffer: usize,
}

#[derive(Debug, Clone)]
pub struct JournalLoad {
    pub events: Vec<Value>,
    pub corrupt_line_count: u64,
    pub next_sequence: u64,
}

#[derive(Debug)]
pub struct EventJournal {
    path: PathBuf,
    next_sequence: u64,
    event_count: u64,
    corrupt_line_count: u64,
}

impl EventJournal {
    pub fn open(path: impl AsRef<Path>) -> Result<(Self, JournalLoad), CoreError> {
        let path = path.as_ref().to_path_buf();
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent)
                .map_err(|error| CoreError(format!("events_directory_create_failed:{error}")))?;
        }
        let mut events = Vec::new();
        let mut next_sequence = 0;
        let recovery_sidecar = path.with_extension("recovery.json");
        let prior_corrupt_line_count = fs::read_to_string(&recovery_sidecar)
            .ok()
            .and_then(|text| serde_json::from_str::<Value>(&text).ok())
            .and_then(|value| value.get("corrupt_line_count").and_then(Value::as_u64))
            .unwrap_or(0);
        let mut corrupt_line_count = prior_corrupt_line_count;
        if path.exists() {
            let file = File::open(&path)
                .map_err(|error| CoreError(format!("events_open_failed:{error}")))?;
            for line in BufReader::new(file).lines() {
                let line =
                    line.map_err(|error| CoreError(format!("events_read_failed:{error}")))?;
                if line.trim().is_empty() {
                    continue;
                }
                match serde_json::from_str::<Value>(&line) {
                    Ok(value) => {
                        let fallback = events.len() as u64 + 1;
                        let sequence = value
                            .get("event_sequence")
                            .or_else(|| value.get("sequence"))
                            .and_then(Value::as_u64)
                            .unwrap_or(fallback);
                        next_sequence = next_sequence.max(sequence);
                        events.push(value);
                    }
                    Err(_) => corrupt_line_count += 1,
                }
            }
        }
        // A crashed append can leave a partial final JSON line.  Recovery
        // counts that evidence, then compacts only the valid records back to
        // the canonical JSONL journal so subsequent sequence reads remain
        // parseable and contiguous.
        if corrupt_line_count > 0 {
            let temporary = path.with_extension(format!(
                "repair-{}-{}",
                std::process::id(),
                Uuid::new_v4().simple()
            ));
            let mut repaired = File::create(&temporary)
                .map_err(|error| CoreError(format!("events_repair_open_failed:{error}")))?;
            for event in &events {
                serde_json::to_writer(&mut repaired, event)
                    .map_err(|error| CoreError(format!("events_repair_encode_failed:{error}")))?;
                repaired
                    .write_all(b"\n")
                    .map_err(|error| CoreError(format!("events_repair_write_failed:{error}")))?;
            }
            repaired
                .flush()
                .map_err(|error| CoreError(format!("events_repair_flush_failed:{error}")))?;
            drop(repaired);
            if path.exists() {
                fs::remove_file(&path)
                    .map_err(|error| CoreError(format!("events_repair_replace_failed:{error}")))?;
            }
            fs::rename(&temporary, &path)
                .map_err(|error| CoreError(format!("events_repair_rename_failed:{error}")))?;
            let sidecar_value = json!({ "schema": "narada.nars.event_journal_recovery.v1", "events_path": path, "corrupt_line_count": corrupt_line_count, "updated_at": now_iso() });
            let sidecar_temp = recovery_sidecar.with_extension(format!(
                "tmp-{}-{}",
                std::process::id(),
                Uuid::new_v4().simple()
            ));
            fs::write(
                &sidecar_temp,
                serde_json::to_vec_pretty(&sidecar_value)
                    .map_err(|error| CoreError(format!("events_recovery_encode_failed:{error}")))?,
            )
            .map_err(|error| CoreError(format!("events_recovery_write_failed:{error}")))?;
            if recovery_sidecar.exists() {
                fs::remove_file(&recovery_sidecar).map_err(|error| {
                    CoreError(format!("events_recovery_replace_failed:{error}"))
                })?;
            }
            fs::rename(&sidecar_temp, &recovery_sidecar)
                .map_err(|error| CoreError(format!("events_recovery_rename_failed:{error}")))?;
        }
        let journal = Self {
            path,
            next_sequence,
            event_count: events.len() as u64,
            corrupt_line_count,
        };
        Ok((
            journal,
            JournalLoad {
                events,
                corrupt_line_count,
                next_sequence,
            },
        ))
    }

    pub fn path(&self) -> &Path {
        &self.path
    }
    pub fn event_count(&self) -> u64 {
        self.event_count
    }
    pub fn corrupt_line_count(&self) -> u64 {
        self.corrupt_line_count
    }
    pub fn next_sequence(&self) -> u64 {
        self.next_sequence
    }

    pub fn append(
        &mut self,
        mut event: Map<String, Value>,
        session_id: &str,
        agent_id: &str,
        timestamp: String,
    ) -> Result<Value, CoreError> {
        let requested = event
            .get("event_sequence")
            .or_else(|| event.get("sequence"))
            .and_then(Value::as_u64)
            .unwrap_or(0);
        self.next_sequence = if requested > self.next_sequence {
            requested
        } else {
            self.next_sequence.saturating_add(1)
        };
        event.insert("event_sequence".to_string(), json!(self.next_sequence));
        event.insert("sequence".to_string(), json!(self.next_sequence));
        event
            .entry("session_id".to_string())
            .or_insert_with(|| json!(session_id));
        if !agent_id.is_empty() {
            event
                .entry("agent_id".to_string())
                .or_insert_with(|| json!(agent_id));
        }
        event.insert("timestamp".to_string(), json!(timestamp));
        let value = Value::Object(event);
        let mut file = OpenOptions::new()
            .create(true)
            .append(true)
            .open(&self.path)
            .map_err(|error| CoreError(format!("events_append_open_failed:{error}")))?;
        serde_json::to_writer(&mut file, &value)
            .map_err(|error| CoreError(format!("events_encode_failed:{error}")))?;
        file.write_all(b"\n")
            .map_err(|error| CoreError(format!("events_append_failed:{error}")))?;
        file.flush()
            .map_err(|error| CoreError(format!("events_flush_failed:{error}")))?;
        self.event_count += 1;
        Ok(value)
    }

    fn read_events(&self) -> Vec<Value> {
        let Ok(file) = File::open(&self.path) else {
            return Vec::new();
        };
        BufReader::new(file)
            .lines()
            .filter_map(Result::ok)
            .filter_map(|line| serde_json::from_str::<Value>(&line).ok())
            .collect()
    }

    pub fn read_events_all(&self) -> Vec<Value> {
        self.read_events()
    }

    pub fn read_page(
        &self,
        limit: usize,
        before_sequence: Option<u64>,
        direction: &str,
    ) -> Vec<Value> {
        let mut events = self.read_events();
        if let Some(before) = before_sequence {
            events.retain(|event| {
                event
                    .get("event_sequence")
                    .or_else(|| event.get("sequence"))
                    .and_then(Value::as_u64)
                    .map(|sequence| {
                        if direction == "backward" {
                            sequence < before
                        } else {
                            sequence > before
                        }
                    })
                    .unwrap_or(false)
            });
        }
        if direction == "backward" {
            events.reverse();
        }
        events.truncate(limit.max(1));
        events
    }
}

pub struct SessionCore {
    config: SessionCoreConfig,
    journal: EventJournal,
    lifecycle: String,
    turns: BTreeMap<String, Value>,
    recovery_attempts: BTreeMap<String, Value>,
    queue_path: Option<PathBuf>,
    queue_revision: u64,
    pending: Vec<Value>,
    admission: BTreeMap<String, String>,
    idempotency: BTreeMap<String, Value>,
    queue_corrupt: bool,
    active_turn_id: Option<String>,
    last_event_kind: Option<String>,
    last_event_at: Option<String>,
    last_terminal_state: Value,
    request_outcome_counts: BTreeMap<String, u64>,
    request_issue_counts: BTreeMap<String, u64>,
    authority_runtime_state: String,
    authority_runtime_history: Vec<Value>,
    authority_handoff_state: Value,
    event_hub: event_hub::EventHub,
    shutdown_state: String,
}

impl SessionCore {
    pub fn new(config: SessionCoreConfig) -> Result<Self, CoreError> {
        if config.session_id.trim().is_empty() {
            return Err(CoreError("nars_session_id_required".to_string()));
        }
        let (journal, load) = EventJournal::open(&config.events_path)?;
        let mut event_hub = event_hub::EventHub::new(config.max_event_buffer);
        for event in &load.events {
            event_hub.seed(event.clone());
        }
        let queue_path = config
            .session_path
            .as_ref()
            .and_then(|path| path.parent())
            .map(|parent| parent.join("operator-input-queue.json"));
        let (pending_from_disk, queue_corrupt, queue_revision) = queue_path
            .as_ref()
            .map(|path| read_queue(path.as_path()))
            .unwrap_or((Vec::new(), false, 0));
        let mut core = Self {
            config,
            journal,
            lifecycle: "starting".to_string(),
            turns: BTreeMap::new(),
            recovery_attempts: BTreeMap::new(),
            queue_path,
            queue_revision,
            pending: pending_from_disk,
            admission: BTreeMap::new(),
            idempotency: BTreeMap::new(),
            queue_corrupt,
            active_turn_id: None,
            last_event_kind: None,
            last_event_at: None,
            last_terminal_state: Value::Null,
            request_outcome_counts: BTreeMap::new(),
            request_issue_counts: BTreeMap::new(),
            authority_runtime_state: "not_requested".to_string(),
            authority_runtime_history: vec![
                json!({ "schema": authority_transition::RUNTIME_SCHEMA, "previous_state": Value::Null, "state": "not_requested", "evidence": { "reason": "initial_state" } }),
            ],
            authority_handoff_state: authority_transition::handoff_from_runtime("not_requested"),
            event_hub,
            shutdown_state: "idle".to_string(),
        };
        core.rehydrate(&load.events);
        if let Some(path) =
            authority_transition::source_state_path(core.config.session_path.as_deref())
        {
            let source_state = authority_transition::read_source_state(Some(&path));
            if let Some(state) = source_state
                .get("authority_transition_state")
                .and_then(Value::as_str)
            {
                core.authority_runtime_state = state.to_string();
                core.authority_handoff_state = source_state
                    .get("authority_handoff_lifecycle")
                    .cloned()
                    .unwrap_or_else(|| authority_transition::handoff_from_runtime(state));
            }
        }
        core.reconcile_pending_from_events(&load.events);
        core.persist_queue("rehydrated")?;
        Ok(core)
    }

    pub fn session_id(&self) -> &str {
        &self.config.session_id
    }
    pub fn agent_id(&self) -> &str {
        &self.config.agent_id
    }
    pub fn lifecycle_state(&self) -> &str {
        &self.lifecycle
    }
    pub fn events_path(&self) -> &Path {
        self.journal.path()
    }
    pub fn event_count(&self) -> u64 {
        self.journal.event_count()
    }
    pub fn corrupt_event_line_count(&self) -> u64 {
        self.journal.corrupt_line_count()
    }
    pub fn turns(&self) -> Vec<Value> {
        self.turns.values().cloned().collect()
    }
    pub fn turn(&self, turn_id: &str) -> Option<Value> {
        self.turns.get(turn_id).cloned()
    }
    pub fn pending_count(&self) -> usize {
        self.pending.len()
    }
    pub fn admission_state(&self, event_id: &str) -> Option<String> {
        self.pending
            .iter()
            .find(|item| string_field(item, "event_id").as_deref() == Some(event_id))
            .and_then(|item| string_field(item, "admission_state"))
    }
    pub fn queue_items(&self) -> Vec<Value> {
        self.pending
            .iter()
            .enumerate()
            .map(|(index, item)| {
                json!({
                    "index": index + 1,
                    "event_id": item.get("event_id"),
                    "request_id": item.get("request_id"),
                    "directive_id": item.get("directive_id"),
                    "source": item.get("source"),
                    "source_kind": item.get("source_kind"),
                    "source_id": item.get("source_id"),
                    "transport": item.get("transport"),
                    "delivery_mode": item.get("delivery_mode"),
                    "idempotency_key": item.get("idempotency_key"),
                    "hold_condition": item.get("hold_condition"),
                    "admission_state": item.get("admission_state"),
                    "created_at": item.get("created_at"),
                    "received_at": item.get("received_at"),
                    "content": item.get("content"),
                })
            })
            .collect()
    }
    pub fn active_turn_id(&self) -> Option<&str> {
        self.active_turn_id.as_deref()
    }

    fn turn_is_running(&self) -> bool {
        self.active_turn_id
            .as_deref()
            .and_then(|id| self.turns.get(id))
            .and_then(|turn| turn.get("turn_state"))
            .and_then(Value::as_str)
            .is_some_and(|state| state != "accepted" && !is_terminal_turn(state))
    }

    pub fn append_event(&mut self, event: Value) -> Result<Value, CoreError> {
        if self.lifecycle == "closed" {
            return Err(CoreError("nars_session_closed".to_string()));
        }
        let map = event.as_object().cloned().unwrap_or_default();
        let timestamp = map
            .get("timestamp")
            .and_then(Value::as_str)
            .map(str::to_string)
            .unwrap_or_else(now_iso);
        let published = self.journal.append(
            map,
            &self.config.session_id,
            &self.config.agent_id,
            timestamp,
        )?;
        self.event_hub.publish(published.clone());
        self.last_event_kind = event_kind(&published);
        self.last_event_at = published
            .get("timestamp")
            .or_else(|| published.get("generated_at"))
            .and_then(Value::as_str)
            .map(str::to_string);
        if let Some(value) = published.get("terminal_state") {
            self.last_terminal_state = value.clone();
        }
        if let Some(outcome) = request_outcome(&published) {
            *self.request_outcome_counts.entry(outcome).or_insert(0) += 1;
        }
        if let Some(issue) = request_issue(&published) {
            *self.request_issue_counts.entry(issue).or_insert(0) += 1;
        }
        Ok(published)
    }

    pub fn transition_lifecycle(
        &mut self,
        next: &str,
        evidence: Value,
    ) -> Result<Vec<Value>, CoreError> {
        let previous = self.lifecycle.clone();
        if !can_transition_lifecycle(&previous, next) {
            return Err(CoreError(format!(
                "invalid_nars_session_lifecycle_transition:{previous}:{next}"
            )));
        }
        if next == "closed" {
            if let Some(active) = self
                .active_turn_id
                .as_deref()
                .and_then(|id| self.turns.get(id))
            {
                if active.get("turn_state").and_then(Value::as_str) != Some("accepted") {
                    return Err(CoreError(format!(
                        "nars_session_active_turn:{id}",
                        id = self.active_turn_id.as_deref().unwrap_or_default()
                    )));
                }
            }
        }
        let mut transition = json!({ "event": "session_lifecycle_transition", "previous_state": previous, "lifecycle_state": next });
        merge_object(&mut transition, evidence.clone());
        let first = self.append_event(transition)?;
        let mut events = vec![first];
        if next == "closed" {
            self.abandon_pending("session_closed")?;
            let mut closed = json!({ "event": "session_closed", "terminal_state": "closed" });
            merge_object(&mut closed, evidence.clone());
            events.push(self.append_event(closed)?);
        }
        self.lifecycle = next.to_string();
        Ok(events)
    }

    pub fn transition(&mut self, next: &str, evidence: Value) -> Result<Vec<Value>, CoreError> {
        self.transition_lifecycle(next, evidence)
    }

    pub fn ensure_turn(&mut self, input: &Value) -> Result<Value, CoreError> {
        let turn_id = string_field(input, "turn_id")
            .or_else(|| string_field(input, "event_id"))
            .ok_or_else(|| CoreError("nars_turn_id_required".to_string()))?;
        if let Some(current) = self.turns.get(&turn_id) {
            let state = current
                .get("turn_state")
                .and_then(Value::as_str)
                .unwrap_or_default();
            if matches!(state, "completed" | "blocked" | "refused") {
                return Ok(current.clone());
            }
            if is_terminal_turn(state) {
                self.transition_turn(
                    &turn_id,
                    "accepted",
                    json!({ "retry": true, "reason": "new_input_delivery" }),
                )?;
                return Ok(self.turns.get(&turn_id).cloned().unwrap_or(Value::Null));
            }
            return Ok(current.clone());
        }
        let mut evidence = json!({ "input_event_id": string_field(input, "input_event_id").or_else(|| string_field(input, "event_id")).unwrap_or_else(|| turn_id.clone()) });
        if let Some(value) = input.get("input_ref") {
            evidence["input_ref"] = value.clone();
        }
        if let Some(value) = input.get("authority_posture") {
            evidence["authority_posture"] = value.clone();
        }
        self.transition_turn(&turn_id, "accepted", evidence)?;
        Ok(self.turns.get(&turn_id).cloned().unwrap_or(Value::Null))
    }

    pub fn transition_turn(
        &mut self,
        turn_id: &str,
        next: &str,
        evidence: Value,
    ) -> Result<Value, CoreError> {
        let current = self.turns.get(turn_id).cloned();
        let previous = current
            .as_ref()
            .and_then(|value| value.get("turn_state"))
            .and_then(Value::as_str)
            .map(str::to_string);
        if previous.as_deref() == Some(next) {
            return Ok(current.unwrap_or(Value::Null));
        }
        if !can_transition_turn(
            previous.as_deref(),
            next,
            evidence
                .get("retry")
                .and_then(Value::as_bool)
                .unwrap_or(false),
        ) {
            return Err(CoreError(format!(
                "invalid_nars_turn_transition:{}:{next}",
                previous.as_deref().unwrap_or("null")
            )));
        }
        let attempt = current
            .as_ref()
            .and_then(|value| value.get("attempt"))
            .and_then(Value::as_u64)
            .unwrap_or(1)
            + if next == "accepted" && previous.as_deref().map(is_terminal_turn).unwrap_or(false) {
                1
            } else {
                0
            };
        let mut record = current.unwrap_or_else(|| json!({}));
        if !record.is_object() {
            record = json!({});
        }
        record["schema"] = json!(TURN_SCHEMA);
        record["turn_id"] = json!(turn_id);
        record["input_event_id"] = record
            .get("input_event_id")
            .cloned()
            .or_else(|| evidence.get("input_event_id").cloned())
            .unwrap_or_else(|| json!(turn_id));
        record["session_id"] = record
            .get("session_id")
            .cloned()
            .unwrap_or_else(|| json!(self.config.session_id));
        record["agent_id"] = record
            .get("agent_id")
            .cloned()
            .unwrap_or_else(|| json!(self.config.agent_id));
        record["input_ref"] = record
            .get("input_ref")
            .cloned()
            .or_else(|| evidence.get("input_ref").cloned())
            .unwrap_or_else(|| json!({ "kind": "session_input", "event_id": turn_id }));
        record["authority_posture"] = record
            .get("authority_posture")
            .cloned()
            .or_else(|| evidence.get("authority_posture").cloned())
            .unwrap_or(Value::Null);
        record["turn_state"] = json!(next);
        record["terminal_state"] = terminal_for_turn(next)
            .map(|value| json!(value))
            .unwrap_or(Value::Null);
        record["attempt"] = json!(attempt);
        record["updated_at"] = json!(now_iso());
        if evidence
            .get("retry")
            .and_then(Value::as_bool)
            .unwrap_or(false)
        {
            record["last_error"] = Value::Null;
        }
        if let Some(error) = evidence.get("error") {
            record["last_error"] = error.clone();
        }
        let mut transition = json!({ "event": "turn_lifecycle_transition", "turn_id": turn_id, "input_event_id": record["input_event_id"], "previous_state": previous, "turn_state": next, "terminal_state": record["terminal_state"], "attempt": attempt, "input_ref": record["input_ref"], "authority_posture": record["authority_posture"] });
        if record
            .get("last_error")
            .is_some_and(|value| !value.is_null())
        {
            transition["error"] = record["last_error"].clone();
        }
        merge_object(&mut transition, evidence.clone());
        self.append_event(transition)?;
        self.turns.insert(turn_id.to_string(), record.clone());
        if is_terminal_turn(next) {
            self.active_turn_id = None;
        } else {
            self.active_turn_id = Some(turn_id.to_string());
        }
        if next == "accepted" {
            self.append_event(json!({ "event": "directive_received", "turn_id": turn_id, "input_event_id": record["input_event_id"], "attempt": attempt, "turn_state": next, "terminal_state": null, "input_ref": record["input_ref"], "authority_posture": record["authority_posture"] }))?;
        }
        if next == "evaluating"
            && matches!(
                previous.as_deref(),
                Some("accepted") | Some("contextualized")
            )
        {
            self.append_event(json!({ "event": "turn_started", "turn_id": turn_id, "input_event_id": record["input_event_id"], "attempt": attempt, "turn_state": next, "terminal_state": null }))?;
        }
        if let Some(terminal) = terminal_for_turn(next) {
            let event = match terminal {
                "failed" => {
                    json!({ "event": "turn_failed", "turn_id": turn_id, "input_event_id": record["input_event_id"], "attempt": attempt, "turn_state": next, "terminal_state": terminal, "terminal_status": terminal, "error_summary": record.get("last_error").cloned().unwrap_or_else(|| json!("turn_failed")) })
                }
                "interrupted" => {
                    json!({ "event": "turn_interrupted", "turn_id": turn_id, "input_event_id": record["input_event_id"], "attempt": attempt, "turn_state": next, "terminal_state": terminal, "terminal_status": terminal })
                }
                _ => {
                    json!({ "event": "turn_complete", "turn_id": turn_id, "input_event_id": record["input_event_id"], "attempt": attempt, "turn_state": next, "terminal_state": terminal, "terminal_status": terminal })
                }
            };
            self.append_event(event)?;
        }
        Ok(record)
    }

    pub fn observe_turn_event(&mut self, event: &Value) -> Result<Option<Value>, CoreError> {
        let turn_id =
            string_field(event, "turn_id").or_else(|| string_field(event, "input_event_id"));
        let Some(turn_id) = turn_id else {
            return Ok(None);
        };
        if !self.turns.contains_key(&turn_id) {
            return Ok(None);
        }
        let name = string_field(event, "event").unwrap_or_default();
        let advance =
            |core: &mut SessionCore, state: &str, evidence: Value| -> Result<(), CoreError> {
                let current = core
                    .turns
                    .get(&turn_id)
                    .and_then(|value| value.get("turn_state"))
                    .and_then(Value::as_str)
                    .unwrap_or_default()
                    .to_string();
                if current == state
                    || is_terminal_turn(&current)
                    || !can_transition_turn(Some(&current), state, false)
                {
                    return Ok(());
                }
                core.transition_turn(&turn_id, state, evidence)?;
                Ok(())
            };
        match name.as_str() {
            "carrier_turn_started" => {
                advance(self, "contextualized", json!({ "observed_event": name }))?;
                advance(self, "evaluating", json!({ "observed_event": name }))?;
            }
            "carrier_tool_requested" => advance(
                self,
                "tool_requested",
                json!({ "tool_name": event.get("tool_name"), "tool_call_id": event.get("tool_call_id"), "observed_event": name }),
            )?,
            "carrier_tool_completed" => match string_field(event, "status").as_deref() {
                Some("interrupted") => advance(
                    self,
                    "interrupted",
                    json!({ "reason": "tool_interrupted", "terminal_status": "interrupted" }),
                )?,
                Some("blocked") => advance(self, "blocked", json!({ "reason": "tool_blocked" }))?,
                Some("refused") => {
                    advance(self, "tool_refused", json!({ "reason": "tool_refused" }))?;
                    advance(self, "evaluating", json!({ "observed_event": name }))?;
                }
                _ => {
                    advance(
                        self,
                        "tool_admitted",
                        json!({ "tool_name": event.get("tool_name") }),
                    )?;
                    advance(
                        self,
                        "executing",
                        json!({ "tool_name": event.get("tool_name") }),
                    )?;
                    advance(
                        self,
                        "reconciling",
                        json!({ "tool_name": event.get("tool_name") }),
                    )?;
                    advance(self, "evaluating", json!({ "observed_event": name }))?;
                }
            },
            "assistant_message" => advance(self, "reconciling", json!({ "observed_event": name }))?,
            "carrier_turn_completed" => {
                advance(self, "reconciling", json!({ "observed_event": name }))?;
                advance(self, "completed", json!({ "terminal_status": "completed" }))?;
            }
            "carrier_turn_blocked" | "turn_blocked" => advance(
                self,
                "blocked",
                json!({ "reason": string_field(event, "reason").unwrap_or_else(|| "turn_blocked".to_string()), "terminal_status": "blocked" }),
            )?,
            "carrier_turn_refused" | "turn_refused" => advance(
                self,
                "refused",
                json!({ "reason": string_field(event, "reason").unwrap_or_else(|| "turn_refused".to_string()), "terminal_status": "refused" }),
            )?,
            "carrier_turn_interrupted" | "turn_interrupted" => advance(
                self,
                "interrupted",
                json!({ "reason": string_field(event, "reason").unwrap_or_else(|| "turn_interrupted".to_string()), "terminal_status": "interrupted" }),
            )?,
            "carrier_turn_failed" => {
                let error = string_field(event, "error")
                    .unwrap_or_else(|| "carrier_turn_failed".to_string());
                let interrupted = error.to_ascii_lowercase().contains("abort")
                    || error.to_ascii_lowercase().contains("cancel")
                    || error.to_ascii_lowercase().contains("interrupt");
                advance(
                    self,
                    if interrupted { "interrupted" } else { "failed" },
                    json!({ "error": error, "terminal_status": if interrupted { "interrupted" } else { "failed" } }),
                )?;
            }
            _ => {}
        }
        Ok(self.turns.get(&turn_id).cloned())
    }

    pub fn begin_recovery_attempt(
        &mut self,
        turn_id: Option<&str>,
        reason: Option<&str>,
    ) -> Result<Value, CoreError> {
        let attempt_number = self
            .recovery_attempts
            .values()
            .filter(|record| record.get("turn_id").and_then(Value::as_str) == turn_id)
            .filter_map(|record| record.get("attempt_number").and_then(Value::as_u64))
            .max()
            .unwrap_or(0)
            + 1;
        let attempt_id = format!("recovery_{}", Uuid::new_v4().simple());
        let requested_at = now_iso();
        let record = json!({
            "schema": "narada.nars.recovery_attempt_state.v1",
            "attempt_id": attempt_id,
            "turn_id": turn_id,
            "input_event_id": turn_id,
            "session_id": self.config.session_id,
            "attempt_number": attempt_number,
            "recovery_kind": "queue_replay",
            "recovery_attempt_state": "requested",
            "terminal_state": null,
            "requested_at": requested_at,
            "updated_at": requested_at,
            "reason": reason.unwrap_or("runtime_recovery_replay"),
            "error": null,
        });
        let mut transition = record.clone();
        transition["event"] = json!("recovery_attempt_state_transition");
        transition["previous_state"] = Value::Null;
        let event = self.append_event(transition)?;
        let mut persisted = record;
        persisted["updated_at"] = event
            .get("timestamp")
            .cloned()
            .unwrap_or_else(|| json!(now_iso()));
        let id = string_field(&persisted, "attempt_id").unwrap_or_default();
        self.recovery_attempts.insert(id, persisted.clone());
        Ok(persisted)
    }

    pub fn transition_recovery_attempt(
        &mut self,
        attempt_id: &str,
        next: &str,
        reason: Option<&str>,
        error: Option<Value>,
    ) -> Result<Value, CoreError> {
        let current = self
            .recovery_attempts
            .get(attempt_id)
            .cloned()
            .ok_or_else(|| CoreError(format!("nars_recovery_attempt_not_found:{attempt_id}")))?;
        let previous = string_field(&current, "recovery_attempt_state")
            .unwrap_or_else(|| "requested".to_string());
        if previous == next {
            return Ok(current);
        }
        if !can_transition_recovery(&previous, next) {
            return Err(CoreError(format!(
                "invalid_nars_recovery_attempt_transition:{previous}:{next}"
            )));
        }
        let updated_at = now_iso();
        let terminal = if is_terminal_recovery(next) {
            json!(next)
        } else {
            Value::Null
        };
        let mut record = current;
        record["recovery_attempt_state"] = json!(next);
        record["terminal_state"] = terminal;
        record["updated_at"] = json!(updated_at);
        if let Some(reason) = reason {
            record["reason"] = json!(reason);
        }
        if let Some(error) = error {
            record["error"] = error;
        }
        self.append_event(json!({ "event": "recovery_attempt_state_transition", "attempt_id": attempt_id, "turn_id": record["turn_id"], "input_event_id": record["input_event_id"], "previous_state": previous, "recovery_attempt_state": next, "attempt_number": record["attempt_number"], "reason": record["reason"], "error": record["error"] }))?;
        self.recovery_attempts
            .insert(attempt_id.to_string(), record.clone());
        Ok(record)
    }

    pub fn enqueue(&mut self, mut input: Value) -> Result<Vec<Value>, CoreError> {
        if self.lifecycle != "ready" {
            return Err(CoreError(format!(
                "nars_session_not_accepting_input:{}",
                self.lifecycle
            )));
        }
        input = normalize_input_value(&input)?;
        let event_id = string_field(&input, "event_id")
            .unwrap_or_else(|| format!("input_{}", Uuid::new_v4().simple()));
        input["event_id"] = json!(event_id);
        let content = string_field(&input, "content")
            .filter(|value| !value.trim().is_empty())
            .ok_or_else(|| CoreError("content_required".to_string()))?;
        input["content"] = json!(content);
        let idempotency_key = string_field(&input, "idempotency_key");
        if let Some(key) = idempotency_key.as_deref() {
            if let Some(original) = self.idempotency.get(key) {
                return Ok(vec![self.append_event(json!({ "event": "input_event_deduplicated", "input_event_id": event_id, "event_id": event_id, "request_id": input.get("request_id"), "original_event_id": original.get("event_id"), "original_request_id": original.get("request_id"), "idempotency_key": key, "terminal_state": original.get("terminal_state").cloned().unwrap_or(Value::Null), "deduplication_state": "reused_existing_operation", "admission_state": "accepted" }))?]);
            }
        }
        let request_id = string_field(&input, "request_id");
        let source_kind =
            string_field(&input, "source_kind").unwrap_or_else(|| "operator".to_string());
        input["source_kind"] = json!(source_kind);
        input["admission_state"] = json!("queued");
        input["schema"] = json!("narada.carrier.input_event.v1");
        let mut events = Vec::new();
        self.admission
            .insert(event_id.clone(), "accepted".to_string());
        events.push(self.append_event(json!({ "event": "input_admission_state_transition", "input_event_id": event_id, "request_id": request_id, "previous_state": null, "input_admission_state": "accepted", "admission_state_schema": INPUT_ADMISSION_SCHEMA, "reason": "input_received" }))?);
        self.ensure_turn(&input)?;
        if source_kind == "operator" {
            events.push(self.append_event(json!({ "event": "user_message", "type": "user_message", "input_id": event_id, "input_event_id": event_id, "request_id": request_id, "content": content, "source_kind": source_kind, "transport": input.get("transport"), "delivery_mode": input.get("delivery_mode") }))?);
        }
        self.admission
            .insert(event_id.clone(), "queued".to_string());
        events.push(self.append_event(json!({ "event": "input_event_queued", "event_id": event_id, "input_event_id": event_id, "request_id": request_id, "content": content, "source": input.get("source"), "source_kind": source_kind, "source_id": input.get("source_id"), "transport": input.get("transport"), "delivery_mode": input.get("delivery_mode"), "authority_ref": input.get("authority_ref"), "directive_id": input.get("directive_id"), "admission_state_schema": INPUT_ADMISSION_SCHEMA, "admission_previous_state": "accepted", "admission_state": "queued", "turn_state": "accepted", "idempotency_key": idempotency_key }))?);
        input["admission_state"] = json!("queued");
        self.pending.push(input);
        if let Some(key) = idempotency_key {
            self.idempotency
                .insert(key, json!({ "event_id": event_id }));
        }
        self.persist_queue("queued")?;
        Ok(events)
    }

    /// Compatibility fixture for callers that only have a named deterministic
    /// provider mode. Production adapters should use
    /// [`SessionCore::drain_once_with_adapter`].
    pub fn drain_once(&mut self, provider_mode: &str) -> Result<Vec<Value>, CoreError> {
        let mut adapter = ModeProvider {
            mode: provider_mode.to_string(),
        };
        self.drain_once_with_adapter(&mut adapter)
    }

    pub fn drain_once_with_adapter(
        &mut self,
        adapter: &mut dyn NarsProviderAdapter,
    ) -> Result<Vec<Value>, CoreError> {
        let cancellation = CancellationToken::new();
        let mut event_sink = |_event: Value| -> Result<(), CoreError> { Ok(()) };
        self.drain_once_with_adapter_and_context(
            adapter,
            false,
            None,
            cancellation,
            &mut event_sink,
        )
    }

    /// Drain one queue item under the Rust-owned supervisor context.  The
    /// provider remains an adapter, but lifecycle, admission, journal, turn
    /// transitions, and terminalization remain owned here.
    pub fn drain_once_with_adapter_and_context(
        &mut self,
        adapter: &mut dyn NarsProviderAdapter,
        recovery_replay: bool,
        recovery_attempt_id: Option<&str>,
        cancellation: CancellationToken,
        event_sink: &mut dyn FnMut(Value) -> Result<(), CoreError>,
    ) -> Result<Vec<Value>, CoreError> {
        let Some(input) = self.pending.first().cloned() else {
            return Ok(Vec::new());
        };
        let event_id = string_field(&input, "event_id").unwrap_or_default();
        let current_admission = self
            .admission
            .get(&event_id)
            .cloned()
            .or_else(|| string_field(&input, "admission_state"))
            .unwrap_or_else(|| "queued".to_string());
        let mut events = Vec::new();
        if matches!(current_admission.as_str(), "dropped" | "abandoned") {
            self.pending.remove(0);
            self.persist_queue("terminal_input_removed")?;
            return Ok(Vec::new());
        }
        if current_admission == "accepted" {
            self.admission
                .insert(event_id.clone(), "queued".to_string());
            if let Some(item) = self.pending.first_mut() {
                item["admission_state"] = json!("queued");
            }
            events.push(self.append_event(json!({
                "event": "input_admission_state_transition",
                "input_event_id": event_id,
                "previous_state": "accepted",
                "input_admission_state": "queued",
                "admission_state_schema": INPUT_ADMISSION_SCHEMA,
                "reason": "recovery_queue_resume",
            }))?);
            self.persist_queue("queued")?;
        } else if current_admission == "admitted" {
            self.admission
                .insert(event_id.clone(), "queued".to_string());
            if let Some(item) = self.pending.first_mut() {
                item["admission_state"] = json!("queued");
            }
            events.push(self.append_event(json!({
                "event": "input_admission_state_transition",
                "input_event_id": event_id,
                "previous_state": "admitted",
                "input_admission_state": "queued",
                "admission_state_schema": INPUT_ADMISSION_SCHEMA,
                "reason": "recovery_requeue_after_admission",
                "recovery": true,
            }))?);
            self.persist_queue("recovery_requeued")?;
        }
        if input
            .get("hold_condition")
            .and_then(Value::as_str)
            .is_some_and(|value| !value.trim().is_empty())
        {
            if self.admission.get(&event_id).map(String::as_str) != Some("held") {
                self.admission.insert(event_id.clone(), "held".to_string());
                if let Some(item) = self.pending.first_mut() {
                    item["admission_state"] = json!("held");
                }
                let event = self.append_event(json!({
                    "event": "input_admission_state_transition",
                    "input_event_id": event_id,
                    "previous_state": "queued",
                    "input_admission_state": "held",
                    "admission_state_schema": INPUT_ADMISSION_SCHEMA,
                    "reason": "input_hold",
                }))?;
                self.persist_queue("held")?;
                events.push(event);
                return Ok(events);
            }
            return Ok(events);
        }
        let previous_admission = self
            .admission
            .get(&event_id)
            .cloned()
            .unwrap_or_else(|| "queued".to_string());
        self.admission
            .insert(event_id.clone(), "admitted".to_string());
        if let Some(item) = self.pending.first_mut() {
            item["admission_state"] = json!("admitted");
        }
        events.push(self.append_event(json!({ "event": "input_admission_state_transition", "input_event_id": event_id, "request_id": input.get("request_id"), "previous_state": previous_admission, "input_admission_state": "admitted", "admission_state_schema": INPUT_ADMISSION_SCHEMA, "reason": "input_admitted_to_turn" }))?);
        events.push(self.append_event(json!({ "event": "input_event_started", "input_event_id": event_id, "event_id": event_id, "request_id": input.get("request_id"), "source": input.get("source"), "source_kind": input.get("source_kind"), "transport": input.get("transport"), "authority_ref": input.get("authority_ref"), "directive_id": input.get("directive_id"), "idempotency_key": input.get("idempotency_key"), "admission_state_schema": INPUT_ADMISSION_SCHEMA, "admission_previous_state": previous_admission, "admission_state": "admitted" }))?);
        self.ensure_turn(&input)?;
        let current_turn_state = self
            .turns
            .get(&event_id)
            .and_then(|turn| turn.get("turn_state"))
            .and_then(Value::as_str)
            .unwrap_or_default()
            .to_string();
        if is_terminal_turn(&current_turn_state) {
            let terminal = self
                .turns
                .get(&event_id)
                .and_then(|turn| turn.get("terminal_state"))
                .cloned()
                .unwrap_or_else(|| json!(current_turn_state));
            events.push(self.append_event(json!({
                "event": "input_event_completed",
                "input_event_id": event_id,
                "event_id": event_id,
                "request_id": input.get("request_id"),
                "admission_state_schema": INPUT_ADMISSION_SCHEMA,
                "admission_state": "admitted",
                "terminal_state": terminal,
                "replay_skipped": true,
            }))?);
            self.pending.remove(0);
            self.persist_queue("completed")?;
            return Ok(events);
        }
        self.transition_turn(
            &event_id,
            "contextualized",
            json!({ "observed_event": "input_event_started" }),
        )?;
        self.transition_turn(
            &event_id,
            "evaluating",
            json!({ "observed_event": "input_event_started" }),
        )?;
        let provider_start_sequence = self.journal.next_sequence();
        let context = ProviderTurnContext {
            input: &input,
            turn_id: &event_id,
            input_event_id: &event_id,
            recovery_replay,
            recovery_attempt_id,
            cancellation: cancellation.clone(),
        };
        let cancellation_requested = cancellation.is_cancelled();
        let outcome = if cancellation.is_cancelled() {
            ProviderOutcome::Interrupted("provider_request_cancelled".to_string())
        } else {
            let mut sink = |event: Value| -> Result<(), CoreError> {
                let published = self.append_event(event)?;
                self.observe_turn_event(&published)?;
                event_sink(published)
            };
            match adapter.run_turn_with_context(context, &mut sink) {
                Ok(outcome) => outcome,
                Err(error) => ProviderOutcome::Error(error.0),
            }
        };
        events.extend(self.events_after(provider_start_sequence));
        let adapter_error = matches!(&outcome, ProviderOutcome::Error(_));
        let current_after_events = self
            .turns
            .get(&event_id)
            .and_then(|turn| turn.get("turn_state"))
            .and_then(Value::as_str)
            .unwrap_or_default()
            .to_string();
        let event_interrupted = current_after_events == "interrupted";
        let terminal = if is_terminal_turn(&current_after_events) {
            current_after_events
        } else {
            match outcome {
                ProviderOutcome::Completed(response_content) => {
                    if current_after_events != "reconciling" {
                        events.push(self.append_event(json!({ "event": "assistant_message", "turn_id": event_id, "input_event_id": event_id, "content": response_content }))?);
                        self.transition_turn(
                            &event_id,
                            "reconciling",
                            json!({ "observed_event": "assistant_message" }),
                        )?;
                    }
                    self.transition_turn(
                        &event_id,
                        "completed",
                        json!({ "terminal_status": "completed" }),
                    )?;
                    "completed".to_string()
                }
                ProviderOutcome::Refused(reason) => {
                    self.transition_turn(
                        &event_id,
                        "refused",
                        json!({ "reason": reason, "terminal_status": "refused" }),
                    )?;
                    "refused".to_string()
                }
                ProviderOutcome::Failed(error) => {
                    self.transition_turn(
                        &event_id,
                        "failed",
                        json!({ "error": error, "terminal_status": "failed" }),
                    )?;
                    "failed".to_string()
                }
                ProviderOutcome::Interrupted(reason) => {
                    self.transition_turn(
                        &event_id,
                        "interrupted",
                        json!({ "reason": reason, "terminal_status": "interrupted" }),
                    )?;
                    "interrupted".to_string()
                }
                ProviderOutcome::Error(error) => {
                    let interrupted = error.to_ascii_lowercase().contains("abort")
                        || error.to_ascii_lowercase().contains("cancel")
                        || error.to_ascii_lowercase().contains("interrupt");
                    if interrupted {
                        self.transition_turn(
                            &event_id,
                            "interrupted",
                            json!({ "error": error, "terminal_status": "interrupted" }),
                        )?;
                        "interrupted".to_string()
                    } else {
                        self.transition_turn(
                            &event_id,
                            "failed",
                            json!({ "error": error, "terminal_status": "failed" }),
                        )?;
                        "failed".to_string()
                    }
                }
                ProviderOutcome::Blocked(reason) => {
                    events.push(self.append_event(json!({ "event": "turn_blocked", "turn_id": event_id, "reason": reason, "terminal_state": "blocked" }))?);
                    self.transition_turn(
                        &event_id,
                        "blocked",
                        json!({ "reason": reason, "terminal_status": "blocked" }),
                    )?;
                    "blocked".to_string()
                }
            }
        };
        events.push(self.append_event(json!({ "event": "input_event_completed", "input_event_id": event_id, "event_id": event_id, "request_id": input.get("request_id"), "admission_state_schema": INPUT_ADMISSION_SCHEMA, "admission_state": "admitted", "terminal_state": terminal, "idempotency_key": input.get("idempotency_key") }))?);
        events.push(self.append_event(json!({ "event": "input_completed", "input_event_id": event_id, "request_id": input.get("request_id"), "terminal_state": terminal, "idempotency_key": input.get("idempotency_key"), "admission_state_schema": INPUT_ADMISSION_SCHEMA, "admission_state": "admitted" }))?);
        let recoverable = adapter_error || cancellation_requested || event_interrupted;
        if !recoverable {
            self.pending.remove(0);
        }
        self.admission
            .insert(event_id.clone(), "admitted".to_string());
        if let Some(key) = string_field(&input, "idempotency_key") {
            if let Some(record) = self.idempotency.get_mut(&key) {
                record["terminal_state"] = json!(terminal);
            }
        }
        self.persist_queue(if recoverable {
            "recoverable"
        } else {
            "completed"
        })?;
        Ok(events)
    }

    pub fn submit(&mut self, input: Value, provider_mode: &str) -> Result<Vec<Value>, CoreError> {
        let mut events = self.enqueue(input)?;
        events.extend(self.drain_once(provider_mode)?);
        Ok(events)
    }

    /// Drain admitted inputs in FIFO order until the queue is empty or the
    /// head is held.  The bounded progress check keeps a malformed persisted
    /// queue from becoming an unbounded loop while preserving FIFO semantics.
    pub fn drain_until_idle(&mut self, provider_mode: &str) -> Result<Vec<Value>, CoreError> {
        let mut adapter = ModeProvider {
            mode: provider_mode.to_string(),
        };
        self.drain_until_idle_with_adapter(&mut adapter)
    }

    pub fn drain_until_idle_with_adapter(
        &mut self,
        adapter: &mut dyn NarsProviderAdapter,
    ) -> Result<Vec<Value>, CoreError> {
        let mut events = Vec::new();
        let mut remaining_progress = self.pending.len().saturating_add(1);
        while !self.pending.is_empty() && remaining_progress > 0 {
            let before = self.pending.len();
            let drained = self.drain_once_with_adapter(adapter)?;
            let progressed = self.pending.len() < before;
            events.extend(drained);
            if !progressed {
                break;
            }
            remaining_progress = remaining_progress.saturating_sub(1);
        }
        Ok(events)
    }

    pub fn release_held_input(&mut self, event_id: &str) -> Result<bool, CoreError> {
        let Some(item) = self.pending.iter_mut().find(|item| {
            string_field(item, "event_id").as_deref() == Some(event_id)
                && string_field(item, "admission_state").as_deref() == Some("held")
        }) else {
            return Ok(false);
        };
        item["hold_condition"] = Value::Null;
        item["admission_state"] = json!("queued");
        self.admission
            .insert(event_id.to_string(), "queued".to_string());
        self.append_event(json!({
            "event": "input_admission_state_transition",
            "input_event_id": event_id,
            "previous_state": "held",
            "input_admission_state": "queued",
            "admission_state_schema": INPUT_ADMISSION_SCHEMA,
            "reason": "hold_released",
        }))?;
        self.persist_queue("hold_released")?;
        Ok(true)
    }

    pub fn drop_operator_input(&mut self, index: usize) -> Result<Option<Value>, CoreError> {
        self.drop_queued_input(index, false)
    }

    pub fn drop_operator_steering(&mut self, index: usize) -> Result<Option<Value>, CoreError> {
        self.drop_queued_input(index, true)
    }

    pub fn clear_operator_input(&mut self) -> Result<Vec<Value>, CoreError> {
        self.clear_queued_inputs(false)
    }

    pub fn clear_operator_steering(&mut self) -> Result<Vec<Value>, CoreError> {
        self.clear_queued_inputs(true)
    }

    pub fn finalize_queue(&mut self) -> Result<Vec<Value>, CoreError> {
        let start = if self.turn_is_running() { 1 } else { 0 };
        let abandoned: Vec<Value> = self.pending.drain(start..).collect();
        for item in &abandoned {
            let id =
                string_field(item, "event_id").or_else(|| string_field(item, "input_event_id"));
            if let Some(id) = id.as_deref() {
                self.admission
                    .insert(id.to_string(), "abandoned".to_string());
            }
            self.append_event(json!({
                "event": "input_abandoned_on_session_end",
                "input_event_id": id,
                "event_id": id,
                "admission_state_schema": INPUT_ADMISSION_SCHEMA,
                "admission_state": "abandoned",
                "reason": "session_finalize",
            }))?;
        }
        self.persist_queue("session_finalize")?;
        Ok(abandoned)
    }

    fn clear_queued_inputs(&mut self, steering_only: bool) -> Result<Vec<Value>, CoreError> {
        let mut kept = Vec::new();
        let mut dropped = Vec::new();
        let running = self.turn_is_running();
        for (index, item) in self.pending.drain(..).enumerate() {
            let is_steering = string_field(&item, "source").as_deref() == Some("operator_steering");
            let is_operator = string_field(&item, "source_kind").as_deref() == Some("operator")
                || matches!(
                    string_field(&item, "source").as_deref(),
                    Some(
                        "manual_operator"
                            | "programmatic_operator"
                            | "operator_directive"
                            | "operator_steering"
                    )
                );
            let should_drop = (if steering_only {
                is_steering
            } else {
                is_operator
            }) && !(running && index == 0);
            if should_drop {
                dropped.push(item);
            } else {
                kept.push(item);
            }
        }
        self.pending = kept;
        for item in &dropped {
            self.record_dropped_input(item, "queue_clear")?;
        }
        if !dropped.is_empty() {
            self.persist_queue("queue_clear")?;
        }
        Ok(dropped)
    }

    fn drop_queued_input(
        &mut self,
        index: usize,
        steering_only: bool,
    ) -> Result<Option<Value>, CoreError> {
        let target_index = self
            .pending
            .iter()
            .enumerate()
            .filter(|(_, item)| {
                let source = string_field(item, "source");
                if steering_only {
                    source.as_deref() == Some("operator_steering")
                } else {
                    string_field(item, "source_kind").as_deref() == Some("operator")
                        || matches!(
                            source.as_deref(),
                            Some(
                                "manual_operator"
                                    | "programmatic_operator"
                                    | "operator_directive"
                                    | "operator_steering"
                            )
                        )
                }
            })
            .nth(index - 1)
            .map(|(position, _)| position);
        let Some(position) = target_index else {
            return Ok(None);
        };
        if self.turn_is_running() && position == 0 {
            return Ok(None);
        }
        let item = self.pending.remove(position);
        self.record_dropped_input(&item, "queue_drop")?;
        self.persist_queue("queue_drop")?;
        Ok(Some(item))
    }

    fn record_dropped_input(&mut self, item: &Value, reason: &str) -> Result<(), CoreError> {
        let id = string_field(item, "event_id").or_else(|| string_field(item, "input_event_id"));
        if let Some(id) = id.as_deref() {
            self.admission.insert(id.to_string(), "dropped".to_string());
        }
        self.append_event(json!({
            "event": "input_dropped_by_operator",
            "input_event_id": id,
            "idempotency_key": item.get("idempotency_key"),
            "drop_reason": reason,
            "admission_state_schema": INPUT_ADMISSION_SCHEMA,
            "admission_previous_state": item.get("admission_state"),
            "admission_state": "dropped",
        }))?;
        Ok(())
    }

    /// Prepare a persisted turn for replay.  This mirrors the TypeScript
    /// `prepareTurn` contract and is intentionally separate from provider
    /// execution: the native core decides whether replay is required, while a
    /// provider adapter supplies the terminal observation.
    pub fn prepare_turn(&mut self, turn_id: &str, evidence: Value) -> Result<Value, CoreError> {
        let current = self
            .turns
            .get(turn_id)
            .cloned()
            .ok_or_else(|| CoreError(format!("nars_turn_not_found:{turn_id}")))?;
        let state = current
            .get("turn_state")
            .and_then(Value::as_str)
            .unwrap_or_default();
        if state == "completed" {
            return Ok(json!({ "action": "already_completed", "turn": current }));
        }
        if matches!(state, "blocked" | "refused") {
            return Ok(json!({ "action": "terminal", "turn": current }));
        }
        if is_terminal_turn(state) {
            let mut retry = evidence.clone();
            retry["retry"] = json!(true);
            retry["reason"] = retry
                .get("reason")
                .cloned()
                .unwrap_or_else(|| json!("runtime_recovery_replay"));
            self.transition_turn(turn_id, "accepted", retry)?;
            return Ok(json!({ "action": "execute", "turn": self.turns.get(turn_id) }));
        }
        if state != "accepted" {
            let mut interrupted = evidence.clone();
            interrupted["reason"] = interrupted
                .get("reason")
                .cloned()
                .unwrap_or_else(|| json!("runtime_recovery_replay"));
            self.transition_turn(turn_id, "interrupted", interrupted)?;
            let mut retry = evidence;
            retry["retry"] = json!(true);
            retry["reason"] = retry
                .get("reason")
                .cloned()
                .unwrap_or_else(|| json!("runtime_recovery_replay"));
            self.transition_turn(turn_id, "accepted", retry)?;
        }
        Ok(json!({ "action": "execute", "turn": self.turns.get(turn_id) }))
    }

    pub fn recovery_attempt(&self, attempt_id: &str) -> Option<Value> {
        self.recovery_attempts.get(attempt_id).cloned()
    }
    pub fn recovery_attempts(&self) -> Vec<Value> {
        self.recovery_attempts.values().cloned().collect()
    }

    pub fn register_artifact(&mut self, options: Value) -> Result<Value, CoreError> {
        let result = artifacts::register(
            self.config.session_path.as_deref(),
            Some(&self.config.session_id),
            Some(&self.config.agent_id),
            self.config.site_root.as_deref(),
            Path::new(
                options
                    .get("source_path")
                    .and_then(Value::as_str)
                    .unwrap_or_default(),
            ),
            options.get("kind").and_then(Value::as_str),
            options.get("title").and_then(Value::as_str),
            options.get("content_type").and_then(Value::as_str),
            options.get("render_hint").and_then(Value::as_str),
            options.get("access_scope").and_then(Value::as_str),
        )?;
        let record = result.get("record").cloned().unwrap_or(Value::Null);
        self.append_event(json!({ "event": "session_artifact_registered", "artifact_id": record.get("artifact_id"), "kind": record.get("kind"), "artifact": result.get("public_record") }))?;
        Ok(result)
    }

    pub fn artifact_index(&self) -> Result<Value, CoreError> {
        artifacts::read_index(self.config.session_path.as_deref())
    }
    pub fn transition_artifact(
        &mut self,
        artifact_id: &str,
        next_state: &str,
        evidence: Value,
    ) -> Result<Value, CoreError> {
        if self.lifecycle == "closed" {
            return Err(CoreError("nars_session_closed".into()));
        }
        let result = artifacts::transition(
            self.config.session_path.as_deref(),
            artifact_id,
            next_state,
            &evidence,
        )?;
        if result
            .get("changed")
            .and_then(Value::as_bool)
            .unwrap_or(false)
        {
            let record = result.get("record").cloned().unwrap_or(Value::Null);
            let previous = result
                .get("previous_record")
                .cloned()
                .unwrap_or(Value::Null);
            self.append_event(json!({ "event": "session_artifact_lifecycle_transition", "artifact_id": artifact_id, "kind": record.get("kind"), "previous_state": previous.get("lifecycle").and_then(|v| v.get("state")), "artifact_state": record.get("lifecycle").and_then(|v| v.get("state")), "reason": record.get("lifecycle").and_then(|v| v.get("reason")), "artifact": result.get("public_record") }))?;
        }
        Ok(result)
    }

    pub fn revoke_artifact(
        &mut self,
        artifact_id: &str,
        evidence: Value,
    ) -> Result<Value, CoreError> {
        self.transition_artifact(artifact_id, "revoked", evidence)
    }

    pub fn expire_artifact(
        &mut self,
        artifact_id: &str,
        evidence: Value,
    ) -> Result<Value, CoreError> {
        self.transition_artifact(artifact_id, "expired", evidence)
    }

    pub fn archive_artifact(
        &mut self,
        artifact_id: &str,
        evidence: Value,
    ) -> Result<Value, CoreError> {
        self.transition_artifact(artifact_id, "archived", evidence)
    }
    pub fn read_artifact_content(&self, artifact_id: &str) -> Result<Value, CoreError> {
        artifacts::read_content(
            self.config.session_path.as_deref(),
            artifact_id,
            self.config.site_root.as_deref(),
        )
    }

    pub fn surface_attachments(&self) -> Result<Vec<Value>, CoreError> {
        surface_attachment::list(self.config.session_path.as_deref(), &self.config.session_id)
    }
    pub fn surface_attachment_summary(&self) -> Result<Value, CoreError> {
        Ok(surface_attachment::summary(&self.surface_attachments()?))
    }
    pub fn register_surface_attachment(&mut self, options: Value) -> Result<Value, CoreError> {
        if self.lifecycle == "closed" {
            return Err(CoreError("nars_session_closed".into()));
        }
        let attachment = surface_attachment::register(
            self.config.session_path.as_deref(),
            &self.config.session_id,
            &options,
        )?;
        self.append_event(json!({ "event": "session_surface_attachment_state_transition", "attachment_id": attachment.get("attachment_id"), "previous_attachment_state": Value::Null, "attachment_state": attachment.get("attachment_state"), "surface_attachment": attachment, "reason": "surface_attachment_requested" }))?;
        Ok(attachment)
    }
    pub fn transition_surface_attachment(
        &mut self,
        attachment_id: &str,
        next_state: &str,
        evidence: Value,
    ) -> Result<Value, CoreError> {
        if self.lifecycle == "closed" {
            return Err(CoreError("nars_session_closed".into()));
        }
        let result = surface_attachment::transition_in_registry(
            self.config.session_path.as_deref(),
            &self.config.session_id,
            attachment_id,
            next_state,
            &evidence,
        )?;
        if result
            .get("changed")
            .and_then(Value::as_bool)
            .unwrap_or(false)
        {
            let record = result.get("record").cloned().unwrap_or(Value::Null);
            let previous = result
                .get("previous_record")
                .cloned()
                .unwrap_or(Value::Null);
            self.append_event(json!({ "event": "session_surface_attachment_state_transition", "attachment_id": attachment_id, "previous_attachment_state": previous.get("attachment_state"), "attachment_state": record.get("attachment_state"), "surface_attachment": record, "reason": evidence.get("reason") }))?;
        }
        Ok(result)
    }
    pub fn detach_surface_attachment(
        &mut self,
        attachment_id: &str,
        evidence: Value,
    ) -> Result<Value, CoreError> {
        let result =
            self.transition_surface_attachment(attachment_id, "detaching", evidence.clone())?;
        if result
            .get("changed")
            .and_then(Value::as_bool)
            .unwrap_or(false)
            && result
                .get("record")
                .and_then(|v| v.get("attachment_state"))
                .and_then(Value::as_str)
                == Some("detaching")
        {
            return self.transition_surface_attachment(attachment_id, "detached", evidence);
        }
        Ok(result)
    }

    pub fn cancel(&mut self) -> Result<Vec<Value>, CoreError> {
        self.cancel_with_evidence(Value::Null)
    }

    pub fn cancel_with_evidence(&mut self, evidence: Value) -> Result<Vec<Value>, CoreError> {
        let mut events = Vec::new();
        let cancelled = self.active_turn_id.clone();
        let mut requested = json!({
            "event": "session_turn_cancel_requested",
            "turn_id": cancelled,
        });
        merge_object(&mut requested, evidence.clone());
        events.push(self.append_event(requested)?);
        if let Some(turn_id) = cancelled.as_deref() {
            let mut transition = json!({
                "reason": "session_cancel",
                "terminal_status": "interrupted",
            });
            merge_object(&mut transition, evidence.clone());
            self.transition_turn(turn_id, "interrupted", transition)?;
            let mut interrupt = json!({ "event": "interrupt_requested", "turn_id": turn_id });
            merge_object(&mut interrupt, evidence.clone());
            events.push(self.append_event(interrupt)?);
        }
        let mut completed = json!({
            "event": "session_cancel",
            "cancelled": cancelled.is_some(),
        });
        merge_object(&mut completed, evidence);
        events.push(self.append_event(completed)?);
        Ok(events)
    }

    pub fn close(&mut self, reason: &str) -> Result<Vec<Value>, CoreError> {
        self.close_with_evidence(reason, Value::Null)
    }

    pub fn close_with_evidence(
        &mut self,
        reason: &str,
        evidence: Value,
    ) -> Result<Vec<Value>, CoreError> {
        if self.lifecycle == "closed" {
            return Ok(vec![
                json!({ "event": "session_closed", "terminal_state": "closed" }),
            ]);
        }
        let mut closing = json!({ "reason": reason });
        merge_object(&mut closing, evidence.clone());
        let mut events = self.transition_lifecycle("closing", closing)?;
        // A native runtime has no implicit asynchronous supervisor around the
        // core.  If a turn is active, record the same cancellation barrier the
        // TypeScript supervisor would establish before finalizing the queue.
        let had_active_turn = self.turn_is_running();
        if had_active_turn {
            events.extend(self.cancel_with_evidence(evidence.clone())?);
        }
        if self.shutdown_state == "idle" {
            let next = if had_active_turn {
                "cancelling"
            } else {
                "draining"
            };
            events.push(self.transition_shutdown(next, evidence.clone())?);
        }
        if self.shutdown_state == "cancelling" {
            events.push(self.transition_shutdown("draining", evidence.clone())?);
        }
        if self.shutdown_state == "draining" {
            events.push(self.transition_shutdown("finalizing_queue", evidence.clone())?);
        }
        if self.shutdown_state == "finalizing_queue" {
            self.finalize_queue()?;
            events.push(self.transition_shutdown("closing_tools", evidence.clone())?);
        }
        if self.shutdown_state == "closing_tools" {
            events.push(self.transition_shutdown("closed", Value::Null)?);
        }
        let mut closed = json!({ "reason": reason });
        merge_object(&mut closed, evidence);
        events.extend(self.transition_lifecycle("closed", closed)?);
        Ok(events)
    }

    fn transition_shutdown(&mut self, next: &str, evidence: Value) -> Result<Value, CoreError> {
        if self.shutdown_state == next {
            return Ok(json!({
                "schema": SHUTDOWN_SCHEMA,
                "event": "session_shutdown_state_transition",
                "previous_state": next,
                "shutdown_state": next,
            }));
        }
        if !can_transition_shutdown(&self.shutdown_state, next) {
            return Err(CoreError(format!(
                "invalid_nars_session_shutdown_transition:{}:{next}",
                self.shutdown_state
            )));
        }
        let previous = self.shutdown_state.clone();
        self.shutdown_state = next.to_string();
        let mut event = json!({
            "schema": SHUTDOWN_SCHEMA,
            "event": "session_shutdown_state_transition",
            "previous_state": previous,
            "shutdown_state": next,
        });
        merge_object(&mut event, evidence);
        self.append_event(event.clone())?;
        Ok(event)
    }

    pub fn health(&self, mcp_operational_state: &str) -> Value {
        let active = self
            .active_turn_id
            .as_deref()
            .and_then(|id| self.turns.get(id));
        let last = self.turns.values().next_back();
        let attachments = self.surface_attachments().unwrap_or_default();
        let (request_outcome_total, request_posture) =
            summarize_request_posture(&self.request_outcome_counts);
        let operational_posture =
            operational_posture(&self.lifecycle, mcp_operational_state, &request_posture);
        let operational_posture_display = if operational_posture == "healthy" {
            "healthy".to_string()
        } else {
            format!(
                "{operational_posture} [mcp={mcp_operational_state}; request={request_posture}; lifecycle={}]",
                if self.lifecycle == "closed" { "closed" } else { "none" }
            )
        };
        json!({
            "event": "session_health",
            "schema": HEALTH_SCHEMA,
            "session_id": self.config.session_id,
            "lifecycle_state": self.lifecycle,
            "mcp_operational_state": mcp_operational_state,
            "active_turn_id": self.active_turn_id,
            "active_turn_state": active.and_then(|turn| turn.get("turn_state")),
            "last_turn_id": last.and_then(|turn| turn.get("turn_id")),
            "last_turn_state": last.and_then(|turn| turn.get("turn_state")),
            "session_event_count": self.journal.event_count(),
            "last_event_kind": self.last_event_kind,
            "last_event_at": self.last_event_at,
            "last_terminal_state": self.last_terminal_state,
            "request_outcome_total": request_outcome_total,
            "request_posture": request_posture,
            "request_posture_display": format!("{request_posture} ({request_outcome_total})"),
            "request_outcome_summary": summarize_count_map(&self.request_outcome_counts),
            "request_issue_summary": summarize_count_map(&self.request_issue_counts),
            "operational_posture": operational_posture,
            "operational_posture_display": operational_posture_display,
            "recommended_action": if request_posture == "invalid_control_traffic" { "review_invalid_control_traffic" } else if self.lifecycle == "closed" { "session_closed" } else { "review_session_summary" },
            "recommended_action_display": if request_posture == "invalid_control_traffic" { "review invalid control traffic" } else if self.lifecycle == "closed" { "session closed" } else { "review session summary" },
            "operator_input_queue": self.queue_snapshot(),
            "surface_attachment_summary": surface_attachment::summary(&attachments),
            "request_outcome_counts": self.request_outcome_counts,
            "request_issue_counts": self.request_issue_counts,
            "cursor": self.cursor(),
            "authority_runtime_transition": self.authority_runtime_state(),
            "shutdown_state": { "schema": SHUTDOWN_SCHEMA, "state": self.shutdown_state },
        })
    }

    pub fn recovery(&self) -> Value {
        json!({
            "event": "session_recovery",
            "schema": RECOVERY_SCHEMA,
            "session_id": self.config.session_id,
            "lifecycle_state": self.lifecycle,
            "events_path": self.journal.path().to_string_lossy(),
            "event_count": self.journal.event_count(),
            "corrupt_event_line_count": self.journal.corrupt_line_count(),
            "operator_input_queue": self.queue_snapshot(),
            "artifacts": self.artifact_index().unwrap_or_else(|_| json!({ "schema": artifacts::ARTIFACT_INDEX_SCHEMA, "session_id": self.config.session_id, "agent_id": self.config.agent_id, "generated_at": now_iso(), "artifacts": [] })),
            "active_turn": self.active_turn_id.as_deref().and_then(|id| self.turns.get(id)),
            "turns": self.turns(),
            "recovery_attempts": self.recovery_attempts.values().cloned().collect::<Vec<_>>(),
            "surface_attachments": surface_attachment::read_registry(self.config.session_path.as_deref(), &self.config.session_id).unwrap_or_else(|_| json!({ "schema": surface_attachment::REGISTRY_SCHEMA, "session_id": self.config.session_id, "generated_at": now_iso(), "attachments": [] })),
            "authority_runtime_transition": self.authority_runtime_state(),
            "shutdown_state": { "schema": SHUTDOWN_SCHEMA, "state": self.shutdown_state },
            "recovery_mode": "native_rust_session_core",
        })
    }

    pub fn events_page(
        &self,
        limit: usize,
        before_sequence: Option<u64>,
        direction: &str,
    ) -> Vec<Value> {
        self.journal.read_page(limit, before_sequence, direction)
    }

    /// Read a durable event-log page using the same cursor, projection, and
    /// filter contract as the TypeScript session-core implementation.  The
    /// native runtime calls this method directly; no Node/Bun event-log
    /// reader is involved in the request path.
    pub fn events_page_contract(&self, options: &Value) -> Result<Value, CoreError> {
        let params = options.as_object();
        let filters = params
            .and_then(|object| object.get("filters"))
            .and_then(Value::as_object);
        let requested_view = params
            .and_then(|object| object.get("view"))
            .or_else(|| filters.and_then(|object| object.get("view")))
            .and_then(value_as_string)
            .unwrap_or_else(|| "raw".to_string());
        let view = normalize_event_view(&requested_view).ok_or_else(|| {
            CoreError(format!("invalid_nars_session_event_view:{requested_view}"))
        })?;

        let after_value = params
            .and_then(|object| object.get("after_sequence"))
            .filter(|value| !value.is_null())
            .or_else(|| params.and_then(|object| object.get("since_sequence")));
        let before_value = params.and_then(|object| object.get("before_sequence"));
        let after = optional_integer_value(after_value);
        let before = optional_integer_value(before_value);
        let since_timestamp = params
            .and_then(|object| object.get("since_timestamp"))
            .and_then(Value::as_str)
            .map(str::to_string);
        let effective_since_timestamp = if after.is_some() {
            None
        } else {
            since_timestamp.clone()
        };
        let requested_direction = params
            .and_then(|object| object.get("direction"))
            .and_then(Value::as_str)
            .map(|value| value.eq_ignore_ascii_case("backward"))
            .unwrap_or(before.is_none() == false);
        let direction = if requested_direction {
            "backward"
        } else {
            "forward"
        };
        let limit = bounded_event_limit(params.and_then(|object| object.get("limit")), 100, 1000);

        let all_events = self.journal.read_events();
        let mut merged_filters = filters.cloned().unwrap_or_default();
        merged_filters.insert("view".to_string(), json!(view));
        let filtered = all_events
            .iter()
            .filter(|event| {
                event_in_page_window(event, after, before, effective_since_timestamp.as_deref())
                    && event_matches_filters(event, &merged_filters)
            })
            .cloned()
            .collect::<Vec<_>>();
        let has_more = filtered.len() > limit;
        let events = if requested_direction {
            let start = filtered.len().saturating_sub(limit);
            filtered[start..].to_vec()
        } else {
            filtered[..filtered.len().min(limit)].to_vec()
        };
        let first = events.first();
        let last = events.last();
        let first_sequence = first.and_then(event_sequence_value);
        let last_page_sequence = last.and_then(event_sequence_value);
        let last_sequence = all_events.last().and_then(event_sequence_value);
        let next_sequence = last_sequence
            .as_ref()
            .and_then(sequence_number)
            .map(|sequence| sequence.saturating_add(1))
            .unwrap_or(1);
        let cursor_before = first_sequence
            .clone()
            .or_else(|| before_value.cloned())
            .unwrap_or(Value::Null);
        let cursor_after = last_page_sequence
            .clone()
            .or_else(|| after_value.cloned())
            .unwrap_or(Value::Null);

        Ok(json!({
            "schema": EVENTS_READ_SCHEMA,
            "status": "ok",
            "source": "events_jsonl",
            "events_path": self.journal.path().to_string_lossy(),
            "direction": direction,
            "view": view,
            "limit": limit,
            "event_count": events.len(),
            "has_more": has_more,
            "first_sequence": first_sequence,
            "last_sequence": last_page_sequence,
            "cursor": {
                "before_sequence": cursor_before,
                "after_sequence": cursor_after,
                "last_sequence": last_sequence,
                "next_sequence": next_sequence,
            },
            "corrupt_line_count": self.journal.corrupt_line_count(),
            "events": events,
        }))
    }
    pub fn events_after(&self, sequence: u64) -> Vec<Value> {
        self.journal
            .read_page(usize::MAX, Some(sequence), "forward")
    }

    pub fn event_hub_cursor(&self) -> Value {
        self.event_hub.cursor()
    }

    pub fn subscribe_events(&mut self, subscription_id: Option<&str>, filters: Value) -> Value {
        self.event_hub.subscribe(subscription_id, filters)
    }

    pub fn begin_event_replay(
        &mut self,
        subscription_id: &str,
        evidence: Value,
    ) -> Result<Value, CoreError> {
        self.event_hub.begin_replay(subscription_id, evidence)
    }

    pub fn mark_event_subscription_live(
        &mut self,
        subscription_id: &str,
        evidence: Value,
    ) -> Result<Value, CoreError> {
        self.event_hub.mark_live(subscription_id, evidence)
    }

    pub fn fail_event_subscription(
        &mut self,
        subscription_id: &str,
        evidence: Value,
    ) -> Result<Value, CoreError> {
        self.event_hub.fail(subscription_id, evidence)
    }

    pub fn unsubscribe_events(
        &mut self,
        subscription_id: &str,
        reason: Option<&str>,
    ) -> Result<Value, CoreError> {
        self.event_hub.unsubscribe(subscription_id, reason)
    }

    pub fn poll_event_subscription(
        &mut self,
        subscription_id: &str,
    ) -> Result<Vec<Value>, CoreError> {
        self.event_hub.poll(subscription_id)
    }

    pub fn poll_event_subscriptions(&mut self) -> Vec<Value> {
        self.event_hub.poll_all()
    }

    pub fn event_subscription(&self, subscription_id: &str) -> Option<Value> {
        self.event_hub.subscription(subscription_id)
    }
    pub fn cursor(&self) -> Value {
        json!({ "last_sequence": self.journal.next_sequence(), "next_sequence": self.journal.next_sequence() + 1 })
    }
    pub fn queue_snapshot(&self) -> Value {
        let pending_system_directive_count = self
            .pending
            .iter()
            .filter(|item| string_field(item, "source").as_deref() == Some("system_directive"))
            .count();
        let pending_operator_directive_count = self
            .pending
            .iter()
            .filter(|item| string_field(item, "source").as_deref() == Some("operator_steering"))
            .count();
        let pending_observer_count = self
            .pending
            .iter()
            .filter(|item| string_field(item, "source").as_deref() == Some("observer"))
            .count();
        json!({
            "schema": QUEUE_SCHEMA,
            "path": self.queue_path.as_ref().map(|path| path.to_string_lossy()),
            "updated_at": Value::Null,
            "revision": self.queue_revision,
            "pending": self.pending,
            "items": self.queue_items(),
            "pending_input_refs": self.queue_items(),
            "pending_count": self.pending.len(),
            "pending_system_directive_count": pending_system_directive_count,
            "pending_operator_directive_count": pending_operator_directive_count,
            "pending_observer_count": pending_observer_count,
            "running": self.turn_is_running(),
            "last_transition": if self.pending.is_empty() { "completed" } else { "queued" },
            "corrupt": self.queue_corrupt
        })
    }
    pub fn request_outcome_counts(&self) -> Value {
        json!(self.request_outcome_counts)
    }
    pub fn request_issue_counts(&self) -> Value {
        json!(self.request_issue_counts)
    }

    pub fn authority_runtime_state(&self) -> Value {
        let source = authority_transition::read_source_state(
            authority_transition::source_state_path(self.config.session_path.as_deref()).as_deref(),
        );
        json!({ "schema": authority_transition::RUNTIME_SCHEMA, "state": self.authority_runtime_state, "history": self.authority_runtime_history, "handoff": self.authority_handoff_state, "source": source })
    }

    pub fn transition_authority_runtime(
        &mut self,
        next_state: &str,
        evidence: Value,
    ) -> Result<Value, CoreError> {
        let transition = authority_transition::transition_runtime(
            Some(&self.authority_runtime_state),
            next_state,
            evidence,
        )?;
        if self.authority_runtime_state == next_state {
            return Ok(transition);
        }
        self.append_event(json!({ "event": "authority_runtime_host_transition", "authority_transition_state": next_state, "authority_transition": transition }))?;
        self.authority_runtime_state = next_state.to_string();
        self.authority_runtime_history.push(transition.clone());
        self.authority_handoff_state = authority_transition::handoff_from_runtime(next_state);
        self.persist_authority_transition()?;
        let _ = session_index::update_authority_transition(
            self.config.session_path.as_deref(),
            Some(next_state),
            Some(self.authority_handoff_state.clone()),
            None,
            Some(transition.clone()),
            self.config.site_root.as_deref(),
        );
        Ok(transition)
    }

    pub fn transition_authority_handoff(
        &mut self,
        next_state: &str,
        evidence: Value,
    ) -> Result<Value, CoreError> {
        let previous = self
            .authority_handoff_state
            .get("state")
            .and_then(Value::as_str)
            .unwrap_or("proposed");
        let transition = authority_transition::transition_handoff(previous, next_state)?;
        if previous != next_state {
            self.append_event(json!({ "event": "authority_handoff_lifecycle_transition", "authority_handoff_lifecycle": transition, "evidence": evidence }))?;
            self.authority_handoff_state = transition.clone();
            self.persist_authority_transition()?;
            let _ = session_index::update_authority_transition(
                self.config.session_path.as_deref(),
                Some(&self.authority_runtime_state),
                Some(transition.clone()),
                None,
                Some(evidence),
                self.config.site_root.as_deref(),
            );
        }
        Ok(transition)
    }

    fn rehydrate(&mut self, events: &[Value]) {
        let mut completed_inputs = BTreeSet::new();
        for event in events {
            self.last_event_kind = event_kind(event);
            self.last_event_at = event
                .get("timestamp")
                .or_else(|| event.get("generated_at"))
                .and_then(Value::as_str)
                .map(str::to_string);
            if event.get("terminal_state").is_some() {
                self.last_terminal_state =
                    event.get("terminal_state").cloned().unwrap_or(Value::Null);
            }
            match string_field(event, "event").as_deref() {
                Some("session_lifecycle_transition") => {
                    if let Some(state) = string_field(event, "lifecycle_state") {
                        self.lifecycle = state;
                    }
                }
                Some("session_closed") => self.lifecycle = "closed".to_string(),
                Some("turn_lifecycle_transition") => {
                    if let (Some(turn_id), Some(state)) = (
                        string_field(event, "turn_id"),
                        string_field(event, "turn_state"),
                    ) {
                        self.rehydrate_turn(&turn_id, &state, event);
                    }
                }
                Some("input_event_queued") => {
                    if let Some(id) = string_field(event, "input_event_id")
                        .or_else(|| string_field(event, "event_id"))
                    {
                        self.admission.insert(id.clone(), "queued".to_string());
                    }
                }
                Some("input_admission_state_transition") => {
                    if let (Some(id), Some(state)) = (
                        string_field(event, "input_event_id"),
                        string_field(event, "input_admission_state"),
                    ) {
                        self.admission.insert(id, state);
                    }
                }
                Some("input_event_started") => {
                    if let Some(id) = string_field(event, "input_event_id") {
                        self.admission.insert(id, "admitted".to_string());
                    }
                }
                Some("input_event_completed") | Some("input_abandoned_on_session_end") => {
                    if let Some(id) = string_field(event, "input_event_id")
                        .or_else(|| string_field(event, "event_id"))
                    {
                        completed_inputs.insert(id);
                    }
                }
                Some("recovery_attempt_state_transition") => {
                    if let Some(id) = string_field(event, "attempt_id") {
                        if let Ok(record) = recovery_attempt::normalize(event) {
                            self.recovery_attempts.insert(id, record);
                        }
                    }
                }
                Some("authority_runtime_host_transition") => {
                    if let Some(state) = string_field(event, "authority_transition_state") {
                        self.authority_runtime_state = state.clone();
                        self.authority_runtime_history.push(event.get("authority_transition").cloned().unwrap_or_else(|| json!({ "schema": authority_transition::RUNTIME_SCHEMA, "previous_state": Value::Null, "state": state, "evidence": {} })));
                        self.authority_handoff_state =
                            authority_transition::handoff_from_runtime(&state);
                    }
                }
                Some("session_shutdown_state_transition") => {
                    if let Some(state) = string_field(event, "shutdown_state") {
                        self.shutdown_state = state;
                    }
                }
                _ => {}
            }
            self.rehydrate_idempotency_event(event);
        }
        self.pending.retain(|item| {
            string_field(item, "event_id")
                .map(|id| !completed_inputs.contains(&id))
                .unwrap_or(true)
        });
        self.active_turn_id = self.turns.iter().rev().find_map(|(id, record)| {
            if record
                .get("turn_state")
                .and_then(Value::as_str)
                .map(is_terminal_turn)
                .unwrap_or(true)
            {
                None
            } else {
                Some(id.clone())
            }
        });
    }

    fn rehydrate_turn(&mut self, turn_id: &str, state: &str, event: &Value) {
        let mut record = self.turns.remove(turn_id).unwrap_or_else(|| json!({ "schema": TURN_SCHEMA, "turn_id": turn_id, "input_event_id": turn_id, "session_id": self.config.session_id, "agent_id": self.config.agent_id, "attempt": 1 }));
        record["turn_state"] = json!(state);
        record["terminal_state"] = terminal_for_turn(state)
            .map(|value| json!(value))
            .unwrap_or(Value::Null);
        for key in [
            "input_event_id",
            "input_ref",
            "authority_posture",
            "attempt",
            "error",
        ] {
            if let Some(value) = event.get(key) {
                record[key] = value.clone();
            }
        }
        record["updated_at"] = event
            .get("timestamp")
            .cloned()
            .unwrap_or_else(|| json!(now_iso()));
        self.turns.insert(turn_id.to_string(), record);
    }

    fn rehydrate_idempotency_event(&mut self, event: &Value) {
        let Some(key) = string_field(event, "idempotency_key") else {
            return;
        };
        let existing = self.idempotency.get(&key).cloned().unwrap_or_else(|| {
            json!({
                "event_id": Value::Null,
                "request_id": Value::Null,
                "idempotency_key": key,
                "terminal_state": Value::Null,
            })
        });
        let is_dedup = matches!(
            string_field(event, "event").as_deref(),
            Some("input_event_deduplicated")
        );
        let event_id_key = if is_dedup {
            "original_event_id"
        } else {
            "event_id"
        };
        let request_id_key = if is_dedup {
            "original_request_id"
        } else {
            "request_id"
        };
        let event_id = event
            .get(event_id_key)
            .cloned()
            .or_else(|| existing.get("event_id").cloned())
            .unwrap_or(Value::Null);
        let request_id = event
            .get(request_id_key)
            .cloned()
            .or_else(|| existing.get("request_id").cloned())
            .unwrap_or(Value::Null);
        let terminal_state = event
            .get("terminal_state")
            .cloned()
            .filter(|value| !value.is_null())
            .or_else(|| existing.get("terminal_state").cloned())
            .unwrap_or(Value::Null);
        self.idempotency.insert(
            key.clone(),
            json!({
                "event_id": event_id,
                "request_id": request_id,
                "idempotency_key": key,
                "terminal_state": terminal_state,
            }),
        );
    }

    fn reconcile_pending_from_events(&mut self, events: &[Value]) {
        let completed: BTreeSet<String> = events
            .iter()
            .filter(|event| {
                if string_field(event, "event").as_deref() == Some("input_abandoned_on_session_end")
                {
                    return true;
                }
                if string_field(event, "event").as_deref() != Some("input_event_completed") {
                    return false;
                }
                !matches!(
                    string_field(event, "terminal_state").as_deref(),
                    Some("failed" | "interrupted")
                )
            })
            .filter_map(|event| {
                string_field(event, "input_event_id").or_else(|| string_field(event, "event_id"))
            })
            .collect();
        let queued: BTreeMap<String, Value> = events
            .iter()
            .filter(|event| string_field(event, "event").as_deref() == Some("input_event_queued"))
            .filter_map(|event| {
                string_field(event, "input_event_id")
                    .or_else(|| string_field(event, "event_id"))
                    .map(|id| (id, event.clone()))
            })
            .collect();
        let latest_admission: BTreeMap<String, String> = events
            .iter()
            .filter(|event| {
                string_field(event, "event").as_deref() == Some("input_admission_state_transition")
            })
            .filter_map(|event| {
                Some((
                    string_field(event, "input_event_id")?,
                    string_field(event, "input_admission_state")?,
                ))
            })
            .collect();
        for (id, event) in queued {
            if completed.contains(&id)
                || latest_admission
                    .get(&id)
                    .is_some_and(|state| matches!(state.as_str(), "dropped" | "abandoned"))
                || self
                    .pending
                    .iter()
                    .any(|item| string_field(item, "event_id").as_deref() == Some(id.as_str()))
            {
                continue;
            }
            let mut item = event;
            item["event_id"] = json!(id);
            item["content"] = item.get("content").cloned().unwrap_or(Value::Null);
            item["admission_state"] = latest_admission
                .get(&id)
                .map(|state| json!(state))
                .or_else(|| item.get("admission_state").cloned())
                .unwrap_or_else(|| json!("queued"));
            self.pending.push(item);
        }
    }

    fn abandon_pending(&mut self, reason: &str) -> Result<(), CoreError> {
        let pending = std::mem::take(&mut self.pending);
        for item in pending {
            let id =
                string_field(&item, "event_id").or_else(|| string_field(&item, "input_event_id"));
            self.append_event(json!({ "event": "input_abandoned_on_session_end", "input_event_id": id, "event_id": id, "reason": reason, "admission_state": "abandoned" }))?;
        }
        self.persist_queue(reason)
    }

    fn persist_queue(&mut self, transition: &str) -> Result<(), CoreError> {
        let Some(path) = self.queue_path.as_ref() else {
            return Ok(());
        };
        self.queue_revision = self.queue_revision.saturating_add(1);
        write_json_atomic(
            path,
            &json!({ "schema": QUEUE_SCHEMA, "path": path.to_string_lossy(), "updated_at": now_iso(), "revision": self.queue_revision, "pending_count": self.pending.len(), "pending": self.pending, "last_transition": transition }),
        )
    }

    fn persist_authority_transition(&self) -> Result<(), CoreError> {
        let Some(path) =
            authority_transition::source_state_path(self.config.session_path.as_deref())
        else {
            return Ok(());
        };
        let mut source = authority_transition::read_source_state(Some(&path));
        source["authority_transition_state"] = json!(self.authority_runtime_state);
        source["authority_handoff_lifecycle"] = self.authority_handoff_state.clone();
        source["last_transition"] = self
            .authority_runtime_history
            .last()
            .cloned()
            .unwrap_or(Value::Null);
        source["updated_at"] = json!(now_iso());
        authority_transition::write_source_state(Some(&path), &source).map(|_| ())
    }
}

fn read_queue(path: &Path) -> (Vec<Value>, bool, u64) {
    let Ok(text) = fs::read_to_string(path) else {
        return (Vec::new(), false, 0);
    };
    let Ok(value) = serde_json::from_str::<Value>(&text) else {
        return (Vec::new(), true, 0);
    };
    let pending = value
        .get("pending")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    let schema = value.get("schema").and_then(Value::as_str);
    let known_schema = matches!(
        schema,
        Some(QUEUE_SCHEMA) | Some("narada.nars.operator_input_queue.v1")
    );
    let revision = value.get("revision").and_then(Value::as_u64).unwrap_or(0);
    // Preserve pending inputs from the earlier queue schema while marking the
    // file for a canonical rewrite on the next mutation.
    (pending, !known_schema, revision)
}

fn normalize_input_value(input: &Value) -> Result<Value, CoreError> {
    let mut normalized = input.as_object().cloned().unwrap_or_default();
    let params = normalized
        .get("params")
        .and_then(Value::as_object)
        .cloned()
        .unwrap_or_default();
    let content = normalized
        .get("content")
        .or_else(|| params.get("content"))
        .or_else(|| params.get("message"))
        .and_then(Value::as_str)
        .map(str::to_string)
        .filter(|value| !value.trim().is_empty())
        .ok_or_else(|| CoreError("content_required".to_string()))?;
    let source = normalized
        .get("source")
        .or_else(|| params.get("source"))
        .and_then(Value::as_str)
        .map(str::to_string)
        .or_else(|| {
            let source_kind = normalized
                .get("source_kind")
                .or_else(|| params.get("source_kind"))
                .and_then(Value::as_str);
            let delivery_mode = normalized
                .get("delivery_mode")
                .or_else(|| params.get("delivery_mode"))
                .and_then(Value::as_str);
            if source_kind == Some("system") {
                Some("system_directive".to_string())
            } else if delivery_mode == Some("admit_after_active_turn") {
                Some("operator_steering".to_string())
            } else {
                Some("manual_operator".to_string())
            }
        })
        .unwrap_or_else(|| "manual_operator".to_string());
    let source_kind = normalized
        .get("source_kind")
        .or_else(|| params.get("source_kind"))
        .and_then(Value::as_str)
        .map(str::to_string)
        .unwrap_or_else(|| {
            if source == "system_directive" {
                "system".to_string()
            } else if source == "observer" {
                "agent".to_string()
            } else {
                "operator".to_string()
            }
        });
    let source_id = normalized
        .get("source_id")
        .or_else(|| params.get("source_id"))
        .and_then(Value::as_str)
        .map(str::to_string)
        .unwrap_or_else(|| {
            if source == "system_directive" {
                "narada.carrier-runtime.system_directive".to_string()
            } else if source == "observer" {
                "narada.observer".to_string()
            } else {
                "operator".to_string()
            }
        });
    let transport = normalized
        .get("transport")
        .or_else(|| params.get("transport"))
        .and_then(Value::as_str)
        .map(str::to_string)
        .unwrap_or_else(|| {
            if source == "automation_jsonl" || source == "observer" {
                "control_jsonl".to_string()
            } else if matches!(
                source.as_str(),
                "programmatic_operator" | "operator_directive" | "system_directive"
            ) {
                "carrier_server_api".to_string()
            } else {
                "interactive_terminal".to_string()
            }
        });
    let delivery_mode = normalized
        .get("delivery_mode")
        .or_else(|| params.get("delivery_mode"))
        .and_then(Value::as_str)
        .map(str::to_string)
        .unwrap_or_else(|| {
            if source == "operator_steering" || source == "observer" {
                "admit_after_active_turn".to_string()
            } else {
                "admit_for_current_turn".to_string()
            }
        });
    let event_id = normalized
        .get("event_id")
        .and_then(Value::as_str)
        .filter(|value| !value.trim().is_empty())
        .map(str::to_string)
        .unwrap_or_else(|| format!("input_{}", Uuid::new_v4().simple()));
    let request_id = normalized
        .get("request_id")
        .or_else(|| params.get("request_id"))
        .cloned()
        .unwrap_or(Value::Null);
    let idempotency_key = normalized
        .get("idempotency_key")
        .or_else(|| params.get("idempotency_key"))
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string);
    let received_at = normalized
        .get("received_at")
        .or_else(|| normalized.get("created_at"))
        .and_then(Value::as_str)
        .map(str::to_string)
        .unwrap_or_else(now_iso);
    normalized.insert("schema".to_string(), json!("narada.carrier.input_event.v1"));
    normalized.insert("event_id".to_string(), json!(event_id));
    normalized.insert("content".to_string(), json!(content));
    normalized.insert("source".to_string(), json!(source));
    normalized.insert("source_kind".to_string(), json!(source_kind));
    normalized.insert("source_id".to_string(), json!(source_id));
    normalized.insert("transport".to_string(), json!(transport));
    normalized.insert("delivery_mode".to_string(), json!(delivery_mode));
    normalized.insert(
        "hold_condition".to_string(),
        normalized
            .get("hold_condition")
            .or_else(|| params.get("hold_condition"))
            .cloned()
            .unwrap_or(Value::Null),
    );
    normalized.insert("created_at".to_string(), json!(received_at));
    normalized.insert("received_at".to_string(), json!(received_at));
    normalized.insert(
        "authority_ref".to_string(),
        normalized
            .get("authority_ref")
            .or_else(|| params.get("authority_ref"))
            .cloned()
            .unwrap_or(Value::Null),
    );
    normalized.insert(
        "directive_id".to_string(),
        normalized
            .get("directive_id")
            .or_else(|| params.get("directive_id"))
            .cloned()
            .unwrap_or(Value::Null),
    );
    normalized.insert("request_id".to_string(), request_id);
    normalized.insert(
        "idempotency_key".to_string(),
        idempotency_key.map(Value::String).unwrap_or(Value::Null),
    );
    normalized.insert("admission_state".to_string(), json!("accepted"));
    Ok(Value::Object(normalized))
}

fn write_json_atomic(path: &Path, value: &Value) -> Result<(), CoreError> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|error| CoreError(format!("runtime_directory_create_failed:{error}")))?;
    }
    let temporary = path.with_extension(format!(
        "tmp-{}-{}",
        std::process::id(),
        Uuid::new_v4().simple()
    ));
    let mut file = File::create(&temporary)
        .map_err(|error| CoreError(format!("runtime_atomic_open_failed:{error}")))?;
    serde_json::to_writer(&mut file, value)
        .map_err(|error| CoreError(format!("runtime_atomic_encode_failed:{error}")))?;
    file.write_all(b"\n")
        .map_err(|error| CoreError(format!("runtime_atomic_write_failed:{error}")))?;
    file.flush()
        .map_err(|error| CoreError(format!("runtime_atomic_flush_failed:{error}")))?;
    drop(file);
    if path.exists() {
        fs::remove_file(path)
            .map_err(|error| CoreError(format!("runtime_atomic_replace_failed:{error}")))?;
    }
    fs::rename(&temporary, path)
        .map_err(|error| CoreError(format!("runtime_atomic_rename_failed:{error}")))
}

fn merge_object(target: &mut Value, additions: Value) {
    if let (Some(target), Some(additions)) = (target.as_object_mut(), additions.as_object()) {
        for (key, value) in additions {
            target.insert(key.clone(), value.clone());
        }
    }
}

fn string_field(value: &Value, key: &str) -> Option<String> {
    value.get(key).and_then(|value| match value {
        Value::String(value) if !value.trim().is_empty() => Some(value.trim().to_string()),
        Value::Number(value) => Some(value.to_string()),
        _ => None,
    })
}
fn value_as_string(value: &Value) -> Option<String> {
    match value {
        Value::String(value) => Some(value.clone()),
        Value::Number(value) => Some(value.to_string()),
        Value::Bool(value) => Some(value.to_string()),
        _ => None,
    }
}
fn event_kind(value: &Value) -> Option<String> {
    for key in ["event", "event_kind"] {
        if let Some(candidate) = value.get(key) {
            if let Some(kind) = value_as_string(candidate) {
                return Some(kind);
            }
            if let Some(kind) = candidate
                .as_object()
                .and_then(|object| object.get("type"))
                .and_then(value_as_string)
            {
                return Some(kind);
            }
        }
    }
    string_field(value, "type")
}

fn normalize_event_view(value: &str) -> Option<&'static str> {
    match value.trim().to_ascii_lowercase().as_str() {
        "conversation" => Some("conversation"),
        "operations" => Some("operations"),
        "diagnostics" => Some("diagnostics"),
        "raw" => Some("raw"),
        _ => None,
    }
}

fn is_conversation_event_kind(kind: &str) -> bool {
    matches!(
        kind,
        "assistant_message"
            | "assistant_message_stream"
            | "user_message"
            | "operator_input_submitted"
            | "conversation_enqueue_requested"
            | "input_event_queued"
            | "input_event_deduplicated"
            | "input_event_started"
            | "input_event_completed"
            | "runtime_request_state_transition"
            | "input_queued_for_turn_boundary"
            | "input_admitted_to_turn"
            | "input_dropped_by_operator"
            | "input_abandoned_on_session_end"
            | "input_completed"
            | "session_control_accepted"
            | "session_control_response"
            | "session_control_rejected"
            | "session_cancel"
            | "carrier_turn_started"
            | "carrier_turn_completed"
            | "carrier_turn_failed"
            | "carrier_turn_interrupted"
            | "turn_started"
            | "turn_complete"
            | "turn_failed"
            | "turn_interrupted"
            | "session_affordance_action_requested"
            | "session_affordance_action_result"
            | "session_affordance_action_refused"
            | "session_affordance_confirmation_required"
            | "session_affordance_action_confirmed"
            | "session_affordance_action_cancelled"
            | "agent_web_ui_message"
            | "agent_web_ui_help"
            | "session_artifact_registered"
            | "session_artifact_read"
            | "error"
            | "websocket_error"
            | "web_ui_decode_error"
            | "web_ui_input_not_sent"
            | "runtime_error"
    )
}

fn is_operation_event_kind(kind: &str) -> bool {
    matches!(
        kind,
        "tool_call"
            | "tool_result"
            | "carrier_tool_requested"
            | "carrier_tool_completed"
            | "tool_execution_state_transition"
            | "tool_execution_completed"
            | "tool_execution_refused"
            | "tool_admitted"
            | "tool_refused"
            | "turn_lifecycle_transition"
            | "turn_failed"
            | "conversation_enqueue_requested"
            | "input_queued_for_turn_boundary"
            | "input_admitted_to_turn"
            | "input_dropped_by_operator"
            | "input_abandoned_on_session_end"
            | "input_completed"
            | "session_started"
            | "session_closed"
            | "session_status"
            | "session_recovery"
            | "session_operations"
            | "session_sync"
            | "observer_status"
            | "observers_status"
            | "carrier_command_result"
            | "turn_started"
            | "turn_complete"
            | "directive_received"
            | "directive_receipt_recorded"
            | "directive_carrier_accepted_recorded"
            | "directive_complete"
    )
}

fn is_diagnostic_event_kind(kind: &str) -> bool {
    matches!(
        kind,
        "authority_session_revoked"
            | "projection_revoked"
            | "carrier_diagnostic_recorded"
            | "mcp_runtime_fault"
            | "runtime_projection_failure"
            | "runtime_output_failure"
            | "runtime_control_input_bridge_error"
            | "runtime_intelligence_reconfiguration"
            | "runtime_intelligence_reconfiguration_cancel"
            | "intelligence_runtime_reconfiguration_state_transition"
            | "provider_runtime_fault"
            | "provider_error"
            | "session_health"
            | "websocket_connected"
            | "session_events_subscription_started"
            | "session_events_replay_completed"
    )
}

fn event_matches_view(event: &Value, view: &str) -> bool {
    if view == "raw" {
        return true;
    }
    let Some(kind) = event_kind(event) else {
        return false;
    };
    match view {
        "conversation" => is_conversation_event_kind(&kind),
        "operations" => {
            is_conversation_event_kind(&kind)
                || is_operation_event_kind(&kind)
                || kind.starts_with("authority_source_")
                || kind.starts_with("authority_target_")
                || matches!(
                    kind.as_str(),
                    "item.started" | "item.completed" | "turn.started" | "turn.completed"
                )
        }
        "diagnostics" => is_diagnostic_event_kind(&kind) || kind.starts_with("provider_"),
        _ => false,
    }
}

fn selector_string(value: &Value) -> Option<String> {
    match value {
        Value::String(value) => Some(value.clone()),
        Value::Number(value) => Some(value.to_string()),
        Value::Bool(value) => Some(value.to_string()),
        _ => None,
    }
}

fn selector_active(value: &Value) -> bool {
    match value {
        Value::Null => false,
        Value::String(value) => !value.is_empty(),
        Value::Number(value) => value.as_f64().map(|number| number != 0.0).unwrap_or(true),
        Value::Bool(value) => *value,
        _ => true,
    }
}

fn event_matches_selector(event: &Value, field: &str, expected: &Value) -> bool {
    let payload = event.get("payload").and_then(Value::as_object);
    let mut values = Vec::new();
    if field == "input_event_id" {
        values.push(event.get("input_event_id"));
        values.push(event.get("event_id"));
        values.push(payload.and_then(|object| object.get("input_event_id")));
        values.push(payload.and_then(|object| object.get("event_id")));
    } else {
        values.push(event.get(field));
        values.push(payload.and_then(|object| object.get(field)));
    }
    let Some(expected) = selector_string(expected) else {
        return false;
    };
    values
        .into_iter()
        .flatten()
        .filter_map(selector_string)
        .any(|value| value == expected)
}

fn array_contains_string(value: Option<&Value>, expected: &str) -> bool {
    value
        .and_then(Value::as_array)
        .map(|values| {
            values
                .iter()
                .filter_map(selector_string)
                .any(|value| value == expected)
        })
        .unwrap_or(false)
}

fn event_matches_filters(event: &Value, filters: &Map<String, Value>) -> bool {
    let kind = event_kind(event);
    if let Some(view) = filters.get("view").and_then(value_as_string) {
        if !event_matches_view(event, &view.to_ascii_lowercase()) {
            return false;
        }
    }
    if filters.get("event_kinds").is_some() || filters.get("kinds").is_some() {
        let kinds = filters.get("event_kinds").or_else(|| filters.get("kinds"));
        if !kinds
            .and_then(Value::as_array)
            .map(|values| {
                kind.as_deref()
                    .map(|kind| {
                        values
                            .iter()
                            .filter_map(selector_string)
                            .any(|value| value == kind)
                    })
                    .unwrap_or(false)
            })
            .unwrap_or(false)
        {
            return false;
        }
    }
    if let Some(families) = filters.get("families").and_then(Value::as_array) {
        if !families.is_empty() {
            let family = if kind
                .as_deref()
                .map(|kind| kind.starts_with("session_"))
                .unwrap_or(false)
            {
                "session"
            } else {
                "turn"
            };
            if !array_contains_string(filters.get("families"), family) {
                return false;
            }
        }
    }
    for field in ["request_id", "turn_id"] {
        if let Some(expected) = filters.get(field) {
            if selector_active(expected) && !event_matches_selector(event, field, expected) {
                return false;
            }
        }
    }
    if let Some(any_of) = filters.get("any_of").and_then(Value::as_object) {
        let selectors = ["request_id", "turn_id", "input_event_id", "directive_id"]
            .iter()
            .filter_map(|field| {
                any_of
                    .get(*field)
                    .filter(|value| any_of_selector_active(value))
                    .map(|value| (*field, value))
            })
            .collect::<Vec<_>>();
        if !selectors.is_empty()
            && !selectors
                .iter()
                .any(|(field, expected)| event_matches_selector(event, field, expected))
        {
            return false;
        }
    }
    true
}

fn event_sequence_value(event: &Value) -> Option<Value> {
    event
        .get("event_sequence")
        .filter(|value| !value.is_null())
        .or_else(|| event.get("sequence").filter(|value| !value.is_null()))
        .cloned()
}

fn sequence_number(value: &Value) -> Option<i64> {
    match value {
        Value::Number(value) => value
            .as_i64()
            .or_else(|| value.as_f64().map(|number| number as i64)),
        Value::String(value) => value
            .trim()
            .parse::<f64>()
            .ok()
            .filter(|number| number.is_finite())
            .map(|number| number as i64),
        _ => None,
    }
}

fn parse_integer_text(value: &str) -> Option<i64> {
    let value = value.trim();
    if value.is_empty() {
        return None;
    }
    let mut end = 0;
    let bytes = value.as_bytes();
    if bytes.first() == Some(&b'+') || bytes.first() == Some(&b'-') {
        end = 1;
    }
    while end < bytes.len() && bytes[end].is_ascii_digit() {
        end += 1;
    }
    if end == 0 || (end == 1 && bytes[0] != b'0') {
        return None;
    }
    value[..end].parse::<i64>().ok()
}

fn optional_integer_value(value: Option<&Value>) -> Option<i64> {
    match value {
        Some(Value::Number(value)) => value.as_i64().or_else(|| {
            value
                .as_f64()
                .filter(|number| number.is_finite())
                .map(|number| number as i64)
        }),
        Some(Value::String(value)) => parse_integer_text(value),
        _ => None,
    }
}

fn bounded_event_limit(value: Option<&Value>, default_value: usize, max: usize) -> usize {
    match optional_integer_value(value) {
        Some(value) if value >= 0 => (value as usize).min(max),
        _ => default_value,
    }
}

fn event_sequence_number(event: &Value) -> Option<i64> {
    event_sequence_value(event).and_then(|value| sequence_number(&value))
}

fn event_in_page_window(
    event: &Value,
    after: Option<i64>,
    before: Option<i64>,
    since_timestamp: Option<&str>,
) -> bool {
    let sequence = event_sequence_number(event).unwrap_or(0);
    if after.map(|value| sequence <= value).unwrap_or(false)
        || before.map(|value| sequence >= value).unwrap_or(false)
    {
        return false;
    }
    if let Some(since) = since_timestamp.and_then(parse_timestamp_millis) {
        if let Some(event_time) = event
            .get("timestamp")
            .or_else(|| event.get("generated_at"))
            .and_then(Value::as_str)
            .and_then(parse_timestamp_millis)
        {
            if event_time <= since {
                return false;
            }
        }
    }
    true
}

fn parse_timestamp_millis(value: &str) -> Option<i64> {
    let value = value.trim();
    let separator = value.find('T').or_else(|| value.find(' '))?;
    let date = &value[..separator];
    let mut time = &value[separator + 1..];
    let mut offset_minutes = 0i64;
    if let Some(stripped) = time.strip_suffix('Z').or_else(|| time.strip_suffix('z')) {
        time = stripped;
    } else if let Some(position) = time.find(['+', '-']).filter(|position| *position > 0) {
        let offset = &time[position..];
        let sign = if offset.starts_with('-') { -1i64 } else { 1i64 };
        let offset = offset.trim_start_matches(['+', '-']);
        let mut pieces = offset.split(':');
        let hours = pieces.next()?.parse::<i64>().ok()?;
        let minutes = pieces.next().unwrap_or("0").parse::<i64>().ok()?;
        offset_minutes = sign * (hours * 60 + minutes);
        time = &time[..position];
    }
    let mut date_parts = date.split('-');
    let year = date_parts.next()?.parse::<i64>().ok()?;
    let month = date_parts.next()?.parse::<i64>().ok()?;
    let day = date_parts.next()?.parse::<i64>().ok()?;
    let mut time_parts = time.split(':');
    let hour = time_parts.next()?.parse::<i64>().ok()?;
    let minute = time_parts.next()?.parse::<i64>().ok()?;
    let seconds = time_parts.next()?;
    let (second_text, fraction_text) = seconds
        .split_once('.')
        .map(|(seconds, fraction)| (seconds, Some(fraction)))
        .unwrap_or((seconds, None));
    let second = second_text.parse::<i64>().ok()?;
    let millis = fraction_text
        .map(|fraction| {
            let digits = fraction.chars().take(3).collect::<String>();
            format!("{digits:0<3}").parse::<i64>().ok()
        })
        .flatten()
        .unwrap_or(0);
    let days = days_from_civil(year, month, day);
    Some(
        (days * 86_400 + hour * 3_600 + minute * 60 + second) * 1_000 + millis
            - offset_minutes * 60 * 1_000,
    )
}

fn days_from_civil(year: i64, month: i64, day: i64) -> i64 {
    let adjusted_year = year - if month <= 2 { 1 } else { 0 };
    let era = (if adjusted_year >= 0 {
        adjusted_year
    } else {
        adjusted_year - 399
    })
    .div_euclid(400);
    let year_of_era = adjusted_year - era * 400;
    let month_prime = month + if month > 2 { -3 } else { 9 };
    let day_of_year = (153 * month_prime + 2).div_euclid(5) + day - 1;
    let day_of_era = year_of_era * 365 + year_of_era / 4 - year_of_era / 100 + day_of_year;
    era * 146_097 + day_of_era - 719_468
}
fn request_outcome(event: &Value) -> Option<String> {
    match string_field(event, "event").as_deref() {
        Some("carrier_turn_failed") | Some("turn_failed") => {
            let error = string_field(event, "error")
                .or_else(|| string_field(event, "error_summary"))
                .unwrap_or_default();
            if error.to_ascii_lowercase().contains("abort")
                || error.to_ascii_lowercase().contains("cancel")
                || error.to_ascii_lowercase().contains("interrupt")
            {
                Some("cancelled".into())
            } else {
                Some("request_runtime_failure".into())
            }
        }
        Some("session_control_rejected") => {
            let code = string_field(event, "code").unwrap_or_default();
            if code == "request_dispatch_failed" {
                Some("dispatch_failure".into())
            } else if code == "invalid_json" || code == "unsupported_session_control" {
                Some("invalid_request".into())
            } else {
                None
            }
        }
        Some("session_control_response") => {
            let outcome = string_field(event, "request_outcome")
                .or_else(|| string_field(event, "terminal_state"));
            if outcome.as_deref() == Some("completed") {
                Some("completed".into())
            } else {
                None
            }
        }
        _ => None,
    }
}
fn request_issue(event: &Value) -> Option<String> {
    match string_field(event, "event").as_deref() {
        Some("carrier_turn_failed") | Some("turn_failed") => {
            let error = string_field(event, "error")
                .or_else(|| string_field(event, "error_summary"))
                .unwrap_or_default();
            if error.to_ascii_lowercase().contains("abort")
                || error.to_ascii_lowercase().contains("cancel")
                || error.to_ascii_lowercase().contains("interrupt")
            {
                None
            } else {
                Some("carrier_turn_failed".into())
            }
        }
        Some("session_control_rejected") => {
            string_field(event, "code").or_else(|| Some("session_control_rejected".into()))
        }
        _ => None,
    }
}

fn summarize_request_posture(counts: &BTreeMap<String, u64>) -> (u64, String) {
    let invalid = counts.get("invalid_request").copied().unwrap_or(0);
    let closed = counts.get("rejected_closed").copied().unwrap_or(0);
    let runtime = counts.get("dispatch_failure").copied().unwrap_or(0)
        + counts.get("request_runtime_failure").copied().unwrap_or(0)
        + counts.get("request_error").copied().unwrap_or(0);
    let total = invalid + closed + runtime;
    let posture = if total == 0 {
        "clean"
    } else if runtime >= invalid && runtime >= closed {
        "runtime_failures"
    } else if invalid >= closed {
        "invalid_control_traffic"
    } else {
        "closed_session_retries"
    };
    (total, posture.to_string())
}

fn summarize_count_map(counts: &BTreeMap<String, u64>) -> String {
    if counts.is_empty() {
        return "0".to_string();
    }
    counts
        .iter()
        .filter(|(_, value)| **value > 0)
        .map(|(key, value)| format!("{key}:{value}"))
        .collect::<Vec<_>>()
        .join(", ")
}

fn operational_posture(lifecycle: &str, mcp_state: &str, request_posture: &str) -> &'static str {
    if mcp_state == "runtime_faulted" {
        "mcp_runtime_faulted"
    } else if mcp_state == "startup_degraded" {
        "mcp_startup_degraded"
    } else if request_posture == "runtime_failures" {
        "request_runtime_failures"
    } else if request_posture == "invalid_control_traffic" {
        "request_invalid_control_traffic"
    } else if request_posture == "closed_session_retries" {
        "request_closed_session_retries"
    } else if lifecycle == "closed" {
        "closed"
    } else {
        "healthy"
    }
}

pub fn can_transition_shutdown(previous: &str, next: &str) -> bool {
    matches!(
        (previous, next),
        ("idle", "cancelling" | "draining")
            | ("cancelling", "draining" | "failed")
            | ("draining", "finalizing_queue" | "failed")
            | ("finalizing_queue", "closing_tools" | "failed")
            | ("closing_tools", "closed" | "failed")
    )
}

/// Validate the durable input-admission state machine shared with the
/// TypeScript compatibility implementation.
pub fn can_transition_input_admission(previous: Option<&str>, next: &str, recovery: bool) -> bool {
    if !INPUT_ADMISSION_STATES.contains(&next) {
        return false;
    }
    match previous {
        None => next == "accepted",
        Some(previous) if previous == next => true,
        Some("accepted") => matches!(next, "queued" | "dropped" | "abandoned"),
        Some("queued") => matches!(next, "held" | "admitted" | "dropped" | "abandoned"),
        Some("held") => matches!(next, "queued" | "admitted" | "dropped" | "abandoned"),
        Some("admitted") => next == "queued" && recovery,
        Some("dropped" | "abandoned") => false,
        _ => false,
    }
}

pub fn assert_input_admission_transition(
    previous: Option<&str>,
    next: &str,
    recovery: bool,
) -> Result<(), CoreError> {
    if can_transition_input_admission(previous, next, recovery) {
        Ok(())
    } else {
        Err(CoreError(format!(
            "invalid_nars_input_admission_transition:{}:{next}",
            previous.unwrap_or("none")
        )))
    }
}

pub fn can_transition_lifecycle(previous: &str, next: &str) -> bool {
    matches!(
        (previous, next),
        ("starting", "ready" | "closing" | "failed")
            | ("ready", "closing" | "failed")
            | ("closing", "closed" | "failed")
            | ("failed", "closed")
    )
}
pub fn can_transition_turn(previous: Option<&str>, next: &str, retry: bool) -> bool {
    match (previous, next) {
        (None, "accepted") => true,
        (Some("accepted"), "contextualized" | "blocked" | "interrupted" | "failed" | "refused") => {
            true
        }
        (
            Some("contextualized"),
            "evaluating" | "blocked" | "interrupted" | "failed" | "refused",
        ) => true,
        (
            Some("evaluating"),
            "tool_requested" | "reconciling" | "completed" | "blocked" | "interrupted" | "failed"
            | "refused",
        ) => true,
        (
            Some("tool_requested"),
            "tool_admitted" | "tool_refused" | "blocked" | "interrupted" | "failed",
        ) => true,
        (Some("tool_admitted"), "executing" | "blocked" | "interrupted" | "failed") => true,
        (Some("tool_refused"), "evaluating" | "refused" | "blocked" | "interrupted" | "failed") => {
            true
        }
        (Some("executing"), "reconciling" | "blocked" | "interrupted" | "failed") => true,
        (
            Some("reconciling"),
            "evaluating" | "completed" | "blocked" | "interrupted" | "failed",
        ) => true,
        (Some(previous), "accepted") if retry && is_terminal_turn(previous) => true,
        _ => false,
    }
}
pub fn is_terminal_turn(state: &str) -> bool {
    matches!(
        state,
        "completed" | "blocked" | "interrupted" | "failed" | "refused"
    )
}
pub fn terminal_for_turn(state: &str) -> Option<&'static str> {
    match state {
        "completed" => Some("completed"),
        "blocked" => Some("blocked"),
        "interrupted" => Some("interrupted"),
        "failed" => Some("failed"),
        "refused" => Some("refused"),
        _ => None,
    }
}

struct ModeProvider {
    mode: String,
}

impl NarsProviderAdapter for ModeProvider {
    fn run_turn(&mut self, input: &Value) -> ProviderOutcome {
        let content = string_field(input, "content").unwrap_or_default();
        match self.mode.as_str() {
            "echo" => ProviderOutcome::Completed(format!("native-rust: {content}")),
            "refused" => ProviderOutcome::Refused("native_provider_adapter_refused".to_string()),
            "failed" => ProviderOutcome::Failed("native_provider_adapter_failed".to_string()),
            "error" => ProviderOutcome::Error("native_provider_adapter_error".to_string()),
            "interrupted" => {
                ProviderOutcome::Interrupted("native_provider_adapter_interrupted".to_string())
            }
            _ => ProviderOutcome::Blocked("native_provider_adapter_unavailable".to_string()),
        }
    }
}

fn now_iso() -> String {
    let millis = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64;
    let seconds = millis.div_euclid(1_000);
    let day_count = seconds.div_euclid(86_400);
    let sod = seconds.rem_euclid(86_400);
    let (year, month, day) = civil_from_days(day_count);
    format!(
        "{year:04}-{month:02}-{day:02}T{:02}:{:02}:{:02}.{:03}Z",
        sod / 3_600,
        (sod % 3_600) / 60,
        sod % 60,
        millis.rem_euclid(1_000)
    )
}
fn civil_from_days(days_since_epoch: i64) -> (i64, i64, i64) {
    let z = days_since_epoch + 719468;
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

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    fn config(root: &Path) -> SessionCoreConfig {
        SessionCoreConfig {
            session_id: "core-test".into(),
            agent_id: "agent-test".into(),
            session_path: Some(root.join("session.jsonl")),
            events_path: root.join("events.jsonl"),
            site_root: Some(root.to_path_buf()),
            max_event_buffer: 100,
        }
    }

    #[test]
    fn lifecycle_turn_queue_rehydrate_and_corrupt_lines_are_durable() {
        let root = std::env::temp_dir().join(format!("narada-core-{}", Uuid::new_v4().simple()));
        fs::create_dir_all(&root).unwrap();
        let mut core = SessionCore::new(config(&root)).unwrap();
        assert_eq!(core.lifecycle_state(), "starting");
        core.transition_lifecycle("ready", Value::Null).unwrap();
        core.submit(
            json!({ "event_id": "input-1", "content": "hello", "source_kind": "operator" }),
            "echo",
        )
        .unwrap();
        assert_eq!(core.turn("input-1").unwrap()["turn_state"], "completed");
        let health = core.health("disabled");
        assert_eq!(health["mcp_operational_state"], "disabled");
        assert_eq!(health["request_posture"], "clean");
        assert!(health["session_event_count"].as_u64().unwrap_or(0) > 0);
        core.close("test").unwrap();
        assert_eq!(core.lifecycle_state(), "closed");
        fs::OpenOptions::new()
            .append(true)
            .open(root.join("events.jsonl"))
            .unwrap()
            .write_all(b"{\"event\":\n")
            .unwrap();
        let recovered = SessionCore::new(config(&root)).unwrap();
        assert!(recovered.corrupt_event_line_count() >= 1);
        assert_eq!(
            recovered.turn("input-1").unwrap()["terminal_state"],
            "completed"
        );
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn turn_fsm_rejects_skip_and_accepts_explicit_retry() {
        let root =
            std::env::temp_dir().join(format!("narada-core-fsm-{}", Uuid::new_v4().simple()));
        fs::create_dir_all(&root).unwrap();
        let mut core = SessionCore::new(config(&root)).unwrap();
        core.transition_lifecycle("ready", Value::Null).unwrap();
        core.ensure_turn(&json!({ "event_id": "turn-1" })).unwrap();
        assert!(core
            .transition_turn("turn-1", "completed", Value::Null)
            .is_err());
        core.transition_turn("turn-1", "contextualized", Value::Null)
            .unwrap();
        core.transition_turn("turn-1", "evaluating", Value::Null)
            .unwrap();
        core.transition_turn("turn-1", "blocked", json!({ "reason": "test" }))
            .unwrap();
        core.transition_turn("turn-1", "accepted", json!({ "retry": true }))
            .unwrap();
        assert_eq!(core.turn("turn-1").unwrap()["attempt"], 2);
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn native_core_owns_artifacts_attachments_and_authority_transition_records() {
        let root =
            std::env::temp_dir().join(format!("narada-core-surfaces-{}", Uuid::new_v4().simple()));
        fs::create_dir_all(&root).unwrap();
        fs::write(root.join("report.md"), "native artifact\n").unwrap();
        let mut core = SessionCore::new(config(&root)).unwrap();
        core.transition_lifecycle("ready", Value::Null).unwrap();
        let registered = core.register_artifact(json!({ "source_path": root.join("report.md"), "kind": "markdown", "title": "Report" })).unwrap();
        let artifact_id = registered["record"]["artifact_id"]
            .as_str()
            .unwrap()
            .to_string();
        assert_eq!(registered["record"]["lifecycle"]["state"], "active");
        assert!(
            core.read_artifact_content(&artifact_id).unwrap()["content_base64"]
                .as_str()
                .unwrap()
                .len()
                > 0
        );
        core.transition_artifact(&artifact_id, "revoked", json!({ "reason": "test" }))
            .unwrap();
        core.transition_artifact(
            &artifact_id,
            "archived",
            json!({ "reason": "test_archive" }),
        )
        .unwrap();
        assert!(core.read_artifact_content(&artifact_id).is_err());

        let attachment = core.register_surface_attachment(json!({ "attachment_id": "surface-1", "surface_kind": "agent-cli", "surface_instance_id": "cli-1" })).unwrap();
        assert_eq!(attachment["attachment_state"], "requested");
        core.transition_surface_attachment("surface-1", "discovering", Value::Null)
            .unwrap();
        core.transition_surface_attachment("surface-1", "probing_health", Value::Null)
            .unwrap();
        core.transition_surface_attachment(
            "surface-1",
            "attached",
            json!({ "health_state": "healthy" }),
        )
        .unwrap();
        assert_eq!(
            core.surface_attachment_summary().unwrap()["attached_count"],
            1
        );
        core.detach_surface_attachment("surface-1", json!({ "reason": "test_detach" }))
            .unwrap();

        core.transition_authority_runtime("proposed", json!({ "reason": "test_transition" }))
            .unwrap();
        core.transition_authority_runtime("preparing_target", Value::Null)
            .unwrap();
        assert_eq!(core.authority_runtime_state()["state"], "preparing_target");
        assert!(root.join("authority-transition-state.json").exists());
        let recovered = SessionCore::new(config(&root)).unwrap();
        assert_eq!(
            recovered.artifact_index().unwrap()["artifacts"]
                .as_array()
                .unwrap()
                .len(),
            1
        );
        assert_eq!(recovered.surface_attachments().unwrap().len(), 1);
        assert_eq!(
            recovered.authority_runtime_state()["state"],
            "preparing_target"
        );
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn durable_event_page_views_filters_cursors_and_replay_direction_match_contract() {
        let root =
            std::env::temp_dir().join(format!("narada-core-events-{}", Uuid::new_v4().simple()));
        fs::create_dir_all(&root).unwrap();
        let mut core = SessionCore::new(config(&root)).unwrap();
        let events = [
            json!({ "event": "session_health", "event_sequence": 1, "timestamp": "2026-01-01T00:00:01.000Z" }),
            json!({ "event": "session_health", "event_sequence": 2, "timestamp": "2026-01-01T00:00:02.000Z" }),
            json!({ "event": "session_started", "event_sequence": 3, "timestamp": "2026-01-01T00:00:03.000Z" }),
            json!({ "event": "tool_call", "event_sequence": 4, "timestamp": "2026-01-01T00:00:04.000Z" }),
            json!({ "event": "user_message", "event_sequence": 5, "request_id": "target", "timestamp": "2026-01-01T00:00:05.000Z" }),
            json!({ "event": "session_health", "event_sequence": 6, "timestamp": "2026-01-01T00:00:06.000Z" }),
            json!({ "event": "assistant_message", "event_sequence": 7, "request_id": "target", "timestamp": "2026-01-01T00:00:07.000Z" }),
            json!({ "event": "tool_result", "event_sequence": 8, "timestamp": "2026-01-01T00:00:08.000Z" }),
            json!({ "event": "assistant_message", "event_sequence": 9, "timestamp": "2026-01-01T00:00:09.000Z" }),
            json!({ "event": "runtime_output_failure", "event_sequence": 10, "timestamp": "2026-01-01T00:00:10.000Z" }),
        ];
        for event in events {
            core.append_event(event).unwrap();
        }

        let conversation = core
            .events_page_contract(&json!({ "view": "conversation", "limit": 2 }))
            .unwrap();
        assert_eq!(conversation["event_count"], 2);
        assert_eq!(conversation["has_more"], true);
        assert_eq!(conversation["events"][0]["event_sequence"], 5);
        assert_eq!(conversation["events"][1]["event_sequence"], 7);
        assert_eq!(conversation["cursor"]["last_sequence"], 10);
        assert_eq!(conversation["cursor"]["next_sequence"], 11);

        let operations = core
            .events_page_contract(&json!({ "view": "operations", "limit": 20 }))
            .unwrap();
        let operation_sequences = operations["events"]
            .as_array()
            .unwrap()
            .iter()
            .filter_map(|event| event["event_sequence"].as_u64())
            .collect::<Vec<_>>();
        assert_eq!(operation_sequences, vec![3, 4, 5, 7, 8, 9]);

        let diagnostics = core
            .events_page_contract(&json!({ "view": "diagnostics", "limit": 20 }))
            .unwrap();
        let diagnostic_sequences = diagnostics["events"]
            .as_array()
            .unwrap()
            .iter()
            .filter_map(|event| event["event_sequence"].as_u64())
            .collect::<Vec<_>>();
        assert_eq!(diagnostic_sequences, vec![1, 2, 6, 10]);

        let earlier = core
            .events_page_contract(
                &json!({ "view": "conversation", "before_sequence": 9, "direction": "backward", "limit": 1 }),
            )
            .unwrap();
        assert_eq!(earlier["events"][0]["event_sequence"], 7);
        assert_eq!(earlier["cursor"]["before_sequence"], 7);

        let selected = core
            .events_page_contract(&json!({
                "view": "conversation",
                "direction": "backward",
                "limit": 10,
                "filters": { "any_of": { "request_id": "target" } }
            }))
            .unwrap();
        let selected_sequences = selected["events"]
            .as_array()
            .unwrap()
            .iter()
            .filter_map(|event| event["event_sequence"].as_u64())
            .collect::<Vec<_>>();
        assert_eq!(selected_sequences, vec![5, 7]);

        let since = core
            .events_page_contract(&json!({
                "view": "raw",
                "since_timestamp": "2026-01-01T00:00:08.000Z",
                "limit": 20
            }))
            .unwrap();
        assert_eq!(since["events"][0]["event_sequence"], 9);
        assert!(core
            .events_page_contract(&json!({ "view": "not-a-view" }))
            .is_err());
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn queue_admission_controls_normalize_hold_release_deduplicate_and_drop() {
        let root =
            std::env::temp_dir().join(format!("narada-core-queue-{}", Uuid::new_v4().simple()));
        fs::create_dir_all(&root).unwrap();
        let mut core = SessionCore::new(config(&root)).unwrap();
        core.transition_lifecycle("ready", Value::Null).unwrap();

        core.enqueue(json!({
            "params": { "message": "held input", "source_kind": "system", "hold_condition": "composer_draft" },
            "request_id": "request-held",
            "idempotency_key": "same-operation"
        }))
        .unwrap();
        assert_eq!(core.queue_snapshot()["pending_count"], 1);
        assert_eq!(core.queue_items()[0]["source"], "system_directive");
        assert_eq!(core.queue_items()[0]["admission_state"], "queued");
        let held = core.drain_once("echo").unwrap();
        assert!(held
            .iter()
            .any(|event| event["input_admission_state"] == "held"));
        assert_eq!(core.queue_items()[0]["admission_state"], "held");
        assert!(!core.release_held_input("input_00000000").unwrap());
        let input_id = core.queue_items()[0]["event_id"]
            .as_str()
            .unwrap()
            .to_string();
        assert!(core.release_held_input(&input_id).unwrap());
        core.drain_once("echo").unwrap();
        assert_eq!(core.pending_count(), 0);

        let duplicate = core
            .enqueue(json!({
                "content": "same operation retry",
                "request_id": "request-retry",
                "idempotency_key": "same-operation"
            }))
            .unwrap();
        assert_eq!(duplicate.len(), 1);
        assert_eq!(duplicate[0]["event"], "input_event_deduplicated");
        assert_eq!(duplicate[0]["original_event_id"], input_id);

        core.enqueue(json!({ "content": "operator one", "source": "manual_operator" }))
            .unwrap();
        core.enqueue(json!({ "content": "steering", "source": "operator_steering" }))
            .unwrap();
        let dropped = core.clear_operator_steering().unwrap();
        assert_eq!(dropped.len(), 1);
        assert_eq!(core.queue_snapshot()["pending_operator_directive_count"], 0);
        let dropped = core.clear_operator_input().unwrap();
        assert_eq!(dropped.len(), 1);
        assert_eq!(core.pending_count(), 0);
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn admitted_queue_items_are_requeued_on_recovery_before_execution() {
        let root =
            std::env::temp_dir().join(format!("narada-core-requeue-{}", Uuid::new_v4().simple()));
        fs::create_dir_all(&root).unwrap();
        let queue_path = root.join("operator-input-queue.json");
        fs::write(
            &queue_path,
            serde_json::to_vec(&json!({
                "schema": QUEUE_SCHEMA,
                "revision": 7,
                "pending": [{
                    "event_id": "recovered-input",
                    "content": "recover me",
                    "source": "manual_operator",
                    "source_kind": "operator",
                    "admission_state": "admitted"
                }]
            }))
            .unwrap(),
        )
        .unwrap();
        let mut core = SessionCore::new(config(&root)).unwrap();
        core.transition_lifecycle("ready", Value::Null).unwrap();
        let events = core.drain_once("echo").unwrap();
        assert!(events.iter().any(|event| {
            event["event"] == "input_admission_state_transition"
                && event["reason"] == "recovery_requeue_after_admission"
        }));
        assert_eq!(
            core.turn("recovered-input").unwrap()["terminal_state"],
            "completed"
        );
        assert_eq!(core.pending_count(), 0);
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn close_establishes_cancellation_barrier_for_an_active_turn() {
        let root =
            std::env::temp_dir().join(format!("narada-core-close-{}", Uuid::new_v4().simple()));
        fs::create_dir_all(&root).unwrap();
        let mut core = SessionCore::new(config(&root)).unwrap();
        core.transition_lifecycle("ready", Value::Null).unwrap();
        core.ensure_turn(&json!({ "event_id": "active-turn" }))
            .unwrap();
        core.transition_turn("active-turn", "contextualized", Value::Null)
            .unwrap();
        core.transition_turn("active-turn", "evaluating", Value::Null)
            .unwrap();
        let events = core
            .close_with_evidence("test", json!({ "request_id": "close-1" }))
            .unwrap();
        assert!(events
            .iter()
            .any(|event| event["event"] == "session_turn_cancel_requested"));
        assert_eq!(core.lifecycle_state(), "closed");
        assert_eq!(core.shutdown_state, "closed");
        assert_eq!(
            core.turn("active-turn").unwrap()["terminal_state"],
            "interrupted"
        );
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn live_event_subscription_receives_native_published_envelopes() {
        let root =
            std::env::temp_dir().join(format!("narada-core-subscribe-{}", Uuid::new_v4().simple()));
        fs::create_dir_all(&root).unwrap();
        let mut core = SessionCore::new(config(&root)).unwrap();
        core.subscribe_events(Some("sub-live"), json!({ "view": "conversation" }));
        core.mark_event_subscription_live("sub-live", Value::Null)
            .unwrap();
        core.append_event(json!({ "event": "user_message", "content": "hello" }))
            .unwrap();
        let envelopes = core.poll_event_subscription("sub-live").unwrap();
        assert_eq!(envelopes.len(), 1);
        assert_eq!(envelopes[0]["schema"], event_hub::EVENTS_ENVELOPE_SCHEMA);
        assert_eq!(envelopes[0]["payload"]["event"], "user_message");
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn provider_adapter_contributes_only_terminal_observation() {
        struct FixtureAdapter;
        impl NarsProviderAdapter for FixtureAdapter {
            fn run_turn(&mut self, _input: &Value) -> ProviderOutcome {
                ProviderOutcome::Completed("adapter-result".to_string())
            }
        }

        let root =
            std::env::temp_dir().join(format!("narada-core-adapter-{}", Uuid::new_v4().simple()));
        fs::create_dir_all(&root).unwrap();
        let mut core = SessionCore::new(config(&root)).unwrap();
        core.transition_lifecycle("ready", Value::Null).unwrap();
        core.enqueue(json!({ "event_id": "adapter-turn", "content": "request" }))
            .unwrap();
        let mut adapter = FixtureAdapter;
        let events = core.drain_once_with_adapter(&mut adapter).unwrap();
        assert!(events.iter().any(|event| {
            event["event"] == "assistant_message" && event["content"] == "adapter-result"
        }));
        assert_eq!(
            core.turn("adapter-turn").unwrap()["terminal_state"],
            "completed"
        );
        let _ = fs::remove_dir_all(root);
    }
}
