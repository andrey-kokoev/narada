.ai/tasks/20260416-097-tighten-package-boundaries-for-mailbox-runtime.md

# Task 097 — Tighten Package Boundaries for Mailbox Runtime

## Objective
Make mailbox runtime boundaries structurally obvious at module/package level.

## Why
Even after type/API cleanup, a repo can still drift if mail-local runtime pieces remain interleaved with generic ones in ways that are easy to misuse.

## Required Changes
- Review whether remaining mailbox runtime code should move into more explicit paths/modules, such as:
  - `foreman/mailbox/*`
  - `charter/mailbox/*`
  - `runtime/mailbox/*`
- Where full extraction is too heavy, add narrower adapter modules and import boundaries
- Add lint/guardrails preventing generic modules from importing mailbox runtime helpers directly

## Acceptance Criteria
- Mailbox runtime code is more visibly concentrated
- Generic modules cannot casually depend on mailbox runtime helpers
- Import topology reflects actual ontology

## Invariant
Module topology should reveal architectural boundaries without requiring lore.