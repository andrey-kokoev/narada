# Rust NARS runtime backend

This crate is the native runtime-engine implementation for NARS. It drives the
Rust SessionSupervisor, which owns session start, recovery, FIFO admission,
turn coordination, cancellation intent, event journaling, lifecycle/shutdown,
heartbeat/recovery projection, and SQLite session-authority lease updates.
The Rust runtime also owns MCP discovery/stdio lifecycle/tool dispatch and the
provider invocation boundary. A provider subprocess is an external provider
locus; it is never a NARS runtime and cannot acquire session or authority state.

Build it from this package with `pnpm run build:native`, or from this directory:

```text
cargo build --release
```

The launcher selects the resulting binary with `--runtime-engine rust`. The
legacy JavaScript process-boundary adapter remains available only for explicit
conformance/benchmark fixtures or `NARADA_RUNTIME_DELEGATE=1`. A native launch
does not require `NARADA_RUNTIME_SERVER_SCRIPT`.

NARADA_NATIVE_PROVIDER_MODE=echo is a deterministic provider fixture used by
conformance tests. codex/codex-subscription invokes the explicit Codex provider
command (NARADA_NATIVE_CODEX_COMMAND, default codex) with ordinary codex exec
arguments; the runtime does not embed approval or sandbox bypass flags. An unset
provider mode remains blocked, preserving fail-closed behavior when no provider is
selected.
