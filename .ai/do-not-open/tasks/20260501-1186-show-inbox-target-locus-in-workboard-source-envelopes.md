---
status: opened
---

# Show inbox target locus in workboard source envelopes

## Chapter

operator-surface-handoff-ergonomics

## Goal

Make workboard compact output preserve directed inbox target_locus so agent-directed handoffs remain observable.

## Context

Inbox envelope env_faf487ee-2d1a-4bec-8d36-b6550dbd352d reports that narada-andrey submitted an inbox observation with --target-locus narada-andrey.Bob, but task workboard compact source_envelopes displayed target: null. Submit response had routing.target_locus, so workboard loses directed-message observability.

## Required Work

Persist or project target_locus into the portable envelope or canonical routing field consumed by workboard; update compact workboard source_envelopes to show directed message targets; add regression coverage for target_locus visibility.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [ ] Inbox submit target_locus is available to downstream workboard/read-model consumers.
- [ ] task workboard compact source_envelopes shows the target locus for directed inbox messages.
- [ ] The fix avoids debug/full-payload dependence for directed-message observability.
- [ ] Tests cover a submitted envelope with target_locus and workboard compact output preserving it.
