# NARS Runtime Contract

## Purpose

This document defines the implementation-facing shape of the Narada Agent Runtime Server (NARS).

The concept document [`narada-agent-runtime-server.md`](narada-agent-runtime-server.md) defines what NARS is. This document defines the contract implementation code should converge on: package ownership, launch boundary, session protocol, event shape, carrier adapter boundary, and verification expectations.

NARS is the Narada-owned runtime server contract for durable, machine-addressable agent sessions. It is not a synonym for Codex, `agent-cli`, a terminal, a transcript, or a model SDK.

## Package Authority

Canonical package:

```text
@narada2/agent-runtime-server
```

Canonical binary:

```text
narada-agent-runtime-server
```

Compatibility alias:

```text
agent-runtime-server
```

The alias exists for compatibility only. New launcher, worker, wrapper, and documentation paths should resolve `narada-agent-runtime-server` from `@narada2/agent-runtime-server`.

The current package may delegate execution to `@narada2/agent-cli`, but the stable runtime-server entrypoint belongs to `@narada2/agent-runtime-server`.

## Layer Shape

NARS sits below launcher planning and above provider-specific carrier execution:

```text
operator / automation caller
  -> launcher or worker planner
  -> agent-start launch materializer
  -> NARS entrypoint
  -> carrier substrate adapter
  -> provider/model adapter
  -> governed MCP/tool surfaces
```

Load-bearing boundaries:

| Layer | Owns | Does not own |
| --- | --- | --- |
| Launcher planner | Selecting agents, Sites, runtime choice, and launch packet validation. | Provider execution, conversation state, tool execution. |
| `@narada2/agent-start` | Identity/session/event creation, Site MCP fabric validation, provider selection, credential projection, launch result materialization. | Runtime protocol, slash command semantics, provider turn loop. |
| `@narada2/agent-runtime-server` | Stable machine-addressable session entrypoint, protocol projection, session handoff, carrier-server wrapper. | Provider credentials, task truth, external effect authority. |
| Private carrier substrate, currently `@narada2/agent-cli --carrier-server-substrate` | MCP client, provider turn loop, carrier-local session operations, slash-command execution, and event emission under NARS supervision. | Public NARS package authority, launcher planning, or terminal-client attach/projection responsibilities. |
| Authority MCP surfaces | Admitted mutations and authoritative facts. | Model judgment or carrier convenience. |

## Session Binding

A NARS process is bound to exactly one Agent Session unless an explicit future supervisor contract says otherwise.

Required launch inputs:

| Input | Meaning |
| --- | --- |
| `--identity` | Durable Narada agent id, for example `sonar.resident`. |
| `--session` | Durable carrier/session id, for example `carrier_...`. |
| `--site-root` | Site root whose MCP fabric and authority surfaces are mounted. |
| provider/model env | Already resolved by `agent-start`; NARS consumes, not discovers, provider selection. |

Required runtime environment, when available:

| Variable | Meaning |
| --- | --- |
| `NARADA_AGENT_ID` | Bound durable agent id. |
| `NARADA_AGENT_START_EVENT_ID` | Launch event id produced by `agent-start`. |
| `NARADA_CARRIER_SESSION_ID` | Bound carrier/session id. |
| `NARADA_SITE_ROOT` | Site root for mounted authority surfaces. |
| `NARADA_WORKSPACE_ROOT` | Workspace root for the session. |
| `NARADA_INTELLIGENCE_PROVIDER` | Resolved provider id. |
| `NARADA_AI_MODEL` | Resolved model id. |

NARS must not silently substitute a different Site, identity, or MCP fabric from ambient user config. If binding data is absent or contradictory, the runtime should fail before accepting operator or automation turns.

## Protocol Shape

The stable protocol is a request/event contract. The transport may be JSONL stdio, named pipe, local HTTP, WebSocket, or another local transport.

Minimum request methods:

| Method | Purpose |
| --- | --- |
| `conversation.send` | Submit one operator/automation turn and run until terminal state. |
| `conversation.interrupt` | Request bounded interruption of an active turn. |
| `session.status` | Inspect identity, readiness, active turn, MCP posture, and blockers. |
| `session.health` | Return the stable runtime health probe shape used by local health transports. |
| `session.events.subscribe` | Attach to the runtime event stream with replay, filters, and cursor semantics. |
| `session.resume` | Reattach to an existing session handle. |
| `session.close` | Close or hand off a session with terminal evidence. |
| `command.execute` | Execute a slash/operator command through the carrier command contract. |

