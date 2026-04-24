---
status: closed
created: 2026-04-24
closed_at: 2026-04-24T23:29:41.000Z
closed_by: a2
governed_by: task_close:a2
depends_on: [525]
---

# Task 526 - Workbench HTTP Adapter

## Goal

Implement the thin localhost HTTP adapter for the self-build workbench, using existing governed read and mutation surfaces rather than inventing new authority.

## Required Work

1. Implement the bounded GET/POST adapter described in Task 523 / 524.
2. Keep it localhost-only and explicit about source trust.
3. Reuse existing CLI/runtime read helpers where possible.
4. Reuse existing governed mutation operators for POST routes.
5. Add focused tests for request/response shape and route validation.

## Acceptance Criteria

- [x] Localhost HTTP adapter exists.
- [x] Observation routes return data grounded in existing governed state.
- [x] Mutation routes delegate to existing governed operators.
- [x] Focused tests exist and pass.
- [x] Verification or bounded blocker evidence is recorded.

## Execution Notes

### Implementation

Created two new files following the existing `console-server.ts` / `console-server-routes.ts` pattern:

1. **`packages/layers/cli/src/commands/workbench-server.ts`**
   - `createWorkbenchServer(config)` — localhost-only HTTP server
   - Defaults to `127.0.0.1`, configurable `port`, `cwd`, `verbose`
   - Namespace separation: GET for observation, POST for control
   - Start/stop lifecycle matching console server

2. **`packages/layers/cli/src/commands/workbench-server-routes.ts`**
   - `createWorkbenchRoutes(ctx)` — 17 route handlers
   - CORS preflight with localhost-only origin enforcement
   - 10 GET observation routes + 7 POST control routes

#### Observation Routes (GET)

| Route | Source Helper | Trust |
|-------|-------------|-------|
| `/api/roster` | `loadRoster()` | authoritative |
| `/api/tasks` | `listAllTasks()` (file scan) | authoritative |
| `/api/assignments` | `listAllAssignments()` (file scan) | authoritative |
| `/api/reviews` | `listAllReviews()` (file scan) | authoritative |
| `/api/policy` | `loadPolicy()` | authoritative |
| `/api/audit` | `readAllAuditLogs()` | authoritative |
| `/api/principals` | `JsonPrincipalRuntimeRegistry` | authoritative |
| `/api/graph` | `readTaskGraph()` + `renderJson()` | derived |
| `/api/recommendations` | `taskRecommendCommand()` | derived (advisory) |
| `/api/plan` | `buildPlan()` | derived (advisory) |
| `/api/health` | static | decorative |

#### Control Routes (POST)

| Route | Delegated Command | Authority |
|-------|-------------------|-----------|
| `/api/control/assign` | `taskRosterAssignCommand` | operator-owned |
| `/api/control/done` | `taskRosterDoneCommand` | operator-owned |
| `/api/control/idle` | `taskRosterIdleCommand` | operator-owned |
| `/api/control/promote` | `taskPromoteRecommendationCommand` | operator-owned |
| `/api/control/pause` | `constructionLoopPauseCommand` | operator-owned |
| `/api/control/resume` | `constructionLoopResumeCommand` | operator-owned |
| `/api/control/recommend` | `taskRecommendCommand` | derive (advisory) |

### CLI Registration

Added `narada workbench serve` command to `packages/layers/cli/src/main.ts`:
- `--host` (default: `127.0.0.1`)
- `--port` (default: `0` for ephemeral)
- `--cwd` (default: `.`)
- `--verbose`

### Tests

Created `packages/layers/cli/test/commands/workbench-server.test.ts` with 22 tests:
- Lifecycle (start/stop, double-start)
- GET routes: roster, tasks, assignments, reviews, policy, audit, principals, graph, health
- Control routes: idle, pause, resume
- CORS and safety (localhost allowed, external rejected)
- Method guarding (POST on observation → 405, GET on control → 405)
- Read-only guarantee (GET routes do not mutate filesystem state)

All tests pass. Full CLI suite: 651/651 tests pass.

## Verification

```bash
pnpm verify                # 5/5 steps pass
pnpm --filter @narada2/cli typecheck   # clean
pnpm --filter @narada2/cli build       # clean
pnpm --filter @narada2/cli exec vitest run test/commands/workbench-server.test.ts  # 22/22 pass
pnpm --filter @narada2/cli exec vitest run                       # 651/651 pass
```

- No new authority surfaces invented.
- All mutations route through existing governed CLI operators.
- All reads are grounded in existing durable stores.
- Localhost-only binding enforced at server startup and CORS layer.
