# AGENTS.md - @narada2/agent-runtime-server

This package owns the stable Narada Agent Runtime Server (NARS) entrypoint and protocol-facing wrapper.

For the full concept and implementation contract, read:

- `../../docs/concepts/narada-agent-runtime-server.md`
- `../../docs/concepts/nars-runtime-contract.md`
- `../../docs/concepts/nars-session-management.md`

## Package Role

`@narada2/agent-runtime-server` is the public NARS package authority. Its binary is `narada-agent-runtime-server`.

It owns the public runtime-server contract for:

- stable machine-addressable session entrypoint;
- session binding and carrier handoff;
- server request handling;
- session status and health projection;
- runtime event subscription and projection;
- runtime lifecycle hook dispatch;
- artifact HTTP request handling;
- protocol-facing wrapper behavior around the carrier substrate.

It executes the in-process carrier substrate through `@narada2/carrier-runtime`.

## Boundary Rules

Distinguish public NARS ownership from current implementation placement.

NARS owns the runtime responsibility for provider/carrier turn execution, MCP fabric hosting, tool dispatch, event evidence, health/status, and attachment. In the current package split, the provider/MCP/runtime-dependency internals are constructed in `@narada2/carrier-runtime` and wrapped here.

Do not move the following into this package as private implementation internals unless the NARS contract and package split are deliberately changed:

- provider adapter internals;
- MCP server discovery or low-level tool dispatch internals;
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

Keep changes focused on the stable runtime-server wrapper: transport handling, health/status/event projection, lifecycle hooks, session handoff, artifact routing, and request routing into the carrier substrate.

When a change needs provider execution internals, MCP runtime behavior, session records, event logs, or runtime dependency construction, make the change in `../carrier-runtime` unless the NARS contract explicitly moves that implementation surface here.

If a change alters the public NARS protocol, session binding contract, health/status shape, attachment behavior, or package authority boundary, update the relevant concept docs in the same change.

Preserve the invariant that intelligence, tool execution, authority admission, and confirmation remain separated by governed Narada surfaces.
