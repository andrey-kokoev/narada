# Task 202: Document Re-Derivation And Recovery Operator Family

## Why

Narada now clearly wants a family of explicit operators that recompute downstream state from durable boundaries.

The first concrete member is Task 201:

- derive work from stored facts

But the underlying pattern is broader:

- recompute from durable truth rather than mutate truth manually
- recover control surfaces from canonical boundaries after loss or drift
- preview or replay decisions without fabricating source events

Without a documented family, these capabilities will emerge piecemeal and drift in naming, authority, and semantics.

## Goal

Document a coherent family of Narada operators for bounded recomputation, replay, and recovery between durable boundaries.

## Required Outcome

Add a canonical section to Narada docs that defines:

- what a re-derivation operator is
- what a recovery operator is
- which durable boundaries may be used as inputs
- which downstream boundaries may be recomputed
- which operators are preview-only versus state-advancing
- which authority class each operator belongs to

## Minimum Family To Document

- live fact admission
- replay derivation from stored facts
- preview derivation from stored facts
- control-plane recovery from facts
- projection rebuild from durable stores
- confirmation/reconciliation replay from durable execution state

## Required Semantic Distinctions

Narada must explicitly distinguish at least:

- live admission
- replay derivation
- preview derivation
- recovery derivation
- projection rebuild
- confirmation replay

These must not be treated as one vague “replay” bucket.

## Suggested Structure

Prefer a small algebra such as:

```text
Boundary A -> Boundary B
mode: live | replay | preview | recovery
effect: read-only | control-plane-mutating | external-confirmation-only
```

Example families:

- `Fact -> Work` replay derivation
- `Fact -> Work` preview derivation
- `Fact -> Context/Work` recovery derivation
- `Durable state -> Observation` rebuild
- `Execution/Outbound -> Confirmation` replay

## Documentation Targets

- `SEMANTICS.md`
- `packages/layers/control-plane/docs/00-kernel.md`
- `packages/layers/control-plane/docs/02-architecture.md`
- `AGENTS.md` invariants if new authority rules are needed

## Non-Goals

- Do not implement all operators in this task
- Do not rename existing working surfaces unless necessary for coherence

## Definition Of Done

- [x] Narada documents a named family of re-derivation/recovery operators.
- [x] The family is expressed in terms of durable boundary-to-boundary recomputation.
- [x] Preview vs replay vs recovery are explicitly distinguished.
- [x] Authority implications are documented.
- [x] Task 201 is positioned as one member of the family, not a one-off feature.
- [x] No `*-EXECUTED`, `*-DONE`, or `*-RESULT` files are created.

---

## Execution Notes

### Changes Made

1. **`SEMANTICS.md`** — Added §2.8 "Re-Derivation and Recovery Operator Family"
   - Operator algebra: `Boundary A → Boundary B`, `mode`, `effect`, `authority`
   - Six family members documented in a canonical table (live, replay, preview, recovery, rebuild, confirm)
   - Semantic distinction rules (six explicit distinctions, never a vague "replay" bucket)
   - Safety properties (boundedness, authority preservation, no fabrication, conservative recovery, projection non-authority)
   - Authority class mapping per member
   - Evolution note: algebra may be refined as Task 201+ implementation proceeds
   - Updated "Relationship to Other Documents" and "How to Extend" sections

2. **`packages/layers/control-plane/docs/00-kernel.md`** — Added §8 "Re-Derivation and Recovery Operators"
   - Formalized operator algebra in kernel terms
   - Durable boundary pairs with canonical paths
   - Four kernel invariants for re-derivation (same path, no fabrication, bounded trigger, authority preserved)
   - Renumbered "Known Gaps" from §8 → §9 and "See Also" from §9 → §10

3. **`packages/layers/control-plane/docs/02-architecture.md`** — Added "Re-Derivation and Recovery Operators" section before "See Also"
   - Five key architectural commitments (same-path replay, preview stops before mutation, rebuild non-authoritative, confirm does not re-execute, no automatic replay on startup)

4. **`AGENTS.md`** — Updated navigation hub
   - Added §2.8 to documentation index
   - Added six new concepts to concept table (`re-derivation operator`, `replay derivation`, `preview derivation`, `recovery derivation`, `projection rebuild`, `confirmation replay`)
   - Extended invariant #6 with replay path requirement
   - Added invariant #6a: "Re-derivation is explicit and bounded"

### Semantic Design Decisions

- Added `rebuild` and `confirm` as distinct modes alongside the suggested `live | replay | preview | recovery`, because projection rebuild and confirmation replay are semantically different from the other four.
- `effect` dimension uses `external-confirmation-only` for confirmation replay to capture that it updates confirmation bindings but does not mutate control-plane work state or external world state directly.
- Authority for recovery includes `admin` because reconstructing control-plane state after loss is structural, not merely derivational.
- Task 201 is explicitly named as "the first concrete implementation" in the evolution note, positioning it as one member of the family.

### Refinement Absorbed From Task 201 Implementation

Task 201's implementation revealed a cleaner semantic split than initially documented:

1. **Live Fact Admission is a compound operation**: It consists of (a) fact lifecycle transition (`unadmitted` → `admitted`) plus (b) work opening via `ContextFormationStrategy` → `onContextsAdmitted()`. The daemon orchestrates both: `getUnadmittedFacts` → `onFactsAdmitted` → `markAdmitted`.

2. **Replay Derivation is pure work opening**: It reads stored facts via `getFactsByScope` (regardless of admission status) and routes through the same `onContextsAdmitted()` path, but **never marks facts as admitted**. The semantic boundary is at the fact selection and lifecycle layer, not at the foreman layer.

3. **Both use the same core algorithm**: `onFactsAdmitted()` and `deriveWorkFromStoredFacts()` are thin wrappers around the same private `onContextsAdmitted()` method. The documentation now explicitly states this rather than implying divergent paths.

This refinement is reflected in:
- `SEMANTICS.md` §2.8.2: Live admission boundary changed from `Fact → Work` to `Fact (unadmitted) → Fact (admitted) + Work`; replay boundary changed to `Fact (stored) → Work`
- `SEMANTICS.md` §2.8.3: Added "Admission vs Work Opening" distinction rule
- `SEMANTICS.md` §2.8.4: Added "No Admission Side Effect in Replay" safety property
- `00-kernel.md` §8.2: Updated durable boundary pairs to reflect fact-lifecycle vs pure-work-opening paths
- `00-kernel.md` §8.3: Added "No Admission Side Effect in Replay" kernel invariant
- `02-architecture.md`: Added "Live admission is compound" architectural commitment
- `AGENTS.md`: Added invariant 6b: "No admission side effect in replay"

### Verification

- Documentation-only change; no TypeScript or runtime code modified.
- `pnpm verify` fails at typecheck step due to a **pre-existing** issue in `packages/layers/cli/src/commands/derive-work.ts` (Task 201) which imports `@narada2/charters` without declaring it as a CLI dependency. This failure is unrelated to Task 202.
- Markdown files reviewed for broken links and consistent terminology.

### Commit

Documentation changes committed as a single commit with the task file update.
