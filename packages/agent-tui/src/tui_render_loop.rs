use crate::app_view_model::AppViewModel;
use crate::composer_draft::{ComposerDraftEffect, ComposerDraftState};
use crate::interactive_runtime::{AgentTuiInteractiveRuntime, InteractiveStepClock};
use crate::layout_model::TerminalSize;
use crate::runtime_clock::RuntimeClock;
use crate::runtime_coordinator::{RuntimeCoordinator, RuntimeCoordinatorClock};
use crate::terminal_input_tick::{
    run_textarea_composer_input_tick_with_wait, TerminalInputReader, TerminalInputTickOutcome,
};
use crate::textarea_composer::TextareaComposer;
use std::time::Duration;

#[derive(Debug, Clone, Default)]
pub struct AgentTuiLoopState {
    pub composer: TextareaComposer,
    pub should_exit: bool,
    pub last_error: Option<String>,
}

impl AgentTuiLoopState {
    pub fn draft_state(&self) -> ComposerDraftState {
        self.composer.draft_state()
    }

    pub fn draft_text(&self) -> String {
        self.composer.text()
    }

    pub fn composer_has_draft(&self) -> bool {
        !self.composer.is_empty()
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum RenderLoopAction {
    None,
    Redraw,
    Exit,
}

pub trait ComposerAdmissionBridge {
    fn submit_operator_text(&mut self, text: String) -> Result<(), String>;
    fn request_interrupt(&mut self) -> Result<(), String>;
}

pub struct RuntimeCoordinatorComposerBridge<'a> {
    pub coordinator: &'a mut RuntimeCoordinator,
    pub clock: RuntimeCoordinatorClock,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct InteractiveLoopRunSummary {
    pub steps_attempted: u64,
    pub exited_by_input: bool,
    pub final_drawn: bool,
}

pub trait InteractiveTerminalFrame {
    fn terminal_size(&mut self) -> Result<TerminalSize, String>;
    fn draw_frame(
        &mut self,
        model: &AppViewModel,
        composer: &TextareaComposer,
    ) -> Result<(), String>;
}

pub trait InteractiveInputSource {
    fn read_tick(&mut self, composer: &mut TextareaComposer) -> TerminalInputTickOutcome;
}

pub trait InteractiveClockSource {
    fn next_interactive_step_clock(&mut self) -> InteractiveStepClock;
}

pub struct TerminalInputTickSource<'a, R: TerminalInputReader> {
    pub reader: &'a mut R,
    pub wait: Duration,
}

impl<R: TerminalInputReader> InteractiveInputSource for TerminalInputTickSource<'_, R> {
    fn read_tick(&mut self, composer: &mut TextareaComposer) -> TerminalInputTickOutcome {
        run_textarea_composer_input_tick_with_wait(self.reader, composer, self.wait)
    }
}

pub struct RuntimeClockInteractiveSource<'a> {
    pub clock: &'a mut RuntimeClock,
}

impl InteractiveClockSource for RuntimeClockInteractiveSource<'_> {
    fn next_interactive_step_clock(&mut self) -> InteractiveStepClock {
        InteractiveStepClock::from(self.clock.next_step_clock())
    }
}

impl ComposerAdmissionBridge for RuntimeCoordinatorComposerBridge<'_> {
    fn submit_operator_text(&mut self, text: String) -> Result<(), String> {
        self.coordinator
            .handle_operator_submit(text, &self.clock)
            .map(|_| ())
    }

    fn request_interrupt(&mut self) -> Result<(), String> {
        self.coordinator.record_composer_interrupt(&self.clock)
    }
}

