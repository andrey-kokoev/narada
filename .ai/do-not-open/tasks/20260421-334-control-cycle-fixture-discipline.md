---
status: closed
depends_on: [330, 331]
---

# Task 334 — Control Cycle Fixture Discipline

## Context

The Cloudflare prototype created integration tests late (Task 328). By then, components had drifted: `cycle-entrypoint.ts` conflated `scope_id` with `site_id`, the DO schema expanded beyond its original design, and the status endpoint tests were self-contained spec tests rather than handler integration tests.

The risk is that future chapters repeat this pattern: components are built in isolation, then integrated late, then patched.

## Goal

Establish fixture discipline: define canonical fixture shapes for `Cycle`, `Site`, `Act`, and `Trace` so that integration semantics are tested before isolated components drift.

## Required Work

### 1. Define canonical fixture shapes

For each top-level object, define a minimal fixture shape that captures its integration boundary:

- **Cycle fixture** — a bounded Cycle invocation with mock Site, mock env, and assertable outcomes (health, trace, lock state)
- **Site fixture** — a materialized Site with synthetic data seeded across all durable tables
- **Act fixture** — an Act candidate (intent/decision) and its committed form (outbound command + confirmation)
- **Trace fixture** — a health record + cycle trace pair that can be read by the operator status endpoint

Each fixture shape must include:
- Minimal valid state
- Invalid / edge-case variants
- Assertions that prove integration semantics (not just unit behavior)

### 2. Create fixture templates

Produce reusable fixture factories or builders (not full test suites) that later chapters can import and extend. These should live in a dedicated fixture directory or package.

### 3. Document fixture-before-implementation discipline

Add a rule to the chapter template or AGENTS.md:

> **Fixture Discipline**: Before implementing a component that crosses an integration boundary, define the fixture shape that will prove the boundary works. The fixture is part of the design, not an afterthought.

### 4. Backfill where needed

Apply fixture discipline retroactively to the Cloudflare package where gaps exist:
- `cycle-entrypoint.ts` → needs a Cycle fixture that calls the actual fetch handler
- `GET /status` → needs a fixture that calls the actual handler with a real `Request` object
- `runCycle` → needs a fixture that proves step ordering and lock lifecycle

## Non-Goals

- Do not rewrite all existing tests.
- Do not create a generic test framework.
- Do not add fixtures for purely internal utilities.
- Do not create derivative task-status files.

## Acceptance Criteria

- [x] At least 3 canonical fixture shapes defined and documented.
- [x] Fixture templates exist and are importable by later chapters.
- [x] Fixture discipline rule is documented in chapter template or AGENTS.md.
- [x] At least one backfilled fixture proves an integration boundary in the Cloudflare package.
- [x] No existing tests were broken.

## Execution Notes

- Fixture factories created in `packages/sites/cloudflare/test/fixtures/`:
  - `mock-sqlite.ts` — MockSqlStorage / MockSqlStorageCursor backed by better-sqlite3 (extracted from duplicated inline definitions)
  - `site.ts` — `SiteFixture` with `createSiteFixture(siteId)` and seed methods for all durable tables
  - `cycle.ts` — `CycleFixture` with `createCycleFixture(siteId)` that wraps a Site fixture and invokes the real handler
  - `trace.ts` — `TraceFixture` with `createTraceFixture(overrides)` plus variant factories: `createCompleteTrace`, `createPartialTrace`, `createFailedTrace`, `createStuckTrace`
  - `act.ts` — `ActFixture` with `createActFixture(overrides)` for decision/outbound shapes
  - `coordinator-fixture.ts` — `createMockCycleCoordinator`, `createMockSiteCoordinator`, `createRealCoordinator` for fast unit vs. accurate integration tests
  - `env-fixture.ts` — `createMockEnvForRunner`, `createMockEnvForHandler`, `createMockEnvForCycle` for different test contexts
  - `index.ts` — canonical re-export barrel for later chapters
- Integration boundary backfill: `test/integration/handler-integration.test.ts` exercises the actual `src/index.ts` default export through real `Request` objects for both `/status` and `/cycle`, proving auth, routing, response shape, and privacy boundaries end-to-end.
- Fixture discipline rule added to AGENTS.md "Review Checklist for Future Architecture Changes".
- All 70 tests pass across 9 test files; `pnpm typecheck` passes across all 8 workspace packages.
## Verification

Verified retroactively per Task 475 corrective audit. Task was in terminal status (`closed` or `confirmed`) prior to the Task 474 closure invariant, indicating the operator considered the work complete and acceptance criteria satisfied at the time of original closure.
