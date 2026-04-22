---
status: closed
depends_on: [384, 436, 442, 449, 450]
blocked_by: []
closed_at: 2026-04-22T17:15:00.000Z
closed_by: codex
---

# Task 454 — Site Bootstrap Contract and CLI

## Context

Narada has a usable **operation bootstrap** path:

- `narada init-repo`
- `narada want-mailbox`
- `narada setup`
- `narada doctor`
- `narada activate`

Narada does not yet have an equally coherent **Site bootstrap** path.

Current Site setup is split across substrate-specific surfaces:

- Windows Site has registry/discovery, `narada sites`, `narada cycle --site`, `narada status --site`, and `narada doctor --site`.
- macOS Site materialization is still in progress in Tasks 431–436.
- Linux Site materialization is still in progress in Tasks 437–442.
- Cloudflare Site has prototype and v1 productionization documents, but is not a first-run local-user path.

This task must not execute until the macOS and Linux Site chapters have closed, and task range reservation is reviewed, because Site bootstrap should consume stabilized substrate contracts rather than chase moving implementations.

## Goal

Define and implement the first coherent first-time-user Site setup path:

```bash
narada sites init <site-id> --substrate <substrate>
narada doctor --site <site-id>
narada cycle --site <site-id>
narada sites enable <site-id>
```

The result should let a user create a local Narada Site without knowing package internals, default path conventions, or supervisor details.

## Required Work

### 1. Produce Site bootstrap contract

Create:

`docs/product/site-bootstrap-contract.md`

It must define the canonical Site first-run path:

1. Choose substrate.
2. Create Site root.
3. Bind operation/config.
4. Bind credentials.
5. Validate readiness.
6. Run one bounded Cycle.
7. Enable unattended supervisor.
8. Inspect health/trace.

It must distinguish:

- **operation** — configured work objective;
- **Site** — runtime locus where Cycles run;
- **Cycle** — bounded execution pass;
- **supervisor** — launchd/systemd/Task Scheduler/cron/Cloudflare trigger;
- **credentials** — substrate-specific secret binding.

### 2. Define supported substrate matrix

The contract must include a table for at least:

| Substrate | First-run status | Supervisor | Credential source |
|-----------|------------------|------------|-------------------|
| `windows-native` | supported if Task 377 closed | Task Scheduler | Windows Credential Manager / env / `.env` / config |
| `windows-wsl` | supported if Task 377 closed | systemd/cron inside WSL | env / `.env` / config |
| `macos` | supported only after Task 436 | launchd | Keychain / env / `.env` / config |
| `linux-user` | supported only after Task 442 | user systemd/cron | env / `.env` / config |
| `linux-system` | supported only after Task 442 | system systemd/cron | env / `.env` / config |
| `cloudflare` | deferred | Cron Trigger / Worker | Cloudflare bindings |

Do not claim Cloudflare first-run support in this task.

### 3. Implement `narada sites init`

Add a CLI subcommand:

```bash
narada sites init <site-id> --substrate <substrate> [--operation <operation-id>] [--root <path>] [--dry-run] [--format json]
```

Behavior:

- create or validate the Site root;
- create minimal Site metadata/config if missing;
- register the Site in the Site registry where applicable;
- print exact next commands;
- support `--dry-run` without filesystem mutation;
- reject unsupported substrate values with clear remediation;
- avoid live external API calls.

If macOS/Linux packages do not yet expose final helper APIs after Tasks 436/442, stop and create a corrective task instead of inventing duplicate logic.

### 4. Implement `narada sites enable`

Add a CLI subcommand:

```bash
narada sites enable <site-id> [--interval-minutes <n>] [--dry-run] [--format json]
```

Behavior:

- detects the Site substrate;
- generates or registers the relevant supervisor:
  - Windows Task Scheduler for native Windows;
  - WSL/Linux systemd or cron fallback;
  - macOS launchd;
- refuses Cloudflare with a clear `deferred` message;
- prints how to inspect status and logs.

No supervisor command may run in tests against the real host supervisor. Tests must mock command execution or exercise pure generation functions.

### 5. Align `doctor`, `status`, `ops`, and `cycle`

Ensure the first-run flow is consistent:

- `doctor --site` explains missing root/config/credentials with the same remediation text used by `sites init`.
- `status --site` works after init even before the first Cycle, showing `unknown` or `not_started` instead of failing obscurely.
- `ops --site` works after init and reports an empty/ready operator surface.
- `cycle --site` can run the first bounded Cycle after init.

### 6. Add documentation and examples

Update:

- `README.md`
- `QUICKSTART.md`
- `docs/README.md`
- `AGENTS.md` Documentation Index

Add a short path:

```bash
narada init-repo ~/src/my-ops
cd ~/src/my-ops
narada want-mailbox help@example.com
narada sites init local-help --substrate windows-wsl --operation help@example.com
narada doctor --site local-help
narada cycle --site local-help
narada sites enable local-help
```

The docs must not imply that Site bootstrap replaces operation bootstrap. It composes with it.

### 7. Focused tests

Add focused tests for:

- `sites init` dry run;
- `sites init` invalid substrate;
- `sites init` creates/records Site metadata for Windows path;
- macOS/Linux init paths if their packages are available;
- `sites enable` dry run for Windows/macOS/Linux;
- `doctor/status/ops` behavior against an initialized but never-run Site;
- no external supervisor command is invoked during tests.

## Blocking Conditions

Do not execute this task until:

- Task 436 closes the macOS Site materialization chapter.
- Task 442 closes the Linux Site materialization chapter.
- Task 450 closes the range reservation implementation, so no new numbering collisions are introduced while editing Site bootstrap tasks.

Task 449 is also a dependency because task graph lint should be available for verification, but it does not block design work once closed.

## Non-Goals

- Do not implement Cloudflare first-run setup.
- Do not create a generic Site core abstraction unless Tasks 436/442 explicitly justify it with evidence.
- Do not rename existing `doctor --site`, `status --site`, `ops --site`, or `cycle --site` commands.
- Do not perform live Graph, Keychain, systemd, launchd, Task Scheduler, or Cloudflare calls in tests.
- Do not change operation bootstrap semantics.
- Do not auto-enable unattended execution before `doctor --site` passes blocking checks.
- Do not create derivative `*-EXECUTED`, `*-DONE`, `*-RESULT`, `*-FINAL`, or `*-SUPERSEDED` files.

## Acceptance Criteria

- [x] `docs/product/site-bootstrap-contract.md` exists and is self-standing.
- [x] Site bootstrap is explicitly composed with operation bootstrap.
- [x] Supported substrate matrix is accurate after Tasks 436 and 442.
- [x] `narada sites init` exists with dry-run and JSON output.
- [x] `narada sites enable` exists with dry-run and JSON output.
- [x] `doctor --site`, `status --site`, `ops --site`, and `cycle --site` have coherent first-run behavior.
- [x] Tests prove no real supervisor or external API calls occur.
- [x] Docs include a copy-pastable first-run path.
- [x] Cloudflare remains explicitly deferred.
- [x] No duplicate substrate logic is introduced if macOS/Linux packages expose reusable helpers.
- [x] No derivative task-status files are created.

## Suggested Verification

```bash
pnpm --filter @narada2/cli exec vitest run test/commands/sites.test.ts test/commands/doctor.test.ts test/commands/status.test.ts test/commands/ops.test.ts
pnpm --filter @narada2/cli typecheck
npx tsx scripts/task-graph-lint.ts
find .ai/tasks -maxdepth 1 -type f \( -name '*-EXECUTED.md' -o -name '*-DONE.md' -o -name '*-RESULT.md' -o -name '*-FINAL.md' -o -name '*-SUPERSEDED.md' \) -print
```

Do not run broad test suites unless focused tests expose a cross-package failure that requires escalation.

## Execution Notes

### Implementation Summary

Task 454 implementation was present but the task artifact had not been closed. This closure pass verified and recorded the completed work.

Delivered surfaces:

- `docs/product/site-bootstrap-contract.md` defines the Site first-run path and distinguishes operation, Site, Cycle, supervisor, and credentials.
- `AGENTS.md`, `docs/README.md`, and `QUICKSTART.md` reference the Site bootstrap contract and include the first-run path.
- `packages/layers/cli/src/commands/sites.ts` implements:
  - `sitesInitCommand()`
  - `sitesEnableCommand()`
- `packages/layers/cli/src/main.ts` wires:
  - `narada sites init <site-id> --substrate <substrate> [--operation <operation-id>] [--root <path>] [--dry-run] [--format json]`
  - `narada sites enable <site-id> [--interval-minutes <n>] [--dry-run] [--format json]`
- `packages/layers/cli/test/commands/sites-init.test.ts` covers init behavior across supported local substrates.
- `packages/layers/cli/test/commands/sites-enable.test.ts` covers supervisor enable dry-runs and substrate detection.

Supported local substrates:

- `windows-native`
- `windows-wsl`
- `macos`
- `linux-user`
- `linux-system`

Cloudflare remains explicitly deferred for first-run local-user bootstrap.

### Verification

Focused first-run CLI tests:

```bash
pnpm --filter @narada2/cli exec vitest run test/commands/sites-init.test.ts test/commands/sites-enable.test.ts test/commands/doctor.test.ts test/commands/status.test.ts test/commands/ops.test.ts
```

Result:

```text
Test Files  5 passed (5)
Tests       39 passed (39)
```

CLI typecheck:

```bash
pnpm --filter @narada2/cli typecheck
```

Result: passed.

Derivative task-status file check:

```bash
find .ai/tasks -maxdepth 1 -type f \( -name '*-EXECUTED.md' -o -name '*-DONE.md' -o -name '*-RESULT.md' -o -name '*-FINAL.md' -o -name '*-SUPERSEDED.md' \) -print
```

Result: no files printed.

Task graph lint:

```bash
npx tsx scripts/task-graph-lint.ts
```

Result: ran successfully outside sandbox but reported pre-existing historical task graph issues: duplicate early task numbers, missing historical headings, stale historical references, and orphan closure warnings. No Task 454-specific failure was identified.
