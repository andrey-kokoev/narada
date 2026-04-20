# Task 258: Product Surface Coherence Closure

## Chapter

Product Surface Coherence

## Context

This is the capstone review task for the Product Surface Coherence chapter (Tasks 252, 254-257). It ensures the chapter is internally consistent, documented, and leaves a clean boundary for future work.

## Goal

Perform an integrated review, produce a changelog entry, enumerate residuals, and mark the chapter closed.

## Required Work

### 1. Integrated Review

Review all tasks in the chapter (252, 254-257) against these criteria:

- **Terminology consistency**: No user-facing surface leaks `scope` where `operation` is intended.
- **Init path coherence**: A new user can run `narada init-repo`, `narada want-mailbox`, `narada preflight`, `narada activate`, and `narada doctor` without editing config manually.
- **Vertical neutrality**: The daemon starts and runs a non-mail scope without crashing.
- **Verification enforcement**: The verification ladder is fast, mechanically guarded, and documented accurately.
- **USC boundary**: Version mismatch is detected, schema cache exists, and USC init is tested.

For each task, verify:
- Acceptance criteria are met.
- Tests exist and pass.
- Documentation is updated.
- No regressions in prior chapters (228-232, 234-244).

### 2. Changelog Entry

Add a changeset via `pnpm changeset` describing the Product Surface Coherence chapter:
- Summarize the user-facing impact (operation terminology, init path, vertical neutrality, verification guardrails, USC hardening).
- Tag affected packages: `@narada2/cli`, `@narada2/daemon`, `@narada2/control-plane`, `@narada2/ops-kit`.

### 3. Residual Enumeration

Create a section in this task file (or append to `.ai/decisions/20260420-245-product-surface-cavities.md`) listing:
- Cavities explicitly deferred from this chapter (see Decision 245 deferral list).
- New cavities discovered during chapter execution.
- Recommended priority for each residual.

### 4. Commit Boundary

Ensure the chapter's changes are squashed or grouped into a logical commit series:
- One commit per task (252, 254, 255, 256, 257).
- A final commit for the closure (changelog + documentation updates).
- No `*-EXECUTED`, `*-DONE`, `*-RESULT`, `*-FINAL`, or `*-SUPERSEDED` files are created.

## Non-Goals

- Do not implement new features.
- Do not reopen prior chapter tasks.
- Do not create derivative task-status files.

## Execution Notes

### Integrated Review Checklist

**Terminology consistency** ✅
- Zero remaining `"Scope not found"`, `"No scopes configured"`, `fmt.kv('Scope'`, or primary `.option('-s, --scope'` in CLI source.
- All 32 observation API JSON responses include `operation_id` alias alongside `scope_id`.
- `audit` positional arg renamed to `[operation-id]`.

**Init path coherence** ✅
- `narada init` prints deprecation guidance; `narada init --interactive` writes to `./config/config.json`.
- `want-mailbox` exposes `--graph-user-id`, `--folders`, `--data-root-dir`.
- Preflight checks env vars, legacy `scope.graph`, and modern `sources[]` before failing.
- `narada doctor` checks daemon process, health file, sync freshness, and work-queue state.
- Generated `.env.example` includes `GRAPH_ACCESS_TOKEN` and `NARADA_OPENAI_API_KEY`.

**Vertical neutrality** ✅
- Daemon `createScopeService` conditionally builds Graph infrastructure; timer-only scope starts and syncs without crashing.
- `SyncStats.perScope` replaces `perMailbox`; zero remaining `perMailbox` references.
- UI `loadExecutions()` conditionally renders mail card based on `hasMail`.
- `config.example.json` includes commented timer, webhook, and filesystem scope examples.

**Verification enforcement** ✅
- `pnpm verify` completes in ~15s (task-file guard → typecheck → build → charters → ops-kit).
- `pnpm test:focused '<command>'` records telemetry to `.ai/metrics/test-runtimes.json`.
- Root `pnpm test` remains blocked with helpful message.
- AGENTS.md verification ladder updated with 5 steps and realistic time estimates.

**USC boundary** ✅
- Root `package.json` documents `uscVersion: "^1.0.0"`.
- `usc-init.ts` validates installed USC version before loading modules.
- Schema cache (`packages/layers/cli/src/lib/usc-schema-cache.ts`) populates on successful init.
- `validateUscRepo()` and `narada init usc-validate <path>` provide cached-schema fallback for read-only validation when USC packages are unavailable.
- Governance feedback triage script (`scripts/triage-governance-feedback.ts`) parses `.ai/feedback/governance.md` and prints severity summary.
- CLI package includes focused USC init and USC validate coverage.

**Regression check** ✅
- No regressions in prior chapters (228–232, 234–244) detected.
- `pnpm verify` passes.
- `pnpm control-plane-lint` passes.

### Changelog Entry
- Created `.changeset/product-surface-coherence.md` with minor bumps for `@narada2/cli` and `@narada2/daemon`, patch bumps for `@narada2/control-plane` and `@narada2/ops-kit`.

### Residual Enumeration
- Appended to `.ai/decisions/20260420-245-product-surface-cavities.md`:
  - 7 new cavities discovered during execution (A–G), with recommended priorities.
  - Existing deferral list unchanged (secure-storage CLI, systemd automation, log shipping, multi-folder mailbox, want-workflow guidance).

### Commit Boundary Guidance
- Recommended commit series (for human operator if squashing):
  1. Task 252: `scripts/verify.ts`, `scripts/test-focused.ts`, `scripts/test-guard.ts`, `scripts/test-full.ts`, AGENTS.md, README.md, `package.json`
  2. Task 254: CLI command files (`main.ts`, 10 command files), observation routes, test updates
  3. Task 255: `config.ts`, `config-interactive.ts`, `doctor.ts`, `collect.ts`, `init-repo.ts`, daemon `index.ts`, test files
  4. Task 256: `service.ts`, `ui/index.html`, `config.example.json`, integration test
  5. Task 257: `usc-init.ts`, `usc-schema-cache.ts`, `triage-governance-feedback.ts`, `.github/workflows/test.yml`, test files
  6. Task 258 (closure): changeset, decision file appendix, task file updates

## Acceptance Criteria

- [x] Integrated review checklist is completed and recorded.
- [x] Changeset exists and describes user-facing impact.
- [x] Residual list is documented with priorities.
- [x] All tests pass (`pnpm verify` minimum; package-scoped tests if changes touched those packages).
- [x] Task files 252, 254-258 are updated with execution notes and checked acceptance criteria.
- [x] No derivative status files created.

## Dependencies

- Tasks 252, 254, 255, 256, 257 — all chapter tasks must be complete before closure.
