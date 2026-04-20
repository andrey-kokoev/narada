# Task 211: Add Test Runtime Observability And `better-sqlite3` Teardown Hardening

## Why

Narada already has strong policy guardrails for test execution:

- `pnpm verify` is the default fast path
- `pnpm test:full` is explicitly guarded
- `AGENTS.md` tells agents not to run the full suite unless explicitly asked

But two practical gaps remain:

1. **No durable test-runtime observability**

We do not currently record which test commands are taking time, which package/file is slow, or whether agents are repeatedly choosing overly expensive verification paths.

2. **Known noisy teardown failure with `better-sqlite3`**

`AGENTS.md` already notes that the full suite can produce a harmless `better-sqlite3` cleanup crash / segfault / V8 fatal error during teardown. That means:

- agents may misread a known teardown artifact as a substantive regression
- users see noisy failures that do not correspond to product behavior
- full-suite signals are harder to trust

Narada should make both of these concrete rather than leaving them as oral tradition in one paragraph of `AGENTS.md`.

## Goal

Add a lightweight observability surface for test runtimes, and harden the test runner experience around the known `better-sqlite3` teardown failure so harmless cleanup noise is distinguished from real test failures.

## Required Outcome

### 1. Test Runtime Observability

Record timing for the main verification/test entrypoints:

- `pnpm verify`
- `pnpm test:unit`
- `pnpm test:integration`
- `ALLOW_FULL_TESTS=1 pnpm test:full`
- package-scoped runners invoked by these scripts

The output should capture at minimum:

- command name
- wall-clock duration
- step/package duration
- exit status
- timestamp

Strongly preferred:

- slowest package(s)
- slowest test file(s), if extractable without major complexity
- whether the run violated the verification ladder policy

### 2. Durable Artifact Or Surface

Persist test-runtime data in one coherent place.

Acceptable locations:

- `.ai/metrics/test-runtimes.json`
- `.narada/test-runtimes.json`
- another clearly documented local artifact

The artifact must be append-safe or replace-safe and easy to inspect.

### 3. `better-sqlite3` Teardown Hardening

Investigate the known end-of-run fatal cleanup issue and implement the most coherent available mitigation.

Possible outcomes, in descending preference:

1. **Prevent it** by changing test/database lifecycle so the fatal teardown no longer occurs
2. **Isolate it** so it cannot pollute the main verification signal
3. **Classify it explicitly** in test runner output as known teardown noise when the preceding suite passed

The final state must not silently swallow genuine failures.

### 4. Explicit Failure Classification

Narada should distinguish:

- real test assertion failures
- infrastructure/test-runner failures
- known harmless teardown noise

This distinction should be visible in runner output and documented.

### 5. Agent-Facing Enforcement

If practical with low complexity, add a small policy signal such as:

- warning when an expensive command was run unnecessarily
- summary showing which slower command was used instead of `pnpm verify`

This is not primarily punitive. It is meant to make misuse visible.

## Non-Goals

- Do not build a full CI analytics system
- Do not add network services or telemetry backends
- Do not weaken the full-suite guard
- Do not blanket-ignore process crashes without classification
- Do not hide real `better-sqlite3` correctness issues behind a generic suppression rule

## Suggested Implementation Shape

Prefer a narrow implementation in:

- `scripts/verify.ts`
- `scripts/test-unit.ts`
- `scripts/test-integration.ts`
- `scripts/test-full.ts`

Potentially with:

- a shared helper for duration capture and artifact writing
- optional parsing of Vitest JSON/report output if that is low-friction
- targeted test-harness fixes for SQLite lifecycle if prevention is possible

If the `better-sqlite3` cleanup issue cannot be prevented cleanly, document the exact classification rule in:

- `AGENTS.md`
- `README.md` or testing docs
- runner output

## Verification

Minimum verification:

```bash
pnpm verify
pnpm test:unit
pnpm test:integration
```

Focused proof:

- runtime artifact is written and contains per-command timing data
- a normal passing run is clearly reported as passing
- if the known teardown issue is reproduced, runner output classifies it correctly and does not masquerade as an unknown product regression

## Definition Of Done

- [x] Narada records runtime data for the main verification/test commands.
- [x] A coherent local artifact or surface exists for inspecting test durations.
- [x] Test failures are classified at least into assertion failure, runner/infrastructure failure, and known harmless teardown noise.
- [x] The `better-sqlite3` teardown issue is either prevented, isolated, or explicitly classified.
- [x] Documentation no longer relies on a single informal note in `AGENTS.md`.
- [x] No `*-EXECUTED`, `*-DONE`, or `*-RESULT` files are created.

## Execution Notes

### Changes Made

