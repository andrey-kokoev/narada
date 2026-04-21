# AGENTS.md — @narada2/cloudflare-site

## Fixture Discipline

Before implementing a component that crosses an integration boundary, define
the fixture shape that will prove the boundary works. The fixture is part of
the design, not an afterthought.

### Canonical fixture shapes

| Fixture | Location | Purpose |
|---------|----------|---------|
| **SiteFixture** | `test/fixtures/site.ts` | Materialized Site with synthetic data seeded across all durable tables |
| **CycleFixture** | `test/fixtures/cycle.ts` | Bounded Cycle invocation through the actual `fetch` handler |
| **TraceFixture** | `test/fixtures/trace.ts` | Health record + cycle trace pair for operator status assertions |
| **ActFixture** | `test/fixtures/act.ts` | Decision / outbound command shape for governance boundary tests |

Each fixture must include:
- **Minimal valid state** — the smallest data set that exercises the boundary.
- **Invalid / edge-case variants** — null traces, held locks, missing auth, etc.
- **Integration assertions** — prove the real handler/DO/runner interaction, not
  just mocked unit behavior.

### Rules

1. Fixture factories live in `test/fixtures/` and are importable by later chapters.
2. Integration tests call the actual `fetch` handler, DO methods, or runner
   function — never inline copies of production logic.
3. Backfill fixtures when a boundary is found untested; do not wait for a
   dedicated "integration test" task.
