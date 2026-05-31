use crate::carrier_protocol::{
    create_turn_terminal_payload, InputEvent, SessionEvent, SessionEventKind, SESSION_EVENT_SCHEMA,
};
use crate::input_queue::{InputQueue, SessionEvidenceContext, TurnState};
use crate::provider_dispatch::{
    ProviderAdapter, ProviderDispatchRecord, ProviderDispatchStatus, ProviderDispatchStub,
    ProviderOutputRecord,
};
use crate::session_jsonl::append_session_event;
use serde_json::json;
use std::path::{Path, PathBuf};

pub trait ProviderToolCallExecutor {
    fn handle_provider_output(
        &mut self,
        output: &ProviderOutputRecord,
        context: &SessionEvidenceContext,
        session_jsonl_path: &Path,
        clock: &TurnCoordinatorClock,
    ) -> Result<usize, String>;
}

#[derive(Debug, Default)]
pub struct NoopProviderToolCallExecutor;

impl ProviderToolCallExecutor for NoopProviderToolCallExecutor {
    fn handle_provider_output(
        &mut self,
        _output: &ProviderOutputRecord,
        _context: &SessionEvidenceContext,
        _session_jsonl_path: &Path,
        _clock: &TurnCoordinatorClock,
    ) -> Result<usize, String> {
        Ok(0)
    }
}

#[derive(Debug, Clone)]
pub struct TurnCoordinatorClock {
    pub occurred_at: String,
    pub event_id_prefix: String,
    pub turn_id_prefix: String,
}

#[derive(Debug)]
pub struct CompletedTurn {
    pub turn_id: String,
    pub input_event_id: String,
    pub evidence_written: usize,
}

pub struct TurnCoordinator {
    evidence_context: SessionEvidenceContext,
    session_jsonl_path: PathBuf,
    provider_adapter: Box<dyn ProviderAdapter>,
    provider_tool_call_executor: Box<dyn ProviderToolCallExecutor>,
    next_event_index: u64,
    next_turn_index: u64,
}

impl TurnCoordinator {
    pub fn new(
        session_jsonl_path: impl Into<PathBuf>,
        evidence_context: SessionEvidenceContext,
    ) -> Self {
        Self::with_provider_adapter(
            session_jsonl_path,
            evidence_context,
            Box::new(ProviderDispatchStub::default()),
        )
    }

    pub fn with_provider_adapter(
        session_jsonl_path: impl Into<PathBuf>,
        evidence_context: SessionEvidenceContext,
        provider_adapter: Box<dyn ProviderAdapter>,
    ) -> Self {
        Self::with_provider_adapter_and_tool_executor(
            session_jsonl_path,
            evidence_context,
            provider_adapter,
            Box::new(NoopProviderToolCallExecutor),
        )
    }

    pub fn with_provider_adapter_and_tool_executor(
        session_jsonl_path: impl Into<PathBuf>,
        evidence_context: SessionEvidenceContext,
        provider_adapter: Box<dyn ProviderAdapter>,
        provider_tool_call_executor: Box<dyn ProviderToolCallExecutor>,
    ) -> Self {
        Self {
            evidence_context,
            session_jsonl_path: session_jsonl_path.into(),
            provider_adapter,
            provider_tool_call_executor,
            next_event_index: 1,
            next_turn_index: 1,
        }
    }

    pub fn session_jsonl_path(&self) -> &Path {
        &self.session_jsonl_path
    }

    pub fn run_one_ready_turn(
        &mut self,
        queue: &mut InputQueue,
        clock: &TurnCoordinatorClock,
    ) -> Result<Option<CompletedTurn>, String> {
        let Some(input) = queue.next_ready_input() else {
            return Ok(None);
        };

        queue.set_turn_state(TurnState::Active);
        let turn_id = self.next_turn_id(clock);
        let start = self.turn_started_event(&input, &turn_id, clock);
        self.write_evidence(&start)?;

        let provider_record = self.provider_adapter.dispatch_request(&input, &turn_id);
        let provider_request = self.provider_request_recorded_event(&provider_record, clock);
        self.write_evidence(&provider_request)?;
        let mut output_evidence_count = 0;
        for output in &provider_record.outputs {
            let output_event = self.provider_output_event(output, clock);
            self.write_evidence(&output_event)?;
            output_evidence_count += 1;
            output_evidence_count += self.provider_tool_call_executor.handle_provider_output(
                output,
                &self.evidence_context,
                &self.session_jsonl_path,
                clock,
            )?;
        }

        queue.set_turn_state(TurnState::Idle);
        let terminal = self.turn_terminal_event(&input, &turn_id, &provider_record, clock);
        self.write_evidence(&terminal)?;

        Ok(Some(CompletedTurn {
            turn_id,
            input_event_id: input.event_id,
            evidence_written: 3 + output_evidence_count,
        }))
    }

