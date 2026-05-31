use std::sync::OnceLock;

use serde::{Deserialize, Serialize};

const TERMINAL_RUNTIME_CONTRACT_JSON: &str = include_str!("../contracts/terminal-runtime.json");

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct TerminalRuntimeContract {
    pub schema: String,
    pub terminal_rendering_env_var: String,
    pub terminal_mode_env_var: String,
    pub required_terminal_mode: String,
}

static TERMINAL_RUNTIME_CONTRACT: OnceLock<TerminalRuntimeContract> = OnceLock::new();

pub fn terminal_runtime_contract() -> &'static TerminalRuntimeContract {
    TERMINAL_RUNTIME_CONTRACT.get_or_init(|| {
        parse_terminal_runtime_contract(TERMINAL_RUNTIME_CONTRACT_JSON)
            .expect("bundled terminal runtime contract must be valid")
    })
}

pub fn parse_terminal_runtime_contract(json_text: &str) -> Result<TerminalRuntimeContract, String> {
    let contract: TerminalRuntimeContract = serde_json::from_str(json_text)
        .map_err(|error| format!("terminal_runtime_contract_parse_failed:{error}"))?;
    if contract.schema != "narada.agent_tui.terminal_runtime_contract.v0" {
        return Err("terminal_runtime_contract_invalid:schema".to_string());
    }
    if contract.terminal_rendering_env_var != "NARADA_AGENT_TUI_ENABLE_TERMINAL_RENDERING" {
        return Err("terminal_runtime_contract_invalid:terminal_rendering_env_var".to_string());
    }
    if contract.terminal_mode_env_var != "NARADA_AGENT_TUI_TERMINAL_MODE" {
        return Err("terminal_runtime_contract_invalid:terminal_mode_env_var".to_string());
    }
    if contract.required_terminal_mode != "interactive_loop" {
        return Err("terminal_runtime_contract_invalid:required_terminal_mode".to_string());
    }
    Ok(contract)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn invalid_contract_json(mut mutate: impl FnMut(&mut TerminalRuntimeContract)) -> String {
        let mut contract = terminal_runtime_contract().clone();
        mutate(&mut contract);
        serde_json::to_string(&contract).expect("test terminal runtime contract serializes")
    }

    #[test]
    fn bundled_terminal_runtime_contract_is_valid() {
        let contract = terminal_runtime_contract();

        assert_eq!(
            contract.terminal_rendering_env_var,
            "NARADA_AGENT_TUI_ENABLE_TERMINAL_RENDERING"
        );
        assert_eq!(
            contract.terminal_mode_env_var,
            "NARADA_AGENT_TUI_TERMINAL_MODE"
        );
        assert_eq!(contract.required_terminal_mode, "interactive_loop");
    }

    #[test]
    fn terminal_runtime_contract_parser_rejects_invalid_contracts() {
        assert!(parse_terminal_runtime_contract("{")
            .unwrap_err()
            .starts_with("terminal_runtime_contract_parse_failed:"));
        assert_eq!(
            parse_terminal_runtime_contract(&invalid_contract_json(|contract| {
                contract.required_terminal_mode = "render_once".to_string();
            }))
            .unwrap_err(),
            "terminal_runtime_contract_invalid:required_terminal_mode"
        );
    }
}
