# Decision 525 — Local Self-Build Runtime Chapter Closure

> **Status:** Closed  
> **Governed by:** task_close:a2  
> **Closes Chapter:** Local Self-Build Runtime And Workbench (Tasks 522, 523, 524, 525)

---

## Summary

The Local Self-Build Runtime Chapter is closed. Narada has defined a **bounded local runtime** for self-build — not a decorative control concept, but an explicit orchestration layer over existing durable stores and governed operators. The runtime boundary (Task 522) specifies 11 runtime objects, 7 read-only observation surfaces, and 6 governed mutation paths. The workbench layout (Task 523) specifies a canonical 2×4 agent grid backed by existing data sources with zero new authority surfaces invented. The bridge plan (Task 524) explicitly demotes chat from authoritative transport and routes all mutations through governed operators with audit trails. The operator's role is preserved: the runtime surfaces state and controls, but the operator triggers terminal transitions.

---

## What This Chapter Accomplished

| Task | What Was Delivered |
|------|-------------------|
| **522** | Runtime boundary contract: 11 runtime objects mapped to durable stores, 6 governed mutations, 7 read-only observations, 8 operator-owned actions, 7-phase minimum loop, 8 forbidden chat-smuggling patterns, 10 v0 non-goals |
| **523** | Browser workbench layout contract: canonical 2-row × 4-column grid (a1–a6 + architect wide), 6 agent pane read surfaces, 7 architect pane read surfaces, 12 GET + 6 POST API endpoints, 12 UI non-goals |
| **524** | Bridge plan: 8 ingress paths with authority mapping, 11 mutation routing rules, chat explicitly demoted from authoritative transport, agent representation through 4 durable artifacts, workbench control routing, 5 bridge invariants |

---

## What Is Now Explicit

### 1. Bounded Runtime (Decision 522)

The local self-build runtime is a **composition layer**, not a new authority boundary:

| Property | What It Is | What It Is Not |
|----------|-----------|----------------|
| **State ownership** | Orchestrates existing stores | Does not create new durable stores |
| **Mutation path** | Routes through governed CLI operators | Does not mutate stores directly |
| **Authority** | Uses existing authority classes (`inspect`, `derive`, `propose`, `claim`) | Does not invent new authority |
| **Loop** | 7-phase sequence: propose → assign → claim → report → review → continue → close | Not an always-on daemon |
| **Audit** | Every mutation leaves a durable record | No hidden or unaudited transitions |

**Proof it is bounded:** The runtime requires **zero new code** to define its boundaries. All objects, operators, and stores already exist. The runtime is a **contract** about how they compose, not a new implementation.

### 2. Browser Workbench (Decision 523)

The workbench is an **observation and control surface**, not a runtime host:

| Property | What It Is | What It Is Not |
|----------|-----------|----------------|
| **Data source** | Reads from 9 existing governed stores | Does not invent new data sources |
| **Mutations** | Routes operator clicks through CLI commands | Does not auto-mutate or bypass operators |
| **Layout** | Fixed-position 2×4 grid for spatial memory | Not a customizable dashboard |
| **State** | Decorative layout persists browser-local | Does not hold authoritative state |

**Proof it is bounded:** Every field in every pane maps to an existing durable store. No new read surfaces were invented.

### 3. Bridge (Decision 524)

The bridge explicitly separates **advisory communication** from **authoritative state transport**:

| Path | Role | Authority |
|------|------|-----------|
| **CLI commands** | Operator-triggered mutations | Operator-owned |
| **Browser controls** | Operator-click mutations (same CLI) | Operator-owned |
| **Agent reports** | Durable WorkResultReport | `propose` |
| **Reviews** | Durable review markdown | `confirm` |
| **Auto-promotion** | Bounded by 12 hard gates | `propose` + `claim` |
| **Chat** | Advisory communication only | **None** |

**Proof chat is demoted:** Chat transcripts are not parsed by the runtime, not displayed in the workbench, and not used for any correctness decision. Agents must explicitly invoke `task-report`, `task-review`, etc.

### 4. Operator Role

The operator's role is **preserved and clarified**:

| Responsibility | Runtime Support | Operator Action Required |
|---------------|-----------------|-------------------------|
| Observe swarm | Workbench shows all agent states | None (passive observation) |
| Assign tasks | Workbench surfaces assign controls | Click to trigger `task-roster assign` |
| Review work | Workbench shows pending reviews | Run `task-review` with verdict |
| Promote recommendations | Workbench shows promotion controls | Click to trigger promotion |
| Close tasks | Workbench shows closure readiness | Run `task-close` or `task-finish` |
| Pause/resume loop | Workbench shows pause/resume | Click to trigger |
| Change policy | Workbench shows policy state | Edit `policy.json` directly |
| Authorize auto-promotion | Workbench shows policy controls | Set `allowed_autonomy_level` |

