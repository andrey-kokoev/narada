use narada_nars_session_authority::AuthorityBinding;
use narada_nars_session_core::{
    session_index, supervisor::SessionSupervisor, CoreError, NarsProviderAdapter, ProviderOutcome,
    SessionCore, SessionCoreConfig,
};
use serde_json::{json, Map, Value};
use std::env;
use std::fs::{self, File, OpenOptions};
use std::io::{BufRead, Write};
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};
use uuid::Uuid;

#[derive(Debug, Clone)]
pub struct NativeRuntimeConfig {
    pub identity: String,
    pub session_id: String,
    pub site_root: Option<PathBuf>,
    pub mcp_scope: String,
}

impl NativeRuntimeConfig {
    pub fn from_args(args: &[String]) -> Result<Self, String> {
        let mut identity =
            env::var("NARADA_AGENT_ID").unwrap_or_else(|_| "narada-native".to_string());
        let mut session_id = env::var("NARADA_NARS_SESSION_ID")
            .or_else(|_| env::var("NARADA_RUNTIME_SESSION_ID"))
            .or_else(|_| env::var("NARADA_CARRIER_SESSION_ID"))
            .unwrap_or_default();
        let mut site_root = env::var("NARADA_SITE_ROOT").ok().map(PathBuf::from);
        let mut index = 0;
        while index < args.len() {
            match args[index].as_str() {
                "--identity" => {
                    index += 1;
                    identity = args
                        .get(index)
                        .cloned()
                        .ok_or_else(|| "identity_required".to_string())?;
                }
                "--session" => {
                    index += 1;
                    session_id = args
                        .get(index)
                        .cloned()
                        .ok_or_else(|| "session_required".to_string())?;
                }
                "--site-root" => {
                    index += 1;
                    site_root = Some(PathBuf::from(
                        args.get(index)
                            .cloned()
                            .ok_or_else(|| "site_root_required".to_string())?,
                    ));
                }
                value if value.starts_with("--identity=") => identity = value[11..].to_string(),
                value if value.starts_with("--session=") => session_id = value[10..].to_string(),
                value if value.starts_with("--site-root=") => {
                    site_root = Some(PathBuf::from(value[12..].to_string()))
                }
                _ => {}
            }
            index += 1;
        }
        let identity = identity.trim().to_string();
        let session_id = session_id.trim().to_string();
        if identity.is_empty() {
            return Err("identity_required".to_string());
        }
        if session_id.is_empty() {
            return Err("session_required".to_string());
        }
        Ok(Self {
            identity,
            session_id,
            site_root,
            mcp_scope: normalize_mcp_scope(env::var("NARADA_MCP_SCOPE").ok().as_deref()),
        })
    }
}

fn normalize_mcp_scope(value: Option<&str>) -> String {
    let value = value.unwrap_or("none").trim().to_ascii_lowercase();
    if matches!(
        value.as_str(),
        "all" | "host" | "user-site" | "local-site" | "site"
    ) {
        value
    } else {
        "none".to_string()
    }
}

