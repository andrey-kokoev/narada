---
status: closed
created: 2026-04-23
closed: 2026-04-23
owner: codex
depends_on:
  - 491
---

# Task 492 - Grammar / Template / Instantiation Ladder

## Context

Recent discussion exposed a missing distinction:

- Narada proper appears to define a grammar
- `narada.usc` appears to be a template
- `narada.sonar` appears to be an instantiation

But the ladder is not stated clearly in canonical docs, which causes confusion between:

- grammar
- template
- Site
- runtime locus
- concrete product repo

## Goal

Define the canonical ladder:

```text
grammar -> template -> instantiation
```

and place Narada proper, `narada.usc`, and `narada.sonar` correctly on that ladder.

## Read First

- `SEMANTICS.md`
- `docs/concepts/runtime-usc-boundary.md`
- `.ai/tasks/20260423-491-crossing-regime-semantic-crystallization.md`

## Required Work

1. Define the three levels precisely.
   - grammar
   - template
   - instantiation

2. Place current things on the ladder.
   - Narada proper
   - `narada.usc`
   - Site
   - `narada.sonar`

3. Clarify what a Site is relative to template and instantiation.

4. Produce a durable table/diagram with the canonical placement.

## Non-Goals

- Do not rename packages or repos in this task.
- Do not implement generators or materializers here.

## Acceptance Criteria

- [x] Grammar / template / instantiation are defined clearly.
- [x] Narada proper, `narada.usc`, Site, and `narada.sonar` are placed unambiguously.
- [x] A durable decision/spec artifact is created.
- [x] Verification evidence is recorded in this task.

## Execution Notes

- Read prerequisite Task 491 (Crossing Regime Semantic Crystallization) to establish `Aim / Site / Cycle / Act / Trace` vocabulary.
- Read `SEMANTICS.md` §2.14 to confirm crystallized terms and the invariant spine.
- Read `docs/concepts/runtime-usc-boundary.md` to confirm the Four Ownership Classes and static/runtime boundary.
- Consulted Decision 464 (Narada Self-Build Operation Design) to confirm `narada.usc` is static grammar consumed by Cycles, not a runtime term.
- Produced decision artifact `.ai/decisions/20260423-492-grammar-template-instantiation-ladder.md` with:
  - §2.1 Grammar definition
  - §2.2 Template definition
  - §2.3 Instantiation definition
  - §3 Placement Table
  - §4 Site as orthogonal runtime locus
  - §5 Forbidden smears
  - §6 Document-to-ladder mapping
- No code, CLI flags, DB columns, or package APIs were modified.
- No derivative status files created.

## Verification

- Decision artifact exists and is readable at `.ai/decisions/20260423-492-grammar-template-instantiation-ladder.md`.
- All three levels (Grammar, Template, Instantiation) are defined with properties and canonical examples.
- Placement Table unambiguously places Narada proper, `narada.usc`, Site, and `narada.sonar`.
- Site is explicitly distinguished as orthogonal runtime locus, not a fourth ladder rung.
- Forbidden smears table prevents future semantic collapse.
- Document mapping ties existing canonical docs to their ladder level.
