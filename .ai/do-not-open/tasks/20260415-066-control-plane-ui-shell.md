
# Task 066 — Control Plane UI Shell

## Objective
Create the minimal operator console shell.

## Required Changes
- Build UI shell with navigation for:
  - Overview
  - Facts
  - Contexts
  - Work
  - Intents
  - Executions
  - Workers
  - Failures
- Use existing observation API only
- No mutation controls yet except safe refresh/filter/search

## Acceptance Criteria
- Operator can navigate all major kernel layers
- UI works without mailbox-specific assumptions in the shell
- No write actions exist

## Invariant
UI shell must be vertical-neutral