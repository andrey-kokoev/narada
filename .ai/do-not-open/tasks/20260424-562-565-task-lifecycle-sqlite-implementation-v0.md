---
status: closed
created: 2026-04-24
closed_at: 2026-04-24T13:30:00.000Z
closed_by: a2
governed_by: task_close:a2
depends_on: [550]
owner: codex
---

# Task 562-565 - Task Lifecycle SQLite Implementation v0

## Goal

Implement the first bounded SQLite-backed task lifecycle path from the completed migration doctrine, while preserving markdown as authored task specification.

## Chapter DAG

```text
562 SQLite Task Lifecycle Store
 ├─→ 563 Projection-Backed Task Read Surface
 └─→ 564 First Operator Write Migration
563, 564 ─→ 565 Task Lifecycle SQLite Implementation Closure
```

## Tasks

| Task | Title | Purpose |
|------|-------|---------|
| 562 | SQLite Task Lifecycle Store | Add the bounded authoritative SQLite store for task lifecycle state |
| 563 | Projection-Backed Task Read Surface | Move task read/evidence/graph dependency reads onto projection-backed lifecycle state |
| 564 | First Operator Write Migration | Migrate the first governed lifecycle writers to SQLite authority |
| 565 | Task Lifecycle SQLite Implementation Closure | Close the implementation chapter honestly |

## Closure Criteria

- [x] SQLite lifecycle store exists in bounded v0 form
- [x] At least one real task read surface uses projection-backed lifecycle state
- [x] At least one governed write surface uses SQLite authority
- [x] Markdown remains authored spec, not duplicated lifecycle authority
- [x] Verification or bounded blockers are recorded
