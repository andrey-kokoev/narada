---
status: opened
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

- [ ] `narada.onboarding_cascade.v0` schema or example artifact exists for client-service Sites
- [ ] Cascade artifact includes substrate selection, capability selection, capability questions, readiness states, deferred choice policy, command templates, and authority locus rules
- [ ] Readiness is stratified by structural Site, capability configuration, credential binding, dry-run proof, activation, runtime installation, and live health
- [ ] Site-local projection shape records cascade version, answers, deferred choices, and readiness projection
- [ ] Docs explain cascading onboarding while preserving structured artifact as canonical
- [ ] Tests or fixtures derive numbered Operator questions, deferred choices, and readiness-by-layer from the structured artifact
- [ ] Both source inbox envelopes are promoted or recorded pending to this task with durable evidence
