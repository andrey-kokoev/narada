# Decision 553 — Recommendation Input Snapshot Contract

> **Status:** Closed  
> **Task:** 553  
> **Governed by:** task_close:a2  
> **Depends on:** 552  
> **Chapter:** Assignment Recommendation Zone And Promotion Crossing (552–556)

---

## Goal

Define the canonical deterministic input snapshot for assignment recommendation and its admissibility checks.

---

## Canonical Input Families

The recommendation zone consumes exactly **six input families**. No other inputs are admissible.

### 1. Task State

| Property | Source | Field |
|----------|--------|-------|
| Task identity | `.ai/do-not-open/tasks/*.md` filename | `task_id` |
| Task number | `.ai/do-not-open/tasks/*.md` front matter / filename | `task_id` or filename extract |
| Status | `.ai/do-not-open/tasks/*.md` front matter | `status` |
| Title | `.ai/do-not-open/tasks/*.md` body H1 | `# Title` |
| Dependencies | `.ai/do-not-open/tasks/*.md` front matter | `depends_on` |
| Continuation affinity | `.ai/do-not-open/tasks/*.md` front matter | `continuation_affinity` |
| Body text | `.ai/do-not-open/tasks/*.md` body | Full text (for capability extraction) |

### 2. Agent State

| Property | Source | Field |
|----------|--------|-------|
| Agent identity | `.ai/agents/roster.json` | `agents[].agent_id` |
| Capabilities | `.ai/agents/roster.json` | `agents[].capabilities` |
| Operational status | `.ai/agents/roster.json` | `agents[].status` |
| Current task | `.ai/agents/roster.json` | `agents[].task` |
| Last done | `.ai/agents/roster.json` | `agents[].last_done` |

### 3. Principal Runtime State (Advisory)

| Property | Source | Field |
|----------|--------|-------|
| Principal state | `.ai/principal-runtime.json` | `principals[].state` |
| Budget remaining | `.ai/principal-runtime.json` | `principals[].budget_remaining` |
| Active work item | `.ai/principal-runtime.json` | `principals[].active_work_item_id` |

**Degradation:** If the PrincipalRuntime file is missing, all principals are treated as having no runtime constraints (budget = unlimited, no active work item).

### 4. Assignment History

| Property | Source | Field |
|----------|--------|-------|
| Claim history | `.ai/do-not-open/tasks/tasks/assignments/{task_id}.json` | `assignments[]` |
| Release reason | `.ai/do-not-open/tasks/tasks/assignments/{task_id}.json` | `assignments[].release_reason` |
| Last completed worker | `.ai/do-not-open/tasks/tasks/assignments/{task_id}.json` | Latest `completed` assignment |
| Per-agent completion counts | `.ai/do-not-open/tasks/tasks/assignments/*.json` | Aggregated across all tasks |

### 5. Work Result Reports

| Property | Source | Field |
|----------|--------|-------|
| Changed files | `.ai/do-not-open/tasks/tasks/reports/{task_id}-{timestamp}.json` | `changed_files` |
| Work type | `.ai/do-not-open/tasks/tasks/reports/{task_id}-{timestamp}.json` | `work_type` |
| Status | `.ai/do-not-open/tasks/tasks/reports/{task_id}-{timestamp}.json` | `status` |
| Quality | `.ai/do-not-open/tasks/tasks/reports/{task_id}-{timestamp}.json` | `quality` |

**Usage:** Write-set risk heuristic checks file overlap between the candidate task and other active assignments.

### 6. CCC Posture (Advisory)

| Property | Source | Field |
|----------|--------|-------|
| Constructive executability | `.ai/construction-loop/posture.json` | `coordinates.constructive_executability.reading` |
| Teleological pressure | `.ai/construction-loop/posture.json` | `coordinates.teleological_pressure.reading` |
| Authority reviewability | `.ai/construction-loop/posture.json` | `coordinates.authority_reviewability.reading` |
| Semantic resolution | `.ai/construction-loop/posture.json` | `coordinates.semantic_resolution.reading` |
| Invariant preservation | `.ai/construction-loop/posture.json` | `coordinates.invariant_preservation.reading` |
| Grounded universalization | `.ai/construction-loop/posture.json` | `coordinates.grounded_universalization.reading` |