    fn turn_started_event(
        &mut self,
        input: &InputEvent,
        turn_id: &str,
        clock: &TurnCoordinatorClock,
    ) -> SessionEvent {
        self.session_event(
            SessionEventKind::TurnStarted,
            clock,
            json!({
                "turn_id": turn_id,
                "input_event_id": input.event_id,
                "source_kind": input.source_kind,
                "source_id": input.source_id,
                "directive_id": input.directive_id,
                "content_preview": input.content.chars().take(240).collect::<String>()
            }),
        )
    }

    fn provider_request_recorded_event(
        &mut self,
        record: &ProviderDispatchRecord,
        clock: &TurnCoordinatorClock,
    ) -> SessionEvent {
        self.session_event(
            SessionEventKind::ProviderRequestRecorded,
            clock,
            record.payload.clone(),
        )
    }

    fn provider_output_event(
        &mut self,
        output: &ProviderOutputRecord,
        clock: &TurnCoordinatorClock,
    ) -> SessionEvent {
        self.session_event(
            output.kind.session_event_kind(),
            clock,
            output.payload.clone(),
        )
    }

    fn turn_terminal_event(
        &mut self,
        input: &InputEvent,
        turn_id: &str,
        record: &ProviderDispatchRecord,
        clock: &TurnCoordinatorClock,
    ) -> SessionEvent {
        let (kind, terminal_status) = provider_status_to_turn_terminal(&record.status);
        let error_summary = (kind == SessionEventKind::TurnFailed).then_some(terminal_status);
        self.session_event(
            kind,
            clock,
            create_turn_terminal_payload(
                turn_id,
                Some(&input.event_id),
                record.status.as_str(),
                terminal_status,
                record.provider_execution_enabled,
                error_summary,
            ),
        )
    }

    fn session_event(
        &mut self,
        kind: SessionEventKind,
        clock: &TurnCoordinatorClock,
        payload: serde_json::Value,
    ) -> SessionEvent {
        SessionEvent {
            schema: SESSION_EVENT_SCHEMA.to_string(),
            event_kind: kind,
            event_id: self.next_event_id(clock),
            occurred_at: clock.occurred_at.clone(),
            carrier_session_id: self.evidence_context.carrier_session_id.clone(),
            agent_id: self.evidence_context.agent_id.clone(),
            site_id: self.evidence_context.site_id.clone(),
            site_root: self.evidence_context.site_root.clone(),
            payload,
        }
    }

    fn next_event_id(&mut self, clock: &TurnCoordinatorClock) -> String {
        let id = format!("{}_{}", clock.event_id_prefix, self.next_event_index);
        self.next_event_index += 1;
        id
    }

    fn next_turn_id(&mut self, clock: &TurnCoordinatorClock) -> String {
        let id = format!("{}_{}", clock.turn_id_prefix, self.next_turn_index);
        self.next_turn_index += 1;
        id
    }

    fn write_evidence(&self, event: &SessionEvent) -> Result<(), String> {
        append_session_event(&self.session_jsonl_path, event)
    }
}

