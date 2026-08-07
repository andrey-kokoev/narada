# Rust NARS runtime backend

This crate is the native runtime-engine backend for the NARS session core. It
directly owns the session event journal, lifecycle and input-admission
evidence, heartbeat/recovery projection, and SQLite session-authority lease.
Provider execution and MCP dispatch remain explicit adapter boundaries until
their native implementations exist; the Rust core receives only a terminal
`ProviderOutcome` from that adapter.

Build it from this package with `pnpm run build:native`, or from this directory:

```text
cargo build --release
```

The launcher selects the resulting binary with `--runtime-engine rust`. The
legacy JavaScript process-boundary adapter remains available only for explicit
conformance/benchmark fixtures or `NARADA_RUNTIME_DELEGATE=1`. A native launch
does not require `NARADA_RUNTIME_SERVER_SCRIPT`.

`NARADA_NATIVE_PROVIDER_MODE=echo` is a deterministic provider-adapter fixture
used by conformance tests. The default native provider posture is blocked until
an explicit provider adapter is supplied; this keeps unsupported cognition and
MCP work out of the Rust authority path.
