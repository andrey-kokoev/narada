---
status: closed
criteria_proved_by: narada.architect
criteria_proved_at: 2026-05-13T01:41:40.788Z
criteria_proof_verification:
  state: unbound
  rationale: proof via task finish
closed_at: 2026-05-13T01:41:41.279Z
closed_by: narada.architect
governed_by: task_close:narada.architect
closure_mode: agent_finish
---

# Adopt source Site import and migration refusal posture into Narada proper Site

## Chapter

narada-proper-site-capability-adoption

## Goal

Represent source Site import/migration/lift from existing Sites as explicitly non-admitted for normal Narada proper Site operation.

## Context

Residual from .narada/capabilities/missing-capabilities.md: source Site import/migration/lift from narada-andrey or any other existing Site.

## Required Work

Create or update .narada capability/policy evidence so source Site import/migration/lift is refused by default and separated from greenfield create-site/package adoption.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [x] Source Site import/migration refusal is recorded
- [x] Greenfield package/template adoption remains distinct
- [x] Audit/ledger evidence exists
