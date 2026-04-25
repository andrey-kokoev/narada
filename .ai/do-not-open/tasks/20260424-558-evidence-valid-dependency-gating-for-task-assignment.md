---
status: closed
created: 2026-04-24
closed_at: 2026-04-24T22:48:00.000Z
closed_by: a2
governed_by: task_close:a2
depends_on: [501, 507, 546]
---

# Task 558 - Evidence-Valid Dependency Gating For Task Assignment

## Goal

Make task assignment and promotion treat a dependency as satisfied only when it is complete by evidence, not merely terminal by raw task-file status.

## Why

Narada currently allows this incoherent state:

- dependency task is `status: closed`
- but `task evidence` still returns `needs_closure`
- and dependent work can still be assigned

That means raw terminal markdown state can still unlock downstream work even when governed completion is missing. This violates the task-governance intent behind evidence, closure hardening, and task-state authority migration.

## Required Work

1. Inspect the current dependency validation path for:
   - `task roster assign`
   - `task claim`
   - `task promote-recommendation`
   - any shared dependency-satisfaction helper
2. Define the canonical dependency-satisfaction rule:
   - a dependency is satisfied only when it is complete by evidence
   - bounded exceptions, if any, must be explicit
3. Implement the rule in the shared validation path so all assignment/promotion surfaces agree.
4. Ensure error messages explain the real blocker:
   - dependency closed by status but not complete by evidence
   - precise missing evidence when possible
5. Add focused tests covering at least:
   - dependency `closed` + `needs_closure` must block assignment
   - dependency `complete` must allow assignment
   - recommendation promotion uses the same rule
6. Record verification or bounded blockers.

## Non-Goals

- Do not redesign the full task lifecycle store in this task.
- Do not weaken task evidence standards to fit current behavior.
- Do not add broad override paths for normal assignment flow.

## Acceptance Criteria

- [x] Assignment treats dependencies as satisfied only when complete by evidence
- [x] Recommendation promotion uses the same dependency rule
- [x] Closed-but-invalid dependencies block downstream work
- [x] Error output explains the evidence-validity blocker
- [x] Focused tests exist and pass
- [x] Verification or bounded blocker evidence is recorded

## Execution Notes

### Research

Examined the dependency validation path:
- `packages/layers/cli/src/lib/task-governance.ts:checkDependencies` — shared helper, previously only checked terminal status
- `packages/layers/cli/src/commands/task-claim.ts` — calls `checkDependencies`
- `packages/layers/cli/src/commands/task-roster.ts` — calls `checkDependencies`
- `packages/layers/cli/src/commands/task-promote-recommendation.ts` — calls `checkDependencies`
- `packages/layers/cli/src/lib/task-recommender.ts` — had inline dependency check, replaced with `checkDependencies`

### Key Changes

**1. Shared helper `checkDependencies` upgraded**
- Old rule: dependency satisfied if `status === 'closed' || status === 'confirmed'`
- New rule: dependency satisfied only if terminal status AND `inspectTaskEvidence(cwd, depNum).verdict === 'complete'`
- Return type enriched with `details: DependencyCheckDetail[]` containing per-dependency failure reasons

**2. Error messages explain the real blocker**
- Before: `Task X has unmet dependencies: dep-id`
- After: `Task X has unmet dependencies: dep-id. dep-id: Dependency is closed but not complete by evidence: <first warning>`

**3. All surfaces now use the same rule**
- `task claim` — updated
- `task roster assign` — updated
- `task promote-recommendation` — updated
- `task recommend` (recommender engine) — updated to use `checkDependencies` instead of inline status-only check

**4. No bounded exceptions added**
- The rule is universal: all assignment and promotion surfaces must check evidence completeness
- No override flag added — operators should fix the dependency evidence or use `task reopen` if the closure was premature

### Test Coverage

Added 3 new tests:
1. `task-claim.test.ts`: "fails when dependency is closed but not complete by evidence"
   - Dependency: `status: closed`, `closed_by: operator`, but missing execution notes and verification
   - Expected: claim blocked with error containing "not complete by evidence"
2. `task-claim.test.ts`: "succeeds when dependencies are closed and complete by evidence" (updated existing)
   - Dependency: `status: closed` with full evidence (execution notes, verification, checked criteria)
   - Expected: claim succeeds
3. `task-promote-recommendation.test.ts`: "fails when dependency is closed but not complete by evidence"
   - Dependency: `status: closed` but missing execution notes and verification
   - Expected: promotion rejected, validation result contains "not complete by evidence"

Updated 4 existing tests to use evidence-complete dependency fixtures:
- `task-claim.test.ts`: "succeeds when dependencies are closed"
- `task-claim.test.ts`: "treats an executable dependency as satisfied even when a chapter range file shares its number"
- `task-claim.test.ts`: "preserves depends_on YAML list syntax when claiming"
- `task-roster.test.ts`: "preserves depends_on through claim"
- `task-promote-recommendation.test.ts`: "promotes task with satisfied dependencies" (fixture updated)

### Verification

- `pnpm typecheck`: all 11 packages clean ✅
- CLI tests: 129/129 passing (task-claim, task-roster, task-promote-recommendation, task-recommend, task-governance) ✅
- Construction loop tests: 21/21 passing ✅
- Workbench server tests: 34/34 passing ✅

---

**Closed by:** a2  
**Closed at:** 2026-04-24
