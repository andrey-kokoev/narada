---
status: closed
criteria_proved_by: architect
criteria_proved_at: 2026-04-27T21:13:10.226Z
criteria_proof_verification:
  state: unbound
  rationale: proof via task finish
closed_at: 2026-04-27T21:13:10.766Z
closed_by: architect
governed_by: task_close:architect
closure_mode: agent_finish
---

# Define capability-governed secret management doctrine

## Chapter

site-security

## Goal

Define Narada secret management as capability-governed and locus-aware: Sites may store secret references and capability policy, while raw secret values remain in appropriate authority-bearing secret stores.

## Context

<!-- Context placeholder -->

## Required Work

1. TBD

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [x] Docs define secrets as authority-bearing capabilities rather than ordinary config or knowledge;Docs distinguish secret reference
- [x] authorization
- [x] retrieval
- [x] use
- [x] rotation
- [x] revocation
- [x] and audit transitions;Docs define locus-aware stores for User
- [x] PC
- [x] project
- [x] client
- [x] data
- [x] ELT
- [x] cloud
- [x] and agent contexts;Docs state that cloned or re-instantiated Sites carry references and policies
- [x] not secret material;The source inbox envelope is handled through a governed pending or archive action;pnpm verify passes
