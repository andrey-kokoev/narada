# Chapter Closure: Construction Operation (410–415)

**Date**: 2026-04-22
**Closed by**: Operator action via `narada chapter close Construction Operation`
**Closure artifact (CLI-generated)**: `.ai/decisions/2026-04-22-construction-operation-closure.md`

---

## Chapter Summary

The Construction Operation chapter defined the boundary, design, and fixture for Narada's task-graph execution loop — the human-architect-agent development cycle that advances a system through governed tasks while preserving long-horizon coherence.

All 6 tasks (410–415) are confirmed terminal. No non-terminal tasks remain. No review findings are unresolved.

---

## What Was Delivered (410–414)

### Task 410 — Construction Operation Boundary Contract

**Decision artifact**: `.ai/decisions/20260422-410-construction-operation-boundary-contract.md`

- **Aim statement**: "Advance a software system through governed, task-graph execution while preserving long-horizon coherence."
- **Site definition**: Local filesystem Site with `.ai/do-not-open/tasks/`, `.ai/agents/roster.json`, assignment records, review records, and registry.
- **Cycle definition**: One bounded pass through scan → recommend → claim → execute → review → confirm.
- **Act taxonomy**: 12 governed actions with authority classes (`claim`, `resolve`, `execute`, `propose`, `confirm`, `admin`, `derive`).
- **Trace taxonomy**: 10 trace types with durability, retention, and readership rules.
- **Authority matrix**: 4 roles × 15 actions with explicit yes/no/notes.
- **In-scope / out-of-scope**: 7 in-scope capabilities, 8 deferred capabilities, 4 permanent exclusions.

### Task 411 — Assignment Planner / Dispatcher Design

**Decision artifact**: `.ai/decisions/20260422-411-assignment-planner-design.md`

- **Input model**: Five read-only input domains — Task Graph, Agent Roster, PrincipalRuntime State, Assignment History, Review Records.
- **Scoring function**: Weighted sum of 6 dimensions (affinity 0.30, capability 0.25, load 0.20, history 0.10, review separation 0.10, budget 0.05).
- **Output model**: `AssignmentRecommendation` with `primary`, `alternatives`, `abstained`, per-dimension `breakdown`, and human-readable `rationale`.
- **Algorithm**: 8-step flow — load tasks, load principals, load history, score pairs, resolve conflicts greedily, classify confidence, build abstained list, record recommendation.
- **Abstain conditions**: 6 explicit conditions (no runnable tasks, no available principals, no capability match, all principals busy, all budgets exhausted, preferred principal unavailable).
- **CLI surface**: `narada task recommend` with `--task`, `--agent`, `--weights`, `--dry-run`.

### Task 412 — PrincipalRuntime Integration Contract

**Decision artifact**: `.ai/decisions/20260422-412-principal-runtime-integration-contract.md`

- **Data flow**: Planner consumes PrincipalRuntime state, roster state, and task graph read-only.
- **Conflict resolution**: Conservative rules favor operator knowledge when PrincipalRuntime and roster disagree.
- **Availability model**: Six PrincipalRuntime invariants from Decision 406 respected.
- **Budget/handoff model**: Budget exhaustion surfaces as `budget_exhausted` state; creates continuation affinity for handoff.
- **Observation surface**: Operator sees integrated state via `narada principal status` and `narada task roster`.

### Task 413 — Review Separation and Write-Set Conflict Design

**Decision artifact**: `.ai/decisions/20260422-413-review-separation-write-set-conflict.md`

- **Review-separation check**: Compares `reviewer_agent_id` against last active worker; warns but does not block; operator can override.
- **Write-set tracking**: Manifest-based tracking via `--files` at claim time; `WriteSetManifest` stored in assignment record.
- **Conflict detection**: Detects file overlap and create/delete conflicts across active assignments; conservative (false positives acceptable).
- **Schema extensions**: `ReviewRecord.separation_check` and `TaskAssignmentRecord.write_set_manifest` — both optional and backward-compatible.
- **CLI surfaces**: `narada task validate-separation`, `narada task claim --files`, `narada task check-conflicts`.

### Task 414 — Construction Operation Fixture

**Fixture location**: `packages/layers/cli/test/fixtures/construction-operation/`

