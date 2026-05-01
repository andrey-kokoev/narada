---
status: opened
---

# Split slow role-loop verification from work-next test file

## Goal

Make small role-loop guidance changes verify quickly without requiring the slow full work-next command test file.

## Context

Source inbox envelope env_fc25705d-68b1-4b9d-9290-5beada0d7e57 reports Task 1160 verification passed but took about 49.6 seconds because the focused TIZ command had to run work-next.test.ts plus role-loop.test.ts, creating false stoppage pressure.

## Required Work

1. Inventory role-loop and work-next test coverage to find why Architect review identity behavior depends on the slow work-next test file. 2. Split or add a faster focused regression for Architect review identity path that exercises command logic without full work-next fixture cost. 3. Keep a slower integration test only where it proves integration behavior that cannot be covered by the focused test. 4. Update TIZ or verification guidance to show expected duration or bounded progress for known slow test files. 5. Preserve the behavior from Task 1160: Architect coordination is not review authority, and operator or reviewer identity should be surfaced for review commands. 6. Record before/after verification duration or a bounded performance expectation.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [ ] A fast focused test covers Architect review identity path without running the full slow work-next file.
- [ ] The slower work-next test remains only for integration coverage that needs it.
- [ ] TIZ or verification output/guidance reduces false stall interpretation for known slow files.
- [ ] Task 1160 behavior remains covered.
- [ ] Verification records runtime or expected duration improvement.
