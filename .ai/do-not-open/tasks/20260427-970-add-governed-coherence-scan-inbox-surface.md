---
status: closed
criteria_proved_by: architect
criteria_proved_at: 2026-04-27T13:47:16.891Z
criteria_proof_verification:
  state: unbound
  rationale: Implemented governed coherence scan surface. narada coherence scan runs dry by default and reports bounded findings; --submit explicitly writes Canonical Inbox envelopes with system_observed authority. Scanner emits observations or task candidates and dedupes active cooldown keys. It detects task lifecycle snapshot posture/freshness and missing unified work-next read-only peek support. Added doctrine for self-maintenance coherence loop and autoimmune controls. Focused tests cover dry-run, explicit submit, and dedupe; live scan submitted a task_candidate envelope; pnpm verify passed.
closed_at: 2026-04-27T13:47:21.321Z
closed_by: architect
governed_by: task_close:architect
closure_mode: operator_direct
---

# Add governed coherence scan inbox surface

## Chapter

Self-Maintenance Coherence Loop

## Goal

Create a bounded self-maintenance coherence scan that observes repo incoherences and can submit inert Canonical Inbox observations or task candidates without performing repairs.

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

- [x] narada coherence scan runs read-only by default and reports bounded findings
- [x] scanner can submit Canonical Inbox envelopes only with an explicit submit flag
- [x] submitted envelopes are typed as observation or task_candidate with system_observed authority
- [x] scanner detects at least snapshot freshness/posture and missing read-only unified work-next peek support
- [x] focused tests cover dry-run output and explicit inbox submission without auto-promotion or repair
