---
status: closed
closed: 2026-04-22
depends_on: [333, 421]
---

# Task 424 — Canonical Vocabulary Hardening Reopen

## Context

Task 333 deferred canonical vocabulary hardening because Task 330 found `Aim / Site / Cycle / Act / Trace` coherent for the Cloudflare prototype.

That deferral is no longer sufficient.

Recent work introduced new pressure:

- Windows Site work moved Narada from Cloudflare-only substrate proof toward a second substrate.
- PrincipalRuntime work sharpened actor/runtime distinctions.
- Email-marketing live dry-run work exposed a need to describe operation improvement through charters, knowledge, tools, selectors, posture, and Site constraints.
- Discussion identified that `Aim` may be too human-centric for the AI-facing, inspectable, versionable grammar Narada is becoming.
- The whole `Aim / Site / Cycle / Act / Trace` tuple now needs pressure testing, because later work introduced sharper objects: operation specification, runtime locus/Site, control cycle, effect intent, effect attempt, confirmation/reconciliation, evidence trace, principal runtime, and operation refinement.

The question is not whether the old vocabulary was usable. It was. The question is whether it is now precise enough to govern future agent work without semantic drift.

## Goal

Reopen the deferred Task 333 concern and harden Narada's canonical top-level vocabulary.

The outcome must answer explicitly:

> Should `Aim / Site / Cycle / Act / Trace` remain canonical, or should one or more terms be replaced/refined by more inspectable AI-facing objects such as `Spec`, `Objective`, `Directive`, `Operation Specification`, `Runtime Locus`, `Control Cycle`, `Effect Intent`, `Effect Attempt`, `Confirmation`, or `Evidence Trace`?

The task must produce a decision and update canonical docs accordingly.

## Required Work

### 1. Read canonical and historical sources

Read:

- `SEMANTICS.md` §1 and §2.14
- `AGENTS.md` semantic crystallization guidance
- `.ai/tasks/20260420-307-semantic-crystallization-aim-site-cycle-act-trace.md`
- `.ai/tasks/20260421-333-canonical-vocabulary-hardening.md`
- `.ai/decisions/20260421-330-cloudflare-site-ontology-closure.md`
- `.ai/decisions/20260421-331-post-cloudflare-coherence-backlog.md`
- `.ai/decisions/20260422-406-principal-runtime-state-machine.md`
- `.ai/tasks/20260422-397-session-attachment-semantics-for-sites-and-agents.md`
- `.ai/tasks/20260422-398-email-marketing-live-dry-run-chapter-shaping.md`
- `.ai/tasks/20260422-419-windows-live-graph-sync-step.md`
- `.ai/tasks/20260422-420-windows-campaign-context-derivation-step.md`
- `.ai/tasks/20260422-421-windows-charter-evaluation-step.md`
- `.ai/tasks/20260422-422-windows-foreman-handoff-step.md`

Do not rely on memory. Quote file paths in the decision so later agents can audit the source trail.

### 2. Evaluate the whole current tuple

Evaluate each current term in `Aim / Site / Cycle / Act / Trace`.

For each term, decide whether it should be:

- kept as canonical;
- refined by definition only;
- demoted to prose shorthand;
- replaced by a sharper canonical object.

Required minimum evaluation:

| Current Term | Required Pressure Test |
|--------------|------------------------|
| `Aim` | Is this too human/telos-oriented, or can it be defined as an inspectable specification-bearing object? |
| `Site` | Is this precise enough, or should `Runtime Locus` become canonical and `Site` become substrate shorthand? |
| `Cycle` | Is this sufficient, or should `Control Cycle` be canonical to distinguish from any loop/iteration? |
| `Act` | Does this collapse proposal, intent, execution, and external consequence? Should it split into `Effect Intent`, `Effect Attempt`, and/or `Consequence`? |
| `Trace` | Is this precise enough, or should `Evidence Trace` be canonical to prevent decorative/log-only interpretations? |

