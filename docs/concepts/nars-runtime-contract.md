# NARS Runtime Contract

## Purpose

This document defines the implementation-facing shape of the Narada Agent Runtime Server (NARS).

The concept document [`narada-agent-runtime-server.md`](narada-agent-runtime-server.md) defines what NARS is. This document defines the contract implementation code should converge on: package ownership, launch boundary, session protocol, event shape, carrier adapter boundary, and verification expectations.

The full target for session discovery, liveness, attachment, and recovery is [`nars-session-management.md`](nars-session-management.md). The general authority/projection/surface topology is [`narada-runtime-projection-graph.md`](narada-runtime-projection-graph.md). The target for Cloudflare-hosted remote browser projection of local NARS sessions is [`cloudflare-nars-web-projection.md`](cloudflare-nars-web-projection.md), with the narrower gateway slice in [`nars-remote-projection-gateway.md`](nars-remote-projection-gateway.md).

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

The stable runtime-server entrypoint belongs to `@narada2/agent-runtime-server` and binds each transport to one `@narada2/nars-session-core` supervisor. It invokes `@narada2/carrier-runtime` only as a stateless carrier turn adapter.

Session discovery, health, and attachment schemas are public NARS contracts implemented by `@narada2/nars-session-core` and projected by `@narada2/agent-runtime-server`. Client code should depend on the NARS contract, not on internal helper placement.

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
| `@narada2/agent-runtime-server` | Stable machine-addressable session entrypoint, transport projection, and supervision of one session-core instance. | Session persistence internals, provider credentials, task truth, external effect authority. |
| `@narada2/nars-session-core` | Session and turn lifecycle, durable event journal, artifacts, input queue state, health, and recovery. | Provider turns, MCP transport, effect admission, client rendering. |
| `@narada2/nars-capability-gateway` | MCP hosting, gateway lifecycle, explicit capability admission, and tool execution lifecycle/evidence. | Session lifecycle, provider turns, effect confirmation. |
| `@narada2/nars-client-projection-contract` | Client projection capability sets, attach command registry, projection command method aliases, and shared operator command/help projection for NARS clients. | Carrier protocol schema validation, runtime session execution, or browser/terminal rendering. |
| `@narada2/carrier-protocol` | Carrier request/event vocabulary, schema helpers, input admission classification, and runtime event classification. | Client attach command rendering or client-specific capability lists. |
| `@narada2/carrier-runtime` | Pure `runTurn(context, eventSink, toolGateway)` carrier adapter. | Session persistence, MCP hosting, public server protocol, launcher planning, or terminal-client attach/projection responsibilities. |
| `@narada2/carrier-terminal-projection` | Runtime-neutral terminal projection of NARS events and operator input into protocol frames. | Provider execution, MCP hosting, session dispatch, or authority decisions. |
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

The runtime wrapper accepts the same identity/session/Site binding from `NARADA_AGENT_ID`, `NARADA_NARS_SESSION_ID`, `NARADA_RUNTIME_SESSION_ID`, `NARADA_CARRIER_SESSION_ID`, and `NARADA_SITE_ROOT` when launch materialization projects those values through the environment. `NARADA_NARS_SESSION_ID` is canonical, `NARADA_RUNTIME_SESSION_ID` is a compatibility fallback, and `NARADA_CARRIER_SESSION_ID` is legacy-only. All supplied session-id values, including argv, must agree.

Required runtime environment, when available:

| Variable | Meaning |
| --- | --- |
| `NARADA_AGENT_ID` | Bound durable agent id. |
| `NARADA_AGENT_START_EVENT_ID` | Launch event id produced by `agent-start`. |
| `NARADA_NARS_SESSION_ID` | Canonical bound NARS session id. |
| `NARADA_RUNTIME_SESSION_ID` | Compatibility fallback for the bound NARS session id. |
| `NARADA_CARRIER_SESSION_ID` | Legacy compatibility alias for the bound NARS session id. |
| `NARADA_SITE_ROOT` | Site root for mounted authority surfaces. |
| `NARADA_WORKSPACE_ROOT` | Workspace root for the session. |
| `NARADA_INTELLIGENCE_PROVIDER` | Resolved provider id. |
| `NARADA_AI_MODEL` | Resolved model id. |

NARS must not silently substitute a different Site, identity, or MCP fabric from ambient user config. If binding data is absent or contradictory, the runtime should fail before accepting operator or automation turns.

## Runtime Request Lifecycle

