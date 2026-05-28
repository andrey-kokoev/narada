---
status: closed
depends_on: [1313, 1301, 1302, 1303, 1304, 1305, 1326, 1332, 1338, 1344, 1350, 1356]
amended_by: narada.architect
amended_at: 2026-05-16T14:59:45.945Z
deferred_by: narada.architect
deferred_at: 2026-05-16T15:00:28.738Z
defer_reason: Blocked until task 1360 completes Architect review and lifecycle closure proof.
unblock_condition: Unblock after task 1360 is closed with review id, verdict, closure/governance fields, and reconstruction refs.
continuation_packet:
  kind: task_unblock
  unblocked_by: narada.architect
  unblocked_at: 2026-05-16T15:07:13.896Z
  evidence: Task 1360 closed at 2026-05-16T15:06:41.276Z with review review-20260516-1360-complete-architect-review-and-closure-proof-1778944000079, verdict accepted, report wrr_d4b12149_20260516-1360-complete-architect-review-and-closure-proof_narada.architect, and admission ear_1360_1778944001208_c4acgf.
  rationale: The unblock condition for task 1361 was task 1360 closure with review id, verdict, closure/governance fields, and reconstruction refs.
  previous_unblock_condition: Unblock after task 1360 is closed with review id, verdict, closure/governance fields, and reconstruction refs.
unblocked_by: narada.architect
unblocked_at: 2026-05-16T15:07:13.896Z
unblock_evidence: Task 1360 closed at 2026-05-16T15:06:41.276Z with review review-20260516-1360-complete-architect-review-and-closure-proof-1778944000079, verdict accepted, report wrr_d4b12149_20260516-1360-complete-architect-review-and-closure-proof_narada.architect, and admission ear_1360_1778944001208_c4acgf.
unblock_rationale: The unblock condition for task 1361 was task 1360 closure with review id, verdict, closure/governance fields, and reconstruction refs.
closed_at: 2026-05-16T15:08:21.895Z
closed_by: narada.architect
governed_by: task_close:narada.architect
closure_mode: agent_finish
---

# Run provider-backed proof when capability is granted

## Chapter

D:\code\narada\.ai\do-not-open\tasks\20260516-1357-1363-narada-native-end-to-end-builder-proof.md

## Goal

Repeat the proof with mocked or explicitly capability-granted provider projection.

## Context

Provider-backed proof is optional unless capability consent is explicitly granted; mocked provider remains sufficient for CI.

## Required Work

1. Run the proof with a mocked provider or explicit granted provider projection.
2. Record provider invocation evidence with capability refs and summaries only.
3. Verify no raw provider output, raw secrets, credential values, or unbounded transcripts are recorded.

## Non-Goals

- Do not use private credentials without explicit consent.
- Do not require live provider network calls in normal CI.
- Do not persist raw provider output.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->
- Amended by narada.architect at 2026-05-16T14:59:45.945Z: dependencies
- Ran the CI-safe mocked/provider-configured proof path; no live provider credentials, private credential lookup, or provider network calls were used.
- Verified provider invocation evidence is bounded by provider registration, capability projection, capability refs, credential-ref-present booleans, and summaries only.
- Verified the mocked wrapper path composes provider/data/handoff/readback evidence while retaining direct mutation false and omitting raw provider output.
- Verified provider-configured operator readback links dry-run launch, doctor, and reconstruction by carrier session id without exposing credential refs, model output, raw prompts, raw provider output, transcripts, or secret-like values.

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->
- `node --test tools\narada-native-carrier\provider-adapter.test.mjs tools\narada-native-carrier\capability-projection.test.mjs tools\narada-native-carrier\orchestration-wrapper-proof.test.mjs tools\narada-native-carrier\task-handoff.test.mjs tools\narada-native-carrier\operator-readback-proof.test.mjs` passed: 19 tests.

## Acceptance Criteria

- [x] Provider-backed or mocked-provider proof records bounded invocation evidence.
- [x] Capability refs and summaries are present.
- [x] Tests prove raw provider output, secrets, credentials, and unbounded transcripts are absent.
