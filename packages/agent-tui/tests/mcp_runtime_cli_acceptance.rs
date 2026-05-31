use std::process::Command;

fn base_command() -> Command {
    let mut command = Command::new(env!("CARGO_BIN_EXE_narada-agent-tui"));
    command
        .arg("--identity")
        .arg("sonar.resident")
        .arg("--session")
        .arg("carrier_fixture_1")
        .arg("--site-root")
        .arg("D:/code/narada.sonar")
        .env_remove("NARADA_AGENT_TUI_ENABLE_MCP_FABRIC")
        .env_remove("NARADA_AGENT_TUI_MCP_CONFIG")
        .env_remove("NARADA_SITE_MCP_FABRIC");
    command
}

fn stdout(command: &mut Command) -> String {
    let output = command.output().expect("binary runs");
    assert!(
        output.status.success(),
        "process failed: {}",
        String::from_utf8_lossy(&output.stderr)
    );
    String::from_utf8(output.stdout).expect("stdout is utf8")
}

#[test]
fn mcp_runtime_cli_acceptance_reports_disabled_by_default() {
    let output = stdout(&mut base_command());

    assert!(output.contains("mcp_status: disabled"));
    assert!(output.contains("mcp_fabric_access_enabled: false"));
    assert!(!output.contains("mcp_config:"));
}

#[test]
fn mcp_runtime_cli_acceptance_reports_refusal_when_enabled_without_config() {
    let mut command = base_command();
    command
        .env("NARADA_AGENT_TUI_ENABLE_MCP_FABRIC", "true")
        .env("NARADA_SITE_MCP_FABRIC", "D:/code/narada.sonar/.ai/mcp");

    let output = stdout(&mut command);

    assert!(output.contains("mcp_status: refused"));
    assert!(output.contains("mcp_fabric_access_enabled: false"));
    assert!(output.contains("mcp_refusal: missing_mcp_config"));
}

#[test]
fn mcp_runtime_cli_acceptance_reports_configured_explicit_mcp_posture() {
    let mut command = base_command();
    command
        .env("NARADA_AGENT_TUI_ENABLE_MCP_FABRIC", "true")
        .env(
            "NARADA_AGENT_TUI_MCP_CONFIG",
            "D:/code/narada.sonar/.ai/mcp/agent-tui.json",
        )
        .env("NARADA_SITE_MCP_FABRIC", "D:/code/narada.sonar/.ai/mcp");

    let output = stdout(&mut command);

    assert!(output.contains("mcp_status: configured"));
    assert!(output.contains("mcp_fabric_access_enabled: true"));
    assert!(output.contains("mcp_config: D:/code/narada.sonar/.ai/mcp/agent-tui.json"));
    assert!(output.contains("site_mcp_fabric: D:/code/narada.sonar/.ai/mcp"));
}
