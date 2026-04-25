# Task 067 — Fact / Context / Work Timeline Views

## Objective
Make the live admission path visually legible.

## Required Changes
- Add timeline/detail views for:
  - facts ingested
  - facts admitted
  - contexts formed
  - work opened / superseded / resolved
- Allow drill-down from fact -> context -> work

## Acceptance Criteria
- Operator can see how a source event became schedulable work
- Replay/supersession behavior is inspectable
- Works for mailbox and non-mail verticals

## Invariant
UI must reveal kernel flow, not invent a new one