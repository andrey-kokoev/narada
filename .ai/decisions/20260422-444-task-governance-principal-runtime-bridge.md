# Decision: Task Governance / PrincipalRuntime Bridge Contract

**Date:** 2026-04-22
**Task:** 444
**Depends on:** 406 (Principal Runtime State Machine), 412 (PrincipalRuntime Integration Contract), 425 (Work Result Report Governance Primitive), 426 (Assignment Recommendation Implementation)
**Verdict:** **Contract accepted. Implementation justified — see Task 456.**

---

## 1. Problem Statement

Narada has two related but distinct actor-state systems:

1. **Task governance** — durable file-backed work lifecycle (task files, assignments, roster, WorkResultReports, reviews).
2. **PrincipalRuntime** — ephemeral/advisory runtime actor state (availability, attachment posture, claiming/executing/waiting_review, budget).

They must not collapse into one another, but they should not remain disconnected forever. If an agent submits a WorkResultReport, the runtime actor should be able to move to `waiting_review`. If review accepts/rejects the report, the actor should return to available/interact state.

This decision defines the bridge contract: how task-governance events may update or consult PrincipalRuntime state **without** making PrincipalRuntime authoritative over tasks.

---

## 2. Bridge Direction

**Unidirectional: Task Governance → PrincipalRuntime (advisory/post-commit).**

```
┌─────────────────────┐         ┌──────────────────────────┐
│   Task Governance   │         │    PrincipalRuntime      │
│   (authoritative)   │ ──────► │    (advisory/ephemeral)  │
│                     │  best   │                          │
│  • task files       │  effort │  • availability          │
│  • assignments      │  post   │  • attachment posture    │
│  • roster           │  commit │  • work state            │
│  • reports/reviews  │         │  • budget                │
└─────────────────────┘         └──────────────────────────┘
         ▲                                    │
         │         NO REVERSE ARROW           │
         └────────────────────────────────────┘
```

- Task commands own durable mutations.
- PrincipalRuntime updates are **post-commit advisory side effects**.
- PrincipalRuntime must never create, claim, close, review, or assign tasks.
- If PrincipalRuntime is missing or update fails, the task command succeeds anyway.

---

## 3. Event-to-Transition Mapping

### 3.1 Complete Mapping Table

| Task Governance Event | PrincipalRuntime Effect | Auto / Opt / Warn | Command Owner | If PR Missing | If PR Transition Invalid |
|-----------------------|------------------------:|-------------------|---------------|---------------|--------------------------|
| `task roster assign` | No transition | — | `task-roster.ts` | No-op | No-op |
| `task claim` | `attached_interact` → `claiming` | **Optional** (`--update-principal-runtime`) | `task-claim.ts` | Warn, continue | Warn, continue |
| `task report` | `executing` → `waiting_review` | **Automatic** (best-effort) | `task-report.ts` | Silent continue | Warn, continue |
| `task review accepted` | `waiting_review` → `attached_interact` | **Automatic** (best-effort) | `task-review.ts` | Silent continue | Warn, continue |
| `task review rejected` | `waiting_review` → `attached_interact` | **Automatic** (best-effort) | `task-review.ts` | Silent continue | Warn, continue |
| `task release completed` | `executing` → `attached_interact` | **Automatic** (best-effort) | `task-release.ts` | Silent continue | Warn, continue |
| `task release abandoned` | `executing/claiming` → `attached_interact` | **Automatic** (best-effort) | `task-release.ts` | Silent continue | Warn, continue |
| `task release budget_exhausted` | Any active work state → `budget_exhausted` | **Automatic** (best-effort) | `task-release.ts` | Silent continue | Warn, continue |
| `task roster done` (no report) | Warning only; no transition | **Warn** | `task-roster.ts` | N/A | N/A |
| `task roster idle` | No transition unless explicit detach command | — | `task-roster.ts` | No-op | No-op |

### 3.2 Mapping Rationale

