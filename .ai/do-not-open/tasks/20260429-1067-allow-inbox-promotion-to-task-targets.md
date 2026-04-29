---
status: opened
depends_on: [1065]
amended_by: architect
amended_at: 2026-04-29T15:06:25.933Z
---

# Allow inbox promotion to task targets

## Chapter

Architect Builder Handoff Ergonomics

## Goal

Make inbox routing express real task targets directly instead of forcing indirect decision references for task-backed work.

## Context

Inbox routing currently forced env_a59de5c1-e3fc-4da1-b593-33522183f44e to decision:task-1064-scale-relative-canonical-inbox-envelope because task targets are not accepted. That hides the real target kind.

## Required Work

1. Extend inbox promotion or pending target parsing to accept task:<number>. 2. Validate the task exists and resolve task number to canonical task id. 3. Store task target metadata in the envelope promotion or companion evidence without breaking existing target kinds. 4. Update work-next/show/list rendering to make task-linked promotions explicit. 5. Add tests for valid, missing, malformed, and backward-compatible targets. 6. Run pnpm verify.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->
- Amended by architect at 2026-04-29T15:06:25.933Z: context, required work

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [ ] inbox pending or promote accepts task:<number> or target kind task with validation
- [ ] Task target routing verifies the referenced task exists and records task number and task id
- [ ] work-next and show surfaces render task-linked promoted envelopes clearly
- [ ] Existing decision operator_action knowledge_entry and site_config_change targets remain compatible
- [ ] Tests cover valid missing and malformed task targets and pnpm verify passes
