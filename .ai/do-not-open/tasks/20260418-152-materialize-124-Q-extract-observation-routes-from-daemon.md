# Task 152: Materialize 124-Q Extract Observation Routes From Daemon

## Source

Derived from Task 461-Q in `.ai/do-not-open/tasks/20260418-461-comprehensive-semantic-architecture-audit-report.md`.

## Why

Observation routing mixed directly into daemon makes the observation surface harder to reason about and evolve.

## Goal

Extract observation routes into a dedicated module or package with a clearer read-surface boundary.

## Deliverables

- observation routes moved out of the daemon core file(s)
- route ownership clearer in package/module structure
- behavior unchanged but boundary clearer

## Definition Of Done

- [x] observation routes no longer live as an ad hoc daemon lump
- [x] extracted module/package has a clear responsibility boundary
- [x] tests continue to pass against the extracted surface

## Execution Notes

### What was done

Created `packages/layers/daemon/src/observation/` directory and moved the HTTP observation/control surface into it:

- `observation-routes.ts` — read-only GET endpoints under `/scopes/...`
- `observation-server.ts` — server lifecycle, `ObservationApiScope`, request dispatch
- `operator-action-routes.ts` — audited POST endpoints under `/control/...`
- `operator-actions.ts` — action implementation with safelist enforcement
- `routes.ts` — shared `RouteHandler` interface

### Import updates

- `src/service.ts`: `./observation-server.js` → `./observation/observation-server.js`
- `src/observation/observation-server.ts`: `./lib/logger.js` → `../lib/logger.js`, `./service.js` → `../service.js`
- `src/observation/operator-actions.ts`: `./service.js` → `../service.js`
- `test/unit/observation-server.test.ts`: updated import path
- `test/unit/authority-guardrails.test.ts`: updated import paths and file path constants

### Responsibility boundary

The `observation/` directory now owns the entire HTTP API surface:
- **Read surface**: `observation-routes.ts` — GET-only, *View store interfaces
- **Control surface**: `operator-action-routes.ts` + `operator-actions.ts` — audited POST, safelisted actions
- **Server lifecycle**: `observation-server.ts` — route assembly, namespace separation (`/scopes` vs `/control`), method enforcement

This is documented in the header comment of `observation-server.ts`.

## Verification

- `pnpm --filter=@narada2/daemon typecheck` — passes
- `pnpm --filter=@narada2/daemon build` — passes
- `test/unit/observation-server.test.ts` — 54 tests passed
- `test/unit/authority-guardrails.test.ts` — 15 tests passed

Note: `test/integration/dispatch-real.test.ts` has a pre-existing flaky failure ("expected spy to be called 1 times, but got 4 times") unrelated to observation extraction — it does not reference any observation code.
