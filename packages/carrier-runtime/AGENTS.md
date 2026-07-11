# AGENTS.md - @narada2/carrier-runtime

This package owns the stateless carrier turn adapter used by the Narada Agent Runtime Server (NARS).

For the full concept and implementation contract, read:

- `../../docs/concepts/narada-agent-runtime-server.md`
- `../../docs/concepts/nars-runtime-contract.md`
- `../../docs/concepts/nars-session-management.md`

## Package Role

`@narada2/carrier-runtime` is a narrow carrier boundary. It is not the public NARS package authority and it is not a session, provider, MCP, or transport runtime.

It owns only:

- the pure `runTurn(context, eventSink, toolGateway)` adapter;
- carrier turn event normalization and bounded tool-loop behavior;
- adapter-focused tests.

The stable public runtime-server entrypoint belongs to `@narada2/agent-runtime-server`.
Session control and durability belong to `@narada2/nars-session-core`; provider execution belongs to `@narada2/nars-provider-runtime`; MCP lifecycle and dispatch belong to `@narada2/nars-capability-gateway`.

## Boundary Rules

Distinguish implementation placement from public contract ownership.

Session discovery, health, attachment, status, event subscription, and protocol schemas are public NARS contracts owned by session-core and the runtime server. Client code should depend on those contracts and `@narada2/agent-runtime-server`, never on carrier-runtime helper placement.

The carrier adapter must remain stateless with respect to sessions. It must not write session files, construct MCP servers, resolve providers, supervise processes, own transport, or expose compatibility facades.

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

Use this package only for changes to carrier-turn adaptation, injected provider-call/tool-gateway coordination, carrier event mapping, and adapter tests.

If a change alters the public NARS protocol, session binding contract, health/status shape, attachment behavior, or package authority boundary, update the relevant concept docs and coordinate with `../agent-runtime-server` instead of hiding that contract change inside the carrier substrate.

Preserve the invariant that the carrier adapter performs one injected turn and returns evidence; lifecycle authority remains in session-core and runtime-server structures.
