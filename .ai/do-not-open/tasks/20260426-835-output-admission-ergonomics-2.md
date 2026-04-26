---
status: closed
depends_on: []
criteria_proved_by: a2
criteria_proved_at: 2026-04-26T19:54:00.172Z
criteria_proof_verification:
  state: unbound
  rationale: proof via task finish
closed_at: 2026-04-26T19:54:00.550Z
closed_by: a2
governed_by: task_close:a2
closure_mode: agent_finish
---

# Task 835 — Add output guard debt report mode

## Goal

Make the output admission guard report remaining allowlist debt by file and count without failing.

## Context

The guard prevents drift, but migration planning still requires reading the script. A report mode should show the next debt clusters tersely.

## Required Work

1. Add --report mode to the guard.
2. Report allowlisted files ordered by total allowed direct-output count descending.
3. Include total allowance count and per-file counts.
4. Add a package script for the report mode.

## Non-Goals

- Do not make report mode fail on debt.
- Do not emit per-line giant transcripts in report mode.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [x] node scripts/cli-output-admission-guard.mjs --report exits 0 and prints bounded debt summary.
- [x] pnpm run narada:guard-cli-output:report works.
- [x] Normal guard mode remains unchanged and passes.