Human terminal input is not raw JSONL. A terminal attached to NARS is a projection of the protocol: ordinary lines become `conversation.send`, slash commands become `command.execute`, and status/help affordances render from runtime state.

## Client And Runtime Split

NARS is the runtime owner. `@narada2/agent-runtime-server` owns session binding, provider/carrier turn execution, MCP fabric hosting, tool dispatch, durable `events.jsonl`, status/health/event subscription state, and lifecycle hook dispatch. Client packages must not silently recreate those responsibilities.

`@narada2/agent-cli`, `agent-tui`, and future `agent-web-ui` are peer clients/projections over the NARS protocol. Their durable responsibilities are terminal/UI input handling, human-readable event rendering, local command affordances, and explicit attach/resume UX. In attach mode, ordinary operator text becomes `conversation.send`; slash commands become protocol frames such as `command.execute`, `session.status`, `session.health`, `session.events.subscribe`, `conversation.interrupt`, and `session.close`; incoming event envelopes are rendered through the client projection.

Temporary compatibility paths are admitted only while launchers and tests migrate: public `agent-cli --server` is a compatibility alias that delegates to `@narada2/agent-runtime-server`; the runtime server may invoke the private `@narada2/agent-cli --carrier-server-substrate` adapter while the current carrier implementation is being split further. `@narada2/agent-cli` may retain `agent-runtime-server` compatibility shim exports that delegate to `@narada2/agent-runtime-server`.

### Compatibility Removal Criteria

Remove those compatibility paths only when registered launchers resolve `narada-agent-runtime-server` from `@narada2/agent-runtime-server`, attach-mode clients cover operator workflows, and runtime/provider/MCP tests live under the NARS owning package.

## Event Shape

NARS emits structured events that are sufficient to reconstruct a turn without making the transcript authoritative.

Minimum event families:

| Event | Meaning |
| --- | --- |
| `session_started` | Runtime accepted launch binding and exposed a session handle. |
| `session_status` | Current session readiness and operational posture. |
| `directive_received` | A machine/operator turn was accepted for processing. |
| `turn_started` | Provider/carrier loop began for one directive. |
| `assistant_message` | Agent-visible response content. |
| `tool_call` | A tool call was requested. |
| `tool_result` | A tool call completed, failed, or was refused. |
| `command_result` | Slash/operator command completed. |
| `turn_complete` | Directive reached a terminal state. |
| `runtime_error` | Runtime-level fault, not ordinary tool failure. |
| `session_closed` | Session ended or handed off. |

Events should include stable identity fields whenever possible:

```json
{
  "event": "turn_started",
  "agent_id": "sonar.resident",
  "session_id": "carrier_...",
  "request_id": "input_...",
  "timestamp": "2026-06-23T00:00:00.000Z"
}
```

Tool events must preserve the distinction between request, admission/refusal, execution attempt, result, and external confirmation. A successful tool call is not itself authority or confirmation.

## Runtime Health Contract

NARS health is owned by `@narada2/agent-runtime-server`. Its authoritative method is `session.health`; HTTP `GET /health`, terminal `/status` summaries, and launcher discovery fields are projections of the same runtime health builder. Site/control-plane health endpoints remain separate surfaces with separate owners.

`session.health` is a small local probe for runtime liveness, readiness, and operator posture. It does not replace `session.status`: `session.status` may expose richer session operations, command handoffs, queue posture, and debugging detail, while `session.health` must stay stable enough for supervisors and operator tools to poll. It also does not replace `heartbeat.json`: the heartbeat file is durable on-disk evidence written for crash/recovery observation, while `session.health` is a request/response projection of current runtime state that may reference heartbeat freshness.

The response schema is `narada.nars.health.v1`:

