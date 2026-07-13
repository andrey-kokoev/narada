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

## Boundary Rules

- A terminal state cannot be reopened. Retry or reconnection creates a new record or attachment.
- A lower-level FSM may expose state to its caller, but it does not acquire authority owned by a higher-level FSM.
- State transitions that govern durable recovery or leases are journaled or artifacted. Ephemeral attachment history is exposed by the subscription handle and is not treated as session authority.
- Existing turn, input-admission, provider-invocation, capability-gateway, runtime-host, and tool-execution FSMs remain separate contracts with their existing owners.

