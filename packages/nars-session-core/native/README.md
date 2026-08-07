# Native NARS session core

This crate is the Rust implementation of the durable semantics owned by
`@narada-core/nars-session-core`. It owns the JSONL journal and replay,
lifecycle/turn/input-admission state, operator queue, recovery attempts,
artifact lifecycle/index/content admission, surface attachments, session
discovery projections, and authority-transition state. Provider execution,
MCP transport, and client rendering remain adapter responsibilities.

The JSON schemas and on-disk paths intentionally match the TypeScript package.
The runtime-server binary consumes this crate directly; it does not delegate
these mutations to Node or Bun. Provider adapters implement
`NarsProviderAdapter` and return a `ProviderOutcome`; they do not own queue,
turn, journal, or recovery transitions.
