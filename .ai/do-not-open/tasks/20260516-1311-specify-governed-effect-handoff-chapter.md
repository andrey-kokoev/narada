---
status: confirmed
depends_on: [1301, 1302, 1303, 1304, 1305]
closed_at: 2026-05-16T00:44:15.834Z
closed_by: narada.architect
governed_by: chapter_close:narada.architect
closure_mode: peer_reviewed
---

# Specify governed effect handoff chapter

## Chapter

D:\code\narada\.ai\do-not-open\tasks\20260516-1306-1313-narada-native-carrier-future-chapter-commissioning.md

## Goal

Create a structured build chapter for converting Narada-native carrier outputs into canonical inert task, inbox, command, outbox, or publication handoff intents.

## Context

The carrier may propose work but must not execute authority-bearing effects. Effect handoff needs canonical artifact shapes and admission boundaries.

## Required Work

1. Inspect current work-loop handoff, task report draft, command intent, inbox, outbox, and publication posture docs or code.
2. Define proposed action packet shapes for task reports, inbox submissions, command intents, outbox intents, and publication intents.
3. Specify admission commands or surfaces required after each handoff type.
4. Include tests proving direct mutation remains false and handoff artifacts are reconstructable.
5. Submit structured chapter input with ordered build tasks.

## Non-Goals

- Do not allow the carrier to execute shell commands, send outbound messages, close tasks, or publish repositories directly.
- Do not treat model output as accepted evidence without review or admission.
- Do not record raw transcripts in handoff artifacts.

## Execution Notes

- Inspected current work-loop handoff/task report draft behavior and the governing doctrines for command execution, outbox, and repository publication. The shared invariant is that carrier output is an inert proposal until a canonical surface admits it.
- Boundary decision: the carrier may compose handoff artifacts for canonical task, inbox, command, outbox, and publication surfaces. It must not execute shell commands, submit inbox/outbox items, close/report tasks, send transport effects, or publish repositories directly.

## Structured Chapter Input

Chapter: `narada-native-governed-effect-handoff`

Goal: Convert Narada-native carrier outputs into canonical inert handoff intents with explicit admission commands and reconstructable evidence.

Ordered implementation tasks:

1. `Define generic carrier action packet envelope`
   - Fields: `packet_id`, `carrier_session_id`, `action_family`, `status=inert_proposal`, `summary`, `payload_summary`, `payload_ref`, `requires_canonical_admission=true`, `raw_transcript_recorded=false`, `direct_mutation_performed=false`.
   - Verification: schema tests for all families and no-authority flags.

2. `Implement task-report handoff family`
   - Shape: task number/id, report summary, changed-file refs, verification refs, residuals, suggested `narada task report ... --report-file <draft>`.
   - Admission: `narada task report`.
   - Verification: no task lifecycle mutation occurs before operator/canonical admission.

3. `Implement inbox handoff family`
   - Shape: envelope kind, source ref, authority assertion, bounded payload summary, suggested inbox submit/import/admission surface.
   - Admission: canonical inbox submit/import/triage/promote command as appropriate.
   - Verification: no `.ai/inbox.db` status transition or envelope write occurs from the carrier wrapper.

4. `Implement command intent handoff family`
   - Shape: CEIZ `CommandRunRequest` draft with argv vector, cwd, env policy, side-effect class, timeout, output admission profile, and rationale.
   - Admission: CEIZ command-run request/admission surface.
   - Verification: no process spawn occurs; shell strings and env secrets are not persisted.

5. `Implement outbox intent handoff family`
   - Shape: target kind/ref, transport, route/capability refs, bounded payload body/ref, approval posture.
   - Admission: canonical outbox compose/approve/confirm lifecycle.
   - Verification: no transport execution, outbound send, or external mutation occurs.

6. `Implement repository publication handoff family`
   - Shape: RPIZ publication intent draft with repo root, branch, task linkage, include paths, message summary, and publication preparation command.
   - Admission: repository publication intent zone, not raw `git push`.
   - Verification: no commit/push is executed by the carrier.

7. `Add reconstruction and doctor integration`
   - Handoff artifacts are listed in readiness/supervisor doctor output by id, family, and status only.
   - Verification: reconstruction tests prove all handoff families can be rebuilt from durable JSON refs without raw transcripts.

Residuals:

- Actual CEIZ, outbox transport, and RPIZ execution remain owned by their canonical services.
- Model output is never accepted evidence until the relevant admission/review surface accepts it.

## Verification

- Inspected `tools\narada-native-carrier\work-loop.mjs` and `tools\narada-native-carrier\task-handoff.mjs` from prior steps for current inert handoff/report draft behavior.
- Inspected `docs\concepts\command-execution-intent-zone.md`.
- Inspected `docs\concepts\canonical-outbox.md`.
- Inspected `docs\concepts\repo-publication-intent-zone.md`.

## Acceptance Criteria

- [x] The proposal covers the canonical handoff families needed by Narada-native.
- [x] Each handoff family has an explicit admission boundary.
- [x] Direct mutation by the carrier remains structurally false.
- [x] The chapter is ready for governed commission.
