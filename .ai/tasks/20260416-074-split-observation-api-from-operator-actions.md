.ai/tasks/20260416-074-split-observation-api-from-operator-actions.md
# Task 074 — Split Observation API from Operator Actions

## Objective
Restore the observation-plane invariant by separating read-only observation from mutation-capable operator control.

## Why
Current `observation-server.ts` serves both:
- read-only observation endpoints
- `POST /scopes/:id/actions`

That violates the intended invariant that observation remains non-authoritative.

## Required Changes
- Remove action execution endpoints from `observation-server.ts`
- Introduce a separate control endpoint surface, e.g.:
  - `control-server.ts`
  - or explicit `/control/...` module with distinct router ownership
- Keep observation endpoints strictly `GET`
- Ensure UI reads from observation surface only
- Route all mutations through the separate control surface
- Preserve `operator-actions.ts` as the single mutation admission layer

## Acceptance Criteria
- Observation server exposes no write routes
- Grep of observation server contains no `POST` handlers for control actions
- Existing safe operator actions still function through the new control surface
- Tests prove:
  - observation routes are read-only
  - action routes remain validated/audited
  - action route removal from observation server breaks no read paths

## Invariant
Observation is non-authoritative; control is explicit and separate.