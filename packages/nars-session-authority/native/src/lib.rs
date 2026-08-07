//! Native implementation of `@narada-core/nars-session-authority`.
//!
//! The TypeScript package remains the compatibility surface for Node/Bun, but
//! this crate owns the SQLite row, fencing token, lease, and authority event
//! mutations used by the Rust runtime.  The process adapter never asks Node to
//! perform one of these mutations.

use rusqlite::{params, Connection, OptionalExtension};
use serde_json::{json, Value};
use std::env;
use std::fmt::{Display, Formatter};
use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};
use uuid::Uuid;

pub const SESSION_AUTHORITY_SCHEMA: &str = "narada.nars.session_authority.v1";
pub const SESSION_AUTHORITY_PRINCIPAL_SCHEMA: &str = "narada.nars.session_principal.v1";

pub mod states {
    pub const STARTING: &str = "starting";
    pub const ACTIVE: &str = "active";
    pub const STOPPING: &str = "stopping";
    pub const FAILED: &str = "failed";
    pub const CLOSED: &str = "closed";
}

pub mod refusal_codes {
    pub const ALREADY_ACTIVE: &str = "session_authority_already_active";
    pub const STARTING: &str = "session_authority_starting";
    pub const STOPPING: &str = "session_authority_stopping";
    pub const RECONCILIATION_REQUIRED: &str = "session_authority_reconciliation_required";
    pub const FENCED: &str = "session_authority_fenced";
    pub const TOKEN_REQUIRED: &str = "session_authority_token_required";
    pub const PROCESS_ALIVE: &str = "session_authority_process_alive";
    pub const KEEP_SESSION_REQUIRED: &str = "session_authority_keep_session_required";
    pub const KEEP_SESSION_NOT_FOUND: &str = "session_authority_keep_session_not_found";
    pub const LEGACY_DUPLICATE: &str = "session_authority_legacy_duplicate";
}

#[derive(Debug, Clone)]
pub struct AuthorityError {
    pub code: String,
    pub message: String,
    pub details: Value,
}

impl AuthorityError {
    fn new(code: impl Into<String>, message: impl Into<String>, details: Value) -> Self {
        Self {
            code: code.into(),
            message: message.into(),
            details,
        }
    }

    pub fn required(name: &str) -> Self {
        Self::new(
            format!("{name}_required"),
            format!("{name} is required"),
            Value::Null,
        )
    }
}

impl Display for AuthorityError {
    fn fmt(&self, formatter: &mut Formatter<'_>) -> std::fmt::Result {
        write!(formatter, "{}:{}", self.code, self.message)
    }
}

impl std::error::Error for AuthorityError {}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SessionPrincipal {
    pub schema: String,
    pub authority_scope: String,
    pub site_id: String,
    pub local_agent_id: String,
    pub principal_key: String,
    pub identity_ref: Option<String>,
}

impl SessionPrincipal {
    pub fn normalize(
        site_id: &str,
        local_agent_id: &str,
        identity_ref: Option<&str>,
        authority_scope: &str,
    ) -> Result<Self, AuthorityError> {
        let scope = required_string(authority_scope, "authority_scope")?;
        let site_raw = required_string(site_id, "site_id")?;
        let site = if site_raw
            .get(..5)
            .map(|prefix| prefix.eq_ignore_ascii_case("site:"))
            .unwrap_or(false)
        {
            site_raw[5..].to_string()
        } else {
            site_raw
        };
        let local_raw = required_string(local_agent_id, "local_agent_id")?;
        let prefix = format!("{site}.");
        let local = local_raw
            .strip_prefix(&prefix)
            .unwrap_or(&local_raw)
            .to_string();
        Ok(Self {
            schema: SESSION_AUTHORITY_PRINCIPAL_SCHEMA.to_string(),
            authority_scope: scope.clone(),
            site_id: site.clone(),
            local_agent_id: local.clone(),
            principal_key: format!("{scope}:{site}:{local}"),
            identity_ref: identity_ref
                .filter(|value| !value.trim().is_empty())
                .map(str::to_string),
        })
    }

    pub fn to_value(&self) -> Value {
        json!({
            "schema": self.schema,
            "authority_scope": self.authority_scope,
            "site_id": self.site_id,
            "local_agent_id": self.local_agent_id,
            "principal_key": self.principal_key,
            "identity_ref": self.identity_ref,
        })
    }
}

#[derive(Debug, Clone)]
struct AuthorityRecord {
    principal_key: String,
    authority_scope: String,
    site_id: String,
    local_agent_id: String,
    state: String,
    session_id: Option<String>,
    launch_session_id: Option<String>,
    runtime_kind: String,
    operator_surface_kind: String,
    authority_host: String,
    authority_epoch: i64,
    owner_token: String,
    pid: Option<i64>,
    started_at: String,
    activated_at: Option<String>,
    last_heartbeat_at: Option<String>,
    lease_expires_at: Option<String>,
    closed_at: Option<String>,
    terminal_reason: Option<String>,
    attach_json: Option<String>,
    evidence_json: String,
    updated_at: String,
}

impl AuthorityRecord {
    fn public_value(&self) -> Value {
        let attach = self.attach_json.as_deref().and_then(parse_json);
        let evidence = parse_json(self.evidence_json.as_str()).unwrap_or_else(|| json!({}));
        json!({
            "schema": SESSION_AUTHORITY_SCHEMA,
            "principal_key": self.principal_key,
            "authority_scope": self.authority_scope,
            "site_id": self.site_id,
            "local_agent_id": self.local_agent_id,
            "state": self.state,
            "session_id": self.session_id,
            "launch_session_id": self.launch_session_id,
            "runtime_kind": self.runtime_kind,
            "operator_surface_kind": self.operator_surface_kind,
            "authority_host": self.authority_host,
            "authority_epoch": self.authority_epoch,
            "pid": self.pid,
            "started_at": self.started_at,
            "activated_at": self.activated_at,
            "last_heartbeat_at": self.last_heartbeat_at,
            "lease_expires_at": self.lease_expires_at,
            "closed_at": self.closed_at,
            "terminal_reason": self.terminal_reason,
            "attach": attach,
            "evidence": evidence,
            "updated_at": self.updated_at,
        })
    }
}

#[derive(Debug, Clone)]
pub struct Admission {
    pub schema: String,
    pub status: String,
    pub principal: SessionPrincipal,
    pub session_id: String,
    pub launch_session_id: Option<String>,
    pub authority_epoch: i64,
    pub owner_token: String,
    pub db_path: String,
    pub lease_expires_at: String,
    pub attach: Value,
}

