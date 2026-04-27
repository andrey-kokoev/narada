---
status: closed
amended_by: architect
amended_at: 2026-04-27T21:49:40.911Z
criteria_proved_by: architect
criteria_proved_at: 2026-04-27T22:48:24.551Z
criteria_proof_verification:
  state: unbound
  rationale: proof via task finish
closed_at: 2026-04-27T22:48:24.975Z
closed_by: architect
governed_by: task_close:architect
closure_mode: agent_finish
---

# Enrich resume brief from durable traces

## Chapter

resume-continuity-implementation

## Goal

Expand `narada resume` from a minimal `work-next --peek` wrapper into a fuller continuity brief over active chapter/task, inbox deltas, lifecycle evidence, dirty files, pending decisions, and publication posture.

## Context

The v0 resume command is intentionally read-only and tool-hydration-advisory. It now needs a stronger durable-trace brief so an agent can recover the inhabited work without asking the Operator where the arc was.

## Required Work

1. Add bounded task/chapter continuity: current assigned task, open review work, open shaped chapters, and recent closed task evidence.
2. Add inbox continuity: received/handling/pending counts and top bounded next envelope summary.
3. Add repo/publication continuity: branch/upstream, dirty file categories, unpushed commits, and publication preflight hints when available.
4. Keep JSON and human output bounded and avoid claiming work.
5. Add focused tests for dirty state, current task, inbox summary, and no mutation.

## Non-Goals

- Do not launch Codex or other tools.
- Do not claim task/inbox work.
- Do not turn resume into a long transcript dump.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [x] Brief includes active/current task, open in-review work, inbox received/handling counts, dirty file summary, branch/upstream posture, recent task evidence, and next coherent action.
- [x] Output remains bounded and has JSON and human forms.
- [x] Command remains read-only and does not claim task or inbox work.
- [x] Focused tests cover dirty state, current task, and inbox summary.
- [x] `pnpm verify` passes.
