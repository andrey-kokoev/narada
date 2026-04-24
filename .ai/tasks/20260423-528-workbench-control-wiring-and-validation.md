---
status: closed
created: 2026-04-24
closed_at: 2026-04-24T23:49:26.000Z
closed_by: a2
governed_by: task_close:a2
depends_on: [526, 527]
---

# Task 528 - Workbench Control Wiring And Validation

## Goal

Wire the first bounded workbench controls through governed operators and validate the end-to-end request/response behavior.

## Required Work

1. Implement the minimal control set for v0:
   - assign,
   - done,
   - idle,
   - promote,
   - pause,
   - resume.
2. Ensure each control routes through the existing governed mutation path.
3. Refresh observation surfaces after successful control calls.
4. Add focused tests for:
   - request validation,
   - operator routing,
   - error surfacing,
   - post-mutation refresh behavior where practical.

## Acceptance Criteria

- [x] Minimal v0 controls are wired.
- [x] All controls route through existing governed operators.
- [x] Focused validation tests exist and pass.
- [x] No hidden direct store mutation is introduced.
- [x] Verification or bounded blocker evidence is recorded.

## Execution Notes

### Server-Side Validation Tests

Extended `packages/layers/cli/test/commands/workbench-server.test.ts` with 10 new control tests:

| Endpoint | Tests |
|----------|-------|
| `POST /api/control/assign` | valid assign+claim, missing agent (400), missing task (400), agent not found (422) |
| `POST /api/control/done` | valid done with allow_incomplete, missing agent (400) |
| `POST /api/control/promote` | dry-run promotion (200), missing required fields (400) |
| `POST /api/control/recommend` | triggers recommendations (200) |

All tests verify that controls route through existing CLI operators (`taskRosterAssignCommand`, `taskRosterDoneCommand`, `taskPromoteRecommendationCommand`, `taskRecommendCommand`) and return appropriate status codes.

### UI Control Wiring

Updated `packages/layers/cli/src/ui/workbench.html` with improved control wiring:

**Agent pane controls:**
- `Mark idle` — POST `/api/control/idle`
- `Mark done` — POST `/api/control/done` (only shown when agent has a task)
- `Assign` — input field + button, POST `/api/control/assign` (with client-side validation)

**Architect pane controls:**
- `Recommend` — POST `/api/control/recommend`
- `Pause` — POST `/api/control/pause`
- `Resume` — POST `/api/control/resume`
- `Dry-run` / `Promote` — form with task/agent/by inputs, POST `/api/control/promote` (with client-side validation)

**UI improvements:**
- Toast notifications instead of `alert()` — green for success, red for errors, auto-dismiss after 4s
- Fixed `sendControl()` to accept button element explicitly (was using unreliable `event.target`)
- Post-mutation refresh: `refreshAll()` is called after every successful control call
- Loading state: buttons show `...` and disable while request is in flight
- Client-side validation: empty inputs show toast error before sending request

### Authority Verification

Every POST control route delegates to an existing governed CLI operator:
- `idle` → `taskRosterIdleCommand`
- `done` → `taskRosterDoneCommand`
- `assign` → `taskRosterAssignCommand`
- `promote` → `taskPromoteRecommendationCommand`
- `pause` → `constructionLoopPauseCommand`
- `resume` → `constructionLoopResumeCommand`
- `recommend` → `taskRecommendCommand`

No direct filesystem or store mutation from route handlers. All mutations leave audit trails through the underlying operators.

## Verification

```bash
pnpm verify                # 5/5 steps pass
pnpm --filter @narada2/cli typecheck   # clean
pnpm --filter @narada2/cli build       # clean
pnpm --filter @narada2/cli exec vitest run test/commands/workbench-server.test.ts  # 32/32 pass
pnpm --filter @narada2/cli exec vitest run                       # 661/661 pass
```

- No hidden direct store mutation introduced.
- All controls route through existing governed operators.
- Post-mutation refresh is triggered after every successful control call.