**Degradation:** If posture is missing or expired, posture adjustments are skipped (no boost, no penalty).

**Boundary note:** CCC Posture is consumed by `taskRecommendCommand` (the command wrapper), not by `generateRecommendations()` directly. The posture applies multiplicative score adjustments to the candidate list after `generateRecommendations()` returns.

---

## Authoritative vs Advisory Inputs

| Input Family | Authority | Rationale |
|-------------|-----------|-----------|
| Task State | **Authoritative** | Markdown front matter is the current source of truth for task status and dependencies. The recommendation zone reads it; it does not question it. |
| Agent State | **Authoritative** | Roster is the current source of truth for agent availability and capabilities. |
| Assignment History | **Authoritative** | Assignment records are the durable history of claims and releases. |
| Work Result Reports | **Advisory** | Report data may be stale or incomplete. Used for risk heuristics, not for correctness. |
| Principal Runtime | **Advisory** | Runtime data is best-effort and may be stale. Used for scoring but not authoritative for correctness. |
| CCC Posture | **Advisory** | Posture is an explicit advisory signal (SEMANTICS.md §2.12). Removing it must leave all durable boundaries intact. |

---

## Deterministic Input Admissibility Checks

Before scoring begins, the recommendation zone runs the following admissibility checks on its input snapshot. Failure of any check may cause the zone to abstain or reject.

### Presence Checks

| # | Check | Failure Mode |
|---|-------|-------------|
| 1 | Task directory exists and is readable | Abort with error |
| 2 | Roster file exists and is readable | Abort with error |
| 3 | At least one task file is present | Return empty recommendation |
| 4 | At least one agent is present in roster | Return empty recommendation |

### Freshness Checks

| # | Check | Threshold | Failure Mode |
|---|-------|-----------|-------------|
| 5 | Roster `updated_at` is within policy stale timeout | `stale_agent_timeout_ms` from roster | Mark stale agents with warning risk |
| 6 | Assignment records older than 30 days are ignored for active-claim detection | 30 days | Ignore old records |
| 7 | PrincipalRuntime file (if present) older than 5 minutes is ignored | 5 minutes | Degrade to no-runtime-constraints |
| 8 | CCC Posture past `expires_at` is ignored | `expires_at` | Skip posture adjustments |

### Non-Contradiction Checks

| # | Check | Failure Mode |
|---|-------|-------------|
| 9 | No task is both `opened` and has an active assignment | Log warning; treat as claimed for recommendation purposes |
| 10 | No agent is both `idle` in roster and has an active work item in PrincipalRuntime | Log warning; use PrincipalRuntime as tiebreaker |

---

## Snapshot Artifact Shape

The recommendation zone may optionally persist a **deterministic input snapshot** for reproducibility and audit. This is a single JSON file written alongside the recommendation output (when the zone is invoked with `--snapshot` or by the construction loop).

```typescript
interface RecommendationInputSnapshot {
  snapshot_id: string;           // UUID
  generated_at: string;          // ISO timestamp
  recommender_id: string;        // architect principal ID

  task_state: {
    task_count: number;
    runnable_count: number;
    dependency_blocked_count: number;
    in_review_count: number;
    tasks: Array<{
      task_id: string;
      task_number: number | null;
      status: string;
      title: string | null;
      depends_on: number[];
      continuation_affinity: { preferred_agent_id: string | null; affinity_strength: number; affinity_reason: string | null; source: string } | null;
      capability_keywords: string[];
    }>;
  };

  agent_state: {
    agent_count: number;
    agents: Array<{
      agent_id: string;
      status: string;
      capabilities: string[];
      current_task: number | null;
      last_done: number | null;
      updated_at: string;
    }>;
  };

  principal_runtime: {
    available: boolean;          // true if file was present and fresh
    principal_count: number;
    principals: Array<{
      principal_id: string;
      state: string;
      budget_remaining: number | null;
      active_work_item_id: string | null;
    }>;
  };

  assignment_history: {
    assignment_file_count: number;
    per_agent_completion_counts: Record<string, { completed: number; abandoned: number }>;
    last_worker_map: Record<string, string | null>;
    active_assignment_map: Record<string, string[]>;
  };

  work_result_reports: {
    report_file_count: number;
    per_task_reports: Record<string, Array<{
      changed_files: string[];
      work_type: string;
      status: string;
      quality: string;
      timestamp: string;
    }>>;
  };

  posture: {
    available: boolean;
    expired: boolean;
    coordinates: {
      constructive_executability: { reading: string };
      teleological_pressure: { reading: string };
      authority_reviewability: { reading: string };
      semantic_resolution: { reading: string };
      invariant_preservation: { reading: string };
      grounded_universalization: { reading: string };
    };
  };

  admissibility_results: Array<{
    check_id: string;
    passed: boolean;
    detail?: string;
  }>;
}
```