fn session_directory(site_root: Option<&Path>, session_id: &str) -> Option<PathBuf> {
    site_root.map(|root| {
        let narada = if root.file_name().and_then(|name| name.to_str()) == Some(".narada") {
            root.to_path_buf()
        } else {
            root.join(".narada")
        };
        narada.join("crew").join("nars-sessions").join(session_id)
    })
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

fn new_id(prefix: &str) -> String {
    format!("{prefix}_{}", Uuid::new_v4().simple())
}
fn string_value(value: Option<&Value>) -> Option<String> {
    value.and_then(|value| match value {
        Value::String(value) if !value.trim().is_empty() => Some(value.trim().to_string()),
        Value::Number(value) => Some(value.to_string()),
        _ => None,
    })
}
fn request_id(request: &Value) -> Option<String> {
    request.as_object().and_then(|object| {
        object
            .get("id")
            .or_else(|| object.get("request_id"))
            .and_then(|value| string_value(Some(value)))
    })
}
fn request_method(request: &Value) -> Option<String> {
    request
        .as_object()
        .and_then(|object| string_value(object.get("method")))
}

fn request_params(request: &Value) -> Option<&Map<String, Value>> {
    request.get("params").and_then(Value::as_object)
}

fn request_content(request: &Value) -> Option<String> {
    let object = request.as_object()?;
    let params = request_params(request);
    object
        .get("content")
        .or_else(|| params.and_then(|params| params.get("content")))
        .or_else(|| params.and_then(|params| params.get("message")))
        .and_then(|value| match value {
            Value::String(value) => Some(value.clone()),
            Value::Array(parts) => Some(
                parts
                    .iter()
                    .filter_map(|part| {
                        part.as_str().map(ToOwned::to_owned).or_else(|| {
                            part.as_object()
                                .and_then(|object| object.get("text"))
                                .and_then(Value::as_str)
                                .map(ToOwned::to_owned)
                        })
                    })
                    .collect::<Vec<_>>()
                    .join("\n"),
            ),
            _ => None,
        })
}

fn map_event(event: &str) -> Map<String, Value> {
    let mut object = Map::new();
    object.insert("event".to_string(), json!(event));
    object
}
fn put(object: &mut Map<String, Value>, key: &str, value: impl Into<Value>) {
    object.insert(key.to_string(), value.into());
}
fn core_error(error: CoreError) -> String {
    error.0
}

fn subscription_page_size(value: Option<&Value>) -> Result<usize, String> {
    let Some(value) = value else {
        return Ok(100);
    };
    if value.is_null() {
        return Ok(100);
    }
    let parsed = match value {
        Value::Number(number) => number.as_f64(),
        Value::String(value) => {
            let value = value.trim();
            if value.is_empty() {
                Some(0.0)
            } else if let Some(hex) = value
                .strip_prefix("0x")
                .or_else(|| value.strip_prefix("0X"))
            {
                u64::from_str_radix(hex, 16)
                    .ok()
                    .map(|number| number as f64)
            } else {
                value.parse::<f64>().ok()
            }
        }
        _ => None,
    };
    let Some(parsed) = parsed else {
        return Err("invalid_session_event_page_size".to_string());
    };
    if !parsed.is_finite() || parsed < 0.0 || parsed.fract() != 0.0 {
        return Err("invalid_session_event_page_size".to_string());
    }
    Ok((parsed as usize).min(1000))
}

fn sequence_as_u64(value: &Value) -> Option<u64> {
    value
        .as_u64()
        .or_else(|| value.as_i64().and_then(|value| u64::try_from(value).ok()))
        .or_else(|| value.as_str().and_then(|value| value.parse::<u64>().ok()))
}

pub struct NativeRuntime {
    config: NativeRuntimeConfig,
    supervisor: SessionSupervisor,
    session_dir: Option<PathBuf>,
    heartbeat_path: Option<PathBuf>,
    authority: Option<AuthorityBinding>,
    closed: bool,
}

struct EnvironmentProviderAdapter {
    mode: String,
}

impl EnvironmentProviderAdapter {
    fn from_environment() -> Self {
        Self {
            mode: env::var("NARADA_NATIVE_PROVIDER_MODE")
                .unwrap_or_else(|_| "unavailable".to_string()),
        }
    }
}

impl NarsProviderAdapter for EnvironmentProviderAdapter {
    fn run_turn(&mut self, input: &Value) -> ProviderOutcome {
        let content = request_content(input).unwrap_or_default();
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

impl NativeRuntime {
    pub fn new(config: NativeRuntimeConfig) -> Result<Self, String> {
        let session_dir = session_directory(config.site_root.as_deref(), &config.session_id);
        let events_path = session_dir
            .as_ref()
            .map(|path| path.join("events.jsonl"))
            .unwrap_or_else(|| {
                env::temp_dir()
                    .join("narada-native")
                    .join(format!("{}.events.jsonl", config.session_id))
            });
        let heartbeat_path = session_dir.as_ref().map(|path| path.join("heartbeat.json"));
        let core = SessionCore::new(SessionCoreConfig {
            session_id: config.session_id.clone(),
            agent_id: config.identity.clone(),
            session_path: session_dir.as_ref().map(|path| path.join("session.jsonl")),
            events_path,
            site_root: config.site_root.clone(),
            max_event_buffer: 1000,
        })
        .map_err(core_error)?;
        let site_id = env::var("NARADA_SITE_ID").ok();
        let authority = AuthorityBinding::from_environment(
            &config.session_id,
            site_id.as_deref(),
            &config.identity,
        )
        .map_err(|error| error.to_string())?;
        let runtime = Self {
            config,
            supervisor: SessionSupervisor::new(core),
            session_dir,
            heartbeat_path,
            authority,
            closed: false,
        };
        runtime.write_session_projection(None)?;
        runtime.write_heartbeat("alive", "session_created")?;
        Ok(runtime)
    }

    pub fn startup(&mut self) -> Result<Vec<Value>, String> {
        let mut event = map_event("session_started");
        put(&mut event, "runtime", "narada-agent-runtime-server");
        put(&mut event, "runtime_engine_kind", "rust");
        put(
            &mut event,
            "runtime_contract",
            "nars_session_core_control.v1",
        );
        put(&mut event, "session_core_implementation", "rust_native");
        put(
            &mut event,
            "session_authority_implementation",
            self.authority
                .as_ref()
                .map(|authority| authority.implementation())
                .unwrap_or("not_bound"),
        );
        put(
            &mut event,
            "provider_adapter_kind",
            env::var("NARADA_NATIVE_PROVIDER_MODE").unwrap_or_else(|_| "unavailable".to_string()),
        );
        put(&mut event, "delegated_to_node", false);
        put(&mut event, "runtime_origin", "local");
        put(&mut event, "authority_runtime_host", "local");
        put(&mut event, "transport", "jsonl_stdio");
        put(
            &mut event,
            "site_root",
            self.config
                .site_root
                .as_ref()
                .map(|value| value.to_string_lossy().to_string()),
        );
        put(
            &mut event,
            "control_path",
            self.session_dir
                .as_ref()
                .map(|value| value.join("control.jsonl").to_string_lossy().to_string()),
        );
        put(
            &mut event,
            "session_path",
            self.session_dir
                .as_ref()
                .map(|value| value.join("session.jsonl").to_string_lossy().to_string()),
        );
        put(
            &mut event,
            "events_path",
            self.session_dir
                .as_ref()
                .map(|value| value.join("events.jsonl").to_string_lossy().to_string()),
        );
        put(&mut event, "mcp_scope", self.config.mcp_scope.clone());
        put(
            &mut event,
            "mcp_server_count",
            if self.config.mcp_scope == "none" {
                json!(0)
            } else {
                Value::Null
            },
        );
        put(
            &mut event,
            "mcp_operational_state",
            if self.config.mcp_scope == "none" {
                "disabled"
            } else {
                "starting"
            },
        );
        put(
            &mut event,
            "lifecycle_state",
            self.supervisor.core().lifecycle_state(),
        );
        let mut output = vec![self
            .supervisor
            .core_mut()
            .append_event(Value::Object(event))
            .map_err(core_error)?];
        output.extend(self.supervisor.start().map_err(core_error)?);
        if let Some(authority) = self.authority.as_mut() {
            authority
                .activate(&now_iso(), Some(std::process::id() as i64))
                .map_err(|error| error.to_string())?;
        }
        let mut adapter = EnvironmentProviderAdapter::from_environment();
        output.extend(
            self.supervisor
                .recover_with_adapter(&mut adapter)
                .map_err(core_error)?,
        );
        self.write_session_projection(Some(&output[0]))?;
        self.write_heartbeat("alive", "session_started")?;
        Ok(output)
    }

    pub fn handle(&mut self, request: Value) -> Result<Vec<Value>, String> {
        let method = request_method(&request)
            .or_else(|| request_content(&request).map(|_| "session.submit".to_string()));
        let request_id = request_id(&request);
        if let Some(authority) = self.authority.as_mut() {
            authority
                .heartbeat(&now_iso(), Some(std::process::id() as i64))
                .map_err(|error| error.to_string())?;
        }
        let result = match method.as_deref() {
            Some("session.health") => Ok(vec![self.health(request_id)]),
            Some("session.recovery") => Ok(vec![self.recovery(request_id)]),
            Some("session.events.read") => match self.events_read(request_id.clone(), &request) {
                Ok(value) => Ok(vec![value]),
                Err(error) => self.reject(request_id, Some("session.events.read"), &error),
            },
            Some("session.events.subscribe") => {
                match self.events_subscribe(request_id.clone(), &request) {
                    Ok(values) => Ok(values),
                    Err(error) => self.reject(request_id, Some("session.events.subscribe"), &error),
                }
            }
            Some("session.cancel") => self.cancel(request_id),
            Some("session.close") => self.close(request_id),
            Some("session.command.execute") => self.command(request_id, &request),
            Some("session.submit") => self.submit(request_id, &request),
            _ => self.reject(request_id, method.as_deref(), "unsupported_session_control"),
        };
        match result {
            Ok(mut values) => {
                values.extend(self.poll_subscription_events());
                Ok(values)
            }
            Err(error) => Err(error),
        }
    }

    fn health(&self, request_id: Option<String>) -> Value {
        let mut value = self
            .supervisor
            .core()
            .health(if self.config.mcp_scope == "none" {
                "disabled"
            } else {
                "degraded"
            });
        if let Some(object) = value.as_object_mut() {
            object.insert("request_id".to_string(), json!(request_id));
            object.insert("runtime".to_string(), json!("narada-agent-runtime-server"));
            object.insert("runtime_engine_kind".to_string(), json!("rust"));
            object.insert(
                "session_core_implementation".to_string(),
                json!("rust_native"),
            );
            object.insert(
                "session_authority_implementation".to_string(),
                json!(self
                    .authority
                    .as_ref()
                    .map(|authority| authority.implementation())
                    .unwrap_or("not_bound")),
            );
            object.insert("agent_id".to_string(), json!(self.config.identity));
            object.insert("mcp_scope".to_string(), json!(self.config.mcp_scope));
            object.insert("mcp".to_string(), json!({ "operational_state": if self.config.mcp_scope == "none" { "disabled" } else { "degraded" }, "server_count": if self.config.mcp_scope == "none" { json!(0) } else { Value::Null }, "startup_failure_count": 0, "runtime_fault_count": 0 }));
        }
        value
    }

    fn poll_subscription_events(&mut self) -> Vec<Value> {
        self.supervisor
            .core_mut()
            .poll_event_subscriptions()
            .into_iter()
            .map(|mut envelope| {
                if let Some(cursor) = envelope.get_mut("cursor").and_then(Value::as_object_mut) {
                    cursor.insert("namespace".to_string(), json!("durable"));
                }
                envelope
            })
            .collect()
    }

    fn recovery(&self, request_id: Option<String>) -> Value {
        let mut value = self.supervisor.recovery();
        if let Some(object) = value.as_object_mut() {
            object.insert("request_id".to_string(), json!(request_id));
            object.insert("runtime_engine_kind".to_string(), json!("rust"));
            object.insert(
                "session_core_implementation".to_string(),
                json!("rust_native"),
            );
            object.insert(
                "session_authority_implementation".to_string(),
                json!(self
                    .authority
                    .as_ref()
                    .map(|authority| authority.implementation())
                    .unwrap_or("not_bound")),
            );
        }
        value
    }

    fn events_read(&self, request_id: Option<String>, request: &Value) -> Result<Value, String> {
        let options = request.get("params").cloned().unwrap_or_else(|| json!({}));
        if !options.is_object() {
            return Err("invalid_session_event_params".to_string());
        }
        let page = self
            .supervisor
            .core()
            .events_page_contract(&options)
            .map_err(core_error)?;
        let mut response = page;
        if let Some(object) = response.as_object_mut() {
            object.insert("event".to_string(), json!("session_events_read"));
            object.insert("request_id".to_string(), json!(request_id));
            object.insert("transport".to_string(), json!("jsonl_stdio"));
        }
        Ok(response)
    }

    fn events_subscribe(
        &mut self,
        request_id: Option<String>,
        request: &Value,
    ) -> Result<Vec<Value>, String> {
        let params = request_params(request).cloned().unwrap_or_default();
        let requested_view = params
            .get("view")
            .and_then(|value| match value {
                Value::String(value) => Some(value.clone()),
                Value::Number(value) => Some(value.to_string()),
                Value::Bool(value) => Some(value.to_string()),
                _ => None,
            })
            .unwrap_or_else(|| "raw".to_string());
        let view = requested_view.trim().to_ascii_lowercase();
        if !matches!(
            view.as_str(),
            "conversation" | "operations" | "diagnostics" | "raw"
        ) {
            return Err(format!("invalid_nars_session_event_view:{requested_view}"));
        }
        let page_size = subscription_page_size(
            params
                .get("page_size")
                .or_else(|| params.get("max_replay"))
                .or_else(|| params.get("limit")),
        )?;
        if let Some(include_replay) = params.get("include_replay") {
            if !include_replay.is_boolean() {
                return Err("invalid_session_event_include_replay".to_string());
            }
        }
        if let Some(filters) = params.get("filters") {
            if !filters.is_object() {
                return Err("invalid_session_event_filters".to_string());
            }
        }
        let subscription_id = match params.get("subscription_id") {
            Some(Value::String(value)) if !value.trim().is_empty() => value.clone(),
            Some(_) => return Err("invalid_session_event_subscription_id".to_string()),
            None => "runtime-jsonl".to_string(),
        };
        let include_replay = params
            .get("include_replay")
            .and_then(Value::as_bool)
            .unwrap_or(true);
        let mut filters = params
            .get("filters")
            .and_then(Value::as_object)
            .cloned()
            .unwrap_or_default();
        filters.insert("view".to_string(), json!(view));
        self.supervisor
            .core_mut()
            .subscribe_events(Some(&subscription_id), Value::Object(filters.clone()));
        if include_replay {
            self.supervisor
                .core_mut()
                .begin_event_replay(&subscription_id, json!({ "source": "event_log" }))
                .map_err(core_error)?;
        } else {
            self.supervisor
                .core_mut()
                .mark_event_subscription_live(
                    &subscription_id,
                    json!({ "source": "subscription_without_replay" }),
                )
                .map_err(core_error)?;
        }
        let mut replay = Vec::new();
        let mut replay_count = 0usize;
        let mut event_count = 0usize;
        let mut has_more = false;
        let cursor = if include_replay {
            let mut options = Map::new();
            options.insert("view".to_string(), json!(view));
            options.insert("filters".to_string(), Value::Object(filters.clone()));
            options.insert("limit".to_string(), json!(page_size));
            options.insert(
                "direction".to_string(),
                json!(if params.get("since_sequence").is_some()
                    || params.get("since_timestamp").is_some()
                {
                    "forward"
                } else {
                    "backward"
                }),
            );
            if let Some(value) = params.get("since_sequence") {
                options.insert("after_sequence".to_string(), value.clone());
            }
            if let Some(value) = params.get("since_timestamp") {
                options.insert("since_timestamp".to_string(), value.clone());
            }
            let page = self
                .supervisor
                .core()
                .events_page_contract(&Value::Object(options))
                .map_err(core_error)?;
            replay = page
                .get("events")
                .and_then(Value::as_array)
                .cloned()
                .unwrap_or_default();
            replay_count = replay.len();
            event_count = page
                .get("event_count")
                .and_then(Value::as_u64)
                .unwrap_or(replay_count as u64) as usize;
            has_more = page
                .get("has_more")
                .and_then(Value::as_bool)
                .unwrap_or(false);
            let mut durable = page.get("cursor").cloned().unwrap_or_else(|| json!({}));
            if let Some(object) = durable.as_object_mut() {
                object.insert("namespace".to_string(), json!("durable"));
            }
            durable
        } else {
            json!({ "namespace": "durable", "last_sequence": Value::Null, "next_sequence": 1 })
        };
        let mut output = vec![json!({
            "schema": "narada.nars.events.subscription.v1",
            "event": "session_events_subscription_started",
            "request_id": request_id,
            "subscription_id": subscription_id,
            "transport": "jsonl_stdio",
            "view": view,
            "page_size": page_size,
            "replay_count": replay_count,
            "event_count": event_count,
            "has_more": has_more,
            "replay_source": if include_replay { "event_log" } else { "memory_event_hub" },
            "cursor": cursor,
            "filters": filters,
        })];
        for event in &replay {
            let sequence = event
                .get("event_sequence")
                .or_else(|| event.get("sequence"))
                .cloned()
                .unwrap_or(Value::Null);
            let next_sequence = sequence_as_u64(&sequence)
                .map(|sequence| json!(sequence.saturating_add(1)))
                .unwrap_or(Value::Null);
            output.push(json!({
                "schema": "narada.nars.events.envelope.v1",
                "event": "session_event",
                "subscription_id": subscription_id,
                "cursor": { "namespace": "durable", "sequence": sequence, "next_sequence": next_sequence },
                "payload": event,
            }));
        }
        output.push(json!({
            "schema": "narada.nars.events.subscription.v1",
            "event": "session_events_replay_completed",
            "request_id": request_id,
            "subscription_id": subscription_id,
            "transport": "jsonl_stdio",
            "view": view,
            "replay_count": replay_count,
            "has_more": has_more,
            "cursor": cursor,
        }));
        if include_replay {
            let replay_last_sequence = replay
                .last()
                .and_then(|event| {
                    event
                        .get("event_sequence")
                        .or_else(|| event.get("sequence"))
                })
                .cloned()
                .unwrap_or(Value::Null);
            self.supervisor
                .core_mut()
                .mark_event_subscription_live(
                    &subscription_id,
                    json!({
                        "source": "replay_complete",
                        "replay_last_sequence": replay_last_sequence,
                    }),
                )
                .map_err(core_error)?;
        }
        Ok(output)
    }

    fn submit(
        &mut self,
        request_id: Option<String>,
        request: &Value,
    ) -> Result<Vec<Value>, String> {
        if self.closed {
            return self.reject(request_id, Some("session.submit"), "nars_session_closed");
        }
        let content = request_content(request)
            .filter(|value| !value.trim().is_empty())
            .ok_or_else(|| "content_required".to_string())?;
        let input_id = request_id.clone().unwrap_or_else(|| new_id("input"));
        let mut accepted = map_event("session_control_accepted");
        put(&mut accepted, "request_id", request_id.clone());
        put(&mut accepted, "method", "session.submit");
        put(&mut accepted, "acceptance_state", "accepted");
        put(&mut accepted, "transport", "jsonl_stdio");
        let accepted = self
            .supervisor
            .core_mut()
            .append_event(Value::Object(accepted))
            .map_err(core_error)?;
        let mut input = json!({ "event_id": input_id, "request_id": request_id, "content": content, "source": "manual_operator", "source_kind": "operator", "transport": "jsonl_stdio", "delivery_mode": "immediate" });
        if let Some(params) = request_params(request) {
            for key in [
                "idempotency_key",
                "hold_condition",
                "authority_ref",
                "directive_id",
                "metadata",
                "input_ref",
                "authority_posture",
            ] {
                if let Some(value) = params.get(key) {
                    input[key] = value.clone();
                }
            }
        }
        let mut adapter = EnvironmentProviderAdapter::from_environment();
        let mut output = vec![accepted];
        output.extend(
            self.supervisor
                .submit_with_adapter(input, &mut adapter)
                .map_err(core_error)?,
        );
        let terminal_state = output
            .iter()
            .rev()
            .find_map(|event| {
                event
                    .get("terminal_state")
                    .and_then(Value::as_str)
                    .or_else(|| event.get("terminal_status").and_then(Value::as_str))
            })
            .unwrap_or("blocked")
            .to_string();
        let mut response = map_event("session_control_response");
        put(&mut response, "request_id", request_id);
        put(&mut response, "method", "session.submit");
        put(&mut response, "terminal_state", terminal_state.clone());
        put(
            &mut response,
            "request_outcome",
            if terminal_state == "completed" {
                "completed"
            } else {
                "turn_blocked"
            },
        );
        output.push(
            self.supervisor
                .core_mut()
                .append_event(Value::Object(response))
                .map_err(core_error)?,
        );
        self.write_heartbeat("alive", "session_submit")?;
        self.write_session_projection(None)?;
        Ok(output)
    }

    fn command(
        &mut self,
        request_id: Option<String>,
        request: &Value,
    ) -> Result<Vec<Value>, String> {
        let command = request_params(request)
            .and_then(|params| params.get("command"))
            .and_then(Value::as_str)
            .unwrap_or_default()
            .trim()
            .to_string();
        if command.is_empty() {
            return self.reject(
                request_id,
                Some("session.command.execute"),
                "missing_session_command",
            );
        }
        let mut accepted = map_event("session_control_accepted");
        put(&mut accepted, "request_id", request_id.clone());
        put(&mut accepted, "method", "session.command.execute");
        put(&mut accepted, "command", command.clone());
        let mut result = vec![self
            .supervisor
            .core_mut()
            .append_event(Value::Object(accepted))
            .map_err(core_error)?];
        let mut command_result = map_event("command_result");
        put(&mut command_result, "request_id", request_id.clone());
        put(&mut command_result, "command", command.clone());
        put(
            &mut command_result,
            "command_name",
            command.trim_start_matches('/'),
        );
        put(&mut command_result, "status", "ok");
        put(
            &mut command_result,
            "summary",
            if command == "status" || command == "/status" {
                format!("session {}", self.supervisor.core().lifecycle_state())
            } else {
                format!("{command} is handled by native Rust")
            },
        );
        put(&mut command_result, "terminal_state", "completed");
        result.push(
            self.supervisor
                .core_mut()
                .append_event(Value::Object(command_result))
                .map_err(core_error)?,
        );
        let mut response = map_event("session_control_response");
        put(&mut response, "request_id", request_id);
        put(&mut response, "method", "session.command.execute");
        put(&mut response, "terminal_state", "completed");
        result.push(
            self.supervisor
                .core_mut()
                .append_event(Value::Object(response))
                .map_err(core_error)?,
        );
        Ok(result)
    }

    fn cancel(&mut self, request_id: Option<String>) -> Result<Vec<Value>, String> {
        let mut output = self
            .supervisor
            .cancel(json!({ "request_id": request_id.clone() }))
            .map_err(core_error)?;
        let cancelled = output
            .iter()
            .rev()
            .find(|event| event["event"] == "session_cancel")
            .and_then(|event| event.get("cancelled"))
            .cloned()
            .unwrap_or(Value::Bool(false));
        output.push(json!({
            "event": "session_cancel",
            "request_id": request_id,
            "cancelled": cancelled,
        }));
        Ok(output)
    }

    fn close(&mut self, request_id: Option<String>) -> Result<Vec<Value>, String> {
        if self.closed {
            return Ok(vec![
                json!({ "event": "session_closed", "request_id": request_id, "terminal_state": "closed" }),
            ]);
        }
        let mut output = Vec::new();
        let mut accepted = map_event("session_control_accepted");
        put(&mut accepted, "request_id", request_id.clone());
        put(&mut accepted, "method", "session.close");
        put(&mut accepted, "acceptance_state", "accepted");
        output.push(
            self.supervisor
                .core_mut()
                .append_event(Value::Object(accepted))
                .map_err(core_error)?,
        );
        let mut response = map_event("session_control_response");
        put(&mut response, "request_id", request_id.clone());
        put(&mut response, "method", "session.close");
        put(&mut response, "terminal_state", "completed");
        output.push(
            self.supervisor
                .core_mut()
                .append_event(Value::Object(response))
                .map_err(core_error)?,
        );
        output.extend(
            self.supervisor
                .close_with_evidence(
                    "control_request",
                    json!({ "request_id": request_id.clone() }),
                )
                .map_err(core_error)?,
        );
        self.closed = true;
        self.write_session_projection(None)?;
        self.write_heartbeat("stopped", "session_closed")?;
        if let Some(authority) = self.authority.as_mut() {
            authority
                .close(&now_iso(), "control_request")
                .map_err(|error| error.to_string())?;
        }
        Ok(output)
    }

    fn reject(
        &mut self,
        request_id: Option<String>,
        method: Option<&str>,
        error: &str,
    ) -> Result<Vec<Value>, String> {
        if self.closed {
            return Ok(vec![
                json!({ "event": "session_control_rejected", "request_id": request_id, "method": method, "code": error, "error": error }),
            ]);
        }
        let mut event = map_event("session_control_rejected");
        put(&mut event, "request_id", request_id);
        put(&mut event, "method", method);
        put(&mut event, "code", error);
        put(&mut event, "error", error);
        Ok(vec![self
            .supervisor
            .core_mut()
            .append_event(Value::Object(event))
            .map_err(core_error)?])
    }

    fn write_heartbeat(&self, status: &str, reason: &str) -> Result<(), String> {
        let Some(path) = self.heartbeat_path.as_ref() else {
            return Ok(());
        };
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent)
                .map_err(|error| format!("runtime_directory_create_failed:{error}"))?;
        }
        let temporary = path.with_extension(format!(
            "tmp-{}-{}",
            std::process::id(),
            Uuid::new_v4().simple()
        ));
        let mut file = File::create(&temporary)
            .map_err(|error| format!("runtime_heartbeat_open_failed:{error}"))?;
        serde_json::to_writer(&mut file, &json!({ "schema": "narada.nars.heartbeat.v1", "session_id": self.config.session_id, "agent_id": self.config.identity, "runtime": "narada-agent-runtime-server", "runtime_engine_kind": "rust", "pid": std::process::id(), "status": status, "heartbeat_at": now_iso(), "reason": reason })).map_err(|error| format!("runtime_heartbeat_encode_failed:{error}"))?;
        file.write_all(b"\n")
            .map_err(|error| format!("runtime_heartbeat_write_failed:{error}"))?;
        file.flush()
            .map_err(|error| format!("runtime_heartbeat_flush_failed:{error}"))?;
        drop(file);
        if path.exists() {
            fs::remove_file(path)
                .map_err(|error| format!("runtime_heartbeat_replace_failed:{error}"))?;
        }
        fs::rename(temporary, path)
            .map_err(|error| format!("runtime_heartbeat_rename_failed:{error}"))
    }

    fn write_session_projection(&self, session_started: Option<&Value>) -> Result<(), String> {
        let Some(directory) = self.session_dir.as_ref() else {
            return Ok(());
        };
        fs::create_dir_all(directory)
            .map_err(|error| format!("session_projection_directory_failed:{error}"))?;
        let session_path = directory.join("session.jsonl");
        let _ = OpenOptions::new()
            .create(true)
            .append(true)
            .open(&session_path)
            .map_err(|error| format!("session_projection_open_failed:{error}"))?;
        if let Some(started) = session_started {
            session_index::write_started(
                started,
                Some(&session_path),
                self.config.site_root.as_deref(),
            )
            .map_err(core_error)?;
        }
        if self.supervisor.core().lifecycle_state() == "closed" {
            session_index::mark_closed(
                Some(&session_path),
                "closed",
                Some("session_closed"),
                self.config.site_root.as_deref(),
            )
            .map_err(core_error)?;
        }
        Ok(())
    }
}

pub fn run(args: &[String]) -> Result<(), String> {
    let config = NativeRuntimeConfig::from_args(args)?;
    let mut runtime = NativeRuntime::new(config)?;
    let mut output = std::io::BufWriter::new(std::io::stdout().lock());
    for event in runtime.startup()? {
        serde_json::to_writer(&mut output, &event)
            .map_err(|error| format!("stdout_encode_failed:{error}"))?;
        output
            .write_all(b"\n")
            .map_err(|error| format!("stdout_write_failed:{error}"))?;
    }
    output
        .flush()
        .map_err(|error| format!("stdout_flush_failed:{error}"))?;
    for line in std::io::stdin().lock().lines() {
        let line = line.map_err(|error| format!("stdin_read_failed:{error}"))?;
        if line.trim().is_empty() {
            continue;
        }
        let request = match serde_json::from_str::<Value>(&line) {
            Ok(value) => value,
            Err(_) => {
                let mut event = map_event("session_control_rejected");
                put(&mut event, "code", "invalid_json");
                put(&mut event, "error", "invalid_json");
                Value::Object(event)
            }
        };
        let events =
            if request.get("event").and_then(Value::as_str) == Some("session_control_rejected") {
                runtime.reject(None, None, "invalid_json")?
            } else {
                runtime.handle(request)?
            };
        for event in events {
            serde_json::to_writer(&mut output, &event)
                .map_err(|error| format!("stdout_encode_failed:{error}"))?;
            output
                .write_all(b"\n")
                .map_err(|error| format!("stdout_write_failed:{error}"))?;
        }
        output
            .flush()
            .map_err(|error| format!("stdout_flush_failed:{error}"))?;
        if runtime.closed {
            break;
        }
    }
    if !runtime.closed {
        let _ = runtime.close(None)?;
    }
    output
        .flush()
        .map_err(|error| format!("stdout_flush_failed:{error}"))?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    fn test_runtime(root: &Path) -> NativeRuntime {
        NativeRuntime::new(NativeRuntimeConfig {
            identity: "native-test-agent".to_string(),
            session_id: "native-test-session".to_string(),
            site_root: Some(root.to_path_buf()),
            mcp_scope: "none".to_string(),
        })
        .unwrap()
    }

    #[test]
    fn event_read_and_subscription_replay_are_durable_protocol_surfaces() {
        let root =
            std::env::temp_dir().join(format!("narada-runtime-events-{}", Uuid::new_v4().simple()));
        fs::create_dir_all(&root).unwrap();
        let mut runtime = test_runtime(&root);
        runtime.startup().unwrap();
        runtime
            .supervisor
            .core_mut()
            .append_event(json!({
                "event": "user_message",
                "request_id": "request-1",
                "event_sequence": 3,
                "timestamp": "2026-01-01T00:00:03.000Z"
            }))
            .unwrap();
        runtime
            .supervisor
            .core_mut()
            .append_event(json!({
                "event": "session_health",
                "event_sequence": 4,
                "timestamp": "2026-01-01T00:00:04.000Z"
            }))
            .unwrap();

        let read = runtime
            .handle(json!({
                "id": "read-1",
                "method": "session.events.read",
                "params": { "view": "conversation", "limit": 1 }
            }))
            .unwrap();
        assert_eq!(read.len(), 1);
        assert_eq!(read[0]["event"], "session_events_read");
        assert_eq!(read[0]["request_id"], "read-1");
        assert_eq!(read[0]["view"], "conversation");
        assert_eq!(read[0]["events"][0]["event"], "user_message");

        let subscription = runtime
            .handle(json!({
                "id": "sub-1",
                "method": "session.events.subscribe",
                "params": { "view": "conversation", "page_size": 10 }
            }))
            .unwrap();
        assert_eq!(
            subscription[0]["event"],
            "session_events_subscription_started"
        );
        assert_eq!(subscription[0]["replay_count"], 1);
        assert_eq!(subscription[1]["event"], "session_event");
        assert_eq!(subscription[1]["payload"]["event"], "user_message");
        assert_eq!(subscription[2]["event"], "session_events_replay_completed");
        let live = runtime
            .handle(json!({
                "id": "command-1",
                "method": "session.command.execute",
                "params": { "command": "status" }
            }))
            .unwrap();
        assert!(live.iter().any(|event| {
            event["event"] == "session_event"
                && event["payload"]["event"] == "session_control_accepted"
                && event["cursor"]["namespace"] == "durable"
        }));
        let cancel = runtime
            .handle(json!({
                "id": "cancel-1",
                "method": "session.cancel",
                "params": {}
            }))
            .unwrap();
        assert!(cancel
            .iter()
            .any(|event| event["event"] == "session_cancel"));
        let durable = runtime
            .supervisor
            .core()
            .events_page_contract(&json!({ "view": "raw", "limit": 100 }))
            .unwrap();
        assert_eq!(
            durable["events"]
                .as_array()
                .unwrap()
                .iter()
                .filter(|event| event["event"] == "session_cancel")
                .count(),
            1
        );
        runtime.close(None).unwrap();
        let _ = fs::remove_dir_all(root);
    }
}
