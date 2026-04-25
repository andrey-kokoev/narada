---
status: closed
created: 2026-04-23
owner: a2
depends_on: [490]
closed_at: 2026-04-23T16:15:00.000Z
closed_by: a2
---

# Task 491 - Crossing Regime Semantic Crystallization

## Context

Narada repeatedly relies on the same deep invariant:

```text
no meaningful boundary crossing without an explicit admissibility regime
```

Examples already present in Narada:

- remote delta -> Fact
- evaluation -> decision / intent
- intent -> execution attempt
- execution attempt -> confirmation
- operator desire -> operator action request
- task work -> report / review / closure
- task attachment -> continuation / takeover / finish

The system has many concrete boundary objects, but the shared concept is not yet first-class in the semantics.

## Goal

Crystallize the cross-cutting concept of:

- zone
- boundary
- crossing regime
- crossing artifact

and test whether it is a valid Narada-level semantic object rather than a metaphor.

## Read First

- `SEMANTICS.md`
- `docs/concepts/runtime-usc-boundary.md`
- `.ai/do-not-open/tasks/20260423-490-task-attachment-carriage-boundary.md`
- `.ai/do-not-open/tasks/20260419-202-document-re-derivation-and-recovery-operator-family.md`
- `.ai/do-not-open/tasks/20260415-047-route-live-control-plane-through-fact-boundary.md`

## Required Work

1. Define the candidate concept.
   - State whether Narada can be factored as governed topology of zones and boundary crossings.

2. Pressure-test it against canonical cases.
   - Fact admission
   - intent admission
   - operator action request
   - task completion
   - task attachment / carriage

3. Identify irreducible fields.
   - source zone
   - destination zone
   - authority owner
   - admissibility regime
   - crossing artifact
   - confirmation/reconciliation rule

4. Decide whether this belongs in canonical semantics, a decision artifact, or both.

## Non-Goals

- Do not build code abstractions such as a generic `CrossingRegime` class.
- Do not force every subsystem into a fake linear pipeline.

## Acceptance Criteria

- [x] The concept is either accepted or rejected explicitly.
- [x] At least five Narada cases are mapped against it.
- [x] Irreducible fields are documented.
- [x] A durable decision/spec artifact is created.
- [x] Verification evidence is recorded in this task.

## Execution Notes

**Verdict: ACCEPTED.** The crossing-regime concept is a valid Narada-level semantic object.

### Changes Made

1. **Decision artifact** — Created `.ai/decisions/20260423-491-crossing-regime-semantic-crystallization.md`
   - Explicit accept/reject verdict (accepted)
   - Definitions: zone, boundary, crossing regime, crossing artifact
   - Isomorphism table mapping existing structures to crossing-regime reading
   - Seven canonical cases mapped (fact admission, intent admission, operator action request, task completion, task attachment/carriage, evaluation→decision, execution→confirmation)
   - Six irreducible fields documented
   - Five crossing-regime invariants
   - Relationship to operator families
   - Explicit non-goals (no code changes)

2. **SEMANTICS.md §2.15** — Added "Crossing Regime" section
   - Definitions of zone, boundary, crossing regime, crossing artifact
   - Isomorphism with existing structures
   - Irreducible fields table
   - Canonical cases table (7 cases)
   - Crossing-regime invariants (5 invariants)
   - Relationship to operator families
   - Non-goals
   - Updated §5 (Relationship to Other Documents) and §6 (How to Extend)

3. **AGENTS.md** — Updated navigation hub
   - Added `SEMANTICS.md §2.15` to documentation index
   - Added four new concepts to concept table: `crossing regime`, `zone`, `boundary`, `crossing artifact`
   - Added invariant section "Crossing Regime (Task 491)" with invariants 41–45

### Decision: Canonical Semantics + Decision Artifact

The concept belongs in **both**:
- **Decision artifact** records the deliberation, pressure-testing, and verdict
- **Canonical semantics** (SEMANTICS.md §2.15) makes it a durable reference for all future design work

## Verification

- `pnpm verify`: all 5 steps passed (task file guard, typecheck, build, charters tests, ops-kit tests)
- No TypeScript or runtime code modified — semantic/documentation changes only
- Decision artifact reviewed for consistency with existing SEMANTICS.md §2.8, §2.13, §2.14
- All 7 canonical cases are drawn from already-documented Narada boundaries (no invented examples)
- Irreducible fields are derived from inspection of existing crossing structures, not imposed top-down

