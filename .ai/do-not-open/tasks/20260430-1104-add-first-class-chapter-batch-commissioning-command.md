---
status: claimed
---

# Add first-class chapter batch commissioning command

## Chapter

Architect Inbox Processing

## Goal

Add a first-class chapter commission or task create-batch command that creates a coherent chapter plus ordered tasks from structured input without fragile shell quoting, comma-sensitive criteria, or high-volume lifecycle output.

## Context

<!-- Context placeholder -->

## Required Work

0. Source summary: Commissioning a coherent chapter plus ten related tasks required manual chapter file creation, repeated task create calls, fragile cross-shell quoting, careful avoidance of comma-sensitive criteria wording, and a full lifecycle snapshot export with high-volume output. This is too much friction for a normal architect operation and makes context burn likely.
1. Read source inbox envelope env_0d5125ed-4aec-462a-8c3b-16c8caddc4f0 and preserve its authority context.
2. Identify the owning Narada authority boundary before mutating any target state.
3. Implement the smallest local change that satisfies the promoted request.
4. Verify the result with focused tests or command evidence appropriate to the changed surface.
5. Report residuals explicitly before closure.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [ ] Accept a structured input file containing chapter metadata and ordered task specs with criteria represented as arrays, not comma-sensitive CLI text.
- [ ] Admit chapter and tasks atomically or fail with bounded diagnostics while preserving task-number authority and avoiding partial untracked residue.
- [ ] Return a compact summary containing chapter path, task numbers, task ids, lifecycle statuses, dirty/published posture, and next recommended command without dumping lifecycle internals.
- [ ] Add focused tests covering successful batch commissioning, atomic failure, criteria array preservation, task-number authority, and compact JSON/human output.
- [ ] Update architect/operator documentation to prefer the batch commissioning command for multi-task chapters.