**`task roster assign` → no transition:**
- The roster assignment is a routing/planning signal, not a runtime attachment.
- `task roster assign` does not attach the principal to a Site.
- The principal must separately `narada principal attach` to establish runtime state.
- This preserves the separation between assignment planning and runtime mechanics.

**`task claim` → optional (`--update-principal-runtime`):**
- Claiming a task is a governance action that does not require a PrincipalRuntime.
- An agent may claim a task before attaching to a Site, or claim without ever having a PrincipalRuntime.
- The transition should be opt-in via `--update-principal-runtime` because:
  - Not all claiming agents have PrincipalRuntime records.
  - The `claiming` state in PrincipalRuntime implies an active lease request, which the scheduler owns.
  - Auto-transitioning would create false `claiming` states for agents that claim tasks but do not request leases.
- When the flag is present, the command attempts: `attached_interact` → `claiming`.

**`task report` → automatic:**
- A WorkResultReport means the agent finished executing and produced output.
- If the agent has a PrincipalRuntime in `executing`, it should move to `waiting_review`.
- Silent continue if missing: reporting is a governance event; the absence of a runtime record is normal.

**`task review accepted/rejected` → automatic:**
- Review resolves the governance state of the work.
- The principal is no longer waiting for review.
- Transition to `attached_interact` (if still attached) or `available` (if detached).
- The exact target state depends on current attachment: `attached_*` → `attached_interact`; `detached/stale` → `available`.

**`task release` (all reasons) → automatic:**
- Releasing a task means the assignment is over.
- The principal should leave any active work state.
- `budget_exhausted` is a special case: transition to `budget_exhausted` state explicitly.
- Other releases transition out of `executing/claiming/waiting_review` to `attached_interact` or `available`.

**`task roster done` without WorkResultReport → warn:**
- This is a divergence signal: the roster says the agent is done, but no WorkResultReport was submitted.
- The command should warn the operator that the agent may have skipped reporting.
- No PrincipalRuntime transition because there is no clear runtime meaning for "done without report."

### 3.3 State Resolution Rules

When a task command needs to update PrincipalRuntime but the principal is not in the expected source state:

```
IF principal not found:
  → log at debug level (not warning for report/review; warning for claim with --update-principal-runtime)
  → continue

IF principal found but not in expected source state:
  → log warning: "PrincipalRuntime for <agent_id> is in state <state>, expected <expected>. Skipping transition."
  → continue

IF transition is invalid per state machine:
  → log warning: "Invalid PrincipalRuntime transition: <from> → <to> for <agent_id>. Skipping."
  → continue
```

---

## 4. Bridge Invariants

### 4.1 Required Invariants

| # | Invariant | Defense |
|---|-----------|---------|
| 1 | **Missing PrincipalRuntime must not block task-governance commands.** | All PR lookups are wrapped in try/catch. PR missing → log and continue. |
| 2 | **PrincipalRuntime transition failure must not partially mutate task files.** | Task mutations complete in full before PR update is attempted. PR update is post-commit. |
| 3 | **Task lifecycle mutations must complete or fail independently of PrincipalRuntime.** | PR update runs after task write succeeds. No rollback of task state on PR failure. |
| 4 | **PrincipalRuntime updates are post-commit advisory updates unless the command is explicitly a PrincipalRuntime command.** | `task claim` without `--update-principal-runtime` does not touch PR. `task report/review/release` update PR only after durable writes succeed. |
| 5 | **If task mutation succeeds but PR update fails, command warns and records residual evidence.** | Warning is emitted to stderr or logged. No derivative status file created. |
| 6 | **PrincipalRuntime must never create, claim, close, review, or assign tasks by itself.** | PR has no write path to task files, assignments, roster, reports, or reviews. |
| 7 | **Roster and PrincipalRuntime may diverge; divergence should be observable.** | `narada principal list` and `narada task roster show` show both states side by side. Warnings emitted on divergence. |
| 8 | **PrincipalRuntime state does not grant authority.** | Authority checks remain in `executeOperatorAction()` and scheduler/foreman. PR state is not checked for capability. |

### 4.2 What Happens on Divergence

