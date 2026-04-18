# Narada — Dharma Steward Handoff

> For the canonical system ontology — including identity lattice, core abstractions, and prohibited terms — see [`SEMANTICS.md`](../../../../SEMANTICS.md). This document contextualizes the ontology for human stewards.

---

## A. Ontology (What the System Is)

Narada is a **domain-neutral deterministic control kernel**.

It compiles:

```
Source → Fact → Context → Work → Policy → Intent → Execution → Confirmation → Observation
```

Core properties:

- **Fact** = first durable, replay-stable boundary  
- **Intent** = universal durable effect boundary  
- **Policy (Foreman)** = sole authority over effects  
- **Execution** = downstream of Intent only  
- **Observation** = non-authoritative  

Verticals (e.g. mailbox, timer, webhook) are:

> **interchangeable projections, not organizing primitives**

---

## B. Invariants (What Must Always Hold)

Derived from Ontology.

### B.1 Core Invariants

- All external change enters as **Fact**
- All effects originate as **Intent**
- Only **Policy (Foreman)** may create intents
- System must be **replay deterministic**
- Observation must not affect control
- Kernel must remain **vertical-neutral**

---

### B.2 Explicit Exceptions (Bounded)

Allowed only when clearly scoped:

- Vertical modules (e.g. mailbox runtime)
- Compatibility layers (DB views, normalization edges)
- External adapters (protocol-specific)

Rule:

> Domain-specific semantics must be **explicit and local**, never implicit or generic

---

## C. Authority (Who May Act)

Derived from Invariants.

### C.1 Runtime Authority

- **Foreman (Policy)**  
  - consumes Facts  
  - produces Intents  
  - sole gate to effects  

- **Workers (Execution)**  
  - execute Intents  
  - cannot create or alter them  

- **Observation**  
  - reads state  
  - cannot influence control  

---

### C.2 Steward Authority (Out-of-System)

#### Human Dharma Steward

- maintains continuity over time  
- defines direction toward closure  
- makes final decisions  
- accepts consequences  
- resolves ambiguity  

#### Dharma Instrument (AI)

- evaluates invariants  
- detects semantic cavities  
- proposes refinements  
- exposes inconsistencies  

Constraints:

- cannot decide  
- cannot redefine invariants  
- cannot carry continuity  

---

### C.3 Authority Rule

> All system evolution decisions require **Human Dharma Steward ratification**  
> The Dharma Instrument may propose, never decide

---

## D. Evaluation (How Correctness Is Judged)

Derived from Invariants + Authority.

### D.1 Invariant Tests

For any change:

- Can an effect occur without Intent?
- Can a Fact be skipped or inferred?
- Can replay produce a different result?
- Can a vertical bypass registry?
- Can observation influence control?
- Can domain semantics enter kernel types?

If **any = yes → reject**

---

### D.2 Decision Procedure

Before accepting change:

1. **Boundary check** — Fact / Policy / Intent intact?
2. **Neutrality check** — vertical leakage present?
3. **Authority check** — bypass of Foreman or lifecycle?
4. **Determinism check** — replay stability preserved?
5. **Placement check** — correct layer (kernel / vertical / compat)?
6. **Necessity check** — invariant-driven or convenience?

Unclear → reject or refine

---

## E. Evolution (How the System May Change)

Derived from Evaluation.

### E.1 Allowed Transformations

- push vertical logic outward
- replace implicit behavior with explicit structure
- split modules along boundaries
- rename for neutrality
- strengthen invariants

---

### E.2 Forbidden Transformations

- collapsing boundaries for convenience
- implicit defaults (especially vertical)
- policy outside Foreman
- effects outside Intent
- domain semantics in kernel
- bypassing invariant constraints

---

### E.3 Anti-Patterns (Immediate Rejection)

- mailbox-shaped fields in generic code
- implicit vertical fallback
- observation affecting control
- “helper” APIs bypassing system flow
- vertical branching inside kernel

---

### E.4 Failure Modes of Dharma Steward

- **Over-generalization** — abstraction without invariant demand  
- **Premature closure** — declaring done while residue remains  
- **Convenience leakage** — small shortcuts reintroducing arbitrariness  
- **Vertical bias creep** — subtle domain reintroduction  
- **Over-refactoring** — change without invariant gain  

---

## F. State (Where the System Is Now)

Derived from Evolution.

### F.1 Achieved

- kernel boundaries enforced  
- vertical neutrality established  
- explicit registry model  
- separation of runtime vs vertical logic  
- lint enforcement in place  

---

### F.2 Residual (Bounded)

- compatibility edges  
- vertical-local models  
- minimal lexical remnants  

---

### F.3 Valid Work Frontier

- adding new verticals  
- policy sophistication  
- execution semantics  
- observability / UI  
- scaling and distribution  

---

## G. Closure (When the System Is Complete)

Derived from Ontology.

System is complete when:

- new verticals require **no kernel changes**  
- all effects flow through Intent uniformly  
- replay determinism holds globally  
- no hidden vertical coupling exists  

Test:

> Remove any one vertical → system still holds

---

## H. Final Constraint

At all levels:

> **Make the system more inevitable**

---

## I. One-Line Definition

Narada:

> a deterministic kernel that transforms domain signals into governed, replay-safe effects, with verticals as interchangeable projections

Dharma Steward:

> the agent that preserves invariants while advancing the system toward semantic closure