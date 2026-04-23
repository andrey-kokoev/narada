# Decision 513 — Self-Governance Extraction Closure

> **Status:** Closed  
> **Governed by:** task_close:a2  
> **Closes Chapter:** Self-Governance Extraction (Tasks 427, 468, 486, 501, 507, 509, 510, 511, 512)

## Summary

The Self-Governance Extraction Chapter is closed. Narada now has an explicit, policy-bounded boundary between self-governed actions (read-only observation, recommendation, planning, and bounded auto-promotion) and operator-owned actions (terminal closures, live execution, policy changes, schema changes, commit authority). The boundary is enforced by authority class, construction loop policy, and 12 hard gates. No unsafe auto-assignment path exists. What remains deferred is documented without overclaim.

## What This Chapter Accomplished

| Task | What Was Delivered |
|------|-------------------|
| **427** | Governed promotion path design: authority mapping (`claim`), validation schema, append-only audit records, CLI surface `narada task promote-recommendation` |
| **468** | 9 validation checks, `--dry-run`, `--override-risk`, atomic delegation to `task claim`, durable `AssignmentPromotionRequest` artifacts |
| **486** | Canonical agent completion finalizer `narada task finish` with implementer/reviewer path detection, evidence inspection, `--allow-incomplete` escape hatch |
| **501** | Terminal-state ownership hardening: `governed_by` provenance marker, raw-markdown bypass detection, `narada task reopen` repair path |
| **507** | Closure path of least resistance: auto-scaffold missing `## Execution Notes` and `## Verification` in `task report`, remediation guidance in `task close` gate failures, completion grammar in `chapter-init` templates |
| **509** | Verified default-terse / verbose-expanded split for high-frequency governance commands |
| **510** | Self-governance boundary contract: authority class mapping (`inspect` → `admin`), action-by-action classification, policy integration, 5 invariants |
| **511** | Promotion contract: 3-stage pipeline (Recommendation → Promotion Request → Assignment), 9 validation gates, operator-confirmed vs bounded auto-promotion distinction, 6 residual risks |
| **512** | Governed assignment controller integration: `constructionLoopRunCommand` with 12 hard gates, dry-run support, audit logging, 21 focused tests |

## What Narada Now Governs Itself

These actions may be performed autonomously within Narada's build loop, subject to policy:

### 1. Read-Only Observation (Always Self-Governed)

| Action | Surface | Authority | Notes |
|--------|---------|-----------|-------|
| Recommend assignments | `narada task recommend` | `derive` | Scored, ranked candidates. Never mutates state. |
| Produce operator plans | `narada construction-loop plan` | `derive` | Structured plan with promotion candidates and suggested actions. |
| Inspect evidence | `narada task evidence`, `narada task evidence-list` | `inspect` | Completeness checking by criteria. |
| Lint task files | `narada task lint` | `inspect` | Structural validation, orphan detection. |
| Observe task graph | `narada task graph`, `narada task list` | `inspect` | DAG rendering, runnable task detection. |
| Observe roster | `narada task roster show` | `inspect` | Agent status, assignments, history. |

### 2. Bounded Auto-Promotion (Conditionally Self-Governed)

| Action | Surface | Authority | Conditions |
|--------|---------|-----------|------------|
| Auto-promote recommendation | `narada construction-loop run` | `propose` + `claim` | `allowed_autonomy_level = bounded_auto` AND `require_operator_approval_for_promotion = false` AND all 12 hard gates pass |

**The 12 hard gates:**
1. `autonomy_level` — must be `bounded_auto`
2. `operator_approval_disabled` — must be `false`
3. `task_468_validation` — `dry_run_ok`
4. `write_set_risk_low` — no write-set blocking
5. `recommendation_freshness` — ≤ 15 minutes old
6. `task_status_opened` — must be `opened`
7. `agent_idle_duration` — idle/done for ≥ 5 minutes
8. `max_simultaneous` — under active assignment cap
9. `task_not_blocked` — not in blocked list/range
10. `agent_not_blocked` — not in blocked list
11. `not_paused` — loop not paused
12. `daily_agent_limit` — under per-agent daily cap

**Key safety properties:**
- Explicit trigger only (no daemon, timer, or webhook)
- `--dry-run` available for preview
- Every outcome writes an append-only audit record
- Never calls `taskClaimCommand` directly; always delegates through `taskPromoteRecommendationCommand`
- Pause/resume surface for emergency stop

## What Still Requires the Human Operator

These actions remain explicitly operator-owned at all autonomy levels. Narada may recommend or plan them, but the operator must trigger them.

