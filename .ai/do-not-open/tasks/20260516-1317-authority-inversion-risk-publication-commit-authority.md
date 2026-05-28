---
status: closed
closed_at: 2026-05-16T01:13:40.404Z
closed_by: narada.architect
governed_by: task_close:narada.architect
closure_mode: peer_reviewed
---

# Authority inversion risk: publication-commit-authority

## Chapter

Canonical Inbox Promotions

## Goal

Not every commit/push path is forced through publication preflight or explicit publication evidence.

## Context

Source inbox envelope: env_e608a7ef-129f-4500-86c5-7f6b43e39613

Source: system_observation:coherence-scan:authority-inversion-publication-commit-authority

Envelope kind: task_candidate

Summary: Not every commit/push path is forced through publication preflight or explicit publication evidence.

Evidence:
- visible_artifact=Git commit, branch, and push output
- hidden_authority=Publication is a governed crossing from local patch bundle to remote-visible repository state with confirmation.
- current_guard=Publication intent zone and chapter preflight surfaces.
- candidate_tasks=1001,1002

Recurrence severity: medium
Recurrence key: task_candidate:system_observation:coherence-scan:authority-inversion-publication-commit-authority
Prior related envelopes: env_c3ed83c6-080a-4c34-ad7d-7058cc479db1

## Required Work

0. Source summary: Not every commit/push path is forced through publication preflight or explicit publication evidence.
1. Read source inbox envelope env_e608a7ef-129f-4500-86c5-7f6b43e39613 and preserve its authority context.
2. Identify the owning Narada authority boundary before mutating any target state.
3. Implement the smallest local change that satisfies the promoted request.
4. Verify the result with focused tests or command evidence appropriate to the changed surface.
5. Report residuals explicitly before closure.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

- Read the promoted inbox context for env_e608a7ef-129f-4500-86c5-7f6b43e39613 from mutation evidence. The authority concern is the Repository Publication Intent Zone: Git commit/push output must not be treated as publication authority without preflight and confirmation evidence.
- Reused the shared Site mutation authority preflight for the publication family.
- `work-next` doctrine guard now surfaces `publication_authority_preflight` alongside task lifecycle mutation preflight and turns publication refuse/inspect-only postures into doctrine blockers or next safe commands.
- `publication prepare` and `publication confirm` now inspect publication authority before recording bundle/confirmation state. Successful results include bounded `publication_authority_preflight`; non-authority/stale/read-only loci fail with `publication_authority_preflight_failed` and a next safe command.
- Added focused assertions in publication and work-next tests for the publication preflight surface.
- Files changed for this task: `packages/layers/cli/src/commands/publication.ts`, `packages/layers/cli/src/commands/work-next.ts`, `packages/layers/cli/test/commands/publication.test.ts`, `packages/layers/cli/test/commands/work-next.test.ts`, `.ai/do-not-open/tasks/20260516-1317-authority-inversion-risk-publication-commit-authority.md`.

## Verification

- `NARADA_GIT_BINARY=git pnpm vitest run packages/layers/cli/test/commands/publication.test.ts` passed: 4 tests.
- `NARADA_GIT_BINARY=git pnpm vitest run packages/layers/cli/test/commands/work-next.test.ts` passed: 29 tests.
- `pnpm --filter @narada2/cli build` passed.

## Acceptance Criteria

- [x] Source inbox envelope env_e608a7ef-129f-4500-86c5-7f6b43e39613 is handled through a governed task handoff.
- [x] Implementation does not bypass Narada authority boundaries.
- [x] Verification evidence is recorded before closure.
- [x] Residuals or blockers are reported explicitly.
