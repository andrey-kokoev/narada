---
status: closed
criteria_proved_by: builder
criteria_proved_at: 2026-05-01T02:45:28.828Z
criteria_proof_verification:
  state: bound
  verification_run_id: run_1777603483151_xbn86p
closed_at: 2026-05-01T02:45:51.745Z
closed_by: builder
governed_by: task_close:builder
closure_mode: agent_finish
---

# Make bind-focused canonical Site rebinding fail closed or repair correctly

## Goal

Fix the concrete failure where bind-focused accepts --runtime-locus narada but leaves builder bound ambiguously to legacy site_id narada-proper.

## Context

Operator reported that running narada operator-surface bind-focused --identity builder --runtime-locus narada returned success, but compact inspection showed identity_id builder, site_id narada-proper, runtime_locus null, binding_status ambiguous. Existing Task 1146 covers Narada proper Site id canonicalization, but this concrete failure needs a focused regression and repair path.

## Required Work

1. Reproduce the failure: bind-focused with canonical runtime locus narada must not leave identity site_id as narada-proper with runtime_locus null and ambiguous binding. 2. Identify whether the bug is identity registry canonicalization, runtime-locus alias resolution, binding projection write, stale binding cleanup, or status rendering. 3. Fix the owning operator-surface code so canonical Site narada is written and reported as canonical, while narada-proper is accepted only as legacy alias or migration input. 4. If stale narada-proper bindings exist, provide a sanctioned cleanup or migration command with bounded output and exact repair guidance. 5. Add regression coverage for builder bind-focused using --runtime-locus narada and status showing site_id narada, non-null runtime_locus, and non-ambiguous addressability. 6. Ensure the command fails closed if it cannot migrate or write the canonical binding; do not return success with ambiguous state.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [x] bind-focused --identity builder --runtime-locus narada no longer returns success while status remains ambiguous.
- [x] operator-surface status reports canonical site_id narada for Narada proper identities after migration.
- [x] Legacy narada-proper is treated only as alias or migration input, not preferred canonical output.
- [x] Stale ambiguous bindings get a sanctioned cleanup or migration path.
- [x] Focused tests cover the reported bind-focused success plus ambiguous status failure.
