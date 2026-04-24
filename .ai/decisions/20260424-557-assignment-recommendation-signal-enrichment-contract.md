# Decision 557 — Assignment Recommendation Signal Enrichment Contract

> **Status:** Closed  
> **Task:** 557  
> **Governed by:** task_close:codex  
> **Depends on:** 553 (Recommendation Input Snapshot), 554 (Recommendation Artifact), 555 (Recommendation-To-Assignment Crossing)  
> **Chapter:** Assignment Recommendation Zone And Promotion Crossing (552–556)  

---

## 1. Problem Statement

The governed recommendation and promotion flow (Tasks 553–555) is structurally sound, but the current recommendation output remains **weakly discriminative**. When multiple idle agents are available for a runnable task, the scoring dimensions frequently collapse into near-identical scores, producing recommendations that are technically valid but not strongly informative.

This contract defines the **next bounded improvement** to recommendation signal quality without collapsing recommendation into opaque heuristic assignment.

---

## 2. Current Discriminative Weakness — Concrete Assessment

The recommendation engine (`task-recommender.ts`) computes six scoring dimensions. Each is assessed below for discriminative power.

### 2.1 Capability Match (weight 0.25)

**Current implementation:** Keyword extraction against 9 hardcoded keyword→capability mappings. `scoreCapability` returns `intersection.length / taskCaps.length`.

**Weakness:**
- If a task body contains none of the 9 keyword groups, `taskCaps.length === 0` and the score defaults to **0.5 for all agents** — zero discriminative power.
- If a task body contains keyword groups but an agent's roster `capabilities` array does not contain the mapped capability, the score is **0.0** — overly punitive for coarse roster data.
- The mapping is static and does not distinguish "deep expertise" from "surface familiarity."

**Observed pattern:** For documentation tasks, architecture tasks, or cross-cutting work, capability match frequently resolves to 0.5 for every candidate.

### 2.2 Affinity (weight 0.30)

**Current implementation:** `scoreAffinity` returns 1.0 for manual affinity, 0.7 for history-derived affinity, 0.0 otherwise.

**Weakness:**
- Most tasks do not declare `continuation_affinity` in front matter.
- History-derived affinity is sparse; it requires a prior completed assignment with an explicit affinity computation.
- The score is **binary (0 or 0.7 or 1.0)** — no gradation for "worked on related task in same chapter" or "recently completed similar work."

**Observed pattern:** For ~70% of runnable tasks, affinity is 0.0 for all agents, removing the highest-weighted dimension from the decision.

### 2.3 Load (weight 0.20)

**Current implementation:** `scoreLoad` counts active assignments from roster `task` field. Returns 1.0 (idle), ~0.67 (1 task), ~0.33 (2 tasks), 0.0 (3+ tasks).

**Weakness:**
- When multiple agents are idle, they all score **1.0** — no differentiation.
- Does not account for task complexity, estimated duration, or how long the agent has been idle.
- A long-idle agent and a just-finished agent both score 1.0.

### 2.4 History (weight 0.10)

**Current implementation:** `scoreHistory` uses completed/abandoned counts from assignment records.

**Weakness:**
- New agents with zero assignments score **0.5** — same as a 50/50 agent.
- Does not consider **closure quality** (clean closure vs. repair loops), **review burden**, or **rework rate**.
- A agent with 10 clean completions and 0 abandonments scores the same as one with 10 completions followed by 10 repairs (if repairs are not recorded as abandonments).

### 2.5 Review Separation (weight 0.10)

**Current implementation:** `scoreReviewSeparation` returns 0.0 if the agent was the last worker, 1.0 otherwise.

**Weakness:**
- Binary — no temporal decay. An agent who worked on the task 6 months ago is treated the same as one who closed it yesterday.
- Does not account for whether the agent has **reviewed** the task since working on it (which would reset separation concerns).

### 2.6 Budget (weight 0.05)

**Current implementation:** `scoreBudget` divides `budget_remaining` by 10,000. Null budget → 1.0.