| Category | Actions | Why Operator-Owned |
|----------|---------|-------------------|
| **Work definition** | Chapter selection, task creation, acceptance criteria design | Requires product judgment about scope and priority |
| **Live external execution** | `narada sync`, `narada cycle`, console approve/reject | Mutates live external systems (Graph API, email). Safety-critical. |
| **Unsafe promotion** | `narada task promote-recommendation --override-risk` | Bypasses validation gates. Requires explicit acknowledgment. |
| **Commit authority** | `git commit`, `git push` | Separate authority boundary. CI/CD may govern; Narada does not. |
| **Policy changes** | Editing `.ai/construction-loop/policy.json` | Changes the autonomy boundary itself. Meta-level. |
| **Kernel boundary changes** | Foreman, Scheduler, IntentHandoff, OutboundHandoff | Core invariants must not be altered without governance review. |
| **Schema changes** | Config schema, persistence schema, CLI public surface | Affects all consumers. Requires design review. |
| **Terminal state transitions** | `task close`, `task finish`, `task review` | Independent judgment required for completion confirmation. |
| **Escape hatches** | `task roster done --allow-incomplete` | Conscious bypass of evidence requirements. |
| **Reversal and correction** | `task reopen`, `task derive-from-finding` | Reverses closure or creates corrective work. |

## What Remains Deferred

The following items were identified during this chapter but are intentionally deferred:

| # | Deferred Item | Why Deferred | Unblock Criteria |
|---|--------------|--------------|------------------|
| 1 | **`full_auto` autonomy level** | Reserved for future when `bounded_auto` has proven safe across many cycles | `bounded_auto` exercised for 50+ cycles with <2% incident rate |
| 2 | **Auto-review preparation (`task review --prepare`)** | Review verdict requires independent human judgment | Future chapter on review automation with explicit reviewer confirmation |
| 3 | **Construction loop daemon/timer trigger** | Current explicit-trigger model is safer; daemon introduces liveness risks | Operator requests automated scheduling + policy for failure handling |
| 4 | **Audit log rotation** | `.ai/construction-loop/audit/*.jsonl` grows without bound | Log reaches 10MB or operator reports disk concern |
| 5 | **Durable recommendation store** | Recommendations are ephemeral; only promotion requests are durable | Need arises for recommendation history analysis or ML training |
| 6 | **Observation query for promotion history** | No CLI query for `AssignmentPromotionRequest` archives | Operator asks for promotion history inspection |
| 7 | **Cross-agent promotion coordination** | Two simultaneous `construction-loop run` instances may race for the same agent | Roster race observed in practice or multi-agent setup deployed |
| 8 | **Policy mutation audit trail** | Changes to `policy.json` are not append-only audited | Operator asks for policy change history or compliance requirement |

## Invariants Preserved

1. **Self-governance is policy-bounded, not capability-bounded.** Narada has the code to perform operator-owned actions. The boundary is enforced by policy, not by missing implementation.
2. **Operator-owned actions are invariant across autonomy levels.** No policy setting can make `task close` or `git commit` self-governed.
3. **Self-governed actions are advisory by default.** Even when active, they produce recommendations and plans that the operator may accept, modify, or reject.
4. **Bounded auto-promotion is the only self-governed mutation.** It is the sole exception to the "advisory by default" rule, and it is heavily gated.
5. **Policy changes are always operator-owned.** The operator must explicitly change `allowed_autonomy_level`. Narada may recommend a policy change, but cannot apply it.

## Verification Evidence

- `pnpm verify` — all 5 steps pass
- `pnpm --filter @narada2/cli test -- test/commands/construction-loop-run.test.ts` — 21/21 tests pass
- `pnpm --filter @narada2/cli test -- test/commands/task-promote-recommendation.test.ts` — 15/15 tests pass
- `pnpm --filter @narada2/cli test -- test/commands/construction-loop.test.ts` — 13/13 tests pass
- `pnpm --filter @narada2/cli test -- test/commands/task-finish.test.ts` — 8/8 tests pass
- Full CLI test suite: 622/622 tests pass

## Closure Statement

The Self-Governance Extraction Chapter closes with Narada capable of autonomous recommendation, planning, and bounded auto-promotion within an explicit policy envelope. The human operator retains authority over all terminal decisions, external execution, policy changes, and schema evolution. What remains deferred is documented with clear unblock criteria. No unsafe autonomy has been introduced.

---

**Closed by:** a2  
**Closed at:** 2026-04-23
