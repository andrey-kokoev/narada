# Task 208: Add Selection Operator Family to Canonical Ontology

## Family

`selection`

## Why

Selection is the lens through which every other operator family operates. Without a unified selection algebra, each family reinvents its own bounding vocabulary:

- `derive-work` uses `--scope`, `--context-id`, `--since`, `--fact-ids`
- Observation routes use `?status=` and `?limit=`
- The scheduler uses `scopeId?` and `limit?`
- Backup restore uses `--select <id>` and `--before <date>`
- Preview, recovery, and confirmation replay (Tasks 203–205) have no specified bounds yet

This fragmentation makes the system harder to operate, harder to document, and harder to secure. A disciplined selection family provides a single grammar for bounding any operator's input set.

## Specific Gap

1. **No canonical family definition**: `SEMANTICS.md` and `00-kernel.md` do not define `selection` as an operator family.
2. **No unified selection algebra**: There is no formal grammar for fact/context/work/execution selectors.
3. **Fragmented bounds**: Every consumer implements its own ad-hoc filtering.
4. **Missing CLI surface**: There is no generic `narada select` command or equivalent to list/describe bounded sets before acting on them.

## Why Not Already Covered

- Tasks 201–206 cover **re-derivation** but assume selection bounds are given.
- Task 207 identified selection as a gap but did not create a follow-up task.
- No existing task addresses selection unification.

## Required Approach

### 1. Define the Family in Canonical Docs

Add a `selection` section to:
- `SEMANTICS.md` — define selection algebra, selector types, and composability rules
- `00-kernel.md` — define selection invariants (e.g., every bounded operator must accept a canonical selector, selectors are read-only, selectors never mutate authority)

The algebra should cover at minimum:
- **Scope selector**: `scope_id` (single, array, or wildcard)
- **Temporal selector**: `since`, `until`
- **Identity selector**: `fact_ids`, `context_ids`, `work_item_ids`
- **Status selector**: `status` (family-specific enum)
- **Vertical selector**: `vertical` (for multi-vertical scopes)
- **Limit selector**: `limit`, `offset` (for pagination)
- **Composite selector**: AND of the above

### 2. Inventory and Unify Existing Fragments

Map every existing ad-hoc bound to the canonical selector grammar. Refactor where the mapping is 1:1; deprecate where it is redundant.

### 3. Implement a Generic Selection Surface

Choose **one** of the following (do not implement all):
- A `narada select <entity-type>` CLI command that accepts canonical selectors and returns a bounded list
- OR a unified `?selector=` query parameter grammar for observation routes
- OR a shared `Selector` type consumed by `derive-work`, preview, recovery, and confirmation replay

The surface must be usable by at least:
- `derive-work` (replay derivation)
- `preview` (preview derivation, Task 203)
- `recover` (recovery derivation, Task 204)
- Observation API read routes

### 4. Ensure Authority Neutrality

Selection must be read-only and authority-agnostic. A selector does not require `derive`, `resolve`, or `admin` authority. It is pure inspection until combined with an effectful operator.

## Required Deliverables

- [x] `SEMANTICS.md` section defining selection operator family
- [x] `00-kernel.md` section defining selection invariants
- [x] Shared `Selector` type in control-plane types
- [x] At least one generic selection surface (CLI, API, or shared type) consumed by multiple families
- [x] Existing ad-hoc bounds mapped to canonical selectors (refactor or deprecation plan documented)

## Non-Goals

- Do not implement preview derivation, recovery derivation, or confirmation replay here (those are Tasks 203–205)
- Do not add write capabilities to selection
- Do not invent a full query language (SQL, GraphQL, etc.); keep the grammar minimal and closed
- Do not change the observation API response shapes; only unify the input bounds

## Definition of Done

- [x] Selection is a named operator family in canonical docs.
- [x] A canonical `Selector` type exists and is used by at least two operator families.
- [x] No new ad-hoc bounding vocabulary is introduced without mapping to the canonical selector.
- [x] The task does not regress any existing observation or control-plane invariant.

## Execution Evidence

### Canonical docs
- `SEMANTICS.md` §2.9 — Added Selection Operator Family with algebra, dimensions, invariants, and relationship to other families
- `00-kernel.md` §9 — Added Selection Operators with kernel invariants and dimension table (renumbered Known Gaps → §10, See Also → §11)
- `AGENTS.md` — Added `selector` concept to the concept table

### Shared `Selector` type
- Created `packages/layers/control-plane/src/types/selector.ts` with `Selector` and `SelectorView` types
- Exported from `packages/layers/control-plane/src/types/index.ts`

### Refactored existing bounds to canonical selector
- `FactStore.getFactsByScope(scopeId, selector?: Selector)` — updated signature and implementation in `src/facts/types.ts` and `src/facts/store.ts`
- `derive-work.ts` — refactored to use `contextIds: [options.contextId]` instead of ad-hoc `contextId`
- `preview-work.ts` — refactored to use `contextIds: [options.contextId]` instead of ad-hoc `contextId`
- `operator-action-routes.ts` — refactored derive_work action to use `contextIds: [options.contextId]`
- `test/unit/facts/store.test.ts` — updated all test calls to use `contextIds` array

### Generic selection surface
- Created `packages/layers/cli/src/commands/select.ts` — `narada select` CLI command that accepts all canonical selector dimensions and returns bounded facts
- Wired into `packages/layers/cli/src/main.ts`

### Verification
- `pnpm --filter @narada2/control-plane typecheck` — passes cleanly
- `pnpm test:control-plane` — all tests pass (V8 crash on cleanup is pre-existing, documented in AGENTS.md as harmless)
