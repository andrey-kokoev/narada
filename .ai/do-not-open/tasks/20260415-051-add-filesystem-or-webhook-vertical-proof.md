# Add Filesystem or Webhook Vertical Proof

## Context

After Tasks 047–050, Narada should have a real operational kernel with mailbox, timer, and process paths.

To strengthen the universality claim, one more structurally different vertical is needed.

## Goal

Add one additional non-mail vertical proof — either filesystem or webhook/API — through the same Source → Fact → Policy → Intent → Execution spine.

## Required Outcome

After this task:

- Narada supports one more vertical that is not mailbox and not timer-only
- the new vertical enters through Source and Fact
- policy/context/work/opening behave through the generalized kernel
- effect materialization stays inside Intent/executor discipline

## Required Work

### Option A — Filesystem vertical
Possible fact families:
- `filesystem.change`
- `filesystem.file.created`
- `filesystem.file.updated`
- `filesystem.file.removed`

### Option B — Webhook/API vertical
Possible fact families:
- `webhook.received`
- `api.event.received`

Pick one. Do not do both in this task.

### 1. Implement source adapter

Create the source implementation through the same Source contract.

### 2. Emit facts through the same Fact envelope

No shortcut path allowed.

### 3. Form context and work through generalized layers

Use the same context/work model established in Tasks 048–049.

### 4. Drive effect through Intent/executor path

No direct side-effect path from source to execution.

### 5. Add tests

Add tests proving:
- the new vertical uses Source
- facts are durable and replay-safe
- context/work formation works
- intents/execution follow kernel rules
- replay does not duplicate effects

## Invariants

1. The new vertical must be a real peer of mailbox/timer.
2. It must use the same kernel boundaries.
3. No source-specific shortcut path is allowed.
4. Replay/idempotency must remain correct.

## Constraints

- implement only one new vertical
- do not redesign kernel layers again
- do not build product/UI features
- keep the vertical minimal but real

## Deliverables

- one new source vertical
- fact mapping
- context/work integration
- intent/execution integration
- tests
- docs note showing it as a peer vertical

## Acceptance Criteria

- the new vertical uses the same kernel spine end-to-end
- replay/idempotency remain correct
- tests pass
- the universality claim becomes materially stronger

## Definition of Done

Narada proves its kernel with a second structurally distinct non-mail vertical.