---
status: closed
criteria_proved_by: builder
criteria_proved_at: 2026-04-30T23:13:21.557Z
criteria_proof_verification:
  state: bound
  verification_run_id: run_1777590766638_x50sxr
closed_at: 2026-04-30T23:13:36.634Z
closed_by: builder
governed_by: task_close:builder
closure_mode: agent_finish
---

# Add first-class KB lookup aliases and symptom indexes

## Goal

Make incident/runbook KB entries discoverable by operator symptom phrases, not only canonical implementation terms or body text.

## Context

Source inbox envelope env_c33e90e7-1c7c-4b5d-9ec3-1b840446f733 reports CPY production debugging where a KB entry was not findable for the likely future operator phrase 'parquet desync from class sessions on sonar.cloud' until lookup aliases were manually added.

## Required Work

1. Inventory existing KB/runbook storage, Site search, and any narada kb command surfaces. 2. Define first-class KB metadata for lookup_aliases, symptoms, systems, failure_modes, and related_runbooks, using CPY as the concrete motivating case. 3. Update search/indexing so aliases and symptom phrases participate in KB lookup without relying on body prose accidents. 4. Add CLI affordances or specify the command path for adding aliases and finding KB entries by symptom. 5. Add a lint/check or closure criterion for incident runbooks: what would the Operator or future agent search for next time? 6. Preserve Site authority boundaries: cross-Site KB ergonomics should not centralize client Site knowledge into Narada proper by convenience.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [x] KB metadata supports lookup_aliases and symptoms as first-class searchable fields or an equivalent governed structure.
- [x] KB search/find returns runbooks for symptom phrases that do not appear in canonical titles.
- [x] CLI or documented command path exists for adding lookup aliases without manual prose editing as the primary path.
- [x] Incident/runbook closure guidance asks what future Operator/agent search phrase should find the entry.
- [x] Tests or fixtures cover the CPY-style parquet desync lookup alias case.