```json
{
  "schema": "narada.nars.health.v1",
  "status": "healthy",
  "generated_at": "2026-06-23T00:00:00.000Z",
  "agent_id": "sonar.resident",
  "session_id": "carrier_...",
  "site_root": "D:/code/narada.sonar",
  "runtime": "narada-agent-runtime-server",
  "runtime_mode": "server",
  "started_at": "2026-06-23T00:00:00.000Z",
  "heartbeat": {
    "path": "D:/code/narada.sonar/.narada/crew/nars-sessions/carrier_.../heartbeat.json",
    "last_written_at": "2026-06-23T00:00:00.000Z",
    "age_ms": 250,
    "freshness": "fresh"
  },
  "mcp": {
    "operational_state": "healthy",
    "server_count": 15,
    "startup_failure_count": 0,
    "runtime_fault_count": 0
  },
  "activity": {
    "last_event_kind": "turn_complete",
    "last_event_at": "2026-06-23T00:00:00.000Z",
    "active_turn_state": null,
    "last_terminal_state": "completed"
  },
  "posture": {
    "request_posture": "clean",
    "operational_posture": "healthy"
  },
  "recommended_action": "review_session_summary",
  "recommended_command": "narada-agent-cli --identity sonar.resident --session carrier_... --session-read"
}
```

Allowed `status` values are `starting`, `healthy`, `degraded`, `unhealthy`, and `closing`. `healthy` means the runtime accepted its binding, the session event loop is alive, MCP posture is usable, and heartbeat freshness is within the configured local threshold. `degraded` means the runtime can still answer and may accept some operations, but one or more posture components require attention, such as MCP startup/runtime faults or stale heartbeat evidence. `unhealthy` means the runtime cannot safely accept meaningful work, has lost required binding, or has a runtime-level fault that should drive recovery. `starting` and `closing` are bounded transition states.

Heartbeat freshness is reported as `fresh`, `stale`, `missing`, or `unknown`. Implementations should compute it from one shared runtime helper so `session.health`, HTTP `/health`, and terminal/status projection agree. Freshness thresholds are local runtime policy, not Site law; if no threshold is configured, the response must report `unknown` rather than inventing authority.

HTTP `GET /health` is a local-only projection of `session.health`. It should bind to loopback by default and must not expose provider credentials, raw MCP secrets, global Codex configuration, or external management operations. A non-2xx status is reserved for `unhealthy` runtime conditions defined above; `degraded` may still return 200 with a degraded body unless a caller explicitly requests readiness semantics.

NARS does not define a separate HTTP `GET /ready` endpoint yet. Readiness is a field in `session.health`/`/health` until a concrete supervisor or load-balancer contract needs a distinct endpoint.

## Event Subscription Contract

NARS event subscription is owned by `@narada2/agent-runtime-server`. The canonical protocol method is `session.events.subscribe`; WebSocket `/events`, raw stdout JSONL, terminal projections, and future SSE transports are projections or compatibility surfaces over the same sequenced runtime event stream.

`session.events.subscribe` request parameters:

```json
{
  "id": "events-1",
  "method": "session.events.subscribe",
  "params": {
    "include_replay": true,
    "since_sequence": 42,
    "since_timestamp": "2026-06-23T00:00:00.000Z",
    "max_replay": 100,
    "filters": {
      "event_kinds": ["assistant_message", "tool_call", "tool_result"],
      "families": ["session", "turn"],
      "request_id": "input_...",
      "turn_id": "turn_..."
    }
  }
}
```

`since_sequence` is preferred over `since_timestamp` when both are present. Sequence numbers are monotonically increasing within one NARS session and are exposed as both `event_sequence` and `sequence` for compatibility while the vocabulary settles. `include_replay=false` starts at the next live event. `max_replay` is bounded by runtime policy; implementations must not replay unbounded transcripts to a slow or newly attached client.

The subscription acknowledgement schema is `narada.nars.events.subscription.v1`:

```json
{
  "schema": "narada.nars.events.subscription.v1",
  "event": "session_events_subscription_started",
  "request_id": "events-1",
  "subscription_id": "sub_events-1",
  "transport": "websocket",
  "replay_count": 3,
  "cursor": { "last_sequence": 45, "next_sequence": 46 },
  "filters": {}
}
```

Live and replayed events are wrapped for subscription transports using `narada.nars.events.envelope.v1`:

