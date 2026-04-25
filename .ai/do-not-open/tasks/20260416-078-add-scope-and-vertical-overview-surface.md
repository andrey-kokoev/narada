.ai/do-not-open/tasks/20260416-078-add-scope-and-vertical-overview-surface.md
# Task 078 — Add Scope and Vertical Overview Surface

## Objective
Expose the already-computed scope/vertical overview as a first-class operator page.

## Why
`buildOverviewSnapshot()` exists in backend observability, but it is not wired into the current API/UI. As a result, there is no true scope/vertical overview despite the model already existing.

## Required Changes
- Add observation endpoint(s) for overview snapshot
- Add UI page for:
  - scopes
  - active verticals per scope
  - last activity
  - work/intents/executions rollups
  - recent failures by scope/vertical
  - fact volume by vertical
- Ensure scopes and verticals are presented as distinct concepts

## Acceptance Criteria
- Operator can answer:
  - what scopes exist?
  - which verticals are active in each?
  - where are failures clustering?
  - where is recent fact intake happening?
- Overview page is backed by observation API, not internal imports
- Overview works for mailbox and non-mail verticals

## Invariant
Overview is scope-first and vertical-aware, not mailbox-first.