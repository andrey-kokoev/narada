---
status: closed
created: 2026-04-23
depends_on: [427, 468, 486, 501]
closed_at: 2026-04-23T20:30:00.000Z
closed_by: a2
governed_by: task_close:a2
---

# Task 510 - Self-Governance Boundary Contract

## Goal

Define the boundary between what Narada may govern in its own build loop and what remains explicitly operator-owned.

## Required Work

1. Define in-scope self-governed actions (recommend, assign, continue, review-request, closure-prep, evidence inspection).
2. Define out-of-scope actions that remain operator-owned (chapter selection, live external execution, unsafe promotion, commit authority unless already separately governed).
3. Produce a boundary contract artifact under `.ai/decisions/`.
4. Update the relevant task-governance docs/contracts with the boundary.

## Acceptance Criteria

- [x] A self-governance boundary contract exists.
- [x] In-scope vs out-of-scope actions are explicit.
- [x] Existing recommendation/assignment/closure surfaces are mapped against the contract.
- [x] Verification or bounded blocker evidence is recorded.

---

## Execution Notes

### Document Review

Read and analyzed prerequisite tasks and existing governance surfaces:

1. **Task 427 / Decision 427** — Governed promotion (recommendation → assignment) defines the `claim` authority path and promotion state machine.
2. **Task 468 / Decision 468** — Assignment promotion implementation (`task-promote-recommendation.ts`) with 9 validation checks, dry-run, override-risk.
3. **Task 486** — Agent completion finalizer (`task finish`) establishes the canonical completion path.
4. **Task 501** — Governed task artifact terminal-state ownership establishes `governed_by` provenance and closure invariants.
5. **Task 490 / Decision 490** — Task attachment/carriage boundary defines intent enum (`primary`, `review`, `repair`, `takeover`).
6. **`.ai/task-contracts/agent-task-execution.md`** — Existing agent task execution contract with authority boundaries, roster rules, construction loop controller constraints.
7. **`packages/layers/cli/src/commands/`** — All 18 task-governance commands reviewed for authority class and mutability.
8. **`packages/layers/cli/src/lib/construction-loop-policy.ts`** — Autonomy levels (`inspect`, `recommend`, `plan`, `bounded_auto`, `full_auto`) and policy gates.

### Boundary Contract Production

Created `.ai/decisions/20260423-510-self-governance-boundary-contract.md` containing:

- **Authority class mapping**: 8 authority classes (`inspect` through `admin`) with self-governability determination
- **Self-governed actions table**: 9 actions (recommend, plan, evidence, lint, graph, roster show, bounded auto-promotion, auto-review prep, closure-prep)
- **Operator-owned actions table**: 12 actions (chapter selection, task creation, live execution, unsafe promotion, commit, policy changes, authority boundary changes, schema changes, resolve/confirm closures, roster done --allow-incomplete, reopen, derive-from-finding)
- **Construction loop policy integration**: 5 autonomy levels mapped to active self-governed actions
- **Policy enforcement points**: 3 enforcement points in the controller
- **Existing surface mapping**: All 18 task-governance commands classified
- **5 invariants**: self-governance is policy-bounded; operator-owned is invariant; advisory by default; bounded auto-promotion is the only exception; policy changes are always operator-owned

### Contract Update

Updated `.ai/task-contracts/agent-task-execution.md` with a new **Self-Governance Boundary** section that:
- Lists self-governed actions (read-only observation + bounded auto-promotion)
- Lists operator-owned actions (12 categories)
- Records the 3 key invariants
- References the full boundary contract decision

## Verification

- Boundary contract exists: `wc -l .ai/decisions/20260423-510-self-governance-boundary-contract.md` → 239 lines.
- In-scope vs out-of-scope explicit: 9 self-governed + 12 operator-owned actions enumerated with authority classes and conditions.
- Existing surfaces mapped: all 18 task-governance commands classified in the contract table.
- Contract doc updated: `grep -n "Self-Governance Boundary" .ai/task-contracts/agent-task-execution.md` → found.
- `pnpm verify` → all 5 steps pass.
- `pnpm --filter @narada2/cli typecheck` → passes.


