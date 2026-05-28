---
status: closed
depends_on: [1313, 1301, 1302, 1303, 1304, 1305, 1326, 1332, 1338, 1344, 1350, 1356]
amended_by: narada.architect
amended_at: 2026-05-16T14:59:52.382Z
deferred_by: narada.architect
deferred_at: 2026-05-16T15:00:28.728Z
defer_reason: Blocked until task 1362 completes negative authority tests.
unblock_condition: Unblock after task 1362 is closed with task, inbox, command, outbox, and publication refusal evidence.
continuation_packet:
  kind: task_unblock
  unblocked_by: narada.architect
  unblocked_at: 2026-05-16T15:10:30.978Z
  evidence: Task 1362 closed at 2026-05-16T15:10:19.262Z with report wrr_7ec7f861_20260516-1362-run-negative-authority-tests_narada.architect and admission ear_1362_1778944208111_gcpqaq; verification passed 28 negative authority tests covering task, inbox, command, outbox, and publication refusal evidence.
  rationale: The unblock condition for task 1363 was task 1362 closure with task, inbox, command, outbox, and publication refusal evidence.
  previous_unblock_condition: Unblock after task 1362 is closed with task, inbox, command, outbox, and publication refusal evidence.
unblocked_by: narada.architect
unblocked_at: 2026-05-16T15:10:30.978Z
unblock_evidence: Task 1362 closed at 2026-05-16T15:10:19.262Z with report wrr_7ec7f861_20260516-1362-run-negative-authority-tests_narada.architect and admission ear_1362_1778944208111_gcpqaq; verification passed 28 negative authority tests covering task, inbox, command, outbox, and publication refusal evidence.
unblock_rationale: The unblock condition for task 1363 was task 1362 closure with task, inbox, command, outbox, and publication refusal evidence.
closed_at: 2026-05-16T15:11:24.114Z
closed_by: narada.architect
governed_by: task_close:narada.architect
closure_mode: agent_finish
---

# Run operator doctor and reconstruction proof

## Chapter

D:\code\narada\.ai\do-not-open\tasks\20260516-1357-1363-narada-native-end-to-end-builder-proof.md

## Goal

Prove operator-facing doctor and reconstruction report the final Narada-native proof posture.

## Context

Operators need bounded readback of the completed proof without raw prompt, model output, transcript, or secret exposure.

## Required Work

1. Run operator-facing doctor after proof execution.
2. Verify doctor reports final posture, evidence refs, provider/data/consent/runtime states, and reconstruction status.
3. Verify output is bounded and omits raw prompts, model output, transcripts, and secret values.

## Non-Goals

- Do not display raw evidence payloads.
- Do not treat doctor output as lifecycle authority.
- Do not require live provider credentials for readback proof.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->
- Amended by narada.architect at 2026-05-16T14:59:52.382Z: dependencies
- Ran the operator-facing doctor/readback proof on fixture and provider-configured paths without live provider credentials.
- Verified compact JSON and human doctor output report runtime posture, provider posture, data posture, consent posture, capability/adapter posture, blocked reasons, latest bounded evidence refs, reconstruction status, next diagnostic command, and authority non-claims.
- Verified reconstruction links launch, supervisor start/heartbeat, provider-configured dry-run posture, doctor output, and durable evidence refs by carrier session id.
- Verified doctor/readiness/supervisor output remains a bounded projection and not lifecycle authority: `output_authority: bounded_projection_not_task_truth`, `automatic_repair_mutation: false`, and no direct SQLite or secret-store inspection required for ordinary reconstruction.
- Verified redaction of raw prompt, model output, raw provider output, transcripts, credential refs, and secret-like values.

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->
- `node --test tools\narada-native-carrier\doctor-command.test.mjs tools\narada-native-carrier\operator-readback-proof.test.mjs tools\narada-native-carrier\readiness.test.mjs tools\narada-native-carrier\supervisor.test.mjs tools\narada-native-carrier\doctor-command.test.mjs` passed: 21 tests.

## Acceptance Criteria

- [x] Doctor and reconstruction report final proof posture with bounded refs.
- [x] Provider, data, consent, and runtime states are visible.
- [x] Tests prove raw prompts, model output, transcripts, and secret values are omitted.
