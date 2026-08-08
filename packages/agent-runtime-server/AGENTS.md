# AGENTS.md - @narada-core/agent-runtime-server

This package owns the stable Narada Agent Runtime Server (NARS) entrypoint and protocol-facing wrapper.

For the full concept and implementation contract, read:

- `../../docs/concepts/narada-agent-runtime-server.md`
- `../../docs/concepts/nars-runtime-contract.md`
- `../../docs/concepts/nars-session-management.md`

## Package Role

`@narada-core/agent-runtime-server` is the public NARS package authority. Its binary is `narada-agent-runtime-server`.

It owns the public runtime-server contract for:

- stable machine-addressable session entrypoint;
- session binding and carrier handoff;
- server request handling;
- session status and health projection;
- runtime event subscription and projection;
- runtime lifecycle hook dispatch;
- artifact HTTP request handling;
- protocol-facing wrapper behavior around the carrier substrate.

It binds transport and process lifetime to one nars-session-core supervisor. The TypeScript implementation uses the in-process carrier and shared provider/MCP packages. The native implementation composes the Rust session supervisor, native MCP gateway, and native provider adapter; an external provider process remains a provider locus, never a NARS runtime.

The process engine is selected separately by agent-start through runtime_engine_kind
(node, bun, or rust). The Rust backend owns the NARS session-core and
session-authority paths natively, including their event journal, lifecycle,
input admission, heartbeat, recovery, and SQLite lease. It also owns native MCP
discovery/stdio/tool dispatch and provider invocation orchestration. The Node/Bun
implementation remains the compatibility/reference profile; its package
boundaries are not imported into a Rust native launch.

## Boundary Rules

Distinguish public NARS ownership from current implementation placement.

NARS owns the public session-control contract, transport binding, health/event projection, and process lifetime. nars-session-core owns session and turn lifecycle transitions, durable events, artifacts, input queue state, health, recovery, session indexing, and authority transitions. The native modules receive a pure turn context and return turn/provider/tool evidence; they own no session persistence or authority surface outside the supervisor. The TypeScript compatibility profile continues to use carrier-runtime, nars-provider-runtime, and nars-capability-gateway.

Do not move the following into this package as private implementation internals unless the NARS contract and package split are deliberately changed:

- provider adapter internals;
- MCP server discovery or low-level tool dispatch internals, which belong to `@narada-core/nars-capability-gateway`;
- provider credential resolution;
- runtime dependency construction;
- launcher planning or agent selection;
- terminal, TUI, or web client rendering responsibilities.

This package must also not become the authority for:

- task lifecycle truth;
- inbox, mailbox, or outbox authority;
- external effect confirmation;
- Site law or capability grants.

Those responsibilities belong to the packages and authority surfaces named in `../../docs/concepts/nars-runtime-contract.md`.

## Editing Guidance

Keep changes focused on the stable runtime-server wrapper: transport handling, health/event projection, lifecycle hooks, session binding, artifact routing, and request routing into the session-core supervisor.

When a change needs provider execution internals, use `../nars-provider-runtime`; for MCP runtime behavior use `../nars-capability-gateway`; for session records and event logs use `../nars-session-core`. Do not reintroduce those concerns into the carrier adapter.

If a change alters the public NARS protocol, session binding contract, health/status shape, attachment behavior, or package authority boundary, update the relevant concept docs in the same change.

Preserve the invariant that intelligence, tool execution, authority admission, and confirmation remain separated by governed Narada surfaces.
