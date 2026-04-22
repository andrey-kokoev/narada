# Decision: Construction Operation Readiness and Gap Analysis

**Date:** 2026-04-22
**Task:** 408
**Depends on:** 385 (Roster), 397 (Session Attachment), 406 (Principal Runtime)
**Chapter:** Construction Operation
**Verdict:** **Ready to plan. Six follow-up tasks required (410–415).**

---

## 1. What Already Exists

| Capability | Location | Maturity |
|------------|----------|----------|
| Task state machine (7 statuses, transitions, dependency enforcement) | `task-governance.ts`, `task-claim.ts`, `task-release.ts`, `task-review.ts` | **Mature** |
| Atomic task number allocation with file lock | `task-governance.ts` | **Mature** |
| Assignment records (file-based) | `.ai/tasks/assignments/{task-id}.json` | **Mature** |
| Agent roster (operational tracking) | `.ai/agents/roster.json`, `task-roster.ts` | **Mature** |
| Review records with structured findings | `.ai/reviews/{review-id}.json`, `task-review.ts` | **Mature** |
| Review-to-corrective-task derivation | `task-derive-from-finding.ts` | **Mature** |
| Continuation affinity (manual + computed) | `task-governance.ts`, `task-list.ts` | **Mature** |
| Chapter closure operator | `chapter-close.ts` | **Mature** |
| PrincipalRuntime state machine | `packages/layers/control-plane/src/principal-runtime/` | **Implemented** |
| Session attachment semantics | Decision 397 | **Designed** |
| Task lint (collision detection, broken deps) | `task-lint.ts` | **Mature** |

## 2. What Manual Human Work Currently Compensates

| Manual Work | Why It Is Manual | What Machinery Is Missing |
|-------------|------------------|---------------------------|
| Operator decides which agent claims which task | Narada has no planner that evaluates fit | Assignment recommendation algorithm |
| Operator detects write-set conflicts between parallel tasks | No conflict detection surface | Write-set overlap analysis |
| Operator ensures reviewer is not the worker | No automated review-separation check | Review-separation validation |
| Operator balances load across agents | No load visibility across principals | Principal availability + workload aggregation |
| Operator prioritizes tasks against capacity | No capacity model | Budget/cost integration with PrincipalRuntime |
| Operator routes continuation tasks to warm agents | Affinity exists but is not used for routing | Claim-time affinity consultation |

## 3. What Should Remain Human/Operator Authority

The following must **never** be automated in this chapter:

| Authority | Why Human |
|-----------|-----------|
| **Final assignment** | Recommendation is advisory; operator knows context, urgency, and trust |
| **Priority override** | Business context (deadlines, incidents) is outside Narada's model |
| **Veto** | Operator may reject a recommendation for reasons not in the graph |
| **Task acceptance** | Operator confirms task output meets intent before closure |
| **Architect evaluation** | Assessment is evaluation, not command; operator decides whether to act on it |
| **Roster mutation** | Roster is advisory tracking; only operator changes agent roles/capabilities |
| **Policy changes** | Authority class bindings, tool catalogs, charter runtime config require `admin` posture |

## 4. What Can Be Safely Recommended by Narada

| Recommendation | Input Data | Output | Confidence |
|----------------|------------|--------|------------|
| **Agent-task fit** | Roster capabilities + task required capabilities | Ranked agent list | Medium — capabilities are coarse-grained |
| **Dependency readiness** | Task graph + current statuses | Boolean + blocking task list | High — deterministic |
| **Affinity routing** | Assignment history + manual affinity | Preferred agent + strength | Medium — historical correlation |
| **Load balance** | PrincipalRuntime states + active assignments | Least-loaded qualified agent | Medium — state is ephemeral |
| **Review separation warning** | Assignment records + review history | Warning if reviewer == worker | High — deterministic |
| **Write-set overlap** | Changed file lists from assignments | Overlap report | Medium — requires git/file tracking |
| **Budget risk** | PrincipalRuntime budget + task estimated cost | Risk flag | Low — cost estimation is not yet implemented |

