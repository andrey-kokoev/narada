---
status: closed
depends_on: []
criteria_proved_by: a2
criteria_proved_at: 2026-04-25T21:53:11.721Z
criteria_proof_verification:
  state: unbound
  rationale: Proved through task finish orchestration; verification evidence remains separately admitted.
closed_at: 2026-04-25T21:53:13.876Z
closed_by: a2
governed_by: task_close:a2
closure_mode: agent_finish
---

# Task 721 — Canonicalize Stored Review Verdicts

## Goal

Make SQLite task review verdict storage use one canonical negative verdict spelling instead of splitting between rejected and needs_changes.

## Context

The extracted review service writes rejected, while the legacy saveReview helper writes needs_changes. Evidence admission and review loading currently tolerate both, which hides a semantic split at the storage boundary.

## Required Work

1. Choose rejected as the canonical stored negative verdict because the CLI, service response, and operator vocabulary already use rejected.
2. Change legacy review write paths so new rows never store needs_changes.
3. Keep read compatibility for pre-existing needs_changes rows only at normalization boundaries.
4. Update ReviewVerdict type or adjacent comments so needs_changes is explicitly legacy-only if it cannot be removed outright.

## Non-Goals

- Do not change public CLI verdict names.
- Do not migrate historical SQLite rows in this task.
- Do not alter task lifecycle transition rules.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [x] New review writes through taskReviewCommand and saveReview persist rejected for rejected verdicts.
- [x] Existing needs_changes rows still read back as rejected.
- [x] Evidence admission still treats both rejected and legacy needs_changes rows as negative review evidence.
- [x] No debug output is emitted by review command tests.
