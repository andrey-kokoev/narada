---
status: opened
---

# Add guided lifecycle drift reconcile repair

## Goal

Provide a single guided command path for common task lifecycle split-brain cases between frontmatter, SQLite lifecycle, and terminal evidence.

## Context

Source inbox envelope env_b5db834e-12e4-48db-b24f-8f93381930db reports narada-andrey task 40 had frontmatter closed while task-lifecycle SQLite still said claimed, and the principled reconcile path was too hard to discover during Architect duty.

## Required Work

1. Inventory current task reconcile inspect, record, repair, report, review, and close paths for frontmatter versus SQLite lifecycle drift. 2. Design a guided lifecycle-reconcile command or mode that performs compact diagnosis and prints the exact next sanctioned command for common split-brain cases. 3. Support the reported case: frontmatter terminal status, SQLite nonterminal status, and terminal evidence present. 4. Ensure direct repair by stale or unknown finding id fails with better guidance that explains record-before-repair if still required. 5. Add tests or fixtures for frontmatter closed plus SQLite claimed plus terminal evidence. 6. Keep SQLite authority and canonical mutation evidence intact; do not introduce direct DB edits or direct task-file editing as repair paths.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [ ] A common frontmatter closed versus SQLite claimed split-brain case has a single guided diagnosis path.
- [ ] Output gives exact next sanctioned command rather than requiring the operator to infer record versus repair sequence.
- [ ] Terminal evidence is considered in the suggested repair path.
- [ ] Tests cover the reported lifecycle drift scenario.
- [ ] Repair preserves SQLite/evidence authority and avoids direct editing instructions.
