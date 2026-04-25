# Decision: Canonical Vocabulary Hardening (Task 424)

**Date:** 2026-04-22
**Task:** 424
**Depends on:** 333 (deferred), 421 (Windows charter evaluation)
**Verdict:** **Option 4 — Two-level mapping.** Keep the compact tuple `Aim / Site / Cycle / Act / Trace` as prose shorthand, but bind each term to a sharper canonical object name for precision contexts.

---

## 1. Source Documents Read

| Path | Role |
|------|------|
| [`SEMANTICS.md §1`](../SEMANTICS.md) | User-facing vocabulary; `operation specification` definition |
| [`SEMANTICS.md §2.14`](../SEMANTICS.md) | Current crystallized vocabulary (`Aim / Site / Cycle / Act / Trace`) |
| [`AGENTS.md`](../AGENTS.md) | Agent semantic crystallization guidance |
| [`.ai/do-not-open/tasks/20260420-307-semantic-crystallization-aim-site-cycle-act-trace.md`](../tasks/20260420-307-semantic-crystallization-aim-site-cycle-act-trace.md) | Original introduction of the tuple |
| [`.ai/do-not-open/tasks/20260421-333-canonical-vocabulary-hardening.md`](../tasks/20260421-333-canonical-vocabulary-hardening.md) | Deferred hardening task |
| [`.ai/decisions/20260421-330-cloudflare-site-ontology-closure.md`](20260421-330-cloudflare-site-ontology-closure.md) | Cloudflare ontology closure; confirmed tuple coherence |
| [`.ai/decisions/20260421-331-post-cloudflare-coherence-backlog.md`](20260421-331-post-cloudflare-coherence-backlog.md) | Post-Cloudflare realization: "portable control grammar"; introduced sharper objects |
| [`.ai/decisions/20260422-406-principal-runtime-state-machine.md`](20260422-406-principal-runtime-state-machine.md) | PrincipalRuntime design; six-layer separation; no tuple changes needed |
| [`.ai/do-not-open/tasks/20260422-397-session-attachment-semantics-for-sites-and-agents.md`](../tasks/20260422-397-session-attachment-semantics-for-sites-and-agents.md) | Session attachment; uses tuple without smear |
| [`.ai/do-not-open/tasks/20260422-398-email-marketing-live-dry-run-chapter-shaping.md`](../tasks/20260422-398-email-marketing-live-dry-run-chapter-shaping.md) | Live dry run; needs operation-refinement vocabulary |
| [`.ai/do-not-open/tasks/20260422-419-windows-live-graph-sync-step.md`](../tasks/20260422-419-windows-live-graph-sync-step.md) | Live sync step; uses "Aim" for operation specification |
| [`.ai/do-not-open/tasks/20260422-420-windows-campaign-context-derivation-step.md`](../tasks/20260422-420-windows-campaign-context-derivation-step.md) | Context derivation; tuple holds |
| [`.ai/do-not-open/tasks/20260422-421-windows-charter-evaluation-step.md`](../tasks/20260422-421-windows-charter-evaluation-step.md) | Charter evaluation; tuple holds |
| [`.ai/do-not-open/tasks/20260422-422-windows-foreman-handoff-step.md`](../tasks/20260422-422-windows-foreman-handoff-step.md) | Foreman handoff; tuple holds |

---

## 2. Candidate Comparison Table

### 2.1 First-Term Candidates (replaces or refines `Aim`)

| Candidate | Inspectable? | AI-facing? | Separates outcome from Site? | Risk | Verdict |
|-----------|:-----------:|:----------:|:----------------------------:|------|---------|
| `Aim` (current) | ❌ "telos" is vague | ❌ Human-centric | ✅ | Desire/objective ambiguity; not versionable | **Kept as compact term, redefined as specification-bearing** |
| `Objective` | ⚠️ Formal but still human-centric | ⚠️ Slightly better | ✅ | Still reads as human goal, not inspectable artifact | Rejected — does not solve inspectability |
| `Spec` | ✅ | ✅ | ✅ | Too static; misses "desired outcome" dimension | Rejected — sounds like a schema, not a governed operation |
| `Directive` | ⚠️ Versionable but imperative | ⚠️ AI-facing | ✅ | Sounds imperative and under-governed; conflicts with Narada's governance model | Rejected — contradicts foreman authority |
| `Operation Specification` | ✅ | ✅ | ✅ | Verbose; already exists in SEMANTICS.md §1.1 | **Accepted as canonical expansion of `Aim`** |