impl Admission {
    pub fn to_value(&self) -> Value {
        json!({
            "schema": self.schema,
            "status": self.status,
            "principal": self.principal.to_value(),
            "session_id": self.session_id,
            "launch_session_id": self.launch_session_id,
            "authority_epoch": self.authority_epoch,
            "owner_token": self.owner_token,
            "db_path": self.db_path,
            "lease_expires_at": self.lease_expires_at,
            "attach": self.attach,
        })
    }
}

#[derive(Debug, Clone)]
pub struct AdmitRequest {
    pub principal: SessionPrincipal,
    pub session_id: String,
    pub launch_session_id: Option<String>,
    pub runtime_kind: String,
    pub operator_surface_kind: String,
    pub authority_host: String,
    pub site_root: Option<String>,
    pub lease_ms: i64,
    pub now: String,
    pub pid: Option<i64>,
    pub evidence: Value,
    pub replace_abandoned: bool,
    pub process_alive: bool,
    pub recovery_reason: String,
}

pub struct AuthorityStore {
    path: PathBuf,
    connection: Connection,
}

impl AuthorityStore {
    pub fn open(path: impl AsRef<Path>) -> Result<Self, AuthorityError> {
        let path = path.as_ref().to_path_buf();
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).map_err(|error| {
                AuthorityError::new(
                    "session_authority_directory_create_failed",
                    error.to_string(),
                    Value::Null,
                )
            })?;
        }
        let connection = Connection::open(&path).map_err(|error| {
            AuthorityError::new(
                "session_authority_open_failed",
                error.to_string(),
                Value::Null,
            )
        })?;
        connection
            .busy_timeout(std::time::Duration::from_millis(5_000))
            .map_err(|error| {
                AuthorityError::new(
                    "session_authority_busy_timeout_failed",
                    error.to_string(),
                    Value::Null,
                )
            })?;
        prepare_schema(&connection)?;
        Ok(Self { path, connection })
    }

    pub fn path(&self) -> &Path {
        &self.path
    }

    pub fn inspect(&self, principal: &SessionPrincipal) -> Result<Option<Value>, AuthorityError> {
        Ok(self
            .fetch(&principal.principal_key)?
            .map(|record| record.public_value()))
    }

    pub fn admit(&mut self, request: AdmitRequest) -> Result<Admission, AuthorityError> {
        self.begin_immediate()?;
        let result = (|| {
            // Read the conflicting row under the same write lock that will
            // replace it.  A pre-transaction read permits two concurrent
            // admitters to make decisions from the same stale epoch.
            let existing = self.fetch(&request.principal.principal_key)?;
            let prior_epoch = existing.as_ref().map(|record| record.authority_epoch);
            let mut current = existing;
            if let Some(record) = current.clone() {
                if is_active_state(&record.state) {
                    if request.replace_abandoned {
                        if request.process_alive {
                            return Err(AuthorityError::new(
                                refusal_codes::PROCESS_ALIVE,
                                "The existing session process is still alive; explicit recovery is refused.",
                                json!({
                                    "schema": "narada.nars.session_authority_refusal.v1",
                                    "reason_code": refusal_codes::PROCESS_ALIVE,
                                    "principal": request.principal.to_value(),
                                    "session_id": record.session_id,
                                    "pid": record.pid,
                                    "recovery_reason": request.recovery_reason,
                                    "decision_evidence": conflict_decision_evidence(&record, &request.now, request.process_alive),
                                    "required_next_step": "Stop the existing process or attach to it before retrying explicit recovery.",
                                }),
                            ));
                        }
                        self.mark_terminal(
                            &request.principal.principal_key,
                            states::FAILED,
                            "explicit_abandoned_session_replaced",
                            &request.now,
                        )?;
                        self.write_event(
                            &request.principal.principal_key,
                            "session_replaced",
                            record.session_id.as_deref(),
                            states::FAILED,
                            &request.now,
                            json!({
                                "reason": request.recovery_reason,
                                "replacement_session_id": request.session_id,
                                "process_absent": true,
                            }),
                        )?;
                        current = None;
                    } else if lease_expired(&record, &request.now) && !request.process_alive {
                        self.mark_terminal(
                            &request.principal.principal_key,
                            states::FAILED,
                            "abandoned_session_reclaimed_before_admission",
                            &request.now,
                        )?;
                        self.write_event(
                            &request.principal.principal_key,
                            "session_reclaimed",
                            record.session_id.as_deref(),
                            states::FAILED,
                            &request.now,
                            json!({ "reason": "lease_expired_and_process_absent" }),
                        )?;
                        current = None;
                    } else {
                        let code = match record.state.as_str() {
                            states::STARTING => refusal_codes::STARTING,
                            states::STOPPING => refusal_codes::STOPPING,
                            _ => refusal_codes::ALREADY_ACTIVE,
                        };
                        return Err(conflict_error(
                            &record,
                            &request.principal,
                            request.site_root.as_deref(),
                            &request.operator_surface_kind,
                            &request.now,
                            request.process_alive,
                            code,
                        ));
                    }
                }
                if ![states::FAILED, states::CLOSED].contains(&record.state.as_str())
                    && current.is_some()
                {
                    return Err(AuthorityError::new(
                        refusal_codes::RECONCILIATION_REQUIRED,
                        format!("Session authority row is not startable: {}", record.state),
                        json!({
                            "schema": "narada.nars.session_authority_refusal.v1",
                            "reason_code": refusal_codes::RECONCILIATION_REQUIRED,
                            "principal": request.principal.to_value(),
                            "state": record.state,
                            "session_id": record.session_id,
                        }),
                    ));
                }
            }
            let epoch = prior_epoch.map(|epoch| epoch + 1).unwrap_or(1);
            let owner_token = Uuid::new_v4().to_string();
            let lease_ms = if request.lease_ms > 0 {
                request.lease_ms
            } else {
                30_000
            };
            let lease_expires_at = add_millis(&request.now, lease_ms);
            let attach = attach_handoff(
                &request.session_id,
                &request.principal,
                request.site_root.as_deref(),
                &request.operator_surface_kind,
            );
            let evidence_json = json_string(&request.evidence);
            self.connection.execute(
                "INSERT INTO session_authority (principal_key, authority_scope, site_id, local_agent_id, state, session_id, launch_session_id, runtime_kind, operator_surface_kind, authority_host, authority_epoch, owner_token, pid, started_at, activated_at, last_heartbeat_at, lease_expires_at, closed_at, terminal_reason, attach_json, evidence_json, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(principal_key) DO UPDATE SET authority_scope=excluded.authority_scope, site_id=excluded.site_id, local_agent_id=excluded.local_agent_id, state=excluded.state, session_id=excluded.session_id, launch_session_id=excluded.launch_session_id, runtime_kind=excluded.runtime_kind, operator_surface_kind=excluded.operator_surface_kind, authority_host=excluded.authority_host, authority_epoch=excluded.authority_epoch, owner_token=excluded.owner_token, pid=excluded.pid, started_at=excluded.started_at, activated_at=excluded.activated_at, last_heartbeat_at=excluded.last_heartbeat_at, lease_expires_at=excluded.lease_expires_at, closed_at=excluded.closed_at, terminal_reason=excluded.terminal_reason, attach_json=excluded.attach_json, evidence_json=excluded.evidence_json, updated_at=excluded.updated_at",
                params![request.principal.principal_key, request.principal.authority_scope, request.principal.site_id, request.principal.local_agent_id, states::STARTING, request.session_id, request.launch_session_id, request.runtime_kind, request.operator_surface_kind, request.authority_host, epoch, owner_token, request.pid, request.now, Option::<String>::None, request.now, lease_expires_at, Option::<String>::None, Option::<String>::None, json_string(&attach), evidence_json, request.now],
            ).map_err(sql_error("session_authority_admit_failed"))?;
            self.write_event(
                &request.principal.principal_key,
                "session_admitted",
                Some(&request.session_id),
                states::STARTING,
                &request.now,
                json!({
                    "authority_epoch": epoch,
                    "runtime_kind": request.runtime_kind,
                    "operator_surface_kind": request.operator_surface_kind,
                }),
            )?;
            Ok(Admission {
                schema: SESSION_AUTHORITY_SCHEMA.to_string(),
                status: "admitted".to_string(),
                principal: request.principal,
                session_id: request.session_id,
                launch_session_id: request.launch_session_id,
                authority_epoch: epoch,
                owner_token,
                db_path: self.path.to_string_lossy().to_string(),
                lease_expires_at,
                attach,
            })
        })();
        self.finish_immediate(result)
    }

    pub(crate) fn assert_owner(
        &self,
        principal: &SessionPrincipal,
        session_id: &str,
        owner_token: &str,
        authority_epoch: Option<i64>,
    ) -> Result<AuthorityRecord, AuthorityError> {
        let record = self.fetch(&principal.principal_key)?;
        if let Some(record) = record {
            if record.session_id.as_deref() == Some(session_id)
                && record.owner_token == owner_token
                && authority_epoch
                    .map(|epoch| epoch == record.authority_epoch)
                    .unwrap_or(true)
            {
                return Ok(record);
            }
        }
        Err(AuthorityError::new(
            refusal_codes::FENCED,
            "Session authority ownership was fenced.",
            json!({
                "schema": "narada.nars.session_authority_refusal.v1",
                "reason_code": refusal_codes::FENCED,
                "principal": principal.to_value(),
                "session_id": session_id,
                "authority_epoch": authority_epoch,
            }),
        ))
    }

    pub fn update_owned(
        &mut self,
        principal: &SessionPrincipal,
        session_id: &str,
        owner_token: &str,
        authority_epoch: i64,
        state: &str,
        now: &str,
        pid: Option<i64>,
        terminal_reason: Option<&str>,
        evidence: Option<&Value>,
    ) -> Result<Value, AuthorityError> {
        let record =
            self.assert_owner(principal, session_id, owner_token, Some(authority_epoch))?;
        self.begin_immediate()?;
        let result = (|| {
            let at = now.to_string();
            let lease = add_millis(now, 30_000);
            let closed = state == states::CLOSED || state == states::FAILED;
            let next_pid = pid.or(record.pid);
            let current_evidence =
                parse_json(record.evidence_json.as_str()).unwrap_or_else(|| json!({}));
            let next_evidence = merge_json(
                current_evidence,
                evidence.cloned().unwrap_or_else(|| json!({})),
            );
            let changed = self.connection.execute(
                "UPDATE session_authority SET state=?, pid=?, activated_at=CASE WHEN ?='active' AND activated_at IS NULL THEN ? ELSE activated_at END, last_heartbeat_at=?, lease_expires_at=?, closed_at=CASE WHEN ? IN ('closed','failed') THEN ? ELSE closed_at END, terminal_reason=CASE WHEN ? IN ('closed','failed') THEN ? ELSE terminal_reason END, evidence_json=?, updated_at=? WHERE principal_key=? AND owner_token=? AND authority_epoch=?",
                params![state, next_pid, state, at, at, lease, state, if closed { Some(at.clone()) } else { record.closed_at.clone() }, state, if closed { terminal_reason.map(str::to_string) } else { record.terminal_reason.clone() }, json_string(&next_evidence), at, principal.principal_key, owner_token, authority_epoch],
            ).map_err(sql_error("session_authority_update_failed"))?;
            if changed != 1 {
                return Err(AuthorityError::new(
                    refusal_codes::FENCED,
                    "Session authority ownership was fenced.",
                    Value::Null,
                ));
            }
            self.write_event(
                &principal.principal_key,
                &format!("session_{state}"),
                Some(session_id),
                state,
                now,
                json!({ "terminal_reason": terminal_reason }),
            )?;
            self.fetch(&principal.principal_key)?
                .map(|record| record.public_value())
                .ok_or_else(|| {
                    AuthorityError::new(
                        refusal_codes::FENCED,
                        "Authority row disappeared after update.",
                        Value::Null,
                    )
                })
        })();
        self.finish_immediate(result)
    }

    pub fn reclaim(
        &mut self,
        principal: &SessionPrincipal,
        now: &str,
        process_alive: bool,
    ) -> Result<Value, AuthorityError> {
        let Some(record) = self.fetch(&principal.principal_key)? else {
            return Ok(json!({ "status": "not_reclaimable", "record": null }));
        };
        if !is_active_state(&record.state) {
            return Ok(json!({ "status": "not_reclaimable", "record": record.public_value() }));
        }
        if !lease_expired(&record, now) {
            return Ok(json!({ "status": "lease_fresh", "record": record.public_value() }));
        }
        if process_alive {
            return Err(AuthorityError::new(
                refusal_codes::PROCESS_ALIVE,
                "The expired session process is still alive.",
                json!({ "principal": principal.to_value(), "session_id": record.session_id, "pid": record.pid }),
            ));
        }
        self.begin_immediate()?;
        let result = (|| {
            self.mark_terminal(
                &principal.principal_key,
                states::FAILED,
                "abandoned_session_reclaimed",
                now,
            )?;
            self.write_event(
                &principal.principal_key,
                "session_reclaimed",
                record.session_id.as_deref(),
                states::FAILED,
                now,
                json!({ "reason": "lease_expired_and_process_absent" }),
            )?;
            Ok(
                json!({ "status": "reclaimed", "record": self.fetch(&principal.principal_key)?.map(|record| record.public_value()) }),
            )
        })();
        self.finish_immediate(result)
    }

    /// Reconcile legacy discovery records without mutating them.  Admission
    /// remains the only operation that claims authority; reconciliation
    /// reports whether the requested session can safely be kept.
    pub fn reconcile_session(
        &self,
        principal: &SessionPrincipal,
        keep_session_id: &str,
        sessions: &[Value],
        now: &str,
    ) -> Result<Value, AuthorityError> {
        let keep = required_string(keep_session_id, "keep_session_id")?;
        let matches = find_legacy_session_conflicts(sessions, principal, true);
        let keep_present = sessions.iter().any(|session| {
            session
                .get("session_id")
                .or_else(|| {
                    session
                        .get("record")
                        .and_then(|record| record.get("session_id"))
                })
                .and_then(Value::as_str)
                == Some(keep.as_str())
        });
        if !keep_present {
            return Err(AuthorityError::new(
                refusal_codes::KEEP_SESSION_NOT_FOUND,
                format!("The requested keep session {keep} is not present in the session index."),
                json!({
                    "principal": principal.to_value(),
                    "keep_session_id": keep,
                    "matching_sessions": matches,
                }),
            ));
        }
        let active_others: Vec<Value> = matches
            .iter()
            .filter(|session| {
                session.get("session_id").and_then(Value::as_str) != Some(keep.as_str())
                    && is_session_live(session)
            })
            .cloned()
            .collect();
        Ok(json!({
            "schema": "narada.nars.session_authority_reconciliation.v1",
            "status": if active_others.is_empty() { "ready" } else { "refused" },
            "mutation_performed": false,
            "principal": principal.to_value(),
            "keep_session_id": keep,
            "matching_sessions": matches,
            "active_other_sessions": active_others,
            "recommended_next_action": if active_others.is_empty() {
                "Admit or bind the keep session through the authority runtime."
            } else {
                "Close all non-keep sessions explicitly, then rerun reconciliation."
            },
            "generated_at": now,
        }))
    }

    pub fn close(self) {
        drop(self);
    }

    fn fetch(&self, principal_key: &str) -> Result<Option<AuthorityRecord>, AuthorityError> {
        self.connection.query_row("SELECT principal_key, authority_scope, site_id, local_agent_id, state, session_id, launch_session_id, runtime_kind, operator_surface_kind, authority_host, authority_epoch, owner_token, pid, started_at, activated_at, last_heartbeat_at, lease_expires_at, closed_at, terminal_reason, attach_json, evidence_json, updated_at FROM session_authority WHERE principal_key=?", params![principal_key], |row| Ok(AuthorityRecord {
            principal_key: row.get(0)?, authority_scope: row.get(1)?, site_id: row.get(2)?, local_agent_id: row.get(3)?, state: row.get(4)?, session_id: row.get(5)?, launch_session_id: row.get(6)?, runtime_kind: row.get(7)?, operator_surface_kind: row.get(8)?, authority_host: row.get(9)?, authority_epoch: row.get(10)?, owner_token: row.get(11)?, pid: row.get(12)?, started_at: row.get(13)?, activated_at: row.get(14)?, last_heartbeat_at: row.get(15)?, lease_expires_at: row.get(16)?, closed_at: row.get(17)?, terminal_reason: row.get(18)?, attach_json: row.get(19)?, evidence_json: row.get(20)?, updated_at: row.get(21)?,
        })).optional().map_err(sql_error("session_authority_owner_read_failed"))
    }

    fn mark_terminal(
        &self,
        principal_key: &str,
        state: &str,
        reason: &str,
        at: &str,
    ) -> Result<(), AuthorityError> {
        self.connection.execute("UPDATE session_authority SET state=?, terminal_reason=?, closed_at=?, last_heartbeat_at=?, lease_expires_at=?, updated_at=? WHERE principal_key=?", params![state, reason, at, at, at, at, principal_key]).map_err(sql_error("session_authority_terminal_update_failed"))?;
        Ok(())
    }

    fn write_event(
        &self,
        principal_key: &str,
        event: &str,
        session_id: Option<&str>,
        state: &str,
        at: &str,
        details: Value,
    ) -> Result<(), AuthorityError> {
        self.connection.execute("INSERT INTO session_authority_events (principal_key,event,session_id,state,occurred_at,details_json) VALUES (?,?,?,?,?,?)", params![principal_key, event, session_id, state, at, json_string(&details)]).map_err(sql_error("session_authority_event_failed"))?;
        Ok(())
    }

    fn begin_immediate(&self) -> Result<(), AuthorityError> {
        self.connection
            .execute_batch("BEGIN IMMEDIATE")
            .map_err(sql_error("session_authority_begin_failed"))
    }

    fn finish_immediate<T>(&self, result: Result<T, AuthorityError>) -> Result<T, AuthorityError> {
        match result {
            Ok(value) => {
                self.connection
                    .execute_batch("COMMIT")
                    .map_err(sql_error("session_authority_commit_failed"))?;
                Ok(value)
            }
            Err(error) => {
                let _ = self.connection.execute_batch("ROLLBACK");
                Err(error)
            }
        }
    }
}

