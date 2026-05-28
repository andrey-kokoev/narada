---
status: closed
depends_on: [1276]
amended_by: narada.architect
amended_at: 2026-05-15T19:23:59.507Z
closed_at: 2026-05-15T19:24:04.280Z
closed_by: narada.architect
governed_by: task_close:narada.architect
closure_mode: peer_reviewed
---

# Implement Narada-native minimal session harness

## Chapter

D:\code\narada\.ai\do-not-open\tasks\20260515-1285-1287-narada-native-carrier-stage-2.md

## Goal

Implement a minimal Narada-native carrier harness that can materialize, hydrate, and close a Carrier Session without effect authority.

## Context

The current narada-native path can plan a session but not execute one. This task should materialize a real local harness lifecycle that records evidence and exits cleanly, leaving effectful work behind governed service boundaries.

## Required Work

1. Add a native carrier harness entrypoint or module with start, hydrate, capability projection, heartbeat/readback, and close phases.
2. Wire startup hydration through the canonical startup affordance and target-local Narada proper MCP posture.
3. Record launch, hydration, capability projection, heartbeat/readback, and closeout evidence.
4. Keep the harness unable to mutate task, inbox, outbox, publication, credentials, or native shell by default.

Continuation Task: task 1291. Follow-up tasks 1292 and 1293 continue the Narada-native adapter, work-loop, and readiness buildout.

## Non-Goals

- Do not connect a production model loop yet.
- Do not execute arbitrary shell commands.
- Do not consume Builder work-next or mutate lifecycle state from inside the harness.

## Execution Notes

- Added `tools/narada-native-carrier/harness.mjs` as a minimal Narada-native carrier harness module.
- The harness can start/materialize a Carrier Session, record startup hydration through `agent_context_hydrate_current`, project facade-only capabilities, emit heartbeat/readback, and close the session.
- Evidence is written under `.narada/crew/narada-native-carrier-sessions/<carrier_session_id>/` as start, hydrate, capabilities, heartbeat, and close JSON records.
- The harness keeps task lifecycle, inbox, outbox, repository publication, Site mutation, credential, native shell, and external Site authority withheld by default.
- Added `tools/narada-native-carrier/harness.test.mjs` to prove reconstructable lifecycle evidence and authority non-transfer.
- Amended by narada.architect at 2026-05-15T19:23:59.507Z: required work

## Verification

- `node --test tools\narada-native-carrier\harness.test.mjs` passed with 1 test.

## Acceptance Criteria

- [x] A minimal native carrier session can be materialized and closed locally.
- [x] The session emits reconstructable evidence for start, hydrate, capability projection, heartbeat/readback, and close.
- [x] Default capability posture is facade-only or read-only.
- [x] Focused tests verify lifecycle evidence and withheld authority.