**Weakness:**
- Most agents in current deployments have **null budgets**, so this dimension contributes nothing to differentiation.
- Even when budgets are present, the 10,000 divisor is arbitrary and may not reflect meaningful operational thresholds.

---

## 3. Bounded Signal Additions and Refinements

The following improvements are **admissible within the six-input-family boundary** (Decision 553). No new input families are introduced.

### 3.1 Chapter / Task-Family Continuation Affinity

**Signal:** `chapter_affinity`

**Definition:** When a task belongs to a chapter (e.g., "531-535 mail connectivity"), agents who recently completed other tasks in the same chapter receive a graduated affinity boost.

**Computation:**
- Extract chapter prefix from task filename (e.g., `20260423-531-...` → chapter `531`).
- Scan assignment history for the same agent + same chapter prefix within a 14-day window.
- Score: `0.3 * (1 - days_ago / 14)` for the most recent chapter match, clamped to [0, 0.3].

**Weight proposal:** Add `chapter_affinity` as a new breakdown field with weight **0.15**, reducing `affinity` weight from 0.30 to 0.15.

**Input family:** Assignment History + Task State (already admissible).

**Authoritative posture:** Advisory. Chapter affinity is a preference, not a requirement.

### 3.2 Doctrine / Implementation Capability Tier

**Signal:** `capability_tier`

**Definition:** Distinguish between "architect-level" capabilities (design, contract, boundary definition) and "implementation-level" capabilities (TypeScript, testing, CLI). A task that mentions "contract" and "boundary" should prefer architect-class agents; a task that mentions "test" and "fixture" should prefer implementer-class agents.

**Computation:**
- Classify each of the 9 capability mappings into `architect`, `implementer`, or `neutral` tiers.
- Classify task keywords into tiers based on which keyword groups matched.
- Compute a tier-alignment score: `1.0` if agent's declared capabilities include the task's dominant tier; `0.5` if the agent has capabilities in a sibling tier; `0.0` if the agent's capabilities are in a disjoint tier.

**Weight proposal:** Replace the flat `capability` score with a composite:
- `capability_match` (0.15) — existing intersection ratio
- `capability_tier` (0.10) — new tier alignment

**Input family:** Agent State + Task State (already admissible).

**Authoritative posture:** Advisory. Tier alignment is a hint, not a gate.

### 3.3 Recent Closure Quality Signal

**Signal:** `closure_quality`

**Definition:** An agent's recent closure quality, derived from work result reports and repair history.

**Computation:**
- For each of the agent's last 10 completed tasks (from assignment history + reports):
  - If the task was closed without `reopen` or `repair` events → +1.0
  - If the task required one repair → +0.5
  - If the task required multiple repairs or was abandoned → +0.0
- Average the last 10 scores. New agents with < 3 completions default to 0.5 (neutral).

**Weight proposal:** Add `closure_quality` as a new breakdown field with weight **0.10**, reducing `history` weight from 0.10 to 0.00 (absorbed into closure_quality).

**Input family:** Work Result Reports + Assignment History (already admissible).

**Authoritative posture:** Advisory. Closure quality is an observable trend, not a judgment of fitness.

### 3.4 Review-Separation Temporal Decay

**Signal:** `review_separation_decay`

**Definition:** Replace the binary review-separation score with a temporally decaying score.

**Computation:**
- If the agent was never the last worker → 1.0
- If the agent was the last worker:
  - Within 24 hours → 0.0 (too fresh — likely still has implementation bias)
  - 1–7 days → `0.3 + 0.7 * (days_ago - 1) / 6`
  - 7–30 days → `0.7 + 0.3 * (days_ago - 7) / 23`
  - > 30 days → 1.0

**Weight proposal:** Keep weight at **0.10**, but replace binary logic with decay function.

**Input family:** Assignment History (already admissible).

**Authoritative posture:** Advisory. Temporal separation is a preference, not a policy rule.

### 3.5 Active-Context Locality

**Signal:** `context_locality`

**Definition:** Prefer agents who are already working on tasks in the same vertical, chapter, or file-modification neighborhood.