pub struct AuthorityBinding {
    store: AuthorityStore,
    principal: SessionPrincipal,
    session_id: String,
    owner_token: String,
    authority_epoch: i64,
}

impl AuthorityBinding {
    pub fn from_environment(
        session_id: &str,
        site_id: Option<&str>,
        local_agent_id: &str,
    ) -> Result<Option<Self>, AuthorityError> {
        let required = env::var("NARADA_SESSION_AUTHORITY_REQUIRED")
            .ok()
            .as_deref()
            == Some("1");
        let db_path = env::var("NARADA_SESSION_AUTHORITY_DB").unwrap_or_default();
        let token = env::var("NARADA_SESSION_AUTHORITY_TOKEN").unwrap_or_default();
        let principal_key = env::var("NARADA_SESSION_AUTHORITY_PRINCIPAL_KEY").unwrap_or_default();
        let admitted_session = env::var("NARADA_SESSION_AUTHORITY_SESSION_ID")
            .unwrap_or_else(|_| session_id.to_string());
        let epoch = env::var("NARADA_SESSION_AUTHORITY_EPOCH")
            .ok()
            .and_then(|value| value.parse::<i64>().ok());
        let complete = !db_path.trim().is_empty()
            && !token.trim().is_empty()
            && !principal_key.trim().is_empty()
            && epoch.is_some();
        if !required && !complete {
            return Ok(None);
        }
        if !complete {
            return Err(AuthorityError::new(refusal_codes::TOKEN_REQUIRED, "NARS runtime authority admission is required but the authority token is incomplete.", json!({
            "required_environment": ["NARADA_SESSION_AUTHORITY_DB", "NARADA_SESSION_AUTHORITY_TOKEN", "NARADA_SESSION_AUTHORITY_SESSION_ID", "NARADA_SESSION_AUTHORITY_PRINCIPAL_KEY", "NARADA_SESSION_AUTHORITY_EPOCH"],
        })));
        }
        if admitted_session != session_id {
            return Err(AuthorityError::new(
                refusal_codes::FENCED,
                "Admitted session does not match runtime session.",
                Value::Null,
            ));
        }
        let site = site_id
            .map(str::to_string)
            .or_else(|| env::var("NARADA_SITE_ID").ok())
            .unwrap_or_else(|| "local".to_string());
        let principal = SessionPrincipal::normalize(&site, local_agent_id, None, "local")?;
        if principal.principal_key != principal_key {
            return Err(AuthorityError::new(
                refusal_codes::FENCED,
                "Runtime principal does not match the admitted authority principal.",
                json!({ "expected_principal_key": principal_key, "actual_principal_key": principal.principal_key }),
            ));
        }
        let store = AuthorityStore::open(&db_path)?;
        let binding = Self {
            store,
            principal,
            session_id: session_id.to_string(),
            owner_token: token,
            authority_epoch: epoch.unwrap_or_default(),
        };
        binding.store.assert_owner(
            &binding.principal,
            &binding.session_id,
            &binding.owner_token,
            Some(binding.authority_epoch),
        )?;
        Ok(Some(binding))
    }