### 3. Evaluate candidate replacements/refinements

Evaluate at least these candidate replacements/refinements:

| Candidate | Applies To | Required Evaluation |
|-----------|------------|---------------------|
| `Aim` | first term | Human/telos clarity; risk of desire/objective ambiguity |
| `Objective` | first term | More formal than Aim; risk of remaining human-centric |
| `Spec` | first term | Inspectable/versionable; risk of sounding too static |
| `Directive` | first term | AI-facing instruction flavor; risk of sounding imperative and under-governed |
| `Operation Specification` | first term / operation definition | Already defined; precise but verbose |
| `Site` | place/runtime term | Concrete and already used; risk of sounding web/deployment-specific |
| `Runtime Locus` | place/runtime term | Precise; risk of being abstract and less grounded |
| `Cycle` | advancement term | Compact; risk of generic loop ambiguity |
| `Control Cycle` | advancement term | Precise; risk of verbosity |
| `Act` | effect term | Compact; risk of collapsing intent, attempt, and consequence |
| `Effect Intent` | effect term | Precise durable boundary; may not cover execution attempt |
| `Effect Attempt` | effect term | Precise execution boundary; must not replace intent |
| `Confirmation` | post-effect term | Captures reconciliation; may be a phase rather than top-level term |
| `Trace` | evidence term | Compact; risk of being read as logs only |
| `Evidence Trace` | evidence term | Precise; risk of verbosity |

For each candidate, assess against Narada's invariants:

- inspectable and versionable
- usable by agents without human-centric projection
- separates desired outcome from runtime Site
- does not collapse into `operation`, `scope`, `intent`, `execution_attempt`, or confirmation
- supports operation refinement through charter/knowledge/tool/posture changes
- does not force code/API/DB renames

### 4. Decide the canonical vocabulary

Produce one of these outcomes:

1. Keep `Aim / Site / Cycle / Act / Trace`, but define `Aim` more precisely as an inspectable specification-bearing object.
2. Replace the first term, e.g. `Spec / Site / Cycle / Act / Trace`.
3. Replace/refine multiple terms, e.g. `Operation Specification / Runtime Locus / Control Cycle / Effect Intent / Evidence Trace`.
4. Use a two-level mapping, e.g. compact mnemonic terms remain prose shorthand while precise object names become canonical.

The decision must include:

- selected vocabulary
- rejected alternatives and why
- migration guidance for existing docs
- what wording agents should prefer going forward
- what wording is forbidden or deprecated
- whether `Effect Intent`, `Effect Attempt`, and `Confirmation` belong inside the top-level tuple or remain named phases under the effect side of the Cycle

### 5. Update canonical docs

Update the minimum necessary canonical docs:

- `SEMANTICS.md`
- `AGENTS.md`

If the selected vocabulary affects deployment docs, update only references that would otherwise mislead future agents. Do not rewrite deployment docs wholesale.

The update must cover:

- top-level definition section
- current-term mapping table
- forbidden-smear examples
- semantic crystallization guidance
- operation refinement path: how an operation becomes better by changing its specification, charters, knowledge sources, tools, selectors, posture, or Site constraints.
- phase vocabulary for a Cycle, including source read, fact admission, context formation, evaluation, governance, intent/handoff, execution attempt, confirmation/reconciliation, and evidence trace.

### 6. Produce a decision record

Create:

`.ai/decisions/20260422-424-canonical-vocabulary-hardening.md`

It must include:

- source documents read
- candidate comparison table
- final vocabulary decision
- phase-by-phase vocabulary decision for the whole Cycle
- changes made
- residual risks
- follow-up tasks, if any

### 7. Update Task 333 status

Update `.ai/tasks/20260421-333-canonical-vocabulary-hardening.md` so it no longer implies the topic is fully closed forever.

It should state that Task 333 was deferred after Cloudflare, and Task 424 reopens the concern due to later Windows Site / PrincipalRuntime / operation-refinement pressure.

