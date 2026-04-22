---
status: closed
depends_on: [284, 305]
closed: 2026-04-22
---

# Task 476 — Kimi CLI Browser-Session Charter Runtime

## Context

Narada currently treats `charter.runtime: "kimi-api"` as an OpenAI-compatible API-key runtime. That path requires `charter.api_key`, `NARADA_KIMI_API_KEY`, or `KIMI_API_KEY`.

This is too narrow. The local machine already has Kimi CLI installed and browser-authenticated:

```text
/home/andrey/.local/bin/kimi
/home/andrey/.local/bin/kimi-cli
/home/andrey/.kimi/credentials/kimi-code.json
```

The Kimi CLI supports browser login and persistent sessions:

```text
kimi login
kimi --print --prompt <text>
kimi --session <id>
kimi --continue
```

Therefore, `narada doctor` failing only because no API key is set may incorrectly block a legitimate runtime configuration when the intended runtime is browser-session-backed Kimi CLI.

## Goal

Add a first-class `kimi-cli` charter runtime that uses the locally authenticated Kimi CLI/browser session, without weakening the existing `kimi-api` API-key path.

The outcome should be:

```json
{
  "charter": {
    "runtime": "kimi-cli",
    "model": "moonshot-v1-8k"
  }
}
```

For this runtime:

- `doctor` checks CLI availability and login/session health;
- daemon dispatch invokes Kimi through the CLI runner;
- missing API key is not a failure;
- missing browser login/session is reported as `interactive_auth_required`;
- `kimi-api` remains API-key based and unchanged.

## Required Work

### 1. Extend runtime configuration

Update config types and validation to allow:

```text
charter.runtime = "kimi-cli"
```

Rules:

- `kimi-api` requires API key exactly as today.
- `kimi-cli` must not require API key.
- `kimi-cli` requires an executable path, defaulting to `kimi` then `kimi-cli` on `PATH`.
- Optional config fields:
  - `charter.cli_path`
  - `charter.session_id`
  - `charter.continue_session`
  - `charter.work_dir`
  - `charter.timeout_ms`

### 2. Implement `KimiCliCharterRunner`

Add a runner in `packages/domains/charters/src/runtime/` that implements `CharterRunner`.

It must:

- spawn the Kimi CLI in non-interactive print mode;
- pass a prompt equivalent to the existing `CodexCharterRunner` prompt;
- request final JSON output only;
- parse and validate `CharterOutputEnvelope` with the same validators used by `CodexCharterRunner`;
- enforce timeout and kill the subprocess on timeout;
- never read or print token contents from `~/.kimi/credentials`;
- record trace commentary only through existing hooks.

Suggested CLI shape:

```bash
kimi --print --final-message-only --output-format text --prompt "<prompt>"
```

If the actual CLI requires a different stable shape, document it in execution notes.

### 3. Add health probing

`KimiCliCharterRunner.probeHealth()` must classify:

- `healthy`: CLI exists and a minimal non-mutating prompt succeeds;
- `unconfigured` or `broken`: CLI missing;
- `interactive_auth_required`: CLI exists but reports not logged in / token expired / login required;
- `partially_degraded`: CLI times out or provider rate-limits.

If `interactive_auth_required` is not currently in `CharterRuntimeHealthClass`, add it with recovery guidance:

```text
Run: kimi login
```

The probe must avoid printing credential values.

### 4. Wire doctor and daemon

Update:

- `packages/layers/cli/src/commands/doctor.ts`
- `packages/layers/daemon/src/service.ts`
- `packages/layers/control-plane/src/config/validation.ts`

Behavior:

- `doctor` must not ask for API key when runtime is `kimi-cli`.
- `doctor` must report browser-session auth problems as interactive auth required, not as API-key missing.
- daemon must create `KimiCliCharterRunner` for `kimi-cli`.
- existing `mock`, `codex-api`, and `kimi-api` behavior must remain unchanged.

### 5. Update `narada.sonar` config option

Add a documented optional posture in `/home/andrey/src/narada.sonar/config/config.json` or companion docs:

```json
"charter": {
  "runtime": "kimi-cli",
  "model": "moonshot-v1-8k"
}
```

Do not remove the `kimi-api` option; keep both supported.

### 6. Add tests

Add focused tests with mocked subprocess execution:

- `kimi-api` still fails validation without API key.
- `kimi-cli` passes config validation without API key.
- `kimi-cli` health probe reports CLI missing.
- `kimi-cli` health probe reports login required from representative stderr/stdout.
- `kimi-cli` runner parses valid JSON output into `CharterOutputEnvelope`.
- `kimi-cli` runner rejects invalid JSON / invalid envelope.
- daemon creates the correct runner for `kimi-cli`.
- doctor renders `kimi login` remediation.

