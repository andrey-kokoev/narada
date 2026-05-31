use std::fs::{read_to_string, remove_file, write};
use std::path::PathBuf;
use std::process::Command;
use std::time::{SystemTime, UNIX_EPOCH};

const CONTROL_FIXTURE: &str =
    include_str!("../../carrier-protocol/fixtures/control-input-event.json");

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
        .env_remove("NARADA_AI_STREAM")
        .env_remove("NARADA_AGENT_TUI_PROVIDER_ADAPTER_KIND");
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

fn temp_path(name: &str) -> PathBuf {
    let unique = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("clock works")
        .as_nanos();
    std::env::temp_dir().join(format!(
        "narada-agent-tui-provider-runtime-{name}-{unique}.jsonl"
    ))
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
fn provider_runtime_cli_acceptance_reports_configured_without_execution_adapter() {
    let mut command = base_command();
    command
        .env("NARADA_AGENT_TUI_ENABLE_PROVIDER_EXECUTION", "true")
        .env("NARADA_INTELLIGENCE_PROVIDER", "codex-subscription")
        .env("NARADA_AI_MODEL", "gpt-5.5")
        .env("NARADA_AI_THINKING", "medium")
        .env("NARADA_AI_STREAM", "false");

    let output = stdout(&mut command);

    assert!(output.contains("provider_status: configured"));
    assert!(output.contains("provider_execution_enabled: false"));
    assert!(!output.contains("provider_refusal:"));
    assert!(output.contains("provider_adapter_status: configured_without_adapter"));
    assert!(output.contains("provider_adapter_execution_enabled: false"));
    assert!(output.contains("provider_adapter_refusal: provider_adapter_not_admitted"));
    assert!(output.contains("provider: codex-subscription"));
    assert!(output.contains("model: gpt-5.5"));
    assert!(output.contains("thinking: medium"));
    assert!(output.contains("stream: off"));
}

#[test]
fn provider_runtime_cli_acceptance_reports_unknown_adapter_as_refused() {
    let mut command = base_command();
    command
        .env("NARADA_AGENT_TUI_ENABLE_PROVIDER_EXECUTION", "true")
        .env("NARADA_INTELLIGENCE_PROVIDER", "codex-subscription")
        .env("NARADA_AI_MODEL", "gpt-5.5")
        .env("NARADA_AGENT_TUI_PROVIDER_ADAPTER_KIND", "unknown_adapter");

    let output = stdout(&mut command);

    assert!(output.contains("provider_status: configured"));
    assert!(output.contains("provider_execution_enabled: false"));
    assert!(output.contains("provider_adapter_status: refused"));
    assert!(output.contains("provider_adapter_execution_enabled: false"));
    assert!(output.contains("provider_adapter_kind: unknown_adapter"));
    assert!(output.contains("provider_adapter_refusal: unknown_provider_adapter:unknown_adapter"));
}

#[test]
fn provider_runtime_cli_acceptance_reports_requested_adapter_as_refused_until_implemented() {
    let mut command = base_command();
    command
        .env("NARADA_AGENT_TUI_ENABLE_PROVIDER_EXECUTION", "true")
        .env("NARADA_INTELLIGENCE_PROVIDER", "codex-subscription")
        .env("NARADA_AI_MODEL", "gpt-5.5")
        .env(
            "NARADA_AGENT_TUI_PROVIDER_ADAPTER_KIND",
            "codex_subscription_adapter",
        );

    let output = stdout(&mut command);

    assert!(output.contains("provider_status: configured"));
    assert!(output.contains("provider_execution_enabled: false"));
    assert!(output.contains("provider_adapter_status: refused"));
    assert!(output.contains("provider_adapter_execution_enabled: false"));
    assert!(output.contains("provider_adapter_kind: codex_subscription_adapter"));
    assert!(output.contains(
        "provider_adapter_refusal: provider_adapter_not_implemented:codex_subscription_adapter"
    ));
}

fn assert_configured_provider_posture_recorded(session_jsonl: &str) {
    assert_configured_provider_posture_recorded_with_adapter(
        session_jsonl,
        "configured_without_adapter",
        "\"provider_adapter_kind\":null",
        "provider_adapter_not_admitted",
    );
}

fn assert_configured_provider_posture_recorded_with_adapter(
    session_jsonl: &str,
    adapter_status: &str,
    adapter_kind_fragment: &str,
    refusal_reason: &str,
) {
    assert!(session_jsonl.contains("\"provider_request_status\":\"recorded_not_dispatched\""));
    assert!(session_jsonl.contains("\"provider_runtime_status\":\"configured\""));
    assert!(session_jsonl.contains("\"provider\":\"codex-subscription\""));
    assert!(session_jsonl.contains("\"model\":\"gpt-5.5\""));
    assert!(session_jsonl.contains(&format!(
        "\"provider_adapter_admission_status\":\"{adapter_status}\""
    )));
    assert!(session_jsonl.contains(adapter_kind_fragment));
    assert!(session_jsonl.contains(&format!(
        "\"provider_adapter_refusal_reason\":\"{refusal_reason}\""
    )));
}

#[test]
fn provider_runtime_cli_acceptance_records_runtime_posture_in_runtime_step_evidence() {
    let control_path = temp_path("control");
    let session_path = temp_path("session");
    write(&control_path, format!("{CONTROL_FIXTURE}\n")).expect("control fixture writes");

    let mut command = base_command();
    command
        .arg("--control-jsonl")
        .arg(&control_path)
        .arg("--session-jsonl")
        .arg(&session_path)
        .arg("--runtime-step-once")
        .env("NARADA_AGENT_TUI_ENABLE_PROVIDER_EXECUTION", "true")
        .env("NARADA_INTELLIGENCE_PROVIDER", "codex-subscription")
        .env("NARADA_AI_MODEL", "gpt-5.5");

    let output = stdout(&mut command);
    assert!(output.contains("runtime_step_once: ok"));

    let session_jsonl = read_to_string(&session_path).expect("session jsonl exists");
    assert_configured_provider_posture_recorded(&session_jsonl);

    remove_file(control_path).ok();
    remove_file(session_path).ok();
}

#[test]
fn provider_runtime_cli_acceptance_records_requested_adapter_refusal_in_runtime_step_evidence() {
    let control_path = temp_path("control");
    let session_path = temp_path("session");
    write(&control_path, format!("{CONTROL_FIXTURE}\n")).expect("control fixture writes");

    let mut command = base_command();
    command
        .arg("--control-jsonl")
        .arg(&control_path)
        .arg("--session-jsonl")
        .arg(&session_path)
        .arg("--runtime-step-once")
        .env("NARADA_AGENT_TUI_ENABLE_PROVIDER_EXECUTION", "true")
        .env("NARADA_INTELLIGENCE_PROVIDER", "codex-subscription")
        .env("NARADA_AI_MODEL", "gpt-5.5")
        .env(
            "NARADA_AGENT_TUI_PROVIDER_ADAPTER_KIND",
            "codex_subscription_adapter",
        );

    let output = stdout(&mut command);
    assert!(output.contains("runtime_step_once: ok"));

    let session_jsonl = read_to_string(&session_path).expect("session jsonl exists");
    assert_configured_provider_posture_recorded_with_adapter(
        &session_jsonl,
        "refused",
        "\"provider_adapter_kind\":\"codex_subscription_adapter\"",
        "provider_adapter_not_implemented:codex_subscription_adapter",
    );

    remove_file(control_path).ok();
    remove_file(session_path).ok();
}

#[test]
fn provider_runtime_cli_acceptance_records_runtime_posture_in_interactive_step_evidence() {
    let control_path = temp_path("control");
    let session_path = temp_path("session");
    write(&control_path, format!("{CONTROL_FIXTURE}\n")).expect("control fixture writes");

    let mut command = base_command();
    command
        .arg("--control-jsonl")
        .arg(&control_path)
        .arg("--session-jsonl")
        .arg(&session_path)
        .arg("--interactive-step-once")
        .env("NARADA_AGENT_TUI_ENABLE_PROVIDER_EXECUTION", "true")
        .env("NARADA_INTELLIGENCE_PROVIDER", "codex-subscription")
        .env("NARADA_AI_MODEL", "gpt-5.5");

    let output = stdout(&mut command);
    assert!(output.contains("interactive_step_once: ok"));

    let session_jsonl = read_to_string(&session_path).expect("session jsonl exists");
    assert_configured_provider_posture_recorded(&session_jsonl);

    remove_file(control_path).ok();
    remove_file(session_path).ok();
}