Every accepted transport request is tracked independently of the NARS
session, input-admission, turn, and shutdown lifecycles. The current JSONL
runtime uses this FSM:

```text
received -> scheduled -> running -> completed | rejected | failed
                         \
                          -> waiting -> running
```

waiting is the close barrier state. For session.close, the runtime waits for
requests already admitted before the close request to settle, then invokes the
supervisor close path. Close is graceful; callers that need interruption must
send session.cancel explicitly before session.close. The close request's
terminal transition is recorded before session_closed.

The transition event is:

```json
{
  "schema": "narada.nars.runtime_request_state.v1",
  "event": "runtime_request_state_transition",
  "runtime_request_id": "runtime_request_7",
  "request_id": "close-1",
  "method": "session.close",
  "previous_state": "waiting",
  "request_state": "running",
  "terminal_state": null
}
```

The runtime health projection includes aggregate runtime_requests counts.
This is transport evidence: it must not be used as a replacement for
session-core input, turn, recovery, artifact, or shutdown state.

## Protocol Shape

The stable protocol is a request/event contract. The transport may be JSONL stdio, named pipe, local HTTP, WebSocket, or another local transport.

Current session-core control methods:

| Method | Purpose |
| --- | --- |
| `session.submit` | Submit one serialized operator/automation turn. The canonical payload field is `params.content`. |
| `session.health` | Return the stable runtime health probe shape used by local health transports. |
| `session.recovery` | Inspect the current recovery recommendation and recovery handoffs. |
| `session.cancel` | Request cancellation of active work. |
| `session.close` | Close a session with terminal evidence. |

The local event-stream transport also admits `session.events.subscribe` and `session.events.read` for replay and live delivery. They are transport controls, not JSONL turn controls.

Historical `conversation.*`, `session.status`, `session.operations`, observer, authority-transition, affordance, and panel-summary methods are not part of the local session-core contract. The default runtime rejects them. `@narada2/carrier-protocol` and the Cloudflare projection may retain that vocabulary at an explicitly named adapter boundary; such an adapter must translate to the narrow methods above before crossing into local session-core.

Human terminal input is a projection of this contract. Ordinary lines become `session.submit` with `content`; active-turn queueing uses `delivery_mode: "admit_after_active_turn"` and `source: "operator_steering"`. `/status` maps to `session.health`, `/recovery` to `session.recovery`, `/interrupt` to `session.cancel`, `/events` to event subscription, and `/exit` to `session.close`. Unsupported historical commands remain local unavailable messages and are not sent.

MCP surface affordances, provider-specific panels, authority transitions, observer controls, and session synchronization are deferred adapter capabilities. They must not be advertised as local session-core controls until an owning runtime handler and boundary tests exist.

### Runtime Intelligence Reconfiguration

The runtime server owns the control method `runtime.intelligence.reconfigure`.
It is intentionally separate from session-core controls because it changes
provider execution policy, not session authority or turn history.

```json
{
  "method": "runtime.intelligence.reconfigure",
  "params": {
    "request_id": "reconfigure-7",
    "provider": "deepseek-api",
    "model": "deepseek-chat",
    "thinking": "medium"
  }
}
```

`provider` and `model` are explicit target values; `thinking` is optional.
The request never carries an API key. The controller resolves credentials and
base URL from the provider-specific environment already admitted by
`agent-start`.

The reconfiguration request has its own FSM:

```text
requested -> validating -> admitted -> switching -> active
requested | validating | admitted -> refused
switching -> failed
```

Validation is local and bounded: provider contract, adapter, model, and
credential shape are checked without a provider network call. A request is
refused while a turn is active or operator input is pending because changing
the binding mid-turn would make one turn observe two provider contracts. The
caller must wait for a clean turn boundary and retry. The switch replaces the
provider call atomically; the current turn keeps its existing call and future
turns use the new one.

The runtime health projection includes the active provider, model, thinking,
redacted binding metadata, and the latest reconfiguration outcome. Transition
events include the request id and terminal state, but never raw credentials.
Provider continuation state, including Codex thread continuation, is scoped
to the provider-call instance rather than process-global state.

### Durable Turn Lifecycle

`@narada2/nars-session-core` is authoritative for the durable turn FSM (`narada.nars.turn_state.v1`). Each accepted input is one `turn_id` and is persisted through this path:

```text
accepted -> contextualized -> evaluating
  -> tool_requested -> tool_admitted -> executing -> reconciling -> evaluating
  -> completed | blocked | interrupted | failed | refused
```

