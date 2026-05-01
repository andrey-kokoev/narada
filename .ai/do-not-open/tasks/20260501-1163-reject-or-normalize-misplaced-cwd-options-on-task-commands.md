---
status: opened
---

# Reject or normalize misplaced cwd options on task commands

## Goal

Prevent task commands from silently inspecting or mutating the wrong Site when --cwd appears after positional arguments or is otherwise ignored.

## Context

Source inbox envelope env_47d8a086-defb-4a41-8c4f-d282cd889433 reports task evidence inspect 40 --cwd /mnt/c/Users/Andrey/Narada returned Narada proper task 40 instead of the intended User Site task because --cwd placement after the positional argument was not honored.

## Required Work

1. Inventory task command parsers for options that may be ignored or misapplied when placed after positional arguments. 2. Make --cwd position-invariant where feasible, or fail closed when --cwd appears in a position the parser cannot honor. 3. Add authority-locus readback to relevant task inspection outputs so wrong-Site results are easier to detect. 4. Add tests for task evidence inspect and at least one other task command with --cwd before and after positional arguments. 5. Ensure failures include exact corrected command shape. 6. Preserve command-only task authority: do not recommend direct file or SQLite inspection as the repair path.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [ ] Misplaced --cwd cannot silently inspect Narada proper when another Site was intended.
- [ ] Task evidence inspect handles --cwd position safely or rejects with repair guidance.
- [ ] Relevant task outputs include enough locus identity to detect cross-Site confusion.
- [ ] Tests cover the reported wrong-Site scenario.
- [ ] Repair guidance gives exact sanctioned command syntax.
