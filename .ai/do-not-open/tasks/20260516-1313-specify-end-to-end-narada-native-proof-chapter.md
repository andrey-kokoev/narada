---
status: confirmed
depends_on: [1301, 1302, 1303, 1304, 1305]
closed_at: 2026-05-16T00:46:37.670Z
closed_by: narada.architect
governed_by: chapter_close:narada.architect
closure_mode: peer_reviewed
---

# Specify end-to-end Narada-native proof chapter

## Chapter

D:\code\narada\.ai\do-not-open\tasks\20260516-1306-1313-narada-native-carrier-future-chapter-commissioning.md

## Goal

Create a structured build chapter for proving one Builder task can pass through Narada-native data read, intelligence invocation, inert handoff, and canonical admission.

## Context

After the component chapters, Narada-native needs an end-to-end proof that shows the carrier can do useful governed work without owning Narada authority.

## Required Work

1. Define prerequisites from the to-data, to-intelligence, orchestration, capability, session, handoff, and operator affordance chapters.
2. Specify one controlled Builder-task scenario for end-to-end proof.
3. Define evidence requirements for data read, provider invocation, handoff draft, canonical admission, review, and reconstruction.
4. Include negative tests proving the carrier cannot directly mutate task, inbox, command, outbox, or publication state.
5. Submit structured chapter input with ordered proof tasks.

## Non-Goals

- Do not run the proof before prerequisite chapters are accepted.
- Do not use private credentials or live provider calls unless explicitly capability-granted for the proof.
- Do not close the proof by transcript inspection alone.

## Execution Notes

- Defined the end-to-end proof as a final integration chapter that depends on the accepted build chapters for to-data, to-intelligence, orchestration, capability/consent, live session supervision, governed handoff, and operator launch/doctor affordances.
- Boundary decision: the proof demonstrates usefulness through canonical admission and review. The carrier itself must only produce bounded read, invocation, session, and handoff artifacts.

## Structured Chapter Input

Chapter: `narada-native-end-to-end-builder-proof`

Goal: Prove one controlled Builder task can pass through Narada-native bounded data read, intelligence invocation, inert handoff, canonical task report admission, Architect review, and reconstruction without the carrier owning Narada authority.

Prerequisites:

- To-data adapter foundation accepted and implemented.
- Provider/to-intelligence execution path accepted and implemented.
- Orchestration wrapper accepted and implemented.
- Capability and consent projection accepted and implemented.
- Live supervised session lifecycle accepted and implemented.
- Governed effect handoff families accepted and implemented.
- Operator launch and doctor affordances accepted and implemented.

Controlled scenario:

- Create or select a low-risk Builder task whose expected output is a small documentation/test fixture update with no external side effects.
- Configure Narada-native with fixture intelligence first, then optional provider-backed intelligence only when capability/consent projection is explicitly granted.
- Run the carrier through: start -> to-data read -> intelligence invocation -> inert task-report draft -> canonical `narada task report --report-file <draft>` -> Architect review -> reconstruction/doctor readback.

Ordered proof tasks:

1. `Prepare controlled Builder proof task`
   - Define task scope, acceptance criteria, and no-external-effect constraints.
   - Verification: task is claimed by Builder through normal lifecycle, not by carrier mutation.

2. `Run fixture-mode Narada-native proof`
   - Execute full wrapper in fixture mode with bounded to-data packets and inert task-report draft.
   - Verification: data read evidence, adapter invocation, handoff draft, supervisor heartbeat, closeout, and reconstruction all exist and are bounded.

3. `Admit carrier draft through canonical task report`
   - Use the suggested report-file admission command as an Operator/Builder action, not a carrier-side mutation.
   - Verification: task lifecycle mutation evidence shows `task report`; carrier evidence shows direct mutation false.

4. `Complete Architect review and closure path`
   - Architect reviews the report through `narada task review`; closure is governed by task lifecycle, not carrier artifacts.
   - Verification: review id, verdict, closure/governance fields, and reconstruction refs are recorded.

5. `Run provider-backed proof when capability is granted`
   - Repeat using one mocked or explicitly capability-granted provider projection.
   - Verification: provider invocation evidence records capability refs and summaries only; no raw provider output or secrets.

6. `Run negative authority tests`
   - Prove carrier cannot directly call task report/close/review, mutate inbox, execute CEIZ command, compose/approve/confirm outbox, or prepare/confirm publication.
   - Verification: mocked command surfaces are not invoked; output contains false mutation flags and bounded refusal reasons.

7. `Run operator doctor and reconstruction proof`
   - Operator-facing doctor reports final posture, evidence refs, provider/data/consent/runtime states, and reconstruction status.
   - Verification: doctor output is bounded and omits raw prompts, model output, transcripts, and secret values.

Evidence requirements:

- `to_data_bundle.json`
- `adapter-invocation.json` or `provider-adapter-invocation.json`
- `work-loop-handoff.json`
- `task-report-draft.json`
- supervisor start/heartbeat/close/failure evidence as applicable
- task report id, review id, closure/readback evidence
- final doctor/reconstruction output

Residuals:

- Live network provider proof requires explicit capability consent; mocked provider proof is sufficient for normal CI.
- The proof should fail closed if any prerequisite chapter is not accepted/implemented.

## Verification

- Inspected task specs 1307-1312 produced in this chapter sequence and used them as prerequisites for this proof chapter.
- Inspected current task context for required proof scope and non-goals.

## Acceptance Criteria

- [x] The proposal defines an end-to-end proof with explicit prerequisites.
- [x] The proof covers data read, intelligence invocation, inert handoff, canonical admission, and reconstruction.
- [x] Negative authority tests are included.
- [x] The chapter is ready for governed commission when prerequisites are satisfied.
