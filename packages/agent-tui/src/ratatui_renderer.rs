use crate::app_view_model::AppViewModel;
use crate::composer_draft::ComposerDraftState;
use crate::layout_model::Rect;
use crate::textarea_composer::TextareaComposer;
use ratatui::buffer::Buffer;
use ratatui::layout::Rect as TuiRect;
use ratatui::widgets::{Block, Borders, Paragraph, Widget};

pub fn render_app_to_buffer(model: &AppViewModel, buffer: &mut Buffer) {
    let composer = TextareaComposer::from_draft(&ComposerDraftState {
        text: model.composer.draft_text.clone(),
    });
    render_app_to_buffer_with_composer(model, &composer, buffer);
}

pub fn render_app_to_buffer_with_composer(
    model: &AppViewModel,
    composer: &TextareaComposer,
    buffer: &mut Buffer,
) {
    render_transcript_to_buffer(model, buffer);
    render_status_to_buffer(model, buffer);
    render_textarea_composer_to_buffer(model, composer, buffer);
}

pub fn render_app_to_frame(model: &AppViewModel, frame: &mut ratatui::Frame<'_>) {
    let composer = TextareaComposer::from_draft(&ComposerDraftState {
        text: model.composer.draft_text.clone(),
    });
    render_app_to_frame_with_composer(model, &composer, frame);
}

pub fn render_app_to_frame_with_composer(
    model: &AppViewModel,
    composer: &TextareaComposer,
    frame: &mut ratatui::Frame<'_>,
) {
    render_transcript_to_frame(model, frame);
    render_status_to_frame(model, frame);
    render_textarea_composer_to_frame(model, composer, frame);
}

fn render_transcript_to_buffer(model: &AppViewModel, buffer: &mut Buffer) {
    Widget::render(
        transcript_paragraph(model),
        to_tui_rect(model.layout.transcript),
        buffer,
    );
}

fn render_status_to_buffer(model: &AppViewModel, buffer: &mut Buffer) {
    Widget::render(
        status_paragraph(model),
        to_tui_rect(model.layout.status),
        buffer,
    );
}

fn render_textarea_composer_to_buffer(
    model: &AppViewModel,
    composer: &TextareaComposer,
    buffer: &mut Buffer,
) {
    let area = to_tui_rect(model.layout.composer);
    let block = composer_block(model);
    let inner = block.inner(area);
    Widget::render(block, area, buffer);
    Widget::render(composer.textarea(), inner, buffer);
}

fn render_transcript_to_frame(model: &AppViewModel, frame: &mut ratatui::Frame<'_>) {
    frame.render_widget(
        transcript_paragraph(model),
        to_tui_rect(model.layout.transcript),
    );
}

fn render_status_to_frame(model: &AppViewModel, frame: &mut ratatui::Frame<'_>) {
    frame.render_widget(status_paragraph(model), to_tui_rect(model.layout.status));
}

fn render_textarea_composer_to_frame(
    model: &AppViewModel,
    composer: &TextareaComposer,
    frame: &mut ratatui::Frame<'_>,
) {
    let area = to_tui_rect(model.layout.composer);
    let block = composer_block(model);
    let inner = block.inner(area);
    frame.render_widget(block, area);
    frame.render_widget(composer.textarea(), inner);
}

fn transcript_paragraph(model: &AppViewModel) -> Paragraph<'_> {
    let lines = model
        .transcript_rows
        .iter()
        .map(|row| format!("{}: {}", row.actor_label, row.text))
        .collect::<Vec<_>>()
        .join("\n");
    Paragraph::new(lines).block(Block::default().title("Transcript").borders(Borders::ALL))
}

fn status_paragraph(model: &AppViewModel) -> Paragraph<'_> {
    Paragraph::new(model.status.compact_line.clone())
}

fn composer_block(model: &AppViewModel) -> Block<'_> {
    Block::default()
        .title(format!("Composer: {}", model.composer.prompt_label))
        .borders(Borders::ALL)
}

