use crate::input_queue::TurnState;
use crate::provider_runtime_config::{ProviderRuntimeAdmissionStatus, ProviderRuntimeConfig};

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ProviderRuntimeState {
    Disabled,
    ConfiguredNotImplemented,
    Refused,
    Idle,
    Working,
    Interrupted,
    Failed,
}

impl ProviderRuntimeState {
    pub fn from_provider_runtime_config(config: &ProviderRuntimeConfig) -> Self {
        match config.status {
            ProviderRuntimeAdmissionStatus::Disabled => Self::Disabled,
            ProviderRuntimeAdmissionStatus::ConfiguredNotImplemented => {
                Self::ConfiguredNotImplemented
            }
            ProviderRuntimeAdmissionStatus::Refused => Self::Refused,
        }
    }

    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Disabled => "provider_disabled",
            Self::ConfiguredNotImplemented => "provider_configured_not_implemented",
            Self::Refused => "provider_refused",
            Self::Idle => "provider_idle",
            Self::Working => "provider_working",
            Self::Interrupted => "provider_interrupted",
            Self::Failed => "provider_failed",
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct StatusViewInput {
    pub identity: String,
    pub session: String,
    pub turn_state: TurnState,
    pub queued_inputs: usize,
    pub held_system_directives: usize,
    pub transcript_items: usize,
    pub provider_state: ProviderRuntimeState,
    pub last_error: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct StatusSegment {
    pub key: String,
    pub label: String,
    pub value: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct StatusViewModel {
    pub segments: Vec<StatusSegment>,
    pub compact_line: String,
}

pub fn build_status_view(input: &StatusViewInput) -> StatusViewModel {
    let segments = vec![
        segment("identity", "agent", &input.identity),
        segment("session", "session", &input.session),
        segment("turn_state", "turn", turn_state_label(input.turn_state)),
        segment("queued_inputs", "queued", &input.queued_inputs.to_string()),
        segment(
            "held_system_directives",
            "held",
            &input.held_system_directives.to_string(),
        ),
        segment(
            "transcript_items",
            "transcript",
            &input.transcript_items.to_string(),
        ),
        segment("provider_state", "provider", input.provider_state.as_str()),
        segment(
            "last_error",
            "error",
            input.last_error.as_deref().unwrap_or("none"),
        ),
    ];
    let compact_line = segments
        .iter()
        .map(|segment| format!("{}={}", segment.label, segment.value))
        .collect::<Vec<_>>()
        .join(" | ");

    StatusViewModel {
        segments,
        compact_line,
    }
}

fn segment(key: &str, label: &str, value: &str) -> StatusSegment {
    StatusSegment {
        key: key.to_string(),
        label: label.to_string(),
        value: value.to_string(),
    }
}

fn turn_state_label(turn_state: TurnState) -> &'static str {
    match turn_state {
        TurnState::Idle => "idle",
        TurnState::Active => "active",
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn input() -> StatusViewInput {
        StatusViewInput {
            identity: "sonar.resident".to_string(),
            session: "carrier_1".to_string(),
            turn_state: TurnState::Idle,
            queued_inputs: 2,
            held_system_directives: 1,
            transcript_items: 8,
            provider_state: ProviderRuntimeState::Disabled,
            last_error: None,
        }
    }

    #[test]
    fn builds_status_segments_in_stable_order() {
        let model = build_status_view(&input());

        assert_eq!(model.segments.len(), 8);
        assert_eq!(model.segments[0].key, "identity");
        assert_eq!(model.segments[0].label, "agent");
        assert_eq!(model.segments[0].value, "sonar.resident");
        assert_eq!(model.segments[3].key, "queued_inputs");
        assert_eq!(model.segments[3].value, "2");
        assert_eq!(model.segments[6].value, "provider_disabled");
        assert_eq!(model.segments[7].key, "last_error");
        assert_eq!(model.segments[7].value, "none");
    }

    #[test]
    fn builds_compact_status_line() {
        let model = build_status_view(&input());

        assert_eq!(
            model.compact_line,
            "agent=sonar.resident | session=carrier_1 | turn=idle | queued=2 | held=1 | transcript=8 | provider=provider_disabled | error=none"
        );
    }

    #[test]
    fn includes_last_error_when_present() {
        let model = build_status_view(&StatusViewInput {
            last_error: Some("read failed".to_string()),
            ..input()
        });

        assert_eq!(model.segments[7].value, "read failed");
        assert!(model.compact_line.ends_with("error=read failed"));
    }

    #[test]
    fn maps_provider_runtime_config_to_provider_state() {
        let disabled = ProviderRuntimeConfig::disabled();
        assert_eq!(
            ProviderRuntimeState::from_provider_runtime_config(&disabled),
            ProviderRuntimeState::Disabled
        );

        let configured = ProviderRuntimeConfig::from_env_map(&std::collections::BTreeMap::from([
            (
                "NARADA_AGENT_TUI_ENABLE_PROVIDER_EXECUTION".to_string(),
                "true".to_string(),
            ),
            (
                "NARADA_INTELLIGENCE_PROVIDER".to_string(),
                "codex-subscription".to_string(),
            ),
            ("NARADA_AI_MODEL".to_string(), "gpt-5.5".to_string()),
        ]));
        assert_eq!(
            ProviderRuntimeState::from_provider_runtime_config(&configured),
            ProviderRuntimeState::ConfiguredNotImplemented
        );

        let refused = ProviderRuntimeConfig::from_env_map(&std::collections::BTreeMap::from([(
            "NARADA_AGENT_TUI_ENABLE_PROVIDER_EXECUTION".to_string(),
            "true".to_string(),
        )]));
        assert_eq!(
            ProviderRuntimeState::from_provider_runtime_config(&refused),
            ProviderRuntimeState::Refused
        );
    }

    #[test]
    fn represents_active_turn_and_provider_working() {
        let model = build_status_view(&StatusViewInput {
            turn_state: TurnState::Active,
            provider_state: ProviderRuntimeState::Working,
            ..input()
        });

        assert_eq!(model.segments[2].value, "active");
        assert_eq!(model.segments[6].value, "provider_working");
    }
}
