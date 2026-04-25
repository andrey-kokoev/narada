---
status: closed
closed_at: 2026-04-23T18:05:00Z
closed_by: codex
governed_by: task_close:codex
created: 2026-04-23
depends_on: [491, 495, 496, 497, 498, 499]
---

# Task 502 - Lift BSFG Speaking Discipline Into Narada Doctrine

## Context

Narada has now crystallized a topology reading:

- zones as authority-homogeneous regions,
- governed crossings as edges,
- regime / artifact / confirmation as edge properties.

In parallel, BSFG demonstrates a strong **way of speaking** about architecture:

- role vs implementation separation,
- principle / logical system / substrate layering,
- canonical naming grammar,
- explicit semantic units,
- named operational modes,
- and short load-bearing invariants.

Narada should adopt the useful parts of that speaking discipline where it strengthens clarity, without importing BSFG's IT/OT-specific object model or message-boundary specialization.

## Goal

Incorporate the useful BSFG speaking discipline into Narada's canonical docs and vocabulary guidance.

The target is not to make Narada "more like BSFG." The target is to make Narada speak with greater structural precision.

## Read First

- `AGENTS.md`
- `SEMANTICS.md`
- `docs/concepts/system.md`
- `docs/concepts/runtime-usc-boundary.md`
- `.ai/do-not-open/tasks/20260423-491-crossing-regime-semantic-crystallization.md`
- `.ai/do-not-open/tasks/20260423-495-crossing-regime-declaration-contract.md`
- `.ai/do-not-open/tasks/20260423-499-crossing-regime-construction-surface-integration.md`
- `https://bsfg.dev/concepts/boundary-roles.html`
- `https://bsfg.dev/concepts/naming-conventions.html`
- `https://bsfg.dev/concepts/message-model.html`
- `https://bsfg.dev/concepts/replay-model.html`

## Scope

This task owns **doctrine and speaking discipline only**:

- canonical wording,
- documentation structure,
- naming guidance,
- invariant style,
- and ontology-layer speaking habits.

It does not own Narada runtime behavior, message schemas, transport topology, or deployment redesign.

## Required Work

1. Extract the useful BSFG speaking moves that Narada should adopt.
   Candidates already pressure-tested:
   - role vs implementation discipline
   - principle / logical system / substrate layering
   - canonical naming grammar
   - explicit irreducible semantic unit statements
   - named operational modes
   - short invariant bullets

2. Decide where each move belongs in Narada.
   Example placement candidates:
   - `AGENTS.md` guidance
   - `SEMANTICS.md`
   - `docs/concepts/system.md`
   - governance / naming docs
   - architecture docs

3. Apply only the borrowings that strengthen Narada without semantic smear.
   Explicitly reject or defer:
   - BSFG-specific four-buffer vocabulary
   - IT/OT zone language
   - message/envelope/fact as Narada's universal primary frame
   - connectivity-first wording where Narada is authority-first

4. Where useful, add short "what this is / what this is not" distinctions so Narada's role-vs-implementation and principle-vs-substrate language becomes harder to misuse.

5. Record a short residual note if some BSFG-style improvement is recognized but not yet worth importing.

## Non-Goals

- Do not rename Narada into BSFG-shaped concepts.
- Do not import BSFG role acronyms or topology objects.
- Do not create a new big concept doc if the improvements belong in existing canonical docs.
- Do not widen into runtime implementation or deployment work.

## Acceptance Criteria

- [x] At least the useful speaking-discipline borrowings are enumerated explicitly.
- [x] Canonical Narada docs are updated where those borrowings truly belong.
- [x] The task records what was intentionally not imported from BSFG.
- [x] The result sharpens Narada's language without changing Narada's core ontology.
- [x] Focused verification or blocker evidence is recorded in this task.

## Execution Notes

### 1. Borrowings Adopted

| BSFG Speaking Move | Narada Placement | Status |
|--------------------|------------------|--------|
| Role vs implementation separation | `AGENTS.md` §Speaking Doctrine + `docs/concepts/system.md` §What Narada Is / What Narada Is Not | Adopted |
| Principle / logical system / substrate layering | `SEMANTICS.md` §2.0 "Three-Layer Ontology" | Adopted |
| Canonical naming grammar | `AGENTS.md` §Speaking Doctrine "Canonical Naming Grammar" | Adopted |
| Explicit irreducible semantic units | `AGENTS.md` §Speaking Doctrine "Irreducible Semantic Units" | Adopted |
| Named operational modes | `SEMANTICS.md` §2.16 "Named Operational Modes" | Adopted |
| Short invariant bullets | `AGENTS.md` §Speaking Doctrine "Short Invariant Bullets" | Adopted |

### 2. What Was Rejected

| BSFG Concept | Rejected Because | Narada Equivalent |
|--------------|------------------|-------------------|
| Four-buffer model (ISB/IFB/ESB/EFB) | Authority-first, not connectivity-first | Crossing regime + zone topology |
| IT/OT zone language | Manufacturing-specific; vertical-neutral kernel required | Generic zone + vertical taxonomy |
| Message/envelope as universal primary frame | Narada's fact is one artifact among many | Crossing artifact (varies by boundary) |
| Connectivity-first topology | Defined by authority change, not network | Authority-homogeneous zones |
| `putIfAbsent` forward buffer deduplication | Substrate-specific detail | Idempotency at `event_id` → `apply_log` |

### 3. Changed Files

- `SEMANTICS.md` — added §2.0 "Three-Layer Ontology" (principle / logical system / substrate); added §2.16 "Named Operational Modes" (Live, Replay Derivation, Preview Derivation, Recovery, Inspection)
- `AGENTS.md` — added §Speaking Doctrine (Task 502) with role-vs-implementation, three-layer ontology, named operational modes, canonical naming grammar, irreducible semantic units, short invariant bullets, and explicit rejection table
- `docs/concepts/system.md` — added §"What Narada Is / What Narada Is Not" with zone-vs-substrate and role-vs-implementation distinction tables

### 4. Verification

```bash
pnpm verify
# All 5 verification steps passed (task-file-guard, typecheck, build, charters tests, ops-kit tests)
```

Doc consistency check:
```bash
grep -n "Three-Layer Ontology" SEMANTICS.md
# → line 103: #### Three-Layer Ontology

grep -n "Named Operational Modes" SEMANTICS.md
# → line 1353: ## 2.16 Named Operational Modes

grep -n "Speaking Doctrine" AGENTS.md
# → line 442: ### Speaking Doctrine (Task 502)

grep -n "What Narada Is" docs/concepts/system.md
# → line 13: ## What Narada Is / What Narada Is Not
```

No TypeScript or runtime code modified. The changes are doctrine and documentation only.

## Verification

```bash
pnpm verify
# All 5 verification steps passed

# Consistency spot-checks
grep -n "Three-Layer Ontology" SEMANTICS.md
grep -n "Named Operational Modes" SEMANTICS.md
grep -n "Speaking Doctrine" AGENTS.md
grep -n "What Narada Is" docs/concepts/system.md
```

All checks pass. No runtime behavior changed.

## Focused Verification

- Prefer read-only doc verification:
  - targeted grep for inserted canonical phrases,
  - consistency pass across updated docs,
  - and any narrow lint/typecheck only if a command surface is touched.


