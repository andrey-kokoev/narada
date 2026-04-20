# Task 207: Create Closure-Family Tasks In A Disciplined Way

## Why

We identified a likely near-closed operator basis for Narada:

- selection
- inspection
- re-derivation
- promotion
- authority execution

`re-derivation` is now being decomposed through Tasks 201-206.

The remaining likely gaps are not “more features” in the abstract. They are incomplete operator families, especially:

- `selection`
- `promotion`
- possibly residual `inspection` hardening

If we create follow-up tasks casually, we risk repeating the same problem:

- overlapping tasks
- mixed semantic levels
- implementation-shaped tasks before the family is named
- accidental duplication with already-existing surfaces

This task exists to force disciplined backlog creation for the remaining closure path.

## Goal

Produce a bounded, non-overlapping set of follow-up tasks for the remaining closure families, created from a single explicit inventory and decomposition pass.

## Required Approach

### 1. Start From The Family Basis

Use this operator-family basis as the evaluation frame:

- `selection`
- `inspection`
- `re-derivation`
- `promotion`
- `authority execution`

Do not introduce a new top-level family unless it cannot be reduced to one of these.

### 2. Inventory Existing Surfaces First

Before creating any new task, inventory what Narada already has for each family:

- CLI surfaces
- daemon/operator surfaces
- observation surfaces
- control-plane APIs/types
- documented semantics

This prevents creating tasks for capabilities that already exist under a different name.

### 3. Identify Only True Gaps

For each family, classify possible follow-up work as one of:

- already present
- present but undernamed / undocumented
- partially implemented
- missing and required for closure
- explicitly deferrable

Only the last three categories may produce tasks.

### 4. Create Tasks By Family, Not By Random Feature

Any new task must clearly belong to one family and state:

- family name
- specific gap
- why it is needed for closure
- why it is not already covered by an existing task

### 5. Keep The Set Small

The output should be a minimal closure backlog, not a wish list.

Target shape:

- one inventory/result artifact
- a small number of follow-up tasks for genuine gaps

## Required Deliverables

### A. Closure Family Inventory

Create a compact inventory document covering:

- family
- existing surfaces
- gaps
- recommended follow-up

### B. Minimal Follow-Up Task Set

Create only the tasks that survive the inventory pass.

Strong expectation:

- `selection` family task(s)
- `promotion` family task(s)

Possible but not automatic:

- `inspection` corrective task(s)

Do not create more `re-derivation` tasks here unless the inventory finds a missing closure gap beyond 201-206.

## Non-Goals

- Do not implement the resulting tasks here
- Do not reopen authority-execution work unless a concrete closure gap is found
- Do not create decorative backlog items

## Definition Of Done

- [x] A disciplined inventory exists for the five operator families.
- [x] Existing Narada surfaces are checked before new tasks are created.
- [x] Only genuine closure gaps produce follow-up tasks.
- [x] The resulting task set is minimal and non-overlapping.
- [x] New tasks are explicitly tagged/framed by family.
- [x] No `*-EXECUTED`, `*-DONE`, or `*-RESULT` files are created.

## Execution Evidence

Inventory produced: `.ai/decisions/20260419-207-closure-family-inventory.md`
Follow-up tasks produced:
- `.ai/tasks/20260419-208-selection-operator-family.md`
- `.ai/tasks/20260419-210-inspection-operator-family-alignment.md`
- `.ai/tasks/20260419-209-promotion-operator-family.md` (produced but requires rewrite; see correction note below)

### Correction: Task 209 rewrite required

The initial draft of Task 209 incorrectly prescribed `ForemanFacade.resolveWorkItem()` / `OutboundHandoff.createCommandFromDecision()` as the implementation route for promoting a preview evaluation into governed work. That is semantically invalid: `resolveWorkItem()` resolves an *existing* work_item that already has an execution_id and evaluation_id; it does not open new work from a preview artifact.

Task 209 was rewritten in-place to instead:
1. Define the canonical promotable objects and transitions first
2. Only then prescribe surfaces that route through the correct admission paths (`onContextsAdmitted` / `deriveWorkFromStoredFacts` or a new promotion-specific foreman method)
3. Avoid baking in implementation-shaped prescriptions before the object model is fixed

The rewrite was applied directly to `.ai/tasks/20260419-209-promotion-operator-family.md`.
