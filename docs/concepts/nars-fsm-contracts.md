# Narada FSM Contracts

Narada uses explicit finite-state machines when a lifecycle controls authority, durable replay, process ownership, or an external attachment. These machines are small control contracts. They do not replace the durable event journal, leases, or transport protocols that carry their evidence.

## Authority Runtime-Host Transition

Owner: `@narada2/nars-session-core`.

Schema: `narada.nars.authority_runtime_host_transition_state.v1`.

The governed handoff is:

`not_requested -> proposed -> preparing_target -> source_draining -> source_sealed -> target_activating -> target_active -> source_retired`

The preparation helper may perform `not_requested -> proposed -> preparing_target` as one operator command. Activation similarly validates the `source_sealed -> target_activating -> target_active` boundary before persisting the resulting source snapshot. Failure states are terminal: `preparation_failed`, `drain_failed`, `seal_failed`, `target_activation_failed`, and `transition_aborted`.

The transition guard is in `packages/nars-session-core/src/authority-transition-fsm.mjs`; the source authority evidence remains in `authority-transition-state.mjs`.

## AI Process Invocation

Owner: `@narada2/carrier-provider-support`.

Schema: `narada.ai_process_invocation_state.v1`, embedded in the existing `narada.ai_process_invocation.v1` evidence artifacts.

`planned -> admitted -> spawned -> exited -> released`

Pre-spawn refusal is `planned -> refused`. Execution failure and interruption are terminal outcomes after lease cleanup. The launch artifact remains `event: launch` at `admitted`; a spawn artifact makes process creation explicit; exit and release artifacts record process completion and lease removal separately.

## Owned Subprocess

Owner: `@narada2/nars-provider-runtime`.

Schema: `narada.nars.owned_process_state.v1`.

`created -> running -> terminating -> exited -> released`

An owned process may also enter `failed`, then `released`. `terminate` and `terminateTree` enter `terminating` before issuing the platform-specific kill operation. Child `exit`, `close`, and `error` events release the ownership registry through the same state contract. This is mechanical ownership state; higher-level AI invocation state remains responsible for lease and invocation evidence.

## Recovery Attempt

Owner: `@narada2/nars-session-core`.

Schema: `narada.nars.recovery_attempt_state.v1`.

`requested -> claimed -> replaying -> reconciled -> completed`

Already-completed or terminal turns are recorded as `skipped`. Replay interruption, failure, and abandonment are terminal attempt outcomes. Every startup queue replay writes the state transitions to the session event journal, and a later core instance rehydrates the latest attempt records from that journal. A retry creates a new attempt rather than reopening a terminal one.

## Event Attachment

Owner: `@narada2/nars-session-core` event hub, used by the WebSocket and JSONL runtime surfaces.

Schema: `narada.nars.event_attachment_state.v1`.

`requested -> replaying -> live -> closing -> closed`

An attachment without replay may use `requested -> live`. Sender failure enters terminal `failed` and removes the subscriber. WebSocket replay and JSONL activation call the explicit state operations; socket/input cleanup closes the attachment through the same contract.

## MCP Surface and Carrier Continuity

Owner: `@narada2/mcp-surface-carrier-supervisor`.

Schema: `narada.mcp.surface_carrier.lifecycle_state.v1`.

The read-only evidence lifecycle is:

`stale -> restart_requested -> carrier_restarted -> live_verified`

The guard also permits evidence regression from `carrier_restarted` or
`live_verified` back to `stale`, and a new `restart_requested` after a stale
observation. The supervisor records evidence and denied actions; it does not
restart a process, rebind a surface, or mutate a runtime registry.

## MCP Fabric and Server Probe

Owner: `@narada2/mcp-fabric`.

Schema: `narada.mcp.fabric.lifecycle_state.v1`.

Fabric loading is `discovered -> loaded`. A server probe is
`loaded -> starting -> ready -> closing -> closed`. Start and probe failures
are explicit (`start_failed` or `probe_failed`) and close failures use
`close_failed -> closed`. The loader and doctor return the current state and
history for the fabric or each probed server. This is loading/probe evidence,
not tool-admission authority.

## Concept and Protocol Lifecycle

Owner: `@narada2/agent-context-tools`.

Schema: `narada.concept_protocol.lifecycle_state.v1`.

The append-only event contract is:

`observed -> named -> doctrine_checked -> codified -> trialed -> promoted -> canonical`

Pre-canonical states may be rejected. `canonical -> deprecated -> superseded` and
`canonical -> superseded` are the retirement paths. `rejected` and `superseded`
are terminal. A `corrected` event is allowed only as a same-state correction
before a terminal state. The SQLite writer checks the current projection before
inserting the event.

## Capability Lifecycle and Runtime Admission

The read-only capability maturity projection owned by
`@narada2/mcp-surface-carrier-supervisor` uses schema
`narada.capability.lifecycle_state.v1`:

`observed -> named -> designed -> implemented -> cataloged -> mcp_exposed -> admitted -> trialed -> in_use`

Any non-`blocked` state may enter `blocked`; `blocked -> observed` is recovery.
The projection's `admitted` state is evidence that a capability reached that
maturity stage. It is not a grant and cannot authorize a call. Runtime gateway
health and tool execution remain separate FSMs owned by
`@narada2/nars-capability-gateway`.

## Operator Action and Confirmation

Owner: the SQLite control-plane coordinator, with the equivalent action guard in
the Cloudflare Site coordinator.

Operator actions follow:

`pending -> executing -> executed`

They may be rejected from `pending` or `executing`; `executed` and `rejected`
cannot reopen. Confirmation challenges follow:

`pending -> confirmed -> consumed`

or `pending -> expired` / `pending -> rejected`. Only the owning coordinator
mutation methods perform these transitions. The action executor enters
`executing` before invoking the audited mutation.

## Site-Live Carrier Operation

Owner: `@narada2/site-common-tools`, `src/site-init/site-live-carriers.mjs`.

Schema: `narada.site_live_carrier.lifecycle_state.v1`.

Each carrier invocation follows `requested -> planning -> planned -> applying -> applied`.
Verification and recovery are explicit branches from `planned`: `planned -> verifying -> verified` or `planned -> recovering -> recovered`. Authority refusal and failed execution are terminal outcomes. `plan`, `verify`, and `recover` remain read-only with respect to carrier artifacts. An apply records lifecycle transition evidence in `.narada/admission/live-carrier-audit.jsonl`.

## Operator-Surface Carrier Claim

Owner: `@narada2/operator-surface-carriers`, Windows glue scripts.

Schema: `narada.operator_surface_carrier.lifecycle_state.v1`.

New surface launch evidence follows `requested -> launching -> claim_written -> resolving -> resolved -> binding -> bound -> verified`. Resume follows `requested -> resuming -> verified` when one live binding is found. A missing, stale, or ambiguous claim/window is `failed` or `refused`; the launcher never treats a title as identity proof. Dry-run is `requested -> planning -> planned`. Claim, resolver, and launcher evidence carry state and history.

## Agent-Context MCP Transport Session

Owner: `@narada2/agent-context-tools`, `agent-context-mcp-server.mjs`.

Schema: `narada.agent_context_mcp.session_state.v1`.

The stdio protocol session follows `created -> initializing -> initialized -> serving -> closing -> closed`. Malformed input or protocol ordering failure enters `failed`; failed sessions may only close. `tools/list` and `tools/call` are admitted only in `serving`. The server exposes state and history through `agent_context_doctor`, and `shutdown` closes the session after acknowledging the request.

## Runtime Request Lifecycle

Owner: `@narada2/agent-runtime-server`, JSONL runtime control service.

Schema: `narada.nars.runtime_request_state.v1`.

Each control request is tracked independently from the session, turn, and
shutdown machines:

`received -> scheduled -> running -> completed | rejected | failed`

An admitted close request may wait before execution:

`scheduled -> waiting -> running -> completed`

`waiting` means that the runtime is performing a graceful drain of requests
already admitted before it closes the session. It does not interrupt an active
turn. An explicit `session.cancel` request is the interruption path. Invalid
JSON and unsupported controls end in `rejected`; provider or dispatch failures
end in `failed`. Every transition is journaled as
`runtime_request_state_transition`, and aggregate request counts are included
in the runtime health projection.

## Runtime Health Projection Request

Owner: `@narada2/agent-runtime-server`, HTTP health projection wrapper.

Schema: `narada.nars.health_projection_request_state.v1`.

The wrapper-level request is separate from the child runtime's
`session.health` request because it owns the HTTP response and its timeout:

`requested -> dispatched -> awaiting_response -> resolved | timed_out | failed`

Unavailable child input fails before dispatch. A response from the child
runtime resolves the projection; a health-response timeout is distinct from a
transport or runtime failure. This lifecycle is ephemeral request evidence and
does not replace the runtime request FSM or the session health projection.

## Provider Runtime Reconfiguration

Owner: `@narada2/agent-runtime-server`, using `@narada2/nars-provider-runtime`
for provider binding and call construction.

Schema: `narada.nars.provider_runtime_reconfiguration_state.v1`.

The runtime-server control `runtime.intelligence.reconfigure` changes the
provider binding used by future turns. It follows:

`requested -> validating -> admitted -> switching -> active`

The request may be refused from `requested`, `validating`, or `admitted` when
the target is invalid, the provider is unavailable, credentials are absent, or
the session is not at a clean turn boundary. A failure during the actual
switch is terminal for that request:

`requested | validating | admitted -> refused`

`switching -> failed`