| Divergence Scenario | Detection | Behavior |
|---------------------|-----------|----------|
| Roster says `working`, PR says `available` | `task recommend` / `principal list` | Warning: "Roster/PR divergence — agent may have detached" |
| Roster says `idle`, PR says `executing` | `task recommend` / `principal list` | Warning: "Roster stale — agent is executing without roster record" |
| Task is `claimed`, PR is `waiting_review` | Bridge logic on next report | Warning: "Task already in review but PR still waiting_review" |
| Task is `closed`, PR is `executing` | Reconciliation / `principal list` | Warning: "Task closed but PR still executing — possible stale runtime" |

---

## 5. Storage Boundaries

### 5.1 Current Locations

| Store | Current Path | Owner | Durability |
|-------|-------------|-------|------------|
| Task files | `<cwd>/.ai/do-not-open/tasks/*.md` | Task governance | Durable |
| Assignments | `<cwd>/.ai/do-not-open/tasks/tasks/assignments/*.json` | Task governance | Durable |
| Roster | `<cwd>/.ai/agents/roster.json` | Task governance | Durable |
| Reports | `<cwd>/.ai/do-not-open/tasks/tasks/reports/*.json` | Task governance | Durable |
| Reviews | `<cwd>/.ai/reviews/*.json` | Task governance | Durable |
| PrincipalRuntime | `<config-dir>/.principal-runtimes.json` | Console / agent runtime | Ephemeral |

### 5.2 Resolution Strategy

The bridge must locate PrincipalRuntime state from task commands. Since task commands operate repo-local (`cwd`) and PrincipalRuntime is config-adjacent (`dirname(config.json)`), there is a location mismatch.

**Chosen approach:**

1. **Default:** Task commands resolve PrincipalRuntime state from `cwd` (i.e., assume `config.json` is in the repo root, which is also `cwd`). This is the common case for local development.
2. **Override:** Add `--principal-state-dir <path>` to all task commands that may update PrincipalRuntime (`claim`, `report`, `review`, `release`).
3. **Environment:** Respect `NARADA_PRINCIPAL_STATE_DIR` env var as fallback.

```typescript
function resolvePrincipalStateDir(cwd: string, options?: { principalStateDir?: string }): string {
  if (options?.principalStateDir) return resolve(options.principalStateDir);
  if (process.env.NARADA_PRINCIPAL_STATE_DIR) return resolve(process.env.NARADA_PRINCIPAL_STATE_DIR);
  return resolve(cwd);
}
```

This preserves existing PrincipalRuntime semantics while allowing task commands to find the registry.

---

## 6. CLI Integration Points

### 6.1 Command Changes

| Command | Change | PR Update? |
|---------|--------|------------|
| `narada task claim <n> --agent <a>` | Add `--update-principal-runtime` and `--principal-state-dir` | Optional |
| `narada task report <n> --agent <a>` | Add `--principal-state-dir`; auto-update PR after report write | Automatic |
| `narada task review <n> --agent <a>` | Add `--principal-state-dir`; auto-update PR after review write | Automatic |
| `narada task release <n> --reason <r>` | Add `--principal-state-dir`; auto-update PR after release | Automatic |
| `narada task roster done <n> --agent <a>` | Warn if no WorkResultReport exists | Warning only |
| `narada task roster idle --agent <a>` | No PR change | No |
| `narada principal sync-from-tasks` | **New command** — reconcile PR state from task graph | N/A |

### 6.2 New Command: `narada principal sync-from-tasks`

Purpose: Repair divergence between task governance and PrincipalRuntime.

Behavior:
- Scan all task files, assignments, and reports.
- For each agent in roster with an active assignment:
  - Find matching PrincipalRuntime by `principal_id`.
  - If PR state is inconsistent with task state, apply corrective transition (with warning).
- If no PR exists for an agent with an active assignment, do not create one (PR is ephemeral; creation is console-owned).
- Output: JSON or human-readable divergence report.

This is the **reconciliation** path, not the primary bridge path.

---