**Computation:**
- For each active assignment of the candidate agent:
  - Compute task similarity: same chapter prefix → 0.5; same capability keywords → 0.3; file overlap in recent reports → 0.2.
  - Sum similarities across active assignments, clamp to [0, 1.0].
- Return `1.0 - similarity_sum` (lower is more similar — we want agents who are NOT overloaded in the same context, OR we want agents who ARE in the same context for batching; this needs a policy knob).

**Policy knob:** `context_locality_mode` — `prefer_related` (warm context, batch related work) vs `prefer_unrelated` (avoid over-concentration). Default: `prefer_related`.

**Weight proposal:** Add `context_locality` as a new breakdown field with weight **0.10**, reducing `load` weight from 0.20 to 0.10.

**Input family:** Assignment History + Work Result Reports + Task State (already admissible).

**Authoritative posture:** Advisory. Context locality is a routing preference.

### 3.6 Idle-Time Gradation

**Signal:** `idle_recency`

**Definition:** Distinguish between long-idle and just-finished agents within the "idle" load bucket.

**Computation:**
- If agent is working → use existing load score.
- If agent is idle:
  - Idle < 1 hour → 0.8 (just finished, may need context switch)
  - Idle 1–4 hours → 1.0 (freshly available)
  - Idle 4–24 hours → 0.9 (still fresh)
  - Idle > 24 hours → 0.7 (may be stale)

**Weight proposal:** Absorb into `load` score. Replace binary idle/working with graded idle state.

**Input family:** Agent State (`last_done` field) (already admissible).

**Authoritative posture:** Advisory.

---

## 4. Revised Weight Table

| Dimension | Current Weight | Proposed Weight | Change |
|-----------|---------------|-----------------|--------|
| `affinity` (manual + history) | 0.30 | 0.15 | −0.15 |
| `chapter_affinity` | — | 0.15 | +0.15 |
| `capability_match` | 0.25 | 0.15 | −0.10 |
| `capability_tier` | — | 0.10 | +0.10 |
| `load` (including idle gradation) | 0.20 | 0.10 | −0.10 |
| `context_locality` | — | 0.10 | +0.10 |
| `closure_quality` | — | 0.10 | +0.10 |
| `history` (completed/abandoned counts) | 0.10 | 0.00 | −0.10 (absorbed) |
| `review_separation` (temporal decay) | 0.10 | 0.10 | 0.00 (logic change) |
| `budget` | 0.05 | 0.05 | 0.00 |
| **Total** | **1.00** | **1.00** | **—** |

---

## 5. Authoritative vs Advisory Signal Posture

All recommendation scoring signals remain **advisory** (SEMANTICS.md §2.12). The recommendation zone does not mutate any durable boundary.

| Signal | Posture | Rationale |
|--------|---------|-----------|
| `affinity` | Advisory | Soft preference for continuity; scheduler may ignore |
| `chapter_affinity` | Advisory | Preference for chapter continuity; not a requirement |
| `capability_match` | Advisory | Keyword overlap is heuristic, not proof of competence |
| `capability_tier` | Advisory | Tier classification is coarse and may misclassify |
| `load` | Advisory | Roster status may be stale; does not override lease |
| `context_locality` | Advisory | Batching preference; not a capacity constraint |
| `closure_quality` | Advisory | Historical trend; past performance ≠ future results |
| `review_separation` | Advisory | Temporal preference; policy may override |
| `budget` | Advisory | Budget may be stale or arbitrarily set |

**Hard rule:** No scoring signal may be treated as authoritative by the promotion crossing (Decision 555). The `recommendation-to-assignment` crossing re-validates all preconditions independently.

---

## 6. Freshness and Staleness Handling

Each new signal has explicit freshness bounds:

