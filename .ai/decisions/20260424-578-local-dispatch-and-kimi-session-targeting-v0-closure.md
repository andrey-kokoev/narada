---
closes_tasks: [578]
decided_at: 2026-04-24
decided_by: a3
reviewed_by: a3
governance: derive -> propose
---

# Decision 578 — Local Dispatch And Kimi Session Targeting v0 Closure

## Status

Chapter 575–578 is closed. The first bounded local dispatch implementation slice is real, tested, and in production code. Principal-to-session binding, dispatch packet targeting, and a local execution-start path now exist.

---

## What This Chapter Produced

### Task 575 — Principal Session Binding Registry

**Artifact:** Decision 574 contract + `packages/layers/control-plane/src/principal-runtime/session-binding.ts`

**Types:**

| Type | Purpose |
|------|---------|
| `KimiSessionBinding` | Canonical binding shape: `principal_id`, `session_id`, `session_title`, `bound_at`, `last_verified_at`, `bound_by` |
| `PrincipalSessionBindingSnapshot` | Serialization envelope for JSON persistence |
| `InMemoryPrincipalSessionBindingRegistry` | In-memory CRUD with `resolve()`, `hasBinding()` |
| `JsonPrincipalSessionBindingRegistry` | JSON-backed persistence with `init()` / `flush()`, corrupt-file graceful handling |

**Storage path:** `${NARADA_PRINCIPAL_STATE_DIR}/principal-session-bindings.json` (or `~/.narada/` default)

**Tests:** 19 tests in `packages/layers/control-plane/test/unit/principal-runtime/session-binding.test.ts`

**Authority:** Binding registry is advisory. Missing/stale/corrupt bindings are handled gracefully — dispatch falls back to `--continue` or fresh session.

### Task 576 — Dispatch Packet Session Targeting

**Files:**
- `packages/layers/cli/src/lib/task-lifecycle-store.ts` — `DispatchPacketRow` extended with `target_session_id` and `target_session_title`
- `packages/layers/cli/src/commands/task-dispatch.ts` — `doPickup` resolves binding and stores targeting on packet

**Schema addition:**

```sql
-- Added to dispatch_packets table
target_session_id text,
target_session_title text
```

**Tests:** 3 new tests in `packages/layers/cli/test/commands/task-dispatch.test.ts`:
- Pickup includes resolved session targeting when binding exists
- Pickup handles missing binding gracefully (null targeting)
- Status shows session targeting in output

### Task 577 — Local Work Pickup Execution v0

**File:** `packages/layers/cli/src/commands/task-dispatch.ts`

**New action:** `task dispatch start`

```bash
narada task dispatch start --agent <id>          # dry-run: emits recommended command
narada task dispatch start --agent <id> --exec   # signals intent to spawn
```

**Behavior:**
1. Finds agent's active pickup packet (`picked_up` or `renewed`)
2. Validates lease has not expired
3. Transitions packet to `executing`
4. Reads task context (title, goal) from markdown
5. Builds recommended `kimi` command:
   - `--session <target_session_id>` if binding targeting exists on packet
   - `--continue` otherwise

**Boundary preservation:**
- Assignment → `task-claim`
- Dispatch/pickup → `task dispatch pickup`
- Execution start → `task dispatch start`
- No single action collapses these zones

**Tests:** 5 new tests in `task-dispatch.test.ts`:
- Transitions packet to executing and returns execution context
- Uses `--session` when binding targeting exists, `--continue` otherwise
- Rejects start when no active pickup exists
- Rejects start when lease is expired
- Returns `action: 'executed'` when `--exec` is set

---

## Settled Doctrine

| Criterion | Status | Evidence |
|-----------|--------|----------|
| Principal-to-session binding exists as local runtime state | ✅ | `session-binding.ts` + JSON persistence |
| Binding registry handles missing/stale/corrupt gracefully | ✅ | Tests cover all three failure modes |
| Dispatch packet carries explicit session targeting | ✅ | `target_session_id` / `target_session_title` on `DispatchPacketRow` |
| Target resolution uses binding registry, not chat memory | ✅ | `doPickup` calls `JsonPrincipalSessionBindingRegistry.resolve()` |
| Dispatch remains distinct from execution start | ✅ | `pickup` creates packet; `start` transitions to `executing` |
| Bounded local execution-start path exists | ✅ | `task dispatch start` with lease validation + command emission |
| Assignment governance remains intact | ✅ | No changes to `task-claim`, `task-release`, or assignment JSON |
| Audit linkage preserved | ✅ | Packet status transitions are durable SQLite mutations |
| Tests exist and pass | ✅ | 22 dispatch tests pass (14 Task 572 + 3 Task 576 + 5 Task 577) |

