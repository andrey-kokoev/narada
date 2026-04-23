# Architectural Pruning Contract (PE-Lite)

> **Scope**: This contract governs architecture-heavy review and pruning tasks in Narada. It does not apply to ordinary implementation tasks, bug fixes, or small additive changes.
>
> **Authority**: PE-lite is advisory and subordinate. It cannot override Narada's authority boundaries, kernel invariants, or runtime semantics. It is a review discipline, not a runtime law.

---

## 1. Purpose

PE-lite is a compact method for distinguishing **necessary complexity** from **concealed non-necessity** during architectural review and pruning. It requires every remaining complication to justify its presence under an explicit preservation context.

PE-lite does **not** optimize for line-count reduction, surface neatness, or deletion for its own sake. It optimizes for **load-bearing sufficiency**.

---

## 2. PE-to-Narada Terminology Map

| PE Concept | Narada Binding |
|------------|----------------|
| **Preservation context** | The invariant spine (`AGENTS.md` §Critical Invariants, `SEMANTICS.md`, `00-kernel.md`) plus task-specific acceptance criteria. |
| **Complexity locus** | A boundary, state machine, persistence table, adapter, policy module, operator path, or task-governance surface. |
| **Coupled locus** | A cross-cutting concern whose burden is jointly carried (e.g., foreman + scheduler + outbound handoff lifecycle). |
| **Burden ledger** | Task evidence, review findings, decision records, and the task file's own acceptance criteria. |
| **Simplification witness** | A corrective task with an admissible plan, or an accepted architecture decision recorded in `.ai/decisions/`. |
| **Displacement audit** | Verification that burden did not move into prompts, operator memory, undocumented policy, hidden conventions, or future debugging effort. |

---

## 3. Core Procedure

A pruning pass proceeds through these steps:

1. **State the preservation context** — explicit invariants, acceptance criteria, and authority boundaries that must survive.
2. **Inventory loci** — local and coupled complexity sites in the target scope.
3. **Classify defects** — assign each locus a primary defect type (§4) and any secondary types.
4. **Build burden ledgers** — for each major element or coupled set, record what invariant it protects and the uncertainty status.
5. **Produce witnesses** — document suspicion, candidate witness, or admissible witness (§5).
6. **Run burden accounting** — compare before/after across relevant burden dimensions (§6).
7. **Run displacement audit** — verify burden was eliminated, not relocated (§7).
8. **Accept or reject** — accept only invariant-preserving, non-displacing witnesses.
9. **Test for closure** — verify that remaining structure is load-bearing and that re-derivation from the preservation context does not predictably reintroduce removed structure.

---

## 4. Defect Types

Each locus carries **one primary defect type** and zero or more secondary contributing types.

| Type | Diagnostic Question |
|------|---------------------|
| **Redundant structure** | Are multiple constructions carrying the same burden? |
| **Compensatory structure** | Does this exist mainly to repair complexity induced elsewhere? |
| **Historical residue** | Is this here because the artifact needs it now, or because history has not been unwound? |
| **Topological excess** | Do layers, states, boundaries, handoffs, or interfaces outnumber the real differences they preserve? |
| **Encoding excess** | Should many local cases be one rule with parameters? |
| **Constraint overpayment** | Is the artifact paying more complexity than the live constraint actually requires? |

---

## 5. Simplification Witness Levels

No element is called excessive by assertion alone.

### Suspicion
A plausible hypothesis of excess without a complete witness. Must state:
- Suspected locus
- Suspected burden type
- Why non-necessity is plausible
- What evidence is missing

### Candidate Witness
A partially specified simplification showing likely burden reduction but leaving some invariants unresolved. Must state:
- Original local or coupled structure
- Candidate simpler variant
- Likely burdens reduced
- Unresolved invariants or uncertainty points
- Required further checks

### Admissible Witness
A sufficiently supported simplification that preserves stated invariants and passes burden accounting and displacement audit. Must state:
- Original local or coupled structure
- Candidate simpler variant
- Invariants preserved
- Invariants threatened
- Burden dimensions improved
- Burden dimensions worsened, if any
- Argument that burden was eliminated rather than displaced

---

## 6. Burden Ledger

For each major element or coupled set, record:

| Field | Content |
|-------|---------|
| Preserved invariant(s) | Which Narada invariant or acceptance criterion this element protects |
| Distinct burden contribution | What unique or joint load it carries |
| Contribution type | `individual` / `joint` / `conditional` / `probabilistic` |
| Failure on removal | What fails if this element is removed |
| Failure already handled elsewhere? | Whether redundancy or alternative protection exists |
| Burden class | `current` / `duplicated` / `compensatory` / `obsolete` |
| Uncertainty status | `verified` / `plausible` / `inferred` / `undocumented` / `unknown` |

Elements with no identified live burden are **removal candidates**, unless domain risk or evidence deficit requires escalation.

---

## 7. Displacement Audit

A simplification does not count if it merely moves burden. For every accepted move, check these transfer surfaces:

| Surface | Question |
|---------|----------|
| Interpretation | Has burden moved from explicit structure into decoding cost? |
| Operation | Has burden moved onto the operator or maintainer? |
| Runtime failure handling | Has burden moved from design-time into runtime failures? |
| Maintenance | Has burden moved into future patch or shim complexity? |
| Migration | Has burden moved into a future migration that is now unacknowledged? |
| Monitoring | Has burden moved into harder-to-observe behavior? |
| Onboarding / training | Has burden moved into tacit knowledge requirements? |
| Governance / policy | Has burden moved into undocumented or hidden policy? |
| Coordination | Has burden moved into cross-agent or cross-process friction? |
| Debugging / diagnosis | Has burden moved into harder-to-diagnose failure modes? |

