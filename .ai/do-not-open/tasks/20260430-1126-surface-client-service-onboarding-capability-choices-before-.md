---
status: closed
criteria_proved_by: builder
criteria_proved_at: 2026-04-30T14:52:11.347Z
criteria_proof_verification:
  state: unbound
  rationale: Readiness output now carries structural and business-capability strata; client_service Sites expose eight numbered choices including mailbox/intake posture; unresolved choices warn before inhabited readiness; docs and operator tests verify the behavior; source inbox items for this arc were already promoted/pending in canonical inbox state.
closed_at: 2026-04-30T14:52:33.828Z
closed_by: builder
governed_by: task_close:builder
closure_mode: agent_finish
---

# Surface client-service onboarding capability choices before readiness

## Goal

Make client-service Site onboarding distinguish structural bootstrap readiness from business-capability readiness by surfacing mailbox/intake and adjacent capability choices before declaring inhabited readiness.

## Context

Inbox incident `env_a0778f0d-f9e3-447e-b128-d33612a7718a` reports that CPY client Site setup used the structural bootstrap path and reached `fully_idle`, but the onboarding flow never asked whether the client Site should have mailbox/intake capability. For a client-service Site, mailbox posture is a material Operator choice, not an implementation detail.

This is adjacent to task 1125, but not the same fault. Task 1125 covers cross-Site operator-surface registry mutation. This task covers false readiness caused by missing client-service capability choice inventory.

## Required Work

1. Define the client-service onboarding choice inventory and decide which choices are required before inhabited readiness can be claimed.
2. Make mailbox/intake posture a first-class numbered Operator choice: none for now, bind existing mailbox, or provision/request mailbox.
3. Surface adjacent material choices: allowed correspondents or domains, runtime behavior, sync posture, source data loci, affiliated Data/ELT Sites, reporting surfaces, and operator-surface roles.
4. Extend the relevant bootstrap, doctor, readiness, or onboarding command so unresolved optional-but-material choices are reported separately from structural blockers.
5. Update readiness language so `fully_idle` or equivalent structural success cannot be mistaken for business-capability readiness when choices remain unanswered.
6. Add docs and regression coverage for a fresh client-service Site onboarding flow that must surface choices before completion.
7. Route the source inbox envelope to this task with durable evidence.

## Non-Goals

- Do not provision a mailbox or external account as part of this task.
- Do not make mailbox mandatory for every Site type.
- Do not collapse structural bootstrap readiness into inhabited onboarding completion.
- Do not mutate CPY local Site state from Narada proper.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [x] Client-service onboarding exposes numbered Operator choices for mailbox/intake posture: none, existing mailbox, or provision/request mailbox
- [x] Readiness output distinguishes structural readiness from unresolved onboarding capability choices
- [x] Client-service capability inventory covers mailbox/intake, allowed correspondents or domains, runtime behavior, sync posture, source data loci, affiliated Data/ELT Sites, reporting surfaces, and operator-surface roles
- [x] Fresh onboarding docs or tests prove the flow cannot silently declare fully inhabited readiness before material choices are answered or explicitly deferred
- [x] The source inbox envelope is promoted or recorded pending to the created task with durable evidence