```json
{
  "schema": "narada.nars.events.envelope.v1",
  "event": "session_event",
  "subscription_id": "sub_events-1",
  "cursor": { "sequence": 46, "next_sequence": 47 },
  "payload": { "event": "assistant_message", "event_sequence": 46 }
}
```

Backpressure is local-runtime policy. The minimum contract is deterministic bounded buffering: slow subscribers may be dropped or receive a structured error, but must not block the carrier event loop or corrupt durable `events.jsonl`. Reconnect uses the last acknowledged `cursor.sequence` as `since_sequence`; clients should tolerate idempotent replay of the last seen event and de-duplicate by sequence.

WebSocket `ws://127.0.0.1:<port>/events` is the first durable co-presence projection. It is local-bound by default, sends `session.events.subscribe` acknowledgements and event envelopes over the socket, and accepts ordinary NARS protocol frames such as `session.status`, `session.health`, `conversation.send`, `conversation.interrupt`, `command.execute`, and `session.close` by forwarding them into the same runtime session. It must not synthesize a second provider/carrier runtime and must not fall back to ambient global MCP or Codex configuration.

Raw stdout JSONL remains a compatibility projection for single attached processes. Durable `events.jsonl` remains the readback/recovery log. Lifecycle hooks remain callbacks correlated with events; they are not the event subscription authority and must not replace `session.events.subscribe` for client co-presence.

## Lifecycle Hook Contract

Lifecycle hooks are runtime callbacks correlated with emitted events. They are not evidence events, are not authority records, and must not be treated as confirmation that an external effect occurred. Evidence remains the structured event stream and the relevant MCP authority surface.

Schema and vocabulary owner:

```text
@narada2/carrier-protocol
```

Invoker owner:

```text
@narada2/agent-runtime-server
```

The current implementation invokes hooks at the runtime-server boundary while the private carrier substrate remains `@narada2/agent-cli --carrier-server-substrate`. Future carrier adapters must map their native events into the same NARS lifecycle vocabulary before dispatching hooks.

### Hook Payload

Hook payloads use schema `narada.nars.lifecycle_hook.v1` and include:

| Field | Required | Meaning |
| --- | --- | --- |
| `schema` | yes | Hook payload schema id. |
| `hook` | yes | Hook name, for example `beforeTurnStart`. |
| `hook_kind` | yes | `session` or `turn`. |
| `agent_id` | yes | Durable Narada agent id. |
| `session_id` | yes | Durable carrier/session id. |
| `timestamp` | yes | UTC timestamp of the dispatch boundary. |
| `event_kind` | no | Canonical NARS event kind correlated with this hook. |
| `request_id` | no | Operator/control input id when the hook belongs to a request. |
| `turn_id` | no | Provider/carrier turn id when the hook belongs to a turn. |
| `directive_id` | no | Directive id when the hook is directive-related. |
| `terminal_state` | no | Terminal state when the correlated event is terminal. |
| `error` | no | Bounded sanitized error object or string. |
| `metadata` | no | Runtime-local metadata; not authority. |
| `source_event` | no | The normalized event that caused dispatch, when available. |

### Session Hooks

| Hook | Ordering | Semantics |
| --- | --- | --- |
| `beforeSessionBind` | before carrier child/session binding is accepted | Exactly once per NARS process when binding inputs are available. Failure before session start is launch-fatal once hooks become externally pluggable. |
| `afterSessionStarted` | after `session_started` is observed/emitted | At least once per resumed observable session handle; consumers must dedupe by `session_id` and source event. |
| `afterSessionStatus` | after `session_status` is observed/emitted | At least once per status request. Status hooks are observational only. |
| `beforeSessionClose` | when `session_closed` is observed, before closeout observers run | At least once for a close event; current wrapper observes it at event boundary rather than before carrier internals close. |
| `afterSessionClosed` | after `session_closed` is observed/emitted | At least once for closeout evidence and handoff generation. |
| `onSessionError` | when a runtime error is session-scoped | At least once per observed session-scoped runtime fault. |

### Turn Hooks

