use crate::mcp_runtime_config::McpRuntimeConfig;
use crate::provider_adapter_admission::ProviderAdapterAdmission;
use crate::provider_runtime_config::ProviderRuntimeConfig;
use crate::status_view_model::RuntimePostureState;
use crate::terminal_runtime_config::TerminalRuntimeConfig;
use std::collections::BTreeMap;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RuntimeConfigSnapshot {
    pub provider: ProviderRuntimeConfig,
    pub provider_adapter: ProviderAdapterAdmission,
    pub mcp: McpRuntimeConfig,
    pub terminal: TerminalRuntimeConfig,
}

impl RuntimeConfigSnapshot {
    pub fn from_env_map(env_map: &BTreeMap<String, String>) -> Self {
        let provider = ProviderRuntimeConfig::from_env_map(env_map);
        let provider_adapter = ProviderAdapterAdmission::from_runtime_config(&provider, None);
        Self {
            provider,
            provider_adapter,
            mcp: McpRuntimeConfig::from_env_map(env_map),
            terminal: TerminalRuntimeConfig::from_env_map(env_map),
        }
    }

    pub fn posture(&self) -> RuntimePostureState {
        RuntimePostureState::from_runtime_configs(
            &self.provider,
            &self.provider_adapter,
            &self.mcp,
            &self.terminal,
        )
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn snapshot_reads_narada_env_map_once() {
        let env_map = BTreeMap::from([
            (
                "NARADA_AGENT_TUI_ENABLE_PROVIDER_EXECUTION".to_string(),
                "true".to_string(),
            ),
            (
                "NARADA_INTELLIGENCE_PROVIDER".to_string(),
                "codex-subscription".to_string(),
            ),
            ("NARADA_AI_MODEL".to_string(), "gpt-5.5".to_string()),
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
            (
                "NARADA_AGENT_TUI_ENABLE_TERMINAL_RENDERING".to_string(),
                "true".to_string(),
            ),
            (
                "NARADA_AGENT_TUI_TERMINAL_MODE".to_string(),
                "interactive_loop".to_string(),
            ),
        ]);

        let snapshot = RuntimeConfigSnapshot::from_env_map(&env_map);
        let posture = snapshot.posture();

        assert_eq!(
            snapshot.provider.status.as_str(),
            "configured_not_implemented"
        );
        assert_eq!(
            snapshot.provider_adapter.status.as_str(),
            "configured_without_adapter"
        );
        assert_eq!(snapshot.mcp.status.as_str(), "configured");
        assert_eq!(snapshot.terminal.status.as_str(), "configured");
        assert_eq!(
            posture.provider_state.as_str(),
            "provider_configured_not_implemented"
        );
        assert_eq!(
            posture.provider_adapter_state.as_str(),
            "provider_adapter_configured_without_adapter"
        );
        assert_eq!(posture.mcp_state.as_str(), "mcp_configured");
        assert_eq!(posture.terminal_state.as_str(), "terminal_configured");
    }
}
