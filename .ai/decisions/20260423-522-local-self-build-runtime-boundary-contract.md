# Decision: Local Self-Build Runtime Boundary Contract

**Date:** 2026-04-23
**Task:** 522
**Depends on:** 513 (Self-Governance Extraction Closure), 517 (Agent Runtime Modeling Closure)
**Chapter:** Local Self-Build Runtime And Workbench (522–525)
**Verdict:** **Boundary contract defined. Local runtime is a composition of existing durable surfaces, not a new authority boundary.**

---

## 1. Problem Statement

Narada's build loop still depends on the operator and chat transcript to carry assignments, reconcile agent state, surface blockers, and observe the swarm as a coherent whole. The self-governance system (Tasks 510–513) and agent-runtime modeling (Tasks 514–517) have defined the concepts, but there is no explicit boundary contract for the **local runtime** that instantiates these ideas for Narada building Narada.

This decision defines that runtime: what it owns, what it exposes, what remains operator-owned, and what must not be smuggled through chat.

---

## 2. Core Thesis

> **The local self-build runtime is a composition layer over existing durable surfaces, not a new authority boundary.**

The runtime does not create new durable state. It reads from and writes to existing stores (task files, roster, PrincipalRuntime, construction loop policy) through existing governed operators. The runtime's value is in **orchestration** — sequencing the operators in a loop — not in **new state**.

---

## 3. Runtime Objects and Durable Boundaries

### 3.1 Object Inventory

| Object | Durable Store | Authority | Mutable By Runtime? |
|--------|-------------|-----------|---------------------|
| **Task** | Task markdown file (`.ai/do-not-open/tasks/*.md`) | Task governance operators | No — runtime reads only |
| **Assignment** | `.ai/assignments/<task-id>.json` | `task-roster assign/claim/release` | Yes — via governed operators |
| **Roster** | `.ai/roster.json` | `task-roster` commands | Yes — via governed operators |
| **Recommendation** | `TaskRecommendation` (ephemeral, derived) | `task-recommend` | Yes — runtime triggers `recommend` |
| **Promotion request** | `AssignmentPromotionRequest` (audit record) | `task-promote-recommendation` | Yes — runtime triggers `promote` |
| **Review request** | Review markdown file (`.ai/reviews/*.md`) | `task-review` | No — runtime reads only |
| **Operator approval** | Task file front matter (`governed_by`) | Operator / `task-close` | No — operator-owned |
| **Principal runtime** | `config.json`-adjacent JSON registry | `principal attach/detach` | Yes — via governed operators |
| **Workbench state** | Browser-local or ephemeral server state | Workbench UI | Yes — observation-only persisted |
| **Construction loop policy** | `.ai/construction-loop/policy.json` | Operator / `policy init` | No — operator-owned |
| **Audit log** | `.ai/construction-loop/audit.jsonl` | `construction-loop run` | Yes — append-only by runtime |

### 3.2 Durable Boundary Rules

1. **Task files are append-only for agents.** An agent may add `## Execution Notes` and `## Verification` sections. It may not alter front matter (status, governed_by, closed_at) without routing through a governed operator.

2. **Roster mutations are atomic.** `updateAgentRosterEntry()` in `task-governance.ts` uses `withRosterMutation()` for atomic read-modify-write. The runtime must use this path, not direct file edits.

3. **Assignment records are append-only.** Each claim/release is a new entry in `assignments.json`. History is never overwritten.

4. **Principal runtime state is config-adjacent.** The `JsonPrincipalRuntimeRegistry` persists to the same directory as `config.json`. The runtime may attach/detach principals but must use `registry.update()` + `registry.flush()`.

5. **Audit logs are append-only.** `construction-loop run` writes `AutoPromotionAuditRecord` entries to `audit.jsonl`. Never edited or deleted.

---

## 4. Governed Actions vs Read-Only Observations

### 4.1 Governed Mutations (Runtime May Trigger, Subject to Policy)