| Hook | Ordering | Semantics |
| --- | --- | --- |
| `beforeDirectiveAccept` | before or at `directive_received` | At least once per directive accepted into carrier flow. |
| `afterDirectiveAccepted` | after `directive_carrier_accepted_recorded` | At least once per accepted directive evidence event. |
| `beforeTurnStart` | before or at `turn_started` | Exactly once for each provider turn id in a normal turn. No provider-free heartbeat turn is required. |
| `onAssistantMessage` | when assistant text is observed | At least once; streaming may produce multiple calls before final content. |
| `onToolCall` | when `tool_call` is observed | At least once per observed tool call. This is not tool admission or effect confirmation. |
| `onToolResult` | when `tool_result` is observed | At least once per observed tool result. Result status may be ok, denied, failed, blocked, or error. |
| `onCommandResult` | when runtime command output is observed | At least once per slash/operator command result. Existing adapter event `carrier_command_result` maps to canonical `command_result`. |
| `afterTurnComplete` | after `turn_complete`, `turn_interrupted`, or `turn_failed` | Exactly once per terminal provider turn id when the carrier emits one terminal event; provider-free directives may map from `directive_complete`. |
| `onRuntimeError` | when runtime-level `error`, `runtime_error`, or `turn_failed` is observed | At least once per observed runtime fault. Ordinary tool failure should remain `onToolResult`, not `onRuntimeError`, unless it also faults the runtime. |

### Ordering Summary

Normal operator turn:

```text
beforeSessionBind
afterSessionStarted
beforeTurnStart
onAssistantMessage* / onToolCall* / onToolResult*
afterTurnComplete
```

System directive that reaches the provider:

```text
beforeDirectiveAccept
afterDirectiveAccepted
beforeTurnStart
...
afterTurnComplete
```

Provider-free heartbeat directive:

```text
beforeDirectiveAccept
afterDirectiveAccepted
afterTurnComplete
```

Closeout:

```text
beforeSessionClose
afterSessionClosed
```

### Idempotency And Failure

Hook consumers must dedupe by `(hook, session_id, request_id, turn_id, event_kind, source_event timestamp/id)` because resumed sessions, replay, or wrapper reattachment may replay observable events. Hooks that run before a carrier action should be exactly once inside one live NARS process. Hooks that follow emitted evidence are at-least-once observations.

Failure policy:

| Phase | Policy |
| --- | --- |
| Before session start | Fail launch before accepting work once external hooks are admitted. Current internal dispatcher records bounded failure diagnostics. |
| During an active turn | Emit/record a bounded runtime hook failure, redact credentials, and do not convert the hook failure into tool authority or external effect evidence. |
| During closeout | Prefer preserving `session_closed` evidence and handoff files; report hook failure separately. Closeout hooks must not block durable session recovery unless the contract explicitly promotes them to a required closeout gate. |

Implementation tasks derive directly from this contract: extend `@narada2/carrier-protocol` vocabulary, dispatch from `@narada2/agent-runtime-server`, map current `@narada2/agent-cli` events into the shared vocabulary, and keep docs/tests tied to the shared package.

## Command Contract

Slash and operator commands are runtime commands, not provider prompts.

Examples:

```text
/help
/status
/recovery
/ops
/exit
```

The command vocabulary should be sourced from `@narada2/carrier-command-contract`. Projected terminal input, help text, and server-side command dispatch should share that contract. If a command is not implemented in a projected runtime, it should fail as an unsupported command with a runtime event, not be sent to the model as ordinary user text.

## Carrier Adapter Boundary

NARS is vendor-neutral. Carrier substrates are replaceable adapters behind the NARS contract.

Current private carrier substrate:

```text
@narada2/agent-cli --carrier-server-substrate
```

Allowed adapter responsibilities:

- start or attach the provider turn loop;
- load the Site MCP fabric passed by launch materialization;
- execute provider turns;
- emit normalized session and turn events;
- expose carrier-local session operations needed by automation and observers.

Forbidden adapter ownership:

- choosing Site root from ambient Codex/global config;
- choosing provider defaults outside launch materialization;
- owning the stable NARS binary name;
- owning public server request admission, status/health projection, event subscription, or lifecycle dispatch outside `@narada2/agent-runtime-server`;
- rendering terminal-client projections from the private carrier substrate path;
- treating vendor SDK permission state as Narada authority;
- converting slash commands into model prompts;
- mutating task/mail/outbox state without the relevant MCP authority surface.

