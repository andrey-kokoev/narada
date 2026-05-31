use crate::input_queue::SessionEvidenceContext;
use crate::provider_dispatch::{ProviderAdapter, ProviderDispatchStub};
use crate::runtime_clock::RuntimeClock;
use crate::runtime_coordinator::{
    RuntimeCoordinator, RuntimeCoordinatorClock, RuntimeCoordinatorPollResult,
};
use crate::transcript_store::{TranscriptIngestSummary, TranscriptStore};
use crate::turn_coordinator::{CompletedTurn, TurnCoordinator, TurnCoordinatorClock};
use std::path::PathBuf;

#[derive(Debug, Clone)]
pub struct RuntimeStepClock {
    pub input: RuntimeCoordinatorClock,
    pub turn: TurnCoordinatorClock,
}

pub type TranscriptStepIngestResult = TranscriptIngestSummary;

#[derive(Debug)]
pub struct RuntimeStepResult {
    pub poll: RuntimeCoordinatorPollResult,
    pub released_held: usize,
    pub completed_turn: Option<CompletedTurn>,
    pub transcript: TranscriptStepIngestResult,
}

pub struct RuntimeStep {
    runtime: RuntimeCoordinator,
    turns: TurnCoordinator,
    transcript: TranscriptStore,
    clock: RuntimeClock,
}

impl RuntimeStep {
    pub fn new(
        control_jsonl_path: impl Into<PathBuf>,
        session_jsonl_path: impl Into<PathBuf>,
        evidence_context: SessionEvidenceContext,
        clock: RuntimeClock,
    ) -> Self {
        Self::with_provider_adapter(
            control_jsonl_path,
            session_jsonl_path,
            evidence_context,
            clock,
            Box::new(ProviderDispatchStub),
        )
    }

    pub fn with_provider_adapter(
        control_jsonl_path: impl Into<PathBuf>,
        session_jsonl_path: impl Into<PathBuf>,
        evidence_context: SessionEvidenceContext,
        clock: RuntimeClock,
        provider_adapter: Box<dyn ProviderAdapter>,
    ) -> Self {
        let session_jsonl_path = session_jsonl_path.into();
        Self {
            runtime: RuntimeCoordinator::new(
                control_jsonl_path,
                session_jsonl_path.clone(),
                evidence_context.clone(),
            ),
            turns: TurnCoordinator::with_provider_adapter(
                session_jsonl_path,
                evidence_context,
                provider_adapter,
            ),
            transcript: TranscriptStore::new(),
            clock,
        }
    }

    pub fn run_once(&mut self, composer_has_draft: bool) -> Result<RuntimeStepResult, String> {
        let clock = self.clock.next_step_clock();
        self.run_once_with_clock(composer_has_draft, &clock)
    }

    pub fn run_once_with_clock(
        &mut self,
        composer_has_draft: bool,
        clock: &RuntimeStepClock,
    ) -> Result<RuntimeStepResult, String> {
        let poll = self.runtime.poll_once(composer_has_draft, &clock.input)?;
        let released_held = if composer_has_draft {
            0
        } else {
            self.runtime
                .release_held_when_composer_clear(&clock.input)?
        };
        let completed_turn = self
            .turns
            .run_one_ready_turn(self.runtime.queue_mut(), &clock.turn)?;
        let transcript = self.ingest_transcript_from_session()?;

        Ok(RuntimeStepResult {
            poll,
            released_held,
            completed_turn,
            transcript,
        })
    }

    pub fn runtime(&self) -> &RuntimeCoordinator {
        &self.runtime
    }

    pub fn runtime_mut(&mut self) -> &mut RuntimeCoordinator {
        &mut self.runtime
    }

    pub fn transcript(&self) -> &TranscriptStore {
        &self.transcript
    }

