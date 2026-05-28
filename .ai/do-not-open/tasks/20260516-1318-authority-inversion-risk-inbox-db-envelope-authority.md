---
status: closed
closed_at: 2026-05-16T01:13:40.404Z
closed_by: narada.architect
governed_by: task_close:narada.architect
closure_mode: peer_reviewed
---

# Authority inversion risk: inbox-db-envelope-authority

## Chapter

Canonical Inbox Promotions

## Goal

Exported envelopes are close to mutation evidence, but transition evidence is not yet normalized across submit/claim/triage/promotion/import.

## Context

Source inbox envelope: env_2c17e3ff-b151-434a-ae3b-9099c7f0b32c

Source: system_observation:coherence-scan:authority-inversion-inbox-db-envelope-authority

Envelope kind: task_candidate

Summary: Exported envelopes are close to mutation evidence, but transition evidence is not yet normalized across submit/claim/triage/promotion/import.

Evidence:
- visible_artifact=.ai/inbox.db and .ai/inbox-envelopes/*.json
- hidden_authority=Inbox envelopes are inert intake artifacts; status transitions and promotions are governed crossings with principal and read-back evidence.
- current_guard=Inbox import/export, work-next, triage, pending, task promotion, and doctor surfaces.
- candidate_tasks=996,997

Recurrence severity: medium
Recurrence key: task_candidate:system_observation:coherence-scan:authority-inversion-inbox-db-envelope-authority
Prior related envelopes: env_23769efc-c483-451c-980e-3d65331a3b04

## Required Work

0. Source summary: Exported envelopes are close to mutation evidence, but transition evidence is not yet normalized across submit/claim/triage/promotion/import.
1. Read source inbox envelope env_2c17e3ff-b151-434a-ae3b-9099c7f0b32c and preserve its authority context.
2. Identify the owning Narada authority boundary before mutating any target state.
3. Implement the smallest local change that satisfies the promoted request.
4. Verify the result with focused tests or command evidence appropriate to the changed surface.
5. Report residuals explicitly before closure.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

- Read the promoted inbox context for env_2c17e3ff-b151-434a-ae3b-9099c7f0b32c from mutation evidence. The authority concern is the Canonical Inbox crossing: exported envelope JSON is portable state, while submit/claim/release/promote/import transitions need normalized mutation evidence.
- Added a shared `transition` summary to every inbox mutation-evidence replay payload emitted by `writeInboxMutationEvidence`. It records command, authority class, confirmation kind, subject id, before/after status, handling principal, promotion target fields, enactment status, and `normalized=true`.
- This normalizes the evidence shape across submit, claim/release, triage/archive, pending/promotion, task promotion, and import replay without duplicating transition logic in each command.
- Extended inbox mutation-evidence tests to assert normalized transition payloads for submit, archive promotion, and import replay.
- Adjusted the existing task-pending-target assertion to match current canonical task promotion refs (`task:100`), which still prevents the duplicated `task:task:100` failure mode.
- Files changed for this task: `packages/layers/cli/src/lib/inbox-mutation-evidence-writer.ts`, `packages/layers/cli/test/commands/inbox-mutation-evidence.test.ts`, `.ai/do-not-open/tasks/20260516-1318-authority-inversion-risk-inbox-db-envelope-authority.md`.

## Verification

- `NARADA_GIT_BINARY=git pnpm vitest run packages/layers/cli/test/commands/inbox-mutation-evidence.test.ts` passed: 6 tests.
- `pnpm --filter @narada2/cli build` passed.

## Acceptance Criteria

- [x] Source inbox envelope env_2c17e3ff-b151-434a-ae3b-9099c7f0b32c is handled through a governed task handoff.
- [x] Implementation does not bypass Narada authority boundaries.
- [x] Verification evidence is recorded before closure.
- [x] Residuals or blockers are reported explicitly.
