---
status: closed
created: 2026-04-24
closed_at: 2026-04-24T16:09:20.850Z
closed_by: a3
governed_by: task_close:a3
depends_on: [565]
owner: codex
---

# Task 566-569 - Task Lifecycle SQLite Implementation v1

## Goal

Extend the first SQLite task-lifecycle implementation slice so more real governed task surfaces stop depending on markdown lifecycle authority.

## Chapter DAG

```text
566 Second Projection-Backed Read Surface
567 Second Governed Writer Migration
568 SQLite-Backed Dependency And Recommendation Reads
566, 567, 568 ─→ 569 Task Lifecycle SQLite Implementation v1 Closure
```

## Tasks

| Task | Title | Purpose |
|------|-------|---------|
| 566 | Second Projection-Backed Read Surface | Move another meaningful task read surface onto SQLite-backed projection |
| 567 | Second Governed Writer Migration | Migrate another governed lifecycle writer off markdown authority |
| 568 | SQLite-Backed Dependency And Recommendation Reads | Push dependency validation and recommendation reads onto SQLite-backed lifecycle state |
| 569 | Task Lifecycle SQLite Implementation v1 Closure | Close the v1 implementation slice honestly |

## Closure Criteria

- [ ] Another real read surface uses SQLite-backed projection
- [ ] Another governed writer uses SQLite authority
- [ ] Dependency/recommendation lifecycle reads are moved or explicitly narrowed onto SQLite-backed state
- [ ] Markdown remains authored spec rather than duplicated lifecycle authority
- [ ] Verification or bounded blockers are recorded
