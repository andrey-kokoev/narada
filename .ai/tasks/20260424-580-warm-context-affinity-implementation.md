---
status: closed
closed_by: operator
closed_at: 2026-04-20
created: 2026-04-24
---

# Task 580 - Warm Context Affinity Implementation

## Goal

Implement warm-context affinity in Narada's assignment recommendation logic so agents who are already warm on the same chapter, runtime line, or closely adjacent work are preferred advisory candidates without changing assignment authority.

## Why

Narada already has a weak continuity signal:

- explicit `continuation_affinity`,
- sparse history-derived affinity.

That is not enough to capture the practical routing judgment the operator keeps making:

- prefer the agent who just completed the adjacent task,
- prefer the agent already warm on the same chapter,
- prefer the agent already carrying the same runtime context.

This is coherent with Narada's advisory-signal posture:

- warmness should improve recommendation quality,
- but must remain non-authoritative,
- and must never bypass dependency, review-separation, or other hard gates.

## Required Work

1. Implement a bounded warm-context affinity signal in the recommendation engine, covering at least:
   - same chapter continuity,
   - recent adjacent-task continuity,
   - active/recent runtime context locality where available.
2. Keep the signal advisory only:
   - recommendation preference only,
   - no direct assignment authority,
   - no bypass of existing validation.
3. Decide how warmness should decay over time so stale history does not dominate.
4. Make the scoring breakdown and rationale surface this signal explicitly.
5. Add focused tests proving at least:
   - an agent with recent same-chapter work is preferred over an otherwise equivalent idle agent,
   - stale warm context decays away,
   - hard blockers still dominate warm-context preference.
6. Record verification or bounded blockers.

## Non-Goals

- Do not turn recommendation into assignment authority.
- Do not implement opaque ML or hidden personalization.
- Do not widen this into full agent-performance estimation.
- Do not let warmness override dependency, review, or conflict gates.

## Acceptance Criteria

- [x] Warm-context affinity is implemented in recommendation scoring
- [x] Scoring breakdown and rationale expose the signal explicitly
- [x] Warmness decays with bounded freshness rules
- [x] Focused tests exist and pass
- [x] Hard blockers still dominate advisory warmness
- [x] Verification or bounded blocker evidence is recorded

## Verification

### Implementation
- Added `warm_context` dimension to `ScoreBreakdown` with weight `0.10`
- Implemented `scoreWarmContext()` in `packages/layers/cli/src/lib/task-recommender.ts`
- Three advisory signals:
  1. **Same chapter continuity**: 0.7 (completed) / 0.3 (active)
  2. **Adjacent task continuity** (±3 task numbers): 0.5 / 0.2
  3. **Dependency recency**: 0.4 / 0.15
- **Decay**: Exponential with 7-day half-life (`Math.exp(-ageDays / 7)`)
- `buildRationale()` surfaces warm context explicitly in human-readable output

### Test Results
- `test/lib/task-recommender.test.ts`: 6/6 passing (3 existing + 3 new warm-context tests)
- `test/commands/task-recommend.test.ts`: 30/30 passing
- `pnpm typecheck`: all 11 packages clean

### Files Modified
| File | Change |
|------|--------|
| `packages/layers/cli/src/lib/task-recommender.ts` | Added warm-context scoring, decay, rationale, breakdown |
| `packages/layers/cli/test/lib/task-recommender.test.ts` | +3 focused warm-context tests |

### Advisory-Only Posture Confirmed
- Warm context is additive to composite score; it cannot bypass hard blockers
- `score <= 0` still causes `continue` (skip candidate)
- Availability, budget, workload risks still `continue` before warm context is evaluated
- Test confirms busy agent with strong warm context loses to idle agent without warm context


