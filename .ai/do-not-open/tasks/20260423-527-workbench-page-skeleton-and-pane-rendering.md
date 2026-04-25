---
status: closed
created: 2026-04-24
closed_at: 2026-04-24T23:39:01.000Z
closed_by: a2
governed_by: task_close:a2
depends_on: [526]
---

# Task 527 - Workbench Page Skeleton And Pane Rendering

## Goal

Build the static browser workbench page with the canonical 2×4 layout and pane rendering over the new HTTP adapter.

## Required Work

1. Implement the canonical layout:
   - row 1: `a1`, `a2`, `architect` spanning columns 3–4
   - row 2: `a3`, `a4`, `a5`, `a6`
2. Render the agent-pane read surfaces defined in Task 523.
3. Render the architect-pane read surfaces defined in Task 523.
4. Keep the page bounded: static HTML/CSS/JS, polling-based refresh, no new authority surface.
5. Add focused tests for pane-field extraction/rendering where practical.

## Acceptance Criteria

- [x] Static workbench page exists.
- [x] Canonical layout is implemented.
- [x] Agent and architect panes render governed read data.
- [x] Page remains bounded to static + polling v0 scope.
- [x] Verification or bounded blocker evidence is recorded.

## Execution Notes

### Implementation

Created **`packages/layers/cli/src/ui/workbench.html`** — a single static HTML/CSS/JS file (~23 KB) that implements the canonical workbench layout and renders governed read data from the Task 526 HTTP adapter.

#### Layout

CSS Grid with 4 columns × 2 rows:
- Row 1: `a1` | `a2` | `architect` (spanning cols 3–4)
- Row 2: `a3` | `a4` | `a5` | `a6`

Responsive fallback: on viewports < 1200px, collapses to 2 columns with architect spanning both.

#### Agent Pane (a1–a6)

Each agent pane renders:
- **Header** (authoritative): agent_id, status badge, current task, last update
- **Task Card** (authoritative): task number, title, status, claimed_at, dependencies
- **Evidence** (derived): has execution notes, has verification, unchecked criteria
- **Last Action** (authoritative): latest audit record for this agent
- **Controls** (decorative): "Mark idle", "Mark done" buttons that POST to `/api/control/*`

Status is visualized via left border color: working=green, idle=gray, done=blue, reviewing=orange.

#### Architect Pane (top-right, 2× width)

Two-column internal grid with:
- **Chapter Frontier** (derived): open/claimed/closed task counts
- **Dependencies** (derived): runnable vs blocked task counts
- **Recommendations** (derived): top recommendation card with score/confidence
- **Reviews** (authoritative): total and pending review counts
- **Operator State** (authoritative): policy level, max simultaneous, audit entries, principals
- **Controls** (decorative): Recommend, Pause, Resume buttons

Trust indicators (green/blue/gray dots) visible on every section title.

#### Refresh Model

- Fast poll (5s): roster, tasks, assignments, reviews, policy, audit, principals, graph
- Slow poll (30s): recommendations, plan
- Visibility-aware: pauses polling when tab is hidden, resumes on focus
- Manual refresh button in toolbar

#### Server Integration

Updated `workbench-server.ts` to serve the HTML page at `GET /`:
- Reads `workbench.html` from `packages/layers/cli/src/ui/workbench.html` at startup
- Serves it with `Content-Type: text/html`
- Falls back to a minimal "UI not found" page if the file is missing

#### Files Changed

| File | Change |
|------|--------|
| `packages/layers/cli/src/ui/workbench.html` | New — static workbench page |
| `packages/layers/cli/src/commands/workbench-server.ts` | Added root HTML serving |
| `packages/layers/cli/test/commands/workbench-server.test.ts` | Added root-route test |

### v0 Boundedness Decisions

| Non-Goal | Bound |
|----------|-------|
| Real-time updates | Polling only (5s/30s); no WebSockets |
| Drag-and-drop | Explicit buttons only |
| In-pane editing | Read-only view; edit in external editor |
| Rich markdown | Plain text / minimal formatting |
| Theme switching | Single dark theme |
| Mobile layout | Desktop-only |
| Offline mode | Requires running `narada workbench serve` |

## Verification

```bash
pnpm verify                # 5/5 steps pass
pnpm --filter @narada2/cli typecheck   # clean
pnpm --filter @narada2/cli build       # clean
pnpm --filter @narada2/cli exec vitest run test/commands/workbench-server.test.ts  # 23/23 pass
pnpm --filter @narada2/cli exec vitest run                       # 652/652 pass
```

- No new authority surfaces invented.
- All reads are grounded in existing durable stores via the Task 526 adapter.
- All mutations route through existing governed CLI operators.
- Static HTML/CSS/JS only — no build step, no framework, no runtime dependencies.