fn to_tui_rect(rect: Rect) -> TuiRect {
    TuiRect::new(rect.x, rect.y, rect.width, rect.height)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::app_view_model::{build_app_view, AppViewInput};
    use crate::composer_view_model::ComposerViewInput;
    use crate::input_queue::TurnState;
    use crate::layout_model::{LayoutConfig, TerminalSize};
    use crate::status_view_model::{ProviderRuntimeState, StatusViewInput};
    use crate::transcript_projection::{TranscriptActor, TranscriptItem, TranscriptItemKind};

    fn model() -> AppViewModel {
        build_app_view(&AppViewInput {
            terminal_size: TerminalSize {
                width: 80,
                height: 12,
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
                last_error: None,
            },
            composer: ComposerViewInput {
                identity: "sonar.resident".to_string(),
                draft_text: "hello".to_string(),
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

    #[test]
    fn renders_app_view_into_buffer_with_textarea_composer() {
        let model = model();
        let mut buffer = Buffer::empty(TuiRect::new(0, 0, 80, 12));

        render_app_to_buffer(&model, &mut buffer);
        let text = buffer_text(&buffer);

        assert!(text.contains("Transcript"));
        assert!(text.contains("operator: run startup sequence"));
        assert!(text.contains("agent=sonar.resident"));
        assert!(text.contains("Composer: operator -> sonar.resident>"));
        assert!(text.contains("hello"));
    }

    #[test]
    fn renders_app_view_with_live_textarea_composer() {
        let model = model();
        let composer = TextareaComposer::from_draft(&ComposerDraftState {
            text: "live draft".to_string(),
        });
        let mut buffer = Buffer::empty(TuiRect::new(0, 0, 80, 12));

        render_app_to_buffer_with_composer(&model, &composer, &mut buffer);
        let text = buffer_text(&buffer);

        assert!(text.contains("Transcript"));
        assert!(text.contains("agent=sonar.resident"));
        assert!(text.contains("Composer: operator -> sonar.resident>"));
        assert!(text.contains("live draft"));
        assert!(!text.contains("operator -> sonar.resident> hello"));
    }

    #[test]
    fn renders_active_turn_with_live_composer_state() {
        let model = build_app_view(&AppViewInput {
            terminal_size: TerminalSize {
                width: 80,
                height: 12,
            },
            layout_config: LayoutConfig::default(),
            transcript_items: vec![TranscriptItem {
                kind: TranscriptItemKind::ProviderTextDelta,
                actor: TranscriptActor::Agent,
                turn_id: "turn_1".to_string(),
                text: "working".to_string(),
                sequence: None,
                projection_key: None,
            }],
            status: StatusViewInput {
                identity: "sonar.resident".to_string(),
                session: "carrier_1".to_string(),
                turn_state: TurnState::Active,
                queued_inputs: 2,
                held_system_directives: 1,
                transcript_items: 1,
                provider_state: ProviderRuntimeState::Working,
                last_error: None,
            },
            composer: ComposerViewInput {
                identity: "sonar.resident".to_string(),
                draft_text: "snapshot stale".to_string(),
                turn_state: TurnState::Active,
                queued_operator_notes: 2,
                held_system_directives: 1,
            },
        });
        let composer = TextareaComposer::from_draft(&ComposerDraftState {
            text: "active live note".to_string(),
        });
        let mut buffer = Buffer::empty(TuiRect::new(0, 0, 80, 12));

        render_app_to_buffer_with_composer(&model, &composer, &mut buffer);
        let text = buffer_text(&buffer);

        assert!(text.contains("Composer: operator note -> sonar.resident>"));
        assert!(text.contains("active live note"));
        assert!(text.contains("turn=active"));
        assert!(text.contains("queued=2"));
        assert!(!text.contains("snapshot stale"));
    }
}
