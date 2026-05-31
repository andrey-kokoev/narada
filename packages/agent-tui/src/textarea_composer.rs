use crate::composer_draft::{ComposerDraftEffect, ComposerDraftState};
use crate::terminal_input::TerminalInputIntent;
use tui_textarea::{CursorMove, Input, Key, TextArea};

#[derive(Debug, Clone)]
pub struct TextareaComposer {
    textarea: TextArea<'static>,
}

impl Default for TextareaComposer {
    fn default() -> Self {
        Self {
            textarea: TextArea::default(),
        }
    }
}

impl TextareaComposer {
    pub fn from_draft(state: &ComposerDraftState) -> Self {
        Self {
            textarea: textarea_from_text(&state.text),
        }
    }

    pub fn textarea(&self) -> &TextArea<'static> {
        &self.textarea
    }

    pub fn draft_state(&self) -> ComposerDraftState {
        ComposerDraftState { text: self.text() }
    }

    pub fn text(&self) -> String {
        self.textarea.lines().join("\n")
    }

    pub fn is_empty(&self) -> bool {
        self.text().trim().is_empty()
    }

    pub fn apply_intent(&mut self, intent: TerminalInputIntent) -> ComposerDraftEffect {
        match intent {
            TerminalInputIntent::InsertChar(value) => {
                if self.apply_input(Key::Char(value)) {
                    ComposerDraftEffect::DraftChanged
                } else {
                    ComposerDraftEffect::None
                }
            }
            TerminalInputIntent::Backspace => {
                if self.apply_input(Key::Backspace) {
                    ComposerDraftEffect::DraftChanged
                } else {
                    ComposerDraftEffect::None
                }
            }
            TerminalInputIntent::Submit => {
                let text = self.text().trim().to_string();
                if text.is_empty() {
                    ComposerDraftEffect::None
                } else {
                    self.clear();
                    ComposerDraftEffect::SubmitRequested { text }
                }
            }
            TerminalInputIntent::InterruptOrClear => {
                if self.text().is_empty() {
                    ComposerDraftEffect::ClearOrInterruptRequested
                } else {
                    self.clear();
                    ComposerDraftEffect::DraftChanged
                }
            }
            TerminalInputIntent::Exit => ComposerDraftEffect::ExitRequested,
            TerminalInputIntent::Ignored => ComposerDraftEffect::None,
        }
    }

    fn apply_input(&mut self, key: Key) -> bool {
        self.textarea.input(Input {
            key,
            ctrl: false,
            alt: false,
            shift: false,
        })
    }

    fn clear(&mut self) {
        self.textarea = TextArea::default();
    }
}

fn textarea_from_text(text: &str) -> TextArea<'static> {
    if text.is_empty() {
        TextArea::default()
    } else {
        let mut textarea = TextArea::from(text.lines());
        textarea.move_cursor(CursorMove::End);
        textarea
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn exposes_textarea_for_widget_rendering() {
        let composer = TextareaComposer::from_draft(&ComposerDraftState {
            text: "run startup sequence".to_string(),
        });

        assert_eq!(composer.textarea().lines(), ["run startup sequence"]);
    }

    #[test]
    fn round_trips_existing_draft_text() {
        let composer = TextareaComposer::from_draft(&ComposerDraftState {
            text: "run startup sequence".to_string(),
        });

        assert_eq!(composer.text(), "run startup sequence");
        assert_eq!(composer.draft_state().text, "run startup sequence");
    }

    #[test]
    fn applies_insert_and_backspace_through_textarea() {
        let mut composer = TextareaComposer::default();

        assert_eq!(
            composer.apply_intent(TerminalInputIntent::InsertChar('x')),
            ComposerDraftEffect::DraftChanged
        );
        assert_eq!(composer.text(), "x");
        assert_eq!(
            composer.apply_intent(TerminalInputIntent::Backspace),
            ComposerDraftEffect::DraftChanged
        );
        assert_eq!(composer.text(), "");
        assert_eq!(
            composer.apply_intent(TerminalInputIntent::Backspace),
            ComposerDraftEffect::None
        );
    }

    #[test]
    fn submit_trims_and_clears_textarea() {
        let mut composer = TextareaComposer::from_draft(&ComposerDraftState {
            text: "  run startup sequence  ".to_string(),
        });

        assert_eq!(
            composer.apply_intent(TerminalInputIntent::Submit),
            ComposerDraftEffect::SubmitRequested {
                text: "run startup sequence".to_string()
            }
        );
        assert_eq!(composer.text(), "");
    }

    #[test]
    fn empty_submit_preserves_whitespace_draft() {
        let mut composer = TextareaComposer::from_draft(&ComposerDraftState {
            text: "   ".to_string(),
        });

        assert_eq!(
            composer.apply_intent(TerminalInputIntent::Submit),
            ComposerDraftEffect::None
        );
        assert_eq!(composer.text(), "   ");
    }

    #[test]
    fn interrupt_clears_before_requesting_interrupt() {
        let mut composer = TextareaComposer::from_draft(&ComposerDraftState {
            text: "draft".to_string(),
        });

        assert_eq!(
            composer.apply_intent(TerminalInputIntent::InterruptOrClear),
            ComposerDraftEffect::DraftChanged
        );
        assert_eq!(composer.text(), "");
        assert_eq!(
            composer.apply_intent(TerminalInputIntent::InterruptOrClear),
            ComposerDraftEffect::ClearOrInterruptRequested
        );
    }
}
