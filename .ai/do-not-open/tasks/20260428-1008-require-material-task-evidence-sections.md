---
status: closed
criteria_proved_by: architect
criteria_proved_at: 2026-04-28T01:27:55.319Z
criteria_proof_verification:
  state: unbound
  rationale: proof via task finish
closed_at: 2026-04-28T01:27:55.932Z
closed_by: architect
governed_by: task_close:architect
closure_mode: agent_finish
---

# Require material task evidence sections

## Chapter

Task Evidence Materiality

## Goal

Make task evidence and task read treat placeholder-only markdown sections as empty, while accepting WorkResultReport verification as verification evidence.

## Context

Evidence authority was incorrectly satisfied by generated placeholder comments under ## Execution Notes and ## Verification.

## Required Work

1. Classify execution notes and verification sections by material content, not heading presence.
2. Apply the same materiality rule to SQLite projection evidence, task read, and lint terminal checks.
3. Treat WorkResultReport verification entries as verification evidence.
4. Add regression tests for placeholder-only sections and report-level verification.

## Non-Goals

- Do not require markdown narrative when durable WorkResultReport evidence exists.
- Do not change task lifecycle states directly.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [x] Placeholder-only Execution Notes and Verification sections do not satisfy material evidence.
- [x] WorkResultReport verification counts as verification evidence.
- [x] task read warnings align with task evidence semantics.
- [x] Focused regression tests pass.
- [x] pnpm verify passes.