Tool stages may repeat. A refused tool may return to `evaluating`; a failed or interrupted turn may be retried only through an explicit `accepted` transition with an incremented attempt. Completed, blocked, and refused turns are terminal and are not replayed automatically. Every state change is appended as `turn_lifecycle_transition`; compatibility events such as `turn_started`, `turn_complete`, `turn_failed`, and `turn_interrupted` are projections of that durable record.

### Capability Gateway Lifecycle

`@narada2/nars-capability-gateway` owns the MCP server and individual tool-attempt state machines. It does not own the session journal or provider turn state. Its gateway lifecycle is:

```text
idle -> starting -> healthy | degraded -> closing -> closed
  \-> closed
starting -> failed -> starting | closed
closing -> failed -> starting | closed
```

`degraded` means the gateway started with one or more MCP startup failures and is exposed through the existing public operational value `startup_degraded`. `failed` is retryable until the gateway is explicitly closed; `closed` is terminal. Repeated concurrent starts share one startup operation, and close waits for an in-flight start before releasing server ownership.

Each tool attempt has its own `execution_id` and follows:

```text
requested -> admitted -> executing -> completed | failed | interrupted
     \-> refused
```

`requested`, `admitted`, and `executing` are non-terminal. `completed`, `refused`, `failed`, and `interrupted` are terminal for that execution id and cannot be replayed into another terminal state. Every transition emits `capability_gateway_lifecycle_transition` or `tool_execution_state_transition`; the existing `tool_execution_completed`, `tool_execution_refused`, `tool_execution_failed`, and `tool_execution_interrupted` events remain terminal compatibility evidence. `turn_id` and `input_event_id` correlate the attempt back to the session boundary, while the gateway remains the authority for tool transport and admission.

### Provider Invocation Lifecycle

`@narada2/nars-provider-runtime` owns the lifecycle of one provider request under schema `narada.nars.provider_invocation_state.v1`. This is distinct from the session-core turn FSM and the capability-gateway tool-attempt FSM: the provider runtime owns request admission, provider-specific request shaping, transport dispatch, response receipt, and the request outcome, but it does not own session state or tool authority.

Each provider invocation has its own `invocation_id` and follows:

```text
requested -> validated -> shaped -> dispatched -> receiving -> completed
requested | validated | shaped -> refused
dispatched | receiving -> failed | interrupted
```

Every transition emits `provider_invocation_state_transition` with the invocation id, provider, adapter kind, transport when known, and `turn_id` / `input_event_id` correlation. `completed`, `refused`, `failed`, and `interrupted` are terminal for that invocation id. The provider runtime never retries inside this FSM; an explicit retry creates a new invocation under the owning turn policy. Provider failures remain provider-invocation evidence and do not silently become turn-state transitions; session-core observes the carrier's turn outcome separately.

The carrier forwards the correlation fields and the session event sink into the provider call. The session supervisor journals the transition events through its existing event boundary. This keeps provider execution observable without allowing provider runtime code to acquire session persistence or MCP authority.

### Artifact Lifecycle

`@narada2/nars-session-core` owns artifact records and their lifecycle under schema `narada.nars.artifact_lifecycle_state.v1`. Registration creates an `active` record; lifecycle transitions are durable in the artifact index and are also journaled as `session_artifact_lifecycle_transition` events when performed through session-core.

```text
active -> revoked  -> archived
       |          \
       v           \
    expired  ------+
       |
       +----------> archived
active ----------------> archived
```

`revoked` and `expired` are non-readable but retain their record and may be archived. `archived` is terminal: it cannot be reactivated or transitioned again. The allowed transitions are `active -> revoked`, `active -> expired`, `active -> archived`, `revoked -> archived`, and `expired -> archived`; all other transitions are refused. Each record retains normalized lifecycle history, including the previous state, new state, timestamp, reason, and optional requester. Legacy records that only contain `lifecycle.state: active` are read as active and receive compatible normalized lifecycle metadata.

Artifact metadata remains readable in every lifecycle state, while artifact content is served only while the record is `active`. Session-core exposes `transitionArtifact`, `revokeArtifact`, `expireArtifact`, and `archiveArtifact`; the runtime server projects the same operation through `PATCH /sessions/{session_id}/artifacts/{artifact_id}` with `{ "state": "revoked|expired|archived", "reason": "..." }`. Both paths use the same FSM and reject illegal transitions.

### Session Lifecycle