| Action | Surface | Authority | Policy Gate | Why Governed |
|--------|---------|-----------|-------------|--------------|
| **Recommend assignments** | `task-recommend` | `derive` | `allowed_autonomy_level >= recommend` | Creates advisory artifacts only |
| **Auto-promote recommendation** | `construction-loop run` | `propose` + `claim` | `bounded_auto` + 12 hard gates | Bounded by validation gates; audit logged |
| **Update roster status** | `task-roster assign/done/idle` | `claim` | Roster mutation rules | Atomic, reversible, auditable |
| **Principal attach/detach** | `principal attach/detach` | `admin` | Operator config | Runtime may trigger only if operator-configured |
| **Sync PrincipalRuntime from tasks** | `principal sync-from-tasks` | `inspect` + `derive` | Advisory | Reconciles drift; no authority grant |
| **Pause/resume construction loop** | `construction-loop pause/resume` | `admin` | Operator trigger | Runtime may recommend; operator must trigger |

### 4.2 Read-Only Observations (Runtime May Consume Freely)

| Observation | Surface | Authority | Notes |
|-------------|---------|-----------|-------|
| **Task graph** | `task graph`, `task list` | `inspect` | DAG rendering, runnable detection |
| **Roster state** | `task roster show` | `inspect` | Agent status, assignments, history |
| **Evidence inspection** | `task evidence`, `task evidence-list` | `inspect` | Completeness checking by criteria |
| **Principal runtime snapshot** | `principal status/list` | `inspect` | Runtime state, scope attachments |
| **Construction loop plan** | `construction-loop plan` | `derive` | Composed observations; no mutation |
| **Metrics** | `construction-loop metrics` | `inspect` | Audit log aggregation |
| **Lint results** | `task lint` | `inspect` | Structural validation, orphan detection |

### 4.3 Operator-Owned Actions (Runtime Must Not Trigger Without Explicit Approval)

| Action | Surface | Authority | Why Operator-Owned |
|--------|---------|-----------|-------------------|
| **Task creation** | `chapter init`, manual authoring | `admin` | Product judgment, scope design |
| **Task closure** | `task close`, `task finish` | `resolve` / `confirm` | Terminal state transitions |
| **Unsafe promotion** | `task promote --override-risk` | `claim` + override | Bypasses validation gates |
| **Policy changes** | Edit `policy.json` | `admin` | Changes autonomy boundary itself |
| **Live external execution** | `narada sync`, `console approve` | `execute` | Mutates external systems |
| **Git commit/push** | `git commit`, `git push` | `admin` | Code commit is separate authority |
| **Kernel changes** | Foreman, Scheduler, Handoff edits | `admin` | Alters invariants |
| **Schema changes** | Config schema, CLI surface | `admin` | Affects all consumers |

---

## 5. Minimum Admissible Local Runtime Loop

The v0 local self-build runtime implements a 7-phase loop:

```
propose → assign → claim → report → review → continue → close
```

### 5.1 Phase Definitions

| Phase | What Happens | Durable Side Effect | Authority |
|-------|-------------|---------------------|-----------|
| **Propose** | `task-recommend` generates ranked candidates; `construction-loop plan` composes observations | `TaskRecommendation` (ephemeral) | `derive` |
| **Assign** | `task-roster assign <agent> <task>` updates roster; optionally claims task | Roster update + assignment record | `claim` |
| **Claim** | Agent claims task via `task-claim` or roster assign with `--claim` | Task status → `claimed` | `claim` |
| **Report** | Agent completes work, writes execution notes + verification, runs `task-report` | Task file body updated | `propose` (agent output) |
| **Review** | Reviewer evaluates report via `task-review`; verdict: accepted/rejected/needs_work | Review markdown file created | `confirm` |
| **Continue** | On accepted review, agent may continue or release; `task-continue` or `task-release` | Task status → `needs_continuation` or released | `claim` / `resolve` |
| **Close** | Operator runs `task-close` or `task-finish` with evidence check | Task status → `closed`, `governed_by` set | `resolve` / `confirm` |

### 5.2 Loop Invariants

1. **No phase skips.** An assignment must pass through report before review. A review must precede close.

2. **Phase idempotency.** Re-running a phase with the same inputs produces the same durable state (no duplicate assignments, no duplicate reviews).

