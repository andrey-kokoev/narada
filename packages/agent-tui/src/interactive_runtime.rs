use crate::app_view_model::{build_app_view, AppViewInput, AppViewModel};
use crate::composer_draft::ComposerDraftState;
use crate::composer_view_model::ComposerViewInput;
use crate::input_queue::SessionEvidenceContext;
use crate::layout_model::{LayoutConfig, TerminalSize};
use crate::runtime_coordinator::{RuntimeCoordinator, RuntimeCoordinatorClock};
use crate::status_view_model::{ProviderRuntimeState, StatusViewInput};
use crate::transcript_store::{TranscriptIngestSummary, TranscriptStore};
use crate::turn_coordinator::{TurnCoordinator, TurnCoordinatorClock};
use std::path::PathBuf;

#[derive(Debug, Clone)]
pub struct InteractiveStepClock {
    pub input: RuntimeCoordinatorClock,
    pub turn: TurnCoordinatorClock,
}

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct InteractiveStepResult {
    pub control_evidence_written: usize,
    pub parse_errors: usize,
    pub released_held: usize,
    pub completed_turn: Option<CompletedTurnSummary>,
    pub transcript: TranscriptIngestSummary,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CompletedTurnSummary {
    pub turn_id: String,
    pub input_event_id: String,
    pub evidence_written: usize,
}

pub struct AgentTuiInteractiveRuntime {
    identity: String,
    session: String,
    coordinator: RuntimeCoordinator,
    turns: TurnCoordinator,
    transcript: TranscriptStore,
}

impl AgentTuiInteractiveRuntime {
    pub fn new(
        identity: impl Into<String>,
        session: impl Into<String>,
        control_jsonl_path: impl Into<PathBuf>,
        session_jsonl_path: impl Into<PathBuf>,
        evidence_context: SessionEvidenceContext,
    ) -> Self {
        let session_jsonl_path = session_jsonl_path.into();
        Self {
            identity: identity.into(),
            session: session.into(),
            coordinator: RuntimeCoordinator::new(
                control_jsonl_path,
                session_jsonl_path.clone(),
                evidence_context.clone(),
            ),
            turns: TurnCoordinator::new(session_jsonl_path, evidence_context),
            transcript: TranscriptStore::new(),
        }
    }

    pub fn coordinator_mut(&mut self) -> &mut RuntimeCoordinator {
        &mut self.coordinator
    }

    pub fn run_step(
        &mut self,
        draft: &ComposerDraftState,
        clock: &InteractiveStepClock,
    ) -> Result<InteractiveStepResult, String> {
        let composer_has_draft = !draft.text.trim().is_empty();
        let poll = self
            .coordinator
            .poll_once(composer_has_draft, &clock.input)?;
        let released_held = if composer_has_draft {
            0
        } else {
            self.coordinator
                .release_held_when_composer_clear(&clock.input)?
        };
        let completed_turn = self
            .turns
            .run_one_ready_turn(self.coordinator.queue_mut(), &clock.turn)?
            .map(|turn| CompletedTurnSummary {
                turn_id: turn.turn_id,
                input_event_id: turn.input_event_id,
                evidence_written: turn.evidence_written,
            });
        let transcript = self
            .transcript
            .ingest_jsonl_file_summary(self.coordinator.session_jsonl_path())?;

        Ok(InteractiveStepResult {
            control_evidence_written: poll.evidence_written,
            parse_errors: poll.parse_errors.len(),
            released_held,
            completed_turn,
            transcript,
        })
    }

    pub fn ingest_transcript(&mut self) -> Result<TranscriptIngestSummary, String> {
        self.transcript
            .ingest_jsonl_file_summary(self.coordinator.session_jsonl_path())
    }

    pub fn build_view(
        &self,
        terminal_size: TerminalSize,
        draft: &ComposerDraftState,
        last_error: Option<String>,
    ) -> AppViewModel {
        build_app_view(&AppViewInput {
            terminal_size,
            layout_config: LayoutConfig::default(),
            transcript_items: self.transcript.items().to_vec(),
            status: StatusViewInput {
                identity: self.identity.clone(),
                session: self.session.clone(),
                turn_state: self.coordinator.queue().turn_state(),
                queued_inputs: self.coordinator.queue().queued_count(),
                held_system_directives: self.coordinator.queue().held_count(),
                transcript_items: self.transcript.len(),
                provider_state: ProviderRuntimeState::Disabled,
                last_error,
            },
            composer: ComposerViewInput {
                identity: self.identity.clone(),
                draft_text: draft.text.clone(),
                turn_state: self.coordinator.queue().turn_state(),
                queued_operator_notes: self.coordinator.queue().queued_count(),
                held_system_directives: self.coordinator.queue().held_count(),
            },
        })
    }
}

impl From<crate::runtime_step::RuntimeStepClock> for InteractiveStepClock {
    fn from(value: crate::runtime_step::RuntimeStepClock) -> Self {
        Self {
            input: value.input,
            turn: value.turn,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs::{remove_file, OpenOptions};
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
        std::env::temp_dir().join(format!(
            "narada-agent-tui-interactive-{name}-{unique}.jsonl"
        ))
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

    fn clock() -> InteractiveStepClock {
        InteractiveStepClock {
            input: RuntimeCoordinatorClock {
                occurred_at: "2026-05-30T00:00:02.000Z".to_string(),
                event_id_prefix: "session_event_runtime".to_string(),
            },
            turn: TurnCoordinatorClock {
                occurred_at: "2026-05-30T00:00:02.000Z".to_string(),
                event_id_prefix: "session_event_turn".to_string(),
                turn_id_prefix: "turn".to_string(),
            },
        }
    }

    #[test]
    fn step_polls_drains_and_ingests_transcript() {
        let control_path = temp_path("control");
        let session_path = temp_path("session");
        append(&control_path, CONTROL_FIXTURE);
        append(&control_path, "\n");
        let mut runtime = AgentTuiInteractiveRuntime::new(
            "sonar.resident",
            "carrier_fixture_1",
            &control_path,
            &session_path,
            context(),
        );

        let result = runtime
            .run_step(&ComposerDraftState::default(), &clock())
            .expect("interactive step succeeds");

        assert_eq!(result.control_evidence_written, 1);
        assert!(result.completed_turn.is_some());
        assert_eq!(result.transcript.total_items, 2);
        let model = runtime.build_view(
            TerminalSize {
                width: 80,
                height: 20,
            },
            &ComposerDraftState::default(),
            None,
        );
        assert_eq!(model.transcript_rows.len(), 2);
        assert_eq!(model.transcript_rows[0].actor_label, "system");
        assert_eq!(model.transcript_rows[0].text, "run startup sequence");
        assert_eq!(model.transcript_rows[1].actor_label, "agent-tui");
        assert_eq!(model.transcript_rows[1].text, "completed_without_provider");

        remove_file(control_path).ok();
        remove_file(session_path).ok();
    }
}
