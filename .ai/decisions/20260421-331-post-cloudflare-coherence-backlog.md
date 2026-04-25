# Post-Cloudflare Coherence Backlog

> Decision record for Task 331: what comes after the Cloudflare Site Prototype chapter, guided by Task 330's ontology closure.
>
> Closure inputs: Task 329 (operational prototype closure), Task 330 (ontology closure review), SEMANTICS.md §2.14, docs/deployment/cloudflare-site-materialization.md.
>
> Chapter file: [`.ai/do-not-open/tasks/20260421-332-337-post-cloudflare-coherence-chapter.md`](../tasks/20260421-332-337-post-cloudflare-coherence-chapter.md)

---

## 1. What Task 330 Changed or Confirmed

Task 330's ontology closure review delivered a **"Preserved with corrections"** verdict:

- Cloudflare remained a **Site**, not a second Narada.
- The `Aim / Site / Cycle / Act / Trace` vocabulary held throughout all prototype artifacts.
- Zero instances of "Cloudflare operation" or Operation/Site/Cycle/Act/Trace smear.
- The Durable Object stores authoritative records legitimately (SEMANTICS.md §2.14.1 permits traced records to also be authoritative).
- Three minor semantic drifts were found and corrected in-place:
  1. `scope_id`/`site_id` conflation in Cycle entrypoint (deferred to v1)
  2. Design doc understating DO SQLite authority (corrected)
  3. `site_id` case sensitivity vs secret naming normalization (recorded)

The key confirmation: **The vocabulary is already coherent.** A dedicated "Canonical Vocabulary Hardening" chapter would be bureaucratic — Task 330 performed that function.

---

## 2. Post-330 Realization

> Narada is becoming a **portable control grammar for governed intelligent operations**.

This means:

- Narada is **not** a deployment framework.
- Narada is **not** an automation app.
- Narada is **not** a sync daemon.
- Narada is **not** USC.
- Narada is the **governed control grammar** that separates:
  - **User Objective** (Aim) — why work happens
  - **Governed Operation** (scope) — what work is permitted
  - **Runtime Locus** (Site) — where work runs
  - **Control Cycle** (Cycle) — how work advances
  - **Effect Intent** (intent / outbound_command) — what effect is proposed
  - **Effect Attempt** (execution_attempt) — how the effect is tried
  - **Confirmation** (confirmation / reconciliation) — whether the effect landed
  - **Evidence Trace** (evaluation / decision / log) — what happened and why

The Cloudflare prototype proved that this grammar can be **materialized** at a remote substrate. The next chapters must strengthen the grammar itself — making it testable, autonomous, and provable in daily use — rather than building more substrates or deployment infrastructure.

---

## 3. Selected Chapter Sequence

Three chapters selected. Two deferred.

### Selected

| Order | Chapter | Task | Purpose |
|-------|---------|-------|---------|
| 1 | **Control Cycle Fixture Discipline** | 334 | Define canonical fixture shapes for each Cycle step so integration semantics are tested before isolated components drift. Makes the grammar **verifiable across substrates**. |
| 2 | **Unattended Operation Layer** | 336 | Define how a Site operates safely without human babysitting: health contracts, stuck-cycle detection, alerting, self-healing boundaries. Makes the grammar **autonomous**. |
| 3 | **Mailbox Daily-Use Closure** | 337 | Finish the support mailbox as a supervised daily-use product: knowledge, review queue, terminal failure hygiene, draft/send posture. Exercises the grammar in **real daily use**. |

### Deferred

| Chapter | Task | Reason |
|---------|------|--------|
| **Canonical Vocabulary Hardening** | 333 | Task 330 already performed this. The vocabulary (`Aim / Site / Cycle / Act / Trace`) is coherent. Minor drift was corrected in-place. |
| **Runtime Locus Abstraction** | 335 | Task 330 explicitly deferred generic `Site` abstraction: "One Site materialization is not sufficient evidence to justify a generic `Site` abstraction." Wait for a second substrate (e.g., local container, AWS Lambda, Fly.io). |

---

## 4. Why Selected Chapters Strengthen the Grammar

### Control Cycle Fixture Discipline

