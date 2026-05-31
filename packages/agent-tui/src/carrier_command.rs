#[derive(Debug, Clone, PartialEq, Eq)]
pub enum CarrierCommand {
    QueueShow,
    QueueClear,
    QueueDrop { index: usize },
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum OperatorSubmit {
    CarrierCommand(CarrierCommand),
    AgentInput(String),
    Empty,
}

pub fn parse_operator_submit(text: &str) -> OperatorSubmit {
    if text.trim().is_empty() {
        return OperatorSubmit::Empty;
    }

    if let Some(literal) = text.strip_prefix("//") {
        return OperatorSubmit::AgentInput(format!("/{literal}"));
    }

    let trimmed = text.trim();
    match trimmed {
        "/queue" => OperatorSubmit::CarrierCommand(CarrierCommand::QueueShow),
        "/queue clear" => OperatorSubmit::CarrierCommand(CarrierCommand::QueueClear),
        _ => {
            if let Some(index) = trimmed.strip_prefix("/queue drop ") {
                if let Ok(index) = index.trim().parse::<usize>() {
                    return OperatorSubmit::CarrierCommand(CarrierCommand::QueueDrop { index });
                }
            }
            OperatorSubmit::AgentInput(text.to_string())
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_queue_commands() {
        assert_eq!(
            parse_operator_submit("/queue"),
            OperatorSubmit::CarrierCommand(CarrierCommand::QueueShow)
        );
        assert_eq!(
            parse_operator_submit("/queue clear"),
            OperatorSubmit::CarrierCommand(CarrierCommand::QueueClear)
        );
        assert_eq!(
            parse_operator_submit("/queue drop 2"),
            OperatorSubmit::CarrierCommand(CarrierCommand::QueueDrop { index: 2 })
        );
    }

    #[test]
    fn double_slash_submits_literal_slash_to_agent() {
        assert_eq!(
            parse_operator_submit("//help"),
            OperatorSubmit::AgentInput("/help".to_string())
        );
    }

    #[test]
    fn unknown_slash_text_remains_agent_input() {
        assert_eq!(
            parse_operator_submit("/status please"),
            OperatorSubmit::AgentInput("/status please".to_string())
        );
    }
}
