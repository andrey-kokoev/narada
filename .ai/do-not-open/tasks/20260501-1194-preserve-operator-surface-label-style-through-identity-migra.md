---
status: closed
criteria_proved_by: builder
criteria_proved_at: 2026-05-01T20:04:44.420Z
criteria_proof_verification:
  state: bound
  verification_run_id: run_1777665865710_632321
closed_at: 2026-05-01T20:05:36.529Z
closed_by: builder
governed_by: task_close:builder
closure_mode: agent_finish
---

# Preserve operator-surface label style through identity migration

## Chapter

operator-surface-label-projection-hardening

## Goal

Prevent operator-surface identity migrations from silently losing role-affinity label styling.

## Context

Inbox envelope env_0d0e1658-50cd-470e-a954-f50c9c276521 reports that after narada-andrey migrated the architect identity to narada-andrey.Kevin, the newer identity_id/site_id/role record lacked label_projection.style. The label builder preserved semantic role extraction but fell back to default grey instead of the architect fuchsia role color.

## Required Work

Define and implement label styling inheritance for operator-surface identity records: explicit identity style first, then role or Site registry style, then declared default with diagnostic. Update the label projection builder so newer schema identities inherit role affinity color when label_projection.style is absent. Add diagnostics for visible role projections that use default styling because no explicit or inherited role style was available.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [x] New-schema identities with a known role inherit the configured role affinity color when explicit label_projection.style is absent.
- [x] The label projection path emits a bounded diagnostic when a visible role projection falls back to default styling.
- [x] A migration fixture from role-named identity to named-agent identity preserves role color.
- [x] The narada-andrey.Kevin architect-style case is covered by a regression or fixture-level check.
- [x] The implementation does not make label projection authoritative for identity or role admission.
