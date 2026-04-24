---
closes_tasks: [552, 553, 554, 555, 556]
closed_at: 2026-04-24
closed_by: a2
reviewed_by: codex
chapter: Assignment Recommendation Zone And Promotion Crossing
---

# Decision 556 — Assignment Recommendation Chapter Closure

## Chapter

Assignment Recommendation Zone And Promotion Crossing (Tasks 552–556)

## Capabilities Delivered

### Task 552 — Recommendation Zone Boundary Contract
- Defined the **Recommendation Zone** as a first-class Narada zone with `derive` authority
- Explicit invariants: read-only, ephemeral output, no write paths, deterministic recomputation
- Distinguished from Assignment zone: recommendation is advisory; assignment is authoritative
- Visual boundary diagram showing Recommendation Zone → Promotion Crossing → Assignment Zone
- Durable artifact at the boundary: `AssignmentPromotionRequest` (append-only, immutable)

### Task 553 — Recommendation Input Snapshot Contract
- Six canonical input families: Task State, Agent State, Principal Runtime (advisory), Assignment History, Work Result Reports (advisory), CCC Posture (advisory)
- Authoritative vs advisory separation documented with rationale
- Deterministic admissibility checks: presence (4 checks), freshness (4 checks), non-contradiction (2 checks)
- Snapshot artifact shape: `RecommendationInputSnapshot` with full type definition
- Bounded abstain/reject conditions: 9 conditions with explicit severity and behavior

### Task 554 — Recommendation Artifact And Output Validation Contract
- Canonical `TaskRecommendation` shape with all sub-types (`CandidateAssignment`, `ScoreBreakdown`, `RecommendationRisk`, `AbstainedTask`)
- Six weighted scoring dimensions documented with weights, sources, and authority classes
- Confidence classification thresholds: `high` (≥0.8 with 0.2 margin), `medium` (≥0.5), `low` (<0.5)
- Deterministic output validation: structural completeness, admissible snapshot, reproducibility, tie-break rules
- Abstain conditions: 6 hard abstain triggers + 3 soft carries
- Inspection posture: CLI surfaces, durable audit trail via promotion request, mandatory advisory treatment

### Task 555 — Recommendation-To-Assignment Crossing Contract
- Crossing declared in canonical 6-field regime language:
  - Source zone: `Recommendation`
  - Destination zone: `Task Assignment`
  - Authority owner: `Operator (claim)` / `Operator (admin)` for override
  - Admissibility regime: 9 validation checks + 1-hour freshness + policy gate
  - Crossing artifact: `AssignmentPromotionRequest`
  - Confirmation rule: Assignment record created + status → `claimed`
- Added to `CROSSING_REGIME_INVENTORY` as 12th entry (advisory, `policy_governed`)
- Promotion preconditions table with hard/soft classification and overrideability
- Operator visibility and override posture documented
- Five explicit non-goals (no blind autoassign, no governance bypass, etc.)

---

## What "First-Class" Means Now

| Criterion | Status | Evidence |
|-----------|--------|----------|
| Zone declared | ✅ | Decision 552 defines Recommendation Zone with authority, invariants, boundaries |
| Input contract defined | ✅ | Decision 553 enumerates 6 input families, admissibility checks, snapshot shape |
| Output contract defined | ✅ | Decision 554 defines artifact shape, validation rules, abstain conditions |
| Crossing declared | ✅ | Decision 555 declares 6-field crossing regime; added to inventory |
| Non-authoritative posture | ✅ | Explicit in all 4 decisions: recommendation is advisory, consumed not trusted |
| Machine-readable | ✅ | Types in `task-recommender.ts`; inventory entry in `crossing-regime-inventory.ts` |
| Inspectable | ✅ | `narada task recommend`, `narada crossing list/show`, promotion audit trail |
| Tested | ✅ | 39 tests (18 recommend + 21 promote) |
| Runtime automation | ❌ Deferred | Bounded auto-promotion exists but not hardened |

