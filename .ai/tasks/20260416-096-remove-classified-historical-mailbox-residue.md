.ai/tasks/20260416-096-remove-classified-historical-mailbox-residue.md

# Task 096 — Remove Classified Historical Mailbox Residue

## Objective
Delete the remaining mail-default runtime/control residue that Task 094 classifies as historical rather than essential.

## Why
Once residue is classified, leaving removable pieces in place serves no purpose and keeps the repo easier to misread.

## Required Changes
- Remove or rename any remaining historical mailbox-default concepts in:
  - comments
  - variable names
  - helper names
  - intermediate types
  - runtime/policy wording
- Replace with neutral terms where the code is generic
- Update tests accordingly
- Do not remove mail-essential behavior identified in Task 094

## Acceptance Criteria
- All items classified as historical residue are either removed or neutralized
- Shared runtime/control code no longer defaults to mailbox mental models
- Tests pass

## Invariant
Historical convenience is not a valid reason to keep arbitrary ontology in generic code.