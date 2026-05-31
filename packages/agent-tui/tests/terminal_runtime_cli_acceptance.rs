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
        .env_remove("NARADA_AGENT_TUI_ENABLE_TERMINAL_RENDERING")
        .env_remove("NARADA_AGENT_TUI_TERMINAL_MODE");
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
fn terminal_runtime_cli_acceptance_reports_disabled_by_default() {
    let output = stdout(&mut base_command());

    assert!(output.contains("terminal_status: disabled"));
    assert!(output.contains("terminal_rendering_enabled: false"));
    assert!(!output.contains("terminal_mode:"));
}

#[test]
fn terminal_runtime_cli_acceptance_reports_refusal_when_enabled_without_mode() {
    let mut command = base_command();
    command.env("NARADA_AGENT_TUI_ENABLE_TERMINAL_RENDERING", "true");

    let output = stdout(&mut command);

    assert!(output.contains("terminal_status: refused"));
    assert!(output.contains("terminal_rendering_enabled: false"));
    assert!(output.contains("terminal_refusal: missing_terminal_mode"));
}

#[test]
fn terminal_runtime_cli_acceptance_reports_refusal_for_unsupported_mode() {
    let mut command = base_command();
    command
        .env("NARADA_AGENT_TUI_ENABLE_TERMINAL_RENDERING", "true")
        .env("NARADA_AGENT_TUI_TERMINAL_MODE", "render_once");

    let output = stdout(&mut command);

    assert!(output.contains("terminal_status: refused"));
    assert!(output.contains("terminal_rendering_enabled: false"));
    assert!(output.contains("terminal_refusal: unsupported_terminal_mode:render_once"));
}

#[test]
fn terminal_runtime_cli_acceptance_reports_configured_interactive_loop() {
    let mut command = base_command();
    command
        .env("NARADA_AGENT_TUI_ENABLE_TERMINAL_RENDERING", "true")
        .env("NARADA_AGENT_TUI_TERMINAL_MODE", "interactive_loop");

    let output = stdout(&mut command);

    assert!(output.contains("terminal_status: configured"));
    assert!(output.contains("terminal_rendering_enabled: true"));
    assert!(output.contains("terminal_mode: interactive_loop"));
}
