use crossterm::event::{KeyCode, KeyEvent, KeyModifiers};

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum TerminalInputIntent {
    InsertChar(char),
    Submit,
    InterruptOrClear,
    Backspace,
    Exit,
    Ignored,
}

pub fn decode_key_event(event: KeyEvent) -> TerminalInputIntent {
    match (event.code, event.modifiers) {
        (KeyCode::Char('c') | KeyCode::Char('C'), KeyModifiers::CONTROL) => {
            TerminalInputIntent::Exit
        }
        (KeyCode::Char(value), modifiers)
            if modifiers.is_empty() || modifiers == KeyModifiers::SHIFT =>
        {
            TerminalInputIntent::InsertChar(value)
        }
        (KeyCode::Enter, _) => TerminalInputIntent::Submit,
        (KeyCode::Esc, _) => TerminalInputIntent::InterruptOrClear,
        (KeyCode::Backspace, _) => TerminalInputIntent::Backspace,
        _ => TerminalInputIntent::Ignored,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crossterm::event::{KeyCode, KeyEvent, KeyEventKind, KeyEventState, KeyModifiers};

    fn key(code: KeyCode, modifiers: KeyModifiers) -> KeyEvent {
        KeyEvent {
            code,
            modifiers,
            kind: KeyEventKind::Press,
            state: KeyEventState::NONE,
        }
    }

    #[test]
    fn decodes_printable_characters() {
        assert_eq!(
            decode_key_event(key(KeyCode::Char('a'), KeyModifiers::NONE)),
            TerminalInputIntent::InsertChar('a')
        );
        assert_eq!(
            decode_key_event(key(KeyCode::Char('A'), KeyModifiers::SHIFT)),
            TerminalInputIntent::InsertChar('A')
        );
    }

    #[test]
    fn decodes_submit_interrupt_backspace_and_exit() {
        assert_eq!(
            decode_key_event(key(KeyCode::Enter, KeyModifiers::NONE)),
            TerminalInputIntent::Submit
        );
        assert_eq!(
            decode_key_event(key(KeyCode::Esc, KeyModifiers::NONE)),
            TerminalInputIntent::InterruptOrClear
        );
        assert_eq!(
            decode_key_event(key(KeyCode::Backspace, KeyModifiers::NONE)),
            TerminalInputIntent::Backspace
        );
        assert_eq!(
            decode_key_event(key(KeyCode::Char('c'), KeyModifiers::CONTROL)),
            TerminalInputIntent::Exit
        );
    }

    #[test]
    fn ignores_navigation_and_control_modified_characters() {
        assert_eq!(
            decode_key_event(key(KeyCode::Left, KeyModifiers::NONE)),
            TerminalInputIntent::Ignored
        );
        assert_eq!(
            decode_key_event(key(KeyCode::Char('x'), KeyModifiers::ALT)),
            TerminalInputIntent::Ignored
        );
    }
}
