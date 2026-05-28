---
status: closed
depends_on: [1276]
closed_at: 2026-05-15T19:22:53.453Z
closed_by: narada.architect
governed_by: task_close:narada.architect
closure_mode: peer_reviewed
---

# Define Narada-native carrier runtime boundary

## Chapter

D:\code\narada\.ai\do-not-open\tasks\20260515-1285-1287-narada-native-carrier-stage-2.md

## Goal

Define the first executable Narada-native carrier boundary without making the carrier an authority implementation.

## Context

Stage 1 planned the native carrier lifecycle and refused execution with runtime_exec_not_admitted:narada-native. Stage 2 should define a minimal executable harness boundary that can start and hydrate a session while keeping authority in canonical services.

## Required Work

1. Specify the Narada-native runtime harness inputs, outputs, lifecycle states, and evidence records.
2. Declare which canonical services remain authoritative for task, inbox, outbox, command execution, publication, law, roster, and capability consent.
3. Define the runtime boundary for model/executor adapters as replaceable substrates, not authority owners.
4. Add readback vocabulary distinguishing planned, materialized, running, stopped, and refused native carrier states.

## Non-Goals

- Do not build a general autonomous agent platform.
- Do not move task/inbox/outbox/publication authority into the carrier.
- Do not admit shell, credential, or external effect access in this task.

## Execution Notes

- Added `docs/product/narada-native-carrier-runtime-boundary.v0.json` as the durable boundary/spec for the first executable Narada-native carrier slice.
- The spec defines runtime harness inputs, outputs, evidence records, and lifecycle states: planned, materialized, running, stopped, and refused.
- Declared canonical authority owners for task lifecycle, inbox, outbox, command execution, repository publication, law, roster, and capability consent.
- Defined model and executor adapters as replaceable substrates with no authority ownership.
- Added readback vocabulary that does not require direct SQLite inspection and distinguishes capability projection from capability consent.
- Added authority non-ownership assertions for carrier/session/task activation, model adapters, executor adapters, capability projection, and readback.
- Extended `packages/layers/cli/test/docs/agent-carrier-contract.test.ts` to assert the runtime boundary and authority separation.

## Verification

- `pnpm --filter @narada2/cli exec vitest run test/docs/agent-carrier-contract.test.ts` passed with 3 tests.

## Acceptance Criteria

- [x] A runtime boundary/spec exists for the executable Narada-native carrier slice.
- [x] The spec preserves Agent, Carrier Session, capability channel, and authority locus separation.
- [x] Readback vocabulary distinguishes lifecycle states without direct SQLite inspection.
- [x] Tests or fixtures assert authority non-ownership.
