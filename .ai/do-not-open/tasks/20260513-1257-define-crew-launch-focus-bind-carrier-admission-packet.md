---
status: closed
depends_on: [1256]
criteria_proved_by: narada.architect
criteria_proved_at: 2026-05-13T02:14:54.143Z
criteria_proof_verification:
  state: unbound
  rationale: proof via task finish
closed_at: 2026-05-13T02:14:54.618Z
closed_by: narada.architect
governed_by: task_close:narada.architect
closure_mode: agent_finish
---

# Define crew launch focus bind carrier admission packet

## Chapter

narada-proper-crew-launch-intent-sequences

## Goal

Define the Narada proper carrier admission packet for executing crew launch/focus/bind intents, without executing launch or mutating PC/operator-surface runtime.

## Context

Tasks 1254-1256 established launch intent sequence contracts, Narada proper .narada/crew sequence artifacts, and a read-only verifier. The remaining path to working shortcut launch intent sequences is a separately admitted external carrier/supervisor for launch/focus/bind execution. Direct substrate shortcut execution, native shell fallback, PC-locus mutation, and operator-surface runtime copying remain not admitted.

## Required Work

Create a Narada proper admission packet/surface for narada-proper.carrier.crew-launch-focus-bind.v0. It must name authority basis, target root, required input sequence schema, allowed execution phases, required preflight verification, denied execution forms, audit/evidence output, rollback/recover posture, and terminal criteria. Update crew documentation or capability descriptors only as descriptor/admission evidence. Do not execute launch, create .lnk files, start processes, mutate PC locus, or mutate/copy operator-surface runtime.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [x] Admission packet names narada-proper.carrier.crew-launch-focus-bind.v0 and separates intent verification from launch/focus/bind execution.
- [x] Packet explicitly denies direct substrate shortcut execution, native shell fallback, PC-locus mutation, operator-surface runtime copying, .lnk creation, and unadmitted process launch.
- [x] Packet defines evidence, rollback, and terminal criteria for a future carrier without executing that carrier.
- [x] Narada proper crew docs or capability descriptors point to the carrier admission packet as the next required execution surface.
- [x] Verification proves only descriptor/admission files changed and no launch side effects occurred.
