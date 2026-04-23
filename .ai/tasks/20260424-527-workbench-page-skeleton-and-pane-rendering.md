---
status: opened
created: 2026-04-24
depends_on: [526]
---

# Task 527 - Workbench Page Skeleton And Pane Rendering

## Goal

Build the static browser workbench page with the canonical 2×4 layout and pane rendering over the new HTTP adapter.

## Required Work

1. Implement the canonical layout:
   - row 1: `a1`, `a2`, `architect` spanning columns 3–4
   - row 2: `a3`, `a4`, `a5`, `a6`
2. Render the agent-pane read surfaces defined in Task 523.
3. Render the architect-pane read surfaces defined in Task 523.
4. Keep the page bounded: static HTML/CSS/JS, polling-based refresh, no new authority surface.
5. Add focused tests for pane-field extraction/rendering where practical.

## Acceptance Criteria

- [ ] Static workbench page exists.
- [ ] Canonical layout is implemented.
- [ ] Agent and architect panes render governed read data.
- [ ] Page remains bounded to static + polling v0 scope.
- [ ] Verification or bounded blocker evidence is recorded.

