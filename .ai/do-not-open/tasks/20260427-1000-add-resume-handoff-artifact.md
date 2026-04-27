---
status: closed
depends_on: [998]
amended_by: architect
amended_at: 2026-04-27T21:49:41.992Z
criteria_proved_by: architect
criteria_proved_at: 2026-04-27T22:58:30.668Z
criteria_proof_verification:
  state: unbound
  rationale: proof via task finish
closed_at: 2026-04-27T22:58:31.189Z
closed_by: architect
governed_by: task_close:architect
closure_mode: agent_finish
---

# Add resume handoff artifact

## Chapter

resume-continuity-implementation

## Goal

Add an optional resume handoff artifact so another agent/tool/session can recover the same continuity brief without trusting chat memory.

## Context

Resume continuity should preserve durable trace. A handoff artifact lets a later agent hydrate from a bounded, inspectable brief rather than a lossy chat summary or a tool process state.

## Required Work

1. Add an option to write a resume handoff artifact under a governed path.
2. Include brief digest, locus, agent, generated_at, source command, next action, and bounded references to task/inbox/chapter state.
3. Make the artifact read-only input for later tool hydration.
4. Add stable digest behavior so repeated identical briefs are recognizable.
5. Add tests for artifact creation, digest stability, and no task/inbox mutation.

## Non-Goals

- Do not store unbounded transcripts.
- Do not make handoff artifacts authoritative task state.
- Do not launch tools from artifact creation.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [x] `narada resume` can write a bounded handoff artifact under a governed path.
- [x] Artifact records brief digest, locus, next action, generated_at, principal, and source command.
- [x] Artifact is read-only input for later hydration and does not mutate task/inbox state.
- [x] Tests cover artifact creation and stable digest behavior.
- [x] `pnpm verify` passes.
