---
status: closed
criteria_proved_by: builder
criteria_proved_at: 2026-04-30T15:25:54.938Z
criteria_proof_verification:
  state: unbound
  rationale: narada.onboarding_cascade.v0 client-service artifact exists and includes substrate selection, capabilities, numbered questions, readiness states, deferred policy, command templates, authority locus rules, and Site-local projection shape; site readiness consumes it for numbered Operator questions; docs preserve structured artifact as canonical; tests and inbox evidence verify.
closed_at: 2026-04-30T15:26:14.037Z
closed_by: builder
governed_by: task_close:builder
closure_mode: agent_finish
---

# Add structured cascading onboarding contract

## Goal

Make Narada Site onboarding capability-aware and resumable through a governed structured cascade artifact, so structural Site readiness cannot be mistaken for full business/runtime readiness.

## Context

Inbox proposal `env_64cf33b1-83cf-43ec-9dda-91ef6f922a6a` proposes cascading onboarding for Narada Sites: substrate/locus selection, capability selection, capability configuration, readiness stratification, and deferred choice ledger.

Follow-up proposal `env_0d7d6386-974e-4c07-af90-a55113d7428f` clarifies that this must be structured-artifact-first, not prose-only documentation. The canonical cascade should be machine-readable JSON or YAML, with prose as explanation and doctrine. Without structure, Narada cannot reliably ask numbered questions, resume after interruption, compute readiness by layer, or prevent architect-memory drift.

This task generalizes recent CPY onboarding lessons: structural bootstrap succeeded, but mailbox, credential, runtime, and capability readiness needed separate guided choices and deferred-choice evidence.

## Required Work

1. Define an initial `narada.onboarding_cascade.v0` schema or example artifact for client-service Sites.
2. Include top-level cascade sections for substrate selection, capability selection, capability questions, readiness states, deferred choice policy, command templates, and authority locus rules.
3. Model readiness layers separately: structural Site ready, capability configured, credentials bound, dry-run proven, activated, runtime installed, and live health proven.
4. Ensure mailbox/intake, operator surface, runtime/daemon, task machinery, KB, data/ELT affinity, Git/GitHub sync, notifications, and outbound effects can be represented as selectable capabilities or deferred choices.
5. Define how Site-local projections store selected cascade version, answers, deferred choices, and readiness projection.
6. Update product/doctrine docs to explain cascading onboarding, but make clear that docs explain the structured artifact rather than replacing it.
7. Add or adapt CLI onboarding/readiness behavior to consume or reference the structured cascade instead of hardcoded prose-only question order where feasible.
8. Add tests or fixtures proving numbered Operator questions, deferred choices, and readiness-by-layer can be derived from the structured artifact.
9. Route both source inbox envelopes to this task with durable evidence.

## Non-Goals

- Do not implement every capability-specific onboarding command in this task.
- Do not make all capabilities mandatory for all Sites.
- Do not collapse structural bootstrap readiness into inhabited onboarding completion.
- Do not store raw secrets or live credential material in the cascade artifact.
- Do not mutate existing client Sites as part of this Narada proper task.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [x] `narada.onboarding_cascade.v0` schema or example artifact exists for client-service Sites
- [x] Cascade artifact includes substrate selection, capability selection, capability questions, readiness states, deferred choice policy, command templates, and authority locus rules
- [x] Readiness is stratified by structural Site, capability configuration, credential binding, dry-run proof, activation, runtime installation, and live health
- [x] Site-local projection shape records cascade version, answers, deferred choices, and readiness projection
- [x] Docs explain cascading onboarding while preserving structured artifact as canonical
- [x] Tests or fixtures derive numbered Operator questions, deferred choices, and readiness-by-layer from the structured artifact
- [x] Both source inbox envelopes are promoted or recorded pending to this task with durable evidence
