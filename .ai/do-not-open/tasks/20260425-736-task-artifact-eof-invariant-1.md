---
status: closed
depends_on: []
criteria_proved_by: a2
criteria_proved_at: 2026-04-25T22:40:08.301Z
criteria_proof_verification:
  state: unbound
  rationale: proof via task finish
closed_at: 2026-04-25T22:40:08.602Z
closed_by: a2
governed_by: task_close:a2
closure_mode: agent_finish
---

# Task 736 — Normalize task artifact serialization EOF

## Goal

Make task artifact front-matter serialization produce exactly one final newline and no blank EOF line.

## Context

<!-- Context placeholder -->

## Required Work

1. Fix the canonical task artifact serialization helper.
2. Preserve leading body separation after front matter.
3. Avoid changing lifecycle or evidence authority semantics.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [x] serializeFrontMatter removes trailing blank body lines.
- [x] serializeFrontMatter still writes exactly one final newline.
- [x] The serialized task body remains parseable by parseFrontMatter.
- [x] Focused serialization tests cover the behavior.
