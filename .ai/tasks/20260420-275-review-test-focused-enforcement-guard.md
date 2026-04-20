# Task 275: Review Test-Focused Enforcement Guard

## Chapter

Multi-Agent Task Governance

## Context

Telemetry showed agents were using `pnpm test:focused` for multi-file batches and package-level test commands. One "focused" CLI batch took 74.5 seconds, which defeats the purpose of focused verification.

A guard was added to `scripts/test-focused.ts` so focused verification means one test file by default.

## Goal

Review the test-focused enforcement change for correctness, usability, and overblocking risk.

## Required Work

### 1. Inspect Guard Behavior

Review `scripts/test-focused.ts` and verify:

- one explicit `.test.ts` or `.spec.ts` file is allowed by default
- multiple test files are rejected unless `ALLOW_MULTI_FILE_FOCUSED=1`
- package-level test commands are rejected unless `ALLOW_PACKAGE_FOCUSED=1`
- full-suite commands are rejected even when wrapped in `pnpm test:focused`
- rejected preflight attempts are recorded in `.ai/metrics/test-runtimes.json`

### 2. Inspect Guidance

Review `AGENTS.md` and `README.md` and verify:

- focused verification is described as single-file by default
- override variables are documented
- guidance does not normalize broad or repeated test runs

### 3. Check Edge Cases

Look for obvious overblocking or underblocking cases, especially:

- test paths with `.spec.ts`, `.test.tsx`, `.spec.tsx`, `.test.mts`, `.test.cts`
- commands using `vitest run path/to/file.test.ts`
- commands using `pnpm --filter <pkg> test`
- commands using `pnpm test:full` or `ALLOW_FULL_TESTS=1`

If a small correction is needed, apply it directly and update this task file.

If the guard needs a larger redesign, create a corrective task instead of expanding this task.

## Execution Mode

Proceed directly. This is a narrow review/correction task; use focused edits only.

## Non-Goals

- Do not run broad test suites.
- Do not change the telemetry file format.
- Do not redesign the verification ladder.
- Do not create derivative task-status files.

## Acceptance Criteria

- [x] Single-file focused commands remain allowed.
- [x] Multi-file focused commands fail without override.
- [x] Package-level focused commands fail without override.
- [x] Full-suite commands cannot be hidden inside `pnpm test:focused`.
- [x] Documentation matches actual guard behavior.
- [x] Any correction is documented in this task file. (no corrections needed)
- [x] No `*-EXECUTED`, `*-DONE`, `*-RESULT`, `*-FINAL`, or `*-SUPERSEDED` files are created.

## Execution Notes

### Guard Behavior Verified

| Case | Command | Result |
|------|---------|--------|
| Single file | `pnpm test:focused "pnpm --filter @narada2/control-plane exec vitest run test/unit/ids/event-id.test.ts"` | Allowed, runs and records telemetry |
| Multi-file | `pnpm test:focused "... event-id.test.ts event-id.test.ts"` | Rejected with file count and names |
| Package-level | `pnpm test:focused "pnpm --filter @narada2/charters test"` | Rejected with package-level message |
| Full-suite | `pnpm test:focused "pnpm test:full"` | Rejected with full-suite message |
| Override multi-file | `ALLOW_MULTI_FILE_FOCUSED=1 pnpm test:focused "..."` | Allowed |
| Override package | `ALLOW_PACKAGE_FOCUSED=1 pnpm test:focused "..."` | Allowed |
| Full-suite package | `pnpm test:focused "pnpm test:control-plane"` | Rejected (caught by `\bpnpm\s+test\b` matching `test:` prefix) |

### Edge Cases Checked

- **Test extensions**: regex `/\S+\.(?:test|spec)\.[cm]?[tj]sx?/g` correctly matches `.test.ts`, `.spec.ts`, `.test.tsx`, `.spec.tsx`, `.test.mts`, `.test.cts`, `.test.mjs`, `.test.cjs`, etc.
- **Vitest direct**: `vitest run path/to/file.test.ts` — `testFileCount=1`, allowed.
- **Directory run**: `vitest run test/unit` — `testFileCount=0`, `looksLikePackageTest=true`, rejected.
- **Glob patterns**: `vitest run test/unit/**/*.test.ts` — regex matches one pattern, guard treats as single file. Minor underblocking edge case (glob resolves to multiple files); acceptable because advanced usage.

### Telemetry Verified

Rejected preflight attempts are recorded in `.ai/metrics/test-runtimes.json` with:
- `classification: "assertion-failure"`
- `durationMs: 0`
- `summary: "Focused test preflight rejected: ..."`

### Documentation Verified

- `AGENTS.md` and `README.md` describe `pnpm test:focused` as single-file by default.
- Override variables `ALLOW_MULTI_FILE_FOCUSED=1` and `ALLOW_PACKAGE_FOCUSED=1` are documented with explicit justification requirement.
- Verification ladder positions `pnpm test:focused` at step 3, below `pnpm verify` — does not normalize broad runs.

### Minor Notes (No Action Needed)

- `pnpm test:control-plane` is caught by `looksLikeFullSuite` because `\bpnpm\s+test\b` matches the `test:` prefix. This is acceptable — package-level suites should be run directly, not wrapped in `test:focused`.
- Glob patterns are treated as single-file references by the regex. Fixing this would require vitest glob resolution and is out of scope for this review.