3. **Operator gate at close.** The runtime may prepare closure evidence, but only the operator (or governed `task-close` operator) may transition to terminal status.

4. **Audit trail completeness.** Every mutation leaves a durable record: roster update timestamp, assignment record, promotion audit entry, or review file.

5. **Reversibility before close.** Any non-terminal state may be reversed: `task-release` undoes claim, `task-reopen` undoes close.

---

## 6. What Must Not Be Smuggled Through Chat

The following are **forbidden transport mechanisms** for the local self-build runtime:

| # | Forbidden Pattern | Why | Correct Path |
|---|------------------|-----|--------------|
| 1 | **Chat transcript as assignment record** | Ephemeral, unverifiable, no audit trail | `task-roster assign` → `assignments.json` |
| 2 | **Chat context as task state** | Not durable, not replay-safe, not inspectable | Task file front matter + body |
| 3 | **Implicit agent availability** | Chat presence ≠ roster status | `roster.json` status field |
| 4 | **Chat-based promotion** | No validation gates, no audit log | `construction-loop run` with 12 hard gates |
| 5 | **Chat-based review** | No durable review record, no separation rules | `task-review` with reviewer identity |
| 6 | **Chat-based closure** | No evidence inspection, no governed provenance | `task-close` with `governed_by` marker |
| 7 | **Chat-based policy change** | No config change tracking | Edit `policy.json` + validation |
| 8 | **Hidden auto-assignment** | Operator not informed of agent-task binding | Roster show + construction loop plan |

**Rule:** Chat is a communication channel, not a state transport. All durable state must flow through governed operators and leave an audit trail.

---

## 7. v0 Non-Goals

The following are explicitly out of scope for the v0 local self-build runtime:

| Non-Goal | Reason |
|----------|--------|
| **Remote/distributed execution** | v0 is local-only. Remote agent execution requires network boundary design not yet specified. |
| **Browser-native agent execution** | Agents run in the local CLI/runtime context, not in the browser. The browser is an observation surface only. |
| **Real-time collaborative editing** | Task files are single-writer. Concurrent agent edits require locking not in v0. |
| **Auto-assignment without operator visibility** | All assignments are visible in roster and construction loop plan. No hidden scheduling. |
| **Chat as authoritative transport** | Chat is advisory communication only. Never authoritative for state mutations. |
| **Self-modifying construction loop policy** | Policy changes require operator action. Runtime may recommend but not auto-modify policy. |
| **Cross-repo build loops** | v0 operates on a single repo. Multi-repo coordination is future work. |
| **Agent-to-agent direct messaging** | Agents communicate only through durable artifacts (task files, reviews, roster). No direct channels. |
| **Automatic kernel/schema changes** | Runtime may propose kernel changes, but only operator may implement them. |
| **Unattended infinite loop** | v0 loop is operator-triggered (`construction-loop run`) or timer-bounded. No always-on daemon mode. |

---

## 8. Workbench State Boundary

The browser workbench (Task 523) is an **observation and control surface**, not a runtime host.

| Concern | Workbench | Local Runtime |
|---------|-----------|---------------|
| **Owns durable state?** | No | No (orchestrates existing stores) |
| **Mutates task files?** | No | No (agents mutate via operators) |
| **Triggers promotions?** | No (operator clicks) | Yes (`construction-loop run`) |
| **Shows roster?** | Yes | Yes |
| **Shows task graph?** | Yes | Yes |
| **Approves decisions?** | Yes (operator click) | No (operator-owned) |
| **Persists layout?** | Yes (browser-local) | N/A |

**Workbench state** (window layout, column widths, filters) is decorative and persisted browser-local. It must not be confused with authoritative runtime state.

---

## 9. Reused vs New Components

### 9.1 Reused Without Change

