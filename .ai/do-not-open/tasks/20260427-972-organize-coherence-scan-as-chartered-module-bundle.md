---
status: closed
criteria_proved_by: architect
criteria_proved_at: 2026-04-27T14:19:13.580Z
criteria_proof_verification:
  state: unbound
  rationale: Organized coherence scan as an explicit charter-module bundle. The scan now supports selectable modules (operational, semantic, telos, documentation, all), tags each finding with its module, and documents scope/invariants/evidence/false-positive/output/severity/cooldown/max-findings policy. Telos preservation is represented as a module under the event-summoned coherence umbrella rather than a separate resident agent. Focused tests cover module selection, module tagging, invalid module rejection, dry-run, explicit inbox submission, and dedupe. Live all-module scan returned zero findings after snapshot refresh; pnpm verify passed.
closed_at: 2026-04-27T14:19:18.552Z
closed_by: architect
governed_by: task_close:architect
closure_mode: operator_direct
---

# Organize coherence scan as chartered module bundle

## Chapter

Coherence Agent Umbrella

## Goal

Make the coherence agent umbrella Narada-compliant by representing it as a bounded event-summoned scan bundle with explicit charter modules for operational, semantic, telos, and documentation coherence.

## Context

<!-- Context placeholder -->

## Required Work

1. TBD

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [x] coherence scan exposes explicit selectable modules
- [x] findings identify their charter module
- [x] documentation defines module scope
- [x] invariants
- [x] evidence
- [x] false-positive posture
- [x] output kind
- [x] severity
- [x] cooldown
- [x] and max findings policy
- [x] telos preservation is represented as a charter module under the coherence umbrella
- [x] not a separate resident agent
- [x] focused tests cover module selection and dry-run/submission behavior
