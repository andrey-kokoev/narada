//! Rust-owned NARS session orchestration.
//!
//! `SessionCore` is the durable state machine.  This module owns the
//! supervisor semantics around it: start/recovery, FIFO submission, provider
//! turn context, cancellation, and shutdown.  Provider and MCP work remains
//! behind [`NarsProviderAdapter`].

use super::{CancellationToken, CoreError, NarsProviderAdapter, ProviderOutcome, SessionCore};
use serde_json::{json, Value};

type EventSink<'a> = dyn FnMut(Value) -> Result<(), CoreError> + 'a;

/// The native supervisor owns admission-to-turn orchestration while allowing
/// the carrier/provider implementation to remain an injected adapter.
pub struct SessionSupervisor {
    core: SessionCore,
    active_turn_id: Option<String>,
    active_cancellation: Option<CancellationToken>,
    cancel_requested: bool,
    recovery_mode: bool,
}

impl SessionSupervisor {
    pub fn new(core: SessionCore) -> Self {
        Self {
            core,
            active_turn_id: None,
            active_cancellation: None,
            cancel_requested: false,
            recovery_mode: false,
        }
    }

    pub fn core(&self) -> &SessionCore {
        &self.core
    }

    pub fn core_mut(&mut self) -> &mut SessionCore {
        &mut self.core
    }

    pub fn into_core(self) -> SessionCore {
        self.core
    }

    pub fn active_turn_id(&self) -> Option<&str> {
        self.active_turn_id
            .as_deref()
            .or_else(|| self.core.active_turn_id())
    }

    pub fn start(&mut self) -> Result<Vec<Value>, CoreError> {
        if self.core.lifecycle_state() == "starting" {
            self.core
                .transition_lifecycle("ready", json!({ "supervisor": "nars-session-core" }))
        } else {
            Ok(Vec::new())
        }
    }

    pub fn start_with_adapter(
        &mut self,
        adapter: &mut dyn NarsProviderAdapter,
    ) -> Result<Vec<Value>, CoreError> {
        let mut events = self.start()?;
        events.extend(self.recover_with_adapter(adapter)?);
        Ok(events)
    }

    /// Replay durable pending input synchronously in FIFO order.  A held head
    /// remains held; no later input is allowed to pass it.
    pub fn recover_with_adapter(
        &mut self,
        adapter: &mut dyn NarsProviderAdapter,
    ) -> Result<Vec<Value>, CoreError> {
        if self.core.lifecycle_state() != "ready" {
            return Ok(Vec::new());
        }
        self.recovery_mode = true;
        let result = self.recover_inner(adapter);
        self.recovery_mode = false;
        result
    }