The runtime **never** makes terminal transitions without operator involvement. Auto-promotion is bounded by 12 hard gates and requires explicit policy enablement.

---

## What Remains Deferred

### Deferred Capabilities

| # | Deferred Capability | Current State | Blocker |
|---|--------------------|---------------|---------|
| 1 | **HTTP API adapter** | Specified in 523/524; not implemented | ~150-line implementation |
| 2 | **Workbench HTML/CSS/JS** | Specified in 523; not implemented | Static page with polling |
| 3 | **File watcher for live refresh** | Polling fallback acceptable | `fs.watch` or polling |
| 4 | **Real-time updates** | v0 uses polling | WebSocket future work |
| 5 | **Drag-and-drop assignment** | Explicit controls only | UI enhancement |
| 6 | **In-pane code editing** | External editor only | Scope creep risk |
| 7 | **Mobile layout** | Desktop-only v0 | Responsive design future |
| 8 | **Multi-repo view** | Single repo v0 | Multi-repo coordination |
| 9 | **Embedded chat** | Chat is external | No chat pane by design |
| 10 | **Agent log tailing** | Terminal only | Not a governed state surface |
| 11 | **Custom pane plugins** | Fixed pane content | Extensibility future |
| 12 | **Unattended daemon mode** | Operator-triggered loop | Unattended layer (Task 391+) |
| 13 | **Remote agent execution** | Local-only v0 | Network boundary design |
| 14 | **Browser-native agent execution** | Agents run in CLI context | Security model not defined |

### Deferred Architectural Questions

| Question | Why Deferred |
|----------|-------------|
| Should the workbench run inside the daemon or as a separate process? | v0 can be served by any HTTP server; daemon integration is future |
| Should agent panes show real-time stdout from running processes? | Process stdout is in `result_json`, not streamed; streaming is future |
| Should the architect pane auto-refresh recommendations? | On-demand only for v0; auto-refresh requires timer/polling design |
| Should workbench layout be customizable per operator? | Decorative only; v0 uses fixed layout |

---

## Invariants Preserved

1. **Runtime is a composition layer.** No new durable stores, authority classes, or operators were invented.
2. **Chat is not state transport.** Chat transcripts are never parsed for assignments, status, or blockers.
3. **All mutations route through governed operators.** No direct store mutation from browser, chat, or runtime loop.
4. **Operator owns terminal transitions.** Close, confirm, and policy changes require explicit operator action.
5. **Workbench is observation-only for state.** It mutates only by routing operator clicks through CLI commands.
6. **PrincipalRuntime updates are advisory.** Post-commit, best-effort, non-blocking.

---

## Verification Evidence

- `pnpm typecheck`: all 11 packages pass ✅
- All referenced CLI commands exist and are tested ✅
- PrincipalRuntime bridge (`principal-bridge.ts`): 21/21 tests pass ✅
- Construction loop (`construction-loop.test.ts`): passes ✅
- Task roster (`task-roster.test.ts`): passes ✅
- Zero new code required to define boundaries ✅

---

## Closure Statement

The Local Self-Build Runtime And Workbench Chapter closes with Narada having an explicit, bounded, and auditable runtime for self-build. The runtime is not a new implementation — it is a contract over existing operators and stores. The workbench is not a decorative dashboard — it is a legible operator surface grounded in durable state. The bridge is not a hidden transport layer — it is an explicit routing of all mutations through governed operators with chat demoted to advisory communication. What remains is implementation: the HTTP API adapter, the static workbench page, and the control wiring. These are bounded, well-specified, and can proceed independently of further architectural design.

---

## Next Executable Implementation Line

The next executable implementation is the **Workbench v0 Build**:

1. **Implement HTTP API adapter** (~150 lines)
   - Thin wrapper over existing CLI commands
   - 12 GET endpoints for observation
   - 6 POST endpoints for control
   - Serve on localhost only

2. **Build static workbench page** (~500 lines HTML/CSS/JS)
   - 2×4 grid layout
   - Polling-based refresh (5-second interval)
   - Agent panes (a1–a6) with header, task card, evidence, blockers
   - Architect pane with frontier, recommendations, controls

3. **Wire control buttons** (~100 lines)
   - Assign, done, idle, promote, pause, resume
   - Each button triggers POST to API adapter
   - Refresh observation after control response

4. **Verify with fixture-backed tests**
   - API adapter request/response mapping
   - Pane field extraction from mock data
   - Control endpoint validation

This implementation line is bounded to ~750 lines of new code and can be executed as a single focused task or small chapter.

---

**Closed by:** a2  
**Closed at:** 2026-04-23
