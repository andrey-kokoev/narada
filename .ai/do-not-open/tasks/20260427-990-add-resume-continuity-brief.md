---
status: closed
criteria_proved_by: architect
criteria_proved_at: 2026-04-27T21:42:21.317Z
criteria_proof_verification:
  state: unbound
  rationale: proof via task finish
closed_at: 2026-04-27T21:42:21.802Z
closed_by: architect
governed_by: task_close:architect
closure_mode: agent_finish
---

# Add resume continuity brief

## Chapter

continuity-recovery

## Goal

Add a read-only narada resume operator that resumes inhabited work from durable traces by producing a bounded continuity brief before any tool hydration.

## Context

Inbox envelope `env_3566287a-852e-45f8-849e-8e47d4d48da4` captured the desired semantics: `narada resume` should resume inhabited work from durable traces, not resume a tool process. Tool hydration such as Codex belongs after a read-only continuity brief exists.

## Required Work

1. Add a read-only `narada resume --agent <id>` CLI surface.
2. Include current locus/repo posture, bounded dirty state, next task/review/inbox work via read-only peek, and next action.
3. Add `--with codex` as advisory tool hydration only; do not launch the tool.
4. Document the product contract and authority posture.
5. Add focused tests proving resume is read-only and hydration is advisory.
6. Archive or otherwise govern the source inbox envelope.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [x] narada resume reports locus
- [x] repo posture
- [x] dirty state
- [x] next work
- [x] inbox/task continuity
- [x] and explicit next action without claiming work.
- [x] narada resume --with codex keeps tool hydration advisory and separate from the continuity brief.
- [x] Tests cover read-only resume behavior and advisory tool hydration.
- [x] The source inbox envelope is archived or otherwise governed.
- [x] pnpm verify passes.