---

## Deferred Gaps

| Item | Why Deferred | Destination |
|------|-------------|-------------|
| **Heartbeat daemon** | Requires background process or cron; expiry is passive for v0 | Future daemon chapter |
| **Auto-dispatch on claim** | Flag exists in Decision 571 but not wired into `task-claim` | Task 580+ |
| **Assignment migration to SQLite** | Assignments still in JSON; `assignment_id` FK deferred | Task 564 follow-up |
| **Actual `kimi` session spawn** | `doStart` emits recommended command only; `--exec` is a signal, not a subprocess spawn | Task 581+ — requires `kimi-cli` integration |
| **Check-in / overrun monitoring** | Decision 579 defines authority model but schema migration not yet applied | Task 580+ |
| **Remote/distributed dispatch** | Explicitly out of scope for v0; local surface only | Future chapter |
| **Workbench dispatch pane** | UI rendering of dispatch state deferred | Task 583+ |
| **Explicit `--principal-state-dir` CLI option** | Env var + cwd fallback covers v0; explicit flag useful for multi-repo | Possible follow-up |

---

## What Still Separates Pickup From Fuller Unattended Execution

The current implementation is **bounded local dispatch** — not unattended execution. The following gaps remain between `task dispatch start` and a full agent-runtime execution loop:

1. **No automatic spawn**: `doStart` emits a recommended command string. The operator or agent must still run it. Actual subprocess spawn requires `kimi-cli` integration and session management.

2. **No progress heartbeat**: The dispatch heartbeat extends the lease but does not signal progress. Decision 579 defines expectation/overrun authority but the schema migration and check-in surface are not yet implemented.

3. **No evidence of work product**: Execution produces no durable artifact beyond the packet status transition. Reports, changed files, and verification remain manual (`task-report`).

4. **No retry/re-dispatch automation**: Expired packets make tasks eligible for re-dispatch, but no daemon scans for expiry or auto-re-dispatches.

5. **Single-session assumption**: The binding targets one `kimi-cli` session per principal. Multi-session or session handoff is not supported.

---

## Residual Risks

1. **JSON assignment drift.** Assignments are still in JSON files while dispatch packets are in SQLite. If the JSON and SQLite diverge, the dispatch surface may show inconsistent state. Mitigation: both are read from the same filesystem; bounded to concurrent mutations.

2. **Lease expiry is passive.** Without a daemon, expired packets remain in `picked_up` status until explicitly queried. The next query classifies them as expired, but no automatic re-dispatch occurs.

3. **Binding state is local filesystem.** The JSON binding registry lives on the local filesystem. If the filesystem is lost or corrupted, bindings must be re-established. Mitigation: bindings are advisory; missing bindings fall back to `--continue`.

4. **Execution start is not a spawn.** The `--exec` flag signals intent but does not actually spawn a `kimi-cli` process. An operator must still run the recommended command. This is intentional for v0 but means the loop is not yet closed.

---

## Verification Evidence

- `pnpm verify` — 5/5 steps pass ✅
- `pnpm typecheck` — all 11 packages clean ✅
- `task-dispatch.test.ts` — 22/22 pass ✅
- `session-binding.test.ts` — 19/19 pass ✅
- `registry.test.ts` — 16/16 pass (no regression) ✅
- `task-lifecycle-store.test.ts` — 27/27 pass (no regression) ✅

---

## Closure Statement

Chapter 575–578 closes with a real, tested local dispatch surface that can target the correct `kimi-cli` session for a principal. The binding registry persists principal-to-session mappings locally. The dispatch packet carries targeting forward from pickup. The execution-start path transitions the packet to `executing` and emits the recommended command. Assignment, dispatch, and execution remain distinct zones. Deferred work (actual spawn, heartbeat daemon, check-in/overrun monitoring, assignment migration, workbench pane) is explicitly catalogued for subsequent chapters.

---

**Closed by:** a3  
**Closed at:** 2026-04-24