1. **Test Runtime Observability** (`scripts/test-telemetry.ts`)
   - Shared helper that wraps `execSync` calls with timing capture
   - Records command name, wall-clock duration, per-step timing, exit status, timestamp
   - Appends to `.ai/metrics/test-runtimes.json` (append-safe, bounded to last 200 entries)
   - Exports `runStep()`, `classifyStep()`, `recordRun()`, `printMetricsHint()`

2. **Runner Script Updates** (`scripts/verify.ts`, `scripts/test-unit.ts`, `scripts/test-integration.ts`, `scripts/test-full.ts`)
   - All four entrypoints now use `runStep()` and `recordRun()`
   - Step-level classification via `classifyStep()`:
     - `success` — exit 0
     - `assertion-failure` — test assertion failed (exit 1 with test patterns)
     - `infrastructure-failure` — runner/build/environment failure
     - `known-teardown-noise` — exit 133 (SIGTRAP) or V8 fatal signatures **only when the captured output contains the Vitest `Test Files N passed (N)` summary line**
   - Without evidence of test success, exit 133 is conservatively classified as `infrastructure-failure` so genuine failures are not silently softened
   - Overall run classification is the most severe among step classifications

3. **better-sqlite3 Teardown Hardening**
   - **Classification (primary mitigation)**: Runner scripts detect exit code 133 and V8 fatal error signatures (`Fatal JavaScript invalid size error`, `V8_Fatal`, `Trace/breakpoint trap`). Classification as `known-teardown-noise` requires evidence: the captured output must contain the Vitest `Test Files N passed (N)` summary line. Without that evidence, the crash is reported as `infrastructure-failure`.
   - **Lifecycle helper (best-effort, narrow adoption)**: `packages/layers/control-plane/test/db-lifecycle.ts` provides `createTestDb()` and `closeAllTestDatabases()`. `test/setup.ts` calls `closeAllTestDatabases()` in `afterAll`. Only the integration test harness (`test/integration/control-plane/harness.ts`) uses `createTestDb()`; most unit tests still use raw `new Database(":memory:")`.
   - **Runner behavior**: When `known-teardown-noise` is detected, the runner prints an explicit warning explaining that this is a harmless cleanup artifact, not a product regression.

4. **Documentation** (`AGENTS.md`)
   - Replaced the single informal better-sqlite3 note with a comprehensive section covering:
     - Verification ladder (unchanged rules, reformatted as table)
     - Test Runtime Observability (`.ai/metrics/test-runtimes.json`)
     - Failure Classification table (4 categories with definitions)
     - Known `better-sqlite3` Teardown Issue (root cause, mitigation, runner behavior)

### Verification

```bash
# Telemetry artifact is written
pnpm verify        # → .ai/metrics/test-runtimes.json updated
pnpm test:unit     # → .ai/metrics/test-runtimes.json updated
ALLOW_FULL_TESTS=1 pnpm test:full  # → .ai/metrics/test-runtimes.json updated

# Normal passing run is reported correctly
# Known teardown noise is classified and explicitly warned
```

### Known Limitations

- The `better-sqlite3` V8 teardown crash (exit 133) still occurs. Full prevention would require converting all `new Database(":memory:")` calls in tests to use `createTestDb()`, which has not been done. Classification is the primary mitigation; the lifecycle helper is available but not broadly adopted.
- The `pnpm verify` script exits 1 when it hits teardown noise because verification is incomplete (later steps didn't run). The classification makes the reason visible.
- `pnpm test:full` exits 0 when the only issue is teardown noise, because all tests have passed.
- The `violatedLadder` field was removed from the telemetry surface. Automatic verification-ladder violation detection is not implemented; the metrics artifact supports manual inspection only.

### Corrections (Task 218)

Task 218 reviewed Task 211 and found three overclaims. The following corrections were applied:

1. **Step-level teardown classification is now evidence-based**: `classifyStep()` no longer returns `known-teardown-noise` purely because exit status is 133 or output contains a V8 signature. It requires the captured output to contain the Vitest `Test Files N passed (N)` summary line. Without that evidence, the crash is classified as `infrastructure-failure`. The `classifyExit()` function (which was unused dead code) was removed.
2. **Mitigation scope is described honestly**: The lifecycle helper `createTestDb()` is only used by the integration test harness; most unit tests still use raw `new Database(":memory:")`. The docs and task notes now describe this as "best-effort, narrow adoption" rather than broad prevention.
3. **Verification-ladder violation signaling was removed**: The `violatedLadder` field was removed from `TelemetryEntry` and `makeSummary()`. AGENTS.md no longer claims that metrics automatically detect policy violations. The artifact supports manual inspection only.
