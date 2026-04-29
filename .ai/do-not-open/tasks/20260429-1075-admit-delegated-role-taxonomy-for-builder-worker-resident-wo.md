---
status: closed
amended_by: architect
amended_at: 2026-04-29T16:43:50.587Z
criteria_proved_by: builder
criteria_proved_at: 2026-04-29T16:54:00.972Z
criteria_proof_verification:
  state: unbound
  rationale: Defined builder-worker, resident-worker, and effect-worker as delegated categories; disambiguated generic worker terminology from runtime effect machinery; documented messaging paths and non-symmetry rule; applied Role Admission Rule using inhabited evidence from Windows User Site, Staccato Site, and Narada proper Builder work; source envelope is linked in task and docs verification passed.
closed_at: 2026-04-29T16:54:15.758Z
closed_by: a2
governed_by: task_close:a2
closure_mode: peer_reviewed
---

# Admit delegated role taxonomy for builder-worker resident-worker and effect-worker

## Chapter

Inhabited Role Taxonomy

## Goal

Evaluate and document explicit delegated role categories for builder-worker resident-worker and effect-worker so Narada can scale inhabited work without overloading the generic worker concept or collapsing construction and operational effect roles.

## Context

Inbox envelope env_c00d5e94-c419-4374-9ffd-7a6043ce8307 proposes admitting delegated role categories after inhabited work in Windows User Site and Staccato Site showed pressure against a generic worker role. Narada already uses worker-like terms for mechanical effect machinery such as send-reply workers, process runners, and executors. The proposal is to distinguish construction delegation and resident/use delegation from effect machinery.

## Required Work

1. Read docs/concepts/inhabited-evolution.md, docs/product/site-governance-coordinates.md, site bootstrap role guidance, and existing worker/effect terminology in code/docs. 2. Decide whether builder-worker, resident-worker, and effect-worker are admitted now or deferred, applying the Role Admission Rule and inhabited evidence. 3. If admitted, define role function, delegation source, authority limits, lifecycle/handoff expectations, and messaging paths. 4. Preserve the distinction architect -> builder -> builder-worker and resident -> resident-worker -> effect-worker without adding symmetry not earned by operations. 5. Update relevant doctrine/docs and any bootstrap guidance if appropriate. 6. Ensure generic worker terminology remains reserved or disambiguated from inhabited delegated roles. 7. Record residuals if any role should remain proposal/deferred. 8. Verify with focused docs checks or pnpm verify when safe.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->
- Amended by architect at 2026-04-29T16:43:50.587Z: context, required work

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [x] builder-worker resident-worker and effect-worker are defined or explicitly deferred with rationale
- [x] Generic worker terminology is disambiguated from low-level operational or effect machinery
- [x] Resident builder architect and delegated worker messaging paths are documented without creating unearned role symmetry
- [x] Role admission rule is applied using inhabited evidence from User Site Staccato Site and delegated build work
- [x] Source inbox envelope is routed to the task and focused verification or pnpm verify passes
