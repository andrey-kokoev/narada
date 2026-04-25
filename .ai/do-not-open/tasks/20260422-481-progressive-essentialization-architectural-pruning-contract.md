---
status: closed
created: 2026-04-22
owner: unassigned
depends_on: []
closed_at: 2026-04-23T14:28:55.599Z
closed_by: operator
---

# Task 481 - Progressive Essentialization Architectural Pruning Contract

## Context

The operator has a separate doctrine note at `/home/andrey/src/thoughts/content/pe.md` titled "Progressive Essentialization (PE)".

PE is a method for eliminating concealed non-necessity from artifacts by requiring an explicit preservation context, local or coupled complexity loci, burden ledgers, simplification witnesses, burden accounting, and displacement audits.

Narada already has partial machinery for this concern:

- invariant spine in `AGENTS.md`, `SEMANTICS.md`, and control-plane docs;
- task evidence and closure semantics;
- chapter closure reviews and decision records;
- review separation;
- construction-loop governance;
- live operation evidence from `narada.sonar`;
- a recurring need for periodic architectural pruning without requiring the operator to review every line manually.

The current gap is that Narada does not have a named, repeatable architectural pruning operator or contract. Complexity review exists implicitly through closure reviews and invariants, but there is no compact procedure that agents can execute without smearing "complexity" into aesthetic preference.

## Goal

Incorporate a PE-lite architectural pruning contract into Narada's construction governance so architecture-heavy review and pruning tasks can distinguish necessary complexity from concealed non-necessity using explicit preservation context and evidence.

## Non-Goals

- Do not import the full PE document verbatim into Narada.
- Do not make PE a kernel invariant in `00-kernel.md`.
- Do not add runtime code, database schema, CLI mutation surfaces, or product-facing terminology unless a later task explicitly requires it.
- Do not require PE for every ordinary implementation task.
- Do not treat simplification as deletion, flattening, or line-count reduction.
- Do not weaken existing Narada authority boundaries in the name of simplification.

## Required Work

1. Create a governance document.
   - Add `docs/governance/architectural-pruning.md`.
   - Define the Narada-specific PE-lite contract.
   - Keep it compact enough to be usable during review.
   - It must include:
     - preservation context;
     - local and coupled complexity loci;
     - defect types;
     - burden ledger;
     - simplification suspicion / candidate witness / admissible witness;
     - displacement audit;
     - closure criteria.

2. Map PE terms to Narada terms.
   - Explain how PE concepts bind to Narada's existing structures:
     - preservation context -> invariant spine and task-specific acceptance criteria;
     - complexity locus -> boundaries, state machines, operators, persistence tables, adapters, policies, and task governance surfaces;
     - burden ledger -> task evidence, review findings, and decision records;
     - simplification witness -> corrective task or accepted architecture decision;
     - displacement audit -> check that burden did not move into prompts, operators, undocumented policy, future debugging, or agent memory.

3. Add integration points.
   - Update `AGENTS.md` with a short pointer to the architectural pruning contract.
   - Update `.ai/task-contracts/agent-task-execution.md` or add a narrowly scoped companion contract if that is cleaner.
   - Ensure the integration says PE-lite is required for architecture-pruning tasks and architecture-heavy closure reviews, not for every small code change.

4. Define the required output shape.
   - Provide a small checklist or report template for a pruning pass.
   - The template must require:
     - preservation context;
     - inspected locus or coupled loci;
     - current burden claim and uncertainty status;
     - candidate simplification;
     - threatened invariants;
     - burden dimensions improved or worsened;
     - displacement audit result;
     - accepted / rejected / deferred outcome.

5. Preserve existing governance boundaries.
   - The contract must explicitly say that PE-lite cannot override Narada's authority boundaries.
   - It must reject simplifications that merely move burden into hidden convention, operator memory, prompt text, undocumented policy, or future runtime failures.
   - It must treat resilience, reversibility, observability, optionality, and social legibility as possible load-bearing burdens, not automatic excess.

6. Add verification.
   - Run documentation/task lint if available.
   - Run `pnpm verify` if touched files can affect package verification or if task tooling changes.
   - If no executable verification is relevant, record a manual verification pass over links and references.

## Acceptance Criteria

- [x] `docs/governance/architectural-pruning.md` exists and defines a Narada-specific PE-lite pruning contract.
- [x] The document maps PE concepts onto Narada's existing task, decision, review, and invariant structures.
- [x] The document includes a compact pruning report template.
- [x] `AGENTS.md` points agents to the pruning contract for architecture-pruning and architecture-heavy closure tasks.
- [x] The agent task contract or a companion contract explains when PE-lite is required and when it is not.
- [x] The contract explicitly forbids burden displacement into hidden policy, operator memory, prompts, undocumented conventions, or future debugging effort.
- [x] The contract preserves existing authority boundaries and does not promote PE into runtime/kernel law.
- [x] Verification evidence is recorded in this task.

## Execution Notes

1. Created `docs/governance/architectural-pruning.md` (~350 lines) defining the Narada-specific PE-lite contract:
   - §1 Purpose: load-bearing sufficiency, not line-count reduction.
   - §2 PE-to-Narada terminology map binding preservation context to invariant spine, complexity loci to boundaries/state machines, burden ledger to task evidence, and displacement audit to prompt/operator/policy transfer checks.
   - §3 Core Procedure: 9-step pruning pass from preservation context through closure.
   - §4 Defect Types: 6 typed defect classes (redundant, compensatory, historical residue, topological excess, encoding excess, constraint overpayment).
   - §5 Simplification Witness Levels: suspicion, candidate witness, admissible witness with required fields.
   - §6 Burden Ledger: table format with invariant, contribution, type, failure, redundancy, class, uncertainty.
   - §7 Displacement Audit: 10 transfer surfaces with classification (`eliminated`/`reduced`/`unchanged`/`shifted`/`hidden`/`uncertain`).
   - §8 Closure Criteria: 12 checklist items.
   - §9 Pruning Report Template: markdown template with preservation context, loci, burden claim, candidate, accounting table, displacement audit table, outcome checkboxes, residuals.
   - §10 Boundary Rules: explicit "cannot override authority boundaries," required vs not-required conditions, and forbidden displacement targets.
   - §11 Agent Execution Notes: scoped instructions for agent use.

2. Updated `AGENTS.md` (line ~695): Added "Architectural Pruning Contract" subsection under "Task File Policy" pointing to `docs/governance/architectural-pruning.md`, with required/not-required guidance and subordination note.

3. Updated `.ai/task-contracts/agent-task-execution.md` (new section before "Governed Task Closure Invariant"): Added "Architectural Pruning Contract (PE-lite)" section explaining when required, when not required, what it requires, what it forbids, and what it does not do.

## Verification

- `pnpm verify` passed (all 5 steps: task-file-guard, typecheck, build, charters tests, ops-kit tests).
- Manual reference verification:
  - All internal links in `docs/governance/architectural-pruning.md` reference existing Narada documents (`AGENTS.md`, `SEMANTICS.md`, `00-kernel.md`).
  - `AGENTS.md` correctly links to `docs/governance/architectural-pruning.md`.
  - `.ai/task-contracts/agent-task-execution.md` correctly links to `docs/governance/architectural-pruning.md`.
  - No forbidden derivative task-status files created.
  - No runtime code, schema, CLI surface, or product terminology added.

## Verification Commands

```bash
cd /home/andrey/src/narada
pnpm verify
```

If only documentation and task-contract files are changed, `pnpm verify` is still acceptable but not mandatory if the executor records a reasoned manual verification of links, references, and task-contract consistency.


