---
status: closed
depends_on: [1310, 1321, 1333]
criteria_proved_by: narada.architect
criteria_proved_at: 2026-05-16T03:24:46.616Z
criteria_proof_verification:
  state: unbound
  rationale: Criteria are proven by focused runtime-handle, supervisor, and readiness test runs recorded in task finish verification.
closed_at: 2026-05-16T03:38:35.186Z
closed_by: narada.builder
governed_by: task_close:narada.builder
closure_mode: peer_reviewed
---

# Define live runtime handle schema

## Chapter

D:\code\narada\.ai\do-not-open\tasks\20260516-1339-1344-narada-native-live-supervised-session.md

## Goal

Define bounded runtime handle evidence for fixture, local process, and MCP-backed Narada-native sessions.

## Context

Live carrier liveness is embodiment evidence, not task or effect authority.

## Required Work

1. Add runtime handle kinds for local_process, mcp_session, and fixture.
2. Record stable handle id, process or session presence, started_at, heartbeat_due_at, reachability summary, and raw transcript/secret flags false.
3. Add schema tests for fixture, live process, MCP session, and missing runtime handles.

## Non-Goals

- Do not infer task authority from runtime liveness.
- Do not store raw transcripts, prompts, provider outputs, or secret values.
- Do not require a permanently running daemon for unit tests.

## Execution Notes

- Added `tools/narada-native-carrier/runtime-handle.mjs` with a bounded runtime handle schema covering `fixture`, `local_process`, `mcp_session`, and `missing` handle states.
- Runtime handle evidence records stable handle id, process/session presence, `started_at`, `heartbeat_due_at`, bounded reachability summary, raw transcript/prompt/provider/secret flags set false, and explicit non-authority flags for task, inbox, outbox, effect, publication, identity, and capability authority.
- Wired supervisor start and heartbeat evidence through fixture runtime handles by default while preserving explicit runtime-handle injection for later live process or MCP-backed sessions.
- Added `tools/narada-native-carrier/runtime-handle.test.mjs` for schema coverage, bounded evidence, and authority-refusal validation.

## Verification

- `node --test tools\narada-native-carrier\runtime-handle.test.mjs` passed: 3 tests.
- `node --test tools\narada-native-carrier\supervisor.test.mjs` passed: 7 tests.
- `node --test tools\narada-native-carrier\readiness.test.mjs` passed: 5 tests.

## Acceptance Criteria

- [x] Runtime handle schema covers fixture, local process, MCP session, and missing handle states.
- [x] Handle evidence is bounded and has raw transcript/secret flags false.
- [x] Tests prove runtime liveness is not task or effect authority.
