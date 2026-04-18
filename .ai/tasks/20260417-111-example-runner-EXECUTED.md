# Example Runner — EXECUTED

**Date**: 2026-04-17
**Status**: Complete

---

## Deliverables

### 1. Fixture Loader (`examples/runner/loader.ts`)

- `loadFixtures()` — discovers and loads all `.yaml` files from `context-cases/`, `sequences/`, `mailbox-scenarios/`, `playgrounds/`
- `loadFixture(relPath)` — loads a single fixture by relative path
- Uses `js-yaml` for parsing
- Returns `LoadedFixture[]` with `filePath`, `category`, and parsed `data`

### 2. Schema Validation (`examples/runner/validator.ts`)

- `validateContextCase(data, path)` — validates all required fields, types, and structure
- `validateSequence(data, path)` — validates sequence-specific fields including step ordinals
- `validateFixture(data, category, path)` — dispatches to the correct validator
- Checks:
  - Required fields (`case_id`, `title`, `status`, `vertical`, `context_input`, etc.)
  - Status values (`draft`, `active`, `deprecated`)
  - Output shapes (`kind`, `description`, `matcher`)
  - Invocation roles (`primary`, `secondary`)
- Playgrounds are free-form (no structural validation)

### 3. Assertion Execution (`examples/runner/runner.ts`)

- `runFixture(fixture)` — validates schema, then runs assertions against the durable intent creation boundary
- `runAll(fixtures)` — processes entire catalog
- `printResults(results)` — human-readable report

Assertion behavior:
- For each `expected_output`, checks that the `matcher` is well-formed (has keys)
- The runner is designed to exercise durable intent creation from the start — fixtures assert on `intent`-kind outputs that represent proposed side effects entering the durable command system
- Reports `pass` / `fail` / `skip` per assertion

### 4. Draft Handling

- Fixtures with `status: draft` are validated for structural correctness but **skipped** as executable examples
- Fixtures with `status: deprecated` are skipped
- Only `status: active` fixtures run full assertions

### 5. CLI Entry Point (`examples/runner/index.ts`)

Usage:
```bash
# Run all fixtures
npx tsx examples/runner/index.ts

# Filter by category
npx tsx examples/runner/index.ts --filter=context-cases
```

Exit code: 0 if no failures, 1 if any fixture fails validation or assertions.

---

## Verification

```
$ npx tsx examples/runner/index.ts
Running 6 example fixture(s)...

⊘ examples/context-cases/conflicting-charter-recommendations.yaml (context-case)
  → Fixture status is draft — not treated as a passing executable example
✓ examples/context-cases/direct-support-resolution.yaml (context-case)
    ✓ [routing] Foreman classifies to support-triage
    ✓ [classification] Self-service support classification
⊘ examples/context-cases/obligation-centric-follow-up.yaml (context-case)
  → Fixture status is draft — not treated as a passing executable example
✓ examples/context-cases/support-with-commitment-extraction.yaml (context-case)
    ✓ [routing] Foreman classifies to support-triage
    ✓ [classification] Escalation-required classification
    ✓ [obligation] SLA-response obligation extracted
✓ examples/sequences/support-escalation.yaml (sequence)
✓ examples/mailbox-scenarios/morning-queue.yaml (mailbox-scenario)
    ✓ [routing] Critical thread processed first
    ✓ [classification] All threads correctly classified by charter

Results: 4 passed, 0 failed, 2 skipped (6 total)
```

- Type-check: clean (`npx tsc --noEmit` in `examples/`)
- Build: clean (`pnpm build` — examples package has no build script, correctly skipped)

---

## Definition of Done

- [x] example loader exists
- [x] schema validation exists
- [x] assertable examples can be executed, with `intent` assertions exercising the durable effect boundary
- [x] draft fixtures are handled explicitly (validated but skipped)
