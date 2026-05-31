use crate::composer_view_model::{build_composer_view, ComposerViewInput, ComposerViewModel};
use crate::layout_model::{compute_layout, AgentTuiLayout, LayoutConfig, TerminalSize};
use crate::status_view_model::{build_status_view, StatusViewInput, StatusViewModel};
use crate::transcript_projection::TranscriptItem;
use crate::transcript_view_model::{build_transcript_rows, TranscriptRow};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AppViewInput {
    pub terminal_size: TerminalSize,
    pub layout_config: LayoutConfig,
    pub transcript_items: Vec<TranscriptItem>,
    pub status: StatusViewInput,
    pub composer: ComposerViewInput,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AppViewModel {
    pub layout: AgentTuiLayout,
    pub transcript_rows: Vec<TranscriptRow>,
    pub status: StatusViewModel,
    pub composer: ComposerViewModel,
}

pub fn build_app_view(input: &AppViewInput) -> AppViewModel {
    AppViewModel {
        layout: compute_layout(input.terminal_size, input.layout_config),
        transcript_rows: build_transcript_rows(&input.transcript_items),
        status: build_status_view(&input.status),
        composer: build_composer_view(&input.composer),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::input_queue::TurnState;
    use crate::status_view_model::{McpRuntimeState, ProviderRuntimeState};
    use crate::transcript_projection::{TranscriptActor, TranscriptItemKind};

    fn input() -> AppViewInput {
        AppViewInput {
            terminal_size: TerminalSize {
                width: 100,
                height: 20,
            },
            layout_config: LayoutConfig::default(),
            transcript_items: vec![TranscriptItem {
                kind: TranscriptItemKind::InputAdmitted,
                actor: TranscriptActor::Operator,
                turn_id: "turn_1".to_string(),
                text: "run startup sequence".to_string(),
                sequence: None,
                projection_key: None,
            }],
            status: StatusViewInput {
                identity: "sonar.resident".to_string(),
                session: "carrier_1".to_string(),
                turn_state: TurnState::Idle,
                queued_inputs: 0,
                held_system_directives: 0,
                transcript_items: 1,
                provider_state: ProviderRuntimeState::Disabled,
                mcp_state: McpRuntimeState::Disabled,
                last_error: None,
            },
            composer: ComposerViewInput {
                identity: "sonar.resident".to_string(),
                draft_text: "hello".to_string(),
                turn_state: TurnState::Idle,
                queued_operator_notes: 0,
                held_system_directives: 0,
            },
        }
    }

    #[test]
    fn builds_aggregate_view_model() {
        let model = build_app_view(&input());

        assert_eq!(model.layout.transcript.width, 100);
        assert_eq!(model.layout.composer.height, 3);
        assert_eq!(model.transcript_rows.len(), 1);
        assert_eq!(model.transcript_rows[0].actor_label, "operator");
        assert_eq!(model.status.compact_line, "agent=sonar.resident | session=carrier_1 | turn=idle | queued=0 | held=0 | transcript=1 | provider=provider_disabled | mcp=mcp_disabled | error=none");
        assert_eq!(model.composer.prompt_label, "operator -> sonar.resident>");
    }

    #[test]
    fn reflects_active_turn_state_across_status_and_composer() {
        let model = build_app_view(&AppViewInput {
            status: StatusViewInput {
                turn_state: TurnState::Active,
                provider_state: ProviderRuntimeState::Working,
                queued_inputs: 2,
                ..input().status
            },
            composer: ComposerViewInput {
                turn_state: TurnState::Active,
                queued_operator_notes: 2,
                ..input().composer
            },
            ..input()
        });

        assert_eq!(model.status.segments[2].value, "active");
        assert_eq!(model.status.segments[3].value, "2");
        assert_eq!(model.status.segments[6].value, "provider_working");
        assert_eq!(
            model.composer.prompt_label,
            "operator note -> sonar.resident>"
        );
        assert_eq!(model.composer.submit_hint, "Enter queues note");
    }
}