pub fn run_injected_interactive_loop<T, I, C>(
    runtime: &mut AgentTuiInteractiveRuntime,
    loop_state: &mut AgentTuiLoopState,
    terminal: &mut T,
    input: &mut I,
    clock: &mut C,
    max_steps: u64,
) -> Result<InteractiveLoopRunSummary, String>
where
    T: InteractiveTerminalFrame,
    I: InteractiveInputSource,
    C: InteractiveClockSource,
{
    let mut steps_attempted = 0;
    let mut exited_by_input = false;

    for _ in 0..max_steps {
        steps_attempted += 1;
        let step_clock = clock.next_interactive_step_clock();
        let step_result = runtime.run_step(&loop_state.draft_state(), &step_clock)?;
        if step_result.parse_errors > 0 {
            loop_state.last_error = Some(format!(
                "control_jsonl_parse_errors:{}",
                step_result.parse_errors
            ));
        }
        let model = runtime.build_view(
            terminal.terminal_size()?,
            &loop_state.draft_state(),
            loop_state.last_error.clone(),
        );
        terminal.draw_frame(&model, &loop_state.composer)?;

        let outcome = input.read_tick(&mut loop_state.composer);
        let mut bridge = RuntimeCoordinatorComposerBridge {
            coordinator: runtime.coordinator_mut(),
            clock: step_clock.input,
        };
        let action = apply_input_tick_outcome(loop_state, &mut bridge, outcome);
        if action == RenderLoopAction::Exit || loop_state.should_exit {
            exited_by_input = true;
            break;
        }
    }

    runtime.ingest_transcript()?;
    let model = runtime.build_view(
        terminal.terminal_size()?,
        &loop_state.draft_state(),
        loop_state.last_error.clone(),
    );
    terminal.draw_frame(&model, &loop_state.composer)?;

    Ok(InteractiveLoopRunSummary {
        steps_attempted,
        exited_by_input,
        final_drawn: true,
    })
}

pub fn apply_input_tick_outcome<B: ComposerAdmissionBridge>(
    state: &mut AgentTuiLoopState,
    bridge: &mut B,
    outcome: TerminalInputTickOutcome,
) -> RenderLoopAction {
    match outcome {
        TerminalInputTickOutcome::NoInput | TerminalInputTickOutcome::NonKeyEventIgnored => {
            RenderLoopAction::None
        }
        TerminalInputTickOutcome::ReadFailed(error) => {
            state.last_error = Some(error);
            RenderLoopAction::Redraw
        }
        TerminalInputTickOutcome::DraftEffect(effect) => apply_draft_effect(state, bridge, effect),
    }
}

