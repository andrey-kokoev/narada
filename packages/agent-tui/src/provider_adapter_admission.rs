use crate::provider_runtime_config::{ProviderRuntimeAdmissionStatus, ProviderRuntimeConfig};

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ProviderAdapterAdmissionStatus {
    Disabled,
    Refused,
    ConfiguredWithoutAdapter,
    Admitted,
}

impl ProviderAdapterAdmissionStatus {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Disabled => "disabled",
            Self::Refused => "refused",
            Self::ConfiguredWithoutAdapter => "configured_without_adapter",
            Self::Admitted => "admitted",
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ProviderAdapterAdmission {
    pub status: ProviderAdapterAdmissionStatus,
    pub provider: Option<String>,
    pub model: Option<String>,
    pub adapter_kind: Option<String>,
    pub provider_execution_enabled: bool,
    pub refusal_reason: Option<String>,
}

impl ProviderAdapterAdmission {
    pub fn from_runtime_config(
        runtime_config: &ProviderRuntimeConfig,
        adapter_kind: Option<&str>,
    ) -> Self {
        match runtime_config.status {
            ProviderRuntimeAdmissionStatus::Disabled => Self {
                status: ProviderAdapterAdmissionStatus::Disabled,
                provider: None,
                model: None,
                adapter_kind: None,
                provider_execution_enabled: false,
                refusal_reason: None,
            },
            ProviderRuntimeAdmissionStatus::Refused => Self {
                status: ProviderAdapterAdmissionStatus::Refused,
                provider: runtime_config.provider.clone(),
                model: runtime_config.model.clone(),
                adapter_kind: None,
                provider_execution_enabled: false,
                refusal_reason: runtime_config.refusal_reason.clone(),
            },
            ProviderRuntimeAdmissionStatus::ConfiguredNotImplemented => {
                let adapter_kind = adapter_kind
                    .map(str::trim)
                    .filter(|value| !value.is_empty())
                    .map(ToString::to_string);
                if let Some(adapter_kind) = adapter_kind {
                    Self {
                        status: ProviderAdapterAdmissionStatus::Admitted,
                        provider: runtime_config.provider.clone(),
                        model: runtime_config.model.clone(),
                        adapter_kind: Some(adapter_kind),
                        provider_execution_enabled: true,
                        refusal_reason: None,
                    }
                } else {
                    Self {
                        status: ProviderAdapterAdmissionStatus::ConfiguredWithoutAdapter,
                        provider: runtime_config.provider.clone(),
                        model: runtime_config.model.clone(),
                        adapter_kind: None,
                        provider_execution_enabled: false,
                        refusal_reason: Some("provider_adapter_not_admitted".to_string()),
                    }
                }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::BTreeMap;

    fn env(pairs: &[(&str, &str)]) -> BTreeMap<String, String> {
        pairs
            .iter()
            .map(|(key, value)| (key.to_string(), value.to_string()))
            .collect()
    }

    #[test]
    fn disabled_runtime_disables_adapter_admission() {
        let runtime_config = ProviderRuntimeConfig::disabled();
        let admission = ProviderAdapterAdmission::from_runtime_config(
            &runtime_config,
            Some("codex_subscription_adapter"),
        );

        assert_eq!(admission.status, ProviderAdapterAdmissionStatus::Disabled);
        assert_eq!(admission.status.as_str(), "disabled");
        assert!(!admission.provider_execution_enabled);
        assert_eq!(admission.adapter_kind, None);
    }

    #[test]
    fn refused_runtime_refuses_adapter_admission() {
        let runtime_config = ProviderRuntimeConfig::from_env_map(&env(&[
            ("NARADA_AGENT_TUI_ENABLE_PROVIDER_EXECUTION", "true"),
            ("NARADA_INTELLIGENCE_PROVIDER", "unknown-provider"),
            ("NARADA_AI_MODEL", "gpt-5.5"),
        ]));
        let admission = ProviderAdapterAdmission::from_runtime_config(
            &runtime_config,
            Some("codex_subscription_adapter"),
        );

        assert_eq!(admission.status, ProviderAdapterAdmissionStatus::Refused);
        assert!(!admission.provider_execution_enabled);
        assert_eq!(
            admission.refusal_reason.as_deref(),
            Some("provider_not_admitted:unknown-provider")
        );
    }

    #[test]
    fn configured_runtime_without_adapter_is_not_execution_admitted() {
        let runtime_config = ProviderRuntimeConfig::from_env_map(&env(&[
            ("NARADA_AGENT_TUI_ENABLE_PROVIDER_EXECUTION", "true"),
            ("NARADA_INTELLIGENCE_PROVIDER", "codex-subscription"),
            ("NARADA_AI_MODEL", "gpt-5.5"),
        ]));
        let admission = ProviderAdapterAdmission::from_runtime_config(&runtime_config, None);

        assert_eq!(
            admission.status,
            ProviderAdapterAdmissionStatus::ConfiguredWithoutAdapter
        );
        assert_eq!(admission.status.as_str(), "configured_without_adapter");
        assert_eq!(admission.provider.as_deref(), Some("codex-subscription"));
        assert_eq!(admission.model.as_deref(), Some("gpt-5.5"));
        assert!(!admission.provider_execution_enabled);
        assert_eq!(
            admission.refusal_reason.as_deref(),
            Some("provider_adapter_not_admitted")
        );
    }

    #[test]
    fn configured_runtime_with_adapter_admits_execution_boundary() {
        let runtime_config = ProviderRuntimeConfig::from_env_map(&env(&[
            ("NARADA_AGENT_TUI_ENABLE_PROVIDER_EXECUTION", "true"),
            ("NARADA_INTELLIGENCE_PROVIDER", "codex-subscription"),
            ("NARADA_AI_MODEL", "gpt-5.5"),
        ]));
        let admission = ProviderAdapterAdmission::from_runtime_config(
            &runtime_config,
            Some("codex_subscription_adapter"),
        );

        assert_eq!(admission.status, ProviderAdapterAdmissionStatus::Admitted);
        assert_eq!(admission.status.as_str(), "admitted");
        assert!(admission.provider_execution_enabled);
        assert_eq!(
            admission.adapter_kind.as_deref(),
            Some("codex_subscription_adapter")
        );
        assert_eq!(admission.refusal_reason, None);
    }
}
