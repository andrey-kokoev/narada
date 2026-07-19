---
status: opened
depends_on: [2191]
---

# Complete inspection interaction and accessible context-menu semantics

## Goal

The agent context menu has complete, consistent secondary-click behavior and full ARIA menu semantics

## Context

Covers finding 8 from the Site-and-Agent overview review. In packages/operator-console-ui/src/pages/SiteAgentsPage.vue the menu triggers lack aria-haspopup and aria-expanded; there is no Escape close, no focus management into or out of the menu, and no arrow-key navigation; right-click works only on the primary button; the menu is not associated with its trigger or heading (lines 134-158 and 241-256).

## Required Work

Complete the context-menu semantics: triggers expose aria-haspopup menu and aria-expanded; opening moves focus to the first enabled menuitem; Escape closes and returns focus to the invoking trigger; ArrowUp and ArrowDown cycle enabled items, Home and End jump; right-click behaves consistently across the agent cell; the menu is labeled by its agent heading; outside click and activation close it; keep the ContextMenu key and Shift+F10 path.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [ ] Tests cover open, close, focus in and out, keyboard navigation, and ARIA attributes
- [ ] Right-click is consistent across the agent cell
- [ ] Existing page tests green; tsc clean
