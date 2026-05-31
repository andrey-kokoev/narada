use std::sync::OnceLock;

use serde::Deserialize;

const PROVIDER_ADAPTER_CONTRACT_JSON: &str = include_str!("../contracts/provider-adapters.json");

#[derive(Debug, Clone, Deserialize)]
pub struct ProviderAdapterContract {
    pub schema: String,
    pub provider_execution_env_var: String,
    pub provider_adapter_kind_env_var: String,
    pub intelligence_provider_env_var: String,
    pub ai_model_env_var: String,
    pub ai_thinking_env_var: String,
    pub ai_stream_env_var: String,
    pub admitted_providers: Vec<String>,
    pub scripted_provider_adapter_kind: String,
    pub production_provider_adapter_kind: String,
    pub production_provider_adapter_implemented: bool,
}

static PROVIDER_ADAPTER_CONTRACT: OnceLock<ProviderAdapterContract> = OnceLock::new();

pub fn provider_adapter_contract() -> &'static ProviderAdapterContract {
    PROVIDER_ADAPTER_CONTRACT.get_or_init(|| {
        parse_provider_adapter_contract(PROVIDER_ADAPTER_CONTRACT_JSON)
            .expect("agent-tui provider adapter contract is valid")
    })
}

pub fn parse_provider_adapter_contract(json: &str) -> Result<ProviderAdapterContract, String> {
    let contract: ProviderAdapterContract = serde_json::from_str(json)
        .map_err(|error| format!("provider_adapter_contract_parse_failed:{error}"))?;
    if contract.schema.trim() != "narada.agent_tui.provider_adapter_contract.v0" {
        return Err("provider_adapter_contract_invalid:schema".to_string());
    }
    if contract.provider_execution_env_var.trim() != "NARADA_AGENT_TUI_ENABLE_PROVIDER_EXECUTION" {
        return Err("provider_adapter_contract_invalid:provider_execution_env_var".to_string());
    }
    if contract.provider_adapter_kind_env_var.trim() != "NARADA_AGENT_TUI_PROVIDER_ADAPTER_KIND" {
        return Err("provider_adapter_contract_invalid:provider_adapter_kind_env_var".to_string());
    }
    if contract.intelligence_provider_env_var.trim() != "NARADA_INTELLIGENCE_PROVIDER" {
        return Err("provider_adapter_contract_invalid:intelligence_provider_env_var".to_string());
    }
    if contract.ai_model_env_var.trim() != "NARADA_AI_MODEL" {
        return Err("provider_adapter_contract_invalid:ai_model_env_var".to_string());
    }
    if contract.ai_thinking_env_var.trim() != "NARADA_AI_THINKING" {
        return Err("provider_adapter_contract_invalid:ai_thinking_env_var".to_string());
    }
    if contract.ai_stream_env_var.trim() != "NARADA_AI_STREAM" {
        return Err("provider_adapter_contract_invalid:ai_stream_env_var".to_string());
    }
    if contract.admitted_providers != ["codex-subscription", "openai-api", "anthropic-api"] {
        return Err("provider_adapter_contract_invalid:admitted_providers".to_string());
    }
    if contract.scripted_provider_adapter_kind.trim() != "scripted_provider_adapter" {
        return Err("provider_adapter_contract_invalid:scripted_provider_adapter_kind".to_string());
    }
    if contract.production_provider_adapter_kind.trim() != "codex_subscription_adapter" {
        return Err(
            "provider_adapter_contract_invalid:production_provider_adapter_kind".to_string(),
        );
    }
    if contract.production_provider_adapter_implemented {
        return Err(
            "provider_adapter_contract_invalid:production_provider_adapter_implemented".to_string(),
        );
    }
    Ok(contract)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn bundled_provider_adapter_contract_is_valid() {
        let contract = provider_adapter_contract();

        assert_eq!(
            contract.provider_execution_env_var,
            "NARADA_AGENT_TUI_ENABLE_PROVIDER_EXECUTION"
        );
        assert_eq!(
            contract.provider_adapter_kind_env_var,
            "NARADA_AGENT_TUI_PROVIDER_ADAPTER_KIND"
        );
        assert_eq!(
            contract.intelligence_provider_env_var,
            "NARADA_INTELLIGENCE_PROVIDER"
        );
        assert_eq!(contract.ai_model_env_var, "NARADA_AI_MODEL");
        assert_eq!(contract.ai_thinking_env_var, "NARADA_AI_THINKING");
        assert_eq!(contract.ai_stream_env_var, "NARADA_AI_STREAM");
        assert_eq!(
            contract.admitted_providers,
            vec!["codex-subscription", "openai-api", "anthropic-api"]
        );
        assert_eq!(
            contract.scripted_provider_adapter_kind,
            "scripted_provider_adapter"
        );
        assert_eq!(
            contract.production_provider_adapter_kind,
            "codex_subscription_adapter"
        );
        assert!(!contract.production_provider_adapter_implemented);
    }

    #[test]
    fn provider_adapter_contract_rejects_invalid_posture() {
        assert_eq!(
            parse_provider_adapter_contract("not json").unwrap_err(),
            "provider_adapter_contract_parse_failed:expected ident at line 1 column 2"
        );
        assert_eq!(
            parse_provider_adapter_contract(
                r#"{"schema":"narada.agent_tui.wrong_provider_adapter_contract.v0","provider_execution_env_var":"NARADA_AGENT_TUI_ENABLE_PROVIDER_EXECUTION","provider_adapter_kind_env_var":"NARADA_AGENT_TUI_PROVIDER_ADAPTER_KIND","intelligence_provider_env_var":"NARADA_INTELLIGENCE_PROVIDER","ai_model_env_var":"NARADA_AI_MODEL","ai_thinking_env_var":"NARADA_AI_THINKING","ai_stream_env_var":"NARADA_AI_STREAM","admitted_providers":["codex-subscription","openai-api","anthropic-api"],"scripted_provider_adapter_kind":"scripted_provider_adapter","production_provider_adapter_kind":"codex_subscription_adapter","production_provider_adapter_implemented":false}"#,
            )
            .unwrap_err(),
            "provider_adapter_contract_invalid:schema"
        );
        assert_eq!(
            parse_provider_adapter_contract(
                r#"{"schema":"narada.agent_tui.provider_adapter_contract.v0","provider_execution_env_var":"NARADA_AGENT_TUI_ENABLE_PROVIDER_EXECUTION","provider_adapter_kind_env_var":"NARADA_AGENT_TUI_PROVIDER_ADAPTER_KIND","intelligence_provider_env_var":"NARADA_INTELLIGENCE_PROVIDER","ai_model_env_var":"NARADA_AI_MODEL","ai_thinking_env_var":"NARADA_AI_THINKING","ai_stream_env_var":"NARADA_AI_STREAM","admitted_providers":["codex-subscription","openai-api","anthropic-api"],"scripted_provider_adapter_kind":"scripted_provider_adapter","production_provider_adapter_kind":"codex_subscription_adapter","production_provider_adapter_implemented":true}"#,
            )
            .unwrap_err(),
            "provider_adapter_contract_invalid:production_provider_adapter_implemented"
        );
    }
}
