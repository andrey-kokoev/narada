# Taxonomy Chapter Closure

> Task 506 deliverable: honest closure of the zone-template and crossing-regime-kind taxonomy chapter.

**Date**: 2026-04-23
**Chapter**: 503–506 Zone Template and Regime-Kind Taxonomy
**Tasks**: 503 (closed), 504 (closed), 505 (closed), 506 (closing)

---

## What the Taxonomies Now Explain

### 1. Zone Template Taxonomy (Task 503)

Eight reusable templates compress Narada's 12 zones into a vocabulary of authority-homogeneous patterns:

| Template | Instances | What it explains |
|----------|-----------|------------------|
| `ingress` | Source, Operator | Why these two zones share "external → internal" authority grammar despite doing different things |
| `canonicalization` | Fact | Why every vertical needs a first durable boundary |
| `compilation` | Context, Evaluation | Why these computation zones are not governance zones |
| `governance` | Work, Decision, Task | Why these three decide what proceeds |
| `effect_boundary` | Intent | Why intent is structurally distinct from both governance and performance |
| `performance` | Execution | Why execution zones mutate external state |
| `verification` | Confirmation | Why confirmation requires inbound observation, not just API success |
| `observation` | Observation | Why read-only views are non-authoritative and rebuildable |

**Explanatory value**: The template vocabulary makes it possible to ask "what kind of zone is this?" and get an answer in terms of authority grammar rather than implementation module. It supports review, construction, and doctrine reasoning.

### 2. Crossing Regime Kind Taxonomy (Task 504)

Six reusable kinds compress the 11-entry crossing inventory by edge law:

| Kind | Crossings | What it explains |
|------|-----------|------------------|
| `self_certifying` | Fact admission, Fact → Context | Why deterministic transformation needs no external confirmation |
| `policy_governed` | Eval → Decision, Context → Work, Work → Evaluation | Why governance rules, not identity, determine admission |
| `intent_handoff` | Intent admission | Why the effect boundary is structurally distinct from policy gates |
| `challenge_confirmed` | Operator action, Task attachment | Why identity verification is required before admission |
| `review_gated` | Task completion | Why external quality validation is required |
| `observation_reconciled` | Execution → Confirmation, Intent → Execution | Why effect truth requires post-hoc observation |

**Explanatory value**: The kind vocabulary makes it possible to reason about crossings by edge law rather than zone pair. Two crossings with different zone pairs may share a kind.

---

## What Remains Descriptive Only

### 1. Not Runtime-Generative

The taxonomies are **doctrine, not runtime machinery**:

- No runtime code consults `ZoneTemplate` or `CrossingRegimeKind`.
- No zone is instantiated from a template.
- No crossing regime is validated against its kind.

The types exist in `packages/layers/control-plane/src/types/` as read-only declaration data. They are consumed by lint, inspection, and construction surfaces, not by the sync loop, scheduler, or outbound workers.

### 2. Not Provenance-Safe-by-Construction

The taxonomies describe where provenance should exist but do not enforce it:

- `canonicalization` says Fact should be content-addressed; the actual `event_id` hash is enforced elsewhere.
- `governance` says Work should use claim/resolve; the actual lease mechanism is enforced elsewhere.
- `challenge_confirmed` says identity verification should happen; the actual challenge-response is enforced elsewhere.

The taxonomy is a **map**, not a **gate**.

### 3. Weak Fits Remain Weak

The taxonomy does not force every zone into a crisp template:

- `compilation` has a moderate fit because Context (organization) and Evaluation (intelligence) differ in nature.
- `Task` within `governance` includes human review, which has different authority grammar than automated foreman governance.
- `Intent → Execution` is deferred because its independent canonical status is unproven.

These are recorded honestly in the inventory, not smoothed over.

---

## Why Runtime Derivation Is Deferred

### Generic Runtime Derivation

A runtime that derives behavior from zone-template or regime-kind declarations would require:

1. **A generative grammar**: rules that map `governance` → lease acquisition, or `challenge_confirmed` → challenge-response protocol. No such grammar exists.
2. **A validation loop**: runtime checks that every `governance` zone actually uses claim/resolve. This would duplicate existing invariant checks.
3. **A refactoring cost**: zones like Work and Task share `governance` but have different mechanics. Extracting a generic `governance` runtime would force premature abstraction.

Until a concrete vertical demonstrates that runtime derivation reduces code duplication or increases safety, the taxonomies remain descriptive.

### Provenance-Safe-by-Construction

Provenance for every artifact path would require:

1. **Path tracing**: every `fact_id` would need to carry its full zone-crossing history. This is expensive and not yet required by any inspection surface.
2. **Template-to-path binding**: a proof that every path from `ingress` → `canonicalization` → `compilation` → `governance` → `effect_boundary` → `performance` → `verification` preserves provenance. This is a research question, not an implementation task.
3. **Authority-chain verification**: runtime confirmation that every handoff used the correct authority class. This would require significant scheduler and foreman instrumentation.

These are valid long-term goals but are deferred until a consumer requires them.

---

## Closure Action

- Chapter file updated with closure criteria satisfied.
- Closure artifact written to `.ai/decisions/20260423-506-taxonomy-chapter-closure.md`.
- All chapter tasks (503–506) are now terminal.
