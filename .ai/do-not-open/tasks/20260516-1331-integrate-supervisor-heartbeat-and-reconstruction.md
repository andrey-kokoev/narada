---
status: closed
depends_on: [1308, 1321, 1322, 1323, 1324, 1325, 1326]
closed_at: 2026-05-16T03:13:15.231Z
closed_by: narada.architect
governed_by: task_close:narada.architect
closure_mode: peer_reviewed
---

# Integrate supervisor heartbeat and reconstruction

## Chapter

D:\code\narada\.ai\do-not-open\tasks\20260516-1327-1332-narada-native-carrier-orchestration-wrapper.md

## Goal

Expose orchestration stage summaries through supervisor heartbeat and readiness reconstruction.

## Context

Operators need reconstructable wrapper evidence without raw prompt, output, transcript, or credential capture.

## Required Work

1. Add wrapper stage summaries to supervisor heartbeat evidence.
2. Include wrapper evidence refs in readiness reconstruction.
3. Ensure reconstruction uses session JSON refs and bounded summaries only.
4. Add reconstruction tests proving wrapper evidence can be rebuilt from durable refs.

## Non-Goals

- Do not make runtime liveness task authority.
- Do not store raw prompt, raw provider output, raw transcript, or credential material.
- Do not require a permanently running daemon for unit tests.

## Execution Notes

- Added bounded `wrapper_stage_summaries` to supervisor heartbeat evidence. The summaries retain only stage/status/mode/evidence ref plus explicit raw-value omission flags.
- Added readiness reconstruction wrapper evidence refs and bounded wrapper summaries derived from session JSON files only.
- Added tests proving heartbeat redaction and reconstruction from durable wrapper refs without raw prompt, provider output, transcript, or credential capture.
- Changed files:
  - `tools/narada-native-carrier/supervisor.mjs`
  - `tools/narada-native-carrier/supervisor.test.mjs`
  - `tools/narada-native-carrier/readiness.mjs`
  - `tools/narada-native-carrier/readiness.test.mjs`

## Verification

- `node --test tools\narada-native-carrier\supervisor.test.mjs` - pass, 6 tests.
- `node --test tools\narada-native-carrier\readiness.test.mjs` - pass, 3 tests.
- `node --test tools\narada-native-carrier\*.test.mjs` - pass, 78 tests.
- `pnpm --filter @narada2/cli build` - pass.

## Acceptance Criteria

- [x] Supervisor heartbeat includes bounded orchestration stage summaries.
- [x] Readiness reconstruction includes wrapper evidence refs.
- [x] Tests prove reconstruction works without raw prompt, output, transcript, or credential capture.
