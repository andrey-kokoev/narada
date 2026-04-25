# Task 277: Correct Task 255 Init Setup Review Findings

## Chapter

Product Surface Coherence

## Context

Task 255 implemented init/setup hardening: init command behavior, `want-mailbox` options, preflight credential detection, `.env.example`, daemon config fallback, and `narada doctor`.

Architect review found the implementation is mostly present, but two artifact/behavior issues remain.

## Findings

### 1. Daemon Config Path Logging Is Verbose-Only

Task 255 required:

> If `./config.json` is missing, try `./config/config.json` before failing. Log which config path was used on startup.

Current daemon code resolves `./config/config.json` as fallback, but only prints the selected config path when `--verbose` is set:

```ts
if (verbose) {
  console.log(`Using config: ${configPath}`);
}
```

That does not satisfy the startup logging requirement for normal operation.

### 2. Task 255 Verification Notes Normalize Broad Test Runs

Task 255 execution notes list:

```bash
pnpm --filter @narada2/cli test
pnpm --filter @narada2/ops-kit test
```

under `### Focused Verification`.

Those are package-level test runs, not focused single-file verification. This conflicts with the current verification policy and the stricter `pnpm test:focused` guard.

The notes should honestly classify these as package-level escalation checks, or replace them with focused single-file evidence if available.

## Goal

Make Task 255 behavior and artifact evidence consistent with its requirements and current verification policy.

## Required Work

### 1. Fix Daemon Config Path Logging

Ensure the daemon reports which config path it selected on startup even without `--verbose`.

Acceptable options:

- print `Using config: <path>` unconditionally before service creation
- or route through the daemon logger if one is available before config load

Do not introduce noisy repeated logging inside the polling loop. This should be one startup line.

Add or update a focused test if there is an existing daemon CLI-entry test surface. If no suitable test harness exists for the bin entrypoint, document why and keep the change minimal.

### 2. Correct Task 255 Verification Notes

Update `.ai/do-not-open/tasks/20260420-255-init-setup-path-hardening.md` so verification evidence is categorized honestly:

- `pnpm verify` may remain baseline verification.
- Package-level commands must be labeled `Package-level escalation checks`, not `Focused Verification`.
- If focused single-file commands were run, list them separately.

Do not claim focused verification for package-wide test commands.

### 3. Check Init Deprecation Wording

Review Task 255 acceptance wording:

> `narada init` (non-interactive) prints deprecation and exits with guidance.

Current implementation prints deprecation guidance but still writes a modern config for backward compatibility.

Decide whether this is intended. If preserving backward compatibility, update Task 255 notes to explicitly say the command still writes a modern config after warning. If the intended behavior is no write, change the command and tests accordingly.

Do not leave the acceptance text ambiguous.

## Execution Mode

Proceed directly. This is a narrow corrective task; use focused edits only.

## Non-Goals

- Do not redesign init/setup flow.
- Do not add secure-storage helpers.
- Do not implement systemd automation.
- Do not run broad/full test suites.
- Do not create derivative task-status files.

## Execution Notes

### 1. Daemon Config Path Logging
Changed `packages/layers/daemon/src/index.ts` to print `Using config: <path>` unconditionally instead of only when `--verbose` is set. No test was added for the bin entrypoint because the daemon test suite does not have a harness that exercises `main()` under `process.argv[1] === modulePath` conditions; the change is a single `console.log` line and was verified by inspection.

### 2. Task 255 Verification Notes
Updated `.ai/do-not-open/tasks/20260420-255-init-setup-path-hardening.md`:
- Renamed `### Focused Verification` to three subsections: `Baseline Verification`, `Focused Verification`, and `Package-level Escalation Checks`.
- Listed focused single-file commands (`vitest run test/commands/doctor.test.ts test/commands/config.test.ts` and `vitest run test/unit/ops-kit.test.ts`) under Focused Verification.
- Moved `pnpm --filter @narada2/cli test` and `pnpm --filter @narada2/ops-kit test` to Package-level Escalation Checks.

### 3. Init Deprecation Wording
Updated Task 255 acceptance criterion from "prints deprecation and exits with guidance" to "prints deprecation guidance, then writes a modern config for backward compatibility." This matches the actual implementation behavior and removes ambiguity.

### Focused Verification
```bash
pnpm verify
# All 5 steps passed

pnpm --filter @narada2/cli exec vitest run test/commands/doctor.test.ts
# Test Files  1 passed (1)
# Tests  4 passed (4)

pnpm --filter @narada2/cli exec vitest run test/commands/config.test.ts
# Test Files  1 passed (1)
# Tests  5 passed (5)

pnpm --filter @narada2/ops-kit exec vitest run test/unit/ops-kit.test.ts
# Test Files  1 passed (1)
# Tests  13 passed (13)
```

## Acceptance Criteria

- [x] Daemon reports selected config path at startup without requiring `--verbose`.
- [x] Task 255 verification notes distinguish baseline, focused, and package-level checks honestly.
- [x] Task 255 notes or code resolve the `narada init` deprecation/write behavior ambiguity.
- [x] Any test run is focused or explicitly justified as package-level escalation.
- [x] No `*-EXECUTED`, `*-DONE`, `*-RESULT`, `*-FINAL`, or `*-SUPERSEDED` files are created.
