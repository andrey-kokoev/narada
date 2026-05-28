---
status: closed
closed_at: 2026-05-16T01:13:40.414Z
closed_by: narada.architect
governed_by: task_close:narada.architect
closure_mode: peer_reviewed
---

# Authority inversion risk: task-lifecycle-sqlite-substrate-authority

## Chapter

Canonical Inbox Promotions

## Goal

Snapshot proves freshness but does not yet provide append-only replayable mutation evidence.

## Context

Source inbox envelope: env_8f92ce74-ab41-4a11-8422-fbfaf2111f9b

Source: system_observation:coherence-scan:authority-inversion-task-lifecycle-sqlite-substrate-authority

Envelope kind: task_candidate

Summary: Snapshot proves freshness but does not yet provide append-only replayable mutation evidence.

Evidence:
- visible_artifact=.ai/task-lifecycle.db
- hidden_authority=SQLite is local runtime substrate; portable authority should be canonical mutation evidence plus tracked snapshots during transition.
- current_guard=DB ignored from Git and tracked .ai/task-lifecycle-snapshot.json freshness guard.
- candidate_tasks=994,995,997

Recurrence severity: medium
Recurrence key: task_candidate:system_observation:coherence-scan:authority-inversion-task-lifecycle-sqlite-substrate-authority
Prior related envelopes: env_679bb94f-e8e0-4885-a29f-bfeec8387458

## Required Work

0. Source summary: Snapshot proves freshness but does not yet provide append-only replayable mutation evidence.
1. Read source inbox envelope env_8f92ce74-ab41-4a11-8422-fbfaf2111f9b and preserve its authority context.
2. Identify the owning Narada authority boundary before mutating any target state.
3. Implement the smallest local change that satisfies the promoted request.
4. Verify the result with focused tests or command evidence appropriate to the changed surface.
5. Report residuals explicitly before closure.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

- Read the promoted inbox context for env_8f92ce74-ab41-4a11-8422-fbfaf2111f9b from mutation evidence. The authority concern is task lifecycle SQLite posture: SQLite is local runtime substrate, while portable authority needs append-only mutation evidence plus tracked snapshots.
- Added a shared `transition` summary to every task lifecycle mutation-evidence replay payload emitted by `writeTaskLifecycleMutationEvidence`. It records command, authority class, task id/number, before/after status, source/target evidence source, governed_by, closed_by, closure_mode, and `normalized=true`.
- This makes new lifecycle evidence more replayable without treating `.ai/task-lifecycle.db` or snapshots as the sole authority artifact.
- Extended lifecycle mutation-evidence tests to assert normalized transition payloads for claim, report, and close.
- Updated the test fixture to use a distinct admitted reviewer for report/finish routing, matching current review-obligation authority rules.
- Files changed for this task: `packages/layers/cli/src/lib/mutation-evidence-writer.ts`, `packages/layers/cli/test/commands/task-lifecycle-mutation-evidence.test.ts`, `.ai/do-not-open/tasks/20260516-1319-authority-inversion-risk-task-lifecycle-sqlite-substrate-aut.md`.

## Verification

- `NARADA_GIT_BINARY=git pnpm vitest run packages/layers/cli/test/commands/task-lifecycle-mutation-evidence.test.ts` passed: 5 tests.
- `pnpm --filter @narada2/cli build` passed.

## Acceptance Criteria

- [x] Source inbox envelope env_8f92ce74-ab41-4a11-8422-fbfaf2111f9b is handled through a governed task handoff.
- [x] Implementation does not bypass Narada authority boundaries.
- [x] Verification evidence is recorded before closure.
- [x] Residuals or blockers are reported explicitly.
