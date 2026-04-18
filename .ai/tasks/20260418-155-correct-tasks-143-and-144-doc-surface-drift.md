# Task 155: Correct Tasks 143 And 144 Doc Surface Drift

## Why

Tasks 143 and 144 substantially improved the architecture and README docs, but review found remaining public documentation drift.

The repo now physically uses `packages/layers/control-plane`, and the README now teaches the ops-repo model, but some user/contributor-facing docs still contradict the current tree or the actual CLI surface.

## Findings Being Corrected

### 1. Root `AGENTS.md` still has stale `layers/kernel` paths

The root repository layout still shows:

- `packages/layers/kernel/`

and some critical invariant text still references:

- `layers/kernel/src/observability/`

Those paths are now stale after the `control-plane` rename and contradict the monolithic control-plane note added for Task 143.

### 2. README command surface is still incomplete

The root README now covers most of the CLI, but it still omits current commands from `packages/layers/cli/src/main.ts`, including:

- `init`
- `cleanup`

Task 144 was meant to reflect the meaningful/full CLI surface, not just most of it.

### 3. README global-options section overclaims `-c`

The README says all commands support:

- `-c, --config <path>`

But `-c` is command-local and not present on every command. Some commands do not accept config, and `init` uses `-o/--output` instead.

That makes the command docs misleading even though the ops-repo narrative is now mostly correct.

## Goal

Bring root contributor/user docs into alignment with the actual package tree and CLI.

## Required Outcomes

### 1. Fix stale root AGENTS paths

Update root `AGENTS.md` so repository layout and invariant references use the current `packages/layers/control-plane` path where appropriate.

Do not rewrite canonical terminology or architecture beyond the stale path fixes needed for coherence.

### 2. Complete the README command surface

Update the root README command tables so they include the actual current CLI commands.

At minimum, add the missing:

- `init`
- `cleanup`

### 3. Make README option documentation accurate

Replace the overbroad "All commands support `-c`" wording with accurate wording:

- global options that are truly global
- command-local options such as `-c/--config` only where applicable

## Deliverables

- root `AGENTS.md` no longer contains stale `layers/kernel` path references in current-state sections
- README includes the actual current CLI command surface
- README no longer claims `-c/--config` is global for all commands

## Definition Of Done

- [x] root `AGENTS.md` current-state path references use `packages/layers/control-plane`
- [x] README command table includes `init` and `cleanup`
- [x] README global/options section matches actual CLI behavior
- [x] no new derivative task-status files are created

## Execution Notes

### 1. Root AGENTS.md stale path fixes

Updated three locations:
- **Repository Layout** (line 195): `packages/layers/kernel/` → `packages/layers/control-plane/`
- **Invariant #16** (line 258): `layers/kernel/src/observability/` → `layers/control-plane/src/observability/`
- **Invariant #22** (line 266): `layers/kernel/src/observability/` → `layers/control-plane/src/observability/`

All other `control-plane` references in AGENTS.md were already correct from prior tasks.

### 2. README command surface completion

Added to the **Runtime & Data** table:
- `init` — Create a new configuration file
- `cleanup` — Run data lifecycle cleanup operations

### 3. README global options accuracy

Replaced the overbroad "All commands support:" section with:
- **Truly global options** (on the `program` object in `main.ts`): `-f/--format`, `--log-level`, `--log-format`, `--metrics-output`
- **Command-local options** note: most runtime/data commands also accept `-c/--config` and `-v/--verbose`, but `init` uses `-o/--output` and `demo` does not accept `-c/--config`

## Verification

- `grep 'layers/kernel' AGENTS.md README.md` — zero matches (clean)
- `pnpm verify` — fails on pre-existing `packages/verticals/search` typecheck error (`Cannot find module '@narada2/control-plane'`). This is unrelated to doc changes; the search package has a broken workspace dependency resolution.

## Notes

Task 142 does not need correction from this review: the hollow layer packages appear removed and no references to those empty package names were found.
