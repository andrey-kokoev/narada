# Task 083 — Make Control Surface Explicit

## Objective
Harden Task 074 from modular separation into explicit control-plane separation.

## Why
Task 074 successfully split read routes and action routes into separate modules, but they still coexist on the same observation server surface. That is acceptable, but not maximally clear. An explicit control surface will make authority boundaries harder to blur over time. :contentReference[oaicite:1]{index=1}

## Required Changes
- Move action routing behind an explicit control namespace, such as:
  - `/control/scopes/:scope_id/actions`
  - or a dedicated control server/listener if practical
- Keep observation namespace strictly read-only, e.g.:
  - `/scopes/...`
  - `/observation/...`
- Update UI mutation calls to target the explicit control namespace only
- Update tests so observation and control are mechanically distinguished
- Preserve `operator-actions.ts` as the sole mutation admission layer

## Acceptance Criteria
- Observation namespace contains no write endpoints
- All UI-triggered mutations target only the explicit control namespace
- Tests fail if action routes are mounted into observation namespace
- Docs and AGENTS guidance describe observation/control separation clearly

## Invariant
Read surface and control surface must be explicitly distinguishable in routing, not only by module boundaries.