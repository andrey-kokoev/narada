use serde::Deserialize;
use std::collections::BTreeMap;
use std::sync::OnceLock;

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
    pub config_path_policy: &'static str,
    pub config_path: Option<String>,
    pub site_mcp_fabric: Option<String>,
    pub refusal_reason: Option<String>,
}

impl McpRuntimeConfig {
    pub fn disabled() -> Self {
        Self {
            status: McpRuntimeAdmissionStatus::Disabled,
            mcp_fabric_access_enabled: false,
            config_path_policy: config_path_policy(),
            config_path: None,
            site_mcp_fabric: None,
            refusal_reason: None,
        }
    }

    pub fn from_env_map(env: &BTreeMap<String, String>) -> Self {
        Self::from_env_map_with_config_readiness(env, |_| Ok(()))
    }

    pub fn from_env_map_with_config_readiness(
        env: &BTreeMap<String, String>,
        config_readiness: impl Fn(&str) -> Result<(), String>,
    ) -> Self {
        if !env_flag_enabled(env.get(mcp_fabric_env_var())) {
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

        if !config_path_is_within_fabric(&config_path, &site_mcp_fabric) {
            return Self::refused("mcp_config_outside_site_mcp_fabric");
        }
        if let Err(reason) = config_readiness(&config_path) {
            return Self::refused(reason);
        }

        Self {
            status: McpRuntimeAdmissionStatus::Configured,
            mcp_fabric_access_enabled: true,
            config_path_policy: config_path_policy(),
            config_path: Some(config_path),
            site_mcp_fabric: Some(site_mcp_fabric),
            refusal_reason: None,
        }
    }

    fn refused(reason: impl Into<String>) -> Self {
        Self {
            status: McpRuntimeAdmissionStatus::Refused,
            mcp_fabric_access_enabled: false,
            config_path_policy: config_path_policy(),
            config_path: None,
            site_mcp_fabric: None,
            refusal_reason: Some(reason.into()),
        }
    }
}

const MCP_RUNTIME_CONTRACT_JSON: &str = include_str!("../contracts/mcp-runtime.json");

#[derive(Debug, Deserialize)]
struct McpRuntimeContract {
    schema: String,
    mcp_fabric_env_var: String,
    mcp_config_path_policy: String,
}

pub fn mcp_fabric_env_var() -> &'static str {
    mcp_runtime_contract().mcp_fabric_env_var.as_str()
}

pub fn config_path_policy() -> &'static str {
    mcp_runtime_contract().mcp_config_path_policy.as_str()
}

fn mcp_runtime_contract() -> &'static McpRuntimeContract {
    static CONTRACT: OnceLock<McpRuntimeContract> = OnceLock::new();
    CONTRACT.get_or_init(|| {
        parse_mcp_runtime_contract(MCP_RUNTIME_CONTRACT_JSON)
            .expect("agent-tui MCP runtime contract is valid")
    })
}