`@narada2/nars-session-core` owns the session lifecycle under schema `narada.nars.session_lifecycle_state.v1`. The transition table and event-log rehydration rules are defined in the exported `session-lifecycle-state` module; `session-core` owns journaling and applies the transition guard.

```text
starting -> ready -> closing -> closed
    |         |         |
    +-------> failed <---+
                  |
                  +-----> closed
```

`closed` is terminal. `failed` may only be cleaned up to `closed`; a session cannot return to `starting` or `ready`, and same-state transitions are refused. Rehydration applies only legal `session_lifecycle_transition` records and recognizes the explicit `session_closed` terminal event, preserving the existing durable event contract.

The supervisor separately owns the shutdown barrier under schema `narada.nars.session_shutdown_state.v1`. This is coordination state, not a second session lifecycle:

```text
idle -> cancelling -> draining -> finalizing_queue -> closing_tools -> closed
  |         |           |               |                 |
  +-------> draining   +--------------> failed <----------+
```

When no turn is active, shutdown begins at `draining`; otherwise it begins at `cancelling` and aborts the active provider call. The supervisor cannot enter `closed` until the active queue drain has settled, the active turn has reached a terminal state, pending inputs have been abandoned, and the tool gateway close has completed. A failed barrier leaves the session in `failed` and retains the failure evidence.

### Input Admission Lifecycle

`@narada2/nars-session-core` also owns the admission state of each input event under schema `narada.nars.input_admission_state.v1`. Admission is separate from turn state and provider completion:

```text
accepted -> queued -> held -> queued -> admitted
    |         |         |       |        |
    +-------> dropped   +-----> dropped  +--> abandoned
    +-------> abandoned          +------> abandoned
```

The normal path is `accepted -> queued -> admitted`; `held` represents an explicit runtime hold and returns to `queued` when released. `admitted` is a handoff state, not a terminal state: a crash-recovery reconciliation may move it back to `queued` once with explicit recovery evidence. Only `dropped` and `abandoned` are terminal. During shutdown, pending inputs are deterministically moved to `abandoned` after any active drain has settled. Every transition is included in queue evidence and the corresponding input events; admission never implies provider execution.

### Runtime Host Lifecycle

`@narada2/agent-runtime-server` owns the process/projection host lifecycle under schema `narada.nars.runtime_host_state.v1`. This FSM describes whether the NARS host is bound and serving transports; it does not replace the session, turn, provider, capability, or input-admission FSMs.

```text
created -> binding -> projections_ready -> serving -> closing -> stopped
    \-> failed <---------------------------/       \
         \-> stopped                         failed
```

The host emits `runtime_host_lifecycle_transition` through the runtime event hub and exposes the current snapshot as `runtime_host_state` in health and `session_started` projections. Startup failures move through `failed` and then cleanup to `stopped`; serving failures retain failure evidence before cleanup. Client projections may use the snapshot for liveness display, but they do not own or mutate host state.

## Client And Runtime Split

NARS is the runtime owner. `@narada2/agent-runtime-server` owns session binding, transport projection, durable `events.jsonl`, status/health/event subscription state, and lifecycle hook dispatch. `@narada2/nars-provider-runtime` owns provider turn execution, while `@narada2/nars-capability-gateway` owns MCP fabric hosting, tool dispatch, and tool admission. Client packages must not silently recreate those responsibilities.

In Runtime Projection Graph terms, NARS is an `authority_runtime`; attached clients and remote browser embodiments are `projection_surface` nodes unless a separate authority transfer explicitly says otherwise.

`@narada2/agent-cli`, `agent-tui`, and `@narada2/agent-web-ui` are peer projections over the NARS transport. Their responsibilities are terminal/UI input handling, event rendering, and explicit attach UX. Default clients submit text as `session.submit` and may read `session.health` or `session.recovery` and request `session.close`; unsupported historical methods must not be projected as available. Runtime hosting, provider turn execution, and MCP hosting remain outside client packages.

Client projection metadata is centralized in `@narada2/nars-client-projection-contract`. Launchers and carrier runtime use it for attach command materialization; web UI uses it for admitted NARS methods, operator input command projection, shared event rendering vocabulary, and help text. The same session may be attached by peer clients with `narada-agent-cli --attach <event_endpoint>`, `agent-tui --attach <event_endpoint>`, or `narada-agent-web-ui --event-endpoint <event_endpoint> --health-endpoint <health_endpoint>`. `@narada2/carrier-protocol` remains the carrier protocol vocabulary/classification owner and must not grow client attach command strings or client-specific projection registries.