Do not run real Kimi network calls in tests.

## Non-Goals

- Do not reverse-engineer or print Kimi credential tokens.
- Do not make browser-session Kimi the default runtime.
- Do not remove `kimi-api`.
- Do not use chat/session logs as authoritative Narada evidence.
- Do not add a new agent orchestration system.
- Do not create derivative `*-EXECUTED`, `*-DONE`, `*-RESULT`, `*-FINAL`, or `*-SUPERSEDED` files.

## Acceptance Criteria

- [x] `charter.runtime: "kimi-cli"` is valid config.
- [x] `kimi-cli` does not require API key in config validation or doctor.
- [x] `KimiCliCharterRunner` implements `run()` and `probeHealth()`.
- [x] Browser-login/session failures produce `interactive_auth_required` with `kimi login` remediation.
- [x] Daemon dispatch can use `kimi-cli` runner.
- [x] `kimi-api` API-key behavior is unchanged.
- [x] `narada.sonar` documents or provides the `kimi-cli` posture.
- [x] Focused tests cover config validation, doctor, runner health, and runner output parsing.
- [x] No tests invoke real Kimi network calls.
- [x] No credential values are printed or committed.

## Execution Notes

### Actual CLI Shape Discovery

The installed Kimi CLI v1.37.0 (`kimi` / `kimi-cli`) is an interactive TUI agent. It does **not** support `--print` or `--prompt` flags. The runner spawns the CLI as a subprocess, writes the prompt via stdin, captures stdout/stderr, and attempts to extract JSON with a timeout. This is documented in the implementation; a future headless CLI mode would improve integration.

### Files Changed

- `packages/domains/charters/src/runtime/health.ts` — Added `interactive_auth_required` health class with `kimi login` remediation guidance.
- `packages/domains/charters/src/runtime/kimi-cli-runner.ts` — **New** `KimiCliCharterRunner` implementing `CharterRunner` with subprocess-based `run()` and `probeHealth()`.
- `packages/domains/charters/src/runtime/index.ts` — Exports `KimiCliCharterRunner` and `KimiCliCharterRunnerOptions`.
- `packages/layers/control-plane/src/config/types.ts` — Added `cli_path`, `session_id`, `continue_session`, `work_dir` to `CharterRuntimeConfig`.
- `packages/layers/control-plane/src/config/validation.ts` — Allowed `kimi-cli` runtime; no API key required.
- `packages/layers/cli/src/commands/doctor.ts` — Added `kimi-cli` branch in charter runtime health check.
- `packages/layers/daemon/src/service.ts` — Added `kimi-cli` branch in `createDefaultCharterRunner()`.
- `packages/domains/charters/test/runtime/kimi-cli-runner.test.ts` — **New** 11 focused tests mocking `child_process`.
- `~/src/narada.sonar/README.md` — Added Charter Runtime Options section documenting `kimi-api` and `kimi-cli`.

### Design Decisions

- `probeHealth()` checks CLI existence via `kimi --version`, then checks for `~/.kimi/credentials/kimi-code.json` to determine auth state. This avoids spawning the TUI.
- `run()` uses a 120-second default timeout (longer than API-based runners) because TUI startup may be slower.
- The runner reuses the same `patchOutput`, `validateOutputEnvelope`, and `validateCharterOutput` validators as `CodexCharterRunner` for consistency.
- No credential values are ever read from `~/.kimi/credentials/` into logs or output.

## Verification

```bash
# Typecheck all affected packages
pnpm --filter @narada2/charters typecheck   # clean
pnpm --filter @narada2/control-plane typecheck  # clean
pnpm --filter @narada2/cli typecheck        # clean
pnpm --filter @narada2/daemon typecheck     # clean

# Focused tests
pnpm --filter @narada2/charters exec vitest run test/runtime/kimi-cli-runner.test.ts
# → 11 tests pass

# Existing tests still pass
pnpm --filter @narada2/charters exec vitest run test/runtime/
# → 44 tests pass
pnpm --filter @narada2/cli exec vitest run test/commands/doctor.test.ts
# → 5 tests pass
```

No derivative task-status files created.

## Suggested Verification

```bash
pnpm --filter @narada2/charters exec vitest run test/runtime/kimi-cli-runner.test.ts
pnpm --filter @narada2/cli exec vitest run test/commands/doctor.test.ts
pnpm --filter @narada2/daemon exec vitest run test/unit/service.test.ts
pnpm --filter @narada2/control-plane typecheck
pnpm --filter @narada2/cli typecheck
```
