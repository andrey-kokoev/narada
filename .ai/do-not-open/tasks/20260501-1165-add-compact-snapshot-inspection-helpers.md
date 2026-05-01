---
status: closed
criteria_proved_by: builder
criteria_proved_at: 2026-05-01T00:43:05.347Z
criteria_proof_verification:
  state: bound
  verification_run_id: run_1777596153994_amd36w
closed_at: 2026-05-01T00:43:21.598Z
closed_by: builder
governed_by: task_close:builder
closure_mode: agent_finish
---

# Add compact snapshot inspection helpers

## Goal

Prevent context burn when inspecting task lifecycle snapshots or bulky generated evidence artifacts by routing reads through bounded summary helpers.

## Context

Source inbox envelope env_e455e0d3-e17a-45b2-a3aa-3acc2dca4f10 reports that a narrow rg over task-lifecycle-snapshot.json and related artifacts still dumped hundreds of lines, while the useful facts were small: stale roster entry, task assignment, and snapshot regeneration need.

## Required Work

1. Inventory bulky generated artifacts such as task-lifecycle-snapshot.json, exported evidence files, and mutation evidence directories that commonly cause context burn. 2. Add compact snapshot-inspection helpers or CLI output modes that summarize by count, finding, path, and suggested repair rather than raw matching lines. 3. Add guardrails or documentation for Architect loops to avoid direct rg or cat over known bulky generated artifacts. 4. Provide an escape hatch for explicit raw inspection that is opt-in and clearly marked. 5. Add regression coverage or fixtures showing a large snapshot can be queried for stale roster/assignment facts with bounded output. 6. Preserve evidence authority: helpers summarize and point to artifacts, but do not rewrite or hide source evidence.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [x] A compact helper can inspect task lifecycle snapshot or equivalent bulky artifact without dumping raw large content.
- [x] Output includes bounded facts, counts, paths, and suggested repair where applicable.
- [x] Architect-loop guidance discourages direct raw search over known bulky generated artifacts.
- [x] Raw inspection remains opt-in.
- [x] Tests or fixtures cover bounded output for a bulky snapshot query.
