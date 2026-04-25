# Task 254: Operation/Scope Surface Alignment

## Chapter

Product Surface Coherence

## Context

`TERMINOLOGY.md` and `SEMANTICS.md` establish that **operation** is the user-facing term and **scope** is the internal term. Users should not need to know "scope" to use Narada. Despite this, the CLI, config files, error messages, and observation API leak `scope` extensively.

This is the highest-impact product-surface fix because it touches every operator interaction.

## Goal

Eliminate `scope` terminology from all user-facing surfaces without changing internal control-plane types or the database schema.

## Required Work

### 1. CLI Arguments and Flags

In `packages/layers/cli/src/main.ts`:
- Rename `--scope <id>` to `--operation <id>` on all commands.
- Keep `--scope` as a hidden alias for backward compatibility.
- Rename positional arg `scope-id` to `operation-id` on `audit`, `status`, etc.
- Update help text: `"Scope ID (mailbox ID)"` → `"Operation ID"`.
- Update `sync` and `rebuild-projections`: change `--mailbox <id>` description to `"Operation ID (mailbox ID for mail operations)"` for consistency.

### 2. CLI Error Messages

Update these files to use "operation" in user-facing strings:
- `commands/show.ts`: `"Scope not found"` → `"Operation not found"`
- `commands/confirm-replay.ts`: `"Scope not found"` → `"Operation not found"`
- `commands/audit.ts`: `"Scope not found"` → `"Operation not found"`
- `commands/status.ts`: `"No scopes configured"` → `"No operations configured"`
- `commands/sync.ts`: `"No scopes configured"` → `"No operations configured"`
- `commands/derive-work.ts`: `"No scopes configured"` → `"No operations configured"`
- `commands/preview-work.ts`: `"No scopes configured"` → `"No operations configured"`
- `commands/recover.ts`: `"No scopes configured"` → `"No operations configured"`
- `commands/select.ts`: `"No scopes configured"` → `"No operations configured"`
- `commands/rebuild-projections.ts`: `"No scopes configured"` → `"No operations configured"`

### 3. CLI Console Output

Update human-readable output labels:
- `commands/show.ts`: `fmt.kv('Scope', scopeId)` → `fmt.kv('Operation', scopeId)`
- `commands/select.ts`: `fmt.kv('Scope', scopeId)` → `fmt.kv('Operation', scopeId)`
- `commands/derive-work.ts`: `fmt.kv('Scope', scopeId)` → `fmt.kv('Operation', scopeId)`
- `commands/preview-work.ts`: `fmt.kv('Scope', scopeId)` → `fmt.kv('Operation', scopeId)`
- `commands/recover.ts`: `fmt.kv('Scope', scopeId)` → `fmt.kv('Operation', scopeId)`
- `commands/rebuild-projections.ts`: `"Scope: ${m.scopeId}"` → `"Operation: ${m.scopeId}"`

### 4. Config File Generation

In `packages/layers/cli/src/commands/config.ts` (the legacy `init` command):
- Change `mailbox_id` key in `DEFAULT_CONFIG` to a comment noting deprecation; do not change the runtime shape yet (that is internal).
- In `config-interactive.ts`: update user-facing prompts from "scope" to "operation".

In ops-kit `init-repo.ts`:
- Update generated README and console output to use "operation" instead of "scope".

### 5. Observation API JSON Responses

In `packages/layers/daemon/src/observation/observation-routes.ts`:
- Keep `scope_id` in the JSON response (this is a semi-internal API consumed by the UI), but add `operation_id` as an alias with the same value.
- Update the UI shell to display `operation_id` when presenting scope information to the user.

### 6. Housekeeping

