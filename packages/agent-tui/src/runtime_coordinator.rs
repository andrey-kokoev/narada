use crate::carrier_command::{parse_operator_submit, CarrierCommand, OperatorSubmit};
use crate::carrier_protocol::{
    DeliveryMode, InputEvent, SessionEvent, SessionEventKind, SourceKind, Transport,
    INPUT_EVENT_SCHEMA, SESSION_EVENT_SCHEMA,
};
use crate::control_jsonl::ControlJsonlError;
use crate::control_watcher::ControlJsonlWatcher;
use crate::input_queue::{
    AdmissionDecision, InputQueue, QueuedInputSummary, SessionEvidenceContext,
};
use crate::session_jsonl::append_session_event;
use serde_json::json;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone)]
pub struct RuntimeCoordinatorClock {
    pub occurred_at: String,
    pub event_id_prefix: String,
}

#[derive(Debug)]
pub struct RuntimeCoordinatorPollResult {
    pub admitted_or_queued: usize,
    pub parse_errors: Vec<ControlJsonlError>,
    pub evidence_written: usize,
    pub bytes_read: usize,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum RuntimeOperatorSubmitResult {
    Empty,
    AgentInput(AdmissionDecision),
    QueueShown {
        queued: Vec<QueuedInputSummary>,
    },
    QueueCleared {
        dropped: usize,
    },
    QueueDrop {
        index: usize,
        dropped_input_event_id: Option<String>,
    },
}

#[derive(Debug)]
pub struct RuntimeCoordinator {
    watcher: ControlJsonlWatcher,
    queue: InputQueue,
    evidence_context: SessionEvidenceContext,
    session_jsonl_path: PathBuf,
    next_evidence_index: u64,
}

impl RuntimeCoordinator {
    pub fn new(
        control_jsonl_path: impl Into<PathBuf>,
        session_jsonl_path: impl Into<PathBuf>,
        evidence_context: SessionEvidenceContext,
    ) -> Self {
        Self {
            watcher: ControlJsonlWatcher::new(control_jsonl_path),
            queue: InputQueue::new(),
            evidence_context,
            session_jsonl_path: session_jsonl_path.into(),
            next_evidence_index: 1,
        }
    }

    pub fn queue(&self) -> &InputQueue {
        &self.queue
    }

    pub fn queue_mut(&mut self) -> &mut InputQueue {
        &mut self.queue
    }

    pub fn control_jsonl_path(&self) -> &Path {
        self.watcher.path()
    }

    pub fn session_jsonl_path(&self) -> &Path {
        &self.session_jsonl_path
    }

    pub fn poll_once(
        &mut self,
        composer_has_draft: bool,
        clock: &RuntimeCoordinatorClock,
    ) -> Result<RuntimeCoordinatorPollResult, String> {
        let poll = self.watcher.poll_once()?;
        let mut evidence_written = 0;

        for entry in poll.entries {
            let input = entry.event.input;
            let decision = self
                .queue
                .admit_input_event(input.clone(), composer_has_draft);
            let event = self.evidence_for_input_decision(&decision, &input, clock);
            self.write_evidence(&event)?;
            evidence_written += 1;
        }

        Ok(RuntimeCoordinatorPollResult {
            admitted_or_queued: evidence_written,
            parse_errors: poll.errors,
            evidence_written,
            bytes_read: poll.bytes_read,
        })
    }

    pub fn release_held_when_composer_clear(
        &mut self,
        clock: &RuntimeCoordinatorClock,
    ) -> Result<usize, String> {
        let releases = self.queue.release_held_when_composer_clear();
        let mut evidence_written = 0;
        for release in releases {
            let event_id = self.next_event_id(clock);
            let event = release.to_session_event(
                &self.evidence_context,
                event_id,
                clock.occurred_at.clone(),
            );
            self.write_evidence(&event)?;
            evidence_written += 1;
        }
        Ok(evidence_written)
    }

    pub fn admit_operator_composer_submit(
        &mut self,
        text: impl Into<String>,
        clock: &RuntimeCoordinatorClock,
    ) -> Result<AdmissionDecision, String> {
        let input = self.operator_composer_input(text.into(), clock);
        let decision = self.queue.admit_input_event(input.clone(), false);
        let event = self.evidence_for_input_decision(&decision, &input, clock);
        self.write_evidence(&event)?;
        Ok(decision)
    }

