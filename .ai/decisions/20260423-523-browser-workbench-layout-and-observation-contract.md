# Decision: Browser Workbench Layout and Observation Contract

**Date:** 2026-04-23
**Task:** 523
**Depends on:** 522 (Local Self-Build Runtime Boundary Contract)
**Chapter:** Local Self-Build Runtime And Workbench (522–525)
**Verdict:** **Workbench contract defined. All read surfaces are grounded in existing governed state. No new authority surfaces invented.**

---

## 1. Problem Statement

Narada's build loop currently depends on terminal choreography and chat transcripts for operator visibility into agent state, assignments, and blockers. The existing operator console (`packages/layers/daemon/src/ui/index.html`) is scope-oriented — designed for mailbox operation observation — not agent-oriented. A new workbench surface is needed that presents the local self-build runtime's state legibly, with operator controls routed through existing governed operators.

This decision specifies the first browser workbench: its layout, the read surfaces each pane exposes, and the observation model that backs it.

---

## 2. Core Thesis

> **The workbench is an observation and control surface, not a runtime host.**

- The workbench **reads** from existing durable stores (task files, roster, assignments, policy, audit log, principal runtime).
- The workbench **mutates** only by routing operator actions through existing governed CLI operators.
- The workbench **never** invents new authority surfaces or smuggles state through chat.

---

## 3. Canonical v0 Layout

The v0 workbench uses a **2-row grid** with fixed agent positions:

```
┌─────────┬─────────┬─────────────────┬─────────────────┐
│   a1    │   a2    │    architect    │    architect    │
│  pane   │  pane   │     (wide)      │     (wide)      │
├─────────┼─────────┼─────────────────┼─────────────────┤
│   a3    │   a4    │       a5        │       a6        │
│  pane   │  pane   │      pane       │      pane       │
└─────────┴─────────┴─────────────────┴─────────────────┘
```

**Row 1:** `a1` | `a2` | `architect` (spanning columns 3–4)  
**Row 2:** `a3` | `a4` | `a5` | `a6`

### Layout Invariants

1. **Agent panes are fixed-position.** `a1` is always top-left; `architect` is always top-right wide. This creates spatial memory for the operator.

2. **Architect pane is always 2× width.** The architect role monitors the swarm and proposes work; it needs more horizontal space for chapter frontiers and dependency graphs.

3. **Panes are resizable within row bounds.** An operator may resize pane widths, but pane positions (which agent is where) are fixed.

4. **Pane state persists browser-local.** Resized widths and collapsed sections are stored in `localStorage`. This is decorative state, not authoritative.

---

## 4. Agent Pane Read Surface

Each agent pane (`a1`–`a6`) exposes the following read surfaces, derived from existing governed state:

### 4.1 Header

| Field | Source | Trust |
|-------|--------|-------|
| Agent ID | `roster.json` → `agents[].agent_id` | authoritative |
| Agent status | `roster.json` → `agents[].status` | authoritative |
| Current task | `roster.json` → `agents[].assigned_task` | authoritative |
| Last update | `roster.json` → `agents[].updated_at` | authoritative |

### 4.2 Assigned Task Card

| Field | Source | Trust |
|-------|--------|-------|
| Task number | `roster.json` → `agents[].assigned_task` | authoritative |
| Task title | `.ai/tasks/<file>` → front matter title | authoritative |
| Task status | `.ai/tasks/<file>` → front matter `status` | authoritative |
| Claimed at | `.ai/assignments/<task-id>.json` → `assignments[].claimed_at` | authoritative |
| Dependencies | `.ai/tasks/<file>` → front matter `depends_on` | authoritative |

### 4.3 Evidence Panel

| Field | Source | Trust |
|-------|--------|-------|
| Has execution notes | `.ai/tasks/<file>` → body contains `## Execution Notes` | derived |
| Has verification | `.ai/tasks/<file>` → body contains `## Verification` | derived |
| Unchecked criteria count | `.ai/tasks/<file>` → unchecked `- [ ]` items | derived |
| Last report | `.ai/tasks/<file>` → `## Execution Notes` timestamp or file mtime | derived |

### 4.4 Blockers Panel

| Field | Source | Trust |
|-------|--------|-------|
| Unmet dependencies | `task-governance.ts` → `checkDependencies()` | derived |
| Stale status | `roster.json` → `updated_at` vs. stale threshold | derived |
| Review needed | `.ai/tasks/<file>` → `verdict: needs_review` or review records | derived |
| Evidence gaps | `task-governance.ts` → `inspectTaskEvidence()` | derived |

### 4.5 Last Governed Action

| Field | Source | Trust |
|-------|--------|-------|
| Action type | `.ai/construction-loop/audit.jsonl` → latest `AutoPromotionAuditRecord` for agent | authoritative |
| Action timestamp | `.ai/construction-loop/audit.jsonl` → `timestamp` | authoritative |
| Action result | `.ai/construction-loop/audit.jsonl` → `status` | authoritative |

