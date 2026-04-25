# Task Spec Authority Inventory

Task lifecycle authority has moved to SQLite. Task specification authority is still mid-migration: markdown under `.ai/do-not-open/tasks` remains a compatibility projection and full-text substrate, while `task_specs` is the target durable spec read model.

## Current Posture

| Surface | Current Role | Authority Posture |
| --- | --- | --- |
| `task read` | Single-task observation | Backfills and prefers `task_specs` for spec fields |
| `task search` | Full-text compatibility search | Scans markdown text, now prefers SQLite lifecycle/spec metadata for status and title |
| `task graph` | Dependency graph and Mermaid/JSON projection | Partly uses `task_specs`; still scans markdown for compatibility |
| `task recommend` | Candidate generation and scoring | Partly uses SQLite lifecycle/spec; still scans markdown body for chapter/context signals |
| `task evidence` | Evidence inspection and admission | Uses markdown for execution/verification projection and SQLite for lifecycle/proof/admission state |
| `task amend/create/chapter init` | Sanctioned spec mutation/creation | Intended command path for spec updates; direct edits remain outside normal authority |

## Remaining Direct Markdown Spec Reads

The remaining direct reads are compatibility reads, not the desired final authority:

- `packages/task-governance/src/task-graph.ts`
- `packages/task-governance/src/task-projection.ts`
- `packages/task-governance/src/task-recommender.ts`
- `packages/task-governance/src/task-governance.ts`
- `packages/layers/cli/src/commands/task-read.ts`
- `packages/layers/cli/src/commands/task-search.ts`
- `packages/layers/cli/src/commands/task-next.ts`
- `packages/layers/cli/src/commands/task-dispatch.ts`
- `packages/layers/cli/src/commands/task-report.ts`
- `packages/layers/cli/src/commands/task-review.ts`
- `packages/layers/cli/src/commands/chapter-close.ts`

## Migration Rule

When a read path needs task metadata, prefer this order:

1. SQLite lifecycle for status and closure state.
2. `task_specs` for title, dependencies, chapter, goal, context, required work, non-goals, and acceptance criteria text.
3. Markdown only as compatibility projection or full-text substrate.

Direct markdown reads are acceptable only when the content being read is still explicitly projection-owned, such as execution notes, verification notes, or full-text search snippets.
