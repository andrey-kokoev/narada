---
status: closed
closed: 2026-04-23
governed_by: task_close:a2
created: 2026-04-23
depends_on: [465, 486]
---

# Task 526 - Distinguish Chapter Nodes From Task Nodes In Task Graph Rendering

## Goal

Fix `narada task graph` so chapter files and executable task files with overlapping numbers do not collapse into the same Mermaid/graph node id.

## Context

The current graph surface renders the chapter file `522–525` and executable task `522` as the same node id `T522`, causing:
- duplicate node declarations,
- duplicate incoming edges,
- ambiguous graph output,
- and misleading human/operator inspection.

This is a graph-surface bug, not a doctrine bug. The graph must preserve the distinction between:
- chapter artifact nodes,
- executable task nodes,
- and numeric dependency edges.

## Required Work

1. Inspect the graph/rendering pipeline for how node ids are derived for:
   - chapter range files,
   - single executable task files,
   - dependency references.
2. Define a canonical node-id scheme that cannot collide between:
   - chapter nodes,
   - task nodes,
   - and any future non-task artifact nodes if they are rendered.
3. Preserve human readability:
   - the displayed labels may still show `522` or `522–525`,
   - but internal Mermaid node ids must be unique and stable.
4. Ensure dependency edges still target the correct executable task nodes.
5. Add focused tests covering at least:
   - chapter file + same-leading-number task file,
   - chapter ranges,
   - mixed dependency graph output.
6. Verify `narada task graph --range 522-525 --format json` and Mermaid output both behave correctly.

## Non-Goals

- Do not redesign chapter semantics.
- Do not change task numbering.
- Do not widen this into a generic graph-UI rewrite.

## Acceptance Criteria

- [x] Chapter nodes and task nodes have distinct stable internal graph ids.
- [x] Mermaid output contains no duplicate node-id collisions for `522–525`.
- [x] Dependency edges point to the correct task nodes.
- [x] Focused tests exist and pass.
- [x] Verification or bounded blocker evidence is recorded.

## Execution Notes

1. **Root cause identified:** `readTaskGraph()` in `packages/layers/cli/src/lib/task-graph.ts` extracts `taskNumber` from all `.md` files using the regex `-(
+)-`. Chapter files like `20260423-522-525-chapter.md` and task files like `20260423-522-task.md` both match and get `taskNumber = 522`, producing the same Mermaid node id `T522`.

2. **Fix implemented in `task-graph.ts`:**
   - Added `kind: 'task' | 'chapter'` to `TaskGraphNode`, `RawTaskEntry`, and JSON output.
   - Detect chapter files by filename pattern `^[0-9]{8}-[0-9]+-[0-9]+` (date-start-end).
   - Mermaid node ids now use `C${num}` for chapters and `T${num}` for tasks.
   - Edge rendering uses `toKind` to resolve the correct target node id (chapter or task).
   - Edge de-duplication prevents duplicate lines when both a chapter and task have the same dependency.
   - Dependency context resolution prefers task nodes over chapter nodes.

3. **Tests added to `task-graph.test.ts`:**
   - `distinguishes chapter and task nodes with same number in mermaid`
   - `distinguishes chapter and task nodes in json output`
   - `renders chapter dependencies with correct edge targets`
   - `prefers task node over chapter for dependency edges when both exist`

## Verification

- `pnpm verify` — all 5 steps pass (task file guard, typecheck, build, charters tests, ops-kit tests).
- `pnpm --filter @narada2/cli test -- --run test/commands/task-graph.test.ts` — 18/18 tests pass.
- Full CLI test suite: 629/629 tests pass.
- Real repo verification: `narada task graph --range 522-525 --include-closed` correctly renders:
  - `C522["522<br/>Local Self-Build Runtime And Workbench Chapter<br/>opened"]`
  - `T522["522<br/>Task 522 - Local Self-Build Runtime Boundary Contract<br/>closed"]`
  - Distinct edges: `T513 --> C522`, `T517 --> C522`, `T513 --> T522`, `T517 --> T522`

**governed_by: task_close:a2**
