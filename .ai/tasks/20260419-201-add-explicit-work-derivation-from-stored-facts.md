# Task 201: Add Explicit Work Derivation From Stored Facts

## Why

Narada already treats `Fact` as the first canonical durable boundary.

Today, the daemon/control-plane opens work only from `unadmitted` facts:

- source sync ingests facts
- dispatch reads unadmitted facts
- foreman derives contexts and opens work
- facts are marked admitted

That is correct for live operation, but it leaves a gap for replay-shaped use cases:

- re-run an old mailbox thread without fabricating a new inbound message
- test a charter/policy change against already-synced mail
- recover control-plane work derivation from durable facts after control-plane loss
- build examples/playgrounds against stable stored truth

The current alternatives are incoherent:

- sending fake new email just to wake the system
- manually inserting work items
- mutating coordinator state directly

Narada should instead support an explicit, audited path that derives work from already-stored facts.

## Goal

Add an explicit replay-style operation that re-derives work from persisted facts, using the same context formation and foreman admission path as live dispatch, without requiring a fresh source delta.

This is not an implicit daemon behavior. It is an explicit operator-triggered derivation path.

## Core Principle

The authority source remains durable facts, not manually authored work items.

This capability must:

- reuse the existing `Fact -> PolicyContext -> work_item` path
- preserve foreman authority over work opening
- preserve scheduler authority over leases
- preserve outbound draft-first behavior
- avoid hidden reopening loops on daemon start

## Required Behavior

### 1. Explicit Replay Surface

Add a deliberate surface for deriving work from stored facts.

Acceptable shapes:

- CLI command such as `narada derive-work`
- safe operator action that requests replay/redispatch from stored facts
- both, if they share one canonical implementation path

This must not run automatically on normal daemon startup.

### 2. Fact Selection

The replay surface must support bounded selection from persisted facts.

Minimum useful selectors:

- `--operation <id>` / scope selection
- `--context-id <id>`

Strongly preferred selectors:

- `--fact-id <id>`
- `--since <timestamp>`
- mail-friendly selectors such as thread/conversation ID if already available without leaking mailbox semantics into generic layers

The implementation may start with the minimum set if the generic path is clean and a follow-up task is created for narrower selectors.

### 3. Canonical Derivation Path

Replay must route through the same semantic pipeline as live fact admission as far as possible:

- load stored facts
- form contexts through `ContextFormationStrategy`
- open/supersede/noop through `ForemanFacade`

Do not add a second, parallel work-opening algorithm.

### 4. Admission / Replay Semantics

Narada must clearly distinguish:

- facts admitted from live source sync
- work derived later from already-stored facts

The simplest acceptable model is:

- keep `admitted_at` semantics unchanged for live dispatch
- replay reads already-stored facts independently of `admitted_at`
- replay is logged/audited as replay-derived work opening

If additional durable metadata is needed, add it explicitly rather than overloading existing fields silently.

### 5. Safety Against Unbounded Reopening

Replay must not become a hidden loop that keeps reopening the same context indefinitely.

At minimum define and implement one coherent rule:

- explicit operator request replays one bounded fact set once
- resulting work follows normal supersession/noop rules
- no background component continuously replays admitted facts

### 6. Mailbox Vertical Use Case

The implementation must support the immediate operational use case:

- select an already-synced mailbox conversation/thread
- derive work from its stored facts
- let the charter runtime evaluate it
- inspect the resulting draft proposal without requiring a fresh inbound email

If the draft is gated by current policy, that gating should remain intact.

## Non-Goals

- Do not auto-replay all historical facts at daemon startup
- Do not permit direct manual insertion of `work_item` rows
- Do not bypass `ForemanFacade`
- Do not weaken intent/draft-first outbound invariants
- Do not make mailbox-specific replay semantics the generic kernel contract

## Implementation Guidance

Prefer a design that separates three concerns cleanly:

1. fact query/selection
2. replay admission orchestration
3. operator/CLI surface

Likely landing points:

- fact query support in `facts/store.ts` or a narrow replay helper
- canonical orchestration near the daemon dispatch/foreman path
- user surface in `packages/layers/cli/` and/or safe operator actions

If a generic replay orchestration type is introduced, document it in:

- `SEMANTICS.md`
- `packages/layers/control-plane/docs/00-kernel.md`
- relevant daemon/control-plane docs

## Verification

Minimum verification:

```bash
pnpm verify
pnpm --filter @narada2/daemon exec vitest run test/integration/dispatch.test.ts
```

Targeted proof:

- sync a mailbox with an existing historical conversation
- invoke the replay/derive-work surface for that context
- confirm a `work_item` is opened or explicitly nooped through the canonical foreman path
- if policy allows `draft_reply`, confirm a draft proposal/outbound handoff is created without a fresh inbound event

## Definition Of Done

- [x] Narada has an explicit surface for deriving work from stored facts.
- [x] The capability is bounded and operator-triggered, not implicit on daemon startup.
- [x] Replay uses the canonical context-formation + foreman work-opening path.
- [x] Replay does not require fabricating a new inbound source event.
- [x] Replay does not bypass foreman/scheduler/outbound authority boundaries.
- [x] The mailbox vertical can replay an existing synced thread/conversation and reach charter evaluation.
- [x] Verification covers at least one replay-derived work-opening path.
- [x] Docs explain the distinction between live fact admission and explicit replay from stored facts.
- [x] No `*-EXECUTED`, `*-DONE`, or `*-RESULT` files are created.