### 4.6 Agent Pane Controls

Each agent pane has **operator-triggered controls** that route through governed operators:

| Control | Triggered Command | Authority |
|---------|-------------------|-----------|
| **Assign task** | `narada task roster assign <agent> <task>` | operator-owned |
| **Mark done** | `narada task roster done <agent> <task>` | operator-owned |
| **Mark idle** | `narada task roster idle <agent>` | operator-owned |
| **View task** | Opens task file in read-only view | inspect |
| **View evidence** | `narada task evidence <task>` | inspect |

**No autonomous controls.** The workbench does not auto-assign, auto-promote, or auto-close. It surfaces controls for the operator to trigger.

---

## 5. Architect Pane Read/Control Surface

The architect pane (top-right, 2× width) exposes the following:

### 5.1 Chapter Frontier

| Field | Source | Trust |
|-------|--------|-------|
| Active chapters | `.ai/tasks/*.md` → chapter reservation files | authoritative |
| Chapter state | `.ai/tasks/*.md` → front matter `status` aggregation | derived |
| Open tasks by chapter | `task graph` → DAG analysis | derived |
| Blocked tasks | `task graph` → dependency analysis | derived |

### 5.2 Dependency State

| Field | Source | Trust |
|-------|--------|-------|
| Runnable tasks | `task graph` → tasks with all dependencies closed | derived |
| Blocked tasks | `task graph` → tasks with unmet dependencies | derived |
| Orphan closures | `task lint` → orphan closure detection | derived |
| Cycle warnings | `task lint` → circular dependency detection | derived |

### 5.3 Recommendation Queue

| Field | Source | Trust |
|-------|--------|-------|
| Top recommendation | `task-recommend` → `TaskRecommendation.primary` | derived (advisory) |
| Recommendation score | `task-recommend` → `score` | derived (advisory) |
| Recommendation confidence | `task-recommend` → `confidence` | derived (advisory) |
| Alternatives | `task-recommend` → `alternatives[]` | derived (advisory) |
| Abstained tasks | `task-recommend` → `abstained[]` | derived (advisory) |
| Recommender ID | `task-recommend` → `recommender_id` | authoritative |

### 5.4 Promotion Controls

| Control | Triggered Command | Authority |
|---------|-------------------|-----------|
| **Dry-run promotion** | `narada task promote-recommendation --dry-run` | operator-owned |
| **Live promotion** | `narada task promote-recommendation` | operator-owned |
| **Auto-promote (bounded)** | `narada construction-loop run` | governed — 12 hard gates |

### 5.5 Review Findings

| Field | Source | Trust |
|-------|--------|-------|
| Pending reviews | `.ai/reviews/*.md` → reviews without verdict | authoritative |
| Review verdicts | `.ai/reviews/*.md` → front matter `verdict` | authoritative |
| Reviewer | `.ai/reviews/*.md` → front matter `reviewer_agent_id` | authoritative |
| Reviewed task | `.ai/reviews/*.md` → front matter `task_id` | authoritative |

### 5.6 Operator-Gated Decisions

| Field | Source | Trust |
|-------|--------|-------|
| Pending approvals | `foreman_decisions` with `status: pending_approval` (when connected to control plane) | authoritative |
| Promotion audit trail | `.ai/construction-loop/audit.jsonl` | authoritative |
| Policy state | `.ai/construction-loop/policy.json` | authoritative |
| Pause status | `.ai/construction-loop/pause` file existence | authoritative |

### 5.7 Architect Pane Controls

| Control | Triggered Command | Authority |
|---------|-------------------|-----------|
| **Generate recommendations** | `narada task recommend` | derive (advisory) |
| **Build plan** | `narada construction-loop plan` | derive (advisory) |
| **Pause loop** | `narada construction-loop pause` | operator-owned |
| **Resume loop** | `narada construction-loop resume` | operator-owned |
| **Show metrics** | `narada construction-loop metrics` | inspect |

---

## 6. Observation/Read Model

The workbench read model is **grounded in existing governed state**. No new stores, tables, or APIs are invented.

### 6.1 Read Model Sources

| Data | File/Store | Reader | Refresh |
|------|-----------|--------|---------|
| Agent roster | `.ai/roster.json` | `loadRoster()` | Polling or file watcher |
| Task files | `.ai/tasks/*.md` | `readTaskFile()` | Polling or file watcher |
| Assignments | `.ai/assignments/*.json` | `loadAssignment()` | Polling or file watcher |
| Reviews | `.ai/reviews/*.md` | `readTaskFile()` | Polling or file watcher |
| Construction policy | `.ai/construction-loop/policy.json` | `loadPolicy()` | Polling or file watcher |
| Audit log | `.ai/construction-loop/audit.jsonl` | `readAuditLog()` | Polling or file watcher |
| Principal runtime | `config.json`-adjacent registry | `JsonPrincipalRuntimeRegistry` | Polling or registry watcher |
| Task graph | `.ai/tasks/*.md` → DAG | `task graph` | On demand |
| Recommendations | Ephemeral (computed) | `task-recommend` | On demand |

