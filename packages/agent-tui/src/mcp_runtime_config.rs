use std::collections::BTreeMap;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum McpRuntimeAdmissionStatus {
    Disabled,
    Configured,
    Refused,
}

impl McpRuntimeAdmissionStatus {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Disabled => "disabled",
            Self::Configured => "configured",
            Self::Refused => "refused",
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct McpRuntimeConfig {
    pub status: McpRuntimeAdmissionStatus,
    pub mcp_fabric_access_enabled: bool,
    pub config_path: Option<String>,
    pub site_mcp_fabric: Option<String>,
    pub refusal_reason: Option<String>,
}

impl McpRuntimeConfig {
    pub fn disabled() -> Self {
        Self {
            status: McpRuntimeAdmissionStatus::Disabled,
            mcp_fabric_access_enabled: false,
            config_path: None,
            site_mcp_fabric: None,
            refusal_reason: None,
        }
    }

    pub fn from_env_map(env: &BTreeMap<String, String>) -> Self {
        if !env_flag_enabled(env.get("NARADA_AGENT_TUI_ENABLE_MCP_FABRIC")) {
            return Self::disabled();
        }

        let config_path = trimmed_nonempty(env.get("NARADA_AGENT_TUI_MCP_CONFIG"));
        let site_mcp_fabric = trimmed_nonempty(env.get("NARADA_SITE_MCP_FABRIC"));

        let Some(config_path) = config_path else {
            return Self::refused("missing_mcp_config");
        };
        let Some(site_mcp_fabric) = site_mcp_fabric else {
            return Self::refused("missing_site_mcp_fabric");
        };

        Self {
            status: McpRuntimeAdmissionStatus::Configured,
            mcp_fabric_access_enabled: true,
            config_path: Some(config_path),
            site_mcp_fabric: Some(site_mcp_fabric),
            refusal_reason: None,
        }
    }

    fn refused(reason: impl Into<String>) -> Self {
        Self {
            status: McpRuntimeAdmissionStatus::Refused,
            mcp_fabric_access_enabled: false,
            config_path: None,
            site_mcp_fabric: None,
            refusal_reason: Some(reason.into()),
        }
    }
}

fn env_flag_enabled(value: Option<&String>) -> bool {
    matches!(
        value.map(|value| value.trim().to_ascii_lowercase()),
        Some(value) if matches!(value.as_str(), "1" | "true" | "on" | "yes")
    )
}

fn trimmed_nonempty(value: Option<&String>) -> Option<String> {
    value
        .map(|value| value.trim())
        .filter(|value| !value.is_empty())
        .map(ToString::to_string)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn env(pairs: &[(&str, &str)]) -> BTreeMap<String, String> {
        pairs
            .iter()
            .map(|(key, value)| (key.to_string(), value.to_string()))
            .collect()
    }

    #[test]
    fn mcp_runtime_is_disabled_without_explicit_admission_flag() {
        let config = McpRuntimeConfig::from_env_map(&env(&[
            ("NARADA_AGENT_TUI_MCP_CONFIG", "D:/site/.ai/mcp/config.json"),
            ("NARADA_SITE_MCP_FABRIC", "D:/site/.ai/mcp"),
        ]));

        assert_eq!(config.status, McpRuntimeAdmissionStatus::Disabled);
        assert_eq!(config.status.as_str(), "disabled");
        assert!(!config.mcp_fabric_access_enabled);
        assert_eq!(config.config_path, None);
    }

    #[test]
    fn mcp_runtime_requires_config_and_fabric_when_enabled() {
        let missing_config = McpRuntimeConfig::from_env_map(&env(&[
            ("NARADA_AGENT_TUI_ENABLE_MCP_FABRIC", "true"),
            ("NARADA_SITE_MCP_FABRIC", "D:/site/.ai/mcp"),
        ]));
        assert_eq!(missing_config.status, McpRuntimeAdmissionStatus::Refused);
        assert_eq!(
            missing_config.refusal_reason.as_deref(),
            Some("missing_mcp_config")
        );

        let missing_fabric = McpRuntimeConfig::from_env_map(&env(&[
            ("NARADA_AGENT_TUI_ENABLE_MCP_FABRIC", "true"),
            ("NARADA_AGENT_TUI_MCP_CONFIG", "D:/site/.ai/mcp/config.json"),
        ]));
        assert_eq!(missing_fabric.status, McpRuntimeAdmissionStatus::Refused);
        assert_eq!(
            missing_fabric.refusal_reason.as_deref(),
            Some("missing_site_mcp_fabric")
        );
    }

    #[test]
    fn mcp_runtime_configures_explicit_config_and_fabric() {
        let config = McpRuntimeConfig::from_env_map(&env(&[
            ("NARADA_AGENT_TUI_ENABLE_MCP_FABRIC", "yes"),
            ("NARADA_AGENT_TUI_MCP_CONFIG", "D:/site/.ai/mcp/config.json"),
            ("NARADA_SITE_MCP_FABRIC", "D:/site/.ai/mcp"),
        ]));

        assert_eq!(config.status, McpRuntimeAdmissionStatus::Configured);
        assert_eq!(config.status.as_str(), "configured");
        assert!(config.mcp_fabric_access_enabled);
        assert_eq!(
            config.config_path.as_deref(),
            Some("D:/site/.ai/mcp/config.json")
        );
        assert_eq!(config.site_mcp_fabric.as_deref(), Some("D:/site/.ai/mcp"));
    }
}
