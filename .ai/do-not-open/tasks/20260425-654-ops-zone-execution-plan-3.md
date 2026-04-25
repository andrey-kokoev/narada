---
status: closed
depends_on: [653]
amended_by: a2
amended_at: 2026-04-25T14:05:31.214Z
closed_at: 2026-04-25T14:05:35.239Z
closed_by: a2
governed_by: task_close:a2
---

# Task 654 — Observation Artifact Zone Execution

## Goal

Task 654 — Observation Artifact Zone Execution

## Context

CEIZ and TIZ now bound command/test output, but read-heavy CLI surfaces still vary. Some commands print large JSON or Mermaid directly, some create artifacts, and some return bounded summaries. Observation Artifact Zone should separate observation creation from observation admission.

## Required Work

1. Add `observation_artifacts` store rows or artifact registry for generated read outputs.
2. Define `ObservationArtifact` and `ObservationView`:
   - artifact type;
   - source command/operator;
   - task/agent linkage;
   - full artifact URI/path;
   - digest;
   - bounded admitted view;
   - created_at.
3. Cut over highest-risk read surfaces:
   - `task evidence list`;
   - `task graph --view` / Mermaid rendering;
   - command-run list/inspect full output paths if needed;
   - workbench diagnostics.
4. Default CLI output should be bounded view plus artifact pointer.
5. Full output requires explicit artifact inspect/open path.
6. Add focused tests proving large outputs do not dump by default and artifact metadata is durable.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

Planning completed. This task depends on Evidence Admission because evidence must be distinct from observation before observation artifacts are admitted consistently.
- Amended by a2 at 2026-04-25T14:05:31.214Z: checked all acceptance criteria

## Verification

Plan checked against observed giant-output failures and current CEIZ bounded-output discipline.

## Acceptance Criteria

- [x] ObservationArtifact and ObservationView are durable or artifact-addressed.
- [x] `task evidence list` no longer dumps unbounded output by default.
- [x] `task graph` supports artifact-first rendering with bounded CLI output.
- [x] Full observation output requires explicit inspect/open path.
- [x] Focused tests cover bounded default output and artifact pointer creation.