fn apply_draft_effect<B: ComposerAdmissionBridge>(
    state: &mut AgentTuiLoopState,
    bridge: &mut B,
    effect: ComposerDraftEffect,
) -> RenderLoopAction {
    match effect {
        ComposerDraftEffect::None => RenderLoopAction::None,
        ComposerDraftEffect::DraftChanged => RenderLoopAction::Redraw,
        ComposerDraftEffect::SubmitRequested { text } => {
            if let Err(error) = bridge.submit_operator_text(text) {
                state.last_error = Some(error);
            }
            RenderLoopAction::Redraw
        }
        ComposerDraftEffect::ClearOrInterruptRequested => {
            if let Err(error) = bridge.request_interrupt() {
                state.last_error = Some(error);
            }
            RenderLoopAction::Redraw
        }
        ComposerDraftEffect::ExitRequested => {
            state.should_exit = true;
            RenderLoopAction::Exit
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::carrier_protocol::{parse_session_event, SessionEventKind};
    use crate::input_queue::{SessionEvidenceContext, TurnState};
    use crate::transcript_store::TranscriptStore;
    use crate::terminal_input_tick::TerminalInputReader;
    use crate::turn_coordinator::TurnCoordinatorClock;
    use crossterm::event::{Event, KeyCode, KeyEvent, KeyEventKind, KeyEventState, KeyModifiers};
    use std::collections::VecDeque;
    use std::io;
    use std::fs::{read_to_string, remove_file, OpenOptions};
    use std::io::Write;
    use std::path::{Path, PathBuf};
    use std::time::{SystemTime, UNIX_EPOCH};

    const CONTROL_FIXTURE: &str =
        include_str!("../../carrier-protocol/fixtures/control-input-event.json");

    #[derive(Debug, Default)]
    struct FakeBridge {
        submitted: Vec<String>,
        interrupts: usize,
        fail_submit: bool,
        fail_interrupt: bool,
    }

    impl ComposerAdmissionBridge for FakeBridge {
        fn submit_operator_text(&mut self, text: String) -> Result<(), String> {
            if self.fail_submit {
                return Err("submit failed".to_string());
            }
            self.submitted.push(text);
            Ok(())
        }

        fn request_interrupt(&mut self) -> Result<(), String> {
            if self.fail_interrupt {
                return Err("interrupt failed".to_string());
            }
            self.interrupts += 1;
            Ok(())
        }
    }

    #[derive(Debug)]
    struct FakeTerminalFrame {
        size: TerminalSize,
        draw_count: usize,
        prompt_labels: Vec<String>,
        composer_texts: Vec<String>,
        status_lines: Vec<String>,
        transcript_counts: Vec<usize>,
    }

    impl FakeTerminalFrame {
        fn new() -> Self {
            Self {
                size: TerminalSize {
                    width: 80,
                    height: 12,
                },
                draw_count: 0,
                prompt_labels: Vec::new(),
                composer_texts: Vec::new(),
                status_lines: Vec::new(),
                transcript_counts: Vec::new(),
            }
        }
    }

    impl InteractiveTerminalFrame for FakeTerminalFrame {
        fn terminal_size(&mut self) -> Result<TerminalSize, String> {
            Ok(self.size)
        }

        fn draw_frame(
            &mut self,
            model: &AppViewModel,
            composer: &TextareaComposer,
        ) -> Result<(), String> {
            self.draw_count += 1;
            self.prompt_labels.push(model.composer.prompt_label.clone());
            self.composer_texts.push(composer.text());
            self.status_lines.push(model.status.compact_line.clone());
            self.transcript_counts.push(model.transcript_rows.len());
            Ok(())
        }
    }

    #[derive(Debug, Default)]
    struct FakeInputSource {
        outcomes: VecDeque<TerminalInputTickOutcome>,
    }

    impl InteractiveInputSource for FakeInputSource {
        fn read_tick(&mut self, _composer: &mut TextareaComposer) -> TerminalInputTickOutcome {
            self.outcomes
                .pop_front()
                .unwrap_or(TerminalInputTickOutcome::NoInput)
        }
    }

    #[derive(Debug)]
    struct AppendingInputSource {
        outcomes: VecDeque<TerminalInputTickOutcome>,
        control_path: PathBuf,
        appended: bool,
    }

    impl InteractiveInputSource for AppendingInputSource {
        fn read_tick(&mut self, _composer: &mut TextareaComposer) -> TerminalInputTickOutcome {
            if !self.appended && self.outcomes.len() == 2 {
                append(&self.control_path, CONTROL_FIXTURE.trim_end());
                append(&self.control_path, "\n");
                self.appended = true;
            }
            self.outcomes
                .pop_front()
                .unwrap_or(TerminalInputTickOutcome::NoInput)
        }
    }

    #[derive(Debug, Default)]
    struct FakeTerminalInputReader {
        events: VecDeque<Event>,
    }

    impl TerminalInputReader for FakeTerminalInputReader {
        fn poll_input(&mut self, _wait: Duration) -> io::Result<bool> {
            Ok(!self.events.is_empty())
        }

        fn read_input(&mut self) -> io::Result<Event> {
            self.events
                .pop_front()
                .ok_or_else(|| io::Error::new(io::ErrorKind::UnexpectedEof, "no event"))
        }
    }

    struct FakeClockSource {
        index: u64,
    }

    impl InteractiveClockSource for FakeClockSource {
        fn next_interactive_step_clock(&mut self) -> InteractiveStepClock {
            self.index += 1;
            InteractiveStepClock {
                input: RuntimeCoordinatorClock {
                    occurred_at: format!("2026-05-30T00:00:0{}.000Z", self.index),
                    event_id_prefix: format!("session_event_input_{}", self.index),
                },
                turn: TurnCoordinatorClock {
                    occurred_at: format!("2026-05-30T00:00:0{}.000Z", self.index),
                    event_id_prefix: format!("session_event_turn_{}", self.index),
                    turn_id_prefix: format!("turn_{}", self.index),
                },
            }
        }
    }

    fn temp_path(name: &str) -> PathBuf {
        let unique = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("clock works")
            .as_nanos();
        std::env::temp_dir().join(format!(
            "narada-agent-tui-render-loop-{name}-{unique}.jsonl"
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

    fn runtime_for_paths(control_path: &Path, session_path: &Path) -> AgentTuiInteractiveRuntime {
        AgentTuiInteractiveRuntime::new(
            "sonar.resident",
            "carrier_fixture_1",
            control_path,
            session_path,
            context(),
        )
    }

    fn input_source(
        outcomes: impl IntoIterator<Item = TerminalInputTickOutcome>,
    ) -> FakeInputSource {
        FakeInputSource {
            outcomes: VecDeque::from_iter(outcomes),
        }
    }

    fn appending_input_source(
        control_path: PathBuf,
        outcomes: impl IntoIterator<Item = TerminalInputTickOutcome>,
    ) -> AppendingInputSource {
        AppendingInputSource {
            outcomes: VecDeque::from_iter(outcomes),
            control_path,
            appended: false,
        }
    }

    fn terminal_reader(events: impl IntoIterator<Item = Event>) -> FakeTerminalInputReader {
        FakeTerminalInputReader {
            events: VecDeque::from_iter(events),
        }
    }

    fn key_event(code: KeyCode, modifiers: KeyModifiers) -> Event {
        Event::Key(KeyEvent {
            code,
            modifiers,
            kind: KeyEventKind::Press,
            state: KeyEventState::NONE,
        })
    }

    fn clock_source() -> FakeClockSource {
        FakeClockSource { index: 0 }
    }

    #[test]
    fn loop_state_exposes_composer_draft_snapshot() {
        let state = AgentTuiLoopState {
            composer: TextareaComposer::from_draft(&ComposerDraftState {
                text: "draft".to_string(),
            }),
            ..AgentTuiLoopState::default()
        };

        assert_eq!(state.draft_text(), "draft");
        assert_eq!(state.draft_state().text, "draft");
        assert!(state.composer_has_draft());
    }

    #[test]
    fn ignores_empty_tick_outcomes() {
        let mut state = AgentTuiLoopState::default();
        let mut bridge = FakeBridge::default();

        assert_eq!(
            apply_input_tick_outcome(&mut state, &mut bridge, TerminalInputTickOutcome::NoInput),
            RenderLoopAction::None
        );
        assert_eq!(
            apply_input_tick_outcome(
                &mut state,
                &mut bridge,
                TerminalInputTickOutcome::NonKeyEventIgnored
            ),
            RenderLoopAction::None
        );
        assert!(bridge.submitted.is_empty());
        assert_eq!(bridge.interrupts, 0);
    }

    #[test]
    fn redraws_for_draft_changes_and_read_errors() {
        let mut state = AgentTuiLoopState::default();
        let mut bridge = FakeBridge::default();

        assert_eq!(
            apply_input_tick_outcome(
                &mut state,
                &mut bridge,
                TerminalInputTickOutcome::DraftEffect(ComposerDraftEffect::DraftChanged)
            ),
            RenderLoopAction::Redraw
        );
        assert_eq!(
            apply_input_tick_outcome(
                &mut state,
                &mut bridge,
                TerminalInputTickOutcome::ReadFailed("read failed".to_string())
            ),
            RenderLoopAction::Redraw
        );
        assert_eq!(state.last_error.as_deref(), Some("read failed"));
    }

    #[test]
    fn submits_operator_text_through_bridge() {
        let mut state = AgentTuiLoopState::default();
        let mut bridge = FakeBridge::default();

        assert_eq!(
            apply_input_tick_outcome(
                &mut state,
                &mut bridge,
                TerminalInputTickOutcome::DraftEffect(ComposerDraftEffect::SubmitRequested {
                    text: "run startup sequence".to_string()
                })
            ),
            RenderLoopAction::Redraw
        );
        assert_eq!(bridge.submitted, vec!["run startup sequence".to_string()]);
        assert!(state.last_error.is_none());
    }

    #[test]
    fn requests_interrupt_through_bridge() {
        let mut state = AgentTuiLoopState::default();
        let mut bridge = FakeBridge::default();

        assert_eq!(
            apply_input_tick_outcome(
                &mut state,
                &mut bridge,
                TerminalInputTickOutcome::DraftEffect(
                    ComposerDraftEffect::ClearOrInterruptRequested
                )
            ),
            RenderLoopAction::Redraw
        );
        assert_eq!(bridge.interrupts, 1);
    }

    #[test]
    fn records_bridge_failures_without_exiting() {
        let mut state = AgentTuiLoopState::default();
        let mut bridge = FakeBridge {
            fail_submit: true,
            ..FakeBridge::default()
        };

        assert_eq!(
            apply_input_tick_outcome(
                &mut state,
                &mut bridge,
                TerminalInputTickOutcome::DraftEffect(ComposerDraftEffect::SubmitRequested {
                    text: "run startup sequence".to_string()
                })
            ),
            RenderLoopAction::Redraw
        );
        assert_eq!(state.last_error.as_deref(), Some("submit failed"));
    }

    #[test]
    fn exit_effect_marks_loop_exit() {
        let mut state = AgentTuiLoopState::default();
        let mut bridge = FakeBridge::default();

        assert_eq!(
            apply_input_tick_outcome(
                &mut state,
                &mut bridge,
                TerminalInputTickOutcome::DraftEffect(ComposerDraftEffect::ExitRequested)
            ),
            RenderLoopAction::Exit
        );
        assert!(state.should_exit);
    }

    #[test]
    fn injected_interactive_loop_draws_polls_input_and_final_frame() {
        let control_path = temp_path("control");
        let session_path = temp_path("session");
        append(&control_path, CONTROL_FIXTURE.trim_end());
        append(&control_path, "\n");
        let mut runtime = runtime_for_paths(&control_path, &session_path);
        let mut state = AgentTuiLoopState {
            composer: TextareaComposer::from_draft(&ComposerDraftState {
                text: "live note".to_string(),
            }),
            ..AgentTuiLoopState::default()
        };
        let mut terminal = FakeTerminalFrame::new();
        let mut input = input_source([TerminalInputTickOutcome::NoInput]);
        let mut clock = clock_source();

        let summary = run_injected_interactive_loop(
            &mut runtime,
            &mut state,
            &mut terminal,
            &mut input,
            &mut clock,
            1,
        )
        .expect("interactive loop succeeds");

        assert_eq!(summary.steps_attempted, 1);
        assert!(!summary.exited_by_input);
        assert!(summary.final_drawn);
        assert_eq!(terminal.draw_count, 2);
        assert_eq!(terminal.composer_texts, vec!["live note", "live note"]);
        assert!(terminal
            .prompt_labels
            .iter()
            .all(|label| label == "operator -> sonar.resident>"));
        assert!(terminal.transcript_counts[0] >= 1);
        assert!(terminal.transcript_counts[1] >= 1);

        remove_file(control_path).ok();
        remove_file(session_path).ok();
    }

    #[test]
    fn injected_interactive_loop_queues_submit_during_active_turn() {
        let control_path = temp_path("control-submit");
        let session_path = temp_path("session-submit");
        append(&control_path, "");
        let mut runtime = runtime_for_paths(&control_path, &session_path);
        runtime
            .coordinator_mut()
            .queue_mut()
            .set_turn_state(TurnState::Active);
        let mut state = AgentTuiLoopState::default();
        let mut terminal = FakeTerminalFrame::new();
        let mut input = input_source([TerminalInputTickOutcome::DraftEffect(
            ComposerDraftEffect::SubmitRequested {
                text: "queued operator note".to_string(),
            },
        )]);
        let mut clock = clock_source();

        let summary = run_injected_interactive_loop(
            &mut runtime,
            &mut state,
            &mut terminal,
            &mut input,
            &mut clock,
            1,
        )
        .expect("interactive loop queues submit");

        assert_eq!(summary.steps_attempted, 1);
        assert!(!summary.exited_by_input);
        assert_eq!(terminal.draw_count, 2);
        assert_eq!(
            terminal.prompt_labels,
            vec![
                "operator note -> sonar.resident>".to_string(),
                "operator note -> sonar.resident>".to_string()
            ]
        );
        assert!(terminal
            .status_lines
            .last()
            .expect("final status exists")
            .contains("queued=1"));

        remove_file(control_path).ok();
        remove_file(session_path).ok();
    }

    #[test]
    fn injected_interactive_loop_accepts_real_terminal_key_events() {
        let control_path = temp_path("control-key-events");
        let session_path = temp_path("session-key-events");
        append(&control_path, "");
        let mut runtime = runtime_for_paths(&control_path, &session_path);
        let mut state = AgentTuiLoopState::default();
        let mut terminal = FakeTerminalFrame::new();
        let mut reader = terminal_reader([
            key_event(KeyCode::Char('h'), KeyModifiers::NONE),
            key_event(KeyCode::Char('i'), KeyModifiers::NONE),
            key_event(KeyCode::Enter, KeyModifiers::NONE),
            key_event(KeyCode::Char('c'), KeyModifiers::CONTROL),
        ]);
        let mut input = TerminalInputTickSource {
            reader: &mut reader,
            wait: Duration::from_millis(0),
        };
        let mut clock = clock_source();

        let summary = run_injected_interactive_loop(
            &mut runtime,
            &mut state,
            &mut terminal,
            &mut input,
            &mut clock,
            10,
        )
        .expect("interactive loop accepts terminal key events");

        assert_eq!(summary.steps_attempted, 4);
        assert!(summary.exited_by_input);
        assert!(summary.final_drawn);
        assert_eq!(state.draft_text(), "");

        let session_jsonl = read_to_string(&session_path).expect("session jsonl exists");
        assert!(session_jsonl.contains("\"source_kind\":\"operator\""));
        assert!(session_jsonl.contains("\"transport\":\"interactive_terminal\""));
        assert!(session_jsonl.contains("hi"));
        assert!(session_jsonl.contains("\"provider_request_status\":\"recorded_not_dispatched\""));

        let mut transcript = TranscriptStore::new();
        transcript
            .ingest_jsonl_file_summary(&session_path)
            .expect("session transcript ingests");
        assert_eq!(transcript.items()[0].actor.as_str(), "operator");
        assert_eq!(transcript.items()[0].text, "hi");

        remove_file(control_path).ok();
        remove_file(session_path).ok();
    }

    #[test]
    fn injected_interactive_loop_accepts_operator_submit_and_later_control_input() {
        let control_path = temp_path("control-live-input");
        let session_path = temp_path("session-live-input");
        append(&control_path, "");
        let mut runtime = runtime_for_paths(&control_path, &session_path);
        let mut state = AgentTuiLoopState::default();
        let mut terminal = FakeTerminalFrame::new();
        let mut input = appending_input_source(
            control_path.clone(),
            [
                TerminalInputTickOutcome::DraftEffect(ComposerDraftEffect::SubmitRequested {
                    text: "hello from live tui".to_string(),
                }),
                TerminalInputTickOutcome::NoInput,
                TerminalInputTickOutcome::DraftEffect(ComposerDraftEffect::ExitRequested),
            ],
        );
        let mut clock = clock_source();

        let summary = run_injected_interactive_loop(
            &mut runtime,
            &mut state,
            &mut terminal,
            &mut input,
            &mut clock,
            10,
        )
        .expect("interactive loop admits terminal and control inputs");

        assert_eq!(summary.steps_attempted, 3);
        assert!(summary.exited_by_input);
        assert!(summary.final_drawn);
        assert!(input.appended);

        let session_jsonl = read_to_string(&session_path).expect("session jsonl exists");
        assert!(session_jsonl.contains("\"source_kind\":\"operator\""));
        assert!(session_jsonl.contains("\"transport\":\"interactive_terminal\""));
        assert!(session_jsonl.contains("hello from live tui"));
        assert!(session_jsonl.contains("\"source_kind\":\"system\""));
        assert!(session_jsonl.contains("run startup sequence"));
        assert!(session_jsonl.contains("\"provider_request_status\":\"recorded_not_dispatched\""));

        let events = session_jsonl
            .lines()
            .map(|line| parse_session_event(line).expect("session event parses"))
            .collect::<Vec<_>>();
        assert!(!events.iter().any(|event| matches!(
            event.event_kind,
            SessionEventKind::ProviderToolCallRequested
                | SessionEventKind::ToolCallRequested
                | SessionEventKind::ToolResultReceived
        )));

        let mut transcript = TranscriptStore::new();
        transcript
            .ingest_jsonl_file_summary(&session_path)
            .expect("session transcript ingests");
        let projected = transcript
            .items()
            .iter()
            .map(|item| (item.actor.as_str().to_string(), item.text.clone()))
            .collect::<Vec<_>>();
        assert_eq!(
            projected[0],
            ("operator".to_string(), "hello from live tui".to_string())
        );
        let operator_index = projected
            .iter()
            .position(|item| item == &("operator".to_string(), "hello from live tui".to_string()))
            .expect("operator input projected");
        let system_index = projected
            .iter()
            .position(|item| item == &("system".to_string(), "run startup sequence".to_string()))
            .expect("system input projected");
        assert!(operator_index < system_index);

        remove_file(control_path).ok();
        remove_file(session_path).ok();
    }

    #[test]
    fn injected_interactive_loop_exits_after_exit_input_and_still_final_draws() {
        let control_path = temp_path("control-exit");
        let session_path = temp_path("session-exit");
        append(&control_path, "");
        let mut runtime = runtime_for_paths(&control_path, &session_path);
        let mut state = AgentTuiLoopState::default();
        let mut terminal = FakeTerminalFrame::new();
        let mut input = input_source([TerminalInputTickOutcome::DraftEffect(
            ComposerDraftEffect::ExitRequested,
        )]);
        let mut clock = clock_source();

        let summary = run_injected_interactive_loop(
            &mut runtime,
            &mut state,
            &mut terminal,
            &mut input,
            &mut clock,
            5,
        )
        .expect("interactive loop exits cleanly");

        assert_eq!(summary.steps_attempted, 1);
        assert!(summary.exited_by_input);
        assert!(summary.final_drawn);
        assert!(state.should_exit);
        assert_eq!(terminal.draw_count, 2);

        remove_file(control_path).ok();
        remove_file(session_path).ok();
    }

    #[test]
    fn injected_interactive_loop_surfaces_input_read_failure_without_stopping() {
        let control_path = temp_path("control-read-failure");
        let session_path = temp_path("session-read-failure");
        append(&control_path, "");
        let mut runtime = runtime_for_paths(&control_path, &session_path);
        let mut state = AgentTuiLoopState::default();
        let mut terminal = FakeTerminalFrame::new();
        let mut input = input_source([TerminalInputTickOutcome::ReadFailed(
            "read failed".to_string(),
        )]);
        let mut clock = clock_source();

        let summary = run_injected_interactive_loop(
            &mut runtime,
            &mut state,
            &mut terminal,
            &mut input,
            &mut clock,
            1,
        )
        .expect("interactive loop records read failure");

        assert_eq!(summary.steps_attempted, 1);
        assert!(!summary.exited_by_input);
        assert_eq!(state.last_error.as_deref(), Some("read failed"));
        assert_eq!(terminal.draw_count, 2);
        assert!(terminal
            .status_lines
            .last()
            .expect("final status exists")
            .contains("error=read failed"));

        remove_file(control_path).ok();
        remove_file(session_path).ok();
    }

    #[test]
    fn injected_interactive_loop_surfaces_malformed_control_jsonl_without_stopping() {
        let control_path = temp_path("control-malformed");
        let session_path = temp_path("session-malformed");
        append(&control_path, "{not valid json}\n");
        let mut runtime = runtime_for_paths(&control_path, &session_path);
        let mut state = AgentTuiLoopState::default();
        let mut terminal = FakeTerminalFrame::new();
        let mut input = input_source([TerminalInputTickOutcome::NoInput]);
        let mut clock = clock_source();

        let summary = run_injected_interactive_loop(
            &mut runtime,
            &mut state,
            &mut terminal,
            &mut input,
            &mut clock,
            1,
        )
        .expect("interactive loop records malformed control jsonl");

        assert_eq!(summary.steps_attempted, 1);
        assert!(!summary.exited_by_input);
        assert_eq!(
            state.last_error.as_deref(),
            Some("control_jsonl_parse_errors:1")
        );
        assert_eq!(terminal.draw_count, 2);
        assert!(terminal
            .status_lines
            .last()
            .expect("final status exists")
            .contains("error=control_jsonl_parse_errors:1"));

        remove_file(control_path).ok();
        remove_file(session_path).ok();
    }
}
