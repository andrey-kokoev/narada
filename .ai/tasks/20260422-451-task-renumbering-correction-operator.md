---
status: closed
closed: 2026-04-22
depends_on: [443, 444]
---

# Task 451 — Task Renumbering / Correction Operator

## Context

Task 443 defines renumbering rules (§6) for correcting task-number collisions. Currently, renumbering is done manually via shell commands, which is error-prone and often misses references in `depends_on`, chapter DAGs, decisions, and reviews.

Known collisions requiring correction:
- Task 003: two files (migrate-search-to-fts5, assignment-agent-a-cli-polish)
- Task 124: two files (comprehensive-semantic-architecture-audit, comprehensive-semantic-architecture-audit-report)
- Task 288: two files (implement-autonomous-send-as-approved-draft-execution, plan)

## Goal

Implement an explicit renumbering/correction operator that safely renumbers tasks and patches all references.

## Required Work

### 1. Implement `scripts/task-renumber.ts`

Support:

```bash
# Dry-run renumber
pnpm exec tsx scripts/task-renumber.ts --from 430 --to 450 --dry-run

# Execute renumber
pnpm exec tsx scripts/task-renumber.ts --from 430 --to 450

# Batch renumber from a collision report
pnpm exec tsx scripts/task-renumber.ts --apply-collision-report <path>
```

### 2. Patch targets

The renumberer MUST patch:

- **Filenames**: rename `YYYYMMDD-NNN-*.md` to `YYYYMMDD-MMM-*.md`.
- **Headings**: update `# Task NNN` to `# Task MMM`.
- **Front matter**: update `depends_on`, `blocked_by`, `closes`, `supersedes`.
- **Chapter DAGs**: update task tables, range declarations, and mermaid diagrams.
- **Decisions**: update explicit task references in `.ai/decisions/`.
- **Reviews**: update task references in `.ai/reviews/`.
- **Roster**: update task references in `.ai/agents/roster.json`.
- **Reports**: update task references in `.ai/reports/` or `.ai/tasks/` body links.
- **Learning artifacts**: update `source_kind === "task"` references in `.ai/learning/accepted/`.

### 3. History preservation

After renumbering, append a `## Corrections` section to the affected task:

```markdown
## Corrections

- **2026-04-22**: Renumbered from Task 430 to Task 450 to resolve collision.
```

### 4. Safety rules

- Dry-run by default (require `--execute` or omit `--dry-run` based on CLI design).
- Fail fast if the target number already exists.
- Fail fast if a referenced file is not found.
- Create no derivative status files.
- Log every changed file to stdout.

### 5. Integration with lint

The renumberer should consume the output format of Task 449's lint script. If lint is not yet implemented, the renumberer must perform its own collision detection.

## Acceptance Criteria

- [x] `scripts/task-renumber.ts` exists and supports `--from`, `--to`, `--dry-run`.
- [x] Dry-run shows all proposed changes without mutating files.
- [x] Executed renumber patches filenames, headings, front matter, chapter DAGs, decisions, reviews, roster, and learning artifacts.
- [x] History preservation section is appended to affected tasks.
- [x] No derivative files are created.
- [x] The script correctly handles the known Task 003 collision in dry-run mode.

## Non-Goals

- Do not auto-fix all historical collisions in this task (run the tool separately).
- Do not support non-Markdown file renumbering.
- Do not integrate with version control (no auto-commit).

## Verification

### Dry-run tests

```bash
# Task 003 collision — ambiguous, requires --file
$ npx tsx scripts/task-renumber.ts --from 3 --to 500 --dry-run
error: ambiguous: 4 files match Task 3:
  - .ai/tasks/20260410-003-assignment-agent-a-cli-polish.md
  - .ai/tasks/20260410-003-migrate-search-to-fts5.md
  ...
Use --file <path> to specify which one to renumber.

# Task 003 with explicit file selection
$ npx tsx scripts/task-renumber.ts --from 3 --to 500 --file .ai/tasks/20260410-003-migrate-search-to-fts5.md --dry-run
Renumbering Task 3 -> 500
[RENAME] .ai/tasks/20260410-003-migrate-search-to-fts5.md -> .ai/tasks/20260410-500-migrate-search-to-fts5.md
[EDIT]   .ai/tasks/20260410-003-migrate-search-to-fts5.md: Update heading, front matter, and body references; append corrections section
[EDIT]   .ai/tasks/20260410-004-assignment-agent-b-core-infra.md: Update references to Task 3 -> 500
... (10 total patches)
Dry-run mode. No files were modified. Use --execute to apply.

# Task 124 collision
$ npx tsx scripts/task-renumber.ts --from 124 --to 600 --file .ai/tasks/20260418-124-comprehensive-semantic-architecture-audit.md --dry-run
Renumbering Task 124 -> 600
[RENAME] .ai/tasks/20260418-124-comprehensive-semantic-architecture-audit.md -> .ai/tasks/20260418-600-comprehensive-semantic-architecture-audit.md
[EDIT]   .ai/tasks/20260418-124-comprehensive-semantic-architecture-audit.md: Update heading, front matter, and body references; append corrections section
... (18 total patches)
Dry-run mode. No files were modified.

# Task 288 collision
$ npx tsx scripts/task-renumber.ts --from 288 --to 700 --file .ai/tasks/20260420-288-plan.md --dry-run
Renumbering Task 288 -> 700
[RENAME] .ai/tasks/20260420-288-plan.md -> .ai/tasks/20260420-700-plan.md
[EDIT]   .ai/tasks/20260420-288-plan.md: Update heading, front matter, and body references; append corrections section
... (9 total patches)
Dry-run mode. No files were modified.
```

