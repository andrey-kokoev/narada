---
status: confirmed
depends_on: [1475, 1476, 1477, 1478, 1479, 1481]
criteria_proved_by: narada.architect
criteria_proved_at: 2026-05-17T21:25:24.393Z
criteria_proof_verification:
  state: bound
  verification_run_id: run_1779053117240_dflixq
closed_at: 2026-05-17T21:25:39.267Z
closed_by: narada.builder2
governed_by: chapter_close:narada.architect
closure_mode: peer_reviewed
---

# Audit remaining dirty worktree coherence boundary

## Chapter

D:\code\narada\.ai\do-not-open\tasks\20260517-1482-1484-remaining-coherence-cleanup-after-site-registry-split.md

## Goal

Produce a scoped audit of remaining dirty and untracked files touched during this round, separating coherent chapter evidence from unrelated or still-open residue.

## Context

The worktree is broadly dirty from many Narada work families. The Site Registry split chapter is closed, but global repo/worktree coherence was not proven. Before any commit or deploy decision, the touched surfaces need a bounded classification.

## Required Work

1. Inspect `git status --short` and focused diffs for files plausibly related to the Site Registry split, MCP planner, task lifecycle evidence, and closure decisions.
2. Classify changed paths as closed-chapter evidence, deferred live-publication evidence, unrelated pre-existing work, local/generated evidence, or requires operator review.
3. Produce a Git-visible audit artifact with path-level classifications and recommended commit grouping.
4. Run bounded consistency checks for the newly commissioned cleanup chapter and its related docs/tasks.
5. Do not stage, commit, push, delete, or revert files.

## Non-Goals

- Do not attempt full repository cleanup.
- Do not resolve unrelated dirty work.
- Do not commit or push.
- Do not use destructive git commands.

## Execution Notes

- Created `.ai/decisions/2026-05-17-remaining-coherence-cleanup-audit.md` as a bounded dirty-worktree coherence audit.
- Classified Site Registry split evidence, deferred live-publication evidence, related-but-separate work families, and local/generated evidence.
- Recorded recommended commit grouping and explicitly avoided staging, committing, pushing, deleting, or reverting.
- Recorded a newly observed lifecycle/projection anomaly: `task read 1483` succeeds, but `chapter status 1482-1484` reports only two tasks in the range. This must be repaired or explained before the cleanup chapter can close cleanly.

## Verification

- `git status --short` and `git diff --name-only` were inspected for changed and untracked path families.
- `git diff --stat -- <scoped Site Registry planner/docs files>` showed the Site Registry split touches docs, CLI/MCP planner surfaces, tests, and Cloudflare worker/README.
- `rg -n "Required Follow-Up|Path Classification|Recommended Commit Grouping|chapter status 1482-1484" .ai/decisions/2026-05-17-remaining-coherence-cleanup-audit.md` found all required audit sections.
- `git diff --cached --name-only` returned no staged files.
- `narada chapter status 1482-1484 --format json --cwd D:\code\narada` reported `tasks_found=2` and warning `Expected 3 tasks in range, found 2`.
- `narada task read 1483 --format json --cwd D:\code\narada` reported task 1483 as opened and readable.

## Acceptance Criteria

- [x] A dirty-worktree coherence audit artifact exists.
- [x] The audit distinguishes closed Site Registry split evidence from unrelated residue.
- [x] The audit states what would be safe to commit together and what must remain separate.
- [x] No staging, commit, push, deletion, or broad revert occurs.
