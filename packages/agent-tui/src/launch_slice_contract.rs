use std::sync::OnceLock;

use serde::Deserialize;

const LAUNCH_SLICE_CONTRACT_JSON: &str = include_str!("../contracts/launch-slice.json");

#[derive(Debug, Clone, Deserialize)]
pub struct LaunchSliceContract {
    pub schema: String,
    pub admitted_runtime_slice: String,
    pub carrier_flag: String,
    pub tool_fabric_adapter_kind: String,
    pub capability_policy_smoke_step: String,
    pub terminal_mode: bool,
}

static LAUNCH_SLICE_CONTRACT: OnceLock<LaunchSliceContract> = OnceLock::new();

pub fn launch_slice_contract() -> &'static LaunchSliceContract {
    LAUNCH_SLICE_CONTRACT.get_or_init(|| {
        parse_launch_slice_contract(LAUNCH_SLICE_CONTRACT_JSON)
            .expect("bundled launch slice contract must be valid")
    })
}

pub fn parse_launch_slice_contract(json_text: &str) -> Result<LaunchSliceContract, String> {
    let contract: LaunchSliceContract = serde_json::from_str(json_text)
        .map_err(|error| format!("launch_slice_contract_parse_failed:{error}"))?;
    if contract.schema != "narada.agent_tui.launch_slice_contract.v0" {
        return Err("launch_slice_contract_invalid:schema".to_string());
    }
    if contract.admitted_runtime_slice != "bounded_non_terminal_interactive_step_once" {
        return Err("launch_slice_contract_invalid:admitted_runtime_slice".to_string());
    }
    if contract.carrier_flag != "--interactive-step-once" {
        return Err("launch_slice_contract_invalid:carrier_flag".to_string());
    }
    if contract.tool_fabric_adapter_kind != "narada-agent-tui-interactive-step" {
        return Err("launch_slice_contract_invalid:tool_fabric_adapter_kind".to_string());
    }
    if contract.capability_policy_smoke_step != "bounded_non_terminal_control_jsonl" {
        return Err("launch_slice_contract_invalid:capability_policy_smoke_step".to_string());
    }
    if contract.terminal_mode {
        return Err("launch_slice_contract_invalid:terminal_mode".to_string());
    }
    Ok(contract)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn bundled_launch_slice_contract_is_valid() {
        let contract = launch_slice_contract();

        assert_eq!(contract.carrier_flag, "--interactive-step-once");
        assert_eq!(
            contract.admitted_runtime_slice,
            "bounded_non_terminal_interactive_step_once"
        );
        assert_eq!(
            contract.tool_fabric_adapter_kind,
            "narada-agent-tui-interactive-step"
        );
        assert_eq!(
            contract.capability_policy_smoke_step,
            "bounded_non_terminal_control_jsonl"
        );
        assert!(!contract.terminal_mode);
    }

    #[test]
    fn launch_slice_contract_parser_rejects_invalid_contracts() {
        assert!(parse_launch_slice_contract("{")
            .unwrap_err()
            .starts_with("launch_slice_contract_parse_failed:"));
        assert_eq!(
            parse_launch_slice_contract(
                r#"{
                    "schema":"narada.agent_tui.launch_slice_contract.v0",
                    "admitted_runtime_slice":"terminal_interactive_loop",
                    "carrier_flag":"--interactive-step-once",
                    "tool_fabric_adapter_kind":"narada-agent-tui-interactive-step",
                    "capability_policy_smoke_step":"bounded_non_terminal_control_jsonl",
                    "terminal_mode":false
                }"#,
            )
            .unwrap_err(),
            "launch_slice_contract_invalid:admitted_runtime_slice"
        );
        assert_eq!(
            parse_launch_slice_contract(
                r#"{
                    "schema":"narada.agent_tui.launch_slice_contract.v0",
                    "admitted_runtime_slice":"bounded_non_terminal_interactive_step_once",
                    "carrier_flag":"--wrong-step",
                    "tool_fabric_adapter_kind":"narada-agent-tui-interactive-step",
                    "capability_policy_smoke_step":"bounded_non_terminal_control_jsonl",
                    "terminal_mode":false
                }"#,
            )
            .unwrap_err(),
            "launch_slice_contract_invalid:carrier_flag"
        );
    }
}