**Storage:** `.ai/construction-loop/snapshots/rec-{timestamp}-input.json`

**Retention:** Snapshots are retained for 30 days. Older snapshots are purged by the construction loop cleanup phase.

**Authority:** The snapshot is **decorative** (non-authoritative). It exists for reproducibility and debugging. Removing all snapshots must not affect any durable boundary.

---

## Bounded Abstain / Reject Conditions

When admissibility fails, the recommendation zone handles it as follows:

| Condition | Severity | Behavior |
|-----------|----------|----------|
| No tasks found | Info | Return empty recommendation with `summary: "No tasks found"` |
| No agents found | Info | Return empty recommendation with `summary: "No agents found"` |
| No runnable tasks | Info | Return recommendation with `primary: null`, all tasks in `abstained` with reason |
| All agents at capacity | Warning | Return recommendation with `primary: null`, `abstained: []` |
| Roster unreadable | Error | Throw `Error` — this is a system failure, not a recommendation failure |
| PrincipalRuntime stale (> 5 min) | Warning | Degrade to no-runtime-constraints; include warning in recommendation risks |
| Posture missing | Info | Skip posture adjustments; no warning |
| Posture expired | Warning | Skip posture adjustments; include posture_warning in output |
| Active assignment contradicts `opened` status | Warning | Treat task as claimed; do not recommend |

---

## Invariants

1. **Six input families only.** No additional inputs (chat transcripts, terminal scrollback, external APIs, environment variables beyond the six families) may influence recommendation output.
2. **Advisory inputs are optional.** Removing PrincipalRuntime, work result reports, or posture files must not break recommendation; it must only change scores or skip risk checks.
3. **Snapshots are decorative.** The snapshot artifact is not consumed by correctness logic. It exists for audit and reproducibility only.
4. **Admissibility is deterministic.** The same input snapshot always produces the same admissibility results.
5. **Abstain over fabricate.** When no suitable candidate exists, the zone abstains (returns empty/null primary) rather than fabricating a low-confidence recommendation.

---

## Verification Evidence

- `generateRecommendations()` in `task-recommender.ts` reads exactly 5 input families directly ✅
- `taskRecommendCommand()` in `task-recommend.ts` reads the 6th family (CCC Posture) and applies adjustments ✅
- PrincipalRuntime degrades gracefully (try/catch on file read) ✅
- CCC Posture degrades gracefully (try/catch on file read) ✅
- Work result reports degrades gracefully (try/catch on directory read) ✅
- No chat transcript, terminal scrollback, or external API usage in recommender ✅
- `pnpm typecheck`: all 11 packages pass ✅

---

## Closure Statement

The recommendation zone now has an explicit, bounded, and inspectable input contract. Six input families are canonical: Task State, Agent State, Principal Runtime (advisory), Assignment History, Work Result Reports, and CCC Posture (advisory). Admissibility checks cover presence, freshness, and non-contradiction. The optional input snapshot artifact provides reproducibility without becoming a hidden authority surface. Abstain conditions are explicit and never fabricate recommendations.

---

## Next Executable Line

**Task 554 — Recommendation Scoring Refinement:** Improve the discriminative power of the scoring dimensions (capability match, affinity computation, load balancing) while keeping the six-input-family boundary intact.

---

**Closed by:** a2  
**Closed at:** 2026-04-24