## 5. What Must Not Be Automated Yet

| Capability | Why Deferred | Path Forward |
|------------|--------------|--------------|
| **Autonomous dispatch** (claim without operator approval) | Violates authority boundary; no recovery path if wrong | Future chapter after recommendation quality is proven |
| **Autonomous commits** | Narada is not yet trusted to judge semantic correctness | Requires confirmation operator maturity |
| **Direct agent spawning** | Spawning processes is `execute` authority; needs governance | Requires intent handoff for spawn actions |
| **Cost estimation** | No historical cost data exists | Requires telemetry from Task 414 fixture |
| **Dynamic capability learning** | Capabilities are currently static in roster | Future chapter with review-derived capability updates |

## 6. What Existing Surfaces Are Reused

| Surface | Reuse | Changes Needed |
|---------|-------|----------------|
| `narada task list` | Shows runnable tasks sorted by affinity | Add recommendation column |
| `narada task claim` | Operator executes recommended assignment | Add `--recommendation-id` support |
| `narada task roster show` | Shows agent availability | Add workload count |
| `narada principal status` | Shows PrincipalRuntime states | Consumed by recommendation engine |
| `narada chapter close` | Closes chapter when tasks terminal | No changes |
| `narada task derive-from-finding` | Creates corrective tasks from review | No changes |
| `narada doctor` | Health checks | Add construction-operation health check |

## 7. What New Surfaces Are Required

| Surface | Purpose | Authority Class |
|---------|---------|-----------------|
| `narada task recommend` (or `task plan`) | Generates assignment recommendations from task graph + roster + principal state | `derive` |
| Write-set tracker | Records which files each task modifies | `derive` (read-only) |
| Review-separation validator | Ensures reviewer ≠ worker for any task | `derive` (read-only) |
| Construction Operation health check | Reports recommendation coverage, blocked tasks, orphaned assignments | `derive` (read-only) |
| Assignment recommendation record | Durable record of a recommendation (for audit, not authority) | `propose` |

---

## 8. CCC Posture Table

### 8.1 semantic_resolution

| Dimension | Evidenced | Projected | Pressure Path | Evidence Required |
|-----------|-----------|-----------|---------------|-------------------|
| **Aim clarity** | `+1` — "advance system by governed task-graph execution" is explicit | `+1` — remains clear after chapter | Task 410 boundary contract | Boundary artifact accepted |
| **Term stability** | `+1` — `Operation`, `Site`, `Cycle`, `Act`, `Trace` are canonical | `+1` — `Construction Operation` does not overload them | Task 410 boundary contract | No terminology collisions in review |
| **Scope boundary** | `0` — task governance exists but is not framed as Operation | `+1` — development loop is a first-class Operation with boundary contract | Task 410 boundary contract | Boundary contract identifies in-scope/out-of-scope |

### 8.2 invariant_preservation

| Dimension | Evidenced | Projected | Pressure Path | Evidence Required |
|-----------|-----------|-----------|---------------|-------------------|
| **Authority separation** | `+1` — roster is advisory, claim is operator action, lease is scheduler | `+1` — recommendation is advisory, assignment is operator | Tasks 411, 412 | Recommendation record does not auto-claim |
| **Review separation** | `0` — no automated check exists | `+1` — reviewer≠worker is enforced before review acceptance | Task 413 | Fixture proves separation check |
| **Write-set isolation** | `-1` — no conflict detection | `0` — overlap is detected and warned, not blocked | Task 413 | Fixture proves overlap detection |
| **Principal state safety** | `+1` — deleting PrincipalRuntime does not destroy durable state (Decision 406) | `+1` — preserved after integration | Task 412 | Integration contract preserves ephemeral boundary |

### 8.3 constructive_executability