### 6.2 Read Model Invariants

1. **No ad hoc transcript scraping.** The workbench never reads chat transcripts, terminal scrollback, or agent logs as state sources.

2. **No hidden caching.** The workbench may cache read results for UI responsiveness, but the cache is advisory. The authoritative state is always in the durable stores.

3. **No write-through from read model.** The workbench read model has no write path. All mutations route through governed CLI operators.

4. **Source trust is visible.** Every displayed field carries an implicit trust classification:
   - **Authoritative** (green indicator): mirrors a durable row directly
   - **Derived** (blue indicator): computed from multiple sources
   - **Decorative** (gray indicator): presentational only (layout, timestamps)

### 6.3 API Surface (Workbench → Local Runtime)

The workbench communicates with the local runtime via a **thin HTTP API adapter** that delegates to existing CLI commands:

```typescript
interface WorkbenchApi {
  // Observation (GET)
  GET /api/roster → AgentRoster
  GET /api/tasks → TaskSummary[]
  GET /api/assignments → AssignmentRecord[]
  GET /api/reviews → ReviewSummary[]
  GET /api/policy → ConstructionLoopPolicy
  GET /api/audit → AutoPromotionAuditRecord[]
  GET /api/principals → PrincipalRuntimeObservation[]
  GET /api/graph → TaskGraph
  GET /api/recommendations → TaskRecommendation (on-demand)
  GET /api/plan → ConstructionLoopPlan (on-demand)

  // Control (POST) — all operator-owned, all audited
  POST /api/control/assign → { agent, task }
  POST /api/control/done → { agent, task }
  POST /api/control/idle → { agent }
  POST /api/control/promote → { task, agent, dryRun }
  POST /api/control/pause → { reason }
  POST /api/control/resume → {}
  POST /api/control/recommend → {} // triggers task-recommend
}
```

Each POST endpoint:
1. Validates the request
2. Invokes the corresponding CLI command
3. Returns the command result
4. Logs the operator action

---

## 7. UI Non-Goals for v0

The following are explicitly out of scope for the v0 workbench:

| Non-Goal | Reason |
|----------|--------|
| **Real-time updates** | v0 uses polling or manual refresh. WebSockets are future work. |
| **Drag-and-drop task assignment** | Assignments are triggered via explicit controls, not drag-and-drop. |
| **In-pane code editing** | Task file editing happens in the operator's editor, not the workbench. |
| **Rich text / markdown rendering** | Task bodies are shown as plain text or minimal markdown. |
| **Dark/light theme switching** | v0 has one theme (dark). Theme switching is decorative future work. |
| **Mobile layout** | v0 is desktop-only. Mobile is future work. |
| **Multi-repo view** | v0 shows one repo. Multi-repo is future work. |
| **Embedded chat** | Chat is external to the workbench. No chat pane. |
| **Agent log tailing** | Agent logs are not a governed state surface. View logs in terminal. |
| **Fancy animations** | Transitions are minimal. Animations are decorative future work. |
| **Custom pane plugins** | Pane content is fixed by contract. Extensibility is future work. |
| **Offline mode** | Workbench requires local runtime to be running. No offline caching. |

---

## 8. Bounded Blockers for v0 Workbench

| Blocker | Bound | Status |
|---------|-------|--------|
| HTTP API adapter | Thin adapter (~150 lines); delegates to CLI commands | Not yet implemented |
| Workbench HTML/CSS/JS | Static page with grid layout and polling | Not yet implemented |
| File watcher for refresh | `fs.watch` or polling-based | Not yet implemented |
| Cross-origin policy | Localhost-only; no auth needed for v0 | Design decision recorded |

---

## 9. Relation to Task 524

Task 524 (Local Self-Build Runtime Bridge Plan) will define:
- How Codex/chat agents bridge into the runtime without hidden transport
- How task governance and browser controls coordinate
- The exact wire protocol between workbench and local runtime

This decision (523) provides the layout and observation contract. Task 524 provides the bridge plan.

---

## Related Documents

- [`.ai/decisions/20260423-522-local-self-build-runtime-boundary-contract.md`](20260423-522-local-self-build-runtime-boundary-contract.md) — Runtime boundary contract
- [`packages/layers/cli/src/commands/construction-loop.ts`](../../packages/layers/cli/src/commands/construction-loop.ts) — Construction loop implementation
- [`packages/layers/cli/src/commands/task-roster.ts`](../../packages/layers/cli/src/commands/task-roster.ts) — Roster operations
- [`packages/layers/cli/src/commands/principal.ts`](../../packages/layers/cli/src/commands/principal.ts) — Principal runtime CLI
- [`packages/layers/control-plane/src/observability/types.ts`](../../packages/layers/control-plane/src/observability/types.ts) — Observation type definitions
- [`packages/layers/daemon/src/ui/index.html`](../../packages/layers/daemon/src/ui/index.html) — Existing operator console (scope-oriented)