    fn recover_inner(
        &mut self,
        adapter: &mut dyn NarsProviderAdapter,
    ) -> Result<Vec<Value>, CoreError> {
        let mut output = Vec::new();
        let mut remaining = self.core.pending_count().saturating_add(1);
        while self.core.pending_count() > 0 && remaining > 0 {
            let head = self
                .core
                .queue_items()
                .first()
                .cloned()
                .unwrap_or(Value::Null);
            if is_held(&head) {
                break;
            }
            let before = self.core.pending_count();
            let start_sequence = last_sequence(&self.core);
            let turn_id = head.get("event_id").and_then(Value::as_str);
            let attempt = self
                .core
                .begin_recovery_attempt(turn_id, Some("session_start_recovery"))?;
            let attempt_id = attempt
                .get("attempt_id")
                .and_then(Value::as_str)
                .map(ToOwned::to_owned)
                .unwrap_or_default();
            self.core.transition_recovery_attempt(
                &attempt_id,
                "claimed",
                Some("queue_item_claimed"),
                None,
            )?;
            self.core.transition_recovery_attempt(
                &attempt_id,
                "replaying",
                Some("carrier_replay_started"),
                None,
            )?;
            let cancellation = CancellationToken::new();
            self.active_turn_id = turn_id.map(ToOwned::to_owned);
            self.active_cancellation = Some(cancellation.clone());
            let mut sink = |_event: Value| -> Result<(), CoreError> { Ok(()) };
            let drain_result = self.core.drain_once_with_adapter_and_context(
                adapter,
                true,
                Some(&attempt_id),
                cancellation,
                &mut sink,
            );
            self.active_turn_id = None;
            self.active_cancellation = None;
            drain_result?;
            output.extend(self.core.events_after(start_sequence));
            let progressed = self.core.pending_count() < before;
            let terminal = turn_id.and_then(|id| self.core.turn(id)).and_then(|turn| {
                turn.get("terminal_state")
                    .and_then(Value::as_str)
                    .map(str::to_string)
            });
            if matches!(terminal.as_deref(), Some("failed" | "interrupted")) {
                let recovery_transition_start = last_sequence(&self.core);
                self.core.transition_recovery_attempt(
                    &attempt_id,
                    terminal.as_deref().unwrap_or("failed"),
                    Some("recovery_replay_terminal_failure"),
                    None,
                )?;
                output.extend(self.core.events_after(recovery_transition_start));
                break;
            } else if progressed {
                let recovery_transition_start = last_sequence(&self.core);
                self.core.transition_recovery_attempt(
                    &attempt_id,
                    "reconciled",
                    Some("carrier_replay_returned"),
                    None,
                )?;
                self.core.transition_recovery_attempt(
                    &attempt_id,
                    "completed",
                    Some("recovery_replay_completed"),
                    None,
                )?;
                output.extend(self.core.events_after(recovery_transition_start));
            } else {
                let recovery_transition_start = last_sequence(&self.core);
                self.core.transition_recovery_attempt(
                    &attempt_id,
                    "abandoned",
                    Some("queue_head_not_progressable"),
                    None,
                )?;
                output.extend(self.core.events_after(recovery_transition_start));
                break;
            }
            remaining = remaining.saturating_sub(1);
        }
        Ok(output)
    }

    pub fn submit_with_adapter(
        &mut self,
        input: Value,
        adapter: &mut dyn NarsProviderAdapter,
    ) -> Result<Vec<Value>, CoreError> {
        let mut sink = |_event: Value| -> Result<(), CoreError> { Ok(()) };
        self.submit_with_adapter_and_sink(input, adapter, &mut sink)
    }

    pub fn submit_with_adapter_and_sink(
        &mut self,
        input: Value,
        adapter: &mut dyn NarsProviderAdapter,
        event_sink: &mut EventSink<'_>,
    ) -> Result<Vec<Value>, CoreError> {
        if self.core.lifecycle_state() != "ready" {
            return Err(CoreError(format!(
                "nars_session_not_ready:{}",
                self.core.lifecycle_state()
            )));
        }
        let mut output = self.core.enqueue(input)?;
        if self.core.pending_count() == 0 {
            return Ok(output);
        }
        let drain_start_sequence = last_sequence(&self.core);
        let cancellation = CancellationToken::new();
        if self.cancel_requested {
            cancellation.cancel();
            self.cancel_requested = false;
        }
        let turn_id = self
            .core
            .queue_items()
            .first()
            .and_then(|item| item.get("event_id"))
            .and_then(Value::as_str)
            .map(ToOwned::to_owned);
        self.active_turn_id = turn_id;
        self.active_cancellation = Some(cancellation.clone());
        let drain_result = self.core.drain_once_with_adapter_and_context(
            adapter,
            self.recovery_mode,
            None,
            cancellation,
            event_sink,
        );
        self.active_turn_id = None;
        self.active_cancellation = None;
        drain_result?;
        output.extend(self.core.events_after(drain_start_sequence));
        Ok(output)
    }

    pub fn cancel(&mut self, evidence: Value) -> Result<Vec<Value>, CoreError> {
        if let Some(cancellation) = self.active_cancellation.as_ref() {
            cancellation.cancel();
        } else {
            self.cancel_requested = true;
        }
        self.core.cancel_with_evidence(evidence)
    }

    pub fn close_with_evidence(
        &mut self,
        reason: &str,
        evidence: Value,
    ) -> Result<Vec<Value>, CoreError> {
        if let Some(cancellation) = self.active_cancellation.as_ref() {
            cancellation.cancel();
        }
        self.core.close_with_evidence(reason, evidence)
    }

    pub fn health(&self, mcp_operational_state: &str) -> Value {
        self.core.health(mcp_operational_state)
    }

    pub fn recovery(&self) -> Value {
        self.core.recovery()
    }
}

