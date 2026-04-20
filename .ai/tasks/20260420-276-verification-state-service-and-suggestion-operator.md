# Task 276: Verification State Service and Suggestion Operator

## Chapter

Multi-Agent Task Governance

## Context

Narada now has test telemetry and a stricter `pnpm test:focused` guard, but agents still have to decide verification scope manually.

This causes repeated failure modes:

- agents batch too many tests and call it focused
- agents rerun broad verification because they do not know what is already fresh
- reviewers cannot quickly ask whether relevant verification is current
- telemetry is useful after the fact but not yet operational during task execution

We need a tighter mechanism, but not an always-on watcher that runs tests on every edit. With multiple agents editing concurrently, automatic test execution would create stale, noisy, and expensive churn.

## Goal

Introduce a local verification state/suggestion surface that lets agents ask:

- what verification is fresh
- what verification is stale
- what focused command is recommended for a set of changed files
- whether a proposed verification command violates policy

The first version should be explicit and bounded: suggest first, run only when asked.

## Required Work

### 1. Define Verification State Model

Create a small model for verification records and suggestions.

It should include:

- command
- files or packages covered
- started/finished time
- duration
- exit status
- classification
- freshness status
- source: telemetry, explicit run, manual record

Reuse `.ai/metrics/test-runtimes.json` as input. Do not create a second incompatible telemetry format.

### 2. Add CLI Observation Surface

Add read-only commands:

```bash
narada verify status
narada verify suggest --files <file...>
narada verify explain --task <task-number>
```

Minimum behavior:

- `status` summarizes recent verification runs and slow/outlier commands.
- `suggest --files` maps changed files to the smallest likely useful verification command.
- `explain --task` reports recent verification related to files likely touched by that task if derivable, otherwise says it cannot infer.

This surface is observation-only.

### 3. Add Explicit Run Operator

Add an explicit operator:

```bash
narada verify run --suggested <plan-id>
```

or a simpler first version:

```bash
narada verify run --cmd "<focused command>"
```

The run operator must route through the existing guarded scripts:

- `pnpm verify` for baseline checks
- `pnpm test:focused` for focused test commands

It must not bypass `scripts/test-focused.ts`.

### 4. Policy Gate Proposed Commands

Before running or recommending a command, apply the same policy as `scripts/test-focused.ts`:

- one test file by default
- multi-file requires explicit override
- package-level requires explicit override
- full suite requires explicit full-test opt-in

Avoid duplicating policy logic if practical. Extract shared command-classification helpers if needed.

### 5. File-to-Test Mapping Heuristic

Implement a conservative first mapping:

- `packages/layers/cli/src/commands/<name>.ts` → `packages/layers/cli/test/commands/<name>.test.ts` if it exists
- `packages/layers/cli/src/lib/<name>.ts` → `packages/layers/cli/test/lib/<name>.test.ts` if it exists
- `packages/layers/control-plane/src/**/<name>.ts` → same package `test/**/<name>.test.ts` if exactly one exists
- docs/task-only changes → `pnpm verify` or task-file guard only, depending on available command shape

If no confident mapping exists, suggest `pnpm verify` plus a note that focused test inference failed.

### 6. Documentation

Update agent guidance so agents prefer:

1. `narada verify suggest --files ...`
2. run the suggested command if appropriate
3. record deviations in task notes

Do not remove direct `pnpm verify` guidance; this is an assistive surface, not the only path.

## Execution Mode

Start in planning mode before editing. The plan must name:

- intended write set
- invariants at risk
- dependency assumptions
- focused verification scope

## Non-Goals

- Do not build a long-running auto-watch daemon in this task.
- Do not run tests automatically on file changes.
- Do not add an HTTP API yet.
- Do not integrate with external CI.
- Do not redesign the telemetry file format.
- Do not create derivative task-status files.

## Acceptance Criteria

