---
status: closed
closed: 2026-04-22
depends_on: [443, 450]
---

# Task 452 — Chapter Generation Command Hardening

## Context

Chapter DAG files (e.g., `20260422-431-436-macos-site-materialization.md`) are created by agents during chapter shaping. Currently, chapter generation is ad hoc: agents create the chapter file and then create individual task files without a unified reservation step. This leads to:

- range collisions with concurrent chapter creation;
- chapter files that claim ranges but do not reserve them in `.registry.json`;
- partial chapter creation where some tasks are created but others are not.

## Goal

Harden the chapter generation workflow so that:

1. Creating a chapter automatically reserves its full range.
2. Individual tasks inside a chapter are created against the reserved range.
3. Partial chapter creation is recoverable.

## Required Work

### 1. Define chapter generation contract

Specify the exact workflow:

```
1. Agent proposes chapter title, task count, and task titles.
2. Operator approves and reserves range NNN-MMM via task-reserve script (Task 450).
3. Agent creates chapter DAG file with reserved range declared.
4. Agent creates individual task files inside the reserved range.
5. Agent marks reservation as released when all tasks are created.
```

### 2. Create `scripts/task-chapter-create.ts`

A helper script that:

```bash
pnpm exec tsx scripts/task-chapter-create.ts \
  --title "macOS Site Materialization" \
  --tasks 431:macOS-boundary,432:launchd-spike,433:credential-binding \
  --depends-on 428
```

The script must:
- check for active reservations or compute next available range;
- create the chapter DAG file with correct range syntax;
- create stub task files for each task in the range;
- update `.registry.json` with the reservation.

### 3. Chapter DAG validation

Extend Task 449's lint to validate chapter files:
- range declared matches filename range;
- all tasks in the range exist as files;
- no tasks inside the range have headings outside the range;
- chapter does not overlap with other chapter ranges.

### 4. Partial recovery

If a chapter is partially created (some tasks missing), the reservation remains active. Document the recovery path:

```
1. Check which tasks in the range are missing.
2. Create missing tasks.
3. Release the reservation.
```

### 5. Update chapter-planning contract

Update `.ai/task-contracts/chapter-planning.md` with the hardened workflow.

## Acceptance Criteria

- [x] `scripts/task-chapter-create.ts` exists and creates valid chapter DAG + stub tasks.
- [x] Chapter creation reserves the range automatically.
- [x] Lint validates chapter range consistency.
- [x] `.ai/task-contracts/chapter-planning.md` is updated.
- [x] A sample chapter can be created and passes lint in dry-run.

## Non-Goals

- Do not rewrite existing chapter files.
- Do not enforce chapter creation through the script exclusively (manual creation remains possible with manual reservation).
- Do not add mermaid parsing complexity beyond simple regex validation.

## Verification

### Chapter create script

```bash
$ npx tsx scripts/task-chapter-create.ts --title "Test Chapter" --tasks "first task,second task,third task" --depends-on 443 --dry-run
Chapter: Test Chapter
Range:   456–458
Tasks:   456: first task, 457: second task, 458: third task
[CHAPTER] 20260422-456-458-test-chapter.md
[TASK]    20260422-456-first-task.md
[TASK]    20260422-457-second-task.md
[TASK]    20260422-458-third-task.md
Dry-run mode. No files were created.
```

### Execute mode (tested on temporary files, then cleaned up)

```bash
$ npx tsx scripts/task-chapter-create.ts --title "Test Chapter" --tasks "first task,second task,third task" --depends-on 443 --execute
Chapter: Test Chapter
Range:   456–458
[WRITTEN] .ai/tasks/20260422-456-458-test-chapter.md
[WRITTEN] .ai/tasks/20260422-456-first-task.md
[WRITTEN] .ai/tasks/20260422-457-second-task.md
[WRITTEN] .ai/tasks/20260422-458-third-task.md
[REGISTRY] Updated .ai/tasks/.registry.json
```

Created files verified:
- Chapter DAG has correct heading: `# Chapter DAG — Test Chapter (Tasks 456–458)`
- Chapter DAG has mermaid nodes for 456, 457, 458
- Chapter DAG has task table with correct rows
- Stub tasks have headings `# Task 456 — first task`, etc.
- Stub tasks have Context, Goal, Acceptance Criteria sections
- Registry updated with active reservation for 456–458

### Lint chapter validation

```bash
$ npx tsx scripts/task-graph-lint.ts
# No chapter-range-mismatch, chapter-missing-task, chapter-heading-inconsistent,
# or chapter-range-overlap findings for the sample chapter.
# Sample chapter passes all checks.
```

New lint checks implemented:
- `chapter-range-mismatch` — body range vs filename range
- `chapter-missing-task` — task file missing for a number in range
- `chapter-heading-inconsistent` — heading number doesn't match filename inside range
- `chapter-range-overlap` — two chapters claim overlapping ranges

### Chapter planning contract

`.ai/task-contracts/chapter-planning.md` updated with:
- `## Range Reservation` section with workflow and rules
- `## Partial Recovery` section with recovery steps
- Reference to `scripts/task-chapter-create.ts`

## Execution Mode

Proceed directly. This is an additive tooling and documentation task.

## Execution Notes

Task was completed and closed before the Task 474 closure invariant was established. Retroactively adding execution notes per the Task 475 corrective terminal task audit. Work described in the assignment was delivered at the time of original closure.