Session control construction is owned by `@narada2/nars-session-core`; provider execution is owned by `@narada2/nars-provider-runtime`, and capability transport is owned by `@narada2/nars-capability-gateway`. No compatibility package participates in the runtime path. `agent-cli` must not expose runtime-server shims, `--server` delegation, or private carrier-substrate adapter flags; launchers resolve `narada-agent-runtime-server` from `@narada2/agent-runtime-server` directly.

### Runtime Ownership Guard

The former `agent-cli` runtime-server adapter has been removed. Reintroduction requires an explicit migration document and tests proving it does not make `agent-cli` an owner of runtime/provider/MCP hosting.

### Current Ownership Audit

| Area | Current owner | Classification | Evidence | Residual risk |
| --- | --- | --- | --- | --- |
| Stable runtime binary | `@narada2/agent-runtime-server` | already correctly owned | package exports only `narada-agent-runtime-server`; tests assert no `agent-runtime-server` alias and no `@narada2/agent-cli` dependency | low |
| Runtime wrapper, health, events, lifecycle hooks, artifact HTTP projection | `@narada2/agent-runtime-server` | already correctly owned | `server-wrapper.mjs` owns health/event projections and lifecycle dispatch; artifact HTTP delegates record state to session-core | low |
| Provider execution and MCP gateway internals | `@narada2/nars-provider-runtime` and `@narada2/nars-capability-gateway` | explicit split | server delegates provider execution to provider-runtime and capability hosting to the gateway | current runtime ownership |
| Terminal rendering and operator input projection | `@narada2/agent-cli` plus `@narada2/carrier-terminal-projection` | intentionally client-specific | NARS creates projected terminal bridge only when `operator_surface=agent-cli`; raw JSONL and web surfaces bypass terminal projection | low |
| Web projection | `@narada2/agent-web-ui` | correctly owned | package metadata declares web projection ownership and excludes runtime dependency construction/provider execution/MCP hosting | low |
| Launch planning and selector UX | `@narada2/cli` with User Site PowerShell shim | already correctly owned | workspace launcher invokes Narada CLI; PS1 shim owns Windows convenience only | low |
| Direct `agent-cli` runtime/server mode | none; removed | already correctly owned | `agent-cli` reports that non-server conversation runtime has been removed; NARS is the runtime path | low |
| `agent-cli` runtime ownership | `@narada2/agent-runtime-server` | correctly narrowed | separate `D:/code/agent-cli` is a client/projection package with no carrier-runtime, provider-runtime, or MCP-hosting dependency; it attaches to an existing NARS session | low |

Fast verification should use focused package tests:

- `pnpm --filter @narada2/agent-runtime-server test`
- `pnpm --filter @narada2/agent-runtime-server typecheck`
- `pnpm --filter @narada2/agent-start test`
- `node --test packages/layers/cli/test/integration/operator-launch-journey.test.mjs`

Browser/E2E projection tests and full recursive repo tests are not default fast evidence. They must stay behind explicit selectors such as `@narada2/agent-web-ui test:browser`, `test:all`, or root broad test commands with a declared reason and timeout budget.

Residual launch-option risk: the launcher tests are representative, not a full Cartesian product. Coverage should prioritize alias normalization, mutually exclusive legacy/modern options, multi-surface launch, site/role filtering, provider selection/preflight, and stale-dist behavior. Full Cartesian coverage is not practical unless a generated pairwise matrix with bounded cases is introduced.

## Session Discovery And Attachment Index

NARS owns local session discovery for NARS sessions. Client projections such as `agent-cli`, `agent-tui`, and `agent-web-ui` may use discovery to find attachable sessions, but they must not become the source of session truth.

The canonical per-session storage remains the Site-local NARS session directory derived from `siteAuthorityRoot`. Production code resolves this through `@narada2/site-paths`; callers must not manually append `.narada` to an arbitrary `siteRoot`.

```text
<siteAuthorityRoot>/crew/nars-sessions/<session-id>/
  control.jsonl
  session.jsonl
  events.jsonl
  heartbeat.json
  session-index-record.json
```

Existing files keep their authority:

