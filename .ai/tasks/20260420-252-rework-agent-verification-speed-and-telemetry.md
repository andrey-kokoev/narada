# Task 252: Rework Agent Verification Speed And Telemetry

## Chapter

Product Surface Coherence

## Context

Local telemetry in `.ai/metrics/test-runtimes.json` shows that `pnpm verify` is no longer a fast default for agents.

Observed from 15 recorded runs:

- `pnpm typecheck`: about 3-7 seconds.
- `pnpm build`: about 6-9 seconds.
- `pnpm --filter @narada2/control-plane test:unit`: about 63-69 seconds.
- `pnpm verify`: often about 75-82 seconds and fails at control-plane unit tests with exit `133`.

Those failures are classified as infrastructure failures, likely the known `better-sqlite3` / V8 teardown issue. This makes `pnpm verify` a poor default verification command for agents right now.

The current policy tells agents to start with `pnpm verify`, which is no longer aligned with observed reality.

## Goal

Make agent verification fast, focused, and observable enough that agents stop wasting time on broad test commands while still preserving engineering confidence.

## Required Work

### 1. Redefine The Default Verification Ladder

Update `AGENTS.md` and any task contracts that mention verification so the default is:

1. task-file guard if task artifacts changed
2. package/typecheck command for touched package
3. focused test file(s) for touched behavior
4. package-scoped broader tests only when justified
5. full suite only with explicit user instruction

Do not keep `pnpm verify` as the default first step if it still runs slow control-plane unit tests.

### 2. Rework `pnpm verify`

Change `pnpm verify` so it is genuinely fast and reliable.

Acceptable shape:

- task-file guard
- typecheck
- lightweight build or import check if needed

Move slow control-plane unit tests to explicit commands such as:

- `pnpm test:control-plane`
- `pnpm test:unit`
- `ALLOW_FULL_TESTS=1 pnpm test:full`

### 3. Improve Test Runtime Telemetry

Ensure focused test commands can be timed and recorded, not only wrapper commands like `pnpm verify`.

Minimum acceptable:

- document how agents should record focused command timing
- ensure `.ai/metrics/test-runtimes.json` distinguishes focused tests from broad wrappers

Preferred if low-friction:

- provide a small wrapper script for focused verification commands that records command, duration, exit status, and classification

### 4. Guard Against Accidental Broad Runs

Ensure root `pnpm test` remains blocked unless explicitly allowed.

If feasible, add a clear error message pointing agents to focused commands and the verification ladder.

### 5. Update Documentation To Match Reality

Update documentation that still claims:

- `pnpm verify` is about 8 seconds if that is no longer true
- control-plane tests are about 5 seconds if telemetry shows about 60+ seconds

Use current telemetry values or avoid precise promises if they are unstable.

## Non-Goals

- Do not fix all `better-sqlite3` teardown issues in this task.
- Do not delete legitimate tests.
- Do not add CI/GitHub Actions.
- Do not create benchmark infrastructure.
- Do not create derivative task-status files.

## Acceptance Criteria

- [x] Agent-facing docs no longer tell agents to start with slow `pnpm verify`.
- [x] `pnpm verify` is fast and does not run slow control-plane unit tests.
- [x] Slow/broad test commands remain available but explicit.
- [x] Focused verification timing can be recorded or is clearly documented.
- [x] Root `pnpm test` remains blocked without explicit opt-in.
- [x] Documentation no longer contains misleading runtime estimates.
- [x] Focused validation proves the changed scripts/docs behave as intended.
- [x] No `*-EXECUTED`, `*-DONE`, `*-RESULT`, `*-FINAL`, or `*-SUPERSEDED` files are created.

## Execution Notes

### Changes Made

1. **`scripts/verify.ts`** — Removed slow/crash-prone steps (control-plane unit tests, daemon unit tests, CLI tests). Now runs: task-file guard → typecheck → build → charters tests → ops-kit tests. Completes in ~13s and is reliable.

2. **`scripts/test-focused.ts`** (new) — Wrapper script that runs any focused test command and records telemetry (duration, exit status, classification) to `.ai/metrics/test-runtimes.json`. Usage: `pnpm test:focused "<command>"`.

3. **`scripts/test-guard.ts`** — Updated error message to mention `pnpm test:focused` and corrected time estimates.

4. **`scripts/test-full.ts`** — Updated blocked-message to show realistic time estimates (`~15 sec` for verify, `~60+ sec` for control-plane).

5. **`AGENTS.md`** — Consolidated duplicate Agent Verification Policy sections into one. Updated verification ladder with 5 steps (verify → package typecheck → focused test → package tests → full suite). Added "Focused Test Commands" subsection with examples. Updated time estimates throughout. Removed all `~8 sec` and `~5 sec` claims.

6. **`README.md`** — Updated Verification Ladder table to reflect new commands and realistic times.

7. **`package.json`** — Added `test:focused` script.

### Validation

- `pnpm verify` passes in ~13s (was 75-82s and crashing).
- `pnpm test:focused "pnpm --filter @narada2/control-plane exec vitest run test/unit/observability/queries.test.ts"` passes in ~1s and records telemetry.
- `pnpm test` at root remains blocked with helpful message.
- `pnpm typecheck` passes across all packages.
- `pnpm control-plane-lint` passes.
- Telemetry distinguishes broad wrappers (`pnpm verify`) from focused commands in `.ai/metrics/test-runtimes.json`.