    pub fn handle_operator_submit(
        &mut self,
        text: impl Into<String>,
        clock: &RuntimeCoordinatorClock,
    ) -> Result<RuntimeOperatorSubmitResult, String> {
        match parse_operator_submit(&text.into()) {
            OperatorSubmit::Empty => Ok(RuntimeOperatorSubmitResult::Empty),
            OperatorSubmit::AgentInput(text) => self
                .admit_operator_composer_submit(text, clock)
                .map(RuntimeOperatorSubmitResult::AgentInput),
            OperatorSubmit::CarrierCommand(command) => self.execute_carrier_command(command, clock),
        }
    }

    fn execute_carrier_command(
        &mut self,
        command: CarrierCommand,
        clock: &RuntimeCoordinatorClock,
    ) -> Result<RuntimeOperatorSubmitResult, String> {
        match command {
            CarrierCommand::QueueShow => Ok(RuntimeOperatorSubmitResult::QueueShown {
                queued: self.queue.queued_summaries(),
            }),
            CarrierCommand::QueueClear => {
                let dropped = self.queue.clear_queued_operator_inputs();
                let dropped_count = dropped.len();
                self.write_carrier_command_evidence(
                    "queue.clear",
                    clock,
                    json!({
                        "dropped": dropped_count,
                    }),
                )?;
                for input in dropped {
                    let event = self.input_dropped_event(&input, "queue_clear", clock);
                    self.write_evidence(&event)?;
                }
                Ok(RuntimeOperatorSubmitResult::QueueCleared {
                    dropped: dropped_count,
                })
            }
            CarrierCommand::QueueDrop { index } => {
                let dropped = self.queue.drop_queued_by_index(index);
                let dropped_input_event_id = dropped.as_ref().map(|input| input.event_id.clone());
                self.write_carrier_command_evidence(
                    "queue.drop",
                    clock,
                    json!({
                        "index": index,
                        "dropped_input_event_id": dropped_input_event_id,
                    }),
                )?;
                if let Some(input) = dropped {
                    let event = self.input_dropped_event(&input, "queue_drop", clock);
                    self.write_evidence(&event)?;
                }
                Ok(RuntimeOperatorSubmitResult::QueueDrop {
                    index,
                    dropped_input_event_id,
                })
            }
        }
    }

    pub fn record_composer_interrupt(
        &mut self,
        clock: &RuntimeCoordinatorClock,
    ) -> Result<(), String> {
        let event = SessionEvent {
            schema: SESSION_EVENT_SCHEMA.to_string(),
            event_kind: SessionEventKind::InterruptRequested,
            event_id: self.next_event_id(clock),
            occurred_at: clock.occurred_at.clone(),
            carrier_session_id: self.evidence_context.carrier_session_id.clone(),
            agent_id: self.evidence_context.agent_id.clone(),
            site_id: self.evidence_context.site_id.clone(),
            site_root: self.evidence_context.site_root.clone(),
            payload: json!({
                "turn_id": "turn_unbound_composer_interrupt",
                "source_kind": "operator",
                "source_id": "operator",
                "transport": "interactive_terminal",
                "reason": "composer_interrupt"
            }),
        };
        self.write_evidence(&event)
    }

    fn evidence_for_decision(
        &mut self,
        decision: &crate::input_queue::AdmissionDecision,
        clock: &RuntimeCoordinatorClock,
    ) -> SessionEvent {
        let event_id = self.next_event_id(clock);
        decision.to_session_event(&self.evidence_context, event_id, clock.occurred_at.clone())
    }

    fn evidence_for_input_decision(
        &mut self,
        decision: &crate::input_queue::AdmissionDecision,
        input: &InputEvent,
        clock: &RuntimeCoordinatorClock,
    ) -> SessionEvent {
        let mut event = self.evidence_for_decision(decision, clock);
        if matches!(decision, AdmissionDecision::AdmitNow { .. }) {
            event.payload = json!({
                "input_event_id": input.event_id,
                "source_kind": input.source_kind,
                "source_id": input.source_id,
                "transport": input.transport,
                "content_preview": input.content
            });
        }
        event
    }