    pub fn implementation(&self) -> &'static str {
        "rust_sqlite"
    }
    pub fn activate(&mut self, now: &str, pid: Option<i64>) -> Result<Value, AuthorityError> {
        self.store.update_owned(
            &self.principal,
            &self.session_id,
            &self.owner_token,
            self.authority_epoch,
            states::ACTIVE,
            now,
            pid,
            None,
            None,
        )
    }
    pub fn heartbeat(&mut self, now: &str, pid: Option<i64>) -> Result<Value, AuthorityError> {
        self.store.update_owned(
            &self.principal,
            &self.session_id,
            &self.owner_token,
            self.authority_epoch,
            states::ACTIVE,
            now,
            pid,
            None,
            None,
        )
    }
    pub fn close(&mut self, now: &str, reason: &str) -> Result<Value, AuthorityError> {
        self.store.update_owned(
            &self.principal,
            &self.session_id,
            &self.owner_token,
            self.authority_epoch,
            states::CLOSED,
            now,
            None,
            Some(reason),
            None,
        )
    }
    pub fn fail(&mut self, now: &str, reason: &str) -> Result<Value, AuthorityError> {
        self.store.update_owned(
            &self.principal,
            &self.session_id,
            &self.owner_token,
            self.authority_epoch,
            states::FAILED,
            now,
            None,
            Some(reason),
            None,
        )
    }
}