fn last_sequence(core: &SessionCore) -> u64 {
    core.cursor()
        .get("last_sequence")
        .and_then(Value::as_u64)
        .unwrap_or(0)
}

fn is_held(item: &Value) -> bool {
    item.get("admission_state").and_then(Value::as_str) == Some("held")
        || item
            .get("hold_condition")
            .and_then(Value::as_str)
            .is_some_and(|value| !value.trim().is_empty())
}

/// A small deterministic adapter retained for native fixtures and smoke
/// tests.  Production callers inject their own provider/MCP adapter.
pub struct ModeProvider {
    pub mode: String,
}

impl NarsProviderAdapter for ModeProvider {
    fn run_turn(&mut self, input: &Value) -> ProviderOutcome {
        let content = input
            .get("content")
            .and_then(Value::as_str)
            .unwrap_or_default();
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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{SessionCoreConfig, TURN_SCHEMA};
    use std::fs;
    use std::path::PathBuf;
    use uuid::Uuid;

    fn core(root: &PathBuf) -> SessionCore {
        SessionCore::new(SessionCoreConfig {
            session_id: "supervisor-test".to_string(),
            agent_id: "agent".to_string(),
            session_path: Some(root.join("session.jsonl")),
            events_path: root.join("events.jsonl"),
            site_root: Some(root.clone()),
            max_event_buffer: 100,
        })
        .unwrap()
    }

    #[test]
    fn supervisor_owns_start_submit_event_sink_and_terminalization() {
        let root =
            std::env::temp_dir().join(format!("narada-supervisor-{}", Uuid::new_v4().simple()));
        fs::create_dir_all(&root).unwrap();
        let mut supervisor = SessionSupervisor::new(core(&root));
        let mut adapter = ModeProvider {
            mode: "echo".to_string(),
        };
        supervisor.start().unwrap();
        let mut provider_events = Vec::new();
        let events = supervisor
            .submit_with_adapter_and_sink(
                json!({ "event_id": "turn-1", "content": "hello" }),
                &mut adapter,
                &mut |event| {
                    provider_events.push(event);
                    Ok(())
                },
            )
            .unwrap();
        assert!(events
            .iter()
            .any(|event| event["event"] == "assistant_message"));
        assert!(provider_events.is_empty());
        assert_eq!(
            supervisor.core().turn("turn-1").unwrap()["turn_state"],
            "completed"
        );
        assert_eq!(
            supervisor.core().health("disabled")["lifecycle_state"],
            "ready"
        );
        supervisor.close_with_evidence("test", Value::Null).unwrap();
        assert_eq!(supervisor.core().lifecycle_state(), "closed");
        let _ = fs::remove_dir_all(root);
    }

    struct EventfulAdapter;

    impl NarsProviderAdapter for EventfulAdapter {
        fn run_turn(&mut self, _input: &Value) -> ProviderOutcome {
            ProviderOutcome::Completed("fallback".to_string())
        }

        fn run_turn_with_context(
            &mut self,
            context: crate::ProviderTurnContext<'_>,
            sink: &mut dyn FnMut(Value) -> Result<(), CoreError>,
        ) -> Result<ProviderOutcome, CoreError> {
            sink(json!({
                "event": "carrier_turn_started",
                "turn_id": context.turn_id,
                "input_event_id": context.input_event_id,
            }))?;
            sink(json!({
                "event": "assistant_message",
                "turn_id": context.turn_id,
                "content": "from-adapter",
            }))?;
            Ok(ProviderOutcome::Completed("from-adapter".to_string()))
        }
    }

    #[test]
    fn supervisor_adapter_can_publish_carrier_events_and_context() {
        let root = std::env::temp_dir().join(format!(
            "narada-supervisor-events-{}",
            Uuid::new_v4().simple()
        ));
        fs::create_dir_all(&root).unwrap();
        let mut supervisor = SessionSupervisor::new(core(&root));
        supervisor.start().unwrap();
        let mut adapter = EventfulAdapter;
        let events = supervisor
            .submit_with_adapter(
                json!({ "event_id": "turn-2", "content": "hello" }),
                &mut adapter,
            )
            .unwrap();
        assert!(events
            .iter()
            .any(|event| event["event"] == "carrier_turn_started"));
        assert_eq!(
            supervisor.core().turn("turn-2").unwrap()["turn_state"],
            "completed"
        );
        assert_eq!(
            supervisor.core().turn("turn-2").unwrap()["schema"],
            TURN_SCHEMA
        );
        supervisor.close_with_evidence("test", Value::Null).unwrap();
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn supervisor_replays_failed_queue_items_with_durable_recovery_attempts() {
        let root = std::env::temp_dir().join(format!(
            "narada-supervisor-recovery-{}",
            Uuid::new_v4().simple()
        ));
        fs::create_dir_all(&root).unwrap();
        let mut first = SessionSupervisor::new(core(&root));
        first.start().unwrap();
        let mut failed = ModeProvider {
            mode: "error".to_string(),
        };
        first
            .submit_with_adapter(
                json!({ "event_id": "failed-turn", "content": "retry" }),
                &mut failed,
            )
            .unwrap();
        assert_eq!(first.core().pending_count(), 1);
        drop(first);

        let mut recovered = SessionSupervisor::new(core(&root));
        let mut echo = ModeProvider {
            mode: "echo".to_string(),
        };
        recovered.start_with_adapter(&mut echo).unwrap();
        assert_eq!(recovered.core().pending_count(), 0);
        assert_eq!(
            recovered.core().recovery()["recovery_attempts"][0]["recovery_attempt_state"],
            "completed"
        );
        assert_eq!(
            recovered.core().turn("failed-turn").unwrap()["terminal_state"],
            "completed"
        );
        recovered.close_with_evidence("test", Value::Null).unwrap();
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn terminal_provider_failure_settles_while_adapter_error_remains_replayable() {
        let root = std::env::temp_dir().join(format!(
            "narada-supervisor-failure-semantics-{}",
            Uuid::new_v4().simple()
        ));
        fs::create_dir_all(&root).unwrap();
        let mut supervisor = SessionSupervisor::new(core(&root));
        supervisor.start().unwrap();
        let mut terminal = ModeProvider {
            mode: "failed".to_string(),
        };
        supervisor
            .submit_with_adapter(
                json!({ "event_id": "terminal-failure", "content": "settle" }),
                &mut terminal,
            )
            .unwrap();
        assert_eq!(supervisor.core().pending_count(), 0);
        assert_eq!(
            supervisor.core().turn("terminal-failure").unwrap()["terminal_state"],
            "failed"
        );
        supervisor.close_with_evidence("test", Value::Null).unwrap();
        let _ = fs::remove_dir_all(root);
    }

    struct CancellationAwareAdapter;

    impl NarsProviderAdapter for CancellationAwareAdapter {
        fn run_turn(&mut self, _input: &Value) -> ProviderOutcome {
            ProviderOutcome::Completed("unexpected".to_string())
        }

        fn run_turn_with_context(
            &mut self,
            context: crate::ProviderTurnContext<'_>,
            _sink: &mut dyn FnMut(Value) -> Result<(), CoreError>,
        ) -> Result<ProviderOutcome, CoreError> {
            if context.cancellation.is_cancelled() {
                Ok(ProviderOutcome::Error(
                    "cancelled_before_provider_call".to_string(),
                ))
            } else {
                Ok(ProviderOutcome::Completed("not-cancelled".to_string()))
            }
        }
    }

    #[test]
    fn supervisor_preserves_pre_cancelled_input_as_interrupted() {
        let root = std::env::temp_dir().join(format!(
            "narada-supervisor-cancel-{}",
            Uuid::new_v4().simple()
        ));
        fs::create_dir_all(&root).unwrap();
        let mut supervisor = SessionSupervisor::new(core(&root));
        supervisor.start().unwrap();
        supervisor.cancel(Value::Null).unwrap();
        let mut adapter = CancellationAwareAdapter;
        supervisor
            .submit_with_adapter(
                json!({ "event_id": "cancelled-turn", "content": "stop" }),
                &mut adapter,
            )
            .unwrap();
        assert_eq!(
            supervisor.core().turn("cancelled-turn").unwrap()["terminal_state"],
            "interrupted"
        );
        assert_eq!(supervisor.core().pending_count(), 1);
        supervisor.close_with_evidence("test", Value::Null).unwrap();
        let _ = fs::remove_dir_all(root);
    }
}
