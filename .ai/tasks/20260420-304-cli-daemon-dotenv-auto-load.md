# Task 304: CLI and Daemon Should Auto-Load `.env`

## Chapter

Mailbox Operational Trial

## Context

During Task 299, `narada doctor` reported charter runtime health failure because `NARADA_KIMI_API_KEY` was not resolved, even though the private ops repo had a populated `.env` file. The operator had to explicitly `source .env` before running any CLI or daemon command. This is an unnecessary friction point that can cause health checks to fail and prevent trial execution.

## Goal

Make the CLI and daemon automatically load `.env` from the working directory when present, preserving precedence for already-exported variables.

## Required Work

1. Add `.env` loading to the CLI entrypoint (`packages/layers/cli/src/main.ts`) before any command execution.
2. Add `.env` loading to the daemon entrypoint (`packages/layers/daemon/src/index.ts`) before service creation.
3. Use a lightweight implementation:
   - Parse `KEY=value` lines from `./.env`
   - Only set `process.env[key]` if it is not already defined
   - Skip comments and blank lines
   - Do not require `.env` to exist (silent no-op if missing)
4. Do not add a new external dependency if the implementation is under ~20 lines.

### Secret Precedence

`.env` auto-loading must preserve the existing secret resolution precedence from `AGENTS.md`:

1. **Already-exported environment variables** (highest precedence — never overridden by `.env`)
2. **`.env` file values** (only applied if the env var is not already set)
3. **Secure storage references** (`{ "$secure": "key" }`)
4. **Config file values** (lowest precedence)

This means `.env` acts as a convenience layer for operators, not as a new authority boundary. It does not weaken the secret model; it simply removes the manual `source .env` step while keeping env vars at the top of the precedence stack.

## Non-Goals

- Do not support `.env.local`, `.env.development`, or other variants.
- Do not recursively search parent directories for `.env`.
- Do not change config schema or validation.
- Do not require `.env` to exist.

## Acceptance Criteria

- [x] `narada doctor` run from a directory containing `.env` loads the variables before checking charter runtime health.
- [x] `narada-daemon` run from a directory containing `.env` loads the variables before creating the sync service.
- [x] Already-exported environment variables take precedence over `.env` values.
- [x] Missing `.env` file does not cause an error or warning.
- [x] Verified in the ops repo (`narada.sonar`) without requiring `source .env`.

## Execution Mode

Proceed directly. This is a narrow CLI/daemon wiring task.

## Execution Notes

### Implementation

- `packages/layers/control-plane/src/config/dotenv.ts` — Shared `loadEnvFile(path)` utility (~15 lines).
  - Parses `KEY=value` lines, skips comments/blank lines, trims keys and values.
  - Only sets `process.env[key]` if `process.env[key] === undefined`.
  - Silent no-op if file missing or unreadable.
  - **Intentionally does NOT support**: `export KEY=value`, quoted values (`"..."`), variable expansion (`$KEY`), or multi-line values. These are documented limitations; operators needing complex `.env` should `source` it manually.
- `packages/layers/cli/src/main.ts` — Calls `loadEnvFile('./.env')` immediately after imports, before `program.parse()`.
- `packages/layers/daemon/src/index.ts` — Calls `loadEnvFile('./.env')` at the top of `main()`, before config resolution and `createSyncService()`.
- Exported from `@narada2/control-plane` so both packages share the same implementation.

### Entrypoint Wiring

No dedicated entrypoint wiring tests were added. The call sites in `main.ts` and `daemon/src/index.ts` are trivial one-liners (`loadEnvFile('./.env')`). The unit tests for `loadEnvFile()` cover all behavioral surface area (load, precedence, missing file, comments, equals-in-values, trimming). Build and typecheck verify the import resolves and the function signature matches.

### Unit Tests

- `packages/layers/control-plane/test/unit/config/dotenv.test.ts` — 6 tests, all passing.

### Verification

- **Typecheck**: `pnpm typecheck` passes across all packages.
- **Build**: `pnpm build` passes across all packages.
- **Ops repo (redacted)**: `cd narada.sonar && pnpm narada doctor` with `.env` containing `NARADA_KIMI_API_KEY=<key>` returned `charterRuntimeHealthy: true` without requiring `source .env`. Prior to the fix, the same command reported `charterRuntimeHealthy: false` with `NARADA_KIMI_API_KEY not resolved`.
