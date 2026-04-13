# Outbound State Machine Tests

## Mission
Turn the outbound spec from documentation into executable guarantees by adding unit tests for the canonical state machine, terminal states, and command-version invariants.

## Scope
`packages/exchange-fs-sync/test/unit/outbound/`
`packages/exchange-fs-sync/src/outbound/types.ts`

## Why This Is Next
The repo now has outbound types and a transition table, but almost no executable verification of the behavior they are meant to define. Before adding persistence and worker logic, the state machine needs to be pinned down in tests.

## Deliverables

### 1. Transition Table Tests

Add tests covering:

- every allowed transition in `VALID_TRANSITIONS`
- representative disallowed transitions
- no transition out of terminal states
- `isValidTransition()` matches the canonical table

### 2. Terminal State Tests

Add tests covering:

- `isTerminalStatus()` returns true for:
  - `confirmed`
  - `failed_terminal`
  - `cancelled`
  - `superseded`
- `isTerminalStatus()` returns false for all non-terminal states

### 3. Invariant Tests

Add tests for the non-DB invariants already expressible in code:

- only one latest eligible version per `outbound_id`
- new version supersedes prior unsent version
- `submitted` is not terminal
- `confirmed` implies no further transitions

### 4. Test Helpers

If needed, add lightweight fixtures or helper builders for:

- `OutboundCommand`
- `OutboundVersion`
- `ManagedDraft`

## Definition Of Done

- [ ] `test/unit/outbound/` exists
- [ ] transition table is covered by tests
- [ ] terminal states are covered by tests
- [ ] spec-level invariants are covered where possible without persistence
- [ ] `pnpm test` passes

