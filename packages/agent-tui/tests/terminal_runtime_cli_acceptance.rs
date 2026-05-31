use narada_agent_tui::terminal_runtime_contract::terminal_runtime_contract;
use std::fs::{remove_file, write};
use std::path::PathBuf;
use std::process::Command;
use std::sync::atomic::{AtomicU64, Ordering};

const CONTROL_FIXTURE: &str =
    include_str!("../../carrier-protocol/fixtures/control-input-event.json");
static TEMP_PATH_COUNTER: AtomicU64 = AtomicU64::new(0);

fn base_command() -> Command {
    let contract = terminal_runtime_contract();
    let mut command = Command::new(env!("CARGO_BIN_EXE_narada-agent-tui"));
    command
        .arg("--identity")
        .arg("sonar.resident")
        .arg("--session")
        .arg("carrier_fixture_1")
        .arg("--site-root")
        .arg("D:/code/narada.sonar")
        .env_remove(&contract.terminal_rendering_env_var)
        .env_remove(&contract.terminal_mode_env_var);
    command
}

fn enable_terminal_rendering(command: &mut Command) {
    let contract = terminal_runtime_contract();
    command.env(&contract.terminal_rendering_env_var, "true");
}

fn configure_terminal_mode(command: &mut Command, mode: &str) {
    let contract = terminal_runtime_contract();
    command
        .env(&contract.terminal_rendering_env_var, "true")
        .env(&contract.terminal_mode_env_var, mode);
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

fn run(command: &mut Command) -> std::process::Output {
    command.output().expect("binary runs")
}

fn temp_path(name: &str) -> PathBuf {
    let unique = TEMP_PATH_COUNTER.fetch_add(1, Ordering::Relaxed);
    std::env::temp_dir().join(format!(
        "narada-agent-tui-terminal-runtime-{name}-{}-{unique}.jsonl",
        std::process::id()
    ))
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
    enable_terminal_rendering(&mut command);

    let output = stdout(&mut command);

    assert!(output.contains("terminal_status: refused"));
    assert!(output.contains("terminal_rendering_enabled: false"));
    assert!(output.contains("terminal_refusal: missing_terminal_mode"));
}

#[test]
fn terminal_runtime_cli_acceptance_reports_refusal_for_unsupported_mode() {
    let mut command = base_command();
    configure_terminal_mode(&mut command, "render_once");

    let output = stdout(&mut command);

    assert!(output.contains("terminal_status: refused"));
    assert!(output.contains("terminal_rendering_enabled: false"));
    assert!(output.contains("terminal_refusal: unsupported_terminal_mode:render_once"));
}

#[test]
fn terminal_runtime_cli_acceptance_reports_configured_interactive_loop() {
    let mut command = base_command();
    configure_terminal_mode(
        &mut command,
        terminal_runtime_contract().required_terminal_mode.as_str(),
    );

    let output = stdout(&mut command);

    assert!(output.contains("terminal_status: configured"));
    assert!(output.contains("terminal_rendering_enabled: true"));
    assert!(output.contains("terminal_mode: interactive_loop"));
}

#[test]
fn terminal_runtime_cli_acceptance_refuses_render_once_when_gate_disabled() {
    let mut command = base_command();
    command.arg("--render-once");

    let output = run(&mut command);

    assert!(!output.status.success());
    let stderr = String::from_utf8(output.stderr).expect("stderr is utf8");
    assert!(stderr.contains(
        "terminal_render_once_not_admitted:status=disabled:reason=terminal_rendering_not_enabled"
    ));
}

#[test]
fn terminal_runtime_cli_acceptance_refuses_interactive_loop_when_gate_disabled() {
    let control_path = temp_path("control");
    let session_path = temp_path("session");
    write(&control_path, format!("{CONTROL_FIXTURE}\n")).expect("control fixture writes");

    let mut command = base_command();
    command
        .arg("--control-jsonl")
        .arg(&control_path)
        .arg("--session-jsonl")
        .arg(&session_path)
        .arg("--interactive-loop")
        .arg("--max-steps")
        .arg("1");

    let output = run(&mut command);

    assert!(!output.status.success());
    let stderr = String::from_utf8(output.stderr).expect("stderr is utf8");
    assert!(stderr.contains(
        "terminal_interactive_loop_not_admitted:status=disabled:reason=terminal_rendering_not_enabled"
    ));

    remove_file(control_path).ok();
    remove_file(session_path).ok();
}
