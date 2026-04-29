---
status: closed
amended_by: architect
amended_at: 2026-04-29T22:08:09.372Z
criteria_proved_by: builder
criteria_proved_at: 2026-04-29T23:44:35.283Z
criteria_proof_verification:
  state: unbound
  rationale: Implemented inbox submit cwd authority preflight. submit and submit-observation resolve package-subdirectory cwd to the Git worktree root before route evaluation, SQLite mutation, portable artifact export, and mutation evidence writing. Results include cwd_preflight with repair command. Existing message_routing_authority enforcement covers principal/target_locus/kind routing and refuses Builder upstream submission unless configured authority admits it. Regression test proves package-local .ai inbox artifacts are not created.
closed_at: 2026-04-29T23:44:54.038Z
closed_by: builder
governed_by: task_close:builder
closure_mode: agent_finish
---

# Enforce inbox target locus and cwd root authority

## Chapter

Inbox Locus Authority Guardrails

## Goal

Prevent inbox submission from package subdirectories or unauthorized role routes by enforcing target locus, Site root resolution, and principal routing authority before portable envelope artifacts are written.

## Context

Inbox envelope env_9602483c-da6c-466f-87aa-6bb2caee926e reports that a User Site builder bypassed local architect routing and submitted an upstream proposal from the wrong cwd, producing a portable inbox envelope under packages/layers/cli/.ai instead of Narada proper root .ai. Correct route is builder -> User Site architect inbox -> architect review/routing -> Narada proper root inbox. Corrected root envelope env_b7330900-7040-4e9f-bb5f-93475bf24f28 supersedes misplaced env_b7d3aeae-cd59-4cc8-a323-140192da4194.

## Required Work

1. Inspect inbox submit/export/import/work-next, Site root discovery, authority preflight, message routing authority, and package subdirectory behavior. 2. Define the expected Site root resolution rule for inbox submission from subdirectories. 3. Prevent package-local .ai/inbox-envelopes artifacts from being created by default when the governing Site root is the repo root. 4. Enforce or wire principal + target_locus + envelope_kind routing policy before writing portable envelope artifacts. 5. Refuse Builder direct upstream submission unless explicit Operator/Architect authority admits it; return exact repair/routing command. 6. Preserve legitimate package-local Site operation only when a package is explicitly declared as its own Site/locus. 7. Add regression tests for package cwd, corrected root cwd, unauthorized builder upstream route, and allowed architect upstream route. 8. Verify with focused tests and pnpm verify or record bounded blockers.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->
- Amended by architect at 2026-04-29T22:08:09.372Z: context, required work

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [x] Inbox submit preflights that cwd resolves to the intended Site root or refuses with repair command
- [x] Package subdirectory submissions do not create package-local .ai inbox artifacts by default
- [x] Principal target_locus envelope_kind routing policy is enforced or explicitly deferred to message routing authority
- [x] Builder direct upstream submission is refused unless admitted by explicit authority
- [x] Misplaced package-local inbox artifact case is captured as regression evidence
- [x] Source envelope env_9602483c-da6c-466f-87aa-6bb2caee926e is routed
