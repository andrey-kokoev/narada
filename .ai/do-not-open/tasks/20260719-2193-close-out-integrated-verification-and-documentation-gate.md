---
status: opened
depends_on: [2188, 2189, 2190, 2192]
---

# Close out: integrated verification and documentation gate

## Goal

Integrated verification of the Site-and-Agent fixes and documentation that matches shipped semantics

## Context

Integrated closure for tasks 2187-2192 (Site-and-Agent overview review findings 1-8).

## Required Work

Run the full focused verification: operator-console-contract, CLI read-model and gateway, console-server, operator-console-ui suites, and tsc. Add or extend an operator-journey test covering start, handoff, and scoped inspection on fixture data. Update docs/architecture/operator-workspace-target.md and any Sites-and-Agents docs to the shipped semantics: authority locus, atomic admission, contract invariants, durable handoff, scoped inspection, menu semantics. Confirm no unrelated worktree changes are included.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [ ] All focused suites and tsc green
- [ ] Journey test covers start, handoff, and scoped inspection
- [ ] Docs match shipped semantics and the diff contains only task-scoped files