    fn input_dropped_event(
        &mut self,
        input: &InputEvent,
        drop_reason: &str,
        clock: &RuntimeCoordinatorClock,
    ) -> SessionEvent {
        SessionEvent {
            schema: SESSION_EVENT_SCHEMA.to_string(),
            event_kind: SessionEventKind::InputDroppedByOperator,
            event_id: self.next_event_id(clock),
            occurred_at: clock.occurred_at.clone(),
            carrier_session_id: self.evidence_context.carrier_session_id.clone(),
            agent_id: self.evidence_context.agent_id.clone(),
            site_id: self.evidence_context.site_id.clone(),
            site_root: self.evidence_context.site_root.clone(),
            payload: json!({
                "input_event_id": input.event_id,
                "drop_reason": drop_reason,
                "source_kind": input.source_kind,
                "source_id": input.source_id,
            }),
        }
    }

    fn write_carrier_command_evidence(
        &mut self,
        command: &str,
        clock: &RuntimeCoordinatorClock,
        details: serde_json::Value,
    ) -> Result<(), String> {
        let event = SessionEvent {
            schema: SESSION_EVENT_SCHEMA.to_string(),
            event_kind: SessionEventKind::CarrierCommandExecuted,
            event_id: self.next_event_id(clock),
            occurred_at: clock.occurred_at.clone(),
            carrier_session_id: self.evidence_context.carrier_session_id.clone(),
            agent_id: self.evidence_context.agent_id.clone(),
            site_id: self.evidence_context.site_id.clone(),
            site_root: self.evidence_context.site_root.clone(),
            payload: json!({ "command": command, "details": details }),
        };
        self.write_evidence(&event)
    }

    fn next_event_id(&mut self, clock: &RuntimeCoordinatorClock) -> String {
        let id = format!("{}_{}", clock.event_id_prefix, self.next_evidence_index);
        self.next_evidence_index += 1;
        id
    }

    fn operator_composer_input(&self, text: String, clock: &RuntimeCoordinatorClock) -> InputEvent {
        InputEvent {
            schema: INPUT_EVENT_SCHEMA.to_string(),
            event_id: format!("input_operator_composer_{}", self.next_evidence_index),
            source_kind: SourceKind::Operator,
            source_id: "operator".to_string(),
            transport: Transport::InteractiveTerminal,
            delivery_mode: DeliveryMode::AdmitForCurrentTurn,
            hold_condition: None,
            content: text,
            created_at: clock.occurred_at.clone(),
            authority_ref: None,
            directive_id: None,
            metadata: json!({
                "composer_source": "agent_tui",
                "admission_bridge": "operator_composer_submit"
            }),
        }
    }