## Worker Delegation Shape

Delegated workers that need a durable Narada-bound agent session should target NARS explicitly:

```json
{
  "runtime": "narada-agent-runtime-server",
  "site_root": "D:/code/narada.sonar",
  "provider": "codex-subscription"
}
```

Workers may still use direct vendor runtimes for low-risk read-only research or external comparison, but that is not a Narada-bound runtime session. If the worker must use Site MCPs, preserve Narada identity, report lifecycle evidence, or continue across turns, NARS is the coherent target.

Worker delegation should pass a work order that includes:

- objective and non-goals;
- Site root and allowed repositories;
- authority level;
- required MCP surfaces;
- verification budget;
- exit interview requirement;
- commit/push gates, when applicable.

## State Ownership

NARS owns runtime session state only:

- launch/session evidence;
- request and turn event traces;
- current readiness/posture;
- conversation context or references;
- carrier adapter metadata;
- resume and closeout handles.

NARS does not own:

- task lifecycle truth;
- inbox/mailbox admission;
- outbox/send authority;
- external effect confirmation;
- Site law or capability grants;
- durable product facts owned by another authority locus.

When it needs those objects, it must use the declared MCP/authority surface and emit crossing evidence.

## Failure Policy

NARS should fail early for binding and authority defects:

| Failure | Expected behavior |
| --- | --- |
| Missing `NARADA_AGENT_START_EVENT_ID` when required by startup hydration | Report binding failure before accepting meaningful work. |
| Site MCP fabric mismatch | Refuse launch or report unhealthy MCP posture. |
| Noncanonical MCP server prefix for a Site-bound launch | Refuse during temporary leak-identification gate until the permanent invariant replaces it. |
| Missing provider credential | Fail provider preflight with provider-specific error and no secret disclosure. |
| Unsupported slash command | Render unsupported command; do not send to model. |
| Carrier substrate crash | Emit runtime error and preserve session/event files for recovery. |

## Verification

Package-local checks:

```powershell
pnpm --filter @narada2/agent-runtime-server test
pnpm --filter @narada2/agent-cli test
pnpm --filter @narada2/agent-start test
```

Launcher/fleet checks:

```powershell
pwsh -NoProfile -File C:\Users\Andrey\Narada\tools\agent-start\Test-AgentStartCoherence.ps1
```

Expected coverage:

- shared lifecycle hook/event vocabulary and payload schema in `@narada2/carrier-protocol`;
- runtime-server hook ordering, alias mapping, and redacted hook failure behavior;
- agent-cli server events expose a `lifecycle_event` projection compatible with the shared vocabulary;
- package exports and binary ownership for `@narada2/agent-runtime-server`;
- `agent-start` resolves `narada-agent-runtime-server` from the package bin;
- startup event id and session id propagate to the runtime server boundary;
- Site MCP fabric is isolated from global/user Codex config;
- projected terminal input maps ordinary text, slash commands, and JSON frames correctly;
- command help/dispatch comes from a shared command contract;
- provider credentials are projected and redacted by launch materialization, not by generated wrappers.

Normal-turn verification example:

```powershell
pnpm --filter @narada2/carrier-protocol test
pnpm --filter @narada2/agent-runtime-server test
pnpm --filter @narada2/agent-cli test
```

Failure-path verification example:

```powershell
pnpm --filter @narada2/agent-runtime-server test
```

The runtime-server tests cover a hook throwing an error containing a secret-like token and assert the diagnostic is bounded and redacted.

## Current Convergence Work

Known convergence arrows from the current implementation:

- keep moving runtime-specific launch branches out of `narada-agent-start.ts` into carrier launch adapters;
- keep moving provider and credential logic into focused `agent-start` modules;
- make `@narada2/carrier-command-contract` the single source for command parser/help/dispatch metadata;
- keep `@narada2/agent-runtime-server` as the package authority even while it delegates to `@narada2/agent-cli`;
- make delegated workers that require Narada-bound Site MCP state use NARS instead of raw vendor runtimes;
- document and test NARS as the stable session protocol, not as the current `agent-cli` implementation detail.
