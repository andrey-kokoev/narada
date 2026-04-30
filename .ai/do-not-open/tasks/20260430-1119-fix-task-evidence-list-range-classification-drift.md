---
status: claimed
amended_by: architect
amended_at: 2026-04-30T13:44:23.942Z
---

# Fix task evidence list range classification drift

## Chapter

.ai/do-not-open/tasks/20260430-1113-1118-windows-bootstrap-correctness.md

## Goal

Make task evidence list agree with single-task evidence inspection for completed tasks and avoid duplicate chapter/task rows in numeric ranges.

## Context

During the Architect next loop after Builder closed Windows bootstrap correctness tasks 1113-1118, narada chapter status 1113-1118 reported all six tasks closed and narada task evidence 1113 --format json reported verdict complete. But narada task evidence list --range 1113-1118 --limit 6 --format json returned seven rows, duplicated task 1113, and classified the range as needs_closure. The likely cause is range scanning including the chapter file 20260430-1113-1118-windows-bootstrap-correctness.md as a task row and/or evidence-list logic diverging from single-task evidence inspection.

## Required Work

1. Reproduce the mismatch with a focused fixture: a chapter file named with the range start plus child tasks where the child is closed with report/closure/provenance.
2. Fix range scanning so chapter/range files are not emitted as task evidence rows for child task ranges.
3. Align evidence-list classification with single-task evidence inspection for closed tasks with report, verification, closure, governed provenance, and all criteria checked.
4. Preserve bounded observation artifact behavior while ensuring generated observation summaries reflect the corrected classification.
5. Add regression tests for duplicate prevention, complete closed task classification, and returned count for chapter ranges.
6. Verify with the real 1113-1118 range after the fix.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->
- Amended by architect at 2026-04-30T13:43:37.268Z: context, required work
- Amended by architect at 2026-04-30T13:43:48.090Z: context, required work
- Amended by architect at 2026-04-30T13:44:23.942Z: goal, acceptance criteria

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [ ] Range 1113-1118 evidence list does not duplicate task 1113 via the chapter file
- [ ] Complete single-task evidence verdicts are not listed as needs_closure by evidence list
- [ ] List and single-task inspect paths share SQLite-backed status and provenance logic or tests prove equivalent outcomes
- [ ] Observation artifacts from evidence list remain bounded and do not create misleading stale evidence
- [ ] Focused tests cover chapter-file range-start collision and closed task complete classification and range output count