| File | Owner | Meaning |
| --- | --- | --- |
| `control.jsonl` | launcher/NARS control sideband | Admitted operator/system input records for one session. |
| `session.jsonl` | `agent-start` launch materialization | Empty compatibility/attachment path reserved for the bound session. The current runtime does not append the durable transcript here. |
| `events.jsonl` | NARS/carrier runtime | Durable ordered runtime event evidence. |
| `heartbeat.json` | live NARS process | Durable liveness evidence for crash/recovery observation. |
| `session-index-record.json` | live NARS process | Discovery projection for one session. Rebuildable from session events and heartbeat. |

The per-session discovery projection has schema `narada.nars.session_index_record.v1`:

```json
{
  "schema": "narada.nars.session_index_record.v1",
  "session_id": "carrier_...",
  "carrier_session_id": "carrier_...",
  "derived_from_event": "session_started",
  "projection_generated_at": "2026-06-23T00:00:00.000Z",
  "agent_id": "sonar.resident",
  "site_id": "sonar",
  "site_root": "D:/code/narada.sonar",
  "runtime_kind": "narada-agent-runtime-server",
  "session_dir": "<siteAuthorityRoot>/crew/nars-sessions/carrier_...",
  "session_path": ".../session.jsonl",
  "events_path": ".../events.jsonl",
  "heartbeat_path": ".../heartbeat.json",
  "event_endpoint": "ws://127.0.0.1:12345/events",
  "health_endpoint": "http://127.0.0.1:12346/health",
  "started_at": "2026-06-23T00:00:00.000Z",
  "last_seen_at": "2026-06-23T00:00:05.000Z",
  "terminal_state": null,
  "status_hint": "alive",
  "launch_operator_surface_kind": "agent-cli",
  "attached_projections": null,
  "attached_projections_status": "not_tracked",
  "attach_commands": {
    "agent_cli": "narada-agent-cli --attach ws://127.0.0.1:12345/events",
    "agent_tui": "agent-tui --attach ws://127.0.0.1:12345/events",
    "agent_web_ui": "narada-agent-web-ui --event-endpoint ws://127.0.0.1:12345/events --health-endpoint http://127.0.0.1:12346/health"
  }
}
```

The aggregate index lives beside session directories:

```text
<siteAuthorityRoot>/crew/nars-sessions/index.json
```

Its schema is `narada.nars.session_index.v1`. It is a summary projection and pointer table, not an authority replacement:

```json
{
  "schema": "narada.nars.session_index.v1",
  "site_root": "D:/code/narada.sonar",
  "generated_at": "2026-06-23T00:00:05.000Z",
  "sessions": [
    {
      "session_id": "carrier_...",
      "agent_id": "sonar.resident",
      "site_id": "sonar",
      "session_dir": ".../carrier_...",
      "record_path": ".../session-index-record.json",
      "heartbeat_path": ".../heartbeat.json",
      "event_endpoint": "ws://127.0.0.1:12345/events",
      "health_endpoint": "http://127.0.0.1:12346/health",
      "started_at": "2026-06-23T00:00:00.000Z",
      "last_seen_at": "2026-06-23T00:00:05.000Z",
      "terminal_state": null,
      "status_hint": "alive"
    }
  ]
}
```

Write semantics:

1. On `session_started`, NARS writes `session-index-record.json` and updates `index.json` with the emitted `event_endpoint`, `health_endpoint`, attach commands, paths, identity, Site, runtime, and start time.
2. On heartbeat tick, NARS updates `heartbeat.json` and may update `last_seen_at` / `status_hint` in the per-session record. The aggregate `index.json` should not require a write on every heartbeat; implementations may coalesce, throttle, or rebuild aggregate updates from per-session records. This is discovery evidence only; `session.health` remains the live liveness authority.
3. On client attach or detach, NARS may update `attached_projections` when a projection registration surface exists. Until then, `attached_projections=null` with `attached_projections_status=not_tracked` means unknown, and `launch_operator_surface_kind` records only the surface that launched the session, not every attached client.
4. On `session_closed`, NARS marks `terminal_state` and updates both projections.
5. If the process crashes, no close event is required. Readers classify the session from heartbeat age and failed health checks.
6. The aggregate index must be rebuildable by scanning `*/session-index-record.json`, `heartbeat.json`, and durable session events. A stale or corrupt aggregate must not make a live session inaccessible when per-session records remain readable.

Read semantics:

