---
status: opened
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

- [ ] KB metadata supports lookup_aliases and symptoms as first-class searchable fields or an equivalent governed structure.
- [ ] KB search/find returns runbooks for symptom phrases that do not appear in canonical titles.
- [ ] CLI or documented command path exists for adding lookup aliases without manual prose editing as the primary path.
- [ ] Incident/runbook closure guidance asks what future Operator/agent search phrase should find the entry.
- [ ] Tests or fixtures cover the CPY-style parquet desync lookup alias case.
