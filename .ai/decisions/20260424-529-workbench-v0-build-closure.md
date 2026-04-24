# Decision 529 — Workbench v0 Build Closure

> **Status:** Closed  
> **Governed by:** task_close:a2  
> **Closes Chapter:** Workbench v0 Build (Tasks 526, 527, 528, 529)

---

## Summary

The Workbench v0 Build Chapter is closed. Narada now has a **localhost browser workbench** that exposes existing governed read and mutation surfaces without inventing new authority. The workbench is a static HTML/CSS/JS page served by a thin HTTP adapter, rendering the canonical 2×4 agent grid and architect overview with polling-based refresh. All controls route through existing governed CLI operators.

---

## What This Chapter Accomplished

| Task | What Was Delivered |
|------|-------------------|
| **526** | Workbench HTTP adapter: `createWorkbenchServer()` with 17 route handlers (10 GET observation + 7 POST control), CORS, localhost-only binding, static HTML serving at root. 23 tests. |
| **527** | Static workbench page: `workbench.html` (~24 KB) with canonical 2×4 grid (a1–a6 + architect wide), agent pane read surfaces (header, task card, evidence, last action, controls), architect pane read surfaces (frontier, dependencies, recommendations, reviews, operator state, controls). Polling refresh (5s/30s). Responsive fallback. |
| **528** | Control wiring and validation: All 6 v0 controls (assign, done, idle, promote, pause, resume) wired through existing governed operators. 10 new validation tests. Toast notifications, loading states, client-side validation, post-mutation refresh. 32 total workbench server tests. |

---

## What Is Now Usable Locally

### Running the Workbench

```bash
narada workbench serve --port 8080
# Open http://127.0.0.1:8080 in browser
```

### Observation Surfaces (All Functional)

| Pane | Data | Refresh |
|------|------|---------|
| Agent header | roster.json → agent_id, status, task, updated_at | 5s |
| Agent task card | task file → title, status, depends_on; assignment → claimed_at | 5s |
| Agent evidence | task body → execution notes, verification, criteria (partial) | 5s |
| Agent last action | audit.jsonl → latest record for agent | 5s |
| Architect frontier | task scan → open/claimed/closed counts | 5s |
| Architect dependencies | task scan + graph → runnable vs blocked | 5s |
| Architect recommendations | `task-recommend` output | 30s |
| Architect reviews | review JSON files → total, pending | 5s |
| Architect operator state | policy.json, audit, principals | 5s |

### Controls (All Functional)

| Control | Route | Operator |
|---------|-------|----------|
| Assign task | POST `/api/control/assign` | Operator enters task #, clicks Assign |
| Mark done | POST `/api/control/done` | Operator clicks Done on working agent |
| Mark idle | POST `/api/control/idle` | Operator clicks Idle |
| Dry-run promote | POST `/api/control/promote` (dry_run=true) | Operator fills task/agent/by, clicks Dry-run |
| Live promote | POST `/api/control/promote` | Operator fills task/agent/by, clicks Promote |
| Pause loop | POST `/api/control/pause` | Operator clicks Pause |
| Resume loop | POST `/api/control/resume` | Operator clicks Resume |
| Recommend | POST `/api/control/recommend` | Operator clicks Recommend |

---

## What Remains Deferred or Rough

### Rough Edges (Workable But Unpolished)

| # | Item | Current State | Gap |
|---|------|---------------|-----|
| 1 | **Evidence panel** | Shows "TBD" placeholders | Needs actual task body parsing for execution notes, verification sections, and unchecked criteria count |
| 2 | **Promotion UX** | Manual text entry for task/agent/by | Should offer one-click promote from recommendation queue |
| 3 | **Graph rendering** | JSON nodes/edges only | No visual DAG rendering; operator must interpret raw graph data |
| 4 | **Audit detail** | Count only in architect pane | No per-agent audit history pane; only latest action shown |
| 5 | **Principal runtime** | List only | No principal state transitions or attach/detach controls |

### Explicitly Deferred (Out of v0 Scope)

| # | Item | Why Deferred |
|---|------|-------------|
| 1 | **Real-time updates** | v0 uses polling only; WebSockets/SSE require daemon integration |
| 2 | **File watcher refresh** | `fs.watch` or inotify integration is future work; polling is sufficient for v0 |
| 3 | **Drag-and-drop assignment** | Explicit controls only; DnD is decorative future work |
| 4 | **In-pane task editing** | Task file editing happens in external editor by design |
| 5 | **Rich markdown rendering** | Plain text/minimal formatting only; full markdown is decorative |
| 6 | **Theme switching** | Single dark theme; switching is decorative |
| 7 | **Mobile layout** | Desktop-only; mobile is future |
| 8 | **Multi-repo view** | Single repo; multi-repo coordination is future |
| 9 | **Embedded chat** | Chat is external by design (Task 524 boundary) |
| 10 | **Agent log tailing** | Terminal only; logs are not a governed state surface |
| 11 | **Custom pane plugins** | Fixed pane content; extensibility is future |
| 12 | **Offline mode** | Requires running server; no offline caching |
| 13 | **Visual graph rendering** | Raw JSON only; Mermaid or canvas rendering is future |
| 14 | **Metrics dashboard** | `construction-loop metrics` exists but not rendered in workbench |

---

## Invariants Preserved

1. **No new authority surfaces invented.** Every read is from an existing durable store; every mutation routes through an existing governed CLI operator.
2. **Workbench is observation-only for state.** It mutates only by routing operator clicks through CLI commands.
3. **Localhost-only binding.** Server defaults to `127.0.0.1`; CORS rejects non-local origins.
4. **Chat remains demoted.** No chat pane, no chat transcript parsing, no chat-based mutation.
5. **All controls are operator-owned.** No autonomous assignment, promotion, or closure from the workbench.
6. **Post-mutation refresh.** After every successful control, observation surfaces refresh automatically.

---

## Verification Evidence

- `pnpm typecheck`: all 11 packages pass ✅
- `pnpm verify`: 5/5 steps pass ✅
- Workbench server tests: 32/32 pass ✅
- Full CLI suite: 661/661 tests pass ✅
- No new authority classes invented ✅
- No direct store mutation from workbench routes ✅

---

## Closure Statement

The Workbench v0 Build Chapter closes with Narada having a **working localhost browser workbench** that an operator can open, observe, and control. It is not a decorative dashboard — it is a legible operator surface grounded in durable state, with every mutation routed through governed operators. It is also not a finished product — the evidence panel needs real parsing, the promotion UX needs one-click flow, and the graph needs visual rendering. But the foundation is solid: the HTTP adapter is thin and correct, the page is static and fast, and the controls are wired and validated.

---

## Next Implementation Pressure

After Workbench v0, the highest-pressure remaining work is:

1. **Evidence panel parsing** — Replace "TBD" stubs with actual task body section extraction (`## Execution Notes`, `## Verification`, unchecked `- [ ]` criteria counting). This is the roughest edge blocking daily usability.

2. **One-click promotion flow** — Wire the recommendation queue to pre-fill the promotion form, so the architect can promote with a single click instead of manual text entry.

3. **File watcher integration** — Add `fs.watch`-based push refresh so the workbench updates within milliseconds of filesystem changes, eliminating the need for aggressive polling.

4. **Visual graph rendering** — Render the task DAG as a Mermaid diagram or lightweight canvas visualization in the architect pane.

These four items are bounded, independent, and can proceed in any order. None require architectural redesign — they are polish and integration over the existing v0 foundation.

---

**Closed by:** a2  
**Closed at:** 2026-04-24