### 2.2 Place/Runtime Candidates (replaces or refines `Site`)

| Candidate | Concrete? | Substrate-neutral? | Risk | Verdict |
|-----------|:---------:|:------------------:|------|---------|
| `Site` (current) | ✅ | ⚠️ Sounds web-specific | Web/deployment connotation | **Kept as compact term; `Runtime Locus` is canonical expansion** |
| `Runtime Locus` | ✅ | ✅ | Abstract; less grounded in prose | **Accepted as canonical expansion of `Site`** |

### 2.3 Advancement Candidates (replaces or refines `Cycle`)

| Candidate | Compact? | Distinguishes governance phases? | Risk | Verdict |
|-----------|:--------:|:--------------------------------:|------|---------|
| `Cycle` (current) | ✅ | ❌ Generic loop ambiguity | Could mean any iteration | **Kept as compact term; `Control Cycle` is canonical expansion** |
| `Control Cycle` | ⚠️ | ✅ | Verbose | **Accepted as canonical expansion of `Cycle`** |

### 2.4 Effect Candidates (replaces or refines `Act`)

| Candidate | Covers proposal? | Covers execution? | Covers confirmation? | Risk | Verdict |
|-----------|:----------------:|:-----------------:|:--------------------:|------|---------|
| `Act` (current) | ✅ | ✅ | ✅ | Collapses intent, attempt, and consequence into one word | **Kept as family name; split into phases below** |
| `Effect Intent` | ✅ | ❌ | ❌ | Does not cover execution attempt | **Accepted as phase 1 of Act** |
| `Effect Attempt` | ❌ | ✅ | ❌ | Does not cover proposal | **Accepted as phase 2 of Act** |
| `Confirmation` | ❌ | ❌ | ✅ | May be read as a phase rather than top-level term | **Accepted as phase 3 of Act** |

### 2.5 Evidence Candidates (replaces or refines `Trace`)

| Candidate | Covers authority records? | Covers logs? | Risk | Verdict |
|-----------|:-------------------------:|:------------:|------|---------|
| `Trace` (current) | ✅ | ✅ | Decorative/log-only interpretation | **Kept as compact term; `Evidence Trace` is canonical expansion** |
| `Evidence Trace` | ✅ | ✅ | Verbose | **Accepted as canonical expansion of `Trace`** |

---

## 3. Final Vocabulary Decision

### 3.1 Compact Tuple (Prose Shorthand)

> **Narada advances Aims at Sites through bounded Cycles that produce governed Acts and durable Traces.**

The five-term tuple is **preserved** as the compact mnemonic. It is the correct shape for human prose, architectural summaries, and high-level design documents.

### 3.2 Canonical Object Names (Precision Contexts)

When writing specifications, interfaces, authority boundaries, or agent instructions where precision matters, use the canonical expansion:

| Compact Term | Canonical Expansion | When to Use the Expansion |
|--------------|---------------------|---------------------------|
| **Aim** | **Operation Specification** | When describing the inspectable, versionable configured definition (sources, charters, posture, knowledge, allowed actions). |
| **Site** | **Runtime Locus** | When emphasizing substrate neutrality (local daemon, Cloudflare, Windows, future container). |
| **Cycle** | **Control Cycle** | When distinguishing from generic loops, and when enumerating governance phases. |
| **Act** | **Effect Intent** → **Effect Attempt** → **Confirmation** | When describing the effect lifecycle with phase precision. Never use `Act` alone to mean a specific phase. |
| **Trace** | **Evidence Trace** | When emphasizing that the record includes authoritative decisions and evaluations, not merely decorative logs. |

### 3.3 Phase Vocabulary for a Control Cycle

A `Control Cycle` is not a black box. It has nine canonical phases:

