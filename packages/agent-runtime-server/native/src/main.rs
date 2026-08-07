use std::env;
use std::process::{Command, Stdio};

fn main() {
    match delegate_to_node() {
        Ok(code) => std::process::exit(code),
        Err(error) => {
            eprintln!("narada-agent-runtime-server-rust: {error}");
            std::process::exit(1);
        }
    }
}

fn delegate_to_node() -> Result<i32, String> {
    let script = env::var("NARADA_RUNTIME_SERVER_SCRIPT")
        .map_err(|_| "NARADA_RUNTIME_SERVER_SCRIPT is required".to_string())?;
    if script.trim().is_empty() {
        return Err("NARADA_RUNTIME_SERVER_SCRIPT is empty".to_string());
    }

    let node = env::var("NARADA_RUNTIME_NODE_COMMAND").unwrap_or_else(|_| "node".to_string());
    let mut command = Command::new(node);
    command
        .arg(script)
        .args(env::args().skip(1))
        // The selected executable is itself the runtime-engine boundary. Keep
        // the delegated runtime context truthful even when the binary is
        // launched directly rather than through agent-start.
        .env("NARADA_RUNTIME_ENGINE", "rust")
        .stdin(Stdio::inherit())
        .stdout(Stdio::inherit())
        .stderr(Stdio::inherit());

    let status = command
        .status()
        .map_err(|error| format!("node_runtime_spawn_failed:{error}"))?;
    Ok(status.code().unwrap_or(1))
}
