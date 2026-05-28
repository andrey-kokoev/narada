---
status: closed
depends_on: [1307]
closed_at: 2026-05-16T01:12:17.477Z
closed_by: narada.architect
governed_by: task_close:narada.architect
closure_mode: peer_reviewed
---

# Implement readiness and evidence reference readers

## Chapter

D:\code\narada\.ai\do-not-open\tasks\20260516-1321-1326-narada-native-to-data-adapter-foundation.md

## Goal

Implement to-data readers for carrier readiness and evidence reference summaries.

## Context

Narada-native sessions need reconstructable evidence visibility without storing raw provider output or transcripts.

## Required Work

1. Use operationalReadiness, reconstruct, supervisor doctor, and registration readiness as source surfaces.
2. Emit readiness_snapshot and evidence_ref_summary packets with evidence file refs, schema/status summaries, capability posture, and source attribution.
3. Ensure provider and fixture sessions reconstruct with bounded evidence refs and no raw provider output.
4. Add tests for fixture-backed, provider-backed, blocked, and missing-evidence states.

## Non-Goals

- Do not inspect private SQLite state as readiness truth.
- Do not record raw provider output or raw transcripts.
- Do not let runtime liveness become task authority.

## Execution Notes

- Extended `tools/narada-native-carrier/to-data-readers.mjs` with `readReadinessSnapshotToDataPacket` and `readEvidenceRefSummaryToDataPacket`.
- Readiness packets use `operationalReadiness`, `supervisorDoctor`, and `registrationReadiness` as source surfaces.
- Evidence reference packets use `reconstruct` and `supervisorDoctor` as source surfaces.
- Packets summarize evidence refs, schema/status/state/phase, runtime/provider/capability posture, residual blocker counts, and authority non-claims without copying provider output or transcripts.
- Extended `tools/narada-native-carrier/to-data-readers.test.mjs` with fixture-backed, provider-backed, missing-evidence, and unsafe-evidence coverage.

## Verification

- `node --test tools\narada-native-carrier\to-data-readers.test.mjs` passed: 9 tests.
- `node --test tools\narada-native-carrier\*.test.mjs` passed: 55 tests.
- `pnpm --filter @narada2/cli build` passed.

## Acceptance Criteria

- [x] Readiness and evidence readers emit bounded attributed packets.
- [x] Fixture and provider sessions reconstruct from evidence refs.
- [x] Tests prove raw provider output and unbounded transcripts are not recorded.
