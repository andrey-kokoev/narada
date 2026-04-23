# Decision: Grammar / Template / Instantiation Ladder

**Date:** 2026-04-23
**Task:** 492
**Depends on:** 491 (Crossing Regime Semantic Crystallization)
**Verdict:** **Accepted. The three-level ladder is canonical. Placement of all four objects is unambiguous.**

---

## 1. Summary

Narada has three recognizable artifacts that occupy distinct levels of abstraction:

1. **Narada proper** — the invariant control grammar
2. **narada.usc** — a template applying that grammar to construction operations
3. **narada.sonar** — a concrete instantiation running at a Site

These three levels were informally understood but never explicitly named and placed. This decision defines the canonical ladder and clarifies the role of **Site** relative to it.

**Core insight:** The ladder is `grammar → template → instantiation`. Site is orthogonal — it is the runtime locus that hosts an instantiation, not a level on the ladder itself.

---

## 2. The Three Levels Defined

### 2.1 Grammar

A **grammar** is an abstract, substrate-agnostic system of rules, boundaries, and invariants that governs how intelligent operations are structured and executed.

- **Properties:**
  - Defines durable boundaries (Fact, Work, Intent, Execution, Confirmation)
  - Defines authority classes and their separation (`derive`, `propose`, `claim`, `execute`, `resolve`, `confirm`, `admin`)
  - Defines the nine-layer pipeline (`Source → Fact → Context → Work → Policy → Intent → Execution → Confirmation → Observation`)
  - Defines semantic crystallization (`Aim / Site / Cycle / Act / Trace`)
  - Is **not** tied to any particular vertical, substrate, deployment target, or operation
  - Is **not** executable by itself

- **Canonical example:** **Narada proper** — the portable control grammar documented in `SEMANTICS.md`, `00-kernel.md`, and the invariant spine.

### 2.2 Template

A **template** is a reusable, vertical-specific application of a grammar. It defines schemas, configurations, and constructor knowledge that can be instantiated into live operations.

- **Properties:**
  - Applies a grammar to a specific class of operations (e.g., task-based construction, mailbox triage, campaign production)
  - Defines static schemas: task file front-matter, task graph JSON, charter definitions, plan commands
  - Is **read-only at runtime** — consumed by Cycles but does not assume runtime state
  - Is **not** a Site and is **not** a live operation
  - May be versioned and compatibility-checked (`uscVersion`)

- **Canonical example:** **narada.usc** — the static grammar for task-based construction operations. It declares what a task, chapter, finding, and assignment *are*, but does not perform transitions.

### 2.3 Instantiation

An **instantiation** is a concrete, live operation configured from a template and running at a Site. It has actual credentials, knowledge sources, scopes, and produces real Cycles with real effects.

- **Properties:**
  - Has a scope (`scope_id`) bound to an operation specification
  - Has live configuration, credentials, and data stores
  - Produces durable facts, work items, intents, executions, and traces
  - Is anchored to a specific Site substrate
  - Is **not** the grammar or the template — it is a particular application of both

- **Canonical example:** **narada.sonar** — a private ops repo with a live mailbox operation, real Graph API credentials, and actual Cycles processing inbound mail.

---

## 3. Placement Table

| Object | Ladder Level | What It Is | What It Is Not |
|--------|-------------|------------|----------------|
| **Narada proper** | **Grammar** | Abstract control grammar: pipeline, authority classes, semantic crystallization | Not a repo. Not a Site. Not an operation. Not executable. |
| **narada.usc** | **Template** | Static constructor knowledge for task-based operations: schemas, charters, plans | Not a runtime. Not a Site. Not a live operation. Read-only at runtime. |
| **narada.sonar** | **Instantiation** | Live mailbox operation with real credentials, scopes, and Cycles | Not the grammar. Not the template. Not abstract. |
| **Site** | **Runtime Locus** | Anchored place where instantiation runs: filesystem root, Cloudflare DOs, Windows process | Not a level on the ladder. Not the grammar or template. Hosts instantiations. |

---

## 4. Site Relative to the Ladder

Site is **orthogonal** to the `grammar → template → instantiation` ladder, not a fourth rung.

```text
                    grammar (Narada proper)
                         ↓
                    template (narada.usc)
                         ↓
                    instantiation (narada.sonar)
                         ↓
              ┌─────────────────────────────┐
              │         Site                │
              │  (local daemon / Cloudflare │
              │   / Windows / WSL / future) │
              └─────────────────────────────┘
```

An instantiation **requires** a Site to exist, but a Site without an instantiation is just empty infrastructure. A Site hosts Cycles; it does not *become* the operation. Multiple instantiations (operations) may coexist at one Site (one scope per operation).

The relationship:
- Grammar tells you *how* operations must be structured
- Template tells you *what kind* of operation to build
- Instantiation is the *specific* operation with live data
- Site is *where* that operation runs

---

## 5. Forbidden Smears

These phrases collapse the ladder and must be avoided:

| Avoid | Why | Prefer |
|-------|-----|--------|
| "Narada is narada.usc" | Collapses grammar into template | "narada.usc is a template built on the Narada grammar" |
| "narada.usc is a Site" | Collapses template into runtime locus | "narada.usc static grammar is consumed by Cycles at a Site" |
| "narada.sonar is Narada" | Collapses instantiation into grammar | "narada.sonar is an instantiation of the Narada grammar" |
| "Site is an instantiation" | Collapses locus into operation | "A Site hosts an instantiation" or "narada.sonar runs at a Site" |
| "operation deploys operation" | Collapses Aim into Site into new Aim | "A Cycle produces an Act that materializes a future Aim-at-Site binding" |

---

## 6. Relationship to Existing Documents

| Document | Role | Ladder Level |
|----------|------|-------------|
| `SEMANTICS.md` | Canonical ontology | Grammar |
| `packages/layers/control-plane/docs/00-kernel.md` | Normative lawbook | Grammar |
| `docs/concepts/runtime-usc-boundary.md` | Boundary contract between runtime and static grammar | Grammar ↔ Template boundary |
| `packages/verticals/usc/` (if exists) or USC packages | Static schema, task graphs, charter definitions | Template |
| `narada.sonar/config/config.json` | Live operation specification | Instantiation |
| `narada.sonar/` (ops repo root) | Private repo containing operation + evidence | Instantiation + Trace |
| Any Cloudflare-backed runtime with Durable Objects and R2 | Substrate + state storage | Site |

---

## 7. Acceptance Criteria Verification

| Criterion | Evidence |
|-----------|----------|
| Grammar / template / instantiation defined clearly | §2.1–2.3 above |
| Narada proper, narada.usc, Site, narada.sonar placed unambiguously | §3 Placement Table and §4 diagram |
| Durable decision/spec artifact created | This file (`.ai/decisions/20260423-492-grammar-template-instantiation-ladder.md`) |
| Verification evidence recorded in task | Task 492 file updated with reference to this decision |