| Dimension | Evidenced | Projected | Pressure Path | Evidence Required |
|-----------|-----------|-----------|---------------|-------------------|
| **Task governance** | `+1` — claim/release/review/close all work | `+1` — reused unchanged | Task 410 | Boundary contract confirms reuse |
| **Roster integration** | `+1` — roster read/write works | `+1` — recommendation reads roster, does not write it | Task 412 | Integration contract shows read-only use |
| **PrincipalRuntime integration** | `+1` — state machine works, CLI works | `+1` — recommendation consumes principal state | Task 412 | Integration contract shows advisory consumption |
| **Recommendation engine** | `-1` — does not exist | `+1` — `narada task recommend` produces ranked recommendations | Task 411 | Fixture proves recommendation quality |
| **Fixture coverage** | `0` — task governance has unit tests | `+1` — recommendation quality is fixture-proven | Task 414 | Fixture passes with >80% top-3 accuracy |

### 8.4 grounded_universalization

| Dimension | Evidenced | Projected | Pressure Path | Evidence Required |
|-----------|-----------|-----------|---------------|-------------------|
| **Graph generality** | `+1` — task graph works for any repo with `.ai/tasks/` | `+1` — recommendation works for any task graph | Task 411 | Algorithm is task-content-agnostic |
| **Principal generality** | `+1` — PrincipalRuntime covers operator/agent/worker/external | `+1` — recommendation handles all principal types | Task 412 | Integration contract covers all types |
| **Vertical neutrality** | `+1` — task governance is vertical-neutral | `+1` — recommendation is vertical-neutral | Task 410 | Boundary contract confirms no vertical leakage |

### 8.5 authority_reviewability

| Dimension | Evidenced | Projected | Pressure Path | Evidence Required |
|-----------|-----------|-----------|---------------|-------------------|
| **Recommendation audit** | `-1` — no recommendation records exist | `+1` — every recommendation is recorded with rationale | Task 411 | Recommendation record schema exists |
| **Operator override** | `+1` — operator can always claim/release/review directly | `+1` — operator can ignore any recommendation | Task 411 | CLI supports bypass |
| **Review separation audit** | `0` — manual only | `+1` — separation check is logged | Task 413 | Review record includes separation validation |

### 8.6 teleological_pressure

| Dimension | Evidenced | Projected | Pressure Path | Evidence Required |
|-----------|-----------|-----------|---------------|-------------------|
| **Completion pressure** | `+1` — chapter closure enforces terminal tasks | `+1` — Construction Operation has explicit closure criteria | Task 415 | Closure artifact accepted |
| **Quality pressure** | `0` — review exists but is manual | `+1` — fixture creates objective quality signal | Task 414 | Fixture metrics meet threshold |
| **Coherence pressure** | `+1` — affinity creates continuation coherence | `+1` — recommendation reinforces coherence | Task 411 | Recommendation respects affinity |

---

## 9. Gap Summary

| Gap | Severity | Addressed By | Risk If Skipped |
|-----|----------|--------------|-----------------|
| No assignment recommendation algorithm | **Critical** | Task 411 | Operator bottleneck persists |
| No PrincipalRuntime ↔ task-governance integration contract | **Critical** | Task 412 | Principal state is orphaned from assignment logic |
| No review-separation check | **High** | Task 413 | Review integrity compromised |
| No write-set conflict detection | **Medium** | Task 413 | Parallel task corruption risk |
| No fixture proving recommendation quality | **High** | Task 414 | No objective quality signal |
| No Construction Operation boundary contract | **Critical** | Task 410 | Scope creep, authority confusion |

---

## 10. Verdict

**The Construction Operation chapter is ready to plan.**

The foundation is strong: task governance, roster tracking, affinity, review loop, PrincipalRuntime, and chapter closure all exist. The missing pieces are the recommendation algorithm, integration contracts, conflict detection, and a proving fixture. These are well-bounded and do not require redesigning existing surfaces.

**Recommended task range:** 410–415 (six tasks).
