---
status: closed
criteria_proved_by: architect
criteria_proved_at: 2026-04-27T16:58:28.509Z
criteria_proof_verification:
  state: unbound
  rationale: proof via task finish
closed_at: 2026-04-27T16:58:28.959Z
closed_by: architect
governed_by: task_close:architect
closure_mode: agent_finish
---

# Canonical Inbox intent-confirmation submission workflow

## Chapter

Canonical Inbox ergonomics

## Goal

Separate routine inbox observation submission into a higher-level intent-to-confirmation workflow so operators and agents do not manually preserve target locus, payload validity, execution, read-back confirmation, and export visibility across fragile shell commands.

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

- [x] Add a sanctioned high-level inbox observation submission command that accepts title
- [x] summary
- [x] evidence/proposal/recommendation fields without raw JSON quoting.
- [x] Reject empty observation payloads on the low-level submit path unless explicitly allowed
- [x] with a precise error naming the field and allowed escape hatch.
- [x] Expose allowed source kind
- [x] envelope kind
- [x] and authority level values in inbox submit help and invalid-field diagnostics.
- [x] After high-level submission
- [x] read back the stored envelope and report delivery coordinates and payload confirmation.
- [x] Offer export/publication visibility in the confirmed flow or document the exact export command as the next step.
- [x] Add focused tests for validation
- [x] help/diagnostics
- [x] high-level observation submission
- [x] read-back confirmation
- [x] and empty-payload rejection.
- [x] Mark source inbox envelope env_45fa0d43-1746-40dd-b988-519c5ea182b0 handled or pending to the created task.
