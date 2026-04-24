---
status: closed
closed: 2026-04-23
closed_by: codex
governed_by: task_close:codex
created: 2026-04-23
depends_on: [536]
---

# Task 539 - Linux Operator Control Path

## Goal

Implement the bounded Linux Operator Console control path so Linux Sites are no longer read-mostly in the console layer.

## Required Work

1. Define the Linux control bridge over canonical operator actions.
2. Implement the control client path so console actions route through governed operators rather than direct store mutation.
3. Preserve Linux-specific access/privilege constraints honestly.
4. Add focused tests for supported and rejected cases.

## Acceptance Criteria

- [x] Linux control path exists for the parity target defined in Task 536.
- [x] All supported Linux console actions route through canonical operator actions.
- [x] Access/privilege failure surfaces are explicit and honest.
- [x] Focused tests exist and pass.
- [x] Verification or bounded blocker evidence is recorded.

## Execution Notes

### 1. Linux Site Control Client Implementation

Created `packages/sites/linux/src/site-control.ts` following the Windows pattern:

- **`mapConsoleActionToOperatorAction()`** — Maps console action types to canonical `OperatorActionType` values:
  - `approve` + `outbound_command` → `approve_draft_for_send`
  - `reject` + `outbound_command` → `reject_draft`
  - `retry` + `work_item` → `retry_work_item`
  - `mark_reviewed` + `outbound_command` → `mark_reviewed`
  - `handled_externally` + `outbound_command` → `handled_externally`
  - Unsupported combinations (e.g., `retry` + `outbound_command`, `cancel` + `work_item`) return clear rejection messages

- **`LinuxSiteControlClient`** — Bridges `ConsoleControlRequest` → `OperatorActionPayload` → `executeOperatorAction`:
  - Opens the Site's local SQLite coordinator database
  - Creates `SqliteCoordinatorStore`, `SqliteOutboundStore`, `SqliteIntentStore`
  - Resolves `scope_id` from config or falls back to site ID
  - Delegates to `executeOperatorAction` from `@narada2/control-plane`
  - Closes DB connection in `finally` block

- **`createLinuxSiteControlClient(siteId, mode)`** — Factory that wires the client to a specific Linux Site

### 2. Console Adapter Update

Updated `packages/sites/linux/src/console-adapter.ts`:
- `linuxSiteAdapter.createControlClient()` now returns a real `LinuxSiteControlClient` via `createLinuxSiteControlClient()` instead of the stub
- `UnauthorizedLinuxSiteControlClient` preserved for system-mode Sites the current user cannot read
- `LinuxSiteControlClient` re-exported from `site-control.ts`

### 3. Index Exports

Updated `packages/sites/linux/src/index.ts` to export:
- `LinuxSiteControlClient`
- `createLinuxSiteControlClient`
- `LinuxSiteControlContext`
- `LinuxSiteControlContextFactory`

### 4. Tests

Rewrote `packages/sites/linux/test/console-adapter.test.ts` `LinuxSiteControlClient` tests:

| Test | Result |
|------|--------|
| `routes approve request through executeOperatorAction` | ✅ accepted |
| `routes retry request through executeOperatorAction` | ✅ accepted |
| `routes reject request through executeOperatorAction` | ✅ accepted |
| `routes mark_reviewed request through executeOperatorAction` | ✅ accepted |
| `returns rejected when target does not exist` | ✅ rejected |
| `rejects generic outbound retry with clear message` | ✅ rejected with detail |
| `rejects cancel work item with clear message` | ✅ rejected with detail |
| `rejects unsupported action combination` | ✅ rejected with detail |

All existing observation tests remain passing (8 tests).

## Verification

```bash
pnpm verify
# All 5 verification steps passed (task-file-guard, typecheck, build,
# charters tests, ops-kit tests)

cd packages/sites/linux && pnpm exec vitest run
# 109 tests passed across 8 test files

cd packages/layers/cli && pnpm exec vitest run test/commands/console-server.test.ts
# 24 tests passed
```

Results:
- `pnpm verify` passed all 5 verification steps
- Linux site tests: 109 passing across 8 test files
- CLI console-server tests: 24 passing
- No existing tests broken
- No new lint errors introduced

---

**governed_by: task_close:codex**
