---
status: closed
depends_on: []
criteria_proved_by: a2
criteria_proved_at: 2026-04-25T22:22:48.241Z
criteria_proof_verification:
  state: unbound
  rationale: proof via task finish
closed_at: 2026-04-25T22:22:49.915Z
closed_by: a2
governed_by: task_close:a2
closure_mode: agent_finish
---

# Task 728 — Add Chapter Assert Complete Alias

## Goal

Expose the coherence check as `narada chapter assert-complete <range>` so the operator can use chapter language for chapter closure.

## Context

The implementation lives under task evidence, but the operator intent is chapter-level: before committing or advancing, assert a chapter range is complete.

## Required Work

1. Wire a chapter-level command that delegates to the evidence range assertion implementation.
2. Preserve JSON and human behavior.
3. Make the help text clear that this checks evidence-complete tasks in a numeric range.
4. Add focused tests or command-level coverage for the alias path.

## Non-Goals

- Do not remove the task evidence command.
- Do not add git hooks.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [x] `narada chapter assert-complete 724-726` succeeds for complete ranges.
- [x] The chapter alias returns non-zero for incomplete ranges.
- [x] The alias does not duplicate logic beyond delegation.
- [x] Help text exposes the command under chapter governance.
