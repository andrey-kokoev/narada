# Operator Input Admission

Operator input admission is the NARS-owned decision about what happens after an operator surface submits intent to an Agent session.

This concept separates three things that are easy to conflate:

- a surface-local draft that has not been submitted
- a submitted input that NARS has accepted but not yet admitted to a turn
- an input admitted to a provider turn

Once NARS acknowledges an operator input, the input is session state. It is not owned by agent-cli, agent-web-ui, or any other operator surface.

## Admission Space

The minimal admission space is:

| Axis | Values | Meaning |
|---|---|---|
| `input_kind` | `operator_message`, `operator_note`, `operator_steering` | What kind of operator intent was submitted. |
| `turn_timing` | `current_or_next_idle_turn`, `after_active_turn`, `no_turn` | When the input may affect provider turns. |
| `active_turn_effect` | `none`, `interrupt` | Whether the input changes an already-running turn. |
| `queue_durability` | `none`, `nars_session_durable` | Whether accepted pending input must survive operator surface disconnect. |
| `ordering` | `immediate`, `fifo_after_active_turn`, `front_after_interrupt` | Where the input sits relative to other pending inputs. |
| `authority` | `operator` | Authority class for these constructors. |

The current named constructors are projections over that space:

| Constructor | Method | Semantics |
|---|---|---|
| `send` | `conversation.send` | Ordinary operator message admitted when the runtime can start a turn now. It does not interrupt an active turn. |
| `enqueue` | `conversation.enqueue` | Ordinary operator message accepted for FIFO admission after the active turn. It does not interrupt. |
| `steer` | `conversation.steer` | Explicit operator steering: interrupt the active turn and admit steering as the next turn input. |

`send`, `enqueue`, and `steer` are not arbitrary UI modes. They are named constructors for distinct semantic regions.

## Surface Boundary

Before the operator submits text, it is a surface-local draft.

After the operator submits text but before NARS acknowledges it, it is a surface-local pending submission.

After NARS acknowledges it, it is NARS-owned admitted input. All attached surfaces should derive visible queued or admitted state from NARS events, not from their own private queues.

## Required Invariants

- `send` must not mean interrupt.
- `enqueue` must not interrupt an active turn.
- `steer` must be explicit and interruptive.
- A queued operator input acknowledged by NARS must survive the originating surface disconnecting.
- A queued operator input should be visible to every attached operator surface through NARS events or status.
- Surface-local optimistic state must collapse back to NARS state after acknowledgement or failure.

## Current Implementation Posture

NARS implements this split in protocol, runtime, and client projection code. `conversation.enqueue` is a first-class control method, maps to non-interrupting `admit_after_active_turn` delivery, and is distinct from `conversation.steer`.

Pending operator input is persisted in an explicit queue state file beside the session records, currently `operator-input-queue.json` under the NARS session runtime directory. Session events remain audit/replay evidence; the queue state file is the recovery source for pending items. If an operator surface closes after NARS acknowledges an enqueue, the message remains NARS-owned and visible through status/events until it is admitted, dropped, abandoned, or completed.

Operator surfaces use the same semantics: ordinary text is `conversation.send` when idle and `conversation.enqueue` during an active turn. Explicit interruptive intent must use `conversation.steer`, `/interrupt`, or an equivalent explicit protocol frame.