pub fn default_db_path(site_root: impl AsRef<Path>) -> PathBuf {
    site_root
        .as_ref()
        .join(".ai")
        .join("runtime")
        .join("session-authority.sqlite")
}

/// The same conservative liveness predicate used by the TypeScript
/// reconciliation helpers.  Discovery projections may claim liveness only
/// from a fresh heartbeat/active display; a terminal or failed projection is
/// never considered live.
pub fn is_session_live(session: &Value) -> bool {
    if session.is_null() || session.get("terminal_state").and_then(Value::as_str) == Some("closed")
    {
        return false;
    }
    if matches!(
        session.get("health_status").and_then(Value::as_str),
        Some("unavailable" | "failed" | "closed")
    ) {
        return false;
    }
    if matches!(
        session.get("display_state").and_then(Value::as_str),
        Some("active" | "starting_or_degraded")
    ) {
        return true;
    }
    session.get("heartbeat_fresh").and_then(Value::as_bool) == Some(true)
}

pub fn build_session_authority_environment(admission: &Admission) -> Result<Value, AuthorityError> {
    if admission.status != "admitted" {
        return Err(AuthorityError::new(
            "session_authority_admission_required",
            "An admitted session authority record is required.",
            Value::Null,
        ));
    }
    Ok(json!({
        "NARADA_SESSION_AUTHORITY_REQUIRED": "1",
        "NARADA_SESSION_AUTHORITY_DB": admission.db_path,
        "NARADA_SESSION_AUTHORITY_TOKEN": admission.owner_token,
        "NARADA_SESSION_AUTHORITY_PRINCIPAL_KEY": admission.principal.principal_key,
        "NARADA_SESSION_AUTHORITY_SESSION_ID": admission.session_id,
        "NARADA_SESSION_AUTHORITY_EPOCH": admission.authority_epoch.to_string(),
    }))
}

pub fn find_legacy_session_conflicts(
    sessions: &[Value],
    principal: &SessionPrincipal,
    include_inactive: bool,
) -> Vec<Value> {
    sessions.iter().filter_map(|session| {
        let site = session.get("site_id").or_else(|| session.get("record").and_then(|v| v.get("site_id"))).and_then(Value::as_str)?;
        let candidate_id = session.get("agent_id").or_else(|| session.get("record").and_then(|v| v.get("agent_id"))).or_else(|| session.get("record").and_then(|v| v.get("identity"))).and_then(Value::as_str)?;
        let candidate = SessionPrincipal::normalize(site, candidate_id, None, &principal.authority_scope).ok()?;
        if candidate.site_id != principal.site_id
            || candidate.local_agent_id != principal.local_agent_id
            || (!include_inactive && !is_session_live(session))
        {
            return None;
        }
        let session_id = session.get("session_id").cloned().or_else(|| session.get("record").and_then(|v| v.get("session_id")).cloned()).unwrap_or(Value::Null);
        let attach = session_id.as_str().map(|id| {
            attach_handoff(
                id,
                principal,
                session.get("site_root").and_then(Value::as_str),
                session
                    .get("operator_surface_kind")
                    .and_then(Value::as_str)
                    .unwrap_or("agent-cli"),
            )
        });
        Some(json!({
            "session_id": session_id,
            "site_id": site,
            "agent_id": candidate_id,
            "display_state": session.get("display_state"),
            "health_status": session.get("health_status"),
            "heartbeat_fresh": session.get("heartbeat_fresh").cloned().unwrap_or_else(|| json!(false)),
            "started_at": session.get("started_at").or_else(|| session.get("record").and_then(|v| v.get("started_at"))),
            "terminal_state": session.get("terminal_state").or_else(|| session.get("record").and_then(|v| v.get("terminal_state"))),
            "attach": attach,
        }))
    }).collect()
}

