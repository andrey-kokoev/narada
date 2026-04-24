---
status: closed
created: 2026-04-23
closed_at: 2026-04-24T19:22:00.000Z
closed_by: a2
governed_by: task_close:a2
depends_on: [501, 507, 509]
---

# Task 546 - Task State Authority Boundary Contract

## Goal

Define the authoritative split between SQLite-backed task lifecycle state and markdown-authored task specification.

## Required Work

1. Enumerate task fields and classify them:
   - SQLite-authoritative lifecycle state,
   - markdown-authored specification,
   - projected/derived read view.
2. State which current markdown fields must stop being directly mutated by agents.
3. Define the boundary between lifecycle authority and authored narrative/spec text.
4. State what remains out of scope for the first migration line.
5. Write the boundary artifact to `.ai/decisions/`.

## Acceptance Criteria

- [x] Boundary artifact exists.
- [x] Field ownership split is explicit.
- [x] SQLite-authoritative lifecycle fields are explicit.
- [x] Markdown-authored fields are explicit.
- [x] Verification or bounded blocker evidence is recorded.

## Execution Notes

### Research

Examined the current task state storage model:
- `packages/layers/cli/src/lib/task-governance.ts` — all operators that mutate markdown front matter
- `.ai/tasks/*.md` — task file format with front matter and body sections
- `.ai/tasks/assignments/*.json` — assignment records
- `.ai/agents/roster.json` — agent operational state
- `.ai/tasks/.registry.json` — task number allocator
- Control plane SQLite schema (`work_items` table) — confirmed it is unrelated to task governance

### Key Finding

Seven operators currently **directly rewrite markdown front matter** for lifecycle state:
- `task-claim` → sets `status: claimed`
- `task-release` → sets `status: opened/in_review/needs_continuation`
- `task-report` → sets `status: in_review`
- `task-review` → sets `status: closed`, plus `governed_by`, `closed_at`, `closed_by`
- `task-close` → sets `status: closed`, plus provenance fields
- `task-reopen` → sets `status: opened`, deletes `governed_by`
- `task-continue` → sets `status: claimed`

This means any agent or human with filesystem access can bypass governed transitions by editing markdown directly.

### Boundary Artifact

Written `.ai/decisions/20260424-546-task-state-authority-boundary-contract.md` (~11 KB) containing:
- SQLite-authoritative lifecycle fields table (8 fields)
- Markdown-authored specification fields table (10 fields)
- Projected/derived read view table
- Operator migration mapping (current vs future action for all 7 operators)
- 5 boundary invariants
- Minimum SQLite schema for Task 547
- 3 markdown survival models evaluated (Model A recommended: authored spec only)
- 6 explicitly out-of-scope items

### Decisions

**Recommended markdown survival model:** Model A (authored spec only)
- Markdown contains only `task_id`, `depends_on`, `continuation_affinity`, `created`, and body text
- No lifecycle fields in markdown front matter
- Cleanest authority boundary; no duplication risk

## Verification

- Decision artifact exists and is ~11 KB ✅
- All 7 lifecycle-mutating operators identified and mapped ✅
- SQLite schema proposed with zero field duplication ✅
- `pnpm verify` — 5/5 steps pass ✅
- `pnpm typecheck` — all 11 packages clean ✅
