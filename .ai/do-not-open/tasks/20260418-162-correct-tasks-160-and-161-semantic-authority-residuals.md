# Task 162: Correct Tasks 160 And 161 Semantic Authority Residuals

## Source

Review of executed Tasks 160 and 161 found that the main semantic and authority drift was reduced, but several exactness issues remain.

## Why

The current work is about semantic closure. Small naming or authority inaccuracies in `SEMANTICS.md` and root `AGENTS.md` are high leverage because future agents treat those files as canonical.

## Findings To Correct

### 1. `SEMANTICS.md` uses the wrong durable table name for evaluations

`SEMANTICS.md` says charter outputs/evaluations persist in:

- `evaluation_records`

Current implementation uses:

- `evaluations`

Fix every `evaluation_records` reference to the actual durable table name.

### 2. `operator action` examples overstate current capability

`SEMANTICS.md` describes operator actions as examples like:

- approve a draft
- override a decision

Current permitted operator actions in `executeOperatorAction()` are only:

- `retry_work_item`
- `acknowledge_alert`

Rewrite the examples to match current capability. If future approval/override actions are desired, mention them only as future extensions, not current semantics.

### 3. `outbound command` authority owner is imprecise

`SEMANTICS.md` says authority owner is:

- outbound worker registry

Correct split:

- creation authority: `OutboundHandoff.createCommandFromDecision()`
- mutation/execution authority: outbound workers registered in `WorkerRegistry`
- reconciliation authority: `OutboundReconciler`

Update the ontology entry so it does not collapse creation and mutation authority.

### 4. Root `AGENTS.md` still does not fully match `00-kernel.md`

Root `AGENTS.md` was corrected for `failWorkItem()` and scheduler failure classification, but still differs from `00-kernel.md`:

- work opening still names private `onContextsAdmitted()` as the only authority instead of public `onSyncCompleted()` / `onFactsAdmitted()` delegating privately
- root `AGENTS.md` omits the explicit `IntentHandoff owns intent creation` boundary

Bring root `AGENTS.md` authority bullets into full parity with `packages/layers/control-plane/docs/00-kernel.md` while preserving root-specific navigation context.

## Deliverables

- `SEMANTICS.md` uses actual durable table names.
- `SEMANTICS.md` operator-action examples reflect current safelisted actions.
- `SEMANTICS.md` splits outbound creation/mutation/reconciliation authority accurately.
- Root `AGENTS.md` authority boundaries include public Foreman work-opening entrypoints and `IntentHandoff`.
- Root `AGENTS.md` and `00-kernel.md` no longer materially disagree on control-plane authority.

## Definition Of Done

- [x] No `evaluation_records` reference remains.
- [x] `operator action` examples are limited to current safelisted actions or clearly marked future.
- [x] `outbound command` authority distinguishes creation from worker mutation.
- [x] Root `AGENTS.md` names `onSyncCompleted()` / `onFactsAdmitted()` for work opening.
- [x] Root `AGENTS.md` includes `IntentHandoff owns intent creation`.
- [x] No derivative task-status files are created.

## Execution Notes

### Changes Made

#### SEMANTICS.md

1. **Fixed durable table name** -- All `evaluation_records` -> `evaluations` (charter and evaluation entries).
2. **Corrected operator action examples** -- Removed "approve a draft, override a decision" as current examples. Now reads: "Current safelisted actions: `retry_work_item`, `acknowledge_alert`. Future extensions ... must be added explicitly to the safelist before they become available."
3. **Split outbound command authority** -- Replaced single "Authority owner: Outbound worker registry" with:
   - **Creation authority**: `OutboundHandoff.createCommandFromDecision()`
   - **Mutation/execution authority**: outbound workers in `WorkerRegistry`
   - **Reconciliation authority**: `OutboundReconciler`

#### Root AGENTS.md

4. **Updated work opening invariant** (Inv 6) -- Now matches `00-kernel.md` section 6.1: "Only `DefaultForemanFacade.onSyncCompleted()` (or `onFactsAdmitted()`) may insert `work_item` rows. Both delegate to a private `onContextsAdmitted()` that performs the actual insert."
5. **Added IntentHandoff boundary** (new Inv 10) -- "Only `IntentHandoff.admitIntentFromDecision()` may create `intent` rows. It is called from within the foreman's atomic decision transaction."
6. **Renumbered all downstream invariants** (11-17 control plane, 18-22 observation, 23-26 task 085, 27-30 task 087, 31-34 outbound) to maintain continuous numbering.

### Verification

- `pnpm build` -- clean
- `pnpm typecheck` -- clean
- Grep confirmed zero `evaluation_records` references in `SEMANTICS.md` or `AGENTS.md`