fn provider_status_to_turn_terminal(
    status: &ProviderDispatchStatus,
) -> (SessionEventKind, &'static str) {
    match status {
        ProviderDispatchStatus::RecordedNotDispatched => (
            SessionEventKind::TurnCompleted,
            "completed_without_provider",
        ),
        ProviderDispatchStatus::Dispatched => {
            (SessionEventKind::TurnCompleted, "completed_after_dispatch")
        }
        ProviderDispatchStatus::Completed => (SessionEventKind::TurnCompleted, "completed"),
        ProviderDispatchStatus::Failed => (SessionEventKind::TurnFailed, "failed"),
        ProviderDispatchStatus::Interrupted => (SessionEventKind::TurnInterrupted, "interrupted"),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::carrier_protocol::{
        create_provider_request_payload, parse_input_event, parse_session_event, DeliveryMode,
        TURN_TERMINAL_PAYLOAD_SCHEMA,
    };
    use crate::provider_adapter_admission::ProviderAdapterKind;
    use crate::provider_adapter_contract::provider_adapter_contract;
    use crate::provider_dispatch::{
        ProviderDispatchRecord, ProviderOutputRecord, ScriptedProviderAdapter,
    };
    use crate::provider_runtime_config::ProviderRuntimeConfig;
    use serde_json::json;
    use std::fs::{read_to_string, remove_file};
    use std::time::{SystemTime, UNIX_EPOCH};

    const INPUT_FIXTURE: &str = include_str!("../../carrier-protocol/fixtures/input-event.json");

    fn temp_session_path() -> PathBuf {
        let unique = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("clock works")
            .as_nanos();
        std::env::temp_dir().join(format!("narada-agent-tui-turn-{unique}.jsonl"))
    }

    fn context() -> SessionEvidenceContext {
        SessionEvidenceContext {
            carrier_session_id: "carrier_fixture_1".to_string(),
            agent_id: "sonar.resident".to_string(),
            site_id: "narada-sonar".to_string(),
            site_root: "D:/code/narada.sonar".to_string(),
        }
    }

    fn clock() -> TurnCoordinatorClock {
        TurnCoordinatorClock {
            occurred_at: "2026-05-30T00:00:04.000Z".to_string(),
            event_id_prefix: "session_event_turn".to_string(),
            turn_id_prefix: "turn".to_string(),
        }
    }

    struct RecordingProviderAdapter;

    impl ProviderAdapter for RecordingProviderAdapter {
        fn dispatch_request(&self, input: &InputEvent, turn_id: &str) -> ProviderDispatchRecord {
            ProviderDispatchRecord {
                status: ProviderDispatchStatus::RecordedNotDispatched,
                provider_execution_enabled: false,
                payload: create_provider_request_payload(
                    turn_id,
                    &input.event_id,
                    "test_adapter_recorded",
                    false,
                    "configured",
                    "configured_without_adapter",
                    None,
                    None,
                    None,
                    None,
                    false,
                    "not_requested",
                    Some("test_adapter_recorded".to_string()),
                    &input.content,
                ),
                outputs: Vec::new(),
            }
        }
    }

    struct WritingProviderToolCallExecutor;

    impl ProviderToolCallExecutor for WritingProviderToolCallExecutor {
        fn handle_provider_output(
            &mut self,
            output: &ProviderOutputRecord,
            context: &SessionEvidenceContext,
            session_jsonl_path: &Path,
            clock: &TurnCoordinatorClock,
        ) -> Result<usize, String> {
            if output.kind != crate::provider_dispatch::ProviderOutputKind::ToolCallRequest {
                return Ok(0);
            }
            let request = SessionEvent {
                schema: SESSION_EVENT_SCHEMA.to_string(),
                event_kind: SessionEventKind::ToolCallRequested,
                event_id: format!("{}_tool_request", clock.event_id_prefix),
                occurred_at: clock.occurred_at.clone(),
                carrier_session_id: context.carrier_session_id.clone(),
                agent_id: context.agent_id.clone(),
                site_id: context.site_id.clone(),
                site_root: context.site_root.clone(),
                payload: json!({
                    "tool_name": output.payload["tool_name"],
                    "arguments_summary": output.payload["arguments_summary"],
                    "requesting_agent_id": context.agent_id
                }),
            };
            let result = SessionEvent {
                schema: SESSION_EVENT_SCHEMA.to_string(),
                event_kind: SessionEventKind::ToolResultReceived,
                event_id: format!("{}_tool_result", clock.event_id_prefix),
                occurred_at: clock.occurred_at.clone(),
                carrier_session_id: context.carrier_session_id.clone(),
                agent_id: context.agent_id.clone(),
                site_id: context.site_id.clone(),
                site_root: context.site_root.clone(),
                payload: json!({
                    "tool_name": output.payload["tool_name"],
                    "status": "ok",
                    "duration_ms": 0,
                    "result_summary": "ok"
                }),
            };
            append_session_event(session_jsonl_path, &request)?;
            append_session_event(session_jsonl_path, &result)?;
            Ok(2)
        }
    }
    fn scripted_output_provider_adapter() -> ScriptedProviderAdapter {
        let provider_contract = provider_adapter_contract();
        let runtime_config =
            ProviderRuntimeConfig::from_env_map(&std::collections::BTreeMap::from([
                (
                    provider_contract.provider_execution_env_var.clone(),
                    "true".to_string(),
                ),
                (
                    provider_contract.intelligence_provider_env_var.clone(),
                    "codex-subscription".to_string(),
                ),
                (
                    provider_contract.ai_model_env_var.clone(),
                    "gpt-5.5".to_string(),
                ),
            ]));
        ScriptedProviderAdapter::try_new(
            runtime_config,
            ProviderAdapterKind::Scripted,
            vec![
                ProviderOutputRecord::text_delta("turn_1", "hello", 1),
                ProviderOutputRecord::tool_call_request("turn_1", "site_loop_run_once", "{}", 2),
            ],
        )
        .expect("scripted provider adapter admits configured runtime")
    }

    #[test]
    fn maps_provider_status_to_turn_terminal_event() {
        assert_eq!(
            provider_status_to_turn_terminal(&ProviderDispatchStatus::RecordedNotDispatched),
            (
                SessionEventKind::TurnCompleted,
                "completed_without_provider"
            )
        );
        assert_eq!(
            provider_status_to_turn_terminal(&ProviderDispatchStatus::Dispatched),
            (SessionEventKind::TurnCompleted, "completed_after_dispatch")
        );
        assert_eq!(
            provider_status_to_turn_terminal(&ProviderDispatchStatus::Completed),
            (SessionEventKind::TurnCompleted, "completed")
        );
        assert_eq!(
            provider_status_to_turn_terminal(&ProviderDispatchStatus::Failed),
            (SessionEventKind::TurnFailed, "failed")
        );
        assert_eq!(
            provider_status_to_turn_terminal(&ProviderDispatchStatus::Interrupted),
            (SessionEventKind::TurnInterrupted, "interrupted")
        );
    }

    #[test]
    fn returns_none_when_no_ready_input_exists() {
        let path = temp_session_path();
        let mut queue = InputQueue::new();
        let mut coordinator = TurnCoordinator::new(&path, context());

        let result = coordinator
            .run_one_ready_turn(&mut queue, &clock())
            .expect("turn check succeeds");
        assert!(result.is_none());
        assert_eq!(queue.turn_state(), TurnState::Idle);

        remove_file(path).ok();
    }

    #[test]
    fn accepts_injected_provider_adapter() {
        let path = temp_session_path();
        let mut input = parse_input_event(INPUT_FIXTURE).expect("input parses");
        input.delivery_mode = DeliveryMode::AdmitAfterActiveTurn;
        let mut queue = InputQueue::new();
        queue.admit_input_event(input, false);
        let mut coordinator = TurnCoordinator::with_provider_adapter(
            &path,
            context(),
            Box::new(RecordingProviderAdapter),
        );

        coordinator
            .run_one_ready_turn(&mut queue, &clock())
            .expect("turn run succeeds")
            .expect("turn completed");

        let session_jsonl = read_to_string(&path).expect("session jsonl exists");
        let lines: Vec<&str> = session_jsonl.lines().collect();
        let provider_request = parse_session_event(lines[1]).expect("provider request parses");
        assert_eq!(
            provider_request.payload["provider_request_status"],
            "test_adapter_recorded"
        );

        remove_file(path).ok();
    }

    #[test]
    fn writes_buffered_provider_outputs_before_terminal_event() {
        let path = temp_session_path();
        let mut input = parse_input_event(INPUT_FIXTURE).expect("input parses");
        input.delivery_mode = DeliveryMode::AdmitAfterActiveTurn;
        let mut queue = InputQueue::new();
        queue.admit_input_event(input, false);
        let mut coordinator = TurnCoordinator::with_provider_adapter(
            &path,
            context(),
            Box::new(scripted_output_provider_adapter()),
        );

        let completed = coordinator
            .run_one_ready_turn(&mut queue, &clock())
            .expect("turn run succeeds")
            .expect("turn completed");
        assert_eq!(completed.evidence_written, 5);

        let session_jsonl = read_to_string(&path).expect("session jsonl exists");
        let events = session_jsonl
            .lines()
            .map(|line| parse_session_event(line).expect("event parses"))
            .collect::<Vec<_>>();
        assert_eq!(events.len(), 5);
        let provider_request = &events[1];
        assert_eq!(
            provider_request.payload["provider_request_status"],
            "completed"
        );
        assert_eq!(provider_request.payload["provider_execution_enabled"], true);
        assert_eq!(
            provider_request.payload["provider_runtime_status"],
            "configured"
        );
        assert_eq!(
            provider_request.payload["provider_adapter_admission_status"],
            "admitted"
        );
        assert_eq!(
            provider_request.payload["provider_adapter_kind"],
            provider_adapter_contract().scripted_provider_adapter_kind
        );
        assert_eq!(
            provider_request.payload["provider_adapter_refusal_reason"],
            serde_json::Value::Null
        );
        assert_eq!(
            events[2].event_kind,
            SessionEventKind::ProviderTextDeltaRecorded
        );
        assert_eq!(
            events[3].event_kind,
            SessionEventKind::ProviderToolCallRequested
        );
        assert_eq!(events[4].event_kind, SessionEventKind::TurnCompleted);
        assert_eq!(events[4].payload["schema"], TURN_TERMINAL_PAYLOAD_SCHEMA);
        assert_eq!(events[4].payload["provider_execution_enabled"], true);
        assert_eq!(events[4].payload["terminal_status"], "completed");

        remove_file(path).ok();
    }

    #[test]
    fn injected_tool_bridge_runs_after_provider_tool_output() {
        let path = temp_session_path();
        let mut input = parse_input_event(INPUT_FIXTURE).expect("input parses");
        input.delivery_mode = DeliveryMode::AdmitAfterActiveTurn;
        let mut queue = InputQueue::new();
        queue.admit_input_event(input, false);
        let mut coordinator = TurnCoordinator::with_provider_adapter_and_tool_executor(
            &path,
            context(),
            Box::new(scripted_output_provider_adapter()),
            Box::new(WritingProviderToolCallExecutor),
        );

        let completed = coordinator
            .run_one_ready_turn(&mut queue, &clock())
            .expect("turn run succeeds")
            .expect("turn completed");
        assert_eq!(completed.evidence_written, 7);

        let session_jsonl = read_to_string(&path).expect("session jsonl exists");
        let events = session_jsonl
            .lines()
            .map(|line| parse_session_event(line).expect("event parses"))
            .collect::<Vec<_>>();
        assert_eq!(events.len(), 7);
        assert_eq!(
            events[3].event_kind,
            SessionEventKind::ProviderToolCallRequested
        );
        assert_eq!(events[4].event_kind, SessionEventKind::ToolCallRequested);
        assert_eq!(events[5].event_kind, SessionEventKind::ToolResultReceived);
        assert_eq!(events[6].event_kind, SessionEventKind::TurnCompleted);

        remove_file(path).ok();
    }

    #[test]
    fn drains_ready_input_and_writes_turn_evidence() {
        let path = temp_session_path();
        let mut input = parse_input_event(INPUT_FIXTURE).expect("input parses");
        input.delivery_mode = DeliveryMode::AdmitAfterActiveTurn;
        let mut queue = InputQueue::new();
        queue.admit_input_event(input, false);
        let mut coordinator = TurnCoordinator::new(&path, context());

        let completed = coordinator
            .run_one_ready_turn(&mut queue, &clock())
            .expect("turn run succeeds")
            .expect("turn completed");
        assert_eq!(completed.turn_id, "turn_1");
        assert_eq!(completed.evidence_written, 3);
        assert_eq!(queue.turn_state(), TurnState::Idle);
        assert_eq!(queue.queued_count(), 0);

        let session_jsonl = read_to_string(&path).expect("session jsonl exists");
        let lines: Vec<&str> = session_jsonl.lines().collect();
        assert_eq!(lines.len(), 3);
        let started = parse_session_event(lines[0]).expect("started parses");
        let provider_request = parse_session_event(lines[1]).expect("provider request parses");
        let completed_event = parse_session_event(lines[2]).expect("completed parses");
        assert_eq!(started.event_kind, SessionEventKind::TurnStarted);
        assert_eq!(
            provider_request.event_kind,
            SessionEventKind::ProviderRequestRecorded
        );
        assert_eq!(
            provider_request.payload["provider_request_status"],
            "recorded_not_dispatched"
        );
        assert_eq!(completed_event.event_kind, SessionEventKind::TurnCompleted);
        assert_eq!(
            completed_event.payload["schema"],
            TURN_TERMINAL_PAYLOAD_SCHEMA
        );
        assert_eq!(
            completed_event.payload["terminal_status"],
            "completed_without_provider"
        );

        remove_file(path).ok();
    }
}
