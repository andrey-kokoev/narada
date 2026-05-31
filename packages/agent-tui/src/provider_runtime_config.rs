use std::collections::BTreeMap;
use std::sync::OnceLock;

use serde::Deserialize;

const PROVIDER_ADAPTER_CONTRACT_JSON: &str = include_str!("../contracts/provider-adapters.json");

#[derive(Debug, Deserialize)]
struct ProviderRuntimeContract {
    provider_execution_env_var: String,
}

fn provider_runtime_contract() -> &'static ProviderRuntimeContract {
    static CONTRACT: OnceLock<ProviderRuntimeContract> = OnceLock::new();
    CONTRACT.get_or_init(|| {
        parse_provider_runtime_contract(PROVIDER_ADAPTER_CONTRACT_JSON)
            .expect("agent-tui provider runtime contract is valid")
    })
}

fn provider_execution_env_var() -> &'static str {
    provider_runtime_contract()
        .provider_execution_env_var
        .as_str()
}

fn parse_provider_runtime_contract(json: &str) -> Result<ProviderRuntimeContract, String> {
    let contract: ProviderRuntimeContract = serde_json::from_str(json)
        .map_err(|error| format!("provider_runtime_contract_parse_failed:{error}"))?;
    if contract.provider_execution_env_var.trim() != "NARADA_AGENT_TUI_ENABLE_PROVIDER_EXECUTION" {
        return Err("provider_runtime_contract_invalid:provider_execution_env_var".to_string());
    }
    Ok(contract)
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ProviderRuntimeAdmissionStatus {
    Disabled,
    Configured,
    Refused,
}

impl ProviderRuntimeAdmissionStatus {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Disabled => "disabled",
            Self::Configured => "configured",
            Self::Refused => "refused",
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ProviderRuntimeConfig {
    pub status: ProviderRuntimeAdmissionStatus,
    pub provider: Option<String>,
    pub model: Option<String>,
    pub thinking: Option<String>,
    pub stream: bool,
    pub refusal_reason: Option<String>,
}

impl ProviderRuntimeConfig {
    pub fn disabled() -> Self {
        Self {
            status: ProviderRuntimeAdmissionStatus::Disabled,
            provider: None,
            model: None,
            thinking: None,
            stream: false,
            refusal_reason: None,
        }
    }

    pub fn from_env_map(env: &BTreeMap<String, String>) -> Self {
        if !env_flag_enabled(env.get(provider_execution_env_var())) {
            return Self::disabled();
        }

        let provider = trimmed_nonempty(env.get("NARADA_INTELLIGENCE_PROVIDER"));
        let model = trimmed_nonempty(env.get("NARADA_AI_MODEL"));
        let thinking = trimmed_nonempty(env.get("NARADA_AI_THINKING"));
        let stream = !matches!(
            env.get("NARADA_AI_STREAM").map(|value| value.trim().to_ascii_lowercase()),
            Some(value) if matches!(value.as_str(), "0" | "false" | "off" | "no")
        );

        let Some(provider) = provider else {
            return Self::refused("missing_provider");
        };
        let Some(model) = model else {
            return Self::refused("missing_model");
        };
        if !admitted_provider(&provider) {
            return Self::refused(format!("provider_not_admitted:{provider}"));
        }

        Self {
            status: ProviderRuntimeAdmissionStatus::Configured,
            provider: Some(provider),
            model: Some(model),
            thinking,
            stream,
            refusal_reason: None,
        }
    }

    fn refused(reason: impl Into<String>) -> Self {
        Self {
            status: ProviderRuntimeAdmissionStatus::Refused,
            provider: None,
            model: None,
            thinking: None,
            stream: false,
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

fn admitted_provider(provider: &str) -> bool {
    matches!(
        provider,
        "codex-subscription" | "openai-api" | "anthropic-api"
    )
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
    fn provider_runtime_contract_rejects_invalid_execution_env_var() {
        assert_eq!(
            parse_provider_runtime_contract(
                r#"{"schema":"narada.agent_tui.provider_adapter_contract.v0","provider_execution_env_var":"NARADA_AGENT_TUI_PROVIDER"}"#,
            )
            .unwrap_err(),
            "provider_runtime_contract_invalid:provider_execution_env_var"
        );
    }

    #[test]
    fn provider_runtime_is_disabled_without_explicit_admission_flag() {
        let config = ProviderRuntimeConfig::from_env_map(&env(&[
            ("NARADA_INTELLIGENCE_PROVIDER", "codex-subscription"),
            ("NARADA_AI_MODEL", "gpt-5.5"),
        ]));

        assert_eq!(config.status, ProviderRuntimeAdmissionStatus::Disabled);
        assert_eq!(config.status.as_str(), "disabled");
        assert_eq!(config.provider, None);
        assert_eq!(config.model, None);
    }

    #[test]
    fn provider_runtime_requires_provider_and_model_when_enabled() {
        let missing_provider = ProviderRuntimeConfig::from_env_map(&env(&[
            (provider_execution_env_var(), "true"),
            ("NARADA_AI_MODEL", "gpt-5.5"),
        ]));
        assert_eq!(
            missing_provider.status,
            ProviderRuntimeAdmissionStatus::Refused
        );
        assert_eq!(
            missing_provider.refusal_reason.as_deref(),
            Some("missing_provider")
        );

        let missing_model = ProviderRuntimeConfig::from_env_map(&env(&[
            (provider_execution_env_var(), "true"),
            ("NARADA_INTELLIGENCE_PROVIDER", "codex-subscription"),
        ]));
        assert_eq!(
            missing_model.status,
            ProviderRuntimeAdmissionStatus::Refused
        );
        assert_eq!(
            missing_model.refusal_reason.as_deref(),
            Some("missing_model")
        );
    }

    #[test]
    fn provider_runtime_rejects_unknown_provider() {
        let config = ProviderRuntimeConfig::from_env_map(&env(&[
            (provider_execution_env_var(), "true"),
            ("NARADA_INTELLIGENCE_PROVIDER", "unknown-provider"),
            ("NARADA_AI_MODEL", "gpt-5.5"),
        ]));

        assert_eq!(config.status, ProviderRuntimeAdmissionStatus::Refused);
        assert_eq!(
            config.refusal_reason.as_deref(),
            Some("provider_not_admitted:unknown-provider")
        );
    }

    #[test]
    fn provider_runtime_configures_explicit_provider_model_without_admitting_execution() {
        let config = ProviderRuntimeConfig::from_env_map(&env(&[
            (provider_execution_env_var(), "yes"),
            ("NARADA_INTELLIGENCE_PROVIDER", "codex-subscription"),
            ("NARADA_AI_MODEL", "gpt-5.5"),
            ("NARADA_AI_THINKING", "medium"),
            ("NARADA_AI_STREAM", "off"),
        ]));

        assert_eq!(config.status, ProviderRuntimeAdmissionStatus::Configured);
        assert_eq!(config.status.as_str(), "configured");
        assert_eq!(config.refusal_reason, None);
        assert_eq!(config.provider.as_deref(), Some("codex-subscription"));
        assert_eq!(config.model.as_deref(), Some("gpt-5.5"));
        assert_eq!(config.thinking.as_deref(), Some("medium"));
        assert!(!config.stream);
    }
}