The request accepts a provider and model, with optional thinking level. It
does not accept raw credentials. Provider binding resolution selects the
provider-specific credential and base URL from the already projected runtime
environment. Validation is local: it checks the provider contract, adapter,
model, and credential shape without making a provider network call.

The switch is atomic at the turn boundary. The active turn keeps its existing
provider call; only a later turn observes the new binding. Health and
transition events expose provider, model, thinking, and redacted binding
metadata, never API keys. Codex continuation state belongs to one provider
call instance and is not shared through process-global mutable state.

## Site-Registry and Receiving-Site Bootstrap

Owner: `@narada2/cli`, `site-registry-management.ts` and `sites.ts`.

Schema: `narada.site_registry_bootstrap.lifecycle_state.v1`.

Registry management uses `requested -> preflighted -> planned -> applying -> verified`, with explicit `advisory` and `refused` outcomes. Paired Windows receiving-site bootstrap uses `requested -> preflighted -> planned -> applying -> user_site_created -> pc_site_created -> paired -> verified`. If the User Site exists but PC creation is not confirmed, the lifecycle ends at `partial`; it is not reported as a successful pair. Preflight refusal, failed execution, and partial evidence are returned with lifecycle state and history while preserving the existing command status and repair guidance.

## Workspace Launch Session and Attempt

Owner: `@narada2/cli`, persistent workspace-launch UI controller and attempt store.

Schemas: `narada.workspace_launch.ui_session.lifecycle_state.v1` and `narada.workspace_launch.attempt.lifecycle_state.v1`.

The persistent launcher session follows `created -> starting -> open -> closing -> closed`. Timeout and server failure are explicit branches: `open -> timeout` and `created|starting|open -> failed`. Recovered sessions without lifecycle fields are normalized from their existing public status.

A launch attempt follows `queued -> planning -> launching -> handoff_recorded -> observing -> launched`. Launch failure is terminal from an active attempt, and `launched -> observing -> launched` records an explicit recheck. Forgetting is terminal for the attempt. The existing `status` field remains the compatibility projection; lifecycle history is durable in the session JSON and attempts JSONL.

## Site Operating Loop Run, Trigger, and Health

Owner: `@narada2/site-operating-loop`.

Schemas: `narada.site_operating_loop.run.lifecycle_state.v1`, `narada.site_operating_loop.trigger.lifecycle_state.v1`, and `narada.site_operating_loop.health.lifecycle_state.v1`.

A bounded run follows `requested -> locking -> running -> completed`, with `locking -> locked` for contention and `running -> failed` or `running -> aborted` for non-success outcomes. A trigger follows `pending -> claimed -> completed|failed|skipped`; completion is refused until the trigger has been claimed and terminal triggers cannot be reopened. Health starts at `unknown`, moves through `healthy`, `degraded`, and `critical`, and may recover after a later successful run.

Lifecycle evidence is stored in `lifecycle_json` columns beside run, trigger, and health rows. `ensureSiteLoopTables()` adds those columns to existing Site databases, so old rows remain readable through status-derived lifecycle projections.

## Generic Site Init

Owner: `@narada2/site-common-tools`, `src/site-init/site-init.mjs`.

Schema: `narada.site_init.lifecycle_state.v1`.

Inspection follows `requested -> inspecting`. A preview follows `inspecting -> planned -> previewed`; confirmed seed creation follows `inspecting -> planned -> applying -> seeded -> initialized`. Existing memory, doctor, start, blocked, and refused outcomes are terminal branches from inspection. A filesystem failure after one or more seed files have been written is `applying -> partial`; it remains explicit and requires doctor/recovery before another write attempt.

## Site Lift Transfer and Admission

Owner: `@narada2/site-common-tools`, site-lift package creation, send, and inbox admission tools.

Schema: `narada.site_lift.lifecycle_state.v1`.

Creation follows `requested -> validating -> planned -> created`. Sending and receiving a target envelope follows `planned -> sending -> sent -> receiving -> received -> admitting -> admitted`. Partial filesystem or target-admission failure is recorded as `partial` with the available evidence. The package remains advisory until receiving-Site policy admits it; `admitted` in this lifecycle describes the receiving inbox envelope admission, not authority to implement the lifted package. Existing send results retain `status: sent` as a compatibility projection while exposing the complete lifecycle history.

## Boundary Rules

- Terminal states are contract-specific. Operator actions, confirmation challenges, and concept/protocol retirement states cannot be reopened; recoverable status projections such as `stale`, `blocked`, or a fabric load failure use their documented recovery path.
- A lower-level FSM may expose state to its caller, but it does not acquire authority owned by a higher-level FSM.
- State transitions that govern durable recovery or leases are journaled or artifacted. Ephemeral attachment history is exposed by the subscription handle and is not treated as session authority.
- Existing turn, input-admission, provider-invocation, capability-gateway, runtime-host, and tool-execution FSMs remain separate contracts with their existing owners. In particular, capability maturity evidence never replaces runtime capability admission.