    fn write_evidence(&self, event: &SessionEvent) -> Result<(), String> {
        append_session_event(&self.session_jsonl_path, event)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::carrier_protocol::parse_session_event;
    use std::fs::{read_to_string, remove_file, OpenOptions};
    use std::io::Write;
    use std::time::{SystemTime, UNIX_EPOCH};

    const CONTROL_FIXTURE: &str =
        include_str!("../../carrier-protocol/fixtures/control-input-event.json");

    fn temp_path(name: &str) -> PathBuf {
        let unique = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("clock works")
            .as_nanos();
        std::env::temp_dir().join(format!("narada-agent-tui-{name}-{unique}.jsonl"))
    }

    fn append(path: &Path, content: &str) {
        let mut file = OpenOptions::new()
            .create(true)
            .append(true)
            .open(path)
            .expect("open temp file");
        file.write_all(content.as_bytes())
            .expect("append temp file");
    }

    fn context() -> SessionEvidenceContext {
        SessionEvidenceContext {
            carrier_session_id: "carrier_fixture_1".to_string(),
            agent_id: "sonar.resident".to_string(),
            site_id: "narada-sonar".to_string(),
            site_root: "D:/code/narada.sonar".to_string(),
        }
    }

    fn clock() -> RuntimeCoordinatorClock {
        RuntimeCoordinatorClock {
            occurred_at: "2026-05-30T00:00:02.000Z".to_string(),
            event_id_prefix: "session_event_runtime".to_string(),
        }
    }

    #[test]
    fn poll_once_admits_control_events_and_writes_evidence() {
        let control_path = temp_path("control");
        let session_path = temp_path("session");
        append(&control_path, CONTROL_FIXTURE);
        append(&control_path, "\n");

        let mut coordinator = RuntimeCoordinator::new(&control_path, &session_path, context());
        let result = coordinator
            .poll_once(false, &clock())
            .expect("poll once succeeds");

        assert_eq!(result.admitted_or_queued, 1);
        assert!(result.parse_errors.is_empty());
        assert_eq!(result.evidence_written, 1);

        let session_jsonl = read_to_string(&session_path).expect("session jsonl exists");
        let lines: Vec<&str> = session_jsonl.lines().collect();
        assert_eq!(lines.len(), 1);
        let event = parse_session_event(lines[0]).expect("session event parses");
        assert_eq!(event.event_id, "session_event_runtime_1");

        remove_file(control_path).ok();
        remove_file(session_path).ok();
    }

    #[test]
    fn held_directive_release_writes_evidence() {
        let control_path = temp_path("control");
        let session_path = temp_path("session");
        append(&control_path, CONTROL_FIXTURE);
        append(&control_path, "\n");

        let mut coordinator = RuntimeCoordinator::new(&control_path, &session_path, context());
        let result = coordinator
            .poll_once(true, &clock())
            .expect("poll once succeeds");
        assert_eq!(result.evidence_written, 1);
        assert_eq!(coordinator.queue().held_count(), 1);

        let released = coordinator
            .release_held_when_composer_clear(&RuntimeCoordinatorClock {
                occurred_at: "2026-05-30T00:00:03.000Z".to_string(),
                event_id_prefix: "session_event_runtime".to_string(),
            })
            .expect("release succeeds");
        assert_eq!(released, 1);

        let session_jsonl = read_to_string(&session_path).expect("session jsonl exists");
        let lines: Vec<&str> = session_jsonl.lines().collect();
        assert_eq!(lines.len(), 2);
        let release = parse_session_event(lines[1]).expect("release event parses");
        assert_eq!(release.event_id, "session_event_runtime_2");
        assert_eq!(release.payload["released_reason"], "composer_clear");
        assert_eq!(release.payload["released_at"], "2026-05-30T00:00:03.000Z");

        remove_file(control_path).ok();
        remove_file(session_path).ok();
    }

    #[test]
    fn carrier_queue_show_is_read_only_and_returns_queued_summary() {
        let control_path = temp_path("control");
        let session_path = temp_path("session");
        let mut coordinator = RuntimeCoordinator::new(&control_path, &session_path, context());
        coordinator
            .queue_mut()
            .set_turn_state(crate::input_queue::TurnState::Active);
        coordinator
            .handle_operator_submit("queued note", &clock())
            .expect("queued note submits");

        let shown = coordinator
            .handle_operator_submit("/queue", &clock())
            .expect("queue show succeeds");
        match shown {
            RuntimeOperatorSubmitResult::QueueShown { queued } => {
                assert_eq!(queued.len(), 1);
                assert_eq!(queued[0].index, 1);
                assert_eq!(queued[0].content_preview, "queued note");
            }
            other => panic!("unexpected result: {other:?}"),
        }

        let session_jsonl = read_to_string(&session_path).expect("session jsonl exists");
        assert_eq!(session_jsonl.lines().count(), 1);

        remove_file(control_path).ok();
        remove_file(session_path).ok();
    }

    #[test]
    fn carrier_queue_clear_records_command_and_drop_evidence() {
        let control_path = temp_path("control");
        let session_path = temp_path("session");
        let mut coordinator = RuntimeCoordinator::new(&control_path, &session_path, context());
        coordinator
            .queue_mut()
            .set_turn_state(crate::input_queue::TurnState::Active);
        coordinator
            .handle_operator_submit("queued note", &clock())
            .expect("queued note submits");

        let result = coordinator
            .handle_operator_submit("/queue clear", &clock())
            .expect("queue clear succeeds");
        assert_eq!(
            result,
            RuntimeOperatorSubmitResult::QueueCleared { dropped: 1 }
        );
        assert_eq!(coordinator.queue().queued_count(), 0);

        let session_jsonl = read_to_string(&session_path).expect("session jsonl exists");
        let lines: Vec<&str> = session_jsonl.lines().collect();
        assert_eq!(lines.len(), 3);
        let command = parse_session_event(lines[1]).expect("command event parses");
        assert_eq!(command.event_kind, SessionEventKind::CarrierCommandExecuted);
        assert_eq!(command.payload["command"], "queue.clear");
        let dropped = parse_session_event(lines[2]).expect("drop event parses");
        assert_eq!(dropped.event_kind, SessionEventKind::InputDroppedByOperator);
        assert_eq!(dropped.payload["drop_reason"], "queue_clear");

        remove_file(control_path).ok();
        remove_file(session_path).ok();
    }

    #[test]
    fn carrier_queue_drop_records_command_and_single_drop_evidence() {
        let control_path = temp_path("control");
        let session_path = temp_path("session");
        let mut coordinator = RuntimeCoordinator::new(&control_path, &session_path, context());
        coordinator
            .queue_mut()
            .set_turn_state(crate::input_queue::TurnState::Active);
        coordinator
            .handle_operator_submit("first queued note", &clock())
            .expect("first queued note submits");
        coordinator
            .handle_operator_submit("second queued note", &clock())
            .expect("second queued note submits");

        let result = coordinator
            .handle_operator_submit("/queue drop 2", &clock())
            .expect("queue drop succeeds");
        assert_eq!(
            result,
            RuntimeOperatorSubmitResult::QueueDrop {
                index: 2,
                dropped_input_event_id: Some("input_operator_composer_2".to_string()),
            }
        );
        assert_eq!(coordinator.queue().queued_count(), 1);

        let session_jsonl = read_to_string(&session_path).expect("session jsonl exists");
        let lines: Vec<&str> = session_jsonl.lines().collect();
        assert_eq!(lines.len(), 4);
        let command = parse_session_event(lines[2]).expect("command event parses");
        assert_eq!(command.payload["command"], "queue.drop");
        let dropped = parse_session_event(lines[3]).expect("drop event parses");
        assert_eq!(
            dropped.payload["input_event_id"],
            "input_operator_composer_2"
        );
        assert_eq!(dropped.payload["drop_reason"], "queue_drop");

        remove_file(control_path).ok();
        remove_file(session_path).ok();
    }

    #[test]
    fn double_slash_submit_records_literal_slash_agent_input() {
        let control_path = temp_path("control");
        let session_path = temp_path("session");
        let mut coordinator = RuntimeCoordinator::new(&control_path, &session_path, context());

        let result = coordinator
            .handle_operator_submit("//help", &clock())
            .expect("literal slash submits");
        assert!(matches!(result, RuntimeOperatorSubmitResult::AgentInput(_)));

        let session_jsonl = read_to_string(&session_path).expect("session jsonl exists");
        let lines: Vec<&str> = session_jsonl.lines().collect();
        assert_eq!(lines.len(), 1);
        let event = parse_session_event(lines[0]).expect("session event parses");
        assert_eq!(event.payload["content_preview"], "/help");

        remove_file(control_path).ok();
        remove_file(session_path).ok();
    }

    #[test]
    fn composer_submit_writes_operator_input_admission_evidence() {
        let control_path = temp_path("control");
        let session_path = temp_path("session");
        let mut coordinator = RuntimeCoordinator::new(&control_path, &session_path, context());

        let decision = coordinator
            .admit_operator_composer_submit("run startup sequence", &clock())
            .expect("composer submit admits");
        assert!(matches!(decision, AdmissionDecision::AdmitNow { .. }));

        let session_jsonl = read_to_string(&session_path).expect("session jsonl exists");
        let lines: Vec<&str> = session_jsonl.lines().collect();
        assert_eq!(lines.len(), 1);
        let event = parse_session_event(lines[0]).expect("session event parses");
        assert_eq!(event.event_id, "session_event_runtime_1");
        assert_eq!(event.payload["input_event_id"], "input_operator_composer_1");

        remove_file(control_path).ok();
        remove_file(session_path).ok();
    }

    #[test]
    fn composer_interrupt_writes_interrupt_evidence() {
        let control_path = temp_path("control");
        let session_path = temp_path("session");
        let mut coordinator = RuntimeCoordinator::new(&control_path, &session_path, context());

        coordinator
            .record_composer_interrupt(&clock())
            .expect("interrupt evidence writes");

        let session_jsonl = read_to_string(&session_path).expect("session jsonl exists");
        let lines: Vec<&str> = session_jsonl.lines().collect();
        assert_eq!(lines.len(), 1);
        let event = parse_session_event(lines[0]).expect("session event parses");
        assert_eq!(event.event_kind, SessionEventKind::InterruptRequested);
        assert_eq!(event.payload["turn_id"], "turn_unbound_composer_interrupt");
        assert_eq!(event.payload["reason"], "composer_interrupt");

        remove_file(control_path).ok();
        remove_file(session_path).ok();
    }
}