The Cloudflare prototype exposed a critical gap: **steps 2–6 of the bounded Cycle are stubs.** The sync, admit, evaluate, govern, handoff, and reconcile steps have no fixture-defined semantics on the Cloudflare substrate. Without fixture discipline, each substrate would re-implement these steps differently, fragmenting the grammar.

This chapter defines:
- Canonical input/output contracts for each Cycle step
- Cross-substrate fixture shapes that any Site must satisfy
- Fixture-first test discipline: integration semantics are defined before component implementation

This strengthens the grammar by making it **substrate-independent at the semantic level**.

### Unattended Operation Layer

A grammar that requires human babysitting is not a control grammar — it is a manual procedure. This chapter defines:
- Health contract between Site and operator (what "healthy" means at any substrate)
- Stuck-cycle detection (when a Cycle has not advanced within expected bounds)
- Alerting boundary (what the Site may tell the operator vs. what the operator must discover)
- Self-healing limits (what a Site may retry autonomously vs. what requires operator decision)

This strengthens the grammar by making it **autonomously governed**, not just human-governed.

### Mailbox Daily-Use Closure

A grammar that only works in prototypes is not proven. The mailbox vertical is the first real daily-use exercise of the full grammar: inbound facts → context formation → charter evaluation → foreman decision → outbound handoff → reconciliation → confirmation. This chapter closes the mailbox as a supervised product by adding:
- Knowledge placement and retrieval (how the mailbox vertical uses static grammar)
- Review queue (operator oversight of draft quality)
- Terminal failure hygiene (what happens when an Act cannot complete)
- Draft/send posture refinement (safe-default posture with explicit override path)

This strengthens the grammar by **proving it end-to-end in real daily use**. It is classified as parallel/non-core to grammar development, but essential to product validity.

---

## 5. Why No Implementation Tasks Were Created Yet

The selected chapters are **backlog definition**, not implementation. Each chapter file defines:
- The problem boundary
- The grammar-strengthening goal
- What is in-scope and out-of-scope
- Closure criteria

Implementation subtasks will be created **after** the chapter's first task is claimed and its scope is validated. This prevents premature task proliferation and keeps the backlog coherent with the grammar.

One bounded exception: the Mailbox Daily-Use Closure chapter references concrete product surfaces (`narada drafts`, `narada ops`, knowledge directory) that already exist. Its task file includes specific acceptance criteria drawn from the existing operator runbook.

---

## 6. Deferred Concerns

| Concern | Deferred To | Reason |
|---------|-------------|--------|
| Generic `Site` interface | After second substrate | Task 330: insufficient evidence with one substrate |
| `scope_id` → `site_id` resolution | v1 multi-Site support | Mild drift; only relevant when multi-scope Sites exist |
| Real charter runtime in Cloudflare Sandbox | Cloudflare v1 chapter | Requires kernel porting; separate vertical effort |
| Cron Trigger / webhook push | Cloudflare v1 chapter | Substrate-specific, not grammar-strengthening |
| D1 evaluation | Cloudflare v1 chapter | Substrate-specific storage optimization |
| Multi-vertical (timer, webhook, filesystem) | Post-mailbox | Grammar must prove itself in one vertical first |
| Fleet / multi-operation dashboard | Post-mailbox | Product surface, not grammar |
| Public operator dashboard | Post-unattended | Requires unattended layer to be stable first |

---

## 7. Sequencing Logic

```text
334 Control Cycle Fixture Discipline
         │
         ├──► 336 Unattended Operation Layer ──► [future: public dashboard]
         │
         └──► 337 Mailbox Daily-Use Closure ────► [future: multi-vertical]
```

**Fixture Discipline is first** because it defines the testable grammar contract. Without it, Unattended and Mailbox chapters would test against ad-hoc semantics.

**Unattended and Mailbox run in parallel** after Fixture Discipline. Unattended defines cross-vertical autonomy contracts; Mailbox exercises those contracts in one vertical.

**333 Canonical Vocabulary Hardening and 335 Runtime Locus Abstraction are out of sequence** — the former was already done by Task 330; the latter needs more substrates.
