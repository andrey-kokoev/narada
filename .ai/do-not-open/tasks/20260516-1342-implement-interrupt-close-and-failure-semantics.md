---
status: closed
depends_on: [1310, 1321, 1333]
criteria_proved_by: narada.architect
criteria_proved_at: 2026-05-16T03:33:21.032Z
criteria_proof_verification:
  state: unbound
  rationale: Criteria are proven by supervisor, readiness, and heartbeat focused tests recorded in task verification.
closed_at: 2026-05-16T03:40:05.893Z
closed_by: narada.builder
governed_by: task_close:narada.builder
closure_mode: peer_reviewed
---

# Implement interrupt close and failure semantics

## Chapter

D:\code\narada\.ai\do-not-open\tasks\20260516-1339-1344-narada-native-live-supervised-session.md

## Goal

Implement bounded lifecycle evidence for interrupt, close, and failure outcomes.

## Context

Runtime control evidence must avoid killing unrelated processes or implying authority transfer.

## Required Work

1. Record interrupt as requested, acknowledged, refused, or unsupported.
2. Record close as stopped, unknown, or stale with authority_transfer=false.
3. Record failure reason class, terminal flag, bounded diagnostics, and latest evidence refs.
4. Add tests for clean close, stale close, interrupted, failed nonterminal, and failed terminal states.

## Non-Goals

- Do not kill unrelated processes.
- Do not close tasks or execute external effects.
- Do not store raw stderr/stdout transcripts.

## Execution Notes

- Extended Narada-native supervisor interrupt evidence with explicit `requested`, `acknowledged`, `refused`, and `unsupported` status posture.
- Extended close evidence with `stopped`, `unknown`, and `stale` close posture while keeping `authority_transfer=false` and no unrelated process-kill claim.
- Extended failure evidence with bounded reason class, terminal flag, bounded diagnostic codes/classes, latest evidence refs, and explicit raw stdout/stderr/transcript/provider-output/secret omission flags.
- Added supervisor-control reconstruction in `tools/narada-native-carrier/readiness.mjs` so interrupt, close, and failure outcomes can be read back from durable supervisor evidence.
- Added tests covering clean close, stale close, interrupted, nonterminal failure, and terminal failure states without raw output or secret values.

## Verification

- `node --test tools\narada-native-carrier\supervisor.test.mjs` passed: 8 tests.
- `node --test tools\narada-native-carrier\readiness.test.mjs` passed: 5 tests.
- `node --test tools\narada-native-carrier\heartbeat-evidence.test.mjs` passed: 2 tests.

## Acceptance Criteria

- [x] Interrupt, close, and failure evidence are bounded and reconstructable.
- [x] Authority transfer remains false.
- [x] Tests cover clean, stale, interrupted, nonterminal failure, and terminal failure states.