    fn ingest_transcript_from_session(&mut self) -> Result<TranscriptStepIngestResult, String> {
        self.transcript
            .ingest_jsonl_file_summary(self.runtime.session_jsonl_path())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::carrier_protocol::{parse_session_event, InputEvent, SessionEventKind};
    use crate::provider_dispatch::{ProviderDispatchRecord, ProviderDispatchStatus};
    use crate::transcript_projection::{TranscriptActor, TranscriptItemKind};
    use serde_json::json;
    use std::fs::{read_to_string, remove_file, OpenOptions};
    use std::io::Write;
    use std::path::Path;
    use std::time::{SystemTime, UNIX_EPOCH};

    const CONTROL_FIXTURE: &str =
        include_str!("../../carrier-protocol/fixtures/control-input-event.json");

    fn temp_path(name: &str) -> PathBuf {
        let unique = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("clock works")
            .as_nanos();
        std::env::temp_dir().join(format!("narada-agent-tui-step-{name}-{unique}.jsonl"))
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

    fn runtime_clock() -> RuntimeClock {
        RuntimeClock::fixed("2026-05-30T00:00:02.000Z")
    }

    struct RuntimeLevelProviderAdapter;

    impl ProviderAdapter for RuntimeLevelProviderAdapter {
        fn dispatch_request(&self, input: &InputEvent, turn_id: &str) -> ProviderDispatchRecord {
            ProviderDispatchRecord {
                status: ProviderDispatchStatus::RecordedNotDispatched,
                provider_execution_enabled: false,
                payload: json!({
                    "turn_id": turn_id,
                    "input_event_id": input.event_id,
                    "provider_request_status": "runtime_level_adapter_recorded",
                    "provider_execution_enabled": false
                }),
                outputs: Vec::new(),
            }
        }
    }

    #[test]
    fn run_once_polls_admits_drains_ready_turn_and_updates_transcript() {
        let control_path = temp_path("control");
        let session_path = temp_path("session");
        append(&control_path, CONTROL_FIXTURE);
        append(&control_path, "\n");

        let mut step = RuntimeStep::new(&control_path, &session_path, context(), runtime_clock());
        let result = step.run_once(false).expect("runtime step succeeds");

        assert_eq!(result.poll.evidence_written, 1);
        assert_eq!(result.released_held, 0);
        assert!(result.completed_turn.is_some());
        assert_eq!(result.transcript.projected, 2);
        assert_eq!(result.transcript.ignored, 1);
        assert_eq!(result.transcript.duplicate, 1);
        assert_eq!(result.transcript.total_items, 2);
        assert_eq!(step.transcript().items()[0].actor, TranscriptActor::System);
        assert_eq!(
            step.transcript().items()[0].kind,
            TranscriptItemKind::InputAdmitted
        );
        assert_eq!(
            step.transcript().items()[1].kind,
            TranscriptItemKind::TurnTerminalStatus
        );

        let session_jsonl = read_to_string(&session_path).expect("session jsonl exists");
        let lines: Vec<&str> = session_jsonl.lines().collect();
        assert_eq!(lines.len(), 4);
        assert_eq!(
            parse_session_event(lines[0])
                .expect("admission parses")
                .event_kind,
            SessionEventKind::InputAdmittedToTurn
        );
        assert_eq!(
            parse_session_event(lines[1])
                .expect("turn start parses")
                .event_kind,
            SessionEventKind::TurnStarted
        );
        assert_eq!(
            parse_session_event(lines[2])
                .expect("provider request parses")
                .event_kind,
            SessionEventKind::ProviderRequestRecorded
        );
        assert_eq!(
            parse_session_event(lines[3])
                .expect("turn complete parses")
                .event_kind,
            SessionEventKind::TurnCompleted
        );

        remove_file(control_path).ok();
        remove_file(session_path).ok();
    }

    #[test]
    fn transcript_ingest_dedupes_prior_session_lines_across_runtime_steps() {
        let control_path = temp_path("control");
        let session_path = temp_path("session");
        append(&control_path, CONTROL_FIXTURE);
        append(&control_path, "\n");

        let mut step = RuntimeStep::new(&control_path, &session_path, context(), runtime_clock());
        let first = step.run_once(false).expect("first runtime step succeeds");
        assert_eq!(first.transcript.projected, 2);
        assert_eq!(first.transcript.total_items, 2);

        let second = step.run_once(false).expect("second runtime step succeeds");
        assert_eq!(second.transcript.projected, 0);
        assert_eq!(second.transcript.ignored, 0);
        assert_eq!(second.transcript.duplicate, 4);
        assert_eq!(second.transcript.total_items, 2);

        remove_file(control_path).ok();
        remove_file(session_path).ok();
    }

    #[test]
    fn runtime_step_accepts_injected_provider_adapter() {
        let control_path = temp_path("control");
        let session_path = temp_path("session");
        append(&control_path, CONTROL_FIXTURE);
        append(&control_path, "\n");

        let mut step = RuntimeStep::with_provider_adapter(
            &control_path,
            &session_path,
            context(),
            runtime_clock(),
            Box::new(RuntimeLevelProviderAdapter),
        );
        let result = step.run_once(false).expect("runtime step succeeds");
        assert!(result.completed_turn.is_some());
        assert_eq!(result.transcript.total_items, 2);

        let session_jsonl = read_to_string(&session_path).expect("session jsonl exists");
        let lines: Vec<&str> = session_jsonl.lines().collect();
        let provider_request = parse_session_event(lines[2]).expect("provider request parses");
        assert_eq!(
            provider_request.payload["provider_request_status"],
            "runtime_level_adapter_recorded"
        );

        remove_file(control_path).ok();
        remove_file(session_path).ok();
    }

    #[test]
    fn run_once_holds_when_composer_has_draft_then_releases_on_next_clear_step() {
        let control_path = temp_path("control");
        let session_path = temp_path("session");
        append(&control_path, CONTROL_FIXTURE);
        append(&control_path, "\n");

        let mut step = RuntimeStep::new(&control_path, &session_path, context(), runtime_clock());
        let first = step.run_once(true).expect("first step succeeds");
        assert_eq!(first.poll.evidence_written, 1);
        assert_eq!(first.released_held, 0);
        assert!(first.completed_turn.is_none());
        assert_eq!(first.transcript.projected, 1);
        assert_eq!(first.transcript.total_items, 1);
        assert_eq!(step.runtime().queue().held_count(), 1);

        let second = step.run_once(false).expect("second step succeeds");
        assert_eq!(second.poll.evidence_written, 0);
        assert_eq!(second.released_held, 1);
        assert!(second.completed_turn.is_some());
        assert_eq!(second.transcript.projected, 3);
        assert_eq!(second.transcript.duplicate, 1);
        assert_eq!(second.transcript.total_items, 4);

        let session_jsonl = read_to_string(&session_path).expect("session jsonl exists");
        let lines: Vec<&str> = session_jsonl.lines().collect();
        assert_eq!(lines.len(), 5);
        assert_eq!(
            parse_session_event(lines[0])
                .expect("held parses")
                .event_kind,
            SessionEventKind::SystemDirectiveHeld
        );
        assert_eq!(
            parse_session_event(lines[1])
                .expect("released parses")
                .event_kind,
            SessionEventKind::SystemDirectiveReleased
        );
        assert_eq!(
            parse_session_event(lines[2])
                .expect("started parses")
                .event_kind,
            SessionEventKind::TurnStarted
        );
        assert_eq!(
            parse_session_event(lines[3])
                .expect("provider request parses")
                .event_kind,
            SessionEventKind::ProviderRequestRecorded
        );
        assert_eq!(
            parse_session_event(lines[4])
                .expect("completed parses")
                .event_kind,
            SessionEventKind::TurnCompleted
        );

        remove_file(control_path).ok();
        remove_file(session_path).ok();
    }
}
