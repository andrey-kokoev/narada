use std::sync::OnceLock;

use serde::Deserialize;

const MCP_RUNTIME_CONTRACT_JSON: &str = include_str!("../contracts/mcp-runtime.json");

#[derive(Debug, Clone, Deserialize)]
pub struct McpRuntimeContract {
    pub schema: String,
    pub mcp_fabric_env_var: String,
    pub mcp_config_path_policy: String,
}

static MCP_RUNTIME_CONTRACT: OnceLock<McpRuntimeContract> = OnceLock::new();

pub fn mcp_runtime_contract() -> &'static McpRuntimeContract {
    MCP_RUNTIME_CONTRACT.get_or_init(|| {
        parse_mcp_runtime_contract(MCP_RUNTIME_CONTRACT_JSON)
            .expect("agent-tui MCP runtime contract is valid")
    })
}

pub fn parse_mcp_runtime_contract(json: &str) -> Result<McpRuntimeContract, String> {
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

#[cfg(test)]
mod tests {
    use super::*;

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
    fn bundled_mcp_runtime_contract_is_valid() {
        let contract = mcp_runtime_contract();

        assert_eq!(
            contract.mcp_fabric_env_var,
            "NARADA_AGENT_TUI_ENABLE_MCP_FABRIC"
        );
        assert_eq!(
            contract.mcp_config_path_policy,
            "inside_site_mcp_fabric_without_parent_traversal"
        );
    }
}
