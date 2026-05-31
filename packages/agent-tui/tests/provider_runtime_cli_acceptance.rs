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
        .env_remove("NARADA_AGENT_TUI_ENABLE_PROVIDER_EXECUTION")
        .env_remove("NARADA_INTELLIGENCE_PROVIDER")
        .env_remove("NARADA_AI_MODEL")
        .env_remove("NARADA_AI_THINKING")
        .env_remove("NARADA_AI_STREAM");
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
fn provider_runtime_cli_acceptance_reports_disabled_by_default() {
    let output = stdout(&mut base_command());

    assert!(output.contains("provider_status: disabled"));
    assert!(output.contains("provider_execution_enabled: false"));
    assert!(output.contains("stream: off"));
    assert!(!output.contains("provider: codex-subscription"));
}

#[test]
fn provider_runtime_cli_acceptance_reports_refusal_when_enabled_without_model() {
    let mut command = base_command();
    command
        .env("NARADA_AGENT_TUI_ENABLE_PROVIDER_EXECUTION", "true")
        .env("NARADA_INTELLIGENCE_PROVIDER", "codex-subscription");

    let output = stdout(&mut command);

    assert!(output.contains("provider_status: refused"));
    assert!(output.contains("provider_execution_enabled: false"));
    assert!(output.contains("provider_refusal: missing_model"));
}

#[test]
fn provider_runtime_cli_acceptance_reports_admitted_explicit_provider_posture() {
    let mut command = base_command();
    command
        .env("NARADA_AGENT_TUI_ENABLE_PROVIDER_EXECUTION", "true")
        .env("NARADA_INTELLIGENCE_PROVIDER", "codex-subscription")
        .env("NARADA_AI_MODEL", "gpt-5.5")
        .env("NARADA_AI_THINKING", "medium")
        .env("NARADA_AI_STREAM", "false");

    let output = stdout(&mut command);

    assert!(output.contains("provider_status: admitted"));
    assert!(output.contains("provider_execution_enabled: true"));
    assert!(output.contains("provider: codex-subscription"));
    assert!(output.contains("model: gpt-5.5"));
    assert!(output.contains("thinking: medium"));
    assert!(output.contains("stream: off"));
}