## 7. Implementation Shape

### 7.1 Chosen Shape: Hybrid

**Primary mechanism:** Best-effort post-commit hook in task commands.
**Secondary mechanism:** Explicit `narada principal sync-from-tasks` reconciliation command.

### 7.2 Justification

| Approach | Why It Was Rejected |
|----------|--------------------|
| **Pure post-commit hook** | Cannot repair divergence that occurs outside command execution (e.g., PR record deleted, manual task file edits, crash during post-commit). |
| **Pure `--update-principal-runtime` opt-in** | Too manual. Most bridge events (report, review, release) should just work without extra flags. Only `claim` should be opt-in because not all claiming agents have PR records. |
| **Pure reconciliation command** | Requires explicit operator action. The common case (agent reports, review resolves) should be automatic. |
| **Hybrid** | **Accepted.** Post-commit hooks handle the happy path. Reconciliation command handles divergence recovery, stale state, and missing records. |

### 7.3 Shared Bridge Helper

A new module `packages/layers/cli/src/lib/principal-bridge.ts` should encapsulate all bridge logic:

```typescript
// Pseudotype — exact implementation in Task 456
export interface BridgeUpdateResult {
  updated: boolean;
  previous_state?: PrincipalRuntimeState;
  new_state?: PrincipalRuntimeState;
  warning?: string;
}

export async function updatePrincipalRuntimeFromTaskEvent(
  cwd: string,
  event: TaskGovernanceEvent,
  options?: { principalStateDir?: string; agentId?: string },
): Promise<BridgeUpdateResult>;
```

This centralizes:
- Registry resolution
- Principal lookup by `principal_id` (from `agent_id`)
- Transition validation
- Warning generation
- Error handling

---

## 8. Residual Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| PR state dir mismatch (task command runs from different cwd than principal attach) | Medium | PR updates silently skipped | `--principal-state-dir` + env var + clear warning |
| Multiple principals share same `principal_id` | Low | Wrong principal updated | Bridge uses `principal_id` match; if multiple match, warn and skip |
| PR update fails after task write (disk full, race) | Low | Divergence | Warning emitted; `sync-from-tasks` can repair |
| Operator manually edits task files, PR becomes stale | Medium | Divergence | `sync-from-tasks` + lint warnings |
| Agent claims task without PR, then attaches later | Medium | PR never enters `claiming` | Acceptable — `claiming` is scheduler-owned anyway |
| Budget exhaustion during task execution | Low | PR not updated if crash before release | Scheduler lease recovery handles work item; PR staleness is advisory |

---

## 9. Implementation Recommendation

**Verdict: Implementation justified. Create Task 456.**

The bridge is worth implementing because:
1. Task commands (`claim`, `report`, `review`, `release`) already exist.
2. PrincipalRuntime (`types.ts`, `state-machine.ts`, `registry.ts`) already exists.
3. The bridge is a thin advisory layer — no authority boundary changes.
4. It makes the multi-agent build-out loop more observable without adding manual steps.
5. The residual risks are manageable with warnings and a reconciliation command.

**What NOT to implement:**
- No automatic task assignment from PrincipalRuntime.
- No PR-to-task reverse authority.
- No merge of roster and PrincipalRuntime.
- No distributed consensus or persistent principal memory.
- No changes to scheduler/foreman authority.

---

## 10. Acceptance Criteria

- [x] Decision artifact exists at `.ai/decisions/20260422-444-task-governance-principal-runtime-bridge.md`.
- [x] Event-to-transition mapping is explicit for all task governance events.
- [x] Bridge invariants preserve PrincipalRuntime as advisory/ephemeral.
- [x] Missing/invalid PrincipalRuntime behavior is specified (warn + continue).
- [x] Implementation shape is chosen (hybrid) and justified.
- [x] Storage boundary resolution is specified (`cwd` default, `--principal-state-dir` override, env var fallback).
- [x] A self-standing implementation task (Task 456) is created.
- [x] No bridge code is implemented in this task.
- [x] No derivative task-status files are created.
