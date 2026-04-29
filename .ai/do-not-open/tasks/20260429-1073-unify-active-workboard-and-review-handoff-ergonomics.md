---
status: closed
amended_by: architect
amended_at: 2026-04-29T16:13:05.836Z
criteria_proved_by: builder
criteria_proved_at: 2026-04-29T16:29:32.959Z
criteria_proof_verification:
  state: unbound
  rationale: Task workboard command and focused tests cover current-work/read-model visibility without payload dumping; docs define Builder completion handoff requirements, closure claim classes, review-generated follow-up lifecycle, and Architect/Builder concurrency guidance; live bounded workboard and pnpm verify passed.
closed_at: 2026-04-29T16:29:53.179Z
closed_by: a2
governed_by: task_close:a2
closure_mode: peer_reviewed
---

# Unify active workboard and review handoff ergonomics

## Chapter

Architect Builder Handoff Ergonomics

## Goal

Create a coherent current-work and review-handoff model so Operator Architect and Builder can see active chapters pending reviews in-progress work follow-ups upstream envelopes and concurrency boundaries without manual repository archaeology.

## Context

Inbox envelope env_db93afac-0f33-42da-8805-4a281df01eb1 reports ergonomics gaps from User Site operator-surface, Komorebi, and display-toggle work. The recurring issue is not one missing command: Operator, Architect, and Builder lacked a single current-work/read-model and durable review handoff path. Builder completion required manual archaeology; one task closed with semantics narrower than the title implied; UI label semantics drifted; review-created follow-ups needed a standard routing path; upstream submissions were brittle without MCP; and concurrent Architect/Builder edits need explicit coordination.

## Required Work

1. Read the source envelope and related docs/tasks for CAPA Operation, Inhabited Evolution, canonical inbox, task handoff, role guards, and Architect governance concurrency. 2. Define or implement the smallest current-work/read-model that shows active chapters, pending reviews, in-progress Builder work, local follow-ups, source envelopes, and upstream submissions. 3. Define Builder completion handoff/review_request minimum content and where it is stored or rendered. 4. Define closure semantics for partial/manual/operator-entrypoint/event-driven/fully-integrated capability claims, or create a bounded follow-up if implementation is too large. 5. Define review-generated follow-up task lifecycle: allocation, task creation, commit expectation, routing, and Builder handoff. 6. Define Architect/Builder concurrency protocol for simultaneous Site mutation and file partitioning. 7. Add docs and/or CLI/read-model tests appropriate to the chosen slice. 8. Verify with pnpm verify if safe; otherwise use focused guards and record why full verification is blocked by Builder dirty work.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->
- Amended by architect at 2026-04-29T16:13:05.836Z: context, required work

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [x] Builder completion handoff and review_request requirements are represented in lifecycle or doctrine with commits changed files verification residuals and requested review questions
- [x] Task closure semantics distinguish manual helper operator entrypoint event-driven automation and fully integrated capability where relevant
- [x] Review-generated follow-up tasks have a standard allocation commit routing and Builder handoff path
- [x] A current workboard or read-model is specified for active chapters pending reviews in-progress Builder work local follow-ups and submitted upstream envelopes
- [x] Architect Builder concurrency guidance defines allowed simultaneous work file partitioning and handoff evidence and focused verification or pnpm verify passes
