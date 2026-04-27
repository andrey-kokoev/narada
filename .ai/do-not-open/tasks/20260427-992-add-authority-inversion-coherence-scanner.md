---
status: closed
depends_on: [991]
amended_by: architect
amended_at: 2026-04-27T21:49:37.691Z
criteria_proved_by: architect
criteria_proved_at: 2026-04-27T22:02:22.287Z
criteria_proof_verification:
  state: unbound
  rationale: proof via task finish
closed_at: 2026-04-27T22:02:22.704Z
closed_by: architect
governed_by: task_close:architect
closure_mode: agent_finish
---

# Add authority inversion coherence scanner

## Chapter

authority-inversion-implementation

## Goal

Teach the coherence scanner to detect high-value artifact-first regressions and submit bounded observations or task candidates instead of silently repairing them.

## Context

Task 991 inventories artifact-first authority leaks. This task operationalizes that inventory inside the existing summon/configure-event coherence loop while preserving anti-autoimmune posture: scanner observes and proposes; it does not repair by default.

## Required Work

1. Add an authority-inversion module to coherence scanning, using the task 991 inventory categories.
2. Detect at least task-file authority leakage, inbox DB/export mismatch, CLI output artifact misuse, and wrong-locus mutation risk.
3. Emit bounded findings with artifact, hidden authority gap, severity, cooldown key, and exact proposed governed action.
4. Submit inbox observations or task candidates only when configured and cooldown allows.
5. Add focused tests for detection, bounded output, cooldown/deduplication, and no automatic repair.

## Non-Goals

- Do not make coherence scan an infinite daemon.
- Do not auto-fix findings.
- Do not block all work on advisory warnings.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [x] Scanner module uses the inventory categories from task 991.
- [x] Findings include artifact, authority/lifecycle/evidence/locus gap, severity, and proposed governed action.
- [x] Scanner is read-only and rate-limited to avoid autoimmune churn.
- [x] Focused tests cover at least task files, inbox DB/envelope posture, and CLI output artifacts.
- [x] `pnpm verify` passes.
