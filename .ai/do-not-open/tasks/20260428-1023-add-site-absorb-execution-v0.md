---
status: closed
closed_at: 2026-04-28T03:58:48.328Z
closed_by: architect
governed_by: task_close:architect
closure_mode: operator_direct
---

## Goal
Add a governed v0 Site absorption execution command that turns an approved absorb intent into durable plan, relation, and lineage artifacts without collapsing authority or manually editing Site configs.

## Required Work
1. Add `narada sites lifecycle execute absorb` or equivalent command with dry-run default and explicit `--execute` mutation.
2. Require source Site, target Site, authority mode `admission_review`, principal, and evidence refs; accept admitted material and retained-authority notes.
3. On execute, write a transformation plan artifact, a `site.absorbed` lineage event artifact, and Site relation ledger records (`absorbed` and `absorbed_by`) using the existing relation registry.
4. Refuse unsupported lifecycle kinds or authority modes and report no authority transfer/config mutation in v0.
5. Add docs and focused tests for dry-run, execute/read-back artifacts, relation validation, and unsupported mode refusal.
6. Archive the corrected source inbox observation and the superseded malformed observation after completion.

## Acceptance Criteria
- A sanctioned CLI command exists for executing absorb v0 without raw config editing.
- Dry-run reports the plan and `mutation_performed: false`.
- Execute writes durable plan, lineage event, and reciprocal relation records, then read-back confirms their paths/ids.
- Command refuses non-`admission_review` authority mode for absorb v0.
- Docs state v0 does not transfer authority or mutate Site configs.
- Focused tests and `pnpm verify` pass.

## Source Observations
- `env_197759ff-101f-4a00-9ffb-0c86740a1515`: corrected proposal for executing Site absorb command.
- `env_f75fbd9e-131e-4a76-a05a-ec74ed49148a`: malformed earlier proposal, superseded by corrected envelope.

## Execution Notes

<!-- Record what was done, decisions made, and files changed. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->
