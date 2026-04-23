# Decision: Local Self-Build Runtime Bridge Plan

**Date:** 2026-04-23
**Task:** 524
**Depends on:** 522 (Local Self-Build Runtime Boundary Contract), 523 (Browser Workbench Layout And Observation Contract)
**Chapter:** Local Self-Build Runtime And Workbench (522–525)
**Verdict:** **Bridge plan defined. Chat is explicitly demoted from authoritative transport. All mutation paths route through governed operators.**

---

## 1. Problem Statement

Narada's build loop currently uses chat transcripts as a hidden transport layer for agent state, assignments, and blockers. The runtime boundary (Task 522) and workbench layout (Task 523) define the surfaces, but neither defines the **bridge** — the explicit paths by which Codex/chat agents, browser controls, and operator commands enter the runtime without smuggling state through chat text.

This decision defines that bridge: ingress paths, mutation routing, agent representation, and the first executable implementation line.

---

## 2. Core Thesis

> **Chat is a communication channel, not a state transport. All durable state transitions must flow through governed operators and leave an audit trail.**

The bridge enforces this by:
1. **Demoting chat** from authoritative transport to advisory communication
2. **Elevating governed operators** as the only mutation path
3. **Representing agent activity** through durable artifacts (task files, reports, reviews, roster entries)
4. **Auditing every bridge crossing** through construction loop audit logs or operator action requests

---

## 3. Ingress Paths

### 3.1 Path Inventory

| Path | Source | Mutation? | Routes Through | Authority |
|------|--------|-----------|----------------|-----------|
| **CLI commands** | Operator terminal | Yes | Governed operators (`task-claim`, `task-report`, etc.) | Operator-owned |
| **Browser workbench controls** | Operator click | Yes | HTTP API adapter → CLI commands | Operator-owned |
| **Agent report submission** | Agent (chat-triggered) | Yes | `task-report` command | `propose` (agent output) |
| **Review submission** | Reviewer agent | Yes | `task-review` command | `confirm` |
| **Construction loop auto-promotion** | Runtime | Yes | `construction-loop run` (12 hard gates) | `propose` + `claim` (bounded) |
| **Principal runtime sync** | Runtime | No (advisory) | `principal sync-from-tasks` | `inspect` + `derive` |
| **Chat transcript** | Agent/operator chat | **No** | Advisory only; never authoritative | N/A |
| **Workbench observation** | Browser refresh | No | HTTP API adapter → read-only queries | `inspect` |

### 3.2 Ingress Path Detail

#### 3.2.1 CLI Commands (Operator Terminal)

The operator uses the terminal to trigger governed mutations:

```bash
# Assignment
narada task roster assign <agent> <task>
narada task claim <task> --agent <agent>

# Report
narada task report <task> --agent <agent> --summary "..."

# Review
narada task review <task> --agent <reviewer> --verdict accepted

# Continue / release
narada task continue <task> --agent <agent>
narada task release <task> --agent <agent>

# Close
narada task close <task>
narada task finish <task>

# Promotion
narada task promote-recommendation <task> --agent <agent>
narada construction-loop run
```

**Invariant:** Every CLI mutation command:
- Validates state-machine transitions
- Writes to durable stores atomically
- Updates the roster or PrincipalRuntime (advisory, post-commit)
- Leaves an audit record

#### 3.2.2 Browser Workbench Controls

The browser workbench routes operator clicks through the same CLI commands:

```
Operator click → HTTP POST /api/control/assign → CLI task-roster assign → Durable mutation
```

**No direct store mutation.** The HTTP API adapter is a thin wrapper. It does not bypass the CLI operators.

#### 3.2.3 Agent Report Submission

When an agent completes work, it produces a **WorkResultReport** that is submitted via `task-report`:

```
Agent completes work
  → Writes execution notes + verification to task file body
  → Agent (or operator proxy) runs: narada task report <task> --agent <agent> --summary "..."
  → task-report validates, creates WorkResultReport, transitions task to in_review
  → PrincipalRuntime bridge updates agent state to waiting_review (advisory)
  → Roster updated to done/idle
```

**Key:** The agent does not directly edit task front matter. It edits the task body (execution notes, verification), then the `task-report` command handles the state transition.

#### 3.2.4 Review Submission

When a reviewer evaluates completed work:

```
Reviewer evaluates report
  → Writes review markdown file
  → Agent (or operator proxy) runs: narada task review <task> --agent <reviewer> --verdict accepted|rejected
  → task-review validates, records verdict
  → PrincipalRuntime bridge updates agent state (advisory)
```

#### 3.2.5 Construction Loop Auto-Promotion

The runtime may auto-promote recommendations when policy permits:

```
construction-loop run
  → Builds plan (read-only)
  → Checks 12 hard gates
  → If all gates pass: calls task-promote-recommendation
  → Writes audit record to audit.jsonl
  → Updates roster
```

**Bounded:** Only when `allowed_autonomy_level = bounded_auto` and `require_operator_approval_for_promotion = false`.