For each surface, classify the result as: `eliminated` / `reduced` / `unchanged` / `shifted` / `hidden` / `uncertain`.

If burden is materially **shifted**, **hidden**, or rendered **uncertain** in a way that violates the preservation context, the move is **rejected** as displacement.

---

## 8. Closure Criteria

A pruning pass reaches closure when all of the following hold:

- [ ] Preservation context is explicit, sourced, and challengeable.
- [ ] Live complexity loci are explicit.
- [ ] Coupled loci and distributed burdens have been identified where relevant.
- [ ] Each remaining complication names the invariant or invariant set it protects.
- [ ] Each remaining complication records whether its burden is individual, joint, conditional, or probabilistic.
- [ ] Duplicated burdens have been collapsed or explicitly justified.
- [ ] Historical residue has been removed or explicitly retained for a current reason.
- [ ] Remaining boundaries, cases, layers, and exceptions are load-bearing.
- [ ] Known burden transfers have been audited.
- [ ] Further simplification would either violate preserved invariants or merely hide, shift, or externalize burden.
- [ ] Independent re-analysis under the same preservation context does not surface a materially better admissible simplification.
- [ ] Re-derivation from the recorded preservation context does not predictably reintroduce removed structure.

---

## 9. Pruning Report Template

Use this template when recording a pruning pass (in the task file, a review file, or a decision record):

```
## Pruning Pass Report

### Preservation Context
- Invariants referenced: <AGENTS.md sections, SEMANTICS.md sections, kernel invariants>
- Task acceptance criteria: <task-specific criteria that must survive>
- Authority boundaries at risk: <ForemanFacade, Scheduler, Handoff, observation/control, etc.>

### Inspected Locus / Coupled Loci
- Primary locus: <file, module, boundary, or table>
- Coupled loci (if any): <related structures analyzed jointly>

### Current Burden Claim
- Claimed invariant protection: <what this structure is said to protect>
- Distinct contribution: <individual / joint / conditional / probabilistic>
- Uncertainty status: <verified / plausible / inferred / undocumented / unknown>

### Candidate Simplification
- Type: <suspicion / candidate witness / admissible witness>
- Description: <what would change>
- Threatened invariants: <which invariants, if any, are at risk>

### Burden Accounting
| Dimension | Before | After | Direction | Evidence |
|-----------|--------|-------|-----------|----------|
| <e.g., boundary count> | ... | ... | improved / worsened / unchanged | ... |
| <e.g., case count> | ... | ... | improved / worsened / unchanged | ... |
| <e.g., dependency surface> | ... | ... | improved / worsened / unchanged | ... |

### Displacement Audit
| Surface | Result | Notes |
|---------|--------|-------|
| Interpretation | eliminated / reduced / unchanged / shifted / hidden / uncertain | ... |
| Operation | ... | ... |
| Runtime failure handling | ... | ... |
| Maintenance | ... | ... |
| Migration | ... | ... |
| Monitoring | ... | ... |
| Onboarding / training | ... | ... |
| Governance / policy | ... | ... |
| Coordination | ... | ... |
| Debugging / diagnosis | ... | ... |

### Outcome
- [ ] Accepted — burden reduced without displacement; invariants preserved.
- [ ] Rejected — witness fails burden accounting or displacement audit.
- [ ] Deferred — evidence insufficient; record suspicion and required further checks.

### Residuals
- <Any deferred work, required follow-up tasks, or accepted tradeoffs>
```

---

## 10. Boundary Rules

### What PE-lite Cannot Do

- **Cannot override authority boundaries.** Simplification must not bypass `ForemanFacade`, `Scheduler`, `IntentHandoff`, `OutboundHandoff`, outbound workers, or observation/control separation.
- **Cannot weaken resilience, reversibility, observability, optionality, or social legibility** unless the preservation context explicitly permits it and the burden accounting justifies the tradeoff.
- **Cannot promote itself into kernel law.** PE-lite is a review discipline in `docs/governance/`, not a runtime invariant in `00-kernel.md` or `SEMANTICS.md`.
- **Cannot require itself for ordinary tasks.** Small bug fixes, additive features, and localized changes do not need a full pruning pass.

### When PE-lite Is Required

- Architecture-heavy tasks that refactor boundaries, layers, or state machines.
- Closure reviews where the change set touches multiple authority boundaries or cross-cutting concerns.
- Tasks whose primary goal is simplification, consolidation, or removal of legacy structure.
- Reviews that surface unexplained complexity in coupled loci (e.g., foreman + scheduler + outbound lifecycle).

### When PE-lite Is Not Required

- Ordinary implementation tasks with a single-file or single-function write set.
- Bug fixes with an obvious root cause and localized correction.
- Additive changes that introduce new behavior without restructuring existing boundaries.
- Test-only or documentation-only changes.

### Burden Displacement Is a Rejection

The following are **not** admissible simplifications:

- Moving burden into hidden convention or operator memory.
- Moving burden into prompt text or agent-context assumptions.
- Moving burden into undocumented policy or undocumented rationale.
- Moving burden into future debugging, migration, or maintenance effort.
- Compressing expression while increasing interpretive or decoding cost.
- Flattening jointly load-bearing or conditionally load-bearing structures into individually weak-looking parts.

---

## 11. Agent Execution Notes

- Do not ask the agent to "simplify" in the abstract. Give it a scoped preservation context and a specific locus or coupled set.
- Require the agent to produce either an admissible witness or a documented suspicion with a concrete evidence gap.
- Verify that the agent's proposed change does not displace burden into prompts, hidden policy, or undocumented convention.
- Treat resilience, reversibility, observability, optionality, and social legibility as **load-bearing until proven otherwise**.
