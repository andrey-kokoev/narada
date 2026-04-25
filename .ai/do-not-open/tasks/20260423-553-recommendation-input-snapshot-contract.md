---
status: closed
created: 2026-04-23
closed_at: 2026-04-24T15:42:00.000Z
closed_by: a2
governed_by: task_close:a2
depends_on: [552]
---

# Task 553 - Recommendation Input Snapshot Contract

## Goal

Define the canonical deterministic input snapshot for assignment recommendation and its admissibility checks.

## Why

If recommendation is a real zone, its inputs cannot be vague. They must be:

- explicit
- inspectable
- freshness-bounded
- deterministic enough to reproduce the same recommendation artifact from the same input snapshot

## Required Work

1. Enumerate the canonical input families, including at least:
   - task state
   - dependency state
   - roster / principal runtime state
   - continuation / history signals
   - capability / affinity / load / budget signals
   - applicable policy posture
2. Define which of those inputs are authoritative and which are advisory.
3. Define deterministic input admissibility checks:
   - presence
   - freshness
   - non-contradiction
   - policy availability
4. Define the input snapshot artifact shape and what must be durable vs derived.
5. State bounded abstain / reject conditions when admissibility fails.

## Acceptance Criteria

- [x] Canonical input families are enumerated
- [x] Authoritative vs advisory inputs are separated
- [x] Deterministic admissibility checks are defined
- [x] Snapshot artifact shape is defined
- [x] Abstain / reject conditions are defined
- [x] Verification or bounded blocker evidence is recorded

## Execution Notes

### Research

Examined the recommendation engine and its caller:
- `packages/layers/cli/src/lib/task-recommender.ts` — core engine, 5 direct input families
- `packages/layers/cli/src/commands/task-recommend.ts` — command wrapper, consumes 6th family (CCC Posture)
- `packages/layers/cli/src/lib/task-governance.ts` — assignment history, report loading helpers
- `SEMANTICS.md` §2.12 (advisory signals)

### Key Findings

**Six canonical input families:**
1. **Task State** — `.ai/do-not-open/tasks/*.md` (status, depends_on, continuation_affinity, title, body)
2. **Agent State** — `.ai/agents/roster.json` (agent_id, capabilities, status, task, last_done)
3. **Principal Runtime** — `.ai/principal-runtime.json` (state, budget_remaining, active_work_item_id)
4. **Assignment History** — `.ai/do-not-open/tasks/tasks/assignments/*.json` (claim/release history, last worker, completion counts)
5. **Work Result Reports** — `.ai/do-not-open/tasks/tasks/reports/*.json` (changed_files, work_type, status, quality)
6. **CCC Posture** — `.ai/construction-loop/posture.json` (6 coordinate readings)

**Authoritative:** Task State, Agent State, Assignment History
**Advisory:** Principal Runtime, Work Result Reports, CCC Posture

**Boundary note:** CCC Posture is consumed by `taskRecommendCommand` (the wrapper), not by `generateRecommendations()` directly. Posture applies multiplicative score adjustments after the core engine returns.

**Admissibility checks:**
- 4 presence checks (task dir, roster, tasks, agents)
- 4 freshness checks (roster stale timeout, assignment 30-day window, PrincipalRuntime 5-minute freshness, posture expiry)
- 2 non-contradiction checks (opened+active assignment, idle+active work item)

### Boundary Artifact

Written `.ai/decisions/20260424-553-recommendation-input-snapshot-contract.md` (~13 KB) containing:
- Six input families with source paths and fields
- Authoritative vs advisory classification table
- 10 deterministic admissibility checks with thresholds and failure modes
- Snapshot artifact TypeScript shape (decorative, non-authoritative)
- 7 bounded abstain/reject conditions with severity levels
- 5 invariants including "six input families only" and "abstain over fabricate"

## Verification

- Decision artifact exists and is ~13 KB ✅
- Six input families enumerated with source paths ✅
- Authoritative (3) vs advisory (3) separation documented ✅
- 10 admissibility checks defined with deterministic thresholds ✅
- Snapshot artifact shape defined with TypeScript interface ✅
- 7 abstain/reject conditions with severity levels ✅
- `pnpm verify` — 5/5 steps pass ✅
- `pnpm typecheck` — all 11 packages clean ✅
