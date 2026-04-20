# Task 209: Add Promotion Operator Family to Canonical Ontology and Surface

## Family

`promotion`

## Why

Promotion is the bridge between inspection/preview and actual system mutation. It answers the question: "I have observed or previewed something; now how do I advance it through the lifecycle?"

Without explicit promotion surfaces, operators lack disciplined lifecycle advancement. The existing control surface actions (`retry_work_item`, `acknowledge_alert`, `trigger_sync`, `request_redispatch`) are implementation-shaped reactions to specific incidents, not a unified family of lifecycle transitions. There is no surfaced path to:
- promote a preview evaluation into a governed work item
- manually advance a draft-ready outbound command to submitted
- bulk-promote a set of failed-retryable items back to runnable

## Specific Gap

1. **No canonical family definition**: `SEMANTICS.md` and `00-kernel.md` do not define `promotion` as an operator family.
2. **No canonical promotable objects**: The system does not explicitly name which artifacts can be promoted (`evaluation`, `outbound_command`, `work_item`, `operation`) and what their valid source/target states are.
3. **No explicit preview → governed-work path**: Preview derivation (Task 203) produces a `CharterOutputEnvelope` / `Evaluation`, but there is no operator action to promote that output into a real `work_item`. The foreman can open work from facts (`onContextsAdmitted`, `deriveWorkFromStoredFacts`), but there is no surfaced path to open work from a preview evaluation.
4. **No explicit manual draft → send path**: Operators can observe outbound commands in `draft_ready`, but there is no promoted action to manually advance them to `submitted`.
5. **No unified promotion algebra**: Existing actions are one-off handlers, not composable lifecycle transitions.

## Why Not Already Covered

- `activate` and `want-posture` are config-level promotion (operation posture), not work-item-level promotion.
- `retry_work_item` and `acknowledge_alert` are ad-hoc control actions, not a family.
- Tasks 201–206 cover re-derivation, not lifecycle advancement.
- Task 207 identified promotion as a gap but did not create a follow-up task.

## Required Approach

### 1. Define the Family in Canonical Docs

Add a `promotion` section to:
- `SEMANTICS.md` — define promotion algebra, promotion targets, and authority requirements per transition
- `00-kernel.md` — define promotion invariants (e.g., promotion is always explicit, promotion respects authority classes, promotion is logged)

### 2. Define Canonical Promotable Objects and Transitions

Before prescribing any implementation, nail down the object model:

| Promotable Object | Valid Source State | Valid Target State | Trigger | Authority |
|-------------------|-------------------|--------------------|---------|-----------|
| `operation` | `inactive` | `active` | manual operator | `admin` |
| `operation` | posture A | posture B | manual operator | `admin` |
| `work_item` | `failed_retryable` | `opened` | manual operator | `resolve` |
| `work_item` | `failed_retryable` | `failed_terminal` | manual operator | `admin` |
| `evaluation` (preview artifact) | `preview` | `governed_work` | manual operator | `derive` + `resolve` |
| `outbound_command` | `draft_ready` | `submitted` | manual operator | `execute` |
| `outbound_command` | `pending` | `cancelled` | manual operator | `execute` |

Rules:
- Promotion never fabricates durable boundaries. A preview evaluation promoted to governed work must route through the same foreman admission path that live facts use (`onContextsAdmitted` or equivalent), not through `resolveWorkItem()` (which requires an existing work_item + execution_id).
- Promotion transitions are append-only in the audit log.
- Bulk promotion is a cardinality variation, not a new transition type.

### 3. Map Existing Ad-Hoc Actions to the Canonical Algebra

Classify every existing promotion-like action under the new taxonomy:
- `retry_work_item` → `work_item: failed_retryable` with `next_retry_at` cleared, manual, `resolve`. The item remains `failed_retryable`; the scheduler discovers it as runnable on its next scan.
- `acknowledge_alert` → `work_item: failed_retryable → failed_terminal`, manual, `admin`
- `trigger_sync` → `operation: idle → syncing`, manual, `resolve`
- `request_redispatch` → automatic pipeline promotion through scheduler/executor, not manual operator promotion
- `activate` → `operation: inactive → active`, manual, `admin`
- `want-posture` → `operation: posture A → posture B`, manual, `admin`

### 4. Design New Promotion Surfaces (Implementation-Agnostic)

For each missing transition, design the surface without baking in a specific method call:

**Preview evaluation → governed work**
- Design question: Should the foreman grow a `promotePreviewToWork(evaluationId, scopeId)` method that builds a synthetic `PolicyContext` and routes it through `onContextsAdmitted()`? Or should the operator action call `deriveWorkFromStoredFacts()` with a seed context? Document the chosen design before implementing.
- Requirements: atomic, logs to `operator_action_requests`, requires `derive` + `resolve`, reuses existing admission invariants.

**Manual draft → send**
- Design question: Should this be an operator action that inserts a scheduler signal, or a direct outbound worker bypass? Document the chosen design.
- Requirements: validate draft integrity, require `execute`, log to `operator_action_requests`.

**Bulk retry**
- Design question: Should this accept a `Selector` from Task 208, or a simple `status=failed_retryable` filter?
- Requirements: bounded, atomic per work_item, logs per item.

### 5. Implement at Least One New Promotion Surface

After the design is documented, implement **one** of the missing transitions above.

## Required Deliverables

- [x] `SEMANTICS.md` section defining promotion operator family
- [x] `00-kernel.md` section defining promotion invariants
- [x] Canonical table of promotable objects, source/target states, triggers, and authority classes
- [x] Existing ad-hoc actions mapped to the promotion algebra
- [x] Design document (can be a short section in the task file or a separate decision file) for at least one missing transition
- [x] Implementation of at least one missing promotion surface

## Non-Goals

- Do not implement preview derivation itself (Task 203)
- Do not change the existing automatic dispatch pipeline (scheduler + workers)
- Do not add promotion surfaces that bypass `ForemanFacade`, `Scheduler`, `IntentHandoff`, or `OutboundHandoff`
- Do not prescribe `resolveWorkItem()` for opening new work from a preview artifact
- Do not create a generic "do anything" promotion action; each target must have explicit from/to states

## Definition of Done

- [x] Promotion is a named operator family in canonical docs.
- [x] Every existing promotion-like action is classified under the promotion algebra.
- [x] At least one previously missing promotion path has a documented design and an implementation.
- [x] All promotion transitions declare their required authority class.
- [x] The task does not regress any authority boundary invariant.

## Execution Evidence

### Canonical docs
- `SEMANTICS.md` §2.10 — Added Promotion Operator Family with promotable objects table, transition rules, existing action mapping, and evolution note
- `00-kernel.md` §10 — Added Promotion Operators with kernel invariants (renumbered Known Gaps → §11, See Also → §12)
- `AGENTS.md` — Added `promotion operator` concept to the concept table

### New promotion surface: `retry_failed_work_items`
**Design**: Bulk promotion of retry readiness for `work_item: failed_retryable` is a cardinality variation of the existing `retry_work_item` singleton action. It queries all `failed_retryable` work items for a scope, ordered by `next_retry_at`, and clears `next_retry_at` on each without changing status. The scheduler discovers the newly runnable items on its next scan. This respects scheduler neutrality (no direct lease manipulation) and scheduler authority (work items remain in `failed_retryable` status until the scheduler reclaims them).

**Implementation**:
- `packages/layers/control-plane/src/coordinator/types.ts` — Added `getFailedRetryableWorkItems(scopeId, limit?)` to `CoordinatorStore` interface; updated `OperatorActionRequest.action_type` to include `"retry_failed_work_items"`
- `packages/layers/control-plane/src/coordinator/store.ts` — Implemented `getFailedRetryableWorkItems()` in `SqliteCoordinatorStore`
- `packages/layers/daemon/src/observation/operator-actions.ts` — Added `retry_failed_work_items` to `PERMITTED_OPERATOR_ACTIONS` and implemented the action
- `packages/layers/daemon/src/observation/operator-action-routes.ts` — No changes needed (routes delegate generically to `executeOperatorAction`)

### Tests
- `packages/layers/control-plane/test/unit/coordinator/store.test.ts` — Added tests for `getFailedRetryableWorkItems` (ordering, limit, empty result)
- `packages/layers/daemon/test/unit/observation-server.test.ts` — Added test for `retry_failed_work_items` operator action via control namespace

### Verification
- `pnpm test:control-plane` — passes (control-plane unit + integration tests)
- `pnpm --filter @narada2/daemon test test/unit/observation-server.test.ts` — 55 tests pass
- No authority boundary invariants regressed
