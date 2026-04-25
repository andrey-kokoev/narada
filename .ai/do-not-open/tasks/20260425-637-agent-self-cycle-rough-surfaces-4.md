---
status: closed
depends_on: []
amended_by: operator
amended_at: 2026-04-25T03:02:12.484Z
governed_by: task_review:a3
closed_at: 2026-04-25T03:28:52.602Z
closed_by: a3
---

# Agent Self Cycle Smoke Proof

## Goal

Add an end-to-end smoke proof for the basic agent cycle: identify, peek, pull, work packet, report, review, done.

## Context

The rough surfaces appeared only when trying to behave like an actual named agent. Unit-level command tests are not enough; Narada needs one small proof that an agent can enter the system and get coherent responses through the normal cycle.

## Required Work

1. Create a focused proof harness or test that uses a temp repo and an admitted agent identity.
2. Exercise `peek-next`, `pull-next`, and `work-next` in sequence.
3. Verify roster state changes after claim and clears after done.
4. Verify output envelopes are stable and bounded.
5. Record the proof path in the relevant task execution notes.

## Non-Goals

Do not run the full historical backlog. Do not require live Kimi/Codex process launch.

## Execution Notes

1. Added an admitted-agent smoke proof to `task-next.test.ts`.
2. The proof creates a temp repo with admitted agents `a1` and `a2`, an opened executable task, and complete evidence scaffolding.
3. The proof exercises `peek-next`, `pull-next`, `work-next`, `task report`, `task review`, and `task roster done`.
4. The proof checks stable JSON envelopes for peek/pull/work, verifies roster state becomes `working` after pull, and verifies roster state becomes `done` with `last_done` after done.
5. The proof stays inside `pnpm test:focused`, so it is recorded by the Testing Intent Zone wrapper and runtime telemetry.

## Verification

| Command | Result |
| --- | --- |
| `pnpm --filter @narada2/cli build` | Pass |
| `pnpm test:focused "pnpm --filter @narada2/cli exec vitest run test/commands/task-next.test.ts --pool=forks -t smoke-proves"` | Pass, 1/1 targeted, ~7s |
| `pnpm test:focused "pnpm --filter @narada2/cli exec vitest run test/commands/task-next.test.ts --pool=forks"` | Pass, 15/15, ~34s |

## Acceptance Criteria

- [x] The smoke proof runs under the focused test posture.
- [x] It proves bounded output.
- [x] It proves claim and roster state agree.
- [x] It proves work-next emits a usable packet or explicit reason.
- [x] It stays under a practical focused-test runtime target.



