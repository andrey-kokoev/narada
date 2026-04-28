---
status: closed
amended_by: architect
amended_at: 2026-04-28T01:52:37.442Z
criteria_proved_by: architect
criteria_proved_at: 2026-04-28T01:52:42.689Z
criteria_proof_verification:
  state: unbound
  rationale: Focused tests, CLI dry-run probe, and pnpm verify prove the paired Windows bootstrap acceptance criteria.
closed_at: 2026-04-28T01:52:43.703Z
closed_by: architect
governed_by: task_close:architect
closure_mode: operator_direct
---

# Add paired Windows User PC Site bootstrap command

## Chapter

Windows Site Bootstrapper

## Goal

Provide a governed command that plans and optionally executes paired Windows user-locus and PC-locus Site initialization without collapsing authority locus and execution surface.

## Context

Windows bootstrap needs two authority loci: a User Site for operator memory/control, and a PC Site for machine/session recovery. The command must expose that pairing directly instead of relying on ad hoc repeated `sites init` invocations.

## Required Work

1. Add a `narada sites bootstrap-windows` command.
2. Make the command dry-run by default and require `--execute` for mutation.
3. Plan a Windows user-locus Site and a Windows PC-locus Site through the existing `sites init` path.
4. Preserve authority locus, sync posture, execution surface, WSL-assisted path translation, and validation commands in the result.
5. Document the paired Windows first-run path.
6. Add focused tests for dry-run pairing and WSL fallback ergonomics.

## Non-Goals

- Do not expand scope beyond paired Windows Site bootstrap.
- Do not mutate live Windows Site roots during verification.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

1. Added `sitesBootstrapWindowsCommand` in `packages/layers/cli/src/commands/sites.ts`.
2. Registered `narada sites bootstrap-windows` in `packages/layers/cli/src/commands/sites-register.ts`.
3. The command creates a paired plan for a user-locus Windows Site and a PC-locus Windows Site, dry-run by default.
4. `--execute` routes both initializations through the existing `sitesInitCommand` mutation path.
5. Added WSL-safe fallback for missing `USERPROFILE`, deriving `C:\\Users\\<user>\\Narada` from `USER` or `USERNAME` for dry-run planning.
6. Propagated phase errors to the top-level command result instead of emitting only `Command failed`.
7. Updated `docs/product/site-bootstrap-contract.md` with the paired Windows first-run command, defaults, and authority-locus rationale.
8. Added focused tests for paired dry-run, explicit PC Site id, explicit execution surface, and WSL-safe user-root fallback.

## Verification

| Check | Result |
| --- | --- |
| `pnpm --filter @narada2/cli exec vitest run test/commands/sites-init.test.ts` | Pass, 16/16 tests |
| `pnpm --filter @narada2/cli typecheck` | Pass |
| `pnpm --filter @narada2/cli build` | Pass |
| `narada sites bootstrap-windows --help` | Pass; command is exposed with expected options |
| Bounded dry-run probe for `NARADA_EXECUTOR_RUNTIME=wsl COMPUTERNAME=DESKTOP-SUNROOM narada sites bootstrap-windows --user-site-id andrey-user --pc-site-id desktop-sunroom-2 --format json` | Pass; returned dry-run plan with user and PC WSL path translations |
| `pnpm verify` | Pass, all 8 steps |

## Acceptance Criteria

- [x] CLI exposes narada sites bootstrap-windows.
- [x] Dry-run returns a paired plan for user and PC Sites without mutation.
- [x] Execute mode initializes both Sites via existing sites init path.
- [x] Plan records user authority locus.
- [x] Plan records PC authority locus.
- [x] Plan records sync posture.
- [x] Plan records execution surface.
- [x] Plan records next validation commands.
- [x] Inbox observation is promoted to this work.
- [x] Focused tests and pnpm verify pass.