```text
Source Read → Fact Admission → Context Formation → Evaluation → Governance → Intent/Handoff → Execution Attempt → Confirmation/Reconciliation → Evidence Trace
```

| Phase | Compact Name | Canonical Object | Durable Boundary | Authority |
|-------|-------------|------------------|------------------|-----------|
| 1. Source read | `read` | `Source` pull | Checkpoint (`cursor`) | `derive` (adapter) |
| 2. Fact admission | `admit` | `Fact` ingestion | `fact_id` | `derive` + `resolve` (live) / `derive` (replay) |
| 3. Context formation | `form` | `PolicyContext` | `context_id`, `revision_id` | `derive` |
| 4. Evaluation | `evaluate` | `CharterOutputEnvelope` / `evaluation` | `evaluation_id` | `propose` (charter) |
| 5. Governance | `govern` | `foreman_decision` | `decision_id` | `resolve` (foreman) |
| 6. Intent / Handoff | `handoff` | `Intent` + `outbound_handoff` | `intent_id`, `outbound_id` | `resolve` → `execute` |
| 7. Execution attempt | `execute` | `execution_attempt` | `execution_id` | `execute` (worker) |
| 8. Confirmation / Reconciliation | `confirm` | `Confirmation` status | — | `confirm` (reconciler) |
| 9. Evidence trace | `trace` | `agent_traces`, `operator_action_requests` | `trace_id` | Advisory / read-only |

Agents must use these phase names when describing Cycle internals. Do not invent new phase names.

### 3.4 Operation Refinement Path

An operation becomes better by changing its **Operation Specification** along one or more dimensions:

| Refinement Dimension | What Changes | Canonical Object | Authority |
|---------------------|--------------|------------------|-----------|
| **Specification** | Sources, admission rules, scope boundaries | `operation specification` | `admin` |
| **Charters** | Policy instructions, judgment organization | `operation charter set` | `admin` |
| **Knowledge** | External references consumed by charters | `knowledge source` | `admin` |
| **Tools** | Allowed external capabilities | `tool catalog` | `admin` |
| **Selectors** | Bounding grammar for operator input sets | `selector` | `derive` (read) / `admin` (mutate) |
| **Posture** | Safety preset, allowed actions | `posture` | `admin` |
| **Site constraints** | Runtime locus limits (budget, latency, substrate) | `Site` config | `admin` |

Refinement is **not** a new top-level term. It is a process applied to the Operation Specification. A refined Aim is still an Aim; its specification has changed.

---

## 4. Rejected Alternatives and Why

| Alternative | Why Rejected |
|-------------|--------------|
| Replace `Aim` with `Spec` | `Spec` is too static and misses the "desired outcome" dimension. An operation specification is more than a schema; it includes goals, posture, and governance. |
| Replace `Aim` with `Objective` | Still human-centric; does not solve the inspectability/versionability problem that motivated this reopening. |
| Replace `Aim` with `Directive` | Sounds imperative and under-governed. Narada's whole architecture is that intelligence proposes and authority governs; `Directive` implies the opposite. |
| Replace `Site` with `Runtime Locus` in the tuple | `Runtime Locus` is precise but abstract and verbose. The tuple is a prose shorthand; precision belongs in the expansion layer. |
| Replace `Cycle` with `Control Cycle` in the tuple | Same reasoning: `Control Cycle` is precise but too long for a five-term mnemonic. |
| Replace `Act` with `Effect Intent` in the tuple | `Effect Intent` only covers the proposal phase, not execution or confirmation. The tuple needs a family term. |
| Collapse `Effect Intent`, `Effect Attempt`, `Confirmation` into a single term | This was the old `Act` problem. Splitting into phases is the fix, not the problem. |
| Replace `Trace` with `Evidence Trace` in the tuple | `Evidence Trace` is verbose. The compact form is sufficient for prose. |
| Option 1: Keep tuple unchanged | Does not address the pressure from PrincipalRuntime, Windows Site, and operation-refinement work. `Aim` as "telos" is too human-centric. |
| Option 2: Replace first term only (`Spec / Site / Cycle / Act / Trace`) | `Spec` is weaker than keeping `Aim` with a redefinition. Also, `Act` and `Trace` still need refinement. |
| Option 3: Replace all terms with verbose forms | `Operation Specification / Runtime Locus / Control Cycle / Effect Intent / Evidence Trace` is precise but unusable in prose. The tuple's value is as a compact mnemonic. |