fn prepare_schema(connection: &Connection) -> Result<(), AuthorityError> {
    connection.execute_batch("PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000; CREATE TABLE IF NOT EXISTS session_authority (principal_key TEXT PRIMARY KEY, authority_scope TEXT NOT NULL, site_id TEXT NOT NULL, local_agent_id TEXT NOT NULL, state TEXT NOT NULL, session_id TEXT, launch_session_id TEXT, runtime_kind TEXT NOT NULL, operator_surface_kind TEXT NOT NULL, authority_host TEXT NOT NULL, authority_epoch INTEGER NOT NULL, owner_token TEXT NOT NULL, pid INTEGER, started_at TEXT NOT NULL, activated_at TEXT, last_heartbeat_at TEXT, lease_expires_at TEXT, closed_at TEXT, terminal_reason TEXT, attach_json TEXT, evidence_json TEXT NOT NULL DEFAULT '{}', updated_at TEXT NOT NULL); CREATE INDEX IF NOT EXISTS session_authority_session_idx ON session_authority(session_id); CREATE TABLE IF NOT EXISTS session_authority_events (event_id INTEGER PRIMARY KEY AUTOINCREMENT, principal_key TEXT NOT NULL, event TEXT NOT NULL, session_id TEXT, state TEXT, occurred_at TEXT NOT NULL, details_json TEXT); CREATE TABLE IF NOT EXISTS session_authority_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);") .map_err(sql_error("session_authority_schema_failed"))?;
    connection.execute("INSERT INTO session_authority_meta(key,value) VALUES('schema',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value", params![SESSION_AUTHORITY_SCHEMA]).map_err(sql_error("session_authority_meta_failed"))?;
    Ok(())
}

fn required_string(value: &str, name: &str) -> Result<String, AuthorityError> {
    let value = value.trim();
    if value.is_empty() {
        Err(AuthorityError::required(name))
    } else {
        Ok(value.to_string())
    }
}

fn is_active_state(state: &str) -> bool {
    matches!(state, states::STARTING | states::ACTIVE | states::STOPPING)
}
fn lease_expired(record: &AuthorityRecord, at: &str) -> bool {
    match (
        record
            .lease_expires_at
            .as_deref()
            .and_then(parse_iso_millis),
        parse_iso_millis(at),
    ) {
        (Some(expiry), Some(evaluated)) => expiry <= evaluated,
        _ => false,
    }
}

fn attach_handoff(
    session_id: &str,
    principal: &SessionPrincipal,
    site_root: Option<&str>,
    surface: &str,
) -> Value {
    let site_arg = site_root
        .map(|root| format!(" --site-root \"{root}\""))
        .unwrap_or_default();
    json!({
        "session_id": session_id,
        "principal_key": principal.principal_key,
        "command": format!("narada nars attach-command --session {session_id} --agent {} --surface {surface}{site_arg}", principal.local_agent_id),
        "web_ui_command": format!("narada agent-web-ui attach --session {session_id}{site_arg}"),
    })
}

fn conflict_decision_evidence(
    record: &AuthorityRecord,
    evaluated_at: &str,
    process_alive: bool,
) -> Value {
    let evaluated_at_ms = parse_iso_millis(evaluated_at);
    let lease_expires_at_ms = record
        .lease_expires_at
        .as_deref()
        .and_then(parse_iso_millis);
    let last_heartbeat_at_ms = record
        .last_heartbeat_at
        .as_deref()
        .and_then(parse_iso_millis);
    let lease_status = match (lease_expires_at_ms, evaluated_at_ms) {
        (Some(expires), Some(evaluated)) if expires <= evaluated => "expired",
        (Some(_), Some(_)) => "fresh",
        _ => "unknown",
    };
    let process_status = match record.pid {
        Some(_) if process_alive => "alive",
        Some(_) => "absent",
        None => "not_observed",
    };
    let reclaim_eligible = lease_status == "expired" && process_status != "alive";
    let mut blockers = Vec::new();
    if lease_status != "expired" {
        blockers.push(format!("lease_{lease_status}"));
    }
    if process_status == "alive" {
        blockers.push("process_alive".to_string());
    }
    let remaining_ms = match (lease_expires_at_ms, evaluated_at_ms) {
        (Some(expires), Some(evaluated)) => Some((expires - evaluated).max(0)),
        _ => None,
    };
    let heartbeat_age_ms = match (evaluated_at_ms, last_heartbeat_at_ms) {
        (Some(evaluated), Some(last)) => Some((evaluated - last).max(0)),
        _ => None,
    };
    json!({
        "schema": "narada.nars.session_authority_decision_evidence.v1",
        "evaluated_at": evaluated_at,
        "governing_rule": "reclaim_when_lease_expired_and_no_live_process_is_observed",
        "existing_owner": {
            "session_id": record.session_id,
            "launch_session_id": record.launch_session_id,
            "authority_epoch": record.authority_epoch,
            "state": record.state,
            "runtime_kind": record.runtime_kind,
            "operator_surface_kind": record.operator_surface_kind,
            "pid": record.pid,
            "started_at": record.started_at,
            "activated_at": record.activated_at,
            "updated_at": record.updated_at,
        },
        "observations": {
            "process": { "pid": record.pid, "status": process_status },
            "lease": {
                "status": lease_status,
                "expires_at": record.lease_expires_at,
                "remaining_ms": remaining_ms,
            },
            "heartbeat": {
                "last_at": record.last_heartbeat_at,
                "age_ms": heartbeat_age_ms,
            },
            "health": {
                "status": "not_consulted",
                "reason": "runtime_health_is_not_an_authority_admission_input",
            },
        },
        "reclamation": {
            "evaluated": true,
            "eligible": reclaim_eligible,
            "blockers": blockers,
        },
        "outcome": "refused_existing_owner",
    })
}

fn conflict_error(
    record: &AuthorityRecord,
    principal: &SessionPrincipal,
    site_root: Option<&str>,
    operator_surface_kind: &str,
    evaluated_at: &str,
    process_alive: bool,
    code: &str,
) -> AuthorityError {
    json_error(
        code,
        format!(
            "The principal {} already has a {} NARS session.",
            principal.principal_key, record.state
        ),
        json!({
            "schema": "narada.nars.session_authority_refusal.v1",
            "reason_code": code,
            "principal": principal.to_value(),
            "session_id": record.session_id,
            "authority_epoch": record.authority_epoch,
            "state": record.state,
            "decision_evidence": conflict_decision_evidence(record, evaluated_at, process_alive),
            "attach": attach_handoff(
                record.session_id.as_deref().unwrap_or_default(),
                principal,
                site_root,
                operator_surface_kind,
            ),
            "required_next_step": "Attach to the existing session or reconcile it explicitly before starting another session.",
        }),
    )
}

