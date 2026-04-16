# Task 065 — Observation API Surface

## Objective
Expose the observation plane through a stable API for UI consumption.

## Required Changes
- Add read-only API endpoints or equivalent adapter for:
  - scopes
  - recent facts
  - contexts
  - open/leased/executing work
  - intents by status
  - execution lifecycle
  - recent failures
  - workers
- Preserve reconstructibility from durable state

## Acceptance Criteria
- UI can fetch all core control-plane views without touching internals directly
- API is read-only
- Tests cover representative queries

## Invariant
Observation remains non-authoritative