# AGENTS.md - @narada2/carrier-runtime

This package owns the in-process carrier substrate used by the Narada Agent Runtime Server (NARS).

For the full concept and implementation contract, read:

- `../../docs/concepts/narada-agent-runtime-server.md`
- `../../docs/concepts/nars-runtime-contract.md`
- `../../docs/concepts/nars-session-management.md`

## Package Role

`@narada2/carrier-runtime` is the NARS carrier runtime substrate. It is not the public NARS package authority.

It owns current implementation placement for:

- provider runtime adapters;
- MCP runtime fabric internals;
- carrier server-mode loop;
- runtime dependency construction;
- session records, event logs, artifacts, and status helper machinery that have not yet been extracted;
- authority transition support modules used by the runtime substrate.

The stable public runtime-server entrypoint belongs to `@narada2/agent-runtime-server`.

## Boundary Rules

Distinguish implementation placement from public contract ownership.

Session discovery, health, attachment, status, event subscription, and protocol schemas are public NARS contract even when current helper code lives in this package during extraction. Client code should depend on the NARS contract and `@narada2/agent-runtime-server`, not on carrier-runtime helper placement.

Do not make this package responsible for:

- public NARS package authority or binary ownership;
- launcher planning, agent selection, or launch packet materialization;
- terminal, TUI, or web client projection behavior;
- client attach command rendering beyond shared contract helpers;
- task lifecycle truth;
- inbox, mailbox, or outbox authority;
- external effect confirmation;
- Site law or capability grants.

Keep client projection metadata in `@narada2/nars-client-projection-contract`, carrier protocol vocabulary in `@narada2/carrier-protocol`, terminal rendering in `@narada2/carrier-terminal-projection`, and the public runtime-server wrapper in `@narada2/agent-runtime-server`.

## Editing Guidance

Use this package for changes to provider invocation, MCP discovery/dispatch internals, runtime dependency wiring, server-mode execution, input queue handling, event/session/artifact helpers, and runtime substrate tests.

If a change alters the public NARS protocol, session binding contract, health/status shape, attachment behavior, or package authority boundary, update the relevant concept docs and coordinate with `../agent-runtime-server` instead of hiding that contract change inside the carrier substrate.

Preserve the invariant that the carrier may host execution, but authority remains in governed Narada structures.
