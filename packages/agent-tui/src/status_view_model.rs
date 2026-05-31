use crate::input_queue::TurnState;
use crate::mcp_runtime_config::{McpRuntimeAdmissionStatus, McpRuntimeConfig};
use crate::provider_adapter_admission::{ProviderAdapterAdmission, ProviderAdapterAdmissionStatus};
use crate::provider_runtime_config::{ProviderRuntimeAdmissionStatus, ProviderRuntimeConfig};
use crate::terminal_runtime_config::{TerminalRuntimeConfig, TerminalRuntimeStatus};

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
pub enum ProviderAdapterState {
    Disabled,
    ConfiguredWithoutAdapter,
    Refused,
    Admitted,
}

impl ProviderAdapterState {
    pub fn from_provider_adapter_admission(admission: &ProviderAdapterAdmission) -> Self {
        match admission.status {
            ProviderAdapterAdmissionStatus::Disabled => Self::Disabled,
            ProviderAdapterAdmissionStatus::ConfiguredWithoutAdapter => {
                Self::ConfiguredWithoutAdapter
            }
            ProviderAdapterAdmissionStatus::Refused => Self::Refused,
            ProviderAdapterAdmissionStatus::Admitted => Self::Admitted,
        }
    }

    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Disabled => "provider_adapter_disabled",
            Self::ConfiguredWithoutAdapter => "provider_adapter_configured_without_adapter",
            Self::Refused => "provider_adapter_refused",
            Self::Admitted => "provider_adapter_admitted",
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum McpRuntimeState {
    Disabled,
    Configured,
    Refused,
}

impl McpRuntimeState {
    pub fn from_mcp_runtime_config(config: &McpRuntimeConfig) -> Self {
        match config.status {
            McpRuntimeAdmissionStatus::Disabled => Self::Disabled,
            McpRuntimeAdmissionStatus::Configured => Self::Configured,
            McpRuntimeAdmissionStatus::Refused => Self::Refused,
        }
    }

    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Disabled => "mcp_disabled",
            Self::Configured => "mcp_configured",
            Self::Refused => "mcp_refused",
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum TerminalRuntimeState {
    Disabled,
    Configured,
    Refused,
}

impl TerminalRuntimeState {
    pub fn from_terminal_runtime_config(config: &TerminalRuntimeConfig) -> Self {
        match config.status {
            TerminalRuntimeStatus::Disabled => Self::Disabled,
            TerminalRuntimeStatus::Configured => Self::Configured,
            TerminalRuntimeStatus::Refused => Self::Refused,
        }
    }

    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Disabled => "terminal_disabled",
            Self::Configured => "terminal_configured",
            Self::Refused => "terminal_refused",
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RuntimePostureState {
    pub provider_state: ProviderRuntimeState,
    pub provider_adapter_state: ProviderAdapterState,
    pub mcp_state: McpRuntimeState,
    pub terminal_state: TerminalRuntimeState,
}

impl RuntimePostureState {
    pub fn disabled() -> Self {
        Self {
            provider_state: ProviderRuntimeState::Disabled,
            provider_adapter_state: ProviderAdapterState::Disabled,
            mcp_state: McpRuntimeState::Disabled,
            terminal_state: TerminalRuntimeState::Disabled,
        }
    }

    pub fn from_runtime_configs(
        provider_config: &ProviderRuntimeConfig,
        provider_adapter_admission: &ProviderAdapterAdmission,
        mcp_config: &McpRuntimeConfig,
        terminal_config: &TerminalRuntimeConfig,
    ) -> Self {
        Self {
            provider_state: ProviderRuntimeState::from_provider_runtime_config(provider_config),
            provider_adapter_state: ProviderAdapterState::from_provider_adapter_admission(
                provider_adapter_admission,
            ),
            mcp_state: McpRuntimeState::from_mcp_runtime_config(mcp_config),
            terminal_state: TerminalRuntimeState::from_terminal_runtime_config(terminal_config),
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
    pub runtime_posture: RuntimePostureState,
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
        segment(
            "provider_state",
            "provider",
            input.runtime_posture.provider_state.as_str(),
        ),
        segment(
            "provider_adapter_state",
            "provider_adapter",
            input.runtime_posture.provider_adapter_state.as_str(),
        ),
        segment("mcp_state", "mcp", input.runtime_posture.mcp_state.as_str()),
        segment(
            "terminal_state",
            "terminal",
            input.runtime_posture.terminal_state.as_str(),
        ),
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
            runtime_posture: RuntimePostureState::disabled(),
            last_error: None,
        }
    }

    #[test]
    fn builds_status_segments_in_stable_order() {
        let model = build_status_view(&input());

        assert_eq!(model.segments.len(), 11);
        assert_eq!(model.segments[0].key, "identity");
        assert_eq!(model.segments[0].label, "agent");
        assert_eq!(model.segments[0].value, "sonar.resident");
        assert_eq!(model.segments[3].key, "queued_inputs");
        assert_eq!(model.segments[3].value, "2");
        assert_eq!(model.segments[6].value, "provider_disabled");
        assert_eq!(model.segments[7].value, "provider_adapter_disabled");
        assert_eq!(model.segments[8].value, "mcp_disabled");
        assert_eq!(model.segments[9].value, "terminal_disabled");
        assert_eq!(model.segments[10].key, "last_error");
        assert_eq!(model.segments[10].value, "none");
    }

