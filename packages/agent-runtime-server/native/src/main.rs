mod native_runtime;

use std::env;
use std::process::{Command, Stdio};

fn main() {
    let args: Vec<String> = env::args().skip(1).collect();
    let result = if should_delegate(&args) {
        delegate_to_node(&args)
    } else {
        native_runtime::run(&args).map(|()| 0)
    };
    match result {
        Ok(code) => std::process::exit(code),
        Err(error) => {
            eprintln!("narada-agent-runtime-server-rust: {error}");
            std::process::exit(1);
        }
    }
}

fn should_delegate(args: &[String]) -> bool {
    if env::var("NARADA_RUNTIME_DELEGATE").ok().as_deref() == Some("1") {
        return true;
    }
    if args
        .iter()
        .any(|arg| arg == "--bridge-conformance" || arg == "--protocol-conformance")
    {
        return true;
    }
    // The process-boundary benchmark intentionally launches the binary with no
    // NARS binding. Keep that fixture on the explicit legacy adapter path.
    args.is_empty() && env::var_os("NARADA_RUNTIME_SERVER_SCRIPT").is_some()
}

fn delegate_to_node(args: &[String]) -> Result<i32, String> {
    let script = env::var("NARADA_RUNTIME_SERVER_SCRIPT")
        .map_err(|_| "NARADA_RUNTIME_SERVER_SCRIPT is required for delegated mode".to_string())?;
    if script.trim().is_empty() {
        return Err("NARADA_RUNTIME_SERVER_SCRIPT is empty".to_string());
    }

    let node = env::var("NARADA_RUNTIME_NODE_COMMAND").unwrap_or_else(|_| "node".to_string());
    let mut command = Command::new(node);
    command
        .arg(script)
        .args(args)
        .env("NARADA_RUNTIME_ENGINE", "rust")
        .stdin(Stdio::inherit())
        .stdout(Stdio::inherit())
        .stderr(Stdio::inherit());

    let status = command
        .status()
        .map_err(|error| format!("node_runtime_spawn_failed:{error}"))?;
    Ok(status.code().unwrap_or(1))
}