Do not change Task 333 to `opened`; it remains a historical deferred task. Add a forward reference to Task 424.

## Non-Goals

- Do not rename CLI flags.
- Do not rename database columns.
- Do not rename package APIs.
- Do not implement operation refinement code.
- Do not create a generic Site abstraction.
- Do not change live Windows Site behavior.
- Do not create derivative `*-EXECUTED`, `*-DONE`, `*-RESULT`, `*-FINAL`, or `*-SUPERSEDED` files.

## Acceptance Criteria

- [x] Decision record exists at `.ai/decisions/20260422-424-canonical-vocabulary-hardening.md`.
- [x] Decision explicitly evaluates every current tuple term: `Aim`, `Site`, `Cycle`, `Act`, and `Trace`.
- [x] Decision explicitly evaluates candidate terms including `Objective`, `Spec`, `Directive`, `Operation Specification`, `Runtime Locus`, `Control Cycle`, `Effect Intent`, `Effect Attempt`, `Confirmation`, and `Evidence Trace`.
- [x] `SEMANTICS.md` reflects the selected vocabulary and includes operation refinement semantics.
- [x] `SEMANTICS.md` includes phase vocabulary for the full Cycle, not only the first term.
- [x] `AGENTS.md` semantic guidance reflects the selected vocabulary.
- [x] Task 333 references Task 424 as the reopening/hardening pass.
- [x] No code, DB, CLI, or package API names are changed.
- [x] No derivative task-status files are created.

## Execution Notes

- **Decision record** created at `.ai/decisions/20260422-424-canonical-vocabulary-hardening.md` with full candidate comparison table, final vocabulary decision (Option 4 — two-level mapping), phase vocabulary, and operation refinement path.
- **SEMANTICS.md §2.14** updated:
  - `Aim` redefined as "inspectable, versionable specification of desired outcome" (not "pursued telos").
  - `Site` expanded with `Runtime Locus` as canonical precision form.
  - `Cycle` refined as "bounded Control Cycle" with nine-phase vocabulary.
  - `Act` redefined as a family with three phases: `Effect Intent` → `Effect Attempt` → `Confirmation`.
  - `Trace` expanded with `Evidence Trace` as canonical precision form.
  - Added §2.14.6 Canonical Expansion Table.
  - Added §2.14.7 Control Cycle Phase Vocabulary (nine phases with canonical objects, durable boundaries, and authority classes).
  - Added §2.14.8 Operation Refinement Path (seven dimensions: specification, charters, knowledge, tools, selectors, posture, Site constraints).
  - Updated Forbidden Smears table with new entries for deprecated `Aim` reading, collapsed Act phases, and log-only Trace misuse.
- **AGENTS.md** updated: Semantic Crystallization Guidance now references canonical expansions, Control Cycle phase vocabulary, and Operation Specification as the canonical reading of Aim.
- **Task 333** updated with forward reference to Task 424 as the reopening/hardening pass.
- No code, DB columns, CLI flags, or package APIs were renamed.
- No derivative task-status files were created.

## Suggested Verification

Use focused documentation verification:

```bash
rg -n "Aim / Site|Spec / Site|Objective / Site|Directive / Site|Operation Specification|operation refinement|Runtime Locus" SEMANTICS.md AGENTS.md docs .ai/tasks .ai/decisions
find .ai/tasks -maxdepth 1 -type f \( -name '*-EXECUTED.md' -o -name '*-DONE.md' -o -name '*-RESULT.md' -o -name '*-FINAL.md' -o -name '*-SUPERSEDED.md' \) -print
```

If only Markdown files are changed, do not run broad test suites.

## Verification

Verified by inspecting `.ai/decisions/20260422-424-canonical-vocabulary-hardening.md`, `SEMANTICS.md` §2.14, and `AGENTS.md` semantic crystallization guidance. Decision record contains full candidate comparison table, final vocabulary decision (Option 4 — two-level mapping), phase vocabulary, and operation refinement path. No code, DB, CLI, or package API names were changed.
