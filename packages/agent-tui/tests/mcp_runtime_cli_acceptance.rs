use std::fs::{create_dir_all, remove_dir_all, write};
use std::path::PathBuf;
use std::process::Command;
use std::time::{SystemTime, UNIX_EPOCH};

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

fn temp_mcp_fabric() -> PathBuf {
    let unique = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("clock works")
        .as_nanos();
    let fabric = std::env::temp_dir().join(format!("narada-agent-tui-mcp-{unique}"));
    create_dir_all(&fabric).expect("create temp fabric");
    fabric
}

fn path_string(path: &std::path::Path) -> String {
    path.display().to_string()
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
fn mcp_runtime_cli_acceptance_reports_refusal_for_config_outside_site_fabric() {
    let mut command = base_command();
    command
        .env("NARADA_AGENT_TUI_ENABLE_MCP_FABRIC", "true")
        .env(
            "NARADA_AGENT_TUI_MCP_CONFIG",
            "D:/other/.ai/mcp/agent-tui.json",
        )
        .env("NARADA_SITE_MCP_FABRIC", "D:/code/narada.sonar/.ai/mcp");

    let output = stdout(&mut command);

    assert!(output.contains("mcp_status: refused"));
    assert!(output.contains("mcp_fabric_access_enabled: false"));
    assert!(output.contains("mcp_refusal: mcp_config_outside_site_mcp_fabric"));
}

#[test]
fn mcp_runtime_cli_acceptance_reports_refusal_for_unreadable_mcp_config() {
    let fabric = temp_mcp_fabric();
    let config_path = fabric.join("missing-agent-tui.json");
    let mut command = base_command();
    command
        .env("NARADA_AGENT_TUI_ENABLE_MCP_FABRIC", "true")
        .env("NARADA_AGENT_TUI_MCP_CONFIG", path_string(&config_path))
        .env("NARADA_SITE_MCP_FABRIC", path_string(&fabric));

    let output = stdout(&mut command);
    remove_dir_all(&fabric).expect("remove temp fabric");

    assert!(output.contains("mcp_status: refused"));
    assert!(output.contains("mcp_fabric_access_enabled: false"));
    assert!(output.contains("mcp_refusal: mcp_config_unreadable"));
}

#[test]
fn mcp_runtime_cli_acceptance_reports_refusal_for_unparsable_mcp_config() {
    let fabric = temp_mcp_fabric();
    let config_path = fabric.join("agent-tui.json");
    write(&config_path, "not json").expect("write invalid temp mcp config");
    let mut command = base_command();
    command
        .env("NARADA_AGENT_TUI_ENABLE_MCP_FABRIC", "true")
        .env("NARADA_AGENT_TUI_MCP_CONFIG", path_string(&config_path))
        .env("NARADA_SITE_MCP_FABRIC", path_string(&fabric));

    let output = stdout(&mut command);
    remove_dir_all(&fabric).expect("remove temp fabric");

    assert!(output.contains("mcp_status: refused"));
    assert!(output.contains("mcp_fabric_access_enabled: false"));
    assert!(output.contains("mcp_refusal: mcp_config_parse_failed"));
}

#[test]
fn mcp_runtime_cli_acceptance_reports_refusal_for_mcp_config_without_servers() {
    let fabric = temp_mcp_fabric();
    let config_path = fabric.join("agent-tui.json");
    write(&config_path, "{}").expect("write incomplete temp mcp config");
    let mut command = base_command();
    command
        .env("NARADA_AGENT_TUI_ENABLE_MCP_FABRIC", "true")
        .env("NARADA_AGENT_TUI_MCP_CONFIG", path_string(&config_path))
        .env("NARADA_SITE_MCP_FABRIC", path_string(&fabric));

    let output = stdout(&mut command);
    remove_dir_all(&fabric).expect("remove temp fabric");

    assert!(output.contains("mcp_status: refused"));
    assert!(output.contains("mcp_fabric_access_enabled: false"));
    assert!(output.contains("mcp_refusal: mcp_config_missing_mcp_servers"));
}

#[test]
fn mcp_runtime_cli_acceptance_reports_refusal_for_blank_mcp_config_site_id() {
    let fabric = temp_mcp_fabric();
    let config_path = fabric.join("agent-tui.json");
    write(
        &config_path,
        "{\"site_id\":\" \",\"mcpServers\":{\"site\":{\"transport\":\"stdio\",\"command\":\"node\",\"tools\":[\"site_loop_status\"]}}}",
    )
    .expect("write blank site id temp mcp config");
    let mut command = base_command();
    command
        .env("NARADA_AGENT_TUI_ENABLE_MCP_FABRIC", "true")
        .env("NARADA_AGENT_TUI_MCP_CONFIG", path_string(&config_path))
        .env("NARADA_SITE_MCP_FABRIC", path_string(&fabric));

    let output = stdout(&mut command);
    remove_dir_all(&fabric).expect("remove temp fabric");

    assert!(output.contains("mcp_status: refused"));
    assert!(output.contains("mcp_fabric_access_enabled: false"));
    assert!(output.contains("mcp_refusal: mcp_config_invalid:mcp_fabric_config_site_id_invalid"));
}

#[test]
fn mcp_runtime_cli_acceptance_reports_refusal_for_blank_mcp_server_name() {
    let fabric = temp_mcp_fabric();
    let config_path = fabric.join("agent-tui.json");
    write(
        &config_path,
        "{\"mcpServers\":{\" \":{\"transport\":\"stdio\",\"command\":\"node\",\"tools\":[\"site_loop_status\"]}}}",
    )
    .expect("write blank server name temp mcp config");
    let mut command = base_command();
    command
        .env("NARADA_AGENT_TUI_ENABLE_MCP_FABRIC", "true")
        .env("NARADA_AGENT_TUI_MCP_CONFIG", path_string(&config_path))
        .env("NARADA_SITE_MCP_FABRIC", path_string(&fabric));

    let output = stdout(&mut command);
    remove_dir_all(&fabric).expect("remove temp fabric");

    assert!(output.contains("mcp_status: refused"));
    assert!(output.contains("mcp_fabric_access_enabled: false"));
    assert!(output.contains("mcp_refusal: mcp_config_invalid:mcp_fabric_server_name_invalid"));
}

#[test]
fn mcp_runtime_cli_acceptance_reports_refusal_for_blank_mcp_transport() {
    let fabric = temp_mcp_fabric();
    let config_path = fabric.join("agent-tui.json");
    write(
        &config_path,
        "{\"mcpServers\":{\"site\":{\"transport\":\" \",\"command\":\"node\",\"tools\":[\"site_loop_status\"]}}}",
    )
    .expect("write blank transport temp mcp config");
    let mut command = base_command();
    command
        .env("NARADA_AGENT_TUI_ENABLE_MCP_FABRIC", "true")
        .env("NARADA_AGENT_TUI_MCP_CONFIG", path_string(&config_path))
        .env("NARADA_SITE_MCP_FABRIC", path_string(&fabric));

    let output = stdout(&mut command);
    remove_dir_all(&fabric).expect("remove temp fabric");

    assert!(output.contains("mcp_status: refused"));
    assert!(output.contains("mcp_fabric_access_enabled: false"));
    assert!(output.contains("mcp_refusal: mcp_config_invalid:mcp_fabric_transport_invalid:site"));
}

#[test]
fn mcp_runtime_cli_acceptance_reports_refusal_for_blank_mcp_server_command() {
    let fabric = temp_mcp_fabric();
    let config_path = fabric.join("agent-tui.json");
    write(
        &config_path,
        "{\"mcpServers\":{\"site\":{\"transport\":\"stdio\",\"command\":\" \",\"tools\":[\"site_loop_status\"]}}}",
    )
    .expect("write blank command temp mcp config");
    let mut command = base_command();
    command
        .env("NARADA_AGENT_TUI_ENABLE_MCP_FABRIC", "true")
        .env("NARADA_AGENT_TUI_MCP_CONFIG", path_string(&config_path))
        .env("NARADA_SITE_MCP_FABRIC", path_string(&fabric));

    let output = stdout(&mut command);
    remove_dir_all(&fabric).expect("remove temp fabric");

    assert!(output.contains("mcp_status: refused"));
    assert!(output.contains("mcp_fabric_access_enabled: false"));
    assert!(
        output.contains("mcp_refusal: mcp_config_invalid:mcp_fabric_server_command_invalid:site")
    );
}

#[test]
fn mcp_runtime_cli_acceptance_reports_refusal_for_blank_mcp_target_site_root() {
    let fabric = temp_mcp_fabric();
    let config_path = fabric.join("agent-tui.json");
    write(
        &config_path,
        "{\"mcpServers\":{\"site\":{\"transport\":\"stdio\",\"command\":\"node\",\"tools\":[\"site_loop_status\"],\"target_site_root\":\" \"}}}",
    )
    .expect("write blank target root temp mcp config");
    let mut command = base_command();
    command
        .env("NARADA_AGENT_TUI_ENABLE_MCP_FABRIC", "true")
        .env("NARADA_AGENT_TUI_MCP_CONFIG", path_string(&config_path))
        .env("NARADA_SITE_MCP_FABRIC", path_string(&fabric));

    let output = stdout(&mut command);
    remove_dir_all(&fabric).expect("remove temp fabric");

    assert!(output.contains("mcp_status: refused"));
    assert!(output.contains("mcp_fabric_access_enabled: false"));
    assert!(output.contains(
        "mcp_refusal: mcp_config_invalid:mcp_fabric_server_target_site_root_invalid:site"
    ));
}

#[test]
fn mcp_runtime_cli_acceptance_reports_refusal_for_blank_mcp_server_arg() {
    let fabric = temp_mcp_fabric();
    let config_path = fabric.join("agent-tui.json");
    write(
        &config_path,
        "{\"mcpServers\":{\"site\":{\"transport\":\"stdio\",\"command\":\"node\",\"args\":[\" \"],\"tools\":[\"site_loop_status\"]}}}",
    )
    .expect("write blank arg temp mcp config");
    let mut command = base_command();
    command
        .env("NARADA_AGENT_TUI_ENABLE_MCP_FABRIC", "true")
        .env("NARADA_AGENT_TUI_MCP_CONFIG", path_string(&config_path))
        .env("NARADA_SITE_MCP_FABRIC", path_string(&fabric));

    let output = stdout(&mut command);
    remove_dir_all(&fabric).expect("remove temp fabric");

    assert!(output.contains("mcp_status: refused"));
    assert!(output.contains("mcp_fabric_access_enabled: false"));
    assert!(output.contains("mcp_refusal: mcp_config_invalid:mcp_fabric_server_arg_invalid:site"));
}

#[test]
fn mcp_runtime_cli_acceptance_reports_refusal_for_ambiguous_tool_list_fields() {
    let fabric = temp_mcp_fabric();
    let config_path = fabric.join("agent-tui.json");
    write(
        &config_path,
        "{\"mcpServers\":{\"site\":{\"transport\":\"stdio\",\"command\":\"node\",\"tools\":[\"site_loop_status\"],\"allowed_tools\":[\"site_loop_run_once\"]}}}",
    )
    .expect("write ambiguous tools temp mcp config");
    let mut command = base_command();
    command
        .env("NARADA_AGENT_TUI_ENABLE_MCP_FABRIC", "true")
        .env("NARADA_AGENT_TUI_MCP_CONFIG", path_string(&config_path))
        .env("NARADA_SITE_MCP_FABRIC", path_string(&fabric));

    let output = stdout(&mut command);
    remove_dir_all(&fabric).expect("remove temp fabric");

    assert!(output.contains("mcp_status: refused"));
    assert!(output.contains("mcp_fabric_access_enabled: false"));
    assert!(output
        .contains("mcp_refusal: mcp_config_invalid:mcp_fabric_server_tool_list_ambiguous:site"));
}

#[test]
fn mcp_runtime_cli_acceptance_reports_refusal_for_mcp_server_without_tools() {
    let fabric = temp_mcp_fabric();
    let config_path = fabric.join("agent-tui.json");
    write(
        &config_path,
        "{\"mcpServers\":{\"site\":{\"transport\":\"stdio\",\"command\":\"node\"}}}",
    )
    .expect("write missing tools temp mcp config");
    let mut command = base_command();
    command
        .env("NARADA_AGENT_TUI_ENABLE_MCP_FABRIC", "true")
        .env("NARADA_AGENT_TUI_MCP_CONFIG", path_string(&config_path))
        .env("NARADA_SITE_MCP_FABRIC", path_string(&fabric));

    let output = stdout(&mut command);
    remove_dir_all(&fabric).expect("remove temp fabric");

    assert!(output.contains("mcp_status: refused"));
    assert!(output.contains("mcp_fabric_access_enabled: false"));
    assert!(output.contains("mcp_refusal: mcp_config_invalid:mcp_fabric_server_tools_missing:site"));
}

#[test]
fn mcp_runtime_cli_acceptance_reports_refusal_for_blank_mcp_tool_name() {
    let fabric = temp_mcp_fabric();
    let config_path = fabric.join("agent-tui.json");
    write(
        &config_path,
        "{\"mcpServers\":{\"site\":{\"transport\":\"stdio\",\"command\":\"node\",\"tools\":[\" \" ]}}}",
    )
    .expect("write blank tool temp mcp config");
    let mut command = base_command();
    command
        .env("NARADA_AGENT_TUI_ENABLE_MCP_FABRIC", "true")
        .env("NARADA_AGENT_TUI_MCP_CONFIG", path_string(&config_path))
        .env("NARADA_SITE_MCP_FABRIC", path_string(&fabric));

    let output = stdout(&mut command);
    remove_dir_all(&fabric).expect("remove temp fabric");

    assert!(output.contains("mcp_status: refused"));
    assert!(output.contains("mcp_fabric_access_enabled: false"));
    assert!(
        output.contains("mcp_refusal: mcp_config_invalid:mcp_fabric_server_tool_name_invalid:site")
    );
}

#[test]
fn mcp_runtime_cli_acceptance_reports_refusal_for_mcp_config_invalid_transport_shape() {
    let fabric = temp_mcp_fabric();
    let config_path = fabric.join("agent-tui.json");
    write(
        &config_path,
        "{\"mcpServers\":{\"site\":{\"transport\":\"http\",\"command\":\"node\"}}}",
    )
    .expect("write invalid transport temp mcp config");
    let mut command = base_command();
    command
        .env("NARADA_AGENT_TUI_ENABLE_MCP_FABRIC", "true")
        .env("NARADA_AGENT_TUI_MCP_CONFIG", path_string(&config_path))
        .env("NARADA_SITE_MCP_FABRIC", path_string(&fabric));

    let output = stdout(&mut command);
    remove_dir_all(&fabric).expect("remove temp fabric");

    assert!(output.contains("mcp_status: refused"));
    assert!(output.contains("mcp_fabric_access_enabled: false"));
    assert!(output
        .contains("mcp_refusal: mcp_config_invalid:mcp_fabric_transport_unsupported:site:http"));
}

#[test]
fn mcp_runtime_cli_acceptance_reports_configured_explicit_mcp_posture() {
    let fabric = temp_mcp_fabric();
    let config_path = fabric.join("agent-tui.json");
    write(
        &config_path,
        "{\"mcpServers\":{\"site\":{\"transport\":\"stdio\",\"command\":\"node\",\"tools\":[\"site_loop_status\"]}}}",
    )
    .expect("write temp mcp config");
    let mut command = base_command();
    command
        .env("NARADA_AGENT_TUI_ENABLE_MCP_FABRIC", "true")
        .env("NARADA_AGENT_TUI_MCP_CONFIG", path_string(&config_path))
        .env("NARADA_SITE_MCP_FABRIC", path_string(&fabric));

    let output = stdout(&mut command);
    remove_dir_all(&fabric).expect("remove temp fabric");

    assert!(output.contains("mcp_status: configured"));
    assert!(output.contains("mcp_fabric_access_enabled: true"));
    assert!(output.contains(&format!("mcp_config: {}", path_string(&config_path))));
    assert!(output.contains(&format!("site_mcp_fabric: {}", path_string(&fabric))));
}