#### 3.2.6 Principal Runtime Sync

Reconciles drift between task governance state and PrincipalRuntime state:

```
principal sync-from-tasks
  → Reads all task files, assignments, roster
  → Computes expected PrincipalRuntime states
  → Updates registry where drift detected
  → Advisory only; no authority granted
```

#### 3.2.7 Chat Transcript (Explicitly Demoted)

**Chat is not an ingress path for durable state.** Chat transcripts may:
- Contain advisory communication between agents and operators
- Reference task numbers, file paths, and commands
- Contain planning discussion and reasoning

**Chat must not:**
- Serve as assignment records
- Serve as task status source
- Serve as promotion audit trail
- Contain authoritative state transitions

**Enforcement:** The workbench does not read chat transcripts. The runtime does not parse chat for state. Agents and operators must explicitly invoke CLI commands for all mutations.

---

## 4. Mutation Routing Rules

### 4.1 Direct Store Mutation (Forbidden)

No ingress path may directly mutate:
- Task file front matter (status, governed_by, closed_at)
- Roster JSON without atomic read-modify-write
- Assignment records without append-only semantics
- Construction loop policy
- Principal runtime registry without `registry.update()` + `registry.flush()`

### 4.2 Governed Operator Routing (Required)

All mutations must route through:

| Mutation | Required Operator | Audit Record |
|----------|-------------------|--------------|
| Task claim | `task-claim` or `task-roster assign` | Assignment record |
| Task release | `task-release` or `task-roster done/idle` | Assignment record |
| Task report | `task-report` | WorkResultReport + task body update |
| Task review | `task-review` | Review markdown file |
| Task continue | `task-continue` | Task file status update |
| Task close | `task-close` or `task-finish` | Governed provenance marker |
| Task promote | `task-promote-recommendation` | Promotion audit record |
| Auto-promote | `construction-loop run` | AutoPromotionAuditRecord |
| Roster update | `task-roster` commands | Roster JSON update |
| Principal attach | `principal attach` | Registry update |
| Principal detach | `principal detach` | Registry update |

### 4.3 Advisory Updates (Post-Commit, Best-Effort)

The PrincipalRuntime bridge updates are:
- **Post-commit:** Task governance completes first; bridge updates after
- **Advisory:** Removing bridge updates does not affect durable state
- **Best-effort:** Bridge failures are logged, not fatal

```
task-claim completes
  → Assignment record written
  → Task file status updated
  → (async) PrincipalRuntime bridge updates state to "claiming"
```

If the bridge update fails, the task claim is still valid. The operator may run `principal sync-from-tasks` to reconcile.

---

## 5. Codex/Chat Agent Representation

### 5.1 Agent Identity

An agent in the local self-build runtime is represented by:

| Representation | Durable Store | Authority |
|---------------|---------------|-----------|
| **Roster entry** | `.ai/roster.json` → `agents[].agent_id` | Authoritative identity |
| **Principal runtime** | `JsonPrincipalRuntimeRegistry` → `principal_id` | Runtime state (advisory) |
| **Assignment record** | `.ai/assignments/<task>.json` → `agent_id` | Claim history |
| **Report** | `.ai/reports/<report>.md` → `agent_id` | Work output |
| **Review** | `.ai/reviews/<review>.md` → `reviewer_agent_id` | Review output |

**Not represented:** Chat handle, session nickname, or transcript presence. These are ephemeral communication artifacts, not identity.

### 5.2 Agent Activity Model

Agent activity is modeled as a state machine over durable artifacts:

```
Idle → Claimed (task-claim) → Executing (work) → Reported (task-report)
  → Reviewing (reviewer claim) → Reviewed (task-review) → Closed (task-close)
```

At each transition, the agent produces a durable artifact:
- **Claim:** Assignment record
- **Execution:** Task file body edits
- **Report:** WorkResultReport
- **Review:** Review markdown file

### 5.3 Chat Activity Representation

When an agent communicates in chat, that communication is **not** a durable artifact. However, the agent may reference durable artifacts in chat:

```
Chat message: "I have completed task 522. See report at .ai/reports/20260423-522.md"
```

The chat message is advisory. The report file is authoritative. The operator (or runtime) must check the report file, not the chat message, to verify completion.

**Bridge enforcement:** If an agent claims completion in chat without submitting a report, the runtime treats the agent as still executing. The roster does not update until `task-report` is invoked.

---

## 6. Workbench → Runtime Bridge

### 6.1 Control Routing

All workbench controls route through the HTTP API adapter to CLI commands:

```
Workbench click
  → HTTP POST /api/control/<action>
  → API adapter validates request
  → API adapter invokes corresponding CLI command
  → CLI command performs governed mutation
  → Response returned to workbench
  → Workbench refreshes observation
```

### 6.2 Control Surface Mapping

