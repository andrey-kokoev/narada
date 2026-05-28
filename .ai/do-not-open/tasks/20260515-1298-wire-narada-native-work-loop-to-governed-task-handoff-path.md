---
status: confirmed
depends_on: [1288, 1289, 1290, 1291, 1292, 1293]
closed_at: 2026-05-15T23:50:02.481Z
closed_by: narada.architect
governed_by: chapter_close:narada.architect
closure_mode: peer_reviewed
---

# Wire Narada-native work loop to governed task handoff path

## Chapter

D:\code\narada\.ai\do-not-open\tasks\20260515-1294-1299-agent-carriers-stage-4-operationalization.md

## Goal

Let the Narada-native carrier consume a bounded assigned work packet and submit governed handoff evidence without directly owning task lifecycle authority.

## Context

Stage 3 proved a no-effect work loop that emitted inert handoff artifacts. Stage 4 should connect that loop to the real governed task packet and report/handoff surfaces under explicit role and capability constraints.

## Required Work

1. Add a work-packet adapter that reads a claimed or explicitly assigned task packet through governed Narada CLI/MCP surfaces.
2. Let the native loop produce a WorkResultReport draft or reviewable handoff artifact through canonical task report/request surfaces, not by editing task markdown directly.
3. Preserve interruption, closeout, and reconstruction evidence across task packet ingestion and handoff submission.
4. Add tests or fixture smoke proof showing no direct lifecycle, inbox, outbox, publication, or repository mutation occurs from inside the carrier loop.

## Non-Goals

- Do not let Narada-native autonomously claim arbitrary work-next items.
- Do not bypass Builder/Architect role capability checks.
- Do not treat adapter output as task completion without governed report admission.

## Execution Notes

- Added `tools/narada-native-carrier/task-handoff.mjs` to consume a bounded assigned task packet through the governed `narada task read --format json` CLI surface, with an injectable command runner for tests.
- Added role and capability gates: the packet must be assigned to the carrier agent when assignment is present, and `task_report_draft` capability must be granted before the loop runs.
- The handoff path runs the existing no-effect work loop and emits a `work_result_report_draft` artifact that references adapter invocation, handoff, interrupt, and closeout evidence.
- The draft names the canonical `narada task report ... --report-file <draft>` admission path, and the draft JSON carries `summary`, `changed_files`, `verification`, and residual fields accepted by the report-file reader. It does not execute report admission, edit task markdown, or mutate task lifecycle/inbox/outbox/publication/repository state.
- Added tests for bounded packet ingestion, report draft evidence refs, missing capability refusal before loop execution, wrong-agent refusal, reconstruction evidence, and no-authority behavior.
- Rejected review repair: replaced the fixture-only task reader with a default bounded Narada CLI reader and removed the invalid `--payload-file` report suggestion.

## Verification

- `node --test tools\narada-native-carrier\task-handoff.test.mjs` passed with 5 tests.
- `node --test tools\narada-native-carrier\work-loop.test.mjs` passed with 1 test.
- `node --test tools\narada-native-carrier\readiness.test.mjs` passed with 2 tests.

## Acceptance Criteria

- [x] Narada-native can read a bounded assigned task packet through governed surfaces.
- [x] The loop emits a governed handoff/report draft with durable evidence refs.
- [x] Direct task lifecycle mutation remains outside the carrier.
- [x] Tests prove role/capability gates and no-authority behavior.