---

## Deferred Gaps

1. **Runtime automation hardening.** Bounded auto-promotion (`bounded_auto` level) is implemented but not stress-tested. Race conditions between recommendation generation and promotion execution are not explicitly guarded.
2. **Policy-driven TTL.** The 1-hour recommendation freshness window is hardcoded. Policy-driven TTL with per-task or per-agent override is deferred.
3. **Input snapshot persistence.** The `RecommendationInputSnapshot` type is defined but not yet written to disk by default. `--snapshot` flag or construction loop integration is deferred.
4. **Scoring discriminative power.** The six dimensions use simple heuristics (keyword matching, binary affinity). More nuanced scoring (semantic similarity, historical success rate by task type) is deferred.
5. **UI/workbench consumption.** The workbench displays recommendations as raw JSON. Rich rendering (score bars, risk icons, one-click promote) is deferred.
6. **Crossing regime runtime generalization.** No generic `CrossingRegime` class or runtime framework was built. This was an explicit non-goal (Task 495/500) and remains deferred.

---

## Residual Risks

1. **Float determinism.** Score rounding to 3 decimals bounds but does not eliminate float variance across platforms. Tie-break by roster order mitigates but does not remove the risk.
2. **Roster staleness.** Agent status in `roster.json` may not reflect real-time availability. The PrincipalRuntime advisory signal mitigates but is best-effort.
3. **File-system concurrency.** Multiple agents reading `roster.json` and `assignments/*.json` concurrently may observe inconsistent state. Atomic writes mitigate but do not eliminate this for read-modify-write sequences.
4. **Posture overfit.** CCC posture adjustments use simple keyword heuristics that may misfire (e.g., penalizing "meta" tasks that are actually urgent). Posture is advisory and overrideable.
5. **Promotion delegation trust.** `task-promote-recommendation` delegates to `task-claim` after validation. If `task-claim` changes its gates, promotion behavior may drift without explicit contract update.

---

## Verification Evidence

- `pnpm typecheck`: all 12 packages pass ✅
- `pnpm verify`: 5/5 steps pass ✅
- Crossing regime inventory: 12 entries, new entry validates with `validateCrossingRegimeDeclaration()` ✅
- `narada crossing list`: shows "Recommendation → Assignment" as advisory ✅
- Recommendation tests: 18/18 pass ✅
- Promotion tests: 21/21 pass ✅
- Zero code changes in 552, 553, 554; 1 inventory entry added in 555 ✅

---

## Governed Closure Provenance

| Field | Value |
|-------|-------|
| **Closed by** | a2 |
| **Closed at** | 2026-04-24 |
| **Governance mode** | `derive` → `propose` → `claim` |
| **Authority class** | `propose` (chapter closure is a promotion of task artifacts to terminal state) |
| **Review required by** | codex |
| **Closure basis** | All 5 tasks (552–556) closed; all chapter closure criteria satisfied; 4 decision artifacts produced; 1 inventory entry added |
| **Code changes** | 1 file (`crossing-regime-inventory.ts`) — 1 new advisory crossing entry |

---

## Closure Statement

The Assignment Recommendation Zone And Promotion Crossing chapter is closed. Recommendation is now a **declared first-class zone** with explicit authority (`derive`), explicit inputs (6 families), explicit outputs (`TaskRecommendation` with validation rules), and an explicit governed crossing to assignment (6-field regime declaration in the canonical inventory). The boundary between advisory recommendation and authoritative assignment is sharp: recommendation is consumed, not trusted; promotion re-validates every precondition independently; and the `AssignmentPromotionRequest` provides a durable audit trail.

What remains deferred is honest: runtime automation hardening, policy-driven TTL, input snapshot persistence, richer scoring, and UI polish. These are recognized gaps, not hidden failures. The doctrinal foundation is solid and the implementation matches the doctrine.