| Workbench Control | HTTP Endpoint | CLI Command | Authority |
|-------------------|---------------|-------------|-----------|
| Assign task | POST /api/control/assign | `task-roster assign` | Operator-owned |
| Mark done | POST /api/control/done | `task-roster done` | Operator-owned |
| Mark idle | POST /api/control/idle | `task-roster idle` | Operator-owned |
| Promote (dry-run) | POST /api/control/promote | `task-promote-recommendation --dry-run` | Operator-owned |
| Promote (live) | POST /api/control/promote | `task-promote-recommendation` | Operator-owned |
| Auto-promote | POST /api/control/auto-promote | `construction-loop run` | Governed (12 gates) |
| Pause loop | POST /api/control/pause | `construction-loop pause` | Operator-owned |
| Resume loop | POST /api/control/resume | `construction-loop resume` | Operator-owned |
| Generate recommendations | POST /api/control/recommend | `task-recommend` | Derive (advisory) |

### 6.3 Observation Routing

Workbench observations route through read-only API endpoints:

```
Workbench poll
  → HTTP GET /api/<resource>
  → API adapter reads from durable store
  → Response returned to workbench
  → No mutation occurs
```

---

## 7. First Executable Implementation Line

### 7.1 Priority Order

| Priority | Surface | Reuse | New Work | Fixture vs Live |
|----------|---------|-------|----------|-----------------|
| 1 | **HTTP API adapter** | Reuse all CLI commands | ~150-line adapter | Fixture-backed (unit tests) |
| 2 | **Workbench HTML/CSS/JS** | Reuse existing console theme | Grid layout + polling | Live (browser) |
| 3 | **Agent pane rendering** | Reuse `loadRoster`, `readTaskFile` | Pane component | Fixture-backed |
| 4 | **Architect pane rendering** | Reuse `task-recommend`, `construction-loop plan` | Wide pane component | Live (on-demand) |
| 5 | **File watcher for refresh** | Reuse `fs.watch` or polling | Refresh trigger | Live |
| 6 | **Control wiring** | Reuse CLI commands | Button → POST mapping | Fixture-backed |

### 7.2 Implementation Boundaries

**Fixture-backed (mechanically provable):**
- HTTP API adapter request/response mapping
- Agent pane field extraction from roster + task files
- Control endpoint validation
- Error handling for missing tasks/agents

**Live-backed (requires real exercise):**
- Browser rendering quality
- Real-time refresh feel
- Operator click-to-response latency
- Cross-browser compatibility

### 7.3 Bounded Blockers

| Blocker | Bound | Mitigation |
|---------|-------|------------|
| HTTP API adapter not implemented | ~150 lines | Implement as thin wrapper |
| No file watcher for live refresh | Polling fallback acceptable for v0 | Use 5-second polling |
| Workbench static files not served | Serve from daemon or simple HTTP server | `npx serve` or express |
| CORS policy for localhost | Allow localhost only | Already in console-server-routes |

---

## 8. Verification Evidence

### 8.1 Existing Infrastructure

| Component | Evidence | Status |
|-----------|----------|--------|
| CLI commands as mutation boundary | All commands in `cli/src/commands/` | ✅ Existing |
| Principal runtime bridge | `principal-bridge.ts` with 5 event mappings | ✅ Existing |
| Construction loop with hard gates | `construction-loop.ts` with 12 gates | ✅ Existing |
| Audit logging | `audit.jsonl` append-only | ✅ Existing |
| HTTP API routes (console) | `console-server-routes.ts` with CORS + control | ✅ Existing |
| Roster atomic mutations | `withRosterMutation()` in `task-governance.ts` | ✅ Existing |
| Assignment append-only | `assignments.json` append-only records | ✅ Existing |

### 8.2 Test Verification

- `pnpm typecheck`: all 11 packages pass ✅
- No new tests required for this decision (bridge plan is architectural)

---

## 9. Invariants

1. **Chat is not state transport.** Chat transcripts are never parsed for assignments, status, or blockers.
2. **All mutations route through governed operators.** No direct store mutation from browser, chat, or runtime loop.
3. **PrincipalRuntime updates are post-commit and advisory.** Task governance never waits for PrincipalRuntime.
4. **Every bridge crossing leaves an audit trail.** CLI commands write records; construction loop writes audit entries.
5. **Workbench controls are operator-triggered.** The workbench does not auto-mutate. It surfaces controls for operator action.

---

## Related Documents

- [`.ai/decisions/20260423-522-local-self-build-runtime-boundary-contract.md`](20260423-522-local-self-build-runtime-boundary-contract.md) — Runtime boundary
- [`.ai/decisions/20260423-523-browser-workbench-layout-and-observation-contract.md`](20260423-523-browser-workbench-layout-and-observation-contract.md) — Workbench layout
- [`packages/layers/cli/src/lib/principal-bridge.ts`](../../packages/layers/cli/src/lib/principal-bridge.ts) — PrincipalRuntime bridge
- [`packages/layers/cli/src/commands/construction-loop.ts`](../../packages/layers/cli/src/commands/construction-loop.ts) — Construction loop
- [`packages/layers/cli/src/commands/console-server-routes.ts`](../../packages/layers/cli/src/commands/console-server-routes.ts) — HTTP API routes
