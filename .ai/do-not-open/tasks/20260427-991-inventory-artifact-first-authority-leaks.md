---
status: closed
amended_by: architect
amended_at: 2026-04-27T21:49:37.177Z
criteria_proved_by: architect
criteria_proved_at: 2026-04-27T21:56:01.041Z
criteria_proof_verification:
  state: unbound
  rationale: proof via task finish
closed_at: 2026-04-27T21:56:01.538Z
closed_by: architect
governed_by: task_close:architect
closure_mode: agent_finish
---

# Inventory artifact-first authority leaks

## Chapter

authority-inversion-implementation

## Goal

Build a repo-local inventory of surfaces where a visible artifact may be mistaken for authority, using Authority-Revealing Inversion as the review lens.

## Context

Authority-Revealing Inversion is now doctrine. The next executable step is to find where Narada still lets artifacts appear primary: markdown task files, local SQLite DBs, CLI output, repo clones, inbox exports, generated reviews, and tool/test transcripts. This inventory is not a repair pass; it creates the bounded map that scanner and review integration can use.

## Required Work

1. Inspect task lifecycle, inbox, resume/work-next, publication, CLI output admission, Site registry, secrets, tests, and generated artifacts.
2. For each surface, record visible artifact, hidden authority structure, current guard, gap, severity, and recommended follow-up.
3. Store the inventory in a durable repo-local artifact suitable for later scanner consumption.
4. Keep findings bounded and deduplicated; do not submit inbox spam or mutate target surfaces.
5. Verify the inventory is referenced by future tasks 992 and 993.

## Non-Goals

- Do not implement the scanner in this task.
- Do not repair every finding while inventorying.
- Do not treat warnings as blockers unless an existing guard is actively broken.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [x] Inventory covers task lifecycle, inbox, resume/work-next, publication, CLI output admission, Site registry, secrets, tests, and generated artifacts.
- [x] Each finding names visible artifact, hidden authority structure, current guard, gap, severity, and recommended executable follow-up.
- [x] Inventory is bounded and machine-readable enough for future coherence scan integration.
- [x] No target authority surfaces are mutated except the inventory artifact and task evidence.
- [x] `pnpm verify` passes.
