---
"@narada2/cli": minor
"@narada2/daemon": minor
"@narada2/control-plane": patch
"@narada2/ops-kit": patch
---

Product Surface Coherence chapter (Tasks 252, 254–257)

**User-facing changes:**
- All CLI commands now use `--operation` as the primary flag with `--scope` retained as a hidden backward-compatible alias. Error messages and labels have been updated from "scope" to "operation".
- `narada init` (non-interactive) now prints deprecation guidance directing users to `narada init-repo`.
- `narada init --interactive` writes the modern multi-scope config shape to `./config/config.json`.
- `narada want-mailbox` now exposes `--graph-user-id`, `--folders`, and `--data-root-dir` options.
- `narada doctor` is a new command that checks daemon health, sync freshness, and work-queue state.
- Preflight checks now inspect config-file credentials (legacy `scope.graph` and modern `sources[]`) before reporting failure.
- The daemon now starts and runs non-mail verticals (timer, webhook) without requiring a Graph source.
- `config.example.json` includes commented timer and webhook scope examples.
- The USC init path now validates the installed USC compiler version against a declared compatibility range and caches resolved schemas for offline resilience.
- Agent verification is faster: `pnpm verify` now runs the task-file guard, typecheck, build, charters tests, and ops-kit tests (~15s). Slow control-plane tests are available via `pnpm test:control-plane` and `ALLOW_FULL_TESTS=1 pnpm test:full`.
- A new `pnpm test:focused '<command>'` wrapper records telemetry for single-file or package-scoped test runs.