- [x] Verification state model reads existing `.ai/metrics/test-runtimes.json`.
- [x] `narada verify status` reports recent runs and slow/outlier commands.
- [x] `narada verify suggest --files ...` returns a smallest-plausible command and explanation.
- [x] `narada verify run --cmd ...` routes through existing guarded scripts and records telemetry.
- [x] Proposed/run commands obey focused-test policy or require explicit override.
- [x] CLI/file mapping handles at least CLI command files and CLI lib files.
- [x] Documentation tells agents to use the verification suggestion surface before inventing broad commands.
- [x] No auto-watch behavior is introduced.
- [x] No `*-EXECUTED`, `*-DONE`, `*-RESULT`, `*-FINAL`, or `*-SUPERSEDED` files are created.

## Execution Notes

### New Files

| File | Purpose |
|------|---------|
| `packages/layers/cli/src/lib/verify-policy.ts` | Shared policy helpers: `classifyCommandScope`, `checkCommandPolicy`, `extractTestFiles` |
| `packages/layers/cli/src/lib/verification-state.ts` | State model reading `.ai/metrics/test-runtimes.json`; freshness, outlier, slowest queries |
| `packages/layers/cli/src/lib/file-to-test-mapper.ts` | Heuristic file→test mapping for CLI commands, CLI libs, and control-plane |
| `packages/layers/cli/src/commands/verify-status.ts` | `narada verify status` — recent runs, outliers, fresh/stale summary |
| `packages/layers/cli/src/commands/verify-suggest.ts` | `narada verify suggest --files` — smallest plausible command with policy check |
| `packages/layers/cli/src/commands/verify-explain.ts` | `narada verify explain --task` — infers files from task content, suggests verification |
| `packages/layers/cli/src/commands/verify-run.ts` | `narada verify run --cmd` — routes through `pnpm verify` or `pnpm test:focused` |

### Modified Files

| File | Change |
|------|--------|
| `packages/layers/cli/src/main.ts` | Added `verify` command group with `status`, `suggest`, `explain`, `run` subcommands |
| `AGENTS.md` | Added "Verification Suggestion Surface (Preferred)" section; updated verification ladder |
| `.ai/task-contracts/agent-task-execution.md` | Added "Prefer the suggestion surface first" to Verification section |

### Tests

| File | Count |
|------|-------|
| `packages/layers/cli/test/lib/verify-policy.test.ts` | 16 tests |
| `packages/layers/cli/test/lib/verification-state.test.ts` | 4 tests |
| `packages/layers/cli/test/lib/file-to-test-mapper.test.ts` | 7 tests |
| `packages/layers/cli/test/commands/verify-status.test.ts` | 2 tests |
| `packages/layers/cli/test/commands/verify-suggest.test.ts` | 2 tests |
| `packages/layers/cli/test/commands/verify-run.test.ts` | 3 tests |
| `packages/layers/cli/test/commands/verify-explain.test.ts` | 4 tests |
| **Total new** | **39 tests** |

### Corrective Follow-up

After initial implementation, the following defects were identified and fixed:

1. **Missing `narada verify explain --task`** — Added `packages/layers/cli/src/commands/verify-explain.ts` and wired it into `main.ts`. The command reads the task file, extracts file paths from task content (backtick-quoted and bare paths), maps them to test suggestions, and reports recent related verification history.

2. **`--files` CLI wiring bug** — Changed `main.ts` option declaration from `.requiredOption('--files <paths...>')` (which produces an array in Commander) to `.requiredOption('--files <paths>')` with explicit comma-split, consistent with existing CLI patterns like `--fact-ids`. This prevents `.split(',')` from being called on an array.

3. **Bogus `source` field removed** — Removed the `source: 'telemetry' | 'explicit-run' | 'manual-record'` field from `VerificationRecord` and the `deriveSource()` function. The existing telemetry format records the underlying command (e.g., `pnpm verify`), not the `narada verify run` wrapper, so the distinction was ungrounded. All telemetry entries are now treated uniformly.

### Verification
- `pnpm verify` — passes (5/5 steps)
- `pnpm --filter @narada2/cli typecheck` — passes
- `pnpm --filter @narada2/cli test` — 153/153 passes (39 new)
- `pnpm control-plane-lint` — passes