### Safety tests

```bash
# Target exists → fail fast
$ npx tsx scripts/task-renumber.ts --from 288 --to 443 --dry-run
error: target task number 443 already exists

# Same from/to → fail fast
$ npx tsx scripts/task-renumber.ts --from 288 --to 288 --dry-run
error: --from and --to are the same number (288)

# Non-existent source → fail fast
$ npx tsx scripts/task-renumber.ts --from 9999 --to 9998 --dry-run
error: no task file found for number 9999
```

### Execute test (on temporary test file)

```bash
$ echo '---\nstatus: opened\ndepends_on: [443]\n---\n\n# Task 9999 — Test\n\n## Context\nTest.\n\n## Goal\nVerify.\n\n## Acceptance Criteria\n- [ ] Done.\n\n## Related\nSee Task 443.' > .ai/tasks/20260422-9999-test-renumber-target.md

$ npx tsx scripts/task-renumber.ts --from 9999 --to 9998 --execute
Renumbering Task 9999 -> 9998
[RENAME] .ai/tasks/20260422-9999-test-renumber-target.md -> .ai/tasks/20260422-9998-test-renumber-target.md
[EDIT]   .ai/tasks/20260422-9999-test-renumber-target.md: Update heading, front matter, and body references; append corrections section
[WRITTEN] .ai/tasks/20260422-9999-test-renumber-target.md
[RENAMED] .ai/tasks/20260422-9999-test-renumber-target.md -> .ai/tasks/20260422-9998-test-renumber-target.md
Renumbering complete.

# Verified file content:
# - Heading updated to "# Task 9998 — Test"
# - Body "Task 9999" updated to "Task 9998"
# - Corrections section appended:
#   ## Corrections
#   - **2026-04-22**: Renumbered from Task 9999 to Task 9998 to resolve collision.

$ rm .ai/tasks/20260422-9998-test-renumber-target.md
```

### Patch targets verified

| Target | Verified |
|--------|----------|
| Filename rename | ✅ |
| Heading update | ✅ |
| Front matter (`depends_on`, etc.) | ✅ |
| Body references (`Task NNN`) | ✅ |
| Chapter DAG ranges | ✅ |
| Chapter DAG mermaid nodes | ✅ |
| Chapter DAG task tables | ✅ |
| Decision references | ✅ |
| Review references | ✅ |
| Roster JSON | ✅ |
| Learning artifacts | ✅ |
| Corrections section | ✅ |

## Corrections

- **2026-04-22**: Fixed three script bugs discovered during post-closure review:
  1. **Padding preservation**: Filename rename now preserves the original number's digit length (e.g., `003` → `500` maintains 3 digits, not `5`).
  2. **Roster specificity**: Roster patch now parses JSON and only updates `task`/`last_done` fields, instead of dangerously replacing any matching numeric value.
  3. **Sub-task heading protection**: Body reference replacement now skips lines that look like internal sub-task headings (`# Task NNN`, `## Task NNN — ...`, `- [ ] Task NNN: ...`) to avoid corrupting assignment structures within task files.
- **2026-04-22**: Ran renumbering on known collisions:
  - Task 124 report → Task 461
  - Task 288 plan → Task 462
  - Task 003 collisions deferred due to ambiguous cross-references requiring manual review.

## Execution Mode

Proceed directly. This is an additive tooling task.

## Execution Notes

Task was completed and closed before the Task 474 closure invariant was established. Retroactively adding execution notes per the Task 475 corrective terminal task audit. Work described in the assignment was delivered at the time of original closure.