    #[test]
    fn builds_compact_status_line() {
        let model = build_status_view(&input());

        assert_eq!(
            model.compact_line,
            "agent=sonar.resident | session=carrier_1 | turn=idle | queued=2 | held=1 | transcript=8 | provider=provider_disabled | provider_adapter=provider_adapter_disabled | mcp=mcp_disabled | terminal=terminal_disabled | error=none"
        );
    }

    #[test]
    fn includes_last_error_when_present() {
        let model = build_status_view(&StatusViewInput {
            last_error: Some("read failed".to_string()),
            ..input()
        });

        assert_eq!(model.segments[10].value, "read failed");
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
    fn maps_mcp_runtime_config_to_mcp_state() {
        let disabled = McpRuntimeConfig::disabled();
        assert_eq!(
            McpRuntimeState::from_mcp_runtime_config(&disabled),
            McpRuntimeState::Disabled
        );

        let configured = McpRuntimeConfig::from_env_map(&std::collections::BTreeMap::from([
            (
                "NARADA_AGENT_TUI_ENABLE_MCP_FABRIC".to_string(),
                "true".to_string(),
            ),
            (
                "NARADA_AGENT_TUI_MCP_CONFIG".to_string(),
                "D:/site/.ai/mcp/config.json".to_string(),
            ),
            (
                "NARADA_SITE_MCP_FABRIC".to_string(),
                "D:/site/.ai/mcp".to_string(),
            ),
        ]));
        assert_eq!(
            McpRuntimeState::from_mcp_runtime_config(&configured),
            McpRuntimeState::Configured
        );

        let refused = McpRuntimeConfig::from_env_map(&std::collections::BTreeMap::from([(
            "NARADA_AGENT_TUI_ENABLE_MCP_FABRIC".to_string(),
            "true".to_string(),
        )]));
        assert_eq!(
            McpRuntimeState::from_mcp_runtime_config(&refused),
            McpRuntimeState::Refused
        );
    }

    #[test]
    fn maps_terminal_runtime_config_to_terminal_state() {
        let disabled = TerminalRuntimeConfig::disabled();
        assert_eq!(
            TerminalRuntimeState::from_terminal_runtime_config(&disabled),
            TerminalRuntimeState::Disabled
        );

        let configured = TerminalRuntimeConfig::from_env_map(&std::collections::BTreeMap::from([
            (
                "NARADA_AGENT_TUI_ENABLE_TERMINAL_RENDERING".to_string(),
                "true".to_string(),
            ),
            (
                "NARADA_AGENT_TUI_TERMINAL_MODE".to_string(),
                "interactive_loop".to_string(),
            ),
        ]));
        assert_eq!(
            TerminalRuntimeState::from_terminal_runtime_config(&configured),
            TerminalRuntimeState::Configured
        );

        let refused = TerminalRuntimeConfig::from_env_map(&std::collections::BTreeMap::from([(
            "NARADA_AGENT_TUI_ENABLE_TERMINAL_RENDERING".to_string(),
            "true".to_string(),
        )]));
        assert_eq!(
            TerminalRuntimeState::from_terminal_runtime_config(&refused),
            TerminalRuntimeState::Refused
        );
    }

    #[test]
    fn builds_runtime_posture_bundle_from_runtime_configs() {
        let provider = ProviderRuntimeConfig::from_env_map(&std::collections::BTreeMap::from([
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
        let mcp = McpRuntimeConfig::from_env_map(&std::collections::BTreeMap::from([
            (
                "NARADA_AGENT_TUI_ENABLE_MCP_FABRIC".to_string(),
                "true".to_string(),
            ),
            (
                "NARADA_AGENT_TUI_MCP_CONFIG".to_string(),
                "D:/site/.ai/mcp/config.json".to_string(),
            ),
            (
                "NARADA_SITE_MCP_FABRIC".to_string(),
                "D:/site/.ai/mcp".to_string(),
            ),
        ]));
        let terminal = TerminalRuntimeConfig::from_env_map(&std::collections::BTreeMap::from([
            (
                "NARADA_AGENT_TUI_ENABLE_TERMINAL_RENDERING".to_string(),
                "true".to_string(),
            ),
            (
                "NARADA_AGENT_TUI_TERMINAL_MODE".to_string(),
                "interactive_loop".to_string(),
            ),
        ]));

        let provider_adapter = ProviderAdapterAdmission::from_runtime_config(&provider, None);
        let posture = RuntimePostureState::from_runtime_configs(
            &provider,
            &provider_adapter,
            &mcp,
            &terminal,
        );

        assert_eq!(
            posture.provider_state,
            ProviderRuntimeState::ConfiguredNotImplemented
        );
        assert_eq!(
            posture.provider_adapter_state,
            ProviderAdapterState::ConfiguredWithoutAdapter
        );
        assert_eq!(posture.mcp_state, McpRuntimeState::Configured);
        assert_eq!(posture.terminal_state, TerminalRuntimeState::Configured);
    }

    #[test]
    fn represents_active_turn_and_provider_working() {
        let model = build_status_view(&StatusViewInput {
            turn_state: TurnState::Active,
            runtime_posture: RuntimePostureState {
                provider_state: ProviderRuntimeState::Working,
                ..RuntimePostureState::disabled()
            },
            ..input()
        });

        assert_eq!(model.segments[2].value, "active");
        assert_eq!(model.segments[6].value, "provider_working");
        assert_eq!(model.segments[7].value, "provider_adapter_disabled");
    }
}