---

## 5. Migration Guidance

### 5.1 What Agents Should Prefer Going Forward

- **In architectural summaries, chapter plans, and high-level design**: Use the compact tuple (`Aim / Site / Cycle / Act / Trace`).
- **In specifications, interfaces, authority boundaries, and precise descriptions**: Use the canonical expansion (`Operation Specification` / `Runtime Locus` / `Control Cycle` / phase vocabulary / `Evidence Trace`).
- **When describing an effect's full lifecycle**: Always use the three-phase form (`Effect Intent` → `Effect Attempt` → `Confirmation`). Never say "the Act was confirmed"; say "the Effect Intent was submitted and later Confirmed."
- **When describing what a user configures**: Use `operation specification` (§1.1). Do not say "the user configures their Aim." Say "the user configures their operation specification, which realizes the Aim."

### 5.2 Forbidden or Deprecated Wording

| Forbidden | Why | Prefer |
|-----------|-----|--------|
| "Aim is the pursued telos" | Too human-centric; replaced by inspectable definition | "Aim is the inspectable, versionable operation specification" |
| "Cloudflare operation" | `operation` smear | "Cloudflare Site" or "Cloudflare-backed Site" |
| "the Act was executed" | Collapses intent and attempt | "the Effect Intent was attempted" or "the Effect Attempt completed" |
| "the Act was confirmed" | Collapses all three phases | "the Effect Attempt was Confirmed after reconciliation" |
| "Trace" meaning only logs | Trace includes authoritative records | "Evidence Trace" or "observational logs" when logs-only is meant |
| "Cycle" meaning any loop | Must distinguish Control Cycle | "Control Cycle" or "iteration" when generic looping is meant |
| "Site" meaning only web deployment | Must be substrate-neutral | "Runtime Locus" when emphasizing substrate neutrality |

### 5.3 No Code, DB, CLI, or API Renames

Per Task 424 non-goals:
- CLI flags remain unchanged.
- Database columns remain unchanged.
- Package APIs remain unchanged.
- The tuple is a documentation and conceptual layer, not a code layer.

---

## 6. Changes Made

| File | Change |
|------|--------|
| [`SEMANTICS.md §2.14`](../SEMANTICS.md) | Redefined `Aim` as inspectable specification-bearing object. Added canonical expansion table. Added phase vocabulary for Control Cycle. Added operation refinement path. Updated forbidden smears. |
| [`AGENTS.md`](../AGENTS.md) | Updated semantic crystallization guidance to reference canonical expansions and phase vocabulary. |
| [`.ai/do-not-open/tasks/20260421-333-canonical-vocabulary-hardening.md`](../tasks/20260421-333-canonical-vocabulary-hardening.md) | Added forward reference to Task 424 as the reopening/hardening pass. |
| This file | Created decision record. |

---

## 7. Residual Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Agents continue using `Aim` with old "telos" definition | Medium | Medium | Definition in SEMANTICS.md now explicitly overrides the old reading; task 424 closure notes remind future agents. |
| `Act` still used as a single phase in informal prose | High | Low | Phase vocabulary is documented; occasional informal use is acceptable if it does not cross into spec or interface language. |
| `Runtime Locus` and `Control Cycle` never adopted in practice because tuple is "good enough" | Medium | Low | The two-level mapping is designed so that compact terms are always acceptable in prose; expansions are only required in precision contexts. This is by design, not failure. |
| Operation refinement path is conflated with "self-improving AI" | Low | High | Refinement is explicitly defined as operator/admin changes to specification, charters, knowledge, tools, selectors, posture, or Site constraints. It is not autonomous self-modification. |

---

## 8. Follow-Up Tasks

None required. Task 424 closes the reopened Task 333 concern.

If future work introduces new semantic pressure (e.g., a third substrate, a new principal type, or autonomous operation modification), the two-level mapping can absorb it by adding new canonical expansions without changing the compact tuple.
