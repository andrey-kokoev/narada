---
status: closed
depends_on: [1313, 1301, 1302, 1303, 1304, 1305, 1326, 1332, 1338, 1344, 1350, 1356]
amended_by: narada.architect
amended_at: 2026-05-16T14:59:45.994Z
deferred_by: narada.architect
deferred_at: 2026-05-16T15:00:28.743Z
defer_reason: Blocked until task 1361 completes provider-backed or mocked-provider proof.
unblock_condition: Unblock after task 1361 is closed with bounded provider invocation evidence and no-raw-output verification.
continuation_packet:
  kind: task_unblock
  unblocked_by: narada.architect
  unblocked_at: 2026-05-16T15:08:33.114Z
  evidence: Task 1361 closed at 2026-05-16T15:08:21.895Z with report wrr_7f1ae6cd_20260516-1361-run-provider-backed-proof-when-capability-is-granted_narada.architect and admission ear_1361_1778944089866_j52fqg; verification passed 19 mocked/provider-configured tests covering bounded provider invocation evidence and no raw output/secrets.
  rationale: The unblock condition for task 1362 was task 1361 closure with bounded provider invocation evidence and no-raw-output verification.
  previous_unblock_condition: Unblock after task 1361 is closed with bounded provider invocation evidence and no-raw-output verification.
unblocked_by: narada.architect
unblocked_at: 2026-05-16T15:08:33.114Z
unblock_evidence: Task 1361 closed at 2026-05-16T15:08:21.895Z with report wrr_7f1ae6cd_20260516-1361-run-provider-backed-proof-when-capability-is-granted_narada.architect and admission ear_1361_1778944089866_j52fqg; verification passed 19 mocked/provider-configured tests covering bounded provider invocation evidence and no raw output/secrets.
unblock_rationale: The unblock condition for task 1362 was task 1361 closure with bounded provider invocation evidence and no-raw-output verification.
closed_at: 2026-05-16T15:10:19.262Z
closed_by: narada.architect
governed_by: task_close:narada.architect
closure_mode: agent_finish
---

# Run negative authority tests

## Chapter

D:\code\narada\.ai\do-not-open\tasks\20260516-1357-1363-narada-native-end-to-end-builder-proof.md

## Goal

Prove the carrier cannot directly execute authority-bearing Narada actions.

## Context

The end-to-end proof must fail closed for task, inbox, command, outbox, and publication mutations.

## Required Work

1. Prove carrier cannot directly call task report, task close, or task review.
2. Prove carrier cannot mutate inbox, execute CEIZ command, compose/approve/confirm outbox, or prepare/confirm publication.
3. Assert mocked command surfaces are not invoked and outputs contain false mutation flags and bounded refusal reasons.

## Non-Goals

- Do not execute destructive or external-effect commands.
- Do not rely on policy text without tests.
- Do not weaken canonical admission boundaries to make the proof pass.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->
- Amended by narada.architect at 2026-05-16T14:59:45.994Z: dependencies
- Added explicit bounded authority-refusal records to the Narada-native carrier work-loop closeout evidence.
- The closeout now names refused direct task lifecycle attempts for `narada task report`, `narada task close`, and `narada task review`.
- The same refusal record covers direct inbox mutation, CEIZ command execution, outbox approve/confirm, and repository publication prepare/confirm attempts.
- Each refusal records `mutation_performed: false`, `canonical_admission_required: true`, and a bounded refusal reason; the closeout also records `mocked_authority_surfaces_invoked: false`.
- Extended the work-loop negative test to assert the exact refusal surfaces, false mutation flags, canonical admission requirement, and bounded refusal reasons.

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->
- `node --test tools\narada-native-carrier\work-loop.test.mjs tools\narada-native-carrier\launch-command-posture.test.mjs tools\narada-native-carrier\task-report-handoff-family.test.mjs tools\narada-native-carrier\inbox-handoff-family.test.mjs tools\narada-native-carrier\command-intent-handoff-family.test.mjs tools\narada-native-carrier\outbox-publication-handoff-families.test.mjs tools\narada-native-carrier\carrier-action-packet.test.mjs tools\narada-native-carrier\readiness.test.mjs` passed: 28 tests.

## Acceptance Criteria

- [x] Negative tests cover task, inbox, command, outbox, and publication mutation attempts.
- [x] Mocked authority-bearing surfaces are not invoked.
- [x] Outputs contain false mutation flags and bounded refusal reasons.