fn json_error(code: &str, message: impl Into<String>, details: Value) -> AuthorityError {
    AuthorityError::new(code, message, details)
}

fn parse_json(value: &str) -> Option<Value> {
    serde_json::from_str(value).ok()
}
fn json_string(value: &Value) -> String {
    serde_json::to_string(value).unwrap_or_else(|_| "{}".to_string())
}
fn merge_json(left: Value, right: Value) -> Value {
    match (left, right) {
        (Value::Object(mut left), Value::Object(right)) => {
            for (key, value) in right {
                left.insert(key, value);
            }
            Value::Object(left)
        }
        (_, right) => right,
    }
}

fn sql_error(prefix: &'static str) -> impl Fn(rusqlite::Error) -> AuthorityError {
    move |error| AuthorityError::new(prefix, error.to_string(), Value::Null)
}

fn add_millis(now: &str, millis: i64) -> String {
    // All callers use canonical UTC ISO strings.  Keep the lease arithmetic
    // dependency-free; for malformed test input, fall back to the current
    // wall clock so an invalid lease cannot silently become infinite.
    let parsed = parse_iso_millis(now);
    let value = parsed
        .unwrap_or_else(current_epoch_millis)
        .saturating_add(millis.max(0));
    iso_from_epoch_millis(value)
}

fn current_epoch_millis() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64
}

fn parse_iso_millis(value: &str) -> Option<i64> {
    let bytes = value.as_bytes();
    if bytes.len() < 20
        || bytes.get(4) != Some(&b'-')
        || bytes.get(7) != Some(&b'-')
        || bytes.get(10) != Some(&b'T')
        || bytes.get(13) != Some(&b':')
        || bytes.get(16) != Some(&b':')
    {
        return None;
    }
    let millis = if bytes.len() == 20 && bytes.get(19) == Some(&b'Z') {
        0
    } else if bytes.len() == 24 && bytes.get(19) == Some(&b'.') && bytes.get(23) == Some(&b'Z') {
        value.get(20..23)?.parse().ok()?
    } else {
        return None;
    };
    let year: i64 = value.get(0..4)?.parse().ok()?;
    let month: i64 = value.get(5..7)?.parse().ok()?;
    let day: i64 = value.get(8..10)?.parse().ok()?;
    let hour: i64 = value.get(11..13)?.parse().ok()?;
    let minute: i64 = value.get(14..16)?.parse().ok()?;
    let second: i64 = value.get(17..19)?.parse().ok()?;
    let days = days_from_civil(year, month, day);
    Some(((days * 86_400 + hour * 3_600 + minute * 60 + second) * 1_000) + millis)
}

fn iso_from_epoch_millis(value: i64) -> String {
    let seconds = value.div_euclid(1_000);
    let millis = value.rem_euclid(1_000);
    let days = seconds.div_euclid(86_400);
    let sod = seconds.rem_euclid(86_400);
    let (year, month, day) = civil_from_days(days);
    format!(
        "{year:04}-{month:02}-{day:02}T{:02}:{:02}:{:02}.{millis:03}Z",
        sod / 3_600,
        (sod % 3_600) / 60,
        sod % 60
    )
}