fn parse_mcp_runtime_contract(json: &str) -> Result<McpRuntimeContract, String> {
    let contract: McpRuntimeContract = serde_json::from_str(json)
        .map_err(|error| format!("mcp_runtime_contract_parse_failed:{error}"))?;
    if contract.schema.trim() != "narada.agent_tui.mcp_runtime_contract.v0" {
        return Err("mcp_runtime_contract_invalid:schema".to_string());
    }
    if contract.mcp_fabric_env_var.trim() != "NARADA_AGENT_TUI_ENABLE_MCP_FABRIC" {
        return Err("mcp_runtime_contract_invalid:mcp_fabric_env_var".to_string());
    }
    if contract.mcp_config_path_policy.trim() != "inside_site_mcp_fabric_without_parent_traversal" {
        return Err("mcp_runtime_contract_invalid:mcp_config_path_policy".to_string());
    }
    Ok(contract)
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

fn config_path_is_within_fabric(config_path: &str, site_mcp_fabric: &str) -> bool {
    let config_path = normalize_lexical_path(config_path);
    let site_mcp_fabric = normalize_lexical_path(site_mcp_fabric);
    if path_has_parent_component(&config_path) || path_has_parent_component(&site_mcp_fabric) {
        return false;
    }
    config_path
        .strip_prefix(&site_mcp_fabric)
        .is_some_and(|suffix| suffix.starts_with('/') && suffix.len() > 1)
}

fn path_has_parent_component(path: &str) -> bool {
    path.split('/').any(|component| component == "..")
}

fn normalize_lexical_path(path: &str) -> String {
    let mut normalized = path.trim().replace('\\', "/");
    while normalized.ends_with('/') && normalized.len() > 1 {
        normalized.pop();
    }
    if cfg!(windows) {
        normalized = normalized.to_ascii_lowercase();
    }
    normalized
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
    fn mcp_runtime_contract_rejects_malformed_json() {
        assert_eq!(
            parse_mcp_runtime_contract("not json").unwrap_err(),
            "mcp_runtime_contract_parse_failed:expected ident at line 1 column 2"
        );
    }

    #[test]
    fn mcp_runtime_contract_rejects_wrong_schema() {
        assert_eq!(
            parse_mcp_runtime_contract(
                r#"{"schema":"narada.agent_tui.wrong_mcp_runtime_contract.v0","mcp_fabric_env_var":"NARADA_AGENT_TUI_ENABLE_MCP_FABRIC","mcp_config_path_policy":"inside_site_mcp_fabric_without_parent_traversal"}"#,
            )
            .unwrap_err(),
            "mcp_runtime_contract_invalid:schema"
        );
    }

    #[test]
    fn mcp_runtime_contract_rejects_wrong_path_policy() {
        assert_eq!(
            parse_mcp_runtime_contract(
                r#"{"schema":"narada.agent_tui.mcp_runtime_contract.v0","mcp_fabric_env_var":"NARADA_AGENT_TUI_ENABLE_MCP_FABRIC","mcp_config_path_policy":"prefix_only"}"#,
            )
            .unwrap_err(),
            "mcp_runtime_contract_invalid:mcp_config_path_policy"
        );
    }

    #[test]
    fn mcp_runtime_contract_reads_path_policy() {
        assert_eq!(
            parse_mcp_runtime_contract(MCP_RUNTIME_CONTRACT_JSON)
                .expect("contract parses")
                .mcp_config_path_policy,
            "inside_site_mcp_fabric_without_parent_traversal"
        );
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
            (mcp_fabric_env_var(), "true"),
            ("NARADA_SITE_MCP_FABRIC", "D:/site/.ai/mcp"),
        ]));
        assert_eq!(missing_config.status, McpRuntimeAdmissionStatus::Refused);
        assert_eq!(
            missing_config.refusal_reason.as_deref(),
            Some("missing_mcp_config")
        );

        let missing_fabric = McpRuntimeConfig::from_env_map(&env(&[
            (mcp_fabric_env_var(), "true"),
            ("NARADA_AGENT_TUI_MCP_CONFIG", "D:/site/.ai/mcp/config.json"),
        ]));
        assert_eq!(missing_fabric.status, McpRuntimeAdmissionStatus::Refused);
        assert_eq!(
            missing_fabric.refusal_reason.as_deref(),
            Some("missing_site_mcp_fabric")
        );
    }

    #[test]
    fn mcp_runtime_refuses_config_outside_site_mcp_fabric() {
        let config = McpRuntimeConfig::from_env_map(&env(&[
            (mcp_fabric_env_var(), "true"),
            (
                "NARADA_AGENT_TUI_MCP_CONFIG",
                "D:/other/.ai/mcp/config.json",
            ),
            ("NARADA_SITE_MCP_FABRIC", "D:/site/.ai/mcp"),
        ]));

        assert_eq!(config.status, McpRuntimeAdmissionStatus::Refused);
        assert_eq!(
            config.refusal_reason.as_deref(),
            Some("mcp_config_outside_site_mcp_fabric")
        );
        assert!(!config.mcp_fabric_access_enabled);
    }

    #[test]
    fn mcp_runtime_refuses_parent_traversal_inside_site_mcp_fabric_prefix() {
        let config = McpRuntimeConfig::from_env_map(&env(&[
            (mcp_fabric_env_var(), "true"),
            (
                "NARADA_AGENT_TUI_MCP_CONFIG",
                "D:/site/.ai/mcp/../outside/config.json",
            ),
            ("NARADA_SITE_MCP_FABRIC", "D:/site/.ai/mcp"),
        ]));

        assert_eq!(config.status, McpRuntimeAdmissionStatus::Refused);
        assert_eq!(
            config.refusal_reason.as_deref(),
            Some("mcp_config_outside_site_mcp_fabric")
        );
        assert!(!config.mcp_fabric_access_enabled);
    }

    #[test]
    fn mcp_runtime_refuses_unreadable_config_when_readiness_is_checked() {
        let config = McpRuntimeConfig::from_env_map_with_config_readiness(
            &env(&[
                (mcp_fabric_env_var(), "true"),
                ("NARADA_AGENT_TUI_MCP_CONFIG", "D:/site/.ai/mcp/config.json"),
                ("NARADA_SITE_MCP_FABRIC", "D:/site/.ai/mcp"),
            ]),
            |_| Err("mcp_config_unreadable".to_string()),
        );

        assert_eq!(config.status, McpRuntimeAdmissionStatus::Refused);
        assert_eq!(
            config.refusal_reason.as_deref(),
            Some("mcp_config_unreadable")
        );
        assert!(!config.mcp_fabric_access_enabled);
    }

    #[test]
    fn mcp_runtime_configures_explicit_config_and_fabric() {
        let config = McpRuntimeConfig::from_env_map(&env(&[
            (mcp_fabric_env_var(), "yes"),
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