- **Engine**: `engine.ts` — implements the 6-dimension scoring function, greedy conflict resolution, confidence classification, abstain logic, review-separation check, and write-set conflict detection.
- **Tests**: `test/commands/construction-operation.test.ts` — 10 test cases covering all 7 required scenarios + 3 supplementary edge cases.
- **Test result**: ✅ 10/10 tests pass (162ms).

---

## Metrics from Fixture (Task 414)

| Metric | Target | Actual | Status |
|--------|--------|--------|--------|
| Top-3 accuracy | ≥ 80% | ≥ 80% (enforced by test) | ✅ Pass |
| Review-separation false negatives | 0 | 0 (4 edge cases tested) | ✅ Pass |
| Write-set conflict false negatives | 0 | 0 (3 scenarios tested) | ✅ Pass |
| Test isolation | No production mutations | `mkdtempSync` temp dirs only | ✅ Pass |
| Total tests | 7 required + 3 supplementary | 10 passed | ✅ Pass |

---

## What Was Deferred

| Capability | Deferred To | Justification |
|------------|-------------|---------------|
| Autonomous dispatch | Post-415 chapter | Requires proven recommendation quality + recovery path from fixture telemetry |
| Autonomous commits | Post-415 chapter | Requires confirmation operator maturity; no auto-commit without explicit policy |
| Dynamic capability learning | Post-415 chapter | Requires historical telemetry not yet collected from live assignments |
| Cost estimation | Post-415 chapter | Requires budget telemetry from fixture; weight placeholder (0.05) is sufficient for v0 |
| Cross-Site construction | Future | Current scope is single-Site; multi-Site orchestration needs a second Site vertical |
| Git-diff based write-set tracking | Post-415 chapter | Manifest-based tracking is sufficient for v0; git integration is convenience, not requirement |
| Static analysis for overlap detection | Future enhancement | File-list comparison is sufficient for v0 |
| Automatic manifest inference | Post-415 chapter | Requires diff-based tracking; manual `--files` declaration is sufficient for v0 |

---

## What Changed in Canonical Docs

| Document | Change | Task |
|----------|--------|------|
| `SEMANTICS.md` | Referenced by boundary contract; no new terms introduced | 410 |
| `AGENTS.md` | Referenced by integration contract; no package boundary changes | 412 |
| `packages/layers/cli/src/lib/task-governance.ts` | No code changes; design references existing surfaces | 411, 413 |
| `packages/layers/cli/src/commands/task-list.ts` | No code changes; design references existing surfaces | 411 |
| `packages/layers/cli/src/commands/task-review.ts` | No code changes; design references existing surfaces | 413 |
| `packages/layers/cli/src/commands/task-roster.ts` | No code changes; design references existing surfaces | 412 |

**No implementation code was added to production packages during this chapter.** All deliverables are decision artifacts and fixture tests.

---

## Known Limitations

1. **Assignment planner is design-only**: The scoring function, algorithm, and CLI surface are specified but not implemented in production code. Task 414's fixture proves the design works; production integration is deferred.

2. **PrincipalRuntime integration is contractual only**: The data flow, conflict resolution, and availability model are defined but not wired into `narada task recommend`.

3. **Review-separation and write-set checks are design-only**: The algorithms are implemented in the fixture but not integrated into `narada task review` or `narada task claim`.

4. **Cost estimation is a placeholder**: The budget dimension exists in the scoring function (weight 0.05) but no actual cost tracking or estimation is implemented.

5. **No live task-graph execution**: This chapter designed the loop; actual execution of the Construction Operation against live tasks requires a subsequent implementation chapter.

---

## Closure Checklist

- [x] All tasks 410–414 are terminal (closed/confirmed).
- [x] Task 415 (closure) is terminal.
- [x] Closure artifact exists at `.ai/chapters/construction-operation-closure.md`.
- [x] CLI-generated closure artifact exists at `.ai/decisions/2026-04-22-construction-operation-closure.md`.
- [x] CHANGELOG.md is updated with Construction Operation chapter entry.
- [x] No non-terminal tasks remain in the chapter.
- [x] No unresolved review findings.
- [x] Operator has explicitly accepted the closure.