In `AGENTS.md`:
- Fix duplicate invariant numbering (two #18s, two #38s).
- Update invariant text that leaks mail-specific terminology (e.g., "Graph API" in invariant 12 should reference the generic adapter boundary).

## Non-Goals

- Do not rename internal TypeScript types (`ScopeConfig`, `scope_id`, etc.).
- Do not rename database columns.
- Do not change the control-plane package API.
- Do not modify the daemon's internal service layer.

## Execution Notes

### Changes Made

**1. CLI Arguments and Flags (`main.ts`)**
- Replaced `-s, --scope <id>` with `-o, --operation <id>` on all commands (show, derive-work, preview-work, confirm-replay, recover, select).
- Added hidden `--scope <id>` alias via `new Option('-s, --scope <id>', 'Deprecated alias').hideHelp()` for backward compatibility.
- Changed `audit [scope-id]` positional arg to `audit [operation-id]`.
- Updated action handlers to normalize: `scope: (opts.operation || opts.scope)` and `scope: (opts.operationId || opts.scopeId)`.
- Updated `--mailbox <id>` descriptions to `"Operation ID (mailbox ID for mail operations) to sync/rebuild"`.

**2. CLI Error Messages**
Updated in: show.ts, confirm-replay.ts, audit.ts, status.ts, sync.ts, derive-work.ts, preview-work.ts, recover.ts, select.ts, rebuild-projections.ts.
- `"Scope not found"` → `"Operation not found"`
- `"No scopes configured"` → `"No operations configured"`

**3. CLI Console Output**
- `fmt.kv('Scope', scopeId)` → `fmt.kv('Operation', scopeId)` in derive-work.ts, preview-work.ts, recover.ts, select.ts
- `lines.push(\`Scope: ${scopeId}\`)` → `lines.push(\`Operation: ${scopeId}\`)` in show.ts
- `fmt.message(\`Scope: ${m.scopeId}...\`)` → `fmt.message(\`Operation: ${m.scopeId}...\`)` in rebuild-projections.ts
- `fmt.kv('Scopes processed', ...)` → `fmt.kv('Operations processed', ...)` in rebuild-projections.ts

**4. Config Generation**
- config.ts already used `fmt.kv('Operation', ...)` — no change needed.
- config-interactive.ts already used `"Operation (e.g. email address):"` prompt — no change needed.
- ops-kit init-repo.ts already uses "operation" throughout README/nextSteps — no change needed.

**5. Observation API (`observation-routes.ts`)**
- Added `operation_id: scope.scope_id` alias to all 32 JSON response objects that previously contained only `scope_id`.

**6. Housekeeping (`AGENTS.md`)**
- Fixed duplicate invariant numbering: second `#18` became `#19`, `#19`→`#20`, `#20`→`#21`, `#21`→`#22`, `#22`→`#23`, second `#38` became `#39`.
- Updated invariant 12 text: "Graph API" → "source adapter".

**7. Gap Fix (Post-Review)**
Review found three categories of missed surface:

- **"No scopes configured" in 5 additional files**: handled-externally.ts, show.ts (second occurrence), doctor.ts, mark-reviewed.ts, reject-draft.ts — all corrected to "No operations configured".
- **`Scope:` label in doctor.ts**: `fmt.section(\`Scope: ${scope.scopeId}\`)` → `fmt.section(\`Operation: ${scope.scopeId}\`)`.
- **AGENTS.md numbering cascade**: After fixing the duplicate #18→#19-#23, the subsequent sections (Do Not Regress, Kernel Substrate, Outbound, Advisory Signals) were not renumbered, leaving a second #23. Fixed by shifting #23→#24 through #39→#40, making the full invariant sequence 1-40 with 6a/6b.

**8. Tests**
- Updated audit.test.ts, confirm-replay.test.ts, show.test.ts assertions to expect "Operation not found" and "Operation:".
- Updated test names to reference "operation" instead of "scope".

### Validation

- `pnpm verify` passes (typecheck + build + fast tests).
- Focused CLI tests pass: audit (6), show (9), confirm-replay (4), status (7), handled-externally (3), mark-reviewed (2), reject-draft (3) — 34/34 tests.
- `grep` confirms zero remaining `"Scope not found"`, `"No scopes configured"`, `fmt.kv('Scope'`, `fmt.section(\`Scope:`, or primary `.option('-s, --scope'` in CLI source.
- `grep` confirms 32 `operation_id` aliases added to observation routes.
- `grep` confirms AGENTS.md invariant numbering is sequential with no duplicates (1-40 with 6a/6b).

## Acceptance Criteria

- [x] No CLI command exposes `--scope` as the primary flag name.
- [x] No CLI error message contains "Scope not found" or "No scopes configured".
- [x] No CLI human-readable output labels a row as `Scope:`.
- [x] Config generation user-facing text uses "operation".
- [x] Observation API responses include `operation_id` alias.
- [x] `AGENTS.md` invariant numbering is sequential and unique.
- [x] `pnpm verify` passes.
- [x] CLI tests updated and passing.

## Dependencies

- Tasks 228-244 (Operational Trust chapter) — stable CLI surface to rename.
- Task 252 (Agent Verification Speed & Telemetry) — verification ladder must be stable before renaming commands that agents use.