1. Operator surfaces read `index.json` for fast discovery.
2. They filter by Site, agent, role, runtime, or terminal state as needed.
3. They must verify attachable candidates by calling HTTP `/health` or `session.health` through the configured endpoint before presenting a session as active.
4. They attach with `event_endpoint` plus `health_endpoint`, not by inferring from terminal windows or `agent-cli` process state.
5. If `index.json` is missing, readers may scan per-session records. If those are missing, readers may inspect `events.jsonl` and `heartbeat.json` as a last-resort stale diagnostic path.

The session id value may currently be named `carrier_...` because launch materialization still uses `carrier_session_id`. New discovery APIs and docs should call it `session_id` or `NARS session id` and avoid introducing a `carrier_session_index` concept.

Per-Site indexes support target operator UX such as:

```text
narada agent-web-ui --site sonar
narada agent-web-ui attach --event-endpoint <ws-url> --health-endpoint <http-url>
```

No-argument global discovery, for example `narada agent-web-ui`, is a higher-level CLI feature over known Site roots. It must first discover candidate Sites from a User Site launch registry, known-site registry, explicit host/user config, or equivalent registry; then it reads each Site-local NARS session index and verifies candidates by health endpoint. The explicit endpoint form remains the low-level attach primitive.

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

NARS health is owned by `@narada2/agent-runtime-server`. Its authoritative method is `session.health`; HTTP `GET /health`, terminal summaries, and launcher discovery fields are projections of the same public runtime-health builder. Site/control-plane health endpoints remain separate surfaces with separate owners.

`session.health` is the small local probe for runtime liveness and readiness. The session-core supervisor owns the underlying lifecycle, queue, activity, and operational-posture fields; the runtime server projects those fields into the public NARS health schema. Richer durable diagnostics are exposed by `session.recovery`. `session.health` does not replace `heartbeat.json`: heartbeat is durable on-disk evidence for crash/recovery observation.

The public response schema is `narada.nars.health.v1`:

```json
{
  "schema": "narada.nars.health.v1",
  "status": "healthy",
  "generated_at": "2026-07-10T00:00:00.000Z",
  "agent_id": "narada.test",
  "session_id": "session_...",
  "site_root": "D:/code/narada.test",
  "runtime": "narada-agent-runtime-server",
  "runtime_mode": "server",
  "health_endpoint": "http://127.0.0.1:0/health",
  "event_endpoint": "ws://127.0.0.1:0/events",
  "lifecycle_state": "ready",
  "operational_posture": "healthy",
  "request_posture": "clean",
  "mcp_operational_state": "healthy",
  "mcp": {
    "operational_state": "healthy",
    "server_count": null,
    "startup_failure_count": 0,
    "runtime_fault_count": 0
  },
  "heartbeat": {
    "path": "D:/code/narada.test/.narada/crew/nars-sessions/session_.../heartbeat.json",
    "last_written_at": null,
    "age_ms": null,
    "freshness": "missing"
  },
  "activity": {
    "last_event_kind": "session_started",
    "last_event_at": "2026-07-10T00:00:00.000Z",
    "active_turn_id": null,
    "active_turn_state": null,
    "last_turn_id": null,
    "last_turn_state": null,
    "last_terminal_state": null
  },
  "posture": {
    "request_posture": "clean",
    "operational_posture": "healthy"
  },
  "operator_input_queue": {
    "running": false,
    "pending_count": 0
  }
}
```

Allowed `status` values are `starting`, `healthy`, `degraded`, `unhealthy`, and `closing`. `healthy` means the runtime accepted its binding, the session event loop is alive, and the reported operational posture is healthy. `degraded` means the runtime can still answer but one or more posture components require attention. `unhealthy` is reserved for a failed health probe. `starting` and `closing` are bounded transition states.

The public health response keeps session-core fields flat for compatibility with event consumers and also provides the nested `mcp`, `activity`, and `posture` summaries. The health projection does not expose MCP tool schemas; capability inventory belongs to the capability gateway and its explicit evidence/events.

Heartbeat freshness is reported as `missing` when no heartbeat file exists and `unknown` when a file exists but no local freshness threshold is configured. Freshness thresholds are local runtime policy, not Site law.

HTTP `GET /health` is a local-only projection of `session.health`. It binds to loopback by default and must not expose provider credentials, raw MCP secrets, global Codex configuration, or external management operations. A non-2xx status is reserved for `unhealthy` runtime conditions; `degraded` returns 200 unless a caller explicitly requests readiness semantics.

NARS does not define a separate HTTP `GET /ready` endpoint yet. Readiness is a field in `session.health`/`/health` until a concrete supervisor or load-balancer contract needs a distinct endpoint.

## Event Subscription Contract

