# Task 070 — Scope and Vertical Overview

## Objective
Give operators a top-level mental model of the generalized kernel in motion.

## Required Changes
- Overview page showing:
  - scopes
  - active source families
  - recent fact counts
  - open work counts
  - active intents/executions
  - recent failures
- Distinguish verticals:
  - mailbox
  - timer
  - webhook
  - process/filesystem when present

## Acceptance Criteria
- One screen answers “what is this system doing right now?”
- Overview is generalized, not mailbox-first

## Invariant
Top-level UI must reflect kernel architecture, not legacy product framing