| Component | Location | Role in Runtime |
|-----------|----------|-----------------|
| `task-recommend` | `cli/src/commands/task-recommend.ts` | Propose phase |
| `task-roster` | `cli/src/commands/task-roster.ts` | Assign, claim, done, idle |
| `task-claim` | `cli/src/commands/task-claim.ts` | Claim phase |
| `task-report` | `cli/src/commands/task-report.ts` | Report phase |
| `task-review` | `cli/src/commands/task-review.ts` | Review phase |
| `task-continue` | `cli/src/commands/task-continue.ts` | Continue phase |
| `task-release` | `cli/src/commands/task-release.ts` | Release from claim |
| `task-close` / `task-finish` | `cli/src/commands/task-close.ts`, `task-finish.ts` | Close phase (operator-owned) |
| `construction-loop plan` | `cli/src/commands/construction-loop.ts` | Loop planning |
| `construction-loop run` | `cli/src/commands/construction-loop.ts` | Bounded auto-promotion |
| `principal status/list` | `cli/src/commands/principal.ts` | Principal observation |
| `principal attach/detach` | `cli/src/commands/principal.ts` | Principal lifecycle |
| `JsonPrincipalRuntimeRegistry` | `control-plane/src/principal-runtime/` | Principal state persistence |
| `task-governance.ts` | `cli/src/lib/task-governance.ts` | Roster/assignment atomic mutations |

### 9.2 New Components Required

| Component | Purpose | Bound |
|-----------|---------|-------|
| **Local runtime loop controller** | Sequences the 7 phases, handles pause/resume, exposes state | Loop orchestrator; no new durable state |
| **Workbench HTTP API adapter** | Bridges browser UI to CLI commands | Thin adapter; delegates to existing commands |
| **Workbench layout state** | Browser-local decorative state | Not authoritative |

---

## 10. Verification Evidence

### 10.1 Existing Test Coverage

| Component | Tests | Status |
|-----------|-------|--------|
| `task-recommend` | `task-recommend.test.ts` | 21/21 pass |
| `task-promote-recommendation` | `task-promote-recommendation.test.ts` | 16/16 pass |
| `task-roster` | `task-roster.test.ts` | ~20 tests pass |
| `task-claim/report/release/continue` | `task-claim.test.ts`, `task-report.test.ts` | Pass |
| `construction-loop` | `construction-loop.test.ts` | Pass |
| `principal` | `principal.test.ts` | Pass |
| `principal-bridge` | `principal-bridge.test.ts` | 21/21 pass |

### 10.2 Bounded Blockers for v0 Runtime

| Blocker | Bound | Status |
|---------|-------|--------|
| Local runtime loop controller | New component; ~200 lines | Not yet implemented |
| Workbench HTTP API adapter | Thin adapter; ~100 lines | Not yet implemented |
| Workbench browser UI | HTML/CSS/JS layout | Task 523 |
| Cross-command state sharing | In-memory or file-based IPC | Design decision needed |

---

## 11. Relation to Task 523

Task 523 (Browser Workbench Layout And Observation Contract) will specify:
- The canonical 2×4 agent/architect layout
- Observation API endpoints for the browser
- Control routing from browser clicks to CLI operators
- Decorative state persistence

This decision (522) provides the runtime boundary. Task 523 provides the operator surface.

---

## Related Documents

- [`.ai/decisions/20260423-510-self-governance-boundary-contract.md`](20260423-510-self-governance-boundary-contract.md) — Self-governance authority classes
- [`.ai/decisions/20260423-514-agent-runtime-boundary-contract.md`](20260423-514-agent-runtime-boundary-contract.md) — Agent runtime term mappings
- [`.ai/decisions/20260423-515-architect-operator-pair-model.md`](20260423-515-architect-operator-pair-model.md) — Crossing regime
- [`.ai/decisions/20260423-517-agent-runtime-modeling-closure.md`](20260423-517-agent-runtime-modeling-closure.md) — Chapter closure
- [`packages/layers/cli/src/commands/construction-loop.ts`](../../packages/layers/cli/src/commands/construction-loop.ts) — Construction loop implementation
- [`packages/layers/cli/src/commands/principal.ts`](../../packages/layers/cli/src/commands/principal.ts) — Principal runtime CLI
- [`packages/layers/cli/src/commands/task-roster.ts`](../../packages/layers/cli/src/commands/task-roster.ts) — Roster operations
