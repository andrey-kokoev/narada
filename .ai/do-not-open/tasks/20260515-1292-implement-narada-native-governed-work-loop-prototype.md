---
status: closed
depends_on: [1285, 1286, 1287]
amended_by: narada.architect
amended_at: 2026-05-15T21:22:54.170Z
closed_at: 2026-05-15T21:22:57.443Z
closed_by: narada.architect
governed_by: task_close:narada.architect
closure_mode: peer_reviewed
---

# Implement Narada-native governed work loop prototype

## Chapter

D:\code\narada\.ai\do-not-open\tasks\20260515-1291-1293-narada-native-carrier-stage-3.md

## Goal

Implement a bounded native carrier loop that can observe assigned context, propose next actions, and hand off through governed surfaces.

## Context

The native carrier should eventually embody a Narada role. This task implements a prototype work loop that remains subordinate to task/inbox/command/publication authority.

## Required Work

1. Add a loop that reads startup context and a bounded work packet, invokes the fixture adapter, and emits a proposed action packet.
2. Route proposed task/inbox/outbox/command/publication effects as inert handoff artifacts or governed requests.
3. Add stop, interrupt, and closeout handling with evidence.
4. Ensure the loop can run in a no-effect fixture mode for tests.

Continuation Task: task 1293. Task 1293 carries the reconstruction/readiness proof for this prototype work loop.

## Non-Goals

- Do not let the loop claim or mutate work directly without admitted commands.
- Do not implement autonomous long-running daemon scheduling.
- Do not run production external effects in tests.

## Execution Notes

- Added `tools/narada-native-carrier/work-loop.mjs` as a bounded no-effect native carrier work loop prototype.
- The loop reads startup context and a bounded work packet, invokes the deterministic fixture adapter, and emits an inert governed handoff artifact.
- Proposed effects are written as handoff evidence requiring canonical admission before any task, inbox, outbox, command, or publication effect.
- Added interrupt and closeout evidence; closeout records no direct task, inbox, outbox, or publication mutation.
- Repaired rejected review finding through the adapter evidence boundary and added work-loop regression coverage proving adapter and handoff artifacts omit raw prompt/secret content.
- Added focused test coverage for no-effect mode, governed handoff evidence, no direct mutation, and bounded/redacted prompt evidence.
- Amended by narada.architect at 2026-05-15T21:21:59.734Z: required work
- Amended by narada.architect at 2026-05-15T21:22:54.170Z: required work

## Verification

- `node --test tools\narada-native-carrier\work-loop.test.mjs` passed with 1 test.
- `node --test tools\narada-native-carrier\adapter.test.mjs` passed with 3 tests.
- `node --test tools\narada-native-carrier\readiness.test.mjs` passed with 1 test.

## Acceptance Criteria

- [x] A bounded native work loop prototype runs in fixture/no-effect mode.
- [x] Proposed effects are emitted as governed handoff artifacts or requests.
- [x] Interrupt and closeout evidence are recorded.
- [x] Tests prove no direct task/inbox/outbox/publication mutation occurs from the loop.
