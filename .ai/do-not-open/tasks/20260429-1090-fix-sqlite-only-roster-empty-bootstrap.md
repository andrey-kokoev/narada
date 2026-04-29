---
status: closed
amended_by: architect
amended_at: 2026-04-29T20:25:26.393Z
criteria_proved_by: builder
criteria_proved_at: 2026-04-29T20:36:46.309Z
criteria_proof_verification:
  state: unbound
  rationale: Source patch plus focused verification: empty SQLite roster is valid; task roster add bootstraps first SQLite row without roster.json; normal load/save no longer use JSON projection; work-next returns agent_not_in_roster with repair command; JSON path isolated as importRosterJsonProjection.
closed_at: 2026-04-29T20:37:11.674Z
closed_by: builder
governed_by: task_close:builder
closure_mode: agent_finish
---

# Fix SQLite-only roster empty bootstrap

## Chapter

SQLite Roster Authority Correction

## Goal

Make empty SQLite agent_roster a valid empty roster and remove retired roster.json fallback from normal roster authority paths, while preserving explicit migration/import behavior.

## Context

Inbox envelope env_ea9ce332-63a2-4eb5-bc9a-4bfd2cd5b637 reports that Task 618 declared roster authority SQLite-only, but current roster loading still treats an empty SQLite agent_roster table as failure, falls back to retired .ai/agents/roster.json, and errors if the JSON file is absent. In the Windows User Site, narada work-next --agent narada-andrey.builder failed with roster_unavailable because task roster add also calls loadRoster first and therefore cannot bootstrap the first SQLite row in an empty SQLite-only Site.

## Required Work

1. Inspect Task 618, task-governance loadRoster/saveRoster, task roster add, task-next/work-next roster handling, and tests that still write .ai/agents/roster.json. 2. Change normal roster authority so an empty SQLite agent_roster table is a valid empty roster. 3. Make task roster add able to create the first SQLite roster row without requiring loadRoster to read retired JSON. 4. Remove .ai/agents/roster.json fallback from normal load/save/work-next authority paths, or isolate it behind an explicit migration/import operator with clear naming. 5. Make work-next for a missing agent report agent_not_in_roster or equivalent with a repair command such as narada task roster add <agent-id> rather than roster_unavailable. 6. Update docs/tests that still state roster.json is canonical or required for normal operation. 7. Add focused tests for empty SQLite roster, first roster add, missing agent work-next repair output, and absence of roster.json. 8. Run focused tests and pnpm verify or record bounded blockers.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->
- Amended by architect at 2026-04-29T20:25:26.393Z: context, required work

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [x] Empty SQLite agent_roster is treated as a valid empty roster not roster_unavailable
- [x] task roster add can create the first SQLite roster row without requiring .ai/agents/roster.json
- [x] Normal roster load/save and work-next paths do not require or trust .ai/agents/roster.json
- [x] Unknown agent work-next reports agent_not_in_roster with an exact sanctioned repair command
- [x] Any JSON roster compatibility path is explicit migration/import only and not normal authority
- [x] Source envelope env_ea9ce332-63a2-4eb5-bc9a-4bfd2cd5b637 is routed
