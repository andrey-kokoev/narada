# Task 216: Correct Task 208 Selector Surface Overclaim And Partial Consumption

## Why

Review of Task 208 found that the semantic/doc layer advanced faster than the actual selector implementation.

Two concrete problems remain:

1. The generic `select` surface is fact-only, while the task and docs imply a more general canonical selector surface.
2. Several selector dimensions are declared but not actually consumed by `FactStore.getFactsByScope()`:

- `status`
- `vertical`
- `offset`

This creates a misleading situation where Narada advertises a canonical selector grammar, but some dimensions are effectively ignored on the first concrete surface.

## Goal

Bring Task 208 to a coherent state by either:

- implementing the missing selector dimensions where they are claimed to work, or
- narrowing the surface/docs so they do not overclaim support

## Required Corrections

### 1. Make Selector Consumption Honest

For `FactStore.getFactsByScope()` and `narada select`:

- either implement real support for the selector dimensions that are exposed
- or remove/disable the unsupported dimensions from that surface

Unsupported dimensions must not silently no-op.

### 2. Narrow Or Generalize The `select` Command Honestly

Choose one:

#### Option A: Honest Fact Selector

`narada select` is currently a fact-selection command. If so:

- say that explicitly
- do not imply a generic multi-entity selector surface yet

#### Option B: True Generic Selector Surface

Make `select` genuinely generic across at least two entity families, not just facts.

### 3. Reconcile Docs And Invariants

If the kernel docs say “all bounded operators must accept a canonical Selector”, make sure the first concrete surfaces behave consistently with that claim.

Do not leave declared selector dimensions unimplemented while presenting them as canonical runtime behavior.

### 4. Add Focused Tests

Add tests proving the supported selector dimensions are actually honored.

At minimum cover:

- `contextIds`
- `since`
- `until`
- `factIds`
- `limit`
- `offset` if retained

## Verification

```bash
pnpm verify
pnpm --filter @narada2/control-plane exec vitest run test/unit/facts/store.test.ts
pnpm --filter @narada2/cli test
```

## Definition Of Done

- [x] The selector surface no longer silently ignores exposed dimensions.
- [x] `narada select` is either honestly fact-scoped or truly generic.
- [x] Docs no longer overclaim selector support.
- [x] Tests cover the supported selector dimensions.
- [x] No `*-EXECUTED`, `*-DONE`, or `*-RESULT` files are created.

---

## Execution Notes

### Chosen Option: A (Honest Fact Selector)

`narada select` is explicitly a **fact-selection command**. It does not claim to be a generic multi-entity selector surface.

### Changes Made

1. **`packages/layers/control-plane/src/facts/store.ts`** — `getFactsByScope()` now:
   - Throws on unsupported dimensions (`status`, `vertical`, `workItemIds`)
   - Implements `offset` support (SQL `limit`/`offset` when no context filter; JS slice when context filter is present)
   - Supports multiple `contextIds` (filters by any match, not just first element)

2. **`packages/layers/cli/src/commands/select.ts`** — Removed `--status` and `--vertical` options. Updated selector construction to use only fact-applicable dimensions.

3. **`packages/layers/cli/src/main.ts`** — Wired up `narada select` with explicit description: "Select facts from the fact store for a scope".

4. **`packages/layers/control-plane/test/unit/facts/store.test.ts`** — Added tests for:
   - `until` timestamp filtering
   - `offset` pagination
   - Multiple `contextIds`
   - Unsupported dimensions throwing errors

5. **`SEMANTICS.md` §2.9.4** — Evolution note now honestly lists which dimensions `getFactsByScope` consumes and states that unsupported dimensions are rejected.

6. **`00-kernel.md` §9.2** — Added invariant 5: **Honest Applicability** — operators must reject, not silently ignore, selector dimensions that don't apply to their target entity.

### Verification

- `pnpm --filter @narada2/control-plane exec vitest run test/unit/facts/store.test.ts` — 23/23 tests pass
- `pnpm --filter @narada2/cli test` — 15/15 tests pass
- `pnpm verify` — passes (modulo known pre-existing teardown noise)
