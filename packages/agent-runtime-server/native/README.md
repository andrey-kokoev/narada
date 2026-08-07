# Rust NARS runtime backend

This crate is the first native runtime-engine backend for NARS. It owns the
native process boundary and delegates the not-yet-ported runtime-server
components to the existing Node entrypoint through the stable NARS arguments
and environment contract.

Build it from this directory:

```text
cargo build --release
```

The launcher selects the resulting binary with `--runtime-engine rust`. The
delegated JavaScript entrypoint is supplied through
`NARADA_RUNTIME_SERVER_SCRIPT`; `NARADA_RUNTIME_NODE_COMMAND` may override the
Node executable used by the bridge. The bridge sets `NARADA_RUNTIME_ENGINE=rust`
for the delegated process so runtime context remains truthful on direct native
launches as well as agent-start launches.
