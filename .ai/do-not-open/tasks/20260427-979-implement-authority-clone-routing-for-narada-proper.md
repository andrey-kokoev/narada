---
status: closed
closed_at: 2026-04-28T20:01:59.926Z
closed_by: a2
governed_by: task_close:a2
closure_mode: peer_reviewed
---

# Implement authority clone routing for Narada proper

## Chapter

cli-ergonomics

## Goal

Make Narada proper mutation commands resolve the declared authority clone before mutating, so Windows/WSL and multi-clone embodiments cannot silently split task, inbox, chapter, lifecycle, or publication state.

## Context

Narada proper is operated from multiple embodiments, including the WSL checkout and a Windows checkout. Plural Embodiment, Singular Authority requires mutation commands to resolve the declared authority clone before writing task, inbox, chapter, lifecycle, dispatch, roster, evidence, or publication state.

## Required Work

1. Add a Narada-proper authority-clone declaration.
2. Add a reusable CLI guard that classifies the current checkout as authority clone, non-authority clone, stale authority clone, or unconfigured.
3. Enforce the guard at common command wrapper boundaries for known mutating task, chapter, inbox, lifecycle, roster, evidence, dispatch, and publication command families.
4. Preserve read-only inspection and dry-run surfaces.
5. Surface authority-clone posture in doctor output.
6. Add focused tests for authority match, non-authority refusal, read-only/dry-run allowance, command-wrapper enforcement, and doctor reporting.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

1. Added `.ai/authority-clone.json` declaring `/home/andrey/src/narada` as the Narada proper authority clone and `D:\code\narada` as a non-authority Windows embodiment.
2. Added `packages/layers/cli/src/lib/narada-proper-authority.ts` with:
   - `inspectAuthorityClonePosture()`,
   - `shouldGuardAuthorityClone()`,
   - `assertAuthorityCloneForMutation()`,
   - structured `AuthorityCloneRefusal` results with `next_safe_command`.
3. Wired `directCommandAction()` and `resourceScopedDirectCommandAction()` in `packages/layers/cli/src/lib/command-wrapper.ts` so registered mutating command families refuse before invoking their mutation function or opening mutation resources when the configured authority clone is not the current clone.
4. Kept read-only and non-mutating variants unguarded: examples include `task read`, `task graph`, `task create --dry-run`, `task allocate --dry-run`, `task work-next --peek`, `inbox work-next --peek`, and `mutation-evidence reconcile` without `--apply`.
5. Added `authority-clone-routing` to `narada doctor --bootstrap` so doctor reports configured authority root, current posture, and stale/divergent clone remediation.
6. Added focused tests in `packages/layers/cli/test/lib/narada-proper-authority.test.ts` and `packages/layers/cli/test/lib/command-wrapper.test.ts`.

## Verification

| Check | Result |
| --- | --- |
| TIZ focused run `run_1777406429201_ozaxow` | Passed in 22.6s |
| Authority guard tests | `narada-proper-authority.test.ts` passed |
| Command wrapper refusal tests | `command-wrapper.test.ts` passed |
| Doctor tests | `doctor.test.ts` passed |
| Typecheck | `pnpm typecheck` passed |
| Build | `pnpm build` passed |
| Doctor posture | `narada doctor --bootstrap --format json` reports `authority-clone-routing` with `current=authority_clone`, authority `/home/andrey/src/narada`, behind `0` |

## Acceptance Criteria

- [x] A configuration surface names the authority clone for Narada proper and records known non-authority embodiments.
- [x] Mutating task, chapter, inbox, lifecycle, roster, evidence, dispatch, and publication command families are guarded at the common CLI command-wrapper boundary.
- [x] Non-authority invocation refuses before mutation with structured authority posture and a precise next safe command.
- [x] Read-only inspection and dry-run surfaces remain available.
- [x] Doctor reports authority-clone routing posture and stale/divergent clone risk.
- [x] Focused tests cover authority clone match, non-authority refusal, read-only/dry-run allowance, command-wrapper enforcement, and doctor reporting.
- [x] `pnpm typecheck` and `pnpm build` pass.
