---
status: closed
created: 2026-04-24
depends_on: [575, 576]
closed_at: 2026-04-24T16:50:00.000Z
closed_by: a3
governed_by: task_close:a3
---

# Task 577 - Local Work Pickup Execution v0

## Goal

Implement the first bounded local pickup/execution-start path so an assigned principal can receive work in the targeted `kimi-cli` session without manual chat relay.

## Required Work

1. Implement the smallest safe local pickup/execution-start path on top of the dispatch surface.
2. Use the resolved principal-session binding to target the correct `kimi-cli` session.
3. Keep pickup/admission distinct from assignment and execution confirmation.
4. Preserve governed auditability for:
   - assignment
   - dispatch/pickup
   - execution start attempt
5. Add focused verification for the local path.
6. Record verification or bounded blockers.

## Acceptance Criteria

- [x] Local dispatch can cause assigned work to become pickup-ready in the targeted principal session
- [x] Session targeting uses the binding registry and dispatch surface rather than manual relay
- [x] Assignment, dispatch/pickup, and execution start remain distinct in the implementation
- [x] Focused verification exists and passes, or bounded blockers are explicit
- [x] Verification or bounded blocker evidence is recorded

## Execution Notes

1. `doStart()` implemented in `packages/layers/cli/src/commands/task-dispatch.ts`:
   - Finds the agent's active pickup packet (`picked_up` or `renewed` status)
   - Validates lease has not expired
   - Transitions packet to `executing` via `store.updateDispatchStatus()`
   - Reads task context (title, goal) from markdown
   - Builds recommended `kimi` command: `--session <target_session_id>` if binding targeting exists on the packet, otherwise `--continue`
   - Respects `--exec` flag (returns `action: 'executed'` vs `'ready'`)
2. Principal-session binding resolution:
   - `doPickup()` resolves the binding at pickup time via `resolvePrincipalStateDir({ cwd })`
   - This helper checks `NARADA_PRINCIPAL_STATE_DIR` env var, then falls back to `cwd`
   - The resolved `target_session_id` / `target_session_title` is stored on the `DispatchPacketRow`
   - `doStart()` reads targeting from the packet, not from the registry directly
3. Boundary preservation:
   - **Assignment** → `task-claim` creates assignment JSON + SQLite lifecycle
   - **Dispatch/pickup** → `task dispatch pickup` creates packet with targeting
   - **Execution start** → `task dispatch start` transitions packet to `executing` and emits the recommended command
   - No single action collapses these zones
4. Explicit `--principal-state-dir` CLI option was **not added** to the `task dispatch` surface.
   - The env var + cwd fallback covers the bounded v0 path
   - Adding an explicit `--principal-state-dir` flag is a possible follow-up if multi-repo or non-cwd binding storage becomes needed

## Verification

- `packages/layers/cli/test/commands/task-dispatch.test.ts` — 22 tests pass (17 existing + 5 new `start` tests)
  - transitions packet to executing and returns execution context
  - uses `--session` when binding targeting exists, `--continue` otherwise
  - rejects start when no active pickup exists
  - rejects start when lease is expired
  - returns `action: 'executed'` when `--exec` is set
- `pnpm verify` clean (5 steps)
