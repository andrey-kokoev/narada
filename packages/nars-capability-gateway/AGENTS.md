# AGENTS.md - @narada2/nars-capability-gateway

This package owns the Narada capability gateway: MCP server lifecycle, tool catalog projection, explicit tool admission, and MCP request dispatch.

For the runtime contract, read:

- `../../docs/concepts/nars-runtime-contract.md`
- `../../docs/concepts/narada-agent-runtime-server.md`
- `../agent-runtime-server/AGENTS.md`

## Package Role

`@narada2/nars-capability-gateway` is the authority boundary for capability transport inside NARS. It is used by the runtime server and remains independent of provider turn execution and session persistence.

It owns:

- MCP server discovery, startup, degraded startup reporting, and close;
- the gateway lifecycle state machine (`idle`, `starting`, `healthy`, `degraded`, `closing`, `closed`, `failed`);
- tool catalog projection and explicit admission before dispatch;
- one state machine per tool execution (`requested`, `admitted`, `executing`, `completed`, `refused`, `failed`, `interrupted`);
- gateway/tool transition evidence delivered through the injected evidence callback.

It does not own:

- the NARS session journal or durable turn lifecycle;
- provider/model execution;
- operator transport or client rendering;
- external effect confirmation or Site policy.

## Boundary Rules

All MCP requests cross this package through `createNarsCapabilityGateway()`. Callers must not call `mcp-runtime` transport helpers directly for a live turn, bypass explicit admission, or infer lifecycle state from process handles.

Each tool attempt has a unique `execution_id`. `turn_id` and `input_event_id` are correlation fields only; session-core remains authoritative for turn state. Terminal attempt states cannot transition again, and cancellation must surface as `interrupted` rather than as a successful tool result.

The gateway may emit compatibility terminal evidence (`tool_execution_completed`, `tool_execution_refused`, `tool_execution_failed`, and `tool_execution_interrupted`) in addition to explicit state-transition evidence. Evidence is delivered to the caller; this package does not write session files.

## Verification

Run the focused package checks from the repository root:

```text
pnpm --filter @narada2/nars-capability-gateway test
pnpm --filter @narada2/nars-capability-gateway typecheck
```

The test suite includes state-table tests, startup/close races, retry and degraded startup, admission/refusal, transport failure, interruption, and real MCP failure transport cases.
