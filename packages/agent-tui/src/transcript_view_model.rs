use crate::transcript_projection::{TranscriptActor, TranscriptItem, TranscriptItemKind};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TranscriptRow {
    pub key: String,
    pub actor: TranscriptActor,
    pub actor_label: String,
    pub kind: TranscriptItemKind,
    pub turn_id: String,
    pub text: String,
}

pub fn build_transcript_rows(items: &[TranscriptItem]) -> Vec<TranscriptRow> {
    items
        .iter()
        .enumerate()
        .map(|(index, item)| build_transcript_row(index, item))
        .collect()
}

pub fn build_transcript_row(index: usize, item: &TranscriptItem) -> TranscriptRow {
    TranscriptRow {
        key: stable_row_key(index, item),
        actor: item.actor.clone(),
        actor_label: actor_label(&item.actor).to_string(),
        kind: item.kind.clone(),
        turn_id: item.turn_id.clone(),
        text: item.text.clone(),
    }
}

fn stable_row_key(index: usize, item: &TranscriptItem) -> String {
    let turn = if item.turn_id.is_empty() {
        "session".to_string()
    } else {
        item.turn_id.clone()
    };
    let sequence = item
        .sequence
        .map(|value| value.to_string())
        .unwrap_or_else(|| "none".to_string());
    format!(
        "row_{index}_{}_{}_{}",
        turn,
        transcript_kind_slug(&item.kind),
        sequence
    )
}

fn actor_label(actor: &TranscriptActor) -> &'static str {
    match actor {
        TranscriptActor::Operator => "operator",
        TranscriptActor::System => "system",
        TranscriptActor::Agent => "agent",
        TranscriptActor::AgentTui => "agent-tui",
        TranscriptActor::Provider => "provider",
    }
}

fn transcript_kind_slug(kind: &TranscriptItemKind) -> &'static str {
    match kind {
        TranscriptItemKind::InputAdmitted => "input_admitted",
        TranscriptItemKind::SystemDirectiveHeld => "system_directive_held",
        TranscriptItemKind::SystemDirectiveReleased => "system_directive_released",
        TranscriptItemKind::ProviderTextDelta => "provider_text_delta",
        TranscriptItemKind::ProviderToolCallRequest => "provider_tool_call_request",
        TranscriptItemKind::TurnTerminalStatus => "turn_terminal_status",
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn item(
        kind: TranscriptItemKind,
        actor: TranscriptActor,
        turn_id: &str,
        text: &str,
        sequence: Option<u64>,
    ) -> TranscriptItem {
        TranscriptItem {
            kind,
            actor,
            turn_id: turn_id.to_string(),
            text: text.to_string(),
            sequence,
            projection_key: None,
        }
    }

    #[test]
    fn builds_rows_in_transcript_order() {
        let rows = build_transcript_rows(&[
            item(
                TranscriptItemKind::InputAdmitted,
                TranscriptActor::Operator,
                "turn_1",
                "run startup sequence",
                None,
            ),
            item(
                TranscriptItemKind::ProviderTextDelta,
                TranscriptActor::Agent,
                "turn_1",
                "done",
                Some(1),
            ),
        ]);

        assert_eq!(rows.len(), 2);
        assert_eq!(rows[0].actor_label, "operator");
        assert_eq!(rows[0].text, "run startup sequence");
        assert_eq!(rows[1].actor_label, "agent");
        assert_eq!(rows[1].text, "done");
    }

    #[test]
    fn builds_stable_keys_from_order_turn_kind_and_sequence() {
        let rows = build_transcript_rows(&[
            item(
                TranscriptItemKind::ProviderTextDelta,
                TranscriptActor::Agent,
                "turn_1",
                "hello",
                Some(3),
            ),
            item(
                TranscriptItemKind::TurnTerminalStatus,
                TranscriptActor::AgentTui,
                "turn_1",
                "completed",
                None,
            ),
        ]);

        assert_eq!(rows[0].key, "row_0_turn_1_provider_text_delta_3");
        assert_eq!(rows[1].key, "row_1_turn_1_turn_terminal_status_none");
    }

    #[test]
    fn uses_session_key_scope_for_rows_without_turn_id() {
        let rows = build_transcript_rows(&[item(
            TranscriptItemKind::SystemDirectiveHeld,
            TranscriptActor::System,
            "",
            "system directive held input_1",
            None,
        )]);

        assert_eq!(rows[0].key, "row_0_session_system_directive_held_none");
        assert_eq!(rows[0].actor_label, "system");
    }
}
