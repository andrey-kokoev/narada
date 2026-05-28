---
status: closed
closed_at: 2026-05-16T01:13:40.403Z
closed_by: narada.architect
governed_by: task_close:narada.architect
closure_mode: peer_reviewed
---

# Authority inversion risk: task-markdown-projection-authority

## Chapter

Canonical Inbox Promotions

## Goal

Markdown remains inspectable and can still look like the source of lifecycle truth to agents or scripts.

## Context

Source inbox envelope: env_6d6152cb-f950-472c-b063-057f351aff51

Source: system_observation:coherence-scan:authority-inversion-task-markdown-projection-authority

Envelope kind: task_candidate

Summary: Markdown remains inspectable and can still look like the source of lifecycle truth to agents or scripts.

Evidence:
- visible_artifact=.ai/do-not-open/tasks/*.md
- hidden_authority=Task lifecycle and task spec authority are command-mediated, SQLite-backed where migrated, and evidenced through reports/reviews/admissions.
- current_guard=Task file guard, task lifecycle snapshot guard, task amend/create/report/finish commands.
- candidate_tasks=992,993

Recurrence severity: medium
Recurrence key: task_candidate:system_observation:coherence-scan:authority-inversion-task-markdown-projection-authority
Prior related envelopes: env_5ba70976-3426-465b-ba90-b0e3be2a475c

## Required Work

0. Source summary: Markdown remains inspectable and can still look like the source of lifecycle truth to agents or scripts.
1. Read source inbox envelope env_6d6152cb-f950-472c-b063-057f351aff51 and preserve its authority context.
2. Identify the owning Narada authority boundary before mutating any target state.
3. Implement the smallest local change that satisfies the promoted request.
4. Verify the result with focused tests or command evidence appropriate to the changed surface.
5. Report residuals explicitly before closure.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

- Read the promoted inbox context for env_6d6152cb-f950-472c-b063-057f351aff51 from mutation evidence. The authority concern is that task markdown is inspectable and useful but can be mistaken for lifecycle authority.
- Added explicit bounded `authority_posture` metadata to `task read` JSON output. It names lifecycle authority, task spec authority, markdown's compatibility-projection role, status source, and the mutation rule directing lifecycle changes through governed task commands.
- Added a concise human-mode authority line so the sanctioned read surface reveals the SQLite/markdown boundary instead of hiding it.
- Updated task-read tests to assert the bounded authority posture and to preserve the no raw path leak guard.
- Files changed for this task: `packages/layers/cli/src/commands/task-read.ts`, `packages/layers/cli/test/commands/task-read.test.ts`, `.ai/do-not-open/tasks/20260516-1320-authority-inversion-risk-task-markdown-projection-authority.md`.

## Verification

- `NARADA_GIT_BINARY=git pnpm vitest run packages/layers/cli/test/commands/task-read.test.ts` passed: 14 tests.
- `pnpm --filter @narada2/cli build` passed.

## Acceptance Criteria

- [x] Source inbox envelope env_6d6152cb-f950-472c-b063-057f351aff51 is handled through a governed task handoff.
- [x] Implementation does not bypass Narada authority boundaries.
- [x] Verification evidence is recorded before closure.
- [x] Residuals or blockers are reported explicitly.
