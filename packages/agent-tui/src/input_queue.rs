use crate::carrier_protocol::{
    ControlInputEvent, DeliveryMode, HoldCondition, InputEvent, SessionEvent, SessionEventKind,
    SourceKind, SESSION_EVENT_SCHEMA,
};
use serde_json::{json, Value};
use std::collections::VecDeque;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TurnState {
    Idle,
    Active,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum AdmissionDecision {
    AdmitNow {
        input_event_id: String,
    },
    QueueForTurnBoundary {
        input_event_id: String,
    },
    HoldForComposerClear {
        input_event_id: String,
        directive_id: Option<String>,
        original_delivery_mode: DeliveryMode,
    },
}

#[derive(Debug, Clone)]
pub struct SessionEvidenceContext {
    pub carrier_session_id: String,
    pub agent_id: String,
    pub site_id: String,
    pub site_root: String,
}

#[derive(Debug, Clone)]
pub struct QueuedInputRelease {
    pub input_event_id: String,
    pub directive_id: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct QueuedInputSummary {
    pub index: usize,
    pub input_event_id: String,
    pub source_kind: SourceKind,
    pub content_preview: String,
}

#[derive(Debug, Default)]
pub struct InputQueue {
    turn_state: TurnState,
    ready_for_current_turn: VecDeque<InputEvent>,
    queued_for_turn_boundary: VecDeque<InputEvent>,
    held_for_composer_clear: VecDeque<InputEvent>,
}

impl Default for TurnState {
    fn default() -> Self {
        Self::Idle
    }
}

impl InputQueue {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn turn_state(&self) -> TurnState {
        self.turn_state
    }

    pub fn set_turn_state(&mut self, state: TurnState) {
        self.turn_state = state;
    }

    pub fn queued_count(&self) -> usize {
        self.queued_for_turn_boundary.len()
    }

    pub fn queued_summaries(&self) -> Vec<QueuedInputSummary> {
        self.queued_for_turn_boundary
            .iter()
            .enumerate()
            .map(|(index, input)| QueuedInputSummary {
                index: index + 1,
                input_event_id: input.event_id.clone(),
                source_kind: input.source_kind.clone(),
                content_preview: input.content.lines().next().unwrap_or_default().to_string(),
            })
            .collect()
    }

    pub fn drop_queued_by_index(&mut self, index: usize) -> Option<InputEvent> {
        if index == 0 || index > self.queued_for_turn_boundary.len() {
            return None;
        }
        self.queued_for_turn_boundary.remove(index - 1)
    }

    pub fn clear_queued_operator_inputs(&mut self) -> Vec<InputEvent> {
        let mut retained = VecDeque::new();
        let mut dropped = Vec::new();
        while let Some(input) = self.queued_for_turn_boundary.pop_front() {
            if input.source_kind == SourceKind::Operator {
                dropped.push(input);
            } else {
                retained.push_back(input);
            }
        }
        self.queued_for_turn_boundary = retained;
        dropped
    }

    pub fn held_count(&self) -> usize {
        self.held_for_composer_clear.len()
    }

    pub fn admit_control_event(
        &mut self,
        event: ControlInputEvent,
        composer_has_draft: bool,
    ) -> AdmissionDecision {
        self.admit_input_event(event.input, composer_has_draft)
    }

    pub fn admit_input_event(
        &mut self,
        input: InputEvent,
        composer_has_draft: bool,
    ) -> AdmissionDecision {
        let input_event_id = input.event_id.clone();

        if input.hold_condition == Some(HoldCondition::ComposerClearRequired) && composer_has_draft
        {
            let directive_id = input.directive_id.clone();
            let original_delivery_mode = input.delivery_mode.clone();
            self.held_for_composer_clear.push_back(input);
            return AdmissionDecision::HoldForComposerClear {
                input_event_id,
                directive_id,
                original_delivery_mode,
            };
        }

        if self.turn_state == TurnState::Active
            || input.delivery_mode == DeliveryMode::AdmitAfterActiveTurn
        {
            self.queued_for_turn_boundary.push_back(input);
            return AdmissionDecision::QueueForTurnBoundary { input_event_id };
        }

        self.ready_for_current_turn.push_back(input);
        AdmissionDecision::AdmitNow { input_event_id }
    }

    pub fn release_held_when_composer_clear(&mut self) -> Vec<QueuedInputRelease> {
        let mut released = Vec::new();
        while let Some(input) = self.held_for_composer_clear.pop_front() {
            released.push(QueuedInputRelease {
                input_event_id: input.event_id.clone(),
                directive_id: input.directive_id.clone(),
            });
            self.queued_for_turn_boundary.push_back(input);
        }
        released
    }

    pub fn next_ready_input(&mut self) -> Option<InputEvent> {
        if self.turn_state == TurnState::Active {
            return None;
        }
        self.ready_for_current_turn
            .pop_front()
            .or_else(|| self.queued_for_turn_boundary.pop_front())
    }
}

impl AdmissionDecision {
    pub fn to_session_event(
        &self,
        context: &SessionEvidenceContext,
        event_id: impl Into<String>,
        occurred_at: impl Into<String>,
    ) -> SessionEvent {
        let occurred_at = occurred_at.into();
        match self {
            AdmissionDecision::AdmitNow { input_event_id } => session_event(
                context,
                SessionEventKind::InputAdmittedToTurn,
                event_id,
                occurred_at,
                json!({ "input_event_id": input_event_id }),
            ),
            AdmissionDecision::QueueForTurnBoundary { input_event_id } => session_event(
                context,
                SessionEventKind::InputQueuedForTurnBoundary,
                event_id,
                occurred_at,
                json!({
                    "input_event_id": input_event_id,
                    "queue_state": "queued_for_turn_boundary"
                }),
            ),
            AdmissionDecision::HoldForComposerClear {
                input_event_id,
                directive_id,
                original_delivery_mode,
            } => {
                let event_occurred_at = occurred_at.clone();
                let mut payload = json!({
                    "input_event_id": input_event_id,
                    "held_at": occurred_at,
                    "held_reason": "composer_nonempty",
                    "original_delivery_mode": original_delivery_mode
                });
                insert_optional_directive_id(&mut payload, directive_id);
                session_event(
                    context,
                    SessionEventKind::SystemDirectiveHeld,
                    event_id,
                    event_occurred_at,
                    payload,
                )
            }
        }
    }
}

impl QueuedInputRelease {
    pub fn to_session_event(
        &self,
        context: &SessionEvidenceContext,
        event_id: impl Into<String>,
        occurred_at: impl Into<String>,
    ) -> SessionEvent {
        let occurred_at = occurred_at.into();
        let event_occurred_at = occurred_at.clone();
        let mut payload = json!({
            "input_event_id": self.input_event_id,
            "released_at": occurred_at,
            "released_reason": "composer_clear"
        });
        insert_optional_directive_id(&mut payload, &self.directive_id);
        session_event(
            context,
            SessionEventKind::SystemDirectiveReleased,
            event_id,
            event_occurred_at,
            payload,
        )
    }
}

fn insert_optional_directive_id(payload: &mut Value, directive_id: &Option<String>) {
    if let (Some(map), Some(directive_id)) = (payload.as_object_mut(), directive_id) {
        map.insert(
            "directive_id".to_string(),
            Value::String(directive_id.clone()),
        );
    }
}

fn session_event(
    context: &SessionEvidenceContext,
    kind: SessionEventKind,
    event_id: impl Into<String>,
    occurred_at: impl Into<String>,
    payload: serde_json::Value,
) -> SessionEvent {
    SessionEvent {
        schema: SESSION_EVENT_SCHEMA.to_string(),
        event_kind: kind,
        event_id: event_id.into(),
        occurred_at: occurred_at.into(),
        carrier_session_id: context.carrier_session_id.clone(),
        agent_id: context.agent_id.clone(),
        site_id: context.site_id.clone(),
        site_root: context.site_root.clone(),
        payload,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::carrier_protocol::{
        parse_control_input_event, parse_input_event, parse_session_event,
    };

    const CONTROL_FIXTURE: &str =
        include_str!("../../carrier-protocol/fixtures/control-input-event.json");
    const INPUT_FIXTURE: &str = include_str!("../../carrier-protocol/fixtures/input-event.json");

    fn evidence_context() -> SessionEvidenceContext {
        SessionEvidenceContext {
            carrier_session_id: "carrier_fixture_1".to_string(),
            agent_id: "sonar.resident".to_string(),
            site_id: "narada-sonar".to_string(),
            site_root: "D:/code/narada.sonar".to_string(),
        }
    }

    #[test]
    fn admits_idle_current_turn_input_now() {
        let input = parse_input_event(INPUT_FIXTURE).expect("input fixture parses");
        let mut queue = InputQueue::new();

        let decision = queue.admit_input_event(input, false);
        assert!(matches!(decision, AdmissionDecision::AdmitNow { .. }));
        assert_eq!(queue.queued_count(), 0);
        assert_eq!(queue.held_count(), 0);
    }

    #[test]
    fn queues_input_when_turn_is_active() {
        let input = parse_input_event(INPUT_FIXTURE).expect("input fixture parses");
        let mut queue = InputQueue::new();
        queue.set_turn_state(TurnState::Active);

        let decision = queue.admit_input_event(input, false);
        assert!(matches!(
            decision,
            AdmissionDecision::QueueForTurnBoundary { .. }
        ));
        assert_eq!(queue.queued_count(), 1);
        assert!(queue.next_ready_input().is_none());

        queue.set_turn_state(TurnState::Idle);
        assert!(queue.next_ready_input().is_some());
    }

    #[test]
    fn holds_system_directive_until_composer_is_clear() {
        let event = parse_control_input_event(CONTROL_FIXTURE).expect("control fixture parses");
        assert_eq!(event.input.source_kind, SourceKind::System);
        let mut queue = InputQueue::new();

        let decision = queue.admit_control_event(event, true);
        assert!(matches!(
            decision,
            AdmissionDecision::HoldForComposerClear { .. }
        ));
        assert_eq!(queue.held_count(), 1);
        assert_eq!(queue.queued_count(), 0);

        let released = queue.release_held_when_composer_clear();
        assert_eq!(released.len(), 1);
        assert_eq!(queue.held_count(), 0);
        assert_eq!(queue.queued_count(), 1);
        assert!(queue.next_ready_input().is_some());
    }

    #[test]
    fn after_active_turn_delivery_queues_even_when_idle() {
        let mut input = parse_input_event(INPUT_FIXTURE).expect("input fixture parses");
        input.delivery_mode = DeliveryMode::AdmitAfterActiveTurn;
        let mut queue = InputQueue::new();

        let decision = queue.admit_input_event(input, false);
        assert!(matches!(
            decision,
            AdmissionDecision::QueueForTurnBoundary { .. }
        ));
        assert_eq!(queue.queued_count(), 1);
    }

    #[test]
    fn admission_decision_emits_valid_session_event() {
        let input = parse_input_event(INPUT_FIXTURE).expect("input fixture parses");
        let mut queue = InputQueue::new();
        queue.set_turn_state(TurnState::Active);
        let decision = queue.admit_input_event(input, false);

        let event = decision.to_session_event(
            &evidence_context(),
            "session_event_queue_1",
            "2026-05-30T00:00:02.000Z",
        );
        assert_eq!(
            event.event_kind,
            SessionEventKind::InputQueuedForTurnBoundary
        );
        assert_eq!(event.payload["queue_state"], "queued_for_turn_boundary");

        let serialized = serde_json::to_string(&event).expect("session event serializes");
        assert!(parse_session_event(&serialized).is_ok());
    }

    #[test]
    fn queued_summaries_are_one_based_and_preview_first_line() {
        let mut input = parse_input_event(INPUT_FIXTURE).expect("input fixture parses");
        input.content = "first line\nsecond line".to_string();
        let mut queue = InputQueue::new();
        queue.set_turn_state(TurnState::Active);
        let _decision = queue.admit_input_event(input, false);

        let summaries = queue.queued_summaries();
        assert_eq!(summaries.len(), 1);
        assert_eq!(summaries[0].index, 1);
        assert_eq!(summaries[0].content_preview, "first line");
    }

    #[test]
    fn drops_queued_input_by_one_based_index() {
        let input = parse_input_event(INPUT_FIXTURE).expect("input fixture parses");
        let mut queue = InputQueue::new();
        queue.set_turn_state(TurnState::Active);
        let _decision = queue.admit_input_event(input, false);

        let dropped = queue.drop_queued_by_index(1).expect("queued input drops");
        assert_eq!(dropped.event_id, "input_fixture_1");
        assert_eq!(queue.queued_count(), 0);
        assert!(queue.drop_queued_by_index(1).is_none());
    }

    #[test]
    fn clear_queued_operator_inputs_retains_system_inputs() {
        let operator_input = parse_input_event(INPUT_FIXTURE).expect("input fixture parses");
        let system_event =
            parse_control_input_event(CONTROL_FIXTURE).expect("control fixture parses");
        let mut queue = InputQueue::new();
        queue.set_turn_state(TurnState::Active);
        let _operator = queue.admit_input_event(operator_input, false);
        let _system = queue.admit_control_event(system_event, false);

        let dropped = queue.clear_queued_operator_inputs();
        assert_eq!(dropped.len(), 1);
        assert_eq!(dropped[0].source_kind, SourceKind::Operator);
        assert_eq!(queue.queued_count(), 1);
    }

    #[test]
    fn release_emits_valid_session_event() {
        let event = parse_control_input_event(CONTROL_FIXTURE).expect("control fixture parses");
        let mut queue = InputQueue::new();
        let _decision = queue.admit_control_event(event, true);
        let released = queue.release_held_when_composer_clear();

        let event = released[0].to_session_event(
            &evidence_context(),
            "session_event_release_1",
            "2026-05-30T00:00:03.000Z",
        );
        assert_eq!(event.event_kind, SessionEventKind::SystemDirectiveReleased);
        assert_eq!(event.payload["released_reason"], "composer_clear");
        assert_eq!(event.payload["released_at"], "2026-05-30T00:00:03.000Z");

        let serialized = serde_json::to_string(&event).expect("session event serializes");
        assert!(parse_session_event(&serialized).is_ok());
    }
}
