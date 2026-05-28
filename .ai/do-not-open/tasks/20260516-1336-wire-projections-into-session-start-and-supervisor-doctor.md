---
status: closed
depends_on: [1309, 1321]
closed_at: 2026-05-16T03:16:33.041Z
closed_by: narada.architect
governed_by: task_close:narada.architect
closure_mode: peer_reviewed
---

# Wire projections into session start and supervisor doctor

## Chapter

D:\code\narada\.ai\do-not-open\tasks\20260516-1333-1338-narada-native-capability-consent-binding.md

## Goal

Expose capability projection posture through session start evidence and supervisor doctor output.

## Context

Operators need to see configured, blocked, revoked, stale, and fixture-only states without reading secret stores.

## Required Work

1. Record projection refs and statuses at session start, not grants or secrets.
2. Update supervisor doctor to report configured, blocked_missing_consent, blocked_revoked, blocked_stale, and fixture_only states.
3. Add doctor and reconstruction tests covering each state and proving raw secret values are absent.

## Non-Goals

- Do not reveal credential material in doctor output.
- Do not make supervisor doctor an authority locus.
- Do not require direct secret-store inspection for ordinary reconstruction.

## Execution Notes

- Added bounded capability projection status summaries to session start evidence in `tools/narada-native-carrier/harness.mjs`.
- Added bounded projection status summaries to supervisor start evidence in `tools/narada-native-carrier/supervisor.mjs`.
- Updated supervisor doctor output with `capability_projection_posture`, distinguishing `configured`, `blocked_missing_consent`, `blocked_revoked`, `blocked_stale`, and `fixture_only`.
- Added tests covering session start evidence, reconstruction readback, doctor posture states, and secret redaction.

## Verification

- `node --test tools\narada-native-carrier\harness.test.mjs` - pass, 2 tests.
- `node --test tools\narada-native-carrier\supervisor.test.mjs` - pass, 7 tests.
- `node --test tools\narada-native-carrier\readiness.test.mjs` - pass, 4 tests.
- `node --test tools\narada-native-carrier\*.test.mjs` - pass, 86 tests.
- `pnpm --filter @narada2/cli build` - pass.

## Acceptance Criteria

- [x] Session start evidence includes projection refs and statuses only.
- [x] Supervisor doctor distinguishes configured, missing consent, revoked, stale, and fixture-only states.
- [x] Tests prove raw secret values are absent.