NARS event subscription is owned by `@narada2/agent-runtime-server`. The canonical live-tail protocol method is `session.events.subscribe`; WebSocket `/events`, raw stdout JSONL, terminal projections, and future SSE transports are projections over the same sequenced runtime event stream. Durable history reads use `session.events.read` against the session `events.jsonl` log; clients should not depend on a WebSocket's in-memory replay buffer for full transcript recovery.

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

`since_sequence` is preferred over `since_timestamp` when both are present. Sequence numbers are monotonically increasing within one NARS session and are exposed as both `event_sequence` and `sequence` during vocabulary convergence. `include_replay=false` starts at the next live event. `max_replay` is bounded by runtime policy; implementations must not replay unbounded transcripts to a slow or newly attached client.

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

`session.events.read` pages the durable event log and is the canonical way for a browser or secondary projection to backfill older history:

```json
{
  "id": "events-read-1",
  "method": "session.events.read",
  "params": {
    "before_sequence": 42,
    "direction": "backward",
    "limit": 100,
    "filters": {
      "event_kinds": ["assistant_message", "tool_call", "tool_result"]
    }
  }
}
```

The response schema is `narada.nars.events.read.v1` with `event: "session_events_read"`, `source: "events_jsonl"`, ordered `events`, `event_count`, `has_more`, and a cursor containing `before_sequence`, `after_sequence`, `last_sequence`, and `next_sequence`. Backward reads return events in chronological order within the returned page. Clients merge pages by event sequence and must de-duplicate replayed or overlapping events.

Backpressure is local-runtime policy. The minimum contract is deterministic bounded buffering: slow subscribers may be dropped or receive a structured error, but must not block the carrier event loop or corrupt durable `events.jsonl`. Reconnect uses the last acknowledged `cursor.sequence` as `since_sequence`; clients should tolerate idempotent replay of the last seen event and de-duplicate by sequence.

WebSocket `ws://127.0.0.1:<port>/events` is the durable co-presence projection. It is local-bound by default and sends replayed and live event envelopes. It is an observation transport, not a second control protocol; control uses the session-core JSONL contract. It must not synthesize another provider/carrier runtime or fall back to ambient global MCP or Codex configuration.

Raw stdout JSONL is a single-process projection. Durable `events.jsonl` remains the readback/recovery log. Lifecycle hooks remain callbacks correlated with events; they are not the event subscription authority and must not replace `session.events.subscribe` for client co-presence.

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

The current implementation invokes hooks at the runtime-server boundary while carrier execution runs through `@narada2/carrier-runtime` in-process. Future carrier adapters must map their native events into the same NARS lifecycle vocabulary before dispatching hooks.

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

Slash and operator commands are runtime/client control commands, not provider prompts. The shared client-projection command model, source tables, and drift rules are documented in [`nars-client-projection-contract.md#operator-slash-command-projection`](nars-client-projection-contract.md#operator-slash-command-projection).

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

Current carrier runtime substrate:

```text
@narada2/carrier-runtime in-process
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

Launcher/fleet checks use record shards so each command remains bounded. Increase
`--record-offset` by `--record-limit` until the verifier reports no more selected
records. Each launch dry-run is bounded by `--launch-timeout-ms`, defaulting to
8500 ms.

```powershell
node packages/agent-start/bin/verify-registered-site-launchers.mjs --registry C:/Users/Andrey/Narada/config/launch/agents.psd1 --start-agent C:/Users/Andrey/Narada/Start-NaradaAgent.ps1 --runtime-policy default-only --record-offset 0 --record-limit 1
node packages/agent-start/bin/verify-registered-site-launchers.mjs --registry C:/Users/Andrey/Narada/config/launch/agents.psd1 --start-agent C:/Users/Andrey/Narada/Start-NaradaAgent.ps1 --runtime-policy agent-tui-only --record-offset 0 --record-limit 1
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

- keep moving runtime-specific launch branches out of `narada-agent-start.ts` into runtime launch adapters;
- keep moving provider and credential logic into focused `agent-start` modules;
- make `@narada2/carrier-command-contract` the single source for command parser/help/dispatch metadata;
- keep `@narada2/agent-runtime-server` as the package authority for server entrypoints and `@narada2/carrier-runtime` as the package authority for carrier execution;
- make delegated workers that require Narada-bound Site MCP state use NARS instead of raw vendor runtimes;
- document and test NARS as the stable session protocol, not as the current `agent-cli` implementation detail.