| Signal | Freshness Source | Staleness Threshold | Degradation |
|--------|-----------------|---------------------|-------------|
| `chapter_affinity` | Assignment history timestamp | 14 days | Score decays to 0 after 14 days |
| `capability_tier` | Task body + roster | Roster `updated_at` | If roster stale, skip tier scoring (fall back to flat capability match) |
| `closure_quality` | Report timestamps | 90 days | Only last 10 completions within 90 days count; older completions ignored |
| `review_separation` | Assignment `released_at` | 30 days | Score reaches 1.0 (full separation) after 30 days |
| `context_locality` | Active assignments + recent reports | 24 hours for reports | If no recent reports, file-similarity component is 0 |
| `idle_recency` | Roster `last_done` | Roster `updated_at` | If roster stale, default to 0.9 (neutral idle) |

**General rule:** A signal whose inputs are stale must degrade to a neutral value (typically 0.5 for [0,1] signals) rather than persisting an old strong signal.

---

## 7. Explicit Non-Goals

The following are **explicitly rejected** for the recommendation zone:

1. **No opaque ML scoring.** No neural networks, embeddings, or black-box models. Every signal must have a human-inspectable computation path.

2. **No hidden authority transfer.** The recommendation zone may not auto-promote recommendations into assignments. The crossing to assignment (Decision 555) remains a separate, governed step.

3. **No unbounded personalization.** Signals must be computable from the six canonical input families. No per-agent learned profiles, no hidden state, no external API calls.

4. **No overfitting to stale history.** Closure quality looks at last 10 completions within 90 days. Chapter affinity looks at 14 days. Older history is ignored.

5. **No task-duration estimation.** The engine does not estimate how long a task will take. Load scoring uses observed roster status, not projections.

6. **No inter-agent comparison beyond ranking.** The engine produces a ranked candidate list per task. It does not compute "agent A is globally better than agent B."

---

## 8. Success Criteria for Future Recommendation Runs

After implementing the signal enrichments above, a recommendation run should be judged successful if:

1. **Discrimination:** For a task with 3+ idle candidate agents, the top candidate's score is at least **0.15 higher** than the second candidate's score in at least 60% of cases.

2. **Rationale richness:** Every candidate with `score > 0.5` has at least **3 distinct non-zero breakdown dimensions** contributing to the score.

3. **Chapter affinity utilization:** When a runnable task belongs to a chapter with recent completions, at least one agent receives a non-zero `chapter_affinity` score.

4. **Closure quality influence:** Agents with recent repair loops receive measurably lower `closure_quality` scores than agents with clean closures.

5. **No regression in abstain rate:** The rate of "no suitable candidate" abstentions should not increase by more than 10% relative to baseline.

6. **Reproducibility:** The same input snapshot produces the same scores (within rounding) on repeated runs.

---

## 9. Invariants

1. **Six input families only.** Signal enrichment does not introduce new input families. All new signals are derived from Task State, Agent State, Principal Runtime, Assignment History, Work Result Reports, or CCC Posture.

2. **All signals are advisory.** No scoring dimension may be treated as authoritative by the promotion crossing or any downstream consumer.

3. **Freshness bounded.** Every signal has an explicit staleness threshold and degrades to neutral when stale.

4. **No opaque computation.** Every signal has a deterministic, inspectable formula.

5. **Weights sum to 1.0.** The composite score remains a weighted sum with bounded weights.

---

## 10. Verification Evidence

- `pnpm verify` — all 5 steps pass ✅
- `pnpm typecheck` — all 11 packages clean ✅
- Current `task-recommender.ts` scoring dimensions inspected and weakness catalogued ✅
- All proposed signals derivable from existing six input families ✅
- No code changes required for this contract task ✅

---

## Closure Statement

The assignment recommendation zone's discriminative weakness is documented concretely across six scoring dimensions. Five bounded signal additions/refinements are defined — chapter affinity, capability tier, closure quality, temporal review-separation decay, and active-context locality — all within the existing six-input-family boundary. All signals remain advisory with explicit freshness bounds. Non-goals reject opaque ML, hidden authority, unbounded personalization, and stale-history overfitting. Success criteria provide measurable targets for future implementation work.

---

**Closed by:** codex  
**Closed at:** 2026-04-24
