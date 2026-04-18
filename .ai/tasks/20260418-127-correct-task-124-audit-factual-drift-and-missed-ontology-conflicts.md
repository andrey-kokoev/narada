# Task 127: Correct Task 124 Audit Factual Drift And Missed Ontology Conflicts

## Why

Task 124 produced a valuable semantic audit, but the result document is not yet reliable enough to serve as canonical guidance.

The review found multiple places where the audit result mixes stale assumptions with the current tree, and at least one important ontology contradiction that the audit should have surfaced but did not.

That is dangerous because Task 124 is intended to be the ontology-setting document that downstream tasks build from.

If the audit itself drifts from the codebase, it becomes a source of semantic confusion rather than a cure for it.

## Findings Being Corrected

### 1. Package surface audit contains factual drift

The result currently claims `@narada2/charters` is only "Zod schemas + tool validation; no runtime."

That is no longer true in the current tree. `packages/domains/charters/src/runtime/runner.ts` and related runtime files exist and materially participate in runtime authority.

The package inventory and any conclusions derived from it must be updated to reflect the actual runtime surface.

### 2. Evaluation persistence analysis mixes old and new states

The result currently describes `resolveWorkItem()` as if it still conceptually requires a full evaluation envelope and only hypothetically needs an `evaluation_id`-based design.

But current `foreman/types.ts` already includes `evaluation_id` in the relevant type surface.

The audit needs to distinguish clearly between:

- what is already true in the tree
- what is still inconsistent in implementation
- what remains to be changed

No cavity writeup should blend those into one muddy statement.

### 3. Atomic operation ontology missed a direct contradiction

The audit inventory treats `operation` as atomic, which matches the direction agreed in discussion.

But `TERMINOLOGY.md` still explicitly says:

- `a support operation spanning multiple mailboxes`

That is a direct ontology conflict and should have been called out as one of the audit findings.

Missing that contradiction weakens the audit's operational ontology section.

### 4. README assessment overstates the current gap

The result currently says the root `README.md` only lists legacy runtime commands and omits the shaping surface.

That overstates the problem. The current README already acknowledges the unified `narada` CLI and points readers to `QUICKSTART.md`, even though its command table remains incomplete.

The audit should distinguish between:

- "partially updated but incomplete"
- "still fully legacy"

## Goal

Produce a corrected Task 124 result document that is trustworthy as a semantic reference for follow-up work.

## Required Outcomes

### 1. Repair factual inaccuracies in the Task 124 result

Update the audit result so every package-level and architecture-level claim is grounded in the current tree.

At minimum, verify and correct:

- `@narada2/charters` actual role
- current envelope / evaluation / runtime authority surfaces
- README / docs surface characterization
- status of supposedly empty or hollow packages

### 2. Add the missed ontology conflict explicitly

The corrected audit must include the contradiction between:

- operation as an atomic user-facing concept
- `TERMINOLOGY.md` still documenting a multi-mailbox support operation

It must propose one authoritative resolution, not just mention the inconsistency.

### 3. Separate present state from proposed state

For each cavity, make the document clearly distinguish:

- current observed state
- why it is a problem
- proposed authoritative resolution

Do not mix "already landed" changes with "still proposed" changes.

### 4. Tighten downstream tasks derived from the audit

Any follow-up tasks produced by Task 124 that depend on corrected facts should be updated in the result document.

If a follow-up task remains valid, keep it.
If it needs narrowing or reframing, fix it.
If it was derived from a false premise, remove or rewrite it.

## Deliverables

- corrected `.ai/tasks/20260418-124-comprehensive-semantic-architecture-audit-report.md`
- factual corrections to package/runtime/doc assessments
- explicit addition of the missed atomic-operation ontology conflict
- cleaned follow-up task list aligned with the corrected audit

## Definition Of Done

- [x] the Task 124 result no longer contains factual drift against the current tree
- [x] the result explicitly identifies the multi-mailbox `operation` contradiction
- [x] each cavity cleanly separates observed present state from proposed future state
- [x] downstream follow-up tasks are aligned with corrected facts
- [x] the corrected audit is suitable to use as a canonical planning input

## Notes

This task is not asking for implementation of the follow-up fixes.

It is asking for the audit itself to become dependable before more work is scheduled from it.
