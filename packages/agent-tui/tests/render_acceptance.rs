use narada_agent_tui::app_view_model::{build_app_view, AppViewInput};
use narada_agent_tui::composer_view_model::ComposerViewInput;
use narada_agent_tui::input_queue::TurnState;
use narada_agent_tui::layout_model::{LayoutConfig, Rect, TerminalSize};
use narada_agent_tui::ratatui_renderer::render_app_to_buffer;
use narada_agent_tui::status_view_model::{ProviderRuntimeState, StatusViewInput};
use narada_agent_tui::transcript_projection::{
    TranscriptActor, TranscriptItem, TranscriptItemKind,
};
use ratatui::buffer::Buffer;
use ratatui::layout::Rect as TuiRect;

fn acceptance_view(width: u16, height: u16) -> narada_agent_tui::app_view_model::AppViewModel {
    build_app_view(&AppViewInput {
        terminal_size: TerminalSize { width, height },
        layout_config: LayoutConfig::default(),
        transcript_items: vec![
            TranscriptItem {
                kind: TranscriptItemKind::InputAdmitted,
                actor: TranscriptActor::Operator,
                turn_id: "turn_1".to_string(),
                text: "run startup sequence".to_string(),
                sequence: None,
                projection_key: None,
            },
            TranscriptItem {
                kind: TranscriptItemKind::TurnTerminalStatus,
                actor: TranscriptActor::AgentTui,
                turn_id: "turn_1".to_string(),
                text: "completed_without_provider".to_string(),
                sequence: None,
                projection_key: None,
            },
        ],
        status: StatusViewInput {
            identity: "sonar.resident".to_string(),
            session: "carrier_fixture_1".to_string(),
            turn_state: TurnState::Idle,
            queued_inputs: 0,
            held_system_directives: 0,
            transcript_items: 2,
            provider_state: ProviderRuntimeState::Disabled,
            last_error: None,
        },
        composer: ComposerViewInput {
            identity: "sonar.resident".to_string(),
            draft_text: "operator draft".to_string(),
            turn_state: TurnState::Idle,
            queued_operator_notes: 0,
            held_system_directives: 0,
        },
    })
}

fn buffer_text(buffer: &Buffer) -> String {
    let area = buffer.area;
    let mut output = String::new();
    for y in area.y..area.y + area.height {
        for x in area.x..area.x + area.width {
            output.push_str(buffer[(x, y)].symbol());
        }
        output.push('\n');
    }
    output
}

fn nonblank_cells(buffer: &Buffer) -> usize {
    let area = buffer.area;
    let mut count = 0;
    for y in area.y..area.y + area.height {
        for x in area.x..area.x + area.width {
            if buffer[(x, y)].symbol() != " " {
                count += 1;
            }
        }
    }
    count
}

#[test]
fn renderer_acceptance_frame_is_nonblank_and_contains_core_regions() {
    let model = acceptance_view(100, 20);
    let mut buffer = Buffer::empty(TuiRect::new(0, 0, 100, 20));

    render_app_to_buffer(&model, &mut buffer);
    let text = buffer_text(&buffer);

    assert!(nonblank_cells(&buffer) > 100);
    assert!(text.contains("Transcript"));
    assert!(text.contains("operator: run startup sequence"));
    assert!(text.contains("agent-tui: completed_without_provider"));
    assert!(text.contains("agent=sonar.resident"));
    assert!(text.contains("Composer"));
    assert!(text.contains("operator -> sonar.resident>"));
    assert!(text.contains("operator draft"));
}

#[test]
fn renderer_acceptance_layout_rectangles_are_stable() {
    let model = acceptance_view(100, 20);

    assert_eq!(
        model.layout.transcript,
        Rect {
            x: 0,
            y: 0,
            width: 100,
            height: 16,
        }
    );
    assert_eq!(
        model.layout.status,
        Rect {
            x: 0,
            y: 16,
            width: 100,
            height: 1,
        }
    );
    assert_eq!(
        model.layout.composer,
        Rect {
            x: 0,
            y: 17,
            width: 100,
            height: 3,
        }
    );
    assert_eq!(model.layout.composer.y + model.layout.composer.height, 20);
}

#[test]
fn renderer_acceptance_preserves_composer_draft_in_compact_frame() {
    let model = acceptance_view(60, 8);
    let mut buffer = Buffer::empty(TuiRect::new(0, 0, 60, 8));

    render_app_to_buffer(&model, &mut buffer);
    let text = buffer_text(&buffer);

    assert!(nonblank_cells(&buffer) > 30);
    assert_eq!(model.layout.transcript.height, 4);
    assert_eq!(model.layout.status.y, 4);
    assert_eq!(model.layout.composer.y, 5);
    assert_eq!(model.layout.composer.y + model.layout.composer.height, 8);
    assert!(text.contains("operator draft"));
}