fn days_from_civil(year: i64, month: i64, day: i64) -> i64 {
    let y = year - if month <= 2 { 1 } else { 0 };
    let era = (if y >= 0 { y } else { y - 399 }).div_euclid(400);
    let yoe = y - era * 400;
    let mp = month + if month > 2 { -3 } else { 9 };
    let doy = (153 * mp + 2).div_euclid(5) + day - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    era * 146097 + doe - 719468
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

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[test]
    fn authority_admission_fences_and_closes_owner() {
        let root =
            std::env::temp_dir().join(format!("narada-authority-{}", Uuid::new_v4().simple()));
        fs::create_dir_all(&root).unwrap();
        let path = root.join("authority.sqlite");
        let principal = SessionPrincipal::normalize("sonar", "resident", None, "local").unwrap();
        let mut store = AuthorityStore::open(&path).unwrap();
        let admission = store
            .admit(AdmitRequest {
                principal: principal.clone(),
                session_id: "s1".into(),
                launch_session_id: None,
                runtime_kind: "narada-agent-runtime-server".into(),
                operator_surface_kind: "agent-cli".into(),
                authority_host: "local".into(),
                site_root: Some(root.to_string_lossy().to_string()),
                lease_ms: 30_000,
                now: "2026-08-07T00:00:00.000Z".into(),
                pid: None,
                evidence: json!({}),
                replace_abandoned: false,
                process_alive: false,
                recovery_reason: "test".into(),
            })
            .unwrap();
        assert_eq!(
            store.inspect(&principal).unwrap().unwrap()["state"],
            "starting"
        );
        store
            .update_owned(
                &principal,
                "s1",
                &admission.owner_token,
                admission.authority_epoch,
                states::ACTIVE,
                "2026-08-07T00:00:01.000Z",
                None,
                None,
                None,
            )
            .unwrap();
        assert!(store
            .assert_owner(&principal, "s1", "wrong", Some(admission.authority_epoch))
            .is_err());
        store
            .update_owned(
                &principal,
                "s1",
                &admission.owner_token,
                admission.authority_epoch,
                states::CLOSED,
                "2026-08-07T00:00:02.000Z",
                None,
                Some("test"),
                None,
            )
            .unwrap();
        assert_eq!(
            store.inspect(&principal).unwrap().unwrap()["state"],
            "closed"
        );
        let _ = fs::remove_dir_all(root);
    }

    fn admission_request(
        root: &std::path::Path,
        principal: &SessionPrincipal,
        session_id: &str,
        now: &str,
    ) -> AdmitRequest {
        AdmitRequest {
            principal: principal.clone(),
            session_id: session_id.to_string(),
            launch_session_id: Some(format!("launch_{session_id}")),
            runtime_kind: "narada-agent-runtime-server".to_string(),
            operator_surface_kind: "agent-cli".to_string(),
            authority_host: "local".to_string(),
            site_root: Some(root.to_string_lossy().to_string()),
            lease_ms: 30_000,
            now: now.to_string(),
            pid: Some(49_152),
            evidence: json!({}),
            replace_abandoned: false,
            process_alive: false,
            recovery_reason: "test".to_string(),
        }
    }

    #[test]
    fn conflict_evidence_matches_the_authority_contract() {
        let root =
            std::env::temp_dir().join(format!("narada-authority-{}", Uuid::new_v4().simple()));
        fs::create_dir_all(&root).unwrap();
        let path = root.join("authority.sqlite");
        let principal = SessionPrincipal::normalize("sonar", "resident", None, "local").unwrap();
        let mut store = AuthorityStore::open(&path).unwrap();
        store
            .admit(admission_request(
                &root,
                &principal,
                "carrier_one",
                "2026-01-01T00:00:00.000Z",
            ))
            .unwrap();
        let mut request =
            admission_request(&root, &principal, "carrier_two", "2026-01-01T00:00:01.000Z");
        request.process_alive = true;
        let error = store.admit(request).unwrap_err();
        assert_eq!(error.code, refusal_codes::STARTING);
        assert_eq!(
            error.details["decision_evidence"],
            json!({
                "schema": "narada.nars.session_authority_decision_evidence.v1",
                "evaluated_at": "2026-01-01T00:00:01.000Z",
                "governing_rule": "reclaim_when_lease_expired_and_no_live_process_is_observed",
                "existing_owner": {
                    "session_id": "carrier_one",
                    "launch_session_id": "launch_carrier_one",
                    "authority_epoch": 1,
                    "state": "starting",
                    "runtime_kind": "narada-agent-runtime-server",
                    "operator_surface_kind": "agent-cli",
                    "pid": 49_152,
                    "started_at": "2026-01-01T00:00:00.000Z",
                    "activated_at": null,
                    "updated_at": "2026-01-01T00:00:00.000Z",
                },
                "observations": {
                    "process": { "pid": 49_152, "status": "alive" },
                    "lease": {
                        "status": "fresh",
                        "expires_at": "2026-01-01T00:00:30.000Z",
                        "remaining_ms": 29_000,
                    },
                    "heartbeat": {
                        "last_at": "2026-01-01T00:00:00.000Z",
                        "age_ms": 1_000,
                    },
                    "health": {
                        "status": "not_consulted",
                        "reason": "runtime_health_is_not_an_authority_admission_input",
                    },
                },
                "reclamation": {
                    "evaluated": true,
                    "eligible": false,
                    "blockers": ["lease_fresh", "process_alive"],
                },
                "outcome": "refused_existing_owner",
            })
        );
        assert!(error.details["decision_evidence"]["existing_owner"]
            .get("owner_token")
            .is_none());
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn replacement_reclaim_and_epoch_fencing_are_durable() {
        let root =
            std::env::temp_dir().join(format!("narada-authority-{}", Uuid::new_v4().simple()));
        fs::create_dir_all(&root).unwrap();
        let path = root.join("authority.sqlite");
        let principal = SessionPrincipal::normalize("sonar", "resident", None, "local").unwrap();
        let mut store = AuthorityStore::open(&path).unwrap();
        let mut first_request =
            admission_request(&root, &principal, "carrier_one", "2026-01-01T00:00:00.000Z");
        first_request.lease_ms = 1;
        let first = store.admit(first_request).unwrap();
        let reclaimed = store
            .reclaim(&principal, "2026-01-01T00:01:00.000Z", false)
            .unwrap();
        assert_eq!(reclaimed["status"], "reclaimed");

        let mut replacement_request =
            admission_request(&root, &principal, "carrier_two", "2026-01-01T00:02:00.000Z");
        replacement_request.process_alive = false;
        let replacement = store.admit(replacement_request).unwrap();
        assert_eq!(replacement.authority_epoch, first.authority_epoch + 1);
        assert_eq!(replacement.session_id, "carrier_two");

        let wrong_token = store.assert_owner(
            &principal,
            "carrier_two",
            "wrong",
            Some(replacement.authority_epoch),
        );
        assert_eq!(wrong_token.unwrap_err().code, refusal_codes::FENCED);
        let wrong_epoch = store.assert_owner(
            &principal,
            "carrier_two",
            &replacement.owner_token,
            Some(replacement.authority_epoch - 1),
        );
        assert_eq!(wrong_epoch.unwrap_err().code, refusal_codes::FENCED);

        let event_count: i64 = store
            .connection
            .query_row(
                "SELECT COUNT(*) FROM session_authority_events WHERE principal_key = ?",
                params![principal.principal_key],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(event_count, 3);
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn liveness_and_legacy_conflicts_match_projection_rules() {
        assert!(!is_session_live(&json!({
            "display_state": "starting_or_degraded",
            "heartbeat_fresh": true,
            "health_status": "unavailable",
        })));
        assert!(is_session_live(&json!({
            "display_state": "active",
            "heartbeat_fresh": false,
            "health_status": "healthy",
        })));

        let principal = SessionPrincipal::normalize("sonar", "resident", None, "local").unwrap();
        let conflicts = find_legacy_session_conflicts(
            &[
                json!({
                    "session_id": "carrier_old",
                    "site_id": "site:sonar",
                    "agent_id": "sonar.resident",
                    "display_state": "active",
                    "site_root": "C:/site",
                }),
                json!({
                    "session_id": "other_site",
                    "site_id": "other",
                    "agent_id": "resident",
                    "display_state": "active",
                }),
                json!({
                    "session_id": "carrier_history",
                    "site_id": "sonar",
                    "agent_id": "resident",
                    "display_state": "historical",
                }),
            ],
            &principal,
            false,
        );
        assert_eq!(conflicts.len(), 1);
        assert_eq!(conflicts[0]["session_id"], "carrier_old");
        assert_eq!(
            conflicts[0]["attach"]["command"],
            "narada nars attach-command --session carrier_old --agent resident --surface agent-cli --site-root \"C:/site\""
        );

        let root = std::env::temp_dir().join(format!(
            "narada-authority-reconcile-{}",
            Uuid::new_v4().simple()
        ));
        fs::create_dir_all(&root).unwrap();
        let store = AuthorityStore::open(root.join("authority.sqlite")).unwrap();
        let reconciliation = store
            .reconcile_session(
                &principal,
                "carrier_old",
                &[json!({
                    "session_id": "carrier_old",
                    "site_id": "sonar",
                    "agent_id": "resident",
                    "display_state": "historical",
                })],
                "2026-01-01T00:00:00.000Z",
            )
            .unwrap();
        assert_eq!(reconciliation["status"], "ready");
        assert_eq!(reconciliation["mutation_performed"], false);
        let missing = store
            .reconcile_session(
                &principal,
                "missing",
                &[json!({
                    "session_id": "carrier_old",
                    "site_id": "sonar",
                    "agent_id": "resident",
                })],
                "2026-01-01T00:00:00.000Z",
            )
            .unwrap_err();
        assert_eq!(missing.code, refusal_codes::KEEP_SESSION_NOT_FOUND);
        let _ = fs::remove_dir_all(root);
    }
}